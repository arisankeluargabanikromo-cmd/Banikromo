// ============================================================
// Dashboard v3.1 — kartu Kalender • Agenda Keluarga • Pengumuman
//   Memakai data & form yang sama dengan halaman Agenda/Pengumuman (tabel events & announcements).
//   Kalender: navigasi bulan, penanda per hari, klik hari -> daftar acara hari itu.
//   Agenda: acara mendatang (dengan hitung mundur) / terlewat; klik -> rincian + tambah ke Google Kalender.
//   Pengumuman: terbaru, penanda "Baru", klik -> isi lengkap.
// ============================================================
(() => {
const DC = { ev: [], an: [], y: 0, m: 0, sel: '', tab: 'next', init: false };
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayS = () => ymd(new Date());
const dayDiff = s => Math.round((new Date(s + 'T00:00:00') - new Date(todayS() + 'T00:00:00')) / 864e5);
const rel = s => { const n = dayDiff(s); return n === 0 ? 'Hari ini' : n === 1 ? 'Besok' : n > 1 ? `${n} hari lagi` : n === -1 ? 'Kemarin' : `${-n} hari lalu`; };
const stc = s => s === 'Selesai' ? 's' : s === 'Dibatalkan' ? 'x' : 't';
const tm = e => { const m = /^(\d{1,2})[:.](\d{2})/.exec(e.time || ''); return m ? `${pad(+m[1])}:${m[2]}` : (e.time || ''); };
const evBy = () => DC.ev.reduce((o, e) => ((o[e.date] = o[e.date] || []).push(e), o), {});
const WD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const dbx = s => `<div class="dbx"><small>${esc(fd(s, { month: 'short' }).toUpperCase())}</small><b>${s.slice(8)}</b></div>`;
const stPill = e => `<span class="status ${e.status === 'Terjadwal' ? '' : e.status === 'Selesai' ? 'done' : 'bad'}">${esc(e.status)}</span>`;

// ---------------- Kalender ----------------
function calHtml() {
  const { y, m } = DC, lead = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), weeks = Math.ceil((lead + dim) / 7), by = evBy(), t = todayS();
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(y, m, 1 - lead + i), s = ymd(d), es = by[s] || [];
    cells += `<button class="cd${d.getMonth() !== m ? ' o' : ''}${s === t ? ' td' : ''}${s === DC.sel ? ' sl' : ''}${d.getDay() === 0 ? ' sun' : ''}" onclick="calPick('${s}')" aria-label="${esc(fd(s, { weekday: 'long', day: 'numeric', month: 'long' }))}${es.length ? ', ' + es.length + ' agenda' : ''}"${es.length ? ` title="${esc(es.map(e => e.title).join(' • '))}"` : ''}><span>${d.getDate()}</span><i class="dots">${es.slice(0, 3).map(e => `<b class="ev-${stc(e.status)}"></b>`).join('')}</i></button>`;
  }
  const es = by[DC.sel] || [], inMonth = DC.ev.filter(e => e.date.startsWith(`${y}-${pad(m + 1)}`)).length;
  return `<div class="card-head"><div><h3>Kalender</h3><span>${esc(new Date(y, m, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase())} · ${inMonth} AGENDA</span></div>
    <div class="cal-nav"><button onclick="calNav(-1)" aria-label="Bulan sebelumnya">‹</button><button class="tdy" onclick="calToday()">Hari ini</button><button onclick="calNav(1)" aria-label="Bulan berikutnya">›</button></div></div>
  <div class="cal-w">${WD.map((w, i) => `<span class="${i === 6 ? 'sun' : ''}">${w}</span>`).join('')}</div><div class="cal-g">${cells}</div>
  <div class="cal-sel"><div class="cs-h"><b>${esc(fd(DC.sel, { weekday: 'long', day: 'numeric', month: 'long' }))}</b><small>${rel(DC.sel)}</small></div>
    ${es.length ? es.map(e => `<button class="evr" onclick="showEvent(${e.id})"><span class="tmx">${esc(tm(e) || 'Seharian')}</span><b>${esc(e.title)}</b>${stPill(e)}</button>`).join('') : `<p class="cs-e">Tidak ada agenda pada hari ini.${adm(` <button class="btn-s" onclick="addEventOn('${DC.sel}')">＋ Tambah agenda</button>`)}</p>`}</div>`;
}
const drawCal = () => { const c = $('#calCard'); if (c) c.innerHTML = calHtml(); };
window.calNav = n => { const d = new Date(DC.y, DC.m + n, 1); DC.y = d.getFullYear(); DC.m = d.getMonth(); drawCal(); };
window.calToday = () => { const d = new Date(); DC.y = d.getFullYear(); DC.m = d.getMonth(); DC.sel = todayS(); drawCal(); };
window.calPick = s => { DC.sel = s; const d = new Date(s + 'T00:00:00'); DC.y = d.getFullYear(); DC.m = d.getMonth(); drawCal(); };
window.addEventOn = s => openForm('Tambah Agenda', EVF, { date: s }, b => api('events', 'POST', b));

