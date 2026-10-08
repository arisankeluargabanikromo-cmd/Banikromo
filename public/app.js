const $ = s => document.querySelector(s), rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ini = n => String(n).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fd = (d, o = { day: '2-digit', month: 'short' }) => d ? new Date(d.length > 10 ? d : d + 'T00:00:00').toLocaleDateString('id-ID', o) : '—';
const ft = d => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const MONTH = m => new Date(m + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
const hero = (t, p, extra = '') => `<div class="hero"><div><h1>${t}</h1><p>${p}</p></div>${extra}</div>`;
let ME = null, MEMBERS = [], page = 'dashboard';
const isA = () => ME && ME.role === 'admin';
const adm = h => isA() ? h : '';

function toast(msg, ok) {
  const lm = $('#loginMsg'); if (lm && $('#loginBox').classList.contains('show')) { lm.textContent = msg; lm.className = 'loginmsg show' + (ok ? ' ok' : ''); }
  const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400); }
const guard = f => async (...a) => { try { return await f(...a); } catch (e) { if (e) console.error(e); } };

// ---------- Auth ----------
function showLogin() { $('#loginBox').classList.add('show'); }
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = $('#loginBtn'); $('#loginMsg').className = 'loginmsg';
  b.disabled = true; b.textContent = 'Memproses…';
  try { ME = await api('login', 'POST', f); $('#loginBox').classList.remove('show'); e.target.reset(); boot(); }
  catch (err) { if (err) { console.error(err); if (!$('#loginMsg').classList.contains('show')) toast('Gagal masuk: ' + (err.message || 'periksa koneksi & konfigurasi Supabase')); } }
  finally { b.disabled = false; b.textContent = 'Masuk'; }
};
async function logout() { if (!confirm('Keluar dari FamilyHub?')) return; await api('logout', 'POST'); location.reload(); }

// ---------- Navigasi ----------
const titles = { dashboard: 'Dashboard', arisan: 'Arisan', pengocokan: 'Pengocokan Digital', silsilah: 'Silsilah Keluarga', anggota: 'Anggota', keuangan: 'Keuangan', agenda: 'Agenda', galeri: 'Dokumentasi', pengumuman: 'Pengumuman', laporan: 'Laporan' };
const R = {};
function showPage(id, btn) {
  page = id; document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  (btn || [...document.querySelectorAll('.nav button')].find(b => b.getAttribute('onclick').includes(`'${id}'`))).classList.add('active');
  $('#pageTitle').textContent = titles[id]; window.scrollTo({ top: 0 }); guard(R[id])();
}
const reload = () => guard(R[page])();
function quickAdd() { ({ anggota: addMember, keuangan: addTx, agenda: addEvent, pengumuman: addAnn, galeri: addAlbum, silsilah: addMember }[page] || (() => toast('Gunakan tombol tambah di halaman terkait')))(); }

