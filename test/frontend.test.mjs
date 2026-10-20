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
{
  const btns = [...html.matchAll(/<button[^>]*onclick="showPage\('([a-z]+)'/g)].map(m => m[1]);
  check('menu: setiap tombol menu menuju halaman (section) yang ada', btns.length >= 10 && btns.every(id => new RegExp(`<section id="${id}"`).test(html)), btns.join(','));
  check('menu: tidak ada halaman ganda & semua halaman utama tercantum', new Set(btns).size === btns.length && ['dashboard', 'arisan', 'keuangan', 'laporan', 'anggota', 'silsilah', 'agenda', 'pengumuman', 'galeri', 'pengguna', 'pengaturan'].every(x => btns.includes(x)));
  const titles = [...html.matchAll(/class="nav-title">([^<]+)</g)].map(m => m[1]);
  check('menu: dikelompokkan menurut tugas (4 kelompok berjudul)', titles.length === 4 && /Arisan/.test(titles[0]) && titles[1] === 'Keluarga' && titles[2] === 'Kegiatan' && /Akun/.test(titles[3]), titles.join('|'));
  check('menu: ikon SVG konsisten (tanpa glyph teks) & tombol Pengaturan khusus admin tetap tersembunyi awalnya', !/class="nav-icon">[^<]/.test(html) && /id="navSettings" style="display:none"/.test(html));
  check('menu: stylesheet menu.css ada & dimuat', fs.existsSync(path.join(PUB, 'menu.css')) && html.includes('href="/menu.css"'));
}
{
  const mem = fs.readFileSync(path.join(PUB, 'members.js'), 'utf8'), mf = fs.readFileSync(path.join(PUB, 'memberform.js'), 'utf8'), app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  check('form anggota: memberform.js dimuat SESUDAH profile.js & stylesheet-nya terpasang', html.indexOf('/memberform.js') > html.indexOf('/profile.js') && html.includes('href="/memberform.css"') && fs.existsSync(path.join(PUB, 'memberform.css')));
  check('form anggota: Tambah & Ubah memakai tampilan profil (openMemberForm), bukan dialog generik', /await openMemberForm\(id,/.test(mem) && /await openMemberForm\(null,/.test(mem) && !/openForm\('Ubah Anggota'/.test(mem) && !/openForm\('Tambah Anggota'/.test(mem));
  check('form anggota: memakai ulang saveMember & readForm (aturan simpan tidak diduplikasi)', /saveMember\(id, readForm\(form, fields\)\)/.test(mf));
  check('form anggota: tutup dengan perubahan belum disimpan diminta konfirmasi (closeProfile + Esc)', /window\.mfGuard && !mfGuard\(\)/.test(app) && /function mfGuard\(/.test(mf) && /key === 'Escape' && MF/.test(mf));
  check('form anggota: kolom wajib kosong di tab tersembunyi memindahkan tab (tidak gagal diam-diam)', /showTab\(bad\.closest\('\[data-pane\]'\)\.dataset\.pane\)/.test(mf));
  check('form generik tetap utuh: openForm memakai fieldHtml bersama', /function fieldHtml\(/.test(app) && /fields\.map\(f => fieldHtml\(f, vals\[f\.k\]\)\)/.test(app));
}
{
  const rd = f => fs.readFileSync(path.join(PUB, f), 'utf8'), idx = x => html.indexOf(x);
  const ui = rd('ui.js'), css = rd('ui.css');
  check('UI seragam: ui.css dimuat SESUDAH semua gaya halaman (finance, dashcards, settings, topbar, menu, memberform)', ['finance', 'dashcards', 'settings', 'topbar', 'menu', 'memberform'].every(n => idx(`/${n}.css`) > 0 && idx('/ui.css') > idx(`/${n}.css`)));
  check('UI seragam: ui.js dimuat sebelum app.js (kit tersedia untuk semua halaman)', idx('/ui.js') > 0 && idx('/ui.js') < idx('/app.js'));
  check('UI seragam: kit menyediakan kpi/pill/who/empty/head/seg/barChart', ['kpi', 'pill', 'who', 'empty', 'head', 'seg', 'barChart', 'searchBox'].every(k => new RegExp(`\\b${k}\\b`).test(ui.split('window.UI')[1] || '')));
  const pages = { 'app.js': ['R.dashboard', 'R.agenda', 'R.pengumuman'], 'members.js': ['R.anggota'], 'extras.js': ['R.galeri'] };
  check('UI seragam: Dashboard, Anggota, Agenda, Pengumuman, Dokumentasi memakai kartu KPI & kepala kartu dari kit', Object.entries(pages).every(([f, rs]) => rs.every(r => { const src = rd(f), i = src.indexOf(r + ' = async'); return i >= 0 && /UI\.kpi\(/.test(src.slice(i, i + 4500)) && /UI\.head\(/.test(src.slice(i, i + 4500)); })));
  check('UI seragam: tak ada lagi kartu gaya lama (.stat bergelombang) di app.js', !/class=\"card stat\"/.test(rd('app.js')) && !/class=\"wave\"/.test(rd('app.js')));
  check('UI seragam: tab Akun, Pengaturan, Keuangan bergaya sama (ikon SVG, bukan glyph teks)', /UI\.ic\(ic, 17\)/.test(rd('account.js')) && /UI\.ic\(ic, 17\)/.test(rd('settings.js')) && !/\['akun', '◉'/.test(rd('account.js')));
  check('UI seragam: Laporan memakai kepala kartu & ikon kit', /UI\.head\('Pengaturan laporan'/.test(rd('report.js')) && /UI\.ic\('download'/.test(rd('report.js')));
  check('UI seragam: gaya halaman lama diseragamkan (tabel, status, tab, toolbar)', ['.page .table:not(.fin-table)', '.page .status', '.st-tab.on', '.page .toolbar'].every(k => css.includes(k)));
}
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
  const appJs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'), routerJs = fs.readFileSync(path.join(PUB, 'router.js'), 'utf8');
  check('app.js TIDAK memulai sesi saat dimuat (api("me") tidak dipanggil di tingkat atas)', !/^api\('me'\)/m.test(appJs) && /function startApp\(/.test(appJs));
  check('router.js (skrip terakhir) memanggil startApp() setelah semua skrip siap', /\nstartApp\(\);/.test(routerJs) && /router\.js"><\/script>\s*(<\/body>|<!--|$)/m.test(html + '\n'));
  check('baris tabel Anggota: nama bisa diklik membuka profil', /class="mcell[^>]*onclick="openProfile\(\$\{m\.id\}\)"/.test(fs.readFileSync(path.join(PUB, 'members.js'), 'utf8')));
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
  const linked = { linked: true, period: 'P003', rounds: [{ period: '2026-08', seq: 1, status: 'selesai' }, { period: '2026-09', seq: 2, status: 'selesai' }, { period: '2026-03', seq: 0, status: 'selesai' }, { period: 'P003', seq: 3, status: 'aktif' }], member: { id: 7, name: 'Budi ' + EVIL, relation: 'Anak', active: true },
    types: [{ id: 1, name: 'Iuran Arisan', amount: 350000, fund: 'arisan', schedule: 'putaran', required_for_draw: true, paid_now: false, arrears: 2, arrears_total: 700000, arrears_periods: ['2026-08', '2026-09'] },
            { id: 2, name: 'Kas ' + EVIL, amount: 50000, fund: 'kas', schedule: 'bulanan', required_for_draw: false, paid_now: true, arrears: 0, arrears_total: 0, arrears_periods: [] }],
    can_draw: false, won: [{ period: '2026-03', at: '2026-03-20T00:00:00Z' }],
    recent: [{ period: '2026-07', schedule: 'bulanan', type: 'Iuran Arisan', amount: 350000, paid_at: '2026-07-05T00:00:00Z', method: 'Tunai', receipt_no: 'KW-2026-0001' + EVIL }] };
  const mk = (role, my, extra = {}) => boot({ from: st => st.t === 'profiles' ? { data: { name: 'Budi', role, approved: true }, error: null } : st.t === 'members' ? { data: extra.members || [], error: null } : { data: [], error: null },
    rpc: (fn, a) => ({ data: fn === 'dashboard' ? DASH : fn === 'my_status' ? my : fn === 'list_users' ? (extra.users || []) : null, error: null }), url: extra.url });

  const t = await mk('viewer', linked);
  t.ev("PG_TAB='iuran'"); t.ev("showPage('pengguna')"); await wait(100);
  const box = t.$('#pengguna'), tabs = [...box.querySelectorAll('.st-tab')].map(b => b.textContent.trim());
  check('viewer melihat tab "Akun Saya" & "Iuran Saya" (tanpa Kelola Pengguna)', tabs.length === 2 && /Iuran Saya/.test(tabs[1]), JSON.stringify(tabs));
  check('alamat URL = /pengguna/iuran', t.w.location.pathname === '/pengguna/iuran', t.w.location.pathname);
  check('banner: ada tunggakan Rp 700.000 (2 tagihan)', /700\.000/.test(box.textContent) && /2 tagihan/.test(box.textContent), box.textContent.slice(0, 300));
  check('kartu per jenis iuran: Belum dibayar / Lunas bulan ini', /Belum dibayar/.test(box.textContent) && /Lunas bulan ini/.test(box.textContent) && /\/ putaran/.test(box.textContent));
  check('putaran yang menunggak ditulis (Putaran 1 & Putaran 2)', /Putaran 1/.test(box.textContent) && /Putaran 2/.test(box.textContent));
  check('arisan: belum memenuhi syarat + pernah menang (Putaran 0)', /Belum memenuhi syarat/.test(box.textContent) && /Putaran 0/.test(box.textContent));
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

console.log('\n═══ 9b. Hapus pengguna aktif ═══');
{
  const DASH = { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] };
  const users = [{ id: '11111111-1111-1111-1111-111111111111', name: 'Admin', email: 'u@x.id', role: 'admin', approved: true }, { id: '33333333-3333-3333-3333-333333333333', name: `Evil x');alert(1);('`, email: 'v@x.id', role: 'viewer', approved: true }];
  const t = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: fn === 'dashboard' ? DASH : fn === 'list_users' ? users : null, error: null }) });
  t.ev("PG_TAB='kelola'"); t.ev("showPage('pengguna')"); await wait(100);
  const box = t.$('#pengguna'), del = [...box.querySelectorAll('button')].filter(x => x.textContent === 'Hapus' && /deleteUser/.test(x.getAttribute('onclick') || ''));
  check('tombol Hapus hanya untuk akun lain (1 dari 2 pengguna)', del.length === 1, String(del.length));
  check('XSS: hanya id (bukan nama) di atribut handler Hapus', !/alert|Evil/.test(del[0].getAttribute('onclick')), del[0].getAttribute('onclick'));
  let asked = ''; t.w.confirm = m => (asked = m, false);
  del[0].click(); await wait(60);
  check('konfirmasi menyebut nama & email pengguna', /Evil/.test(asked) && /v@x\.id/.test(asked), asked);
  check('batal di konfirmasi → delete_user TIDAK dipanggil', !t.sb.calls.includes('rpc:delete_user'));
  t.w.confirm = () => true; del[0].click(); await wait(80);
  check('setuju → delete_user(id) dipanggil', t.sb.calls.args.delete_user && t.sb.calls.args.delete_user.p_id === '33333333-3333-3333-3333-333333333333', JSON.stringify(t.sb.calls.args.delete_user));
  check('tidak ada kode injeksi yang berjalan', t.alerts.length === 0, JSON.stringify(t.alerts));
  t.w.close();
}

console.log('\n═══ 9c. Ubah pengguna ═══');
{
  const DASH = { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] };
  const users = [{ id: '1', name: 'Admin', email: 'u@x.id', role: 'admin', approved: true }, { id: '3', name: 'Budi', email: 'v@x.id', role: 'viewer', approved: true }];
  const t = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: fn === 'dashboard' ? DASH : fn === 'list_users' ? users : null, error: null }) });
  t.ev("PG_TAB='kelola'"); t.ev("showPage('pengguna')"); await wait(100);
  const ub = [...t.$('#pengguna').querySelectorAll('button')].filter(x => x.textContent === 'Ubah');
  check('tombol Ubah ada untuk setiap pengguna (2)', ub.length === 2, String(ub.length));
  ub[1].click(); await wait(40);
  const f = t.$('#fForm');
  check('form terbuka terisi nama & peran saat ini', f.elements.name.value === 'Budi' && f.elements.role.value === 'viewer');
  f.elements.name.value = 'Budi Santoso'; f.elements.role.value = 'pengelola';
  f.dispatchEvent(new t.w.Event('submit', { cancelable: true })); await wait(100);
  check('simpan → rename_user & set_role dipanggil', t.sb.calls.args.rename_user && t.sb.calls.args.rename_user.p_name === 'Budi Santoso' && t.sb.calls.args.set_role && t.sb.calls.args.set_role.p_role === 'pengelola', JSON.stringify(t.sb.calls.args));
  check('hubungan anggota tak berubah → link_member tidak dipanggil', !t.sb.calls.args.link_member);
  t.w.close();
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

console.log('\n═══ 11. Putaran arisan fleksibel (v3.16) ═══');
{
  const read = f => fs.readFileSync(path.join(PUB, f), 'utf8');
  const dataJs = read('data.js'), setJs = read('settings.js'), profJs = read('profile.js'), drawJs = read('draw.js');
  check('data.js: api("round") → round_state + create/update/open/close/cancel', /t === 'round'/.test(dataJs) && ['create_round', 'update_round', 'open_round', 'close_round', 'cancel_round', 'round_state'].every(f => dataJs.includes(f)) && !/set_active_period|period_state/.test(dataJs));
  check('profile.js memakai putaran/bulan acuan dari konfigurasi (bukan bulan kalender browser)', !/cur = new Date\(\)\.toISOString/.test(profJs) && /getCfg\(\)/.test(profJs));
  check('backup menyertakan putaran arisan sebagai bagian OPSIONAL (backup lama tetap valid)', /\['arisan_rounds', 'arisan_rounds', 'id'\]/.test(setJs) && /OPT = new Set\(\['arisan_rounds'\]\)/.test(setJs));
  check('tidak ada lagi sisa "Kelola periode"/kalender tertinggal di draw.js', !/Kelola periode|perBanner|PRD\b/.test(drawJs));

  const ST = (extra = {}) => ({ active: 'P002', next_seq: 4, today: '2026-10-16', rows: [
    { id: 3, seq: 3, period: 'P003', title: null, status: 'rencana', held_on: null, place: null, requested_by: null, requester: null, note: 'dijadwalkan <b>nanti</b>', attempts: 0, winner: null, pending: 0, paid: 0, collected: 0, disbursed: 0, close_note: null },
    { id: 2, seq: 2, period: 'P002', title: 'Arisan Lebaran', status: 'aktif', held_on: '2026-10-20', place: 'Rumah Bu Rina', requested_by: 4, requester: 'Rina', note: null, attempts: 1, winner: 'Siti', pending: 0, paid: 3, collected: 1050000, disbursed: 0, close_note: null },
    { id: 1, seq: 1, period: '2026-09', title: null, status: 'selesai', held_on: '2026-09-12', place: null, requested_by: null, requester: null, note: null, attempts: 1, winner: 'Budi', pending: 0, paid: 3, collected: 1050000, disbursed: 1050000, close_note: '<img src=x onerror=alert(1)>' }], ...extra });
  const DASH = { members: 0, paid: 0, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: 'P002', month: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] };
  const rpcOf = (state, log) => (fn, a) => ({ data: fn === 'round_state' ? state : ['open_round', 'close_round', 'cancel_round', 'create_round', 'update_round'].includes(fn) ? (log && log.push({ fn, ...a }), { ok: 1 }) : fn === 'dashboard' ? DASH : null, error: null });

  const log = [], t = await boot({ from: PROFILE('admin', true), rpc: rpcOf(ST(), log) });
  t.ev('openRounds()'); await wait(120);
  const m = t.$('#roundModal');
  check('admin: modal Kelola putaran terbuka', !!m && m.classList.contains('show'));
  check('putaran aktif, tanggal, tempat & peminta ditampilkan', /Putaran 2/.test(m.textContent) && /Arisan Lebaran/.test(m.textContent) && /Rumah Bu Rina/.test(m.textContent) && /Rina/.test(m.textContent) && /20 Okt/.test(m.textContent), m.textContent.slice(0, 300));
  check('putaran tanpa tanggal tertulis "Tanggal belum pasti"', /Tanggal belum pasti/.test(m.textContent));
  check('semua putaran terdaftar (1, 2, 3) dengan status', /Rencana/.test(m.textContent) && /Selesai/.test(m.textContent) && /Putaran 1/.test(m.textContent) && /Putaran 3/.test(m.textContent));
  check('catatan putaran (XSS) di-escape — tidak ada elemen <img>/<b> sisipan', !m.querySelector('img') && !m.querySelector('td b > b') && m.textContent.includes('dijadwalkan <b>nanti</b>'));
  check('tombol admin: Jadwalkan, Buka (rencana), Tutup (aktif), Buka kembali (selesai)', /Jadwalkan putaran/.test(m.textContent) && /Buka\b/.test(m.textContent) && /Tutup/.test(m.textContent) && /Buka kembali/.test(m.textContent));
  check('penjelasan: arisan tidak harus sebulan sekali', /tidak harus sebulan sekali/.test(m.textContent));

  t.ev("rdAct('open',3)"); await wait(80);
  const ask = t.$('#roundAskModal');
  check('buka putaran → dialog konfirmasi menyebut putaran baru; putaran aktif akan ditutup', !!ask && ask.classList.contains('show') && /Putaran 3/.test(ask.textContent) && /Putaran 2/.test(ask.textContent));
  check('putaran aktif sudah punya pemenang → catatan opsional, tombol aktif', t.$('#raOk').disabled === false);
  t.$('#raNote').value = 'selesai'; t.$('#raOk').click(); await wait(150);
  check('open_round dikirim: id, catatan, paksa=false', log.length === 1 && log[0].fn === 'open_round' && log[0].p_id === 3 && log[0].p_note === 'selesai' && log[0].p_force === false, JSON.stringify(log));

  t.ev("rdAct('cancel',3)"); await wait(80);
  check('batalkan putaran rencana: alasan opsional', t.$('#raOk').disabled === false);
  t.$('#raOk').click(); await wait(150);
  check('cancel_round dikirim dengan id', log.some(x => x.fn === 'cancel_round' && x.p_id === 3), JSON.stringify(log));

  t.ev("rdAct('close',2)"); await wait(80);
  t.$('#raOk').click(); await wait(150);
  check('close_round dikirim (putaran punya pemenang → tanpa paksa)', log.some(x => x.fn === 'close_round' && x.p_force === false), JSON.stringify(log));

  t.ev("rdAct('form')"); await wait(150);
  check('form jadwalkan putaran: judul, tanggal, tempat, peminta, catatan', !!t.$('#roundFormModal') && !!t.$('#rfTitle') && !!t.$('#rfDate') && !!t.$('#rfPlace') && !!t.$('#rfReq') && !!t.$('#rfNote'));
  t.$('#rfTitle').value = 'Arisan Akhir Tahun'; t.$('#rfPlace').value = 'Surabaya'; t.$('#rfGo').click(); await wait(150);
  const cr = log.find(x => x.fn === 'create_round');
  check('create_round: tanggal kosong terkirim null (belum pasti), judul & tempat terkirim', !!cr && cr.p_held_on === null && cr.p_title === 'Arisan Akhir Tahun' && cr.p_place === 'Surabaya' && cr.p_requested_by === null, JSON.stringify(cr));
  t.w.close();

  const noW = ST(); noW.rows[1].winner = null; noW.rows[1].attempts = 0;
  const l2 = [], t2 = await boot({ from: PROFILE('admin', true), rpc: rpcOf(noW, l2) });
  t2.ev('openRounds()'); await wait(120); t2.ev("rdAct('open',3)"); await wait(80);
  check('putaran aktif tanpa pemenang: tombol nonaktif sampai alasan diisi', t2.$('#raOk').disabled === true && /tanpa pemenang/.test(t2.$('#roundAskModal').textContent));
  t2.$('#raNote').value = 'ditunda'; t2.$('#raNote').dispatchEvent(new t2.w.Event('input'));
  check('alasan diisi → tombol aktif', t2.$('#raOk').disabled === false);
  t2.$('#raOk').click(); await wait(150);
  check('paksa=true & alasan terkirim', l2.length === 1 && l2[0].p_force === true && l2[0].p_note === 'ditunda', JSON.stringify(l2));
  t2.w.close();

  const pend = ST(); pend.rows[1].pending = 1;
  const l3 = [], t3 = await boot({ from: PROFILE('admin', true), rpc: rpcOf(pend, l3) });
  t3.ev('openRounds()'); await wait(120); t3.ev("rdAct('open',3)"); await wait(80);
  check('pemenang menunggu konfirmasi → tidak ada dialog & tidak ada panggilan', !(t3.$('#roundAskModal') && t3.$('#roundAskModal').classList.contains('show')) && l3.length === 0);
  t3.w.close();

  const v = await boot({ from: PROFILE('viewer', true), rpc: rpcOf(ST(), []) });
  v.ev('openRounds()'); await wait(120);
  check('viewer: hanya melihat daftar, tanpa tombol kelola', !!v.$('#roundModal') && /Putaran 2/.test(v.$('#roundModal').textContent) && !v.$('#roundModal').querySelector('.rd-top button') && !v.$('#roundModal').querySelector('.rd-acts button'));
  v.w.close();

  const jeda = { period: null, round: null, rounds: [], cycle: 1, eligible: [], unpaid: 0, winner: null, pending: null, absent: [], attempts: 0, history: [] };
  const tj = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: fn === 'draw_state' ? jeda : fn === 'dashboard' ? { ...DASH, period: null, round: null } : null, error: null }) });
  await wait(120);
  check('arisan jeda: kartu pengocokan menulis "Belum ada putaran aktif" + tombol Kelola putaran', /Belum ada putaran aktif/.test(tj.$('#dashboard').textContent) && /Kelola putaran/.test(tj.$('#dashboard').textContent), tj.$('#dashboard').textContent.slice(0, 200));
  tj.w.close();

  const old = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: fn === 'round_state' ? null : fn === 'dashboard' ? DASH : null, error: fn === 'round_state' ? { message: 'function not found', code: '42883' } : null }) });
  await wait(100);
  check('SQL belum di-patch (round_state hilang): dashboard tetap jalan tanpa galat', old.errs.length === 0 && old.ev('page') === 'dashboard', old.errs.join('|'));
  old.w.close();
}

