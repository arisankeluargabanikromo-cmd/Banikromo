// Tes frontend FamilyHub: (1) sintaks semua skrip, (2) alur gerbang persetujuan & panel admin di jsdom dengan Supabase tiruan.
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, summary } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), PUB = path.join(ROOT, 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const ORDER = [...html.matchAll(/<script src="\/([^"]+)"/g)].map(m => m[1]).filter(f => f !== 'config.js' && !f.startsWith('vendor/'));
const wait = ms => new Promise(r => setTimeout(r, ms));

console.log('═══ 1. Sintaks & kebersihan berkas ═══');
for (const f of fs.readdirSync(PUB).filter(f => f.endsWith('.js'))) {
  try { new vm.Script(fs.readFileSync(path.join(PUB, f), 'utf8'), { filename: f }); } catch (e) { check('sintaks ' + f, false, e.message); }
}
check('semua skrip aplikasi valid secara sintaks', true);
check('index.html tidak memuat skrip dari CDN pihak ketiga', !/<script[^>]+src="https?:/.test(html));
check('pustaka vendor dimuat dari domain sendiri', html.includes('/vendor/supabase-js-2.45.4.js') && fs.existsSync(path.join(PUB, 'vendor/supabase-js-2.45.4.js')));
check('tidak ada pemuatan skrip CDN di kode (loadXlsx)', !/cdn\.jsdelivr/.test(fs.readFileSync(path.join(PUB, 'settings.js'), 'utf8')));
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')), hdr = Object.fromEntries(vj.headers[0].headers.map(h => [h.key, h.value]));
check('CSP terpasang & mengunci skrip ke domain sendiri', /script-src 'self' 'unsafe-inline'/.test(hdr['Content-Security-Policy']) && !/jsdelivr/.test(hdr['Content-Security-Policy']));
check('CSP melarang framing & object', /frame-ancestors 'none'/.test(hdr['Content-Security-Policy']) && /object-src 'none'/.test(hdr['Content-Security-Policy']));
check('header keamanan lain terpasang', ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy'].every(k => hdr[k]));

// ---- fabrik lingkungan ----
function makeSb(o) {
  const calls = [];
  const qb = t => {
    const st = { t, cols: '', f: {} };
    const r = () => Promise.resolve(o.from ? o.from(st) : { data: [], error: null });
    const q = { select(c) { st.cols = c; return q; }, eq(k, v) { st.f[k] = v; return q; }, order() { return q; }, range() { return q; }, limit() { return q; }, in() { return q; },
      maybeSingle: () => r(), then: (a, b) => r().then(a, b) };
    return q;
  };
  return { calls, from: t => { calls.push('from:' + t); return qb(t); }, rpc: async (fn, a) => { calls.push('rpc:' + fn); (calls.args ||= {})[fn] = a; return o.rpc ? o.rpc(fn, a) : { data: null, error: null }; },
    auth: { getSession: async () => ({ data: { session: o.session === undefined ? { user: { id: 'u1', email: 'u@x.id' } } : o.session } }), signOut: async () => ({}),
      signInWithPassword: async () => ({ data: { user: { id: 'u1', email: 'u@x.id' } }, error: null }),
      signUp: async a => { calls.push('signUp'); calls.signUpArg = a; return { data: { session: null }, error: null }; } },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), remove: async () => ({}) }) } };
}
async function boot(o) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const w = dom.window, sb = makeSb(o); w.supabase = { createClient: () => sb }; w.FH_CONFIG = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' };
  const alerts = []; w.confirm = () => true; w.alert = m => alerts.push(m); w.scrollTo = () => { }; w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() { }, addListener() { } }));
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  const ctx = dom.getInternalVMContext();
  for (const f of ORDER) { try { new vm.Script(fs.readFileSync(path.join(PUB, f), 'utf8'), { filename: f }).runInContext(ctx); } catch (e) { errs.push(f + ': ' + e.message); } }
  await wait(120);
  return { dom, w, sb, ctx, errs, alerts, ev: s => vm.runInContext(s, ctx), $: s => w.document.querySelector(s) };
}
const PROFILE = (role, approved) => st => st.t === 'profiles' ? { data: { name: 'Budi', role, approved }, error: null } : { data: [], error: null };