// ---------------- Agenda Keluarga ----------------
function agHtml() {
  const t = todayS(), next = DC.ev.filter(e => e.status === 'Terjadwal' && e.date >= t), past = DC.ev.filter(e => !(e.status === 'Terjadwal' && e.date >= t)).reverse();
  const list = DC.tab === 'next' ? next.slice(0, 5) : past.slice(0, 5), f = DC.tab === 'next' ? list[0] : null, rest = f ? list.slice(1) : list;
  const row = e => `<button class="ag-row${e.status === 'Dibatalkan' ? ' x' : ''}" onclick="showEvent(${e.id})">${dbx(e.date)}<div class="ag-t"><b>${esc(e.title)}</b><small>${esc([tm(e), e.location].filter(Boolean).join(' · ') || 'Seharian')}</small></div>${DC.tab === 'next' ? `<span class="ag-rel">${rel(e.date)}</span>` : stPill(e)}</button>`;
  const hero = f ? `<button class="ag-hero" onclick="showEvent(${f.id})"><div class="ah-top"><span class="ah-k">ACARA BERIKUTNYA</span><span class="ah-rel">${rel(f.date)}</span></div><div class="ah-body">${dbx(f.date)}<div><b>${esc(f.title)}</b><span>${f.time ? '⏰ ' + esc(tm(f)) : '⏰ Seharian'}${f.location ? ' &nbsp;·&nbsp; 📍 ' + esc(f.location) : ''}</span></div></div></button>` : '';
  return `<div class="card-head"><div><h3>Agenda Keluarga</h3><span>${next.length} ACARA MENDATANG</span></div>${adm('<button class="btn-s ic" onclick="addEvent()" title="Tambah agenda">＋ Agenda</button>')}</div>
  <div class="ag-tabs"><div class="seg sm"><button class="${DC.tab === 'next' ? 'on' : ''}" onclick="agTab('next')">Mendatang</button><button class="${DC.tab === 'past' ? 'on' : ''}" onclick="agTab('past')">Terlewat</button></div></div>
  ${hero}<div class="ag-list">${rest.map(row).join('') || (f ? '' : `<p class="dc-empty">${DC.tab === 'next' ? 'Belum ada agenda mendatang.' : 'Belum ada agenda terlewat.'}${DC.tab === 'next' ? adm(' <button class="btn-s" onclick="addEvent()">＋ Tambah agenda</button>') : ''}</p>`)}</div>
  <button class="dc-all" onclick="showPage('agenda')">Lihat semua agenda →</button>`;
}
window.agTab = t => { DC.tab = t; const c = $('#agCard'); if (c) c.innerHTML = agHtml(); };

