// ===== Tampilan aplikasi mobile (v3.20) =====
// Pendamping mobile.css. Semua gaya hanya berlaku di layar <= 760px; skrip ini aman dimuat di desktop
// (hanya menambah atribut/elemen yang disembunyikan CSS). Tidak mengubah logika data, hanya tampilan:
//   • bottom navigation (Beranda · Arisan · Keuangan · Anggota · Menu) mengikuti halaman aktif
//   • lembar bawah "Menu" berisi profil, menu lain, mode gelap, sinkron, keluar (mengikuti peran pengguna)
//   • tombol kembali di halaman turunan, sapaan + menu cepat di Beranda
//   • tabel → kartu (menambah data-label dari judul kolom)
//   • papan ketik terbuka → bottom nav disembunyikan; warna status bar mengikuti tema
(() => {
const mq = window.matchMedia ? window.matchMedia('(max-width:760px)') : { matches: false };
const isMob = () => !!mq.matches;
const $1 = s => document.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MAIN = ['dashboard', 'arisan', 'keuangan', 'anggota'];
const COLORS = ['#6957ff', '#17b9a0', '#e0a23a', '#3b8bff', '#e5484d', '#8b5cf6', '#0ea5e9'];
const IC = {   // ikon garis (24×24) untuk elemen yang dibuat skrip ini
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  sync: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14.6c2.4.2 4 1.8 4 4.4"/>',
  out: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M16 8l4 4-4 4M20 12H9"/>',
};
const svg = (p, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const e = s => (typeof esc === 'function' ? esc(s) : String(s ?? ''));
const pageId = () => { const p = $1('.page.active'); return p ? p.id : 'dashboard'; };
const go = (id, tab) => { closeSheet(); if (tab && typeof PG_TAB !== 'undefined') PG_TAB = tab; if (typeof showPage === 'function') showPage(id); };

// ---------- Status halaman: tandai <body>, sorot bottom nav, tampilkan tombol kembali ----------
function syncNav() {
  const id = pageId(), on = MAIN.includes(id) ? id : 'menu';
  document.body.dataset.page = id; document.body.dataset.sec = MAIN.includes(id) ? '0' : '1';
  $$('#bnav button').forEach(b => { const m = b.dataset.p === on; b.classList.toggle('on', m); if (m) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
function paintThemeColor() {
  const dark = document.body.classList.contains('dark'); let m = $1('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = dark ? '#0b0f1b' : '#f4f7fb';
}

// ---------- Identitas (nama + logo) di app bar: disalin dari sidebar agar mengikuti Pengaturan → Identitas ----------
function syncBrand() {
  const m = $1('.m-brand'), sm = $1('.sidebar .logo-mark'), sn = $1('.sidebar .logo strong'); if (!m || !sm) return;
  const mk = m.querySelector('.logo-mark'); mk.className = sm.className + ' m-mark'; mk.innerHTML = sm.innerHTML;
  m.querySelector('strong').textContent = sn ? sn.textContent : '';
}
function mountBrand() {
  const tb = $1('.topbar'); if (!tb || $1('.m-brand')) return;
  const d = document.createElement('div'); d.className = 'm-brand'; d.innerHTML = '<div class="logo-mark"></div><strong></strong>';
  const bc = tb.querySelector('.breadcrumb'); tb.insertBefore(d, bc || tb.firstChild);
  const lg = $1('.sidebar .logo'); syncBrand();
  if (lg) new MutationObserver(syncBrand).observe(lg, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
}

// ---------- Tombol kembali di app bar ----------
function mountBack() {
  const tb = $1('.topbar'); if (!tb || $1('#mBack')) return;
  const b = document.createElement('button'); b.id = 'mBack'; b.type = 'button'; b.className = 'm-back'; b.setAttribute('aria-label', 'Kembali ke Beranda');
  b.innerHTML = svg(IC.back); b.onclick = () => go('dashboard'); tb.insertBefore(b, tb.firstChild);
}

// ---------- Lembar bawah "Menu" ----------
const sheet = () => $1('#moreSheet'), bg = () => $1('#moreBg');
function sheetItems() {   // diambil dari menu samping (sudah mengikuti peran: Pengaturan hanya admin)
  return $$('.sidebar .nav button').map(b => {
    const m = /showPage\('([a-z]+)'/.exec(b.getAttribute('onclick') || ''); if (!m || MAIN.includes(m[1]) || b.style.display === 'none') return null;
    const ic = b.querySelector('.nav-icon'), lb = b.querySelector('span:last-child');
    return { id: m[1], icon: ic ? ic.innerHTML : '', label: (lb ? lb.textContent : '').trim() };
  }).filter(Boolean);
}
function buildSheet() {
  const s = sheet(); if (!s || typeof ME === 'undefined' || !ME) return false;
  const role = (typeof ROLE_LBL !== 'undefined' && ROLE_LBL[ME.role]) || 'Anggota', cur = pageId(), dark = document.body.classList.contains('dark'), admin = typeof isA === 'function' && isA();
  const items = sheetItems().map((it, i) => `<button class="mi${cur === it.id ? ' cur' : ''}" type="button" data-go="${it.id}" style="--c:${COLORS[(i + 3) % COLORS.length]}"><span class="mic"><svg viewBox="0 0 24 24" aria-hidden="true">${it.icon.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>[\s\S]*$/g, '')}</svg></span><span>${e(it.label)}</span></button>`).join('');
  s.querySelector('.ms-body').innerHTML = `
    <button class="ms-user" type="button" data-go="pengguna" data-tab="akun"><div class="avatar">${e(typeof ini === 'function' ? ini(ME.name) : '?')}</div><div><b>${e(ME.name)}</b><small>${e(ME.username || '')}</small><span class="role">${e(role)}</span></div><span class="chev">${svg(IC.chev, 20)}</span></button>
    ${items ? `<div class="ms-h">Menu lainnya</div><div class="ms-grid">${items}</div>` : ''}
    <div class="ms-list">
      ${admin ? `<button class="ms-row" type="button" data-go="pengguna" data-tab="kelola">${svg(IC.users, 21)}Kelola pengguna &amp; hak akses</button>` : ''}
      <button class="ms-row" type="button" data-act="theme" role="switch" aria-checked="${dark}">${svg(dark ? IC.sun : IC.moon, 21)}Mode gelap<span class="sw"></span></button>
      <button class="ms-row" type="button" data-act="sync">${svg(IC.sync, 21)}Sinkronkan data</button>
      <button class="ms-row out" type="button" data-act="out">${svg(IC.out, 21)}Keluar</button>
    </div>
    <p class="ms-ver">${e((window.FH_BRAND && FH_BRAND.name) || 'FamilyHub')}</p>`;
  return true;
}
function openSheet() {
  if (!buildSheet()) return;
  const s = sheet(); s.style.transform = ''; s.classList.add('show'); bg().classList.add('show'); document.body.classList.add('m-lock'); s.setAttribute('aria-hidden', 'false');
}
function closeSheet() {
  const s = sheet(); if (!s) return; s.style.transform = ''; s.classList.remove('show'); const b = bg(); if (b) b.classList.remove('show');
  document.body.classList.remove('m-lock'); s.setAttribute('aria-hidden', 'true');
}
function wireSheet() {
  const s = sheet(); if (!s || s._w) return; s._w = 1;
  bg().addEventListener('click', closeSheet);
  s.addEventListener('click', ev => {
    const t = ev.target.closest('[data-go],[data-act]'); if (!t) return;
    if (t.dataset.go) return go(t.dataset.go, t.dataset.tab);
    const a = t.dataset.act;
    if (a === 'theme') { if (typeof toggleTheme === 'function') toggleTheme(); t.setAttribute('aria-checked', document.body.classList.contains('dark')); t.querySelector('svg').outerHTML = svg(document.body.classList.contains('dark') ? IC.sun : IC.moon, 21); }
    else if (a === 'sync') { closeSheet(); if (typeof syncNow === 'function') syncNow(); }
    else if (a === 'out') { closeSheet(); if (typeof logout === 'function') logout(); }
  });
  // geser ke bawah pada gagang untuk menutup
  let y0 = 0, dy = 0, drag = false;
  const grab = s.querySelector('.grab');
  grab.addEventListener('touchstart', ev => { y0 = ev.touches[0].clientY; dy = 0; drag = true; s.style.transition = 'none'; }, { passive: true });
  grab.addEventListener('touchmove', ev => { if (!drag) return; dy = Math.max(0, ev.touches[0].clientY - y0); s.style.transform = `translateY(${dy}px)`; }, { passive: true });
  const end = () => { if (!drag) return; drag = false; s.style.transition = ''; if (dy > 80) closeSheet(); else s.style.transform = ''; };
  grab.addEventListener('touchend', end); grab.addEventListener('touchcancel', end);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && s.classList.contains('show')) closeSheet(); });
}

// ---------- Bottom nav & avatar ----------
document.addEventListener('click', ev => {
  const nb = ev.target.closest('#bnav button');
  if (nb) { const p = nb.dataset.p; if (p === 'menu') return openSheet(); closeSheet(); if (typeof showPage === 'function') showPage(p); return; }
  if (isMob() && ev.target.closest('#tbUserBtn')) { ev.stopImmediatePropagation(); ev.preventDefault(); openSheet(); }
}, true);
addEventListener('resize', () => { if (!isMob()) closeSheet(); });

// ---------- Beranda: sapaan + menu cepat ----------
function homeEnhance() {
  const d = $1('#dashboard'); if (!d || typeof ME === 'undefined' || !ME) return;
  $$('.m-greet,.qa', d).forEach(n => n.remove());
  const h = new Date().getHours(), sal = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  const g = document.createElement('div'); g.className = 'm-greet'; g.innerHTML = `<small>${sal} 👋</small><b>${e(ME.name)}</b>`;
  d.insertBefore(g, d.firstChild);
  const ui = window.UI && UI.ic ? UI.ic : (() => '');
  const Q = [['arisan', 'Iuran', 'receipt', '#6957ff'], ['laporan', 'Laporan', 'file', '#e0a23a'], ['agenda', 'Agenda', 'calendar', '#17b9a0'], ['silsilah', 'Silsilah', 'tree', '#3b8bff']];
  const q = document.createElement('div'); q.className = 'qa'; q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Menu cepat');
  q.innerHTML = Q.map(([id, lb, ic, c]) => `<button type="button" data-go="${id}" style="--c:${c}"><span class="qi">${ui(ic, 23)}</span>${lb}</button>`).join('');
  q.addEventListener('click', ev => { const b = ev.target.closest('[data-go]'); if (b && typeof showPage === 'function') showPage(b.dataset.go); });
  const k = d.querySelector('.dash-kpis'); if (k) k.after(q); else g.after(q);
}

// ---------- Tabel → kartu ----------
function enhanceTables(root) {
  $$('.page table.table', root || document).forEach(t => {
    const ths = $$('thead th', t); if (!ths.length) return;
    const labs = ths.map(th => { const c = th.cloneNode(true); $$('small', c).forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
    if (!t.classList.contains('m-cards')) { t.classList.add('m-cards'); t.setAttribute('role', 'table'); }
    $$('tbody tr,tfoot tr', t).forEach(tr => {
      if (tr._m && tr._m === tr.children.length) return; tr._m = tr.children.length;
      tr.setAttribute('role', 'row');
      let ci = 0;   // indeks kolom nyata (memperhitungkan colspan)
      [...tr.children].forEach((td, i) => {
        const col = ci; ci += td.colSpan || 1;
        if (td.tagName !== 'TD') return; td.setAttribute('role', 'cell');
        const lab = labs[col] || '', span = td.colSpan > 1;
        if (lab && !span) td.setAttribute('data-label', lab); else td.removeAttribute('data-label');
        td.classList.toggle('m-first', col === 0 && !span && !!td.querySelector('.fin-who,.ag-when,.mcell'));
        td.classList.toggle('m-empty', !span && /^[—–-]?$/.test(td.textContent.trim()) && !td.querySelector('button,a,svg,img,input'));
        td.classList.toggle('m-act', !lab && !span && !!td.querySelector('button,a') && !td.querySelector('.fin-who'));
      });
    });
  });
}

// ---------- Papan ketik, gulir, pengamat DOM ----------
const isField = n => n && /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) && !/^(checkbox|radio|button|submit|range|file)$/.test(n.type || '');
let kt = 0;
document.addEventListener('focusin', ev => { if (isMob() && isField(ev.target)) { clearTimeout(kt); document.body.classList.add('kbd'); } });
document.addEventListener('focusout', () => { clearTimeout(kt); kt = setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('kbd'); }, 120); });
let sc = 0; addEventListener('scroll', () => { if (sc) return; sc = requestAnimationFrame(() => { sc = 0; document.body.classList.toggle('m-scrolled', scrollY > 4); }); }, { passive: true });

let raf = 0; const refresh = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; syncNav(); enhanceTables(); }); };
function init() {
  mountBrand(); mountBack(); wireSheet(); paintThemeColor(); syncNav();
  const main = $1('.main'); if (main) new MutationObserver(refresh).observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  new MutationObserver(paintThemeColor).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const dot = $1('#notifDot'), bi = $1('#bnav [data-p=menu] i');
  if (dot && bi) { const f = () => { bi.hidden = dot.hidden; }; f(); new MutationObserver(f).observe(dot, { attributes: true, attributeFilter: ['hidden'] }); }
  refresh();
}
// Beranda dibungkus agar sapaan & menu cepat dipasang setiap kali dirender (mobile.js dimuat sebelum router.js)
if (typeof R !== 'undefined' && typeof R.dashboard === 'function') { const _d = R.dashboard; R.dashboard = async (...a) => { const r = await _d(...a); try { homeEnhance(); } catch (x) { console.error(x); } return r; }; }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