// ---------- Form modal generik ----------
function pickInput(f, v) {   // kolom cari-dan-pilih (datalist) agar tetap nyaman untuk ratusan anggota
  const cur = f.o.find(o => String(o[0]) === String(v));
  return `<input name="${f.k}" list="dl_${f.k}" autocomplete="off" placeholder="Ketik nama untuk mencari…" value="${esc(cur ? cur[1] : '')}"><datalist id="dl_${f.k}">${f.o.map(o => `<option value="${esc(o[1])}">`).join('')}</datalist>`;
}
function readForm(form, fields) {
  const o = Object.fromEntries(new FormData(form));
  for (const f of fields) if (f.t === 'pick') {
    const lab = (o[f.k] || '').trim(); if (!lab) { o[f.k] = ''; continue; }
    const hit = f.o.find(x => x[1] === lab); if (!hit) { toast('Pilih "' + f.l + '" dari daftar yang muncul'); throw 0; }
    o[f.k] = hit[0];
  }
  return o;
}
function openForm(title, fields, vals, onSave, onDel) {
  $('#fTitle').textContent = title;
  $('#fForm').innerHTML = fields.map(f => {
    const v = vals[f.k] ?? '', a = `name="${f.k}" ${f.req ? 'required' : ''}`;
    const inp = f.t === 'pick' ? pickInput(f, v) : f.t === 'select' ? `<select ${a}>${f.o.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
      : f.t === 'textarea' ? `<textarea ${a} rows="3">${esc(v)}</textarea>` : `<input type="${f.t || 'text'}" ${a} value="${esc(v)}" ${f.t === 'number' ? 'min="0"' : ''}>`;
    return `<label${f.half ? ' class="half"' : ''}>${f.l}${inp}</label>`;
  }).join('') + `<div class="row"><button type="button" class="ghost" onclick="closeForm()">Batal</button>${onDel ? '<button type="button" class="danger" id="fDel">Hapus</button>' : ''}<button class="primary">Simpan</button></div>`;
  $('#fForm').onsubmit = guard(async e => { e.preventDefault(); await onSave(readForm(e.target, fields)); closeForm(); toast('Tersimpan'); reload(); });
  if (onDel) $('#fDel').onclick = guard(async () => { if (confirm('Hapus data ini?')) { await onDel(); closeForm(); toast('Dihapus'); reload(); } });
  $('#formModal').classList.add('show');
}
const closeForm = () => $('#formModal').classList.remove('show');
const crud = (t, fields, title) => ({
  add: () => openForm('Tambah ' + title, fields, {}, b => api(t, 'POST', b)),
  edit: o => openForm('Ubah ' + title, fields, o, b => api(`${t}/${o.id}`, 'PUT', b), () => api(`${t}/${o.id}`, 'DELETE')),
});
const EVF = [{ k: 'date', l: 'Tanggal', t: 'date', req: 1 }, { k: 'time', l: 'Jam', t: 'time' }, { k: 'title', l: 'Kegiatan', req: 1 }, { k: 'location', l: 'Lokasi' }, { k: 'status', l: 'Status', t: 'select', o: ['Terjadwal', 'Selesai', 'Dibatalkan'] }];
const E = crud('events', EVF, 'Agenda'), addEvent = () => E.add();
const ANF = [{ k: 'title', l: 'Judul', req: 1 }, { k: 'body', l: 'Isi pengumuman', t: 'textarea' }], A = crud('announcements', ANF, 'Pengumuman'), addAnn = () => A.add();
const ALF = [{ k: 'title', l: 'Nama album', req: 1 }, { k: 'emoji', l: 'Emoji sampul' }], AL = crud('albums', ALF, 'Album'), addAlbum = () => AL.add();
let CACHE = {}; const edit = (c, k, id) => c.edit(CACHE[k].find(x => x.id === id));

// ---------- Profil ----------
const closeProfile = () => $('#profileModal').classList.remove('show');
$('#profileModal').addEventListener('click', e => { if (e.target.id === 'profileModal') closeProfile(); });
$('#formModal').addEventListener('click', e => { if (e.target.id === 'formModal') closeForm(); });

// ---------- Halaman ----------
R.dashboard = async () => {
  const d = await api('dashboard'), pct = d.members ? Math.round(d.paid / d.members * 100) : 0, cf = d.cashflow, mx = Math.max(1, ...cf.flatMap(c => [c.masuk, c.keluar]));
  const pts = k => cf.map((c, i) => `${cf.length > 1 ? i * 700 / (cf.length - 1) : 350},${200 - c[k] / mx * 180}`);
  const line = k => 'M' + pts(k).join(' L'), n = d.next;
  $('#dashboard').innerHTML = hero(`Selamat datang, ${esc(ME.name)} 👋`, 'Satu tempat untuk menjaga silaturahmi, transparansi arisan, dan cerita keluarga.', `<div class="hero-date"><strong>${String(new Date().getDate()).padStart(2, '0')}</strong><span>${MONTH(d.period).toUpperCase()}</span></div>`) + `
  <div class="grid4">${[['Saldo Kas', rp(d.saldo), '◆', d.funds ? `Arisan ${rp(d.funds.arisan)} • Wajib ${rp(d.funds.kas)}` : `Pemasukan ${rp(d.masuk)}`], ['Anggota Aktif', d.members, '♙', 'terdaftar di arisan'], ['Iuran ' + MONTH(d.period).split(' ')[0], pct + '%', '✓', `${d.paid} dari ${d.members} lunas arisan${(d.types || []).filter(x => x.code === 'wajib').map(x => ` • wajib ${x.paid}/${d.members}`).join('')}`], ['Arisan Berikutnya', n ? fd(n.date) : '—', '◷', n ? esc(n.title) : 'Belum ada agenda']]
      .map(s => `<div class="card stat"><div class="stat-top"><span class="stat-label">${s[0]}</span><div class="stat-icon">${s[2]}</div></div><h2>${s[1]}</h2><small>${s[3]}</small><div class="wave"></div></div>`).join('')}</div>
  <div class="content2"><div class="card chart-card"><div class="card-head"><h3>Arus Kas Arisan</h3><span>${cf.length} bulan terakhir</span></div><div class="chart">${cf.length ? `<svg viewBox="0 0 700 210" preserveAspectRatio="none"><path d="${line('masuk')}" fill="none" stroke="#6957ff" stroke-width="4"/><path d="${line('keluar')}" fill="none" stroke="#22c7a9" stroke-width="3" stroke-dasharray="7 6"/></svg>` : ''}</div><div class="legend"><span><i></i>Pemasukan</span><span><i class="g"></i>Pengeluaran</span></div></div>
  <div class="card next"><div class="card-head" style="padding:0 0 18px"><h3>Arisan berikutnya</h3></div>${n ? `<div class="event-date"><div class="datebox"><small>${fd(n.date, { month: 'short' }).toUpperCase()}</small><b>${n.date.slice(8)}</b></div><div><h4>${esc(n.title)}</h4><p>${esc(n.location || '')} • ${esc(n.time || '')}</p></div></div>` : '<p>Belum ada agenda mendatang.</p>'}<div class="progress"><span style="width:${pct}%"></span></div><div class="split"><span>${d.paid}/${d.members} iuran masuk</span><b style="color:#22a98f">${pct}%</b></div><button class="primary" style="width:100%;margin-top:18px" onclick="showPage('arisan')">Lihat detail arisan</button></div></div>
  <div class="content2"><div class="card activity"><div class="card-head"><h3>Aktivitas terbaru</h3></div>${d.activity.map(a => `<div class="activity-row"><div class="activity-icon">${esc(a.icon)}</div><div class="activity-text"><b>${esc(a.text)}</b><span>${esc(a.detail)} • ${ft(a.at)}</span></div></div>`).join('')}</div>
  <div class="card members"><div class="card-head"><h3>Anggota terbaru</h3><span>${d.members} ANGGOTA</span></div>${d.recent.map(m => `<div class="member-row"><div class="avatar">${ini(m.name)}</div><div class="member-info"><b>${esc(m.name)}</b><span>${esc(m.relation || '')} • Generasi ${m.generation}</span></div></div>`).join('')}</div></div>`;
};
// R.arisan & R.keuangan ada di finance.js; R.laporan ada di report.js
R.agenda = async () => {
  const ev = CACHE.ev = await api('events');
  $('#agenda').innerHTML = hero('Agenda Keluarga', 'Semua acara keluarga dalam satu kalender.') + `<div class="card"><div class="card-head"><h3>Daftar acara</h3>${adm('<button class="primary" onclick="addEvent()">＋ Agenda</button>')}</div><table class="table"><thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Lokasi</th><th>Status</th><th></th></tr></thead><tbody>${ev.map(e => `<tr><td><b>${fd(e.date)}</b> ${esc(e.time || '')}</td><td>${esc(e.title)}</td><td>${esc(e.location || '—')}</td><td><span class="status ${e.status == 'Terjadwal' ? '' : 'pending'}">${esc(e.status)}</span></td><td>${adm(`<button class="btn-s" onclick="edit(E,'ev',${e.id})">Ubah</button>`)}</td></tr>`).join('')}</tbody></table></div>`;
};
R.galeri = async () => {
  const al = CACHE.al = await api('albums');
  $('#galeri').innerHTML = hero('Dokumentasi Keluarga', 'Kenangan keluarga tersimpan rapi dalam album.') + `${adm('<div class="toolbar"><button class="primary" onclick="addAlbum()">＋ Album</button></div>')}<div class="grid4">${al.map(a => `<div class="card album"><div>${esc(a.emoji)}<small>${esc(a.title)}</small></div>${adm(`<button class="btn-s x" onclick="edit(AL,'al',${a.id})">Ubah</button>`)}</div>`).join('')}</div>`;
};
R.pengumuman = async () => {
  const an = CACHE.an = await api('announcements');
  $('#pengumuman').innerHTML = hero('Pengumuman', 'Informasi penting untuk seluruh anggota keluarga.') + `${adm('<div class="toolbar"><button class="primary" onclick="addAnn()">＋ Pengumuman</button></div>')}<div class="card activity">${an.map(a => `<div class="activity-row"><div class="activity-icon">!</div><div class="activity-text" style="flex:1"><b>${esc(a.title)}</b>${a.body ? `<p style="margin:2px 0 4px">${esc(a.body)}</p>` : ''}<span>${esc(a.author)} • ${fd(a.date, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>${adm(`<button class="btn-s" onclick="edit(A,'an',${a.id})">Ubah</button>`)}</div>`).join('') || '<div class="activity-row">Belum ada pengumuman.</div>'}</div>`;
};

// ---------- Tema & boot ----------
function toggleTheme() {
  const d = document.body.classList.toggle('dark'); localStorage.setItem('familyhub-theme', d ? 'dark' : 'light');
  document.querySelector('.actions .icon-btn:nth-child(2)').textContent = d ? '☀' : '◐'; toast(d ? 'Mode gelap aktif' : 'Mode terang aktif');
}
if (localStorage.getItem('familyhub-theme') === 'dark') { document.body.classList.add('dark'); document.querySelector('.actions .icon-btn:nth-child(2)').textContent = '☀'; }
function boot() {
  const mu = $('.mini-user'); mu.innerHTML = `<div class="avatar">${ini(ME.name)}</div><div><b style="font-size:11px">${esc(ME.name)}</b><small style="display:block;color:#858ca0;font-size:9px">${isA() ? 'Admin keluarga' : 'Anggota (lihat saja)'} • keluar</small></div>`; mu.style.cursor = 'pointer'; mu.onclick = logout;
  $('.actions .primary').style.display = isA() ? '' : 'none'; showPage(page);
}
api('me').then(u => { ME = u; boot(); }).catch(() => { });