// ---------------- Pengumuman ----------------
function anHtml() {
  const list = DC.an.slice(0, 4), fresh = a => a.date && -dayDiff(a.date) <= 7;
  return `<div class="card-head"><div><h3>Pengumuman</h3><span>${DC.an.length} PENGUMUMAN</span></div>${adm('<button class="btn-s ic" onclick="addAnn()" title="Tambah pengumuman">＋ Pengumuman</button>')}</div>
  <div class="an-list">${list.map(a => `<button class="an-row" onclick="showAnn(${a.id})"><span class="an-ic">📢</span><div><b>${esc(a.title)}${fresh(a) ? ' <em class="new">Baru</em>' : ''}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}<small>${esc(a.author || 'Admin')} · ${esc(fd(a.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</small></div></button>`).join('') || `<p class="dc-empty">Belum ada pengumuman.${adm(' <button class="btn-s" onclick="addAnn()">＋ Buat pengumuman</button>')}</p>`}</div>
  <button class="dc-all" onclick="showPage('pengumuman')">Lihat semua pengumuman →</button>`;
}

// ---------------- Rincian (dialog) ----------------
const gcal = e => {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE', d = e.date.replace(/-/g, ''), m = /^(\d{1,2})[:.](\d{2})/.exec(e.time || '');
  let dates; if (m) { const st = new Date(`${e.date}T${pad(+m[1])}:${m[2]}:00`), en = new Date(st.getTime() + 36e5), f = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`; dates = f(st) + '/' + f(en); }
  else { const n = new Date(e.date + 'T00:00:00'); n.setDate(n.getDate() + 1); dates = d + '/' + ymd(n).replace(/-/g, ''); }
  return `${base}&text=${encodeURIComponent(e.title)}&dates=${dates}${e.location ? '&location=' + encodeURIComponent(e.location) : ''}&details=${encodeURIComponent('Agenda Keluarga — FamilyHub')}`;
};
window.showEvent = id => {
  const e = DC.ev.find(x => x.id === id); if (!e) return;
  modal2('evModal', `<div class="modal-top"><b>Rincian agenda</b><button class="close" onclick="closeModal2('evModal')">×</button></div>
  <div class="evd"><div class="evd-h">${dbx(e.date)}<div><h3>${esc(e.title)}</h3>${stPill(e)}</div></div>
    <div class="evd-r"><span>🗓</span><div><b>${esc(fd(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</b><small>${rel(e.date)}</small></div></div>
    <div class="evd-r"><span>⏰</span><div><b>${esc(tm(e) || 'Seharian')}</b></div></div>
    ${e.location ? `<div class="evd-r"><span>📍</span><div><b>${esc(e.location)}</b><a class="maplink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}" target="_blank" rel="noopener">🗺 Buka di peta ↗</a></div></div>` : ''}
    <div class="row"><a class="primary dc-btn" href="${gcal(e)}" target="_blank" rel="noopener">📅 Tambah ke Google Kalender</a>${adm(`<button class="ghost" onclick="closeModal2('evModal');edit(E,'ev',${e.id})">✎ Ubah</button>`)}</div></div>`, 'dc-box');
};
window.showAnn = id => {
  const a = DC.an.find(x => x.id === id); if (!a) return;
  modal2('annModal', `<div class="modal-top"><b>Pengumuman</b><button class="close" onclick="closeModal2('annModal')">×</button></div>
  <div class="evd"><h3 class="an-h">${esc(a.title)}</h3><small class="an-m">${esc(a.author || 'Admin')} · ${esc(fd(a.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</small>
    <div class="an-body">${a.body ? esc(a.body) : '<span class="muted">Tidak ada isi tambahan.</span>'}</div>
    <div class="row"><button class="ghost" onclick="closeModal2('annModal')">Tutup</button>${adm(`<button class="primary" onclick="closeModal2('annModal');edit(A,'an',${a.id})">✎ Ubah</button>`)}</div></div>`, 'dc-box');
};

// ---------------- Pasang ke dashboard ----------------
const prev = R.dashboard;
R.dashboard = async () => {
  const pf = Promise.all([api('events'), api('announcements')]).catch(() => null);
  await prev(); const r = await pf, g = $('#dashboard .grid4'); if (!g) return;
  if (!r) return g.insertAdjacentHTML('afterend', '<div class="card dc-warn">Kalender, agenda, dan pengumuman tidak dapat dimuat saat ini. <button class="btn-s" onclick="reload()">Coba lagi</button></div>');
  DC.ev = r[0] || []; DC.an = r[1] || []; CACHE.ev = DC.ev; CACHE.an = DC.an;
  if (!DC.init) { const d = new Date(); DC.y = d.getFullYear(); DC.m = d.getMonth(); DC.sel = todayS(); DC.init = true; }
  g.insertAdjacentHTML('afterend', `<section class="dcards"><div class="card dc cal" id="calCard">${calHtml()}</div><div class="card dc ag" id="agCard">${agHtml()}</div><div class="card dc an" id="anCard">${anHtml()}</div></section>`);
};
})();
