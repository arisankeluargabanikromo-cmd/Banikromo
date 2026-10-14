// Menjaga skema tidak melenceng: schema.sql & migrations/ harus identik dengan sumbernya (dasar + patch).
import { freshDb, check, summary } from './harness.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SQL = path.join(ROOT, 'supabase');
const run = (cwd, ...a) => { try { return { code: 0, out: execFileSync('node', ['scripts/build-schema.mjs', ...a], { cwd, stdio: 'pipe' }).toString() }; } catch (e) { return { code: e.status, out: String(e.stderr) }; } };

console.log('═══ Sinkron sumber ↔ hasil generate ═══');
check('schema.sql & migrations/ sinkron dengan sumber (npm run build:sql bila gagal)', run(ROOT, '--check').code === 0, run(ROOT, '--check').out);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-drift-'));
fs.cpSync(path.join(ROOT, 'scripts'), path.join(tmp, 'scripts'), { recursive: true }); fs.cpSync(SQL, path.join(tmp, 'supabase'), { recursive: true });
fs.appendFileSync(path.join(tmp, 'supabase/schema.sql'), '\n-- edit tangan yang tidak boleh ada\n');
const bad = run(tmp, '--check');
check('pemeriksa MENDETEKSI schema.sql yang diedit dengan tangan', bad.code === 1 && /schema\.sql/.test(bad.out), bad.out);
fs.copyFileSync(path.join(SQL, 'schema.sql'), path.join(tmp, 'supabase/schema.sql'));
fs.appendFileSync(path.join(tmp, 'supabase/patch-014-anti-spam.sql'), '\n-- patch diubah tanpa build ulang\n');
const bad2 = run(tmp, '--check');
check('pemeriksa MENDETEKSI patch yang berubah tanpa build ulang', bad2.code === 1 && /schema\.sql|anti_spam/.test(bad2.out), bad2.out);
fs.writeFileSync(path.join(tmp, 'supabase/patch-015-baru.sql'), 'select 1;\n');
check('patch baru yang belum di-build terdeteksi', run(tmp, '--check').code === 1);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n═══ Katalog database identik di tiga jalur instalasi ═══');
const snap = async db => {
  const q = async s => (await db.query(s)).rows.map(r => JSON.stringify(r)).sort();
  return {
    kolom: await q(`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public'`),
    fungsi: await q(`select p.proname,pg_get_function_identity_arguments(p.oid) a,md5(pg_get_functiondef(p.oid)) d,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') auth from pg_proc p where p.pronamespace='public'::regnamespace`),
    policy: await q(`select tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname in('public','storage')`),
    trigger: await q(`select c.relname t,g.tgname,pg_get_triggerdef(g.oid) d from pg_trigger g join pg_class c on c.oid=g.tgrelid where not g.tgisinternal and c.relnamespace='public'::regnamespace`),
    indeks: await q(`select indexdef from pg_indexes where schemaname='public'`),
    batasan: await q(`select conrelid::regclass::text t,conname,pg_get_constraintdef(oid) d from pg_constraint where connamespace='public'::regnamespace`),
  };
};
const migs = fs.readdirSync(path.join(SQL, 'migrations')).sort().map(f => path.join(SQL, 'migrations', f));
const patches = fs.readdirSync(SQL).filter(f => /^patch-\d{3}-/.test(f) && +f.slice(6, 9) >= 11).sort().map(f => path.join(SQL, f));
const A = await snap(await freshDb([path.join(SQL, 'schema.sql')]));
const B = await snap(await freshDb(migs));
const C = await snap(await freshDb([path.join(SQL, 'base/schema-v3.9.1.sql'), ...patches]));
for (const k of Object.keys(A)) {
  check(`${k}: schema.sql = migrations/ (${A[k].length} entri)`, JSON.stringify(A[k]) === JSON.stringify(B[k]), 'berbeda');
  check(`${k}: schema.sql = dasar + patch`, JSON.stringify(A[k]) === JSON.stringify(C[k]), 'berbeda');
}
check('katalog tidak kosong (uji ini bermakna)', A.fungsi.length > 50 && A.policy.length > 20 && A.trigger.length > 5 && A.indeks.length > 10 && A.batasan.length > 50);
process.exit(summary() ? 0 : 1);
