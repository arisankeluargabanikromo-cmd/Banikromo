// Membangun supabase/schema.sql dan supabase/migrations/*.sql dari SATU sumber:
//   supabase/base/schema-v3.9.1.sql  (dasar beku)  +  supabase/patch-011-*.sql, patch-012-*.sql, ...  (urut nomor)
// Jangan edit schema.sql / migrations/ dengan tangan. Tambah fitur database = buat patch-0NN-nama.sql baru, lalu `npm run build:sql`.
// `node scripts/build-schema.mjs --check` gagal (kode 1) bila hasil generate berbeda dari berkas di repo (dipakai tes & CI).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SQL = path.join(ROOT, 'supabase');
const check = process.argv.includes('--check');
const base = fs.readFileSync(path.join(SQL, 'base/schema-v3.9.1.sql'), 'utf8').replace(/\s+$/, '\n');
const patches = fs.readdirSync(SQL).filter(f => /^patch-(\d{3})-.+\.sql$/.test(f) && +f.slice(6, 9) >= 11).sort();

const out = new Map();
const HEADER = '-- DIHASILKAN OTOMATIS oleh scripts/build-schema.mjs — JANGAN diedit dengan tangan.\n-- Sumber: supabase/base/schema-v3.9.1.sql + ' + patches.join(', ') + '\n-- Untuk mengubah database: tambah patch-0NN-*.sql lalu jalankan `npm run build:sql`.\n\n';
out.set('schema.sql', HEADER + base + patches.map(f => `\n-- ====== ${f} ======\n` + fs.readFileSync(path.join(SQL, f), 'utf8').replace(/\s+$/, '\n')).join(''));
out.set('migrations/20260101000000_base_v3_9_1.sql', base);
for (const f of patches) { const n = f.slice(6, 9), name = f.slice(10, -4).replace(/[^a-z0-9]+/gi, '_'); out.set(`migrations/20261014000${n}_${name}.sql`, fs.readFileSync(path.join(SQL, f), 'utf8').replace(/\s+$/, '\n')); }

let stale = [];
if (!check) fs.mkdirSync(path.join(SQL, 'migrations'), { recursive: true });
for (const [rel, text] of out) {
  const p = path.join(SQL, rel), cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (cur !== text) { if (check) stale.push(rel); else fs.writeFileSync(p, text); }
}
const have = fs.existsSync(path.join(SQL, 'migrations')) ? fs.readdirSync(path.join(SQL, 'migrations')).map(f => 'migrations/' + f) : [];
for (const rel of have) if (!out.has(rel)) { if (check) stale.push(rel + ' (berlebih)'); else fs.unlinkSync(path.join(SQL, rel)); }
if (check) { if (stale.length) { console.error('Tidak sinkron dengan sumber:\n  ' + stale.join('\n  ') + '\nJalankan: npm run build:sql'); process.exit(1); } console.log(`OK: schema.sql & ${out.size - 1} migrasi sinkron dengan sumber`); }
else console.log(`Dibangun: schema.sql + ${out.size - 1} migrasi (${patches.length} patch)`);
