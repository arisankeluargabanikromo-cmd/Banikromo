// ===== Top bar (v3.3): jam WIB, sinkronisasi data, dan menu user =====
(() => {
const TZ = 'Asia/Jakarta', E = id => document.getElementById(id);
let lastSync = null, syncing = false, failed = false;

// ---------- Jam ----------
const fmtT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtD = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
function tick(force) {
  if (document.hidden && force !== true) return;
  const n = new Date(); E('tbTime').textContent = fmtT.format(n); E('tbDate').textContent = fmtD.format(n) + ' • WIB';
  paintSync();
}

// ---------- Sinkronisasi ----------
function ago() {
  if (failed) return 'gagal — coba lagi'; if (!lastSync) return 'belum';
  const s = (Date.now() - lastSync) / 1000;
  return s < 20 ? 'baru saja' : s < 60 ? Math.floor(s) + ' dtk lalu' : s < 3600 ? Math.floor(s / 60) + ' mnt lalu' : Math.floor(s / 3600) + ' jam lalu';
}
function paintSync() {
  const b = E('tbSync'); if (!b) return;
  b.classList.toggle('spin', syncing); b.classList.toggle('off', !navigator.onLine); b.classList.toggle('err', failed && !syncing);
  b.classList.toggle('stale', !failed && !!lastSync && Date.now() - lastSync > 10 * 60 * 1000);
  E('tbSyncAt').textContent = !navigator.onLine ? 'offline' : syncing ? 'menyinkronkan…' : ago();
  b.title = !navigator.onLine ? 'Tidak ada koneksi internet' : 'Sinkronkan data dengan server' + (lastSync ? ' — terakhir ' + new Date(lastSync).toLocaleTimeString('id-ID', { timeZone: TZ }) : '');
}
window.syncNow = async function syncNow() {
  if (syncing || typeof ME === 'undefined' || !ME) return;
  if (!navigator.onLine) return toast('Tidak ada koneksi internet');
  syncing = true; failed = false; E('tbSync').disabled = true; paintSync();
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showLogin(); return; }
    const old = ME.role; ME = await api('me');                  // peran bisa diubah admin lain
    CACHE = {}; MEMBERS = []; if (window.resetCfg) resetCfg();
    if (ME.role !== old) boot(); else await R[page]();          // peran berubah → bangun ulang menu & halaman
    lastSync = Date.now(); renderUser(); toast('✓ Data disinkronkan');
  } catch (e) { failed = true; if (e) console.error(e); }
  finally { syncing = false; E('tbSync').disabled = false; paintSync(); }
};
addEventListener('online', () => { paintSync(); toast('Koneksi kembali — tekan Sinkron untuk memperbarui data'); });
addEventListener('offline', () => { paintSync(); toast('Anda sedang offline'); });

// ---------- Menu user ----------
function renderUser() {
  const box = E('tbUser'); if (!box || !ME) return;
  const role = isA() ? 'Admin keluarga' : 'Anggota (lihat saja)', dark = document.body.classList.contains('dark');
  box.innerHTML = `<button class="tb-user-btn" id="tbUserBtn" type="button" aria-haspopup="menu" aria-expanded="false" title="${esc(ME.name)}"><div class="avatar">${esc(ini(ME.name))}</div><span class="tb-uname"><b>${esc(ME.name)}</b><small>${role}</small></span><i class="tb-chev">▾</i></button>
  <div class="tb-menu" id="tbMenu" role="menu" hidden>
    <div class="tb-mh"><div class="avatar">${esc(ini(ME.name))}</div><div><b>${esc(ME.name)}</b><small>${esc(ME.username || '')}</small><span class="role">${role}</span></div></div>
    ${isA() ? `<button class="tb-mi" role="menuitem" data-go="pengaturan"><span class="ic">✦</span>Pengaturan</button><button class="tb-mi" role="menuitem" data-go="pengguna"><span class="ic">⚙</span>Pengguna & hak akses</button>` : ''}
    <button class="tb-mi" role="menuitem" data-theme><span class="ic">${dark ? '☀' : '◐'}</span>${dark ? 'Mode terang' : 'Mode gelap'}</button>
    <button class="tb-mi" role="menuitem" data-sync><span class="ic">⟳</span>Sinkronkan data</button>
    <div class="tb-sep"></div>
    <button class="tb-mi out" role="menuitem" data-out><span class="ic">⎋</span>Keluar</button>
  </div>`;
}
const menu = () => E('tbMenu'), btn = () => E('tbUserBtn');
function setMenu(open) { const m = menu(), b = btn(); if (!m) return; m.hidden = !open; b.setAttribute('aria-expanded', open); if (open) { const f = m.querySelector('.tb-mi'); f && f.focus(); } }
document.addEventListener('click', e => {
  const box = E('tbUser'); if (!box) return;
  if (!box.contains(e.target)) return setMenu(false);
  if (e.target.closest('#tbUserBtn')) return setMenu(menu().hidden);
  const it = e.target.closest('.tb-mi'); if (!it) return;
  setMenu(false);
  if (it.dataset.go) showPage(it.dataset.go);
  else if ('theme' in it.dataset) { toggleTheme(); renderUser(); }
  else if ('sync' in it.dataset) syncNow();
  else if ('out' in it.dataset) logout();
});
document.addEventListener('keydown', e => {
  const m = menu(); if (!m || m.hidden) return;
  if (e.key === 'Escape') { setMenu(false); btn().focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const it = [...m.querySelectorAll('.tb-mi')], i = it.indexOf(document.activeElement); it[(i + (e.key === 'ArrowDown' ? 1 : -1) + it.length) % it.length].focus(); }
});

// ---------- Pasang ----------
const _boot = boot;
boot = () => { _boot(); renderUser(); lastSync = lastSync || Date.now(); failed = false; paintSync(); };
tick(true); setInterval(tick, 1000); document.addEventListener("visibilitychange", () => tick(true));
})();
