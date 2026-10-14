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

{
  const rw = vj.rewrites && vj.rewrites[0], rx = rw && new RegExp('^/' + rw.source.slice(2, -1) + '$');
  check('Vercel: ada rewrite fallback ke index.html (refresh /arisan tidak 404)', rw && rw.destination === '/index.html');
  check('rewrite memetakan alamat menu', ['/arisan', '/silsilah', '/pengguna/kelola', '/pengguna/iuran', '/'].every(u => rx.test(u)));
  check('rewrite TIDAK menelan berkas aset (css/js/png) → aset hilang tetap 404 asli', ['/app.js', '/style.css', '/icon-192.png', '/vendor/supabase-js-2.45.4.js'].every(u => !rx.test(u)));
  check('Netlify/Cloudflare: public/_redirects berisi fallback 200', /^\/\*\s+\/index\.html\s+200/m.test(fs.readFileSync(path.join(PUB, '_redirects'), 'utf8')));
  const nf = fs.readFileSync(path.join(PUB, '404.html'), 'utf8');
  check('GitHub Pages: 404.html menyimpan alamat & memuat ulang "/"', /fh:redirect/.test(nf) && /location\.replace\('\/'\)/.test(nf));
  check('404.html tidak mengalihkan permintaan berkas (ekstensi) → pesan 404 tampil', /\\\.\[A-Za-z0-9\]\+\$/.test(nf));
  const { ROUTES } = (await import('node:module')).createRequire(import.meta.url)('../scripts/gen-routes.js');
  check('salinan rute per menu (/arisan/index.html, dst.) ada & identik dengan index.html (jalan tanpa rewrite)', ROUTES.every(r => { try { return fs.readFileSync(path.join(PUB, r, 'index.html'), 'utf8') === html; } catch { return false; } }), 'jalankan: node scripts/gen-routes.js');
  check('build Vercel menjalankan gen-routes', /gen-routes/.test(vj.buildCommand));
  check('semua aset di index.html memakai alamat absolut (aman di /pengguna/kelola)', ![...html.matchAll(/(?:src|href)="([^"#]+)"/g)].some(m => !/^(\/|https?:|data:|mailto:)/.test(m[1])));
}

// ---- fabrik lingkungan ----
function makeSb(o) {
  const calls = [];
  const qb = t => {
    const st = { t, cols: '', f: {} };
    const r = () => Promise.resolve(o.from ? o.from(st) : { data: [], error: null });
    const q = { delete() { calls.push('delete:' + t); return q; }, select(c) { st.cols = c; return q; }, eq(k, v) { st.f[k] = v; return q; }, order() { return q; }, range() { return q; }, limit() { return q; }, in() { return q; },
      maybeSingle: () => r(), then: (a, b) => r().then(a, b) };
    return q;
  };
  return { calls, from: t => { calls.push('from:' + t); return qb(t); }, rpc: async (fn, a) => { calls.push('rpc:' + fn); (calls.args ||= {})[fn] = a; return o.rpc ? o.rpc(fn, a) : { data: null, error: null }; },
    auth: { getSession: async () => ({ data: { session: o.session === undefined ? { user: { id: 'u1', email: 'u@x.id' } } : o.session } }), signOut: async () => ({}),
      signInWithPassword: async () => ({ data: { user: { id: 'u1', email: 'u@x.id' } }, error: null }),
      signUp: async a => { calls.push('signUp'); calls.signUpArg = a; return { data: { session: null }, error: null }; } },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), remove: async p => { calls.push('storage.remove'); return {}; } }) } };
}
async function boot(o) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: o.url || 'http://localhost/', pretendToBeVisual: true });
  const w = dom.window, sb = makeSb(o); w.supabase = { createClient: () => sb }; w.FH_CONFIG = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' };
  if (o.pre) o.pre(w);
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
console.log('\n═══ 7. Urutan hapus: baris database dulu, berkas sesudahnya ═══');
{
  const ok = await boot({ from: st => st.t === 'profiles' ? { data: { name: 'B', role: 'admin', approved: true }, error: null } : st.t === 'photos' ? { data: [{ path: '5/a.jpg' }], error: null } : { data: null, error: null },
    rpc: fn => ({ data: fn === 'dashboard' ? { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] } : null, error: null }) });
  ok.sb.calls.length = 0; await ok.ev("api('albums/5','DELETE')"); 
  const i = ok.sb.calls.indexOf('delete:albums'), j = ok.sb.calls.indexOf('storage.remove');
  check('hapus album: baris dihapus SEBELUM berkas Storage', i >= 0 && j > i, ok.sb.calls.join(','));
  ok.w.close();
  const bad = await boot({ from: st => st.t === 'profiles' ? { data: { name: 'B', role: 'admin', approved: true }, error: null } : st.t === 'photos' ? { data: [{ path: '5/a.jpg' }], error: null } : st.t === 'albums' ? { data: null, error: { message: 'ditolak', status: 403 } } : { data: null, error: null },
    rpc: fn => ({ data: fn === 'dashboard' ? { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] } : null, error: null }) });
  bad.sb.calls.length = 0; try { await bad.ev("api('albums/5','DELETE')"); } catch (e) { }
  check('bila penghapusan baris DITOLAK, berkas Storage TIDAK dihapus', bad.sb.calls.includes('delete:albums') && !bad.sb.calls.includes('storage.remove'), bad.sb.calls.join(','));
  bad.w.close();
}
console.log('\n═══ 8. Portal anggota "Iuran Saya" ═══');
{
  const EVIL = `<img src=x onerror=alert(3)>`;
  const DASH = { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] };
  const linked = { linked: true, period: '2026-10', member: { id: 7, name: 'Budi ' + EVIL, relation: 'Anak', active: true },
    types: [{ id: 1, name: 'Iuran Arisan', amount: 350000, fund: 'arisan', required_for_draw: true, paid_now: false, arrears: 2, arrears_total: 700000, arrears_periods: ['2026-08', '2026-09'] },
            { id: 2, name: 'Kas ' + EVIL, amount: 50000, fund: 'kas', required_for_draw: false, paid_now: true, arrears: 0, arrears_total: 0, arrears_periods: [] }],
    can_draw: false, won: [{ period: '2026-03', at: '2026-03-20T00:00:00Z' }],
    recent: [{ period: '2026-07', type: 'Iuran Arisan', amount: 350000, paid_at: '2026-07-05T00:00:00Z', method: 'Tunai', receipt_no: 'KW-2026-0001' + EVIL }] };
  const mk = (role, my, extra = {}) => boot({ from: st => st.t === 'profiles' ? { data: { name: 'Budi', role, approved: true }, error: null } : st.t === 'members' ? { data: extra.members || [], error: null } : { data: [], error: null },
    rpc: (fn, a) => ({ data: fn === 'dashboard' ? DASH : fn === 'my_status' ? my : fn === 'list_users' ? (extra.users || []) : null, error: null }), url: extra.url });

  const t = await mk('viewer', linked);
  t.ev("PG_TAB='iuran'"); t.ev("showPage('pengguna')"); await wait(100);
  const box = t.$('#pengguna'), tabs = [...box.querySelectorAll('.st-tab')].map(b => b.textContent.trim());
  check('viewer melihat tab "Akun Saya" & "Iuran Saya" (tanpa Kelola Pengguna)', tabs.length === 2 && /Iuran Saya/.test(tabs[1]), JSON.stringify(tabs));
  check('alamat URL = /pengguna/iuran', t.w.location.pathname === '/pengguna/iuran', t.w.location.pathname);
  check('banner: ada tunggakan Rp 700.000 (2 bulan)', /700\.000/.test(box.textContent) && /2 bulan/.test(box.textContent), box.textContent.slice(0, 300));
  check('kartu per jenis iuran: Belum dibayar / Lunas bulan ini', /Belum dibayar/.test(box.textContent) && /Lunas bulan ini/.test(box.textContent));
  check('periode tunggakan ditulis (Agustus & September 2026)', /Agustus 2026/.test(box.textContent) && /September 2026/.test(box.textContent));
  check('arisan: belum memenuhi syarat + pernah menang Maret 2026', /Belum memenuhi syarat/.test(box.textContent) && /Maret 2026/.test(box.textContent));
  check('riwayat menampilkan nomor kuitansi', /KW-2026-0001/.test(box.textContent));
  check('XSS: nama anggota / jenis iuran / kuitansi berisi HTML tidak dieksekusi', !box.querySelector('img[src="x"]') && !box.querySelector('[onerror]') && t.alerts.length === 0, JSON.stringify(t.alerts));
  check('payload tampil sebagai teks biasa', box.textContent.includes('<img src=x onerror=alert(3)>'));
  t.ev("goPgTab('akun')"); await wait(60); check('pindah tab kembali ke Akun Saya → URL /pengguna', t.w.location.pathname === '/pengguna', t.w.location.pathname);
  t.w.close();

  const u = await mk('viewer', { linked: false, name: 'Budi' }); u.ev("PG_TAB='iuran'"); u.ev("showPage('pengguna')"); await wait(80);
  check('akun belum dihubungkan → pesan jelas, tanpa angka', /belum dihubungkan/i.test(u.$('#pengguna').textContent) && !/Rp/.test(u.$('#pengguna').textContent));
  u.w.close();

  const d = await mk('viewer', linked, { url: 'http://localhost/pengguna/iuran' }); await wait(100);
  check('buka langsung /pengguna/iuran → tab Iuran Saya aktif', d.ev('PG_TAB') === 'iuran' && /Iuran Arisan/.test(d.$('#pengguna').textContent), d.ev('PG_TAB'));
  d.w.close();

  const kv = await mk('viewer', linked, { url: 'http://localhost/pengguna/kelola' }); await wait(100);
  check('viewer yang membuka /pengguna/kelola dialihkan ke tab Akun', kv.ev('PG_TAB') === 'akun', kv.ev('PG_TAB'));
  kv.w.close();

  const users = [{ id: '11111111-1111-1111-1111-111111111111', name: 'Admin', email: 'u@x.id', role: 'admin', approved: true, member_id: null },
                 { id: '33333333-3333-3333-3333-333333333333', name: 'Siti', email: 's@x.id', role: 'viewer', approved: true, member_id: 8 }];
  const a = await mk('admin', linked, { users, members: [{ id: 7, name: 'Budi ' + EVIL, relation: 'Anak', active: 1 }, { id: 8, name: 'Siti', relation: 'Anak', active: 1 }] });
  a.ev("PG_TAB='kelola'"); a.ev("showPage('pengguna')"); await wait(120);
  const sels = [...a.$('#pengguna').querySelectorAll('select[aria-label="Hubungkan ke anggota"]')];
  check('admin: kolom "Anggota keluarga" ada untuk tiap pengguna', sels.length === 2, String(sels.length));
  const s0 = sels[0]; const taken = [...s0.options].find(o => o.value === '8');
  check('anggota yang sudah terhubung ke akun lain tidak bisa dipilih (disabled)', taken && taken.disabled, taken && taken.outerHTML);
  check('XSS: nama anggota di <option> tidak dieksekusi', !a.$('#pengguna').querySelector('img[src="x"]') && a.alerts.length === 0);
  s0.value = '7'; s0.dispatchEvent(new a.w.Event('change')); await wait(80);
  check('memilih anggota → link_member(user, member_id)', a.sb.calls.args.link_member && a.sb.calls.args.link_member.p_user === '11111111-1111-1111-1111-111111111111' && a.sb.calls.args.link_member.p_member === 7, JSON.stringify(a.sb.calls.args.link_member));
  const s1 = [...a.$('#pengguna').querySelectorAll('select[aria-label="Hubungkan ke anggota"]')][1]; s1.value = ''; s1.dispatchEvent(new a.w.Event('change')); await wait(80);
  check('memilih "belum dihubungkan" → melepas (member null)', a.sb.calls.args.link_member.p_member === null, JSON.stringify(a.sb.calls.args.link_member));
  a.w.close();
}

