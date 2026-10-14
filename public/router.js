// ===== Router (v3.7): URL berbeda per halaman, tombol Back/Forward, dan data selalu segar =====
// Contoh: / (Dashboard), /arisan, /silsilah, /anggota, /keuangan, /agenda, /galeri, /pengumuman,
//         /laporan, /pengguna (Akun Saya), /pengguna/kelola (admin), /pengaturan
// Dimuat paling akhir agar bisa membungkus showPage() dan R[...] yang didefinisikan file lain.
(() => {
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const segs = p => { let s = ''; try { s = decodeURIComponent(p || ''); } catch (_) { } return s.replace(/^\/+|\/+$/g, '').toLowerCase().split('/'); };
const tabOf = p => { const [a, b] = segs(p); return a === 'pengguna' && (b === 'kelola' || b === 'iuran') ? b : 'akun'; };   // sub-tab halaman Akun & Pengguna
const toId = p => {                                   // '/arisan/' → 'arisan' ; selain itu → null
  const s = segs(p)[0];
  if (s === '' || s === 'dashboard') return 'dashboard';   // alamat utama "/" = Dashboard
  if (s === 'password') return 'pengguna';                 // alamat lama /password → Akun & Pengguna
  return has(titles, s) ? s : null;
};
const pathOf = id => id === 'dashboard' ? '/' : id === 'pengguna' && PG_TAB !== 'akun' ? '/pengguna/' + PG_TAB : '/' + id;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Halaman awal diambil dari URL (boot() berjalan setelah semua skrip dimuat & login terverifikasi)
page = toId(location.pathname) || 'dashboard'; PG_TAB = tabOf(location.pathname);

// ---------- Judul tab browser: "Arisan · FamilyHub — …" ----------
let baseTitle = document.title, lastTitle = null;
const titleEl = document.querySelector('title');
const paintTitle = () => { lastTitle = (titles[page] ? titles[page] + ' · ' : '') + baseTitle; if (document.title !== lastTitle) document.title = lastTitle; };
if (titleEl) new MutationObserver(() => {            // judul diganti pihak lain (mis. Pengaturan → nama brand)
  if (document.title === lastTitle) return;
  baseTitle = document.title; paintTitle();
}).observe(titleEl, { childList: true, characterData: true, subtree: true });

// ---------- Bilah progres tipis di atas layar saat halaman memuat data ----------
const bar = document.createElement('div'); bar.id = 'navBar'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
let busy = 0, hideT = 0;
const progress = d => {
  busy = Math.max(0, busy + d); clearTimeout(hideT);
  if (busy) { bar.className = 'on'; }
  else { bar.className = 'done'; hideT = setTimeout(() => { bar.className = ''; }, 380); }
};
// Setiap render halaman dibungkus: tampilkan progres, tunggu data selesai dimuat
Object.keys(R).forEach(k => {
  const f = R[k];
  R[k] = async (...a) => { progress(1); try { return await f(...a); } finally { progress(-1); } };
});

// ---------- Navigasi ----------
const _show = showPage;
let popping = false, firstNav = true;

showPage = function (id, btn) {
  if (!has(titles, id)) id = 'dashboard';
  if (id === 'pengguna' && PG_TAB === 'kelola' && ME && !isA()) PG_TAB = 'akun';   // tab Kelola Pengguna khusus admin

  const path = pathOf(id), changed = id !== page;
  if (location.pathname !== path) {
    // Muat pertama & koreksi URL memakai replace (tidak menambah riwayat); perpindahan nyata memakai push
    if (firstNav || popping) history.replaceState({ id }, '', path);
    else history.pushState({ id }, '', path);
  }
  firstNav = false;

  closeForm(); closeProfile();                        // jangan biarkan modal terbuka menumpuk di halaman lain
  if (changed) { CACHE = {}; MEMBERS = []; if (window.resetCfg) resetCfg(); }   // pindah halaman = data diambil ulang
  const r = _show(id, btn);                           // set page, ganti section aktif, ambil data
  paintTitle();
  return r;
};

// Tombol Back / Forward browser
addEventListener('popstate', () => {
  const id = toId(location.pathname) || 'dashboard';
  PG_TAB = tabOf(location.pathname);
  if (!ME) { page = id; return; }                     // belum login: boot() nanti memakai URL ini
  popping = true; try { showPage(id); } finally { popping = false; }
});

// Muat ulang otomatis saat tab kembali aktif setelah lama ditinggal / koneksi pulih (data tidak basi)
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && ME && !document.querySelector('#formModal.show,#profileModal.show')) {
    CACHE = {}; MEMBERS = []; if (window.resetCfg) resetCfg(); reload();
  }
  hiddenAt = 0;
});

paintTitle();
})();