console.log('\n═══ 12. Iuran per putaran & per bulan (v3.16) ═══');
{
  const TYPES = [{ id: 1, code: 'arisan', name: 'Iuran Arisan', amount: 350000, fund: 'arisan', schedule: 'putaran', required_for_draw: true, active: true, start_period: '2026-01', sort: 1 },
                 { id: 2, code: 'wajib', name: 'Iuran Wajib', amount: 50000, fund: 'kas', schedule: 'bulanan', required_for_draw: false, active: true, start_period: '2026-01', sort: 2 }];
  const RND = [{ period: 'P002', seq: 2, title: null, status: 'aktif', held_on: '2026-10-20' }, { period: 'P001', seq: 1, title: 'Lebaran', status: 'selesai', held_on: '2026-04-02' }];
  const gp = (over = {}) => ({ period: 'P002', month: '2026-10', round: { ...RND[0], requester: 'Rina' }, rounds: RND, iuran: 350000, types: TYPES,
    rows: [{ member_id: 1, name: 'Budi', relation: 'Anak', phone: '0811', paid: { 1: { pid: 5, amount: 350000, paid_at: '2026-10-01T00:00:00Z', receipt_no: 'KW-1', method: 'Tunai' } }, can_draw: true },
           { member_id: 2, name: 'Siti', relation: 'Anak', phone: '0812', paid: {}, can_draw: false }], ...over });
  const ARR = [{ member_id: 2, name: 'Siti', phone: '0812', type_id: 1, type_name: 'Iuran Arisan', amount: 350000, schedule: 'putaran', periods: ['P001'], n: 1, total: 350000 }];
  const rpc = (over = {}) => (fn) => ({ data: fn === 'fee_config' ? { period: 'P002', round: RND[0], rounds: RND, month: '2026-10', ref_month: '2026-10', types: TYPES, meta: { org: 'Arisan', treasurer: '', chair: '' } }
    : fn === 'get_payments' ? gp(over) : fn === 'iuran_arrears' ? ARR : fn === 'dashboard' ? { members: 2, paid: 1, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: 'P002', month: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] } : null, error: null });
  const t = await boot({ from: PROFILE('admin', true), rpc: rpc() });
  t.ev("showPage(\'arisan\')"); await wait(250);
  const box = t.$('#arisan');
  check('tab Iuran: judul memuat putaran aktif dan bulan acuan', /Putaran 2/.test(box.textContent) && /Oktober 2026/.test(box.textContent), box.textContent.slice(0, 200));
  const sel = box.querySelector('select[aria-label="Putaran"]');
  check('ada pemilih putaran (bukan hanya pemilih bulan) dengan penanda (aktif)', !!sel && /\(aktif\)/.test(sel.textContent) && sel.options.length === 2);
  check('tidak ada pemilih bulan; periode bulanan mengikuti acuan putaran & tampil di header kolom', !box.querySelector('input[type=month]') && /Periode: Oktober 2026/.test(box.querySelector('thead').textContent) && /Periode: Putaran 2/.test(box.querySelector('thead').textContent));
  check('anggota belum bayar punya tombol Catat; yang sudah, tidak', box.querySelectorAll('.btn-s.pay').length >= 1);
  t.ev("finPerR('P001')"); await wait(150);
  check('memilih putaran lain memuat ulang tanpa galat', t.errs.length === 0, t.errs.join('|'));
  t.w.close();

  const jeda = await boot({ from: PROFILE('admin', true), rpc: rpc({ period: null, round: null, rows: gp().rows.map(r => ({ ...r, paid: {} })) }) });
  jeda.ev("showPage(\'arisan\')"); await wait(250);
  const jb = jeda.$('#arisan');
  check('arisan jeda: tampil peringatan & kolom Iuran Arisan tanpa tombol Catat', /Arisan sedang jeda/.test(jb.textContent) && !jb.querySelector('.btn-s.pay[onclick*=",1)"]'), jb.textContent.slice(0, 200));
  jeda.w.close();

  const plan = await boot({ from: PROFILE('admin', true), rpc: rpc({ round: { ...RND[0], status: 'rencana' } }) });
  plan.ev("showPage(\'arisan\')"); await wait(250);
  check('putaran masih rencana: ada catatan & Iuran Arisan tidak bisa dicatat', /masih rencana/.test(plan.$('#arisan').textContent) && !plan.$('#arisan').querySelector('.btn-s.pay[onclick*=",1)"]'));
  plan.w.close();
}