console.log('\n═══ 9. Tolak semua pendaftar menunggu ═══');
{
  const DASH = { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] };
  const users = [{ id: '1', name: 'Admin', email: 'u@x.id', role: 'admin', approved: true }, { id: '2', name: 'P1', email: 'p1@x.id', role: 'viewer', approved: false }, { id: '3', name: 'P2', email: 'p2@x.id', role: 'viewer', approved: false }];
  const t = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: fn === 'dashboard' ? DASH : fn === 'list_users' ? users : fn === 'reject_all_pending' ? 2 : null, error: null }) });
  t.ev("PG_TAB='kelola'"); t.ev("showPage('pengguna')"); await wait(100);
  const b = [...t.$('#pengguna').querySelectorAll('button')].find(x => /Tolak semua/.test(x.textContent));
  check('tombol "Tolak semua (2)" tampil', !!b && /\(2\)/.test(b.textContent), b && b.textContent);
  let asked = ''; t.w.confirm = m => (asked = m, true);
  b && b.click(); await wait(80);
  check('meminta konfirmasi menyebut jumlah (2)', /2/.test(asked), asked);
  check('klik → reject_all_pending dipanggil', t.sb.calls.includes('rpc:reject_all_pending'));
  t.w.confirm = () => false; t.sb.calls.length = 0; const b2 = [...t.$('#pengguna').querySelectorAll('button')].find(x => /Tolak semua/.test(x.textContent)); b2 && b2.click(); await wait(60);
  check('batal di konfirmasi → tidak memanggil server', !t.sb.calls.includes('rpc:reject_all_pending'));
  t.w.close();
  const e = await boot({ session: null }); e.$('#signupBtn').click();
  check('pesan galat pendaftaran penuh dipetakan ke bahasa yang jelas', /penuh/.test(e.ev("MSG['Database error saving new user']")));
  e.w.close();
}