console.log('\n═══ 2. Akun MENUNGGU persetujuan ═══');
{
  const t = await boot({ from: PROFILE('viewer', false) });
  check('semua skrip dimuat tanpa galat', t.errs.length === 0, t.errs.join(' | '));
  check('layar "Menunggu persetujuan" tampil', t.$('#pendingBox') && t.$('#pendingBox').classList.contains('show') && /Menunggu persetujuan/.test(t.$('#pendingBox').textContent));
  check('menampilkan email akun', /u@x\.id/.test(t.$('#pendingBox').textContent));
  const dataCalls = t.sb.calls.filter(c => c !== 'from:profiles');
  check('TIDAK ada pemanggilan data selama menunggu (hanya profil sendiri)', dataCalls.length === 0, dataCalls.join(','));
  check('ME.approved = false', t.ev('ME.approved') === false);
  check('dashboard tidak dirender', !t.$('#dashboard').innerHTML.trim());
  t.w.close();
}

console.log('\n═══ 3. Akun yang sudah disetujui masuk normal ═══');
{
  const t = await boot({ from: PROFILE('viewer', true), rpc: fn => ({ data: fn === 'dashboard' ? { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] } : null, error: null }) });
  check('tanpa layar menunggu', !t.$('#pendingBox') || !t.$('#pendingBox').classList.contains('show'));
  check('dashboard dirender', /Selamat datang/.test(t.$('#dashboard').innerHTML), t.errs.join('|'));
  t.w.close();
}

console.log('\n═══ 4. Kompatibilitas: SQL belum di-patch (kolom approved belum ada) ═══');
{
  const t = await boot({ from: st => st.cols.includes('approved') ? { data: null, error: { code: '42703', message: 'column profiles.approved does not exist' } } : st.t === 'profiles' ? { data: { name: 'Lama', role: 'admin' }, error: null } : { data: [], error: null },
    rpc: fn => ({ data: fn === 'dashboard' ? { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] } : [], error: null }) });
  check('pengguna lama TIDAK terkunci keluar (dianggap disetujui)', t.ev('ME.approved') === true && t.ev('ME.role') === 'admin', t.errs.join('|'));
  t.w.close();
}