console.log('\n═══ 13. Halaman Keuangan: tampilan jelas & profesional ═══');
{
  const TYPES = [{ id: 1, code: 'arisan', name: 'Iuran Arisan', amount: 350000, fund: 'arisan', schedule: 'putaran', required_for_draw: true, active: true, start_period: '2026-01', sort: 1 },
                 { id: 2, code: 'wajib', name: 'Iuran Wajib', amount: 50000, fund: 'kas', schedule: 'bulanan', required_for_draw: false, active: true, start_period: '2026-01', sort: 2 }];
  const RND = [{ period: 'P002', seq: 2, title: null, status: 'aktif', held_on: '2026-10-20' }];
  const gp = { period: 'P002', month: '2026-10', round: RND[0], rounds: RND, iuran: 350000, types: TYPES,
    rows: [{ member_id: 1, name: 'Budi Santoso', relation: 'Anak', phone: '0811', paid: { 1: { pid: 5, amount: 350000, paid_at: '2026-10-01T00:00:00Z', receipt_no: 'KW-1', method: 'Tunai' }, 2: { pid: 6, amount: 50000, paid_at: '2026-10-01T00:00:00Z', receipt_no: 'KW-2', method: 'Tunai' } }, can_draw: true },
           { member_id: 2, name: 'Siti Rahayu', relation: 'Anak', phone: '0812', paid: {}, can_draw: false }] };
  const ARR = [{ member_id: 2, name: 'Siti Rahayu', phone: '0812', type_id: 2, type_name: 'Iuran Wajib', amount: 50000, schedule: 'bulanan', periods: ['2026-08', '2026-09'], n: 2, total: 100000 }];
  const FD = { funds: [{ fund: 'arisan', saldo: 700000 }, { fund: 'kas', saldo: 1250000 }], pending: [{ winner: 'Dewi', period: 'P002', collected: 700000, disbursed: 0, amount: 700000 }], month: { masuk: 100000, keluar: 25000 }, arrears: { amount: 100000, members: 1 },
    monthly: [{ m: '2026-09', masuk_arisan: 0, masuk_kas: 100000, keluar: 0 }, { m: '2026-10', masuk_arisan: 700000, masuk_kas: 100000, keluar: 25000 }],
    types: [{ name: 'Iuran Arisan', fund: 'arisan', schedule: 'putaran', key: 'P002', amount: 350000, members: 2, paid: 1, realized: 350000, required: true }], round: RND[0], period: 'P002', rounds: RND };
  const LED = { opening: 1000000, total: 2, truncated: false, rows: [{ id: 1, date: '2026-10-02', description: 'Donasi', category: 'Donasi / Sumbangan', fund: 'kas', type: 'masuk', amount: 100000, bal: 1100000, receipt_no: null, payment_id: null },
    { id: 2, date: '2026-10-03', description: 'Konsumsi', category: 'Konsumsi & Acara', fund: 'kas', type: 'keluar', amount: 25000, bal: 1075000, receipt_no: null, payment_id: null }] };
  const CFG = { period: 'P002', round: RND[0], rounds: RND, month: '2026-10', ref_month: '2026-10', types: TYPES, meta: { org: 'Arisan', treasurer: '', chair: '' } };
  const DASH = { members: 2, paid: 1, saldo: 0, masuk: 0, keluar: 0, cashflow: [], activity: [], recent: [], period: 'P002', month: '2026-10', next: null, funds: { arisan: 0, kas: 0 }, types: [] };
  const MAP = { fee_config: CFG, get_payments: gp, iuran_arrears: ARR, finance_dashboard: FD, finance_ledger: LED, dashboard: DASH };
  const t = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: MAP[fn] === undefined ? null : MAP[fn], error: null }) });
  t.ev("showPage('keuangan')"); await wait(250);
  const kb = () => t.$('#keuangan');
  check('Ringkasan: 4 tab berperan tablist & tab aktif ditandai', kb().querySelectorAll('.fin-tabs [role=tab]').length === 4 && kb().querySelectorAll('.fin-tabs [aria-selected=true]').length === 1);
  check('Ringkasan: 4 kartu ringkasan berikon SVG (tanpa glyph teks)', kb().querySelectorAll('.fin-kpis .kpi').length === 4 && kb().querySelectorAll('.fin-kpis .kpi-ic svg').length === 4 && !/[◆◎▣]/.test(kb().textContent));
  check('Ringkasan: total saldo = Dana Arisan + Kas Wajib (Rp 1.950.000)', /1\.950\.000/.test(kb().querySelector('.k-total').textContent));
  check('Ringkasan: grafik arus kas punya sumbu, garis bantu & label aksesibel', !!kb().querySelector('svg.fin-chart[aria-label]') && kb().querySelectorAll('svg.fin-chart line').length === 5 && /Total masuk/.test(kb().textContent) && /Selisih/.test(kb().textContent));
  check('Ringkasan: dana menunggu dicairkan menampilkan pemenang & tombol Cairkan', /Dewi/.test(kb().querySelector('.fin-pend').textContent) && /Cairkan/.test(kb().querySelector('.fin-pend').textContent));
  check('Ringkasan: progres iuran memakai class .pct (tidak bentrok dengan kartu silsilah)', !!kb().querySelector('.fin-prog .pct') && !kb().querySelector('.fin-prog .pc'));

  t.ev("finTab('iuran')"); await wait(250);
  check('Iuran: status memakai pill (Lunas/Belum) & tombol Catat tetap ada', kb().querySelectorAll('.pill.ok').length >= 1 && kb().querySelectorAll('.btn-s.pay').length >= 1);
  check('Iuran: filter menampilkan jumlah anggota per status', [...kb().querySelectorAll('.fin-bar .seg button em')].map(e => e.textContent).join(',') === '2,1,1');
  check('Iuran: tiap anggota punya avatar inisial & ada keterangan jumlah baris', kb().querySelectorAll('.fin-table .fav').length === 2 && /Menampilkan 2 dari 2 anggota/.test(kb().textContent));
  t.ev("finFlt('belum')"); await wait(80);
  check('Iuran: filter "Belum lunas" hanya menyisakan yang belum lunas', kb().querySelectorAll('.fin-table tbody tr').length === 1 && /Siti/.test(kb().querySelector('.fin-table tbody').textContent));

  t.ev("finTab('bukukas')"); await wait(250);
  check('Buku Kas: kartu saldo awal/penerimaan/pengeluaran/saldo akhir', kb().querySelectorAll('.fin-kpis .kpi').length === 4 && /1\.075\.000/.test(kb().querySelector('.k-total').textContent));
  check('Buku Kas: baris total periode & tanda + / − pada nominal', /Total periode \(2 transaksi\)/.test(kb().querySelector('tfoot').textContent) && /\+100\.000/.test(kb().textContent) && /−25\.000/.test(kb().textContent));
  t.ev("finLgQ('konsumsi')"); await wait(400);
  check('Buku Kas: saat mencari, saldo berjalan disembunyikan disertai penjelasan', /Saldo berjalan disembunyikan/.test(kb().textContent));

  t.ev("finTab('tunggakan')"); await wait(250);
  check('Tunggakan: ringkasan, rincian periode, dan tombol Lunasi/Ingatkan', kb().querySelectorAll('.fin-kpis .kpi').length >= 3 && kb().querySelectorAll('.chip.s').length === 2 && /Ingatkan/.test(kb().textContent) && /Lunasi/.test(kb().textContent));
  check('semua tab Keuangan dirender tanpa galat', t.errs.length === 0, t.errs.join('|'));
  t.w.close();

  for (const [lbl, p1, warn] of [['bulan sama', '2026-10', true], ['bulan berbeda', '2026-09', false]]) {
    const R2 = [{ period: 'P002', seq: 2, title: null, status: 'aktif', held_on: null, ref_month: '2026-10' }, { period: 'P001', seq: 1, title: null, status: 'selesai', held_on: '2026-09-10', ref_month: p1 }];
    MAP.get_payments = { ...gp, rounds: R2, round: R2[0], month: '2026-10' }; MAP.fee_config = { ...CFG, rounds: R2, round: R2[0] };
    const s = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: MAP[fn] === undefined ? null : MAP[fn], error: null }) });
    s.ev("showPage('keuangan')"); await wait(200); s.ev("finTab('iuran')"); await wait(250);
    const txt = s.$('#keuangan').textContent;
    check(`Iuran: Iuran Wajib ${lbl} dengan putaran lain → ${warn ? 'peringatan tampil' : 'tanpa peringatan'}`, warn ? /juga dipakai oleh Putaran 1/.test(txt) : !/juga dipakai oleh/.test(txt));
    s.w.close();
  }
  MAP.get_payments = gp; MAP.fee_config = CFG;

  MAP.iuran_arrears = []; MAP.finance_dashboard = { ...FD, pending: [], arrears: { amount: 0, members: 0 }, monthly: [] }; MAP.finance_ledger = { opening: 0, rows: [], total: 0, truncated: false };
  const e = await boot({ from: PROFILE('admin', true), rpc: fn => ({ data: MAP[fn] === undefined ? null : MAP[fn], error: null }) });
  e.ev("showPage('keuangan')"); await wait(250);
  check('keadaan kosong: grafik & tunggakan menampilkan pesan ramah (bukan tabel kosong)', /Belum ada transaksi/.test(e.$('#keuangan').textContent));
  e.ev("finTab('tunggakan')"); await wait(250); check('keadaan kosong: "Tidak ada tunggakan" tampil', /Tidak ada tunggakan/.test(e.$('#keuangan').textContent));
  e.ev("finTab('bukukas')"); await wait(250); check('keadaan kosong: Buku Kas tanpa transaksi tidak error', /Belum ada transaksi/.test(e.$('#keuangan').textContent) && e.errs.length === 0, e.errs.join('|'));
  e.w.close();
}

process.exit(summary() ? 0 : 1);