console.log('\n═══ 10. Refresh / link langsung & fallback 404.html ═══');
{
  const t = await boot({ from: PROFILE('viewer', true), url: 'http://localhost/arisan' }); await wait(100);
  check('buka langsung /arisan → halaman Arisan aktif, URL tetap /arisan', t.ev('page') === 'arisan' && t.w.location.pathname === '/arisan', t.ev('page') + ' ' + t.w.location.pathname);
  t.w.close();
  const r = await boot({ from: PROFILE('viewer', true), pre: w => w.sessionStorage.setItem('fh:redirect', '/silsilah') }); await wait(100);
  check('alamat dari 404.html dipulihkan → halaman Silsilah, URL /silsilah', r.ev('page') === 'silsilah' && r.w.location.pathname === '/silsilah', r.ev('page') + ' ' + r.w.location.pathname);
  check('penanda pemulihan dihapus (tidak berulang saat refresh berikutnya)', r.w.sessionStorage.getItem('fh:redirect') === null);
  r.w.close();
  const x = await boot({ from: PROFILE('viewer', true), pre: w => w.sessionStorage.setItem('fh:redirect', '//evil.example/x') }); await wait(100);
  check('alamat pemulihan berbahaya (//host) diabaikan', x.w.location.hostname === 'localhost' && x.w.location.pathname === '/', x.w.location.href);
  x.w.close();
  const u = await boot({ from: PROFILE('viewer', true), url: 'http://localhost/tidak-ada' }); await wait(100);
  check('alamat tak dikenal → Dashboard, URL dikoreksi ke /', u.ev('page') === 'dashboard' && u.w.location.pathname === '/', u.ev('page') + ' ' + u.w.location.pathname);
  u.w.close();
}

process.exit(summary() ? 0 : 1);