console.log('\n═══ 5. Admin: persetujuan pendaftar & XSS ═══');
{
  const EVIL = `x');alert(1);('<img src=x onerror=alert(2)>`;
  const users = [{ id: '11111111-1111-1111-1111-111111111111', name: 'Budi', email: 'u@x.id', role: 'admin', approved: true, created_at: '2026-10-01T00:00:00Z' },
    { id: '22222222-2222-2222-2222-222222222222', name: EVIL, email: 'evil@x.id', role: 'viewer', approved: false, created_at: '2026-10-13T10:00:00Z' }];
  const t = await boot({ from: PROFILE('admin', true), rpc: (fn, a) => ({ data: fn === 'list_users' ? users : fn === 'audit_recent' ? [{ id: 1, at: '2026-10-13T10:00:00Z', actor_name: 'Budi', tbl: 'transactions', op: 'UPDATE', row_id: '5', old_row: { amount: 120000, description: 'Konsumsi' }, new_row: { amount: 130000, description: 'Konsumsi' } }] : fn === 'dashboard' ? { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] } : null, error: null }) });
  await wait(60);
  check('titik notifikasi menyala (1 pendaftar menunggu)', t.$('#notifDot').hidden === false && /1 pendaftar/.test(t.$('#notifBtn').title), t.$('#notifBtn').title);
  t.ev("PG_TAB='kelola'"); t.ev("showPage('pengguna')"); await wait(80);
  const box = t.$('#pengguna');
  check('panel "Menunggu persetujuan" tampil', /Menunggu persetujuan/.test(box.textContent) && /evil@x\.id/.test(box.textContent), t.errs.join('|'));
  check('XSS: tidak ada elemen <img> / skrip hasil injeksi nama', !box.querySelector('img[src="x"]') && !box.querySelector('[onerror]'));
  const handlers = [...box.querySelectorAll('[onclick],[onchange]')].map(e => e.getAttribute('onclick') || e.getAttribute('onchange'));
  check('XSS: nama pendaftar TIDAK ada di atribut handler mana pun', !handlers.some(h => /alert|x'\)/.test(h)), handlers.join(' | '));
  check('nama ditampilkan sebagai teks (ter-escape)', box.textContent.includes('alert(1)'));
  check('XSS: tidak ada kode injeksi yang berjalan (alert tidak terpanggil)', t.alerts.length === 0, JSON.stringify(t.alerts));
  const approveBtn = [...box.querySelectorAll('button')].find(b => b.textContent === 'Setujui');
  box.querySelector('#apr_22222222-2222-2222-2222-222222222222').value = 'pengelola'; approveBtn.click(); await wait(80);
  check('klik Setujui → approve_user(id, peran terpilih)', t.sb.calls.args.approve_user && t.sb.calls.args.approve_user.p_id === '22222222-2222-2222-2222-222222222222' && t.sb.calls.args.approve_user.p_role === 'pengelola', JSON.stringify(t.sb.calls.args.approve_user));
  const rejectBtn = [...t.$('#pengguna').querySelectorAll('button')].find(b => b.textContent === 'Tolak');
  if (rejectBtn) { rejectBtn.click(); await wait(80); }
  check('klik Tolak → reject_user(id)', t.sb.calls.args.reject_user && t.sb.calls.args.reject_user.p_id === '22222222-2222-2222-2222-222222222222', JSON.stringify(t.sb.calls.args.reject_user));
  const ab = [...t.$('#pengguna').querySelectorAll('button')].find(b => /Tampilkan 50/.test(b.textContent)); ab && ab.click(); await wait(80);
  check('jejak audit tampil dgn nilai lama → baru', /120000/.test(t.$('#auditBody').textContent) && /130000/.test(t.$('#auditBody').textContent), t.$('#auditBody').textContent.slice(0, 200));
  check('XSS: tetap tidak ada kode injeksi berjalan setelah semua klik', t.alerts.length === 0, JSON.stringify(t.alerts));
  t.w.close();
}

console.log('\n═══ 6. Form pendaftaran ═══');
{
  const t = await boot({ session: null });
  check('layar login tampil bila belum login', t.$('#loginBox').classList.contains('show'));
  check('awal: kolom nama tersembunyi', t.$('#nameRow').style.display === 'none');
  t.$('#signupBtn').click();
  check('klik "Daftar akun baru" → kolom nama muncul & tombol Masuk tersembunyi', t.$('#nameRow').style.display === '' && t.$('#loginBtn').style.display === 'none');
  const f = t.$('#loginForm'); f.elements.username.value = 'baru@x.id'; f.elements.password.value = 'pendek';
  t.$('#signupBtn').click(); await wait(30);
  check('validasi: nama kosong ditolak (tidak memanggil signUp)', !t.sb.calls.includes('signUp'));
  f.elements.name.value = 'Siti Aminah'; t.$('#signupBtn').click(); await wait(30);
  check('validasi: password < 8 karakter ditolak', !t.sb.calls.includes('signUp'));
  f.elements.password.value = 'passwordkuat1'; t.$('#signupBtn').click(); await wait(60);
  check('pendaftaran valid → signUp dengan nama dari form (bukan prompt)', t.sb.calls.includes('signUp') && t.sb.calls.signUpArg.options.data.name === 'Siti Aminah', JSON.stringify(t.sb.calls.signUpArg));
  check('pesan menyebut persetujuan admin', /menyetujui/.test(t.$('#loginMsg').textContent + t.$('#toast').textContent));
  t.$('#backLogin').click();
  check('tombol Kembali memulihkan mode masuk', t.$('#nameRow').style.display === 'none' && t.$('#loginBtn').style.display === '');
  t.w.close();
}
process.exit(summary() ? 0 : 1);
