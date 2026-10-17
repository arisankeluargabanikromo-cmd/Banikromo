const $ = s => document.querySelector(s), rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ini = n => String(n).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fd = (d, o = { day: '2-digit', month: 'short' }) => d ? new Date(d.length > 10 ? d : d + 'T00:00:00').toLocaleDateString('id-ID', o) : '—';
const ft = d => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
// Arisan berjalan per PUTARAN (bukan per bulan). Kunci periode: 'YYYY-MM' = bulan (iuran bulanan); selain itu / kunci putaran = nomor putaran.
let ROUNDS = {};                       // kunci putaran -> {period, seq, title, status, held_on}; diisi dari setiap respons server yang memuat 'rounds'
const setRounds = a => { if (Array.isArray(a)) { ROUNDS = {}; a.forEach(r => { ROUNDS[r.period] = r; }); } };
const isMonthKey = k => /^\d{4}-\d{2}$/.test(k || '');
const PER = k => ROUNDS[k] ? 'Putaran ' + ROUNDS[k].seq : (k || '—');                                    // "Putaran 7"
const PERX = k => { const r = ROUNDS[k]; return r ? 'Putaran ' + r.seq + (r.title ? ' · ' + r.title : '') : (k || '—'); };
const MONTH = m => isMonthKey(m) ? new Date(m + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : PER(m);
const FP = (t, k) => t && t.schedule === 'putaran' ? PER(k) : MONTH(k);                                    // label periode menurut jadwal jenis iuran
const UNIT = t => t && t.schedule === 'putaran' ? 'putaran' : 'bulan';                                    // satuan tagihan
const hero = (t, p, extra = '') => `<div class="hero"><div><h1>${t}</h1><p>${p}</p></div>${extra}</div>`;
let ME = null, MEMBERS = [], page = 'dashboard';
const isA = () => ME && ME.role === 'admin';
const adm = h => isA() ? h : '';
const isM = () => ME && (ME.role === 'admin' || ME.role === 'pengelola');       // boleh mengelola anggota & silsilah
const mgr = h => isM() ? h : '';
const ROLE_LBL = { admin: 'Admin keluarga', pengelola: 'Pengelola Silsilah', viewer: 'Anggota (lihat saja)' };

function toast(msg, ok) {
  const lm = $('#loginMsg'); if (lm && $('#loginBox').classList.contains('show')) { lm.textContent = msg; lm.className = 'loginmsg show' + (ok ? ' ok' : ''); }
  const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400); }
const guard = f => async (...a) => { try { return await f(...a); } catch (e) { if (e) console.error(e); } };

// ---------- Auth ----------
function showLogin() { $('#loginBox').classList.add('show'); }
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); if (SIGNUP) return doSignup();      // tombol Enter saat mode pendaftaran = kirim pendaftaran
  const f = Object.fromEntries(new FormData(e.target)), b = $('#loginBtn'); $('#loginMsg').className = 'loginmsg';
  b.disabled = true; b.textContent = 'Memproses…';
  try { ME = await api('login', 'POST', f); $('#loginBox').classList.remove('show'); e.target.reset(); enter(); }
  catch (err) { if (err) { console.error(err); if (!$('#loginMsg').classList.contains('show')) toast('Gagal masuk: ' + (err.message || 'periksa koneksi & konfigurasi Supabase')); } }
  finally { b.disabled = false; b.textContent = 'Masuk'; }
};
async function logout() { if (!confirm('Keluar dari FamilyHub?')) return; await api('logout', 'POST'); location.replace('/'); }

// ---------- Navigasi ----------
const titles = { dashboard: 'Dashboard', arisan: 'Arisan', silsilah: 'Silsilah Keluarga', anggota: 'Anggota', keuangan: 'Keuangan', agenda: 'Agenda', galeri: 'Dokumentasi', pengumuman: 'Pengumuman', laporan: 'Laporan' };
const THEME_ICON = {
  light: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/></svg>',
  dark: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>' };
const paintThemeBtn = () => { const b = document.querySelector('#themeBtn'); if (b) b.innerHTML = document.body.classList.contains('dark') ? THEME_ICON.dark : THEME_ICON.light; };
const R = {};
function showPage(id, btn) {
  page = id; document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.nav button').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
  const cur = btn || [...document.querySelectorAll('.nav button')].find(b => b.getAttribute('onclick').includes(`'${id}'`));
  if (cur) { cur.classList.add('active'); cur.setAttribute('aria-current', 'page'); }
  $('#pageTitle').textContent = titles[id]; window.scrollTo({ top: 0 });
  if (typeof R[id] !== 'function') { console.error('Halaman "' + id + '" belum siap (skrip belum dimuat)'); return; }
  guard(R[id])();
}
const reload = () => guard(R[page])();

// Tutup modal saat klik latar gelap, dengan dua pengaman:
// 1) hanya jika tombol mouse ditekan DAN dilepas di latar (seret/sorot teks lalu lepas di luar tidak menutup);
// 2) modal yang berisi kolom isian (input/textarea/select) TIDAK pernah ditutup lewat klik latar,
//    supaya data yang sedang diketik tidak hilang. Tutup lewat tombol × / Batal / Esc.
function backdropClose(el, fn) {
  let down = false;
  el.addEventListener('pointerdown', e => { down = e.target === el; });
  el.addEventListener('click', e => {
    const ok = down && e.target === el; down = false;
    if (!ok || el.querySelector('input:not([type=hidden]),textarea,select')) return;
    fn();
  });
}
// Esc menutup modal form yang sedang terbuka
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = document.querySelector('#formModal.show'); if (m) closeForm(); } });

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
// Satu kolom isian (label + input). f.h = teks bantuan kecil di bawah label. Dipakai openForm & form anggota (memberform.js).
function fieldHtml(f, val) {
  if (f.t === 'note') return `<p class="fnote2">${f.l}</p>`;
  const v = val ?? '', a = `name="${f.k}" ${f.req ? 'required' : ''}`;
  const inp = f.t === 'pick' ? pickInput(f, v) : f.t === 'select' ? `<select ${a}>${f.o.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
    : f.t === 'textarea' ? `<textarea ${a} rows="3">${esc(v)}</textarea>` : `<input type="${f.t || 'text'}" ${a} value="${esc(v)}" ${f.t === 'number' ? 'min="0"' : ''}>`;
  return `<label${f.half ? ' class="half"' : ''}><span class="fl">${f.l}</span>${f.h ? `<small class="fh">${f.h}</small>` : ''}${inp}</label>`;
}
function openForm(title, fields, vals, onSave, onDel) {
  $('#fTitle').textContent = title;
  $('#fForm').innerHTML = fields.map(f => fieldHtml(f, vals[f.k])).join('') + `<div class="row"><button type="button" class="ghost" onclick="closeForm()">Batal</button>${onDel ? '<button type="button" class="danger" id="fDel">Hapus</button>' : ''}<button class="primary">Simpan</button></div>`;
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
const closeProfile = () => { if (window.mfGuard && !mfGuard()) return; $('#profileModal').classList.remove('show'); };   // mfGuard: tanya dulu bila form anggota punya perubahan belum disimpan
backdropClose($('#profileModal'), closeProfile);
backdropClose($('#formModal'), closeForm);

// ---------- Halaman ----------
R.dashboard = async () => {
  const d = await api('dashboard'), pct = d.members ? Math.round(d.paid / d.members * 100) : 0, n = d.next, cf = d.cashflow || [];
  const wj = (d.types || []).filter(x => x.code === 'wajib')[0], rows = cf.map(c => ({ m: c.m, in: c.masuk, out: c.keluar })), tin = rows.reduce((s, r) => s + r.in, 0), tout = rows.reduce((s, r) => s + r.out, 0);
  const FEED = { '⚡': ['bolt', '#6957ff'], '💰': ['receipt', '#17a98a'], '✏': ['edit', '#3b8bff'], '✗': ['x', '#e5484d'], '↩': ['back', '#e0a23a'], '↺': ['back', '#e0a23a'], '🎉': ['check', '#17a98a'] };
  const feed = (d.activity || []).map(a => { const [i, c] = FEED[[...String(a.icon || '')][0]] || ['dot', '#8a94a8']; return `<div class="feed-row"><span class="feed-ic" style="--c:${c}">${UI.ic(i, 18)}</span><div class="feed-tx"><b>${esc(a.text)}</b><span>${esc(a.detail || '')}</span></div><span class="feed-t">${ft(a.at)}</span></div>`; }).join('');
  $('#dashboard').innerHTML = hero(`Selamat datang, ${esc(ME.name)}`, 'Satu tempat untuk menjaga silaturahmi, transparansi arisan, dan cerita keluarga.', `<div class="hero-date"><strong>${String(new Date().getDate()).padStart(2, '0')}</strong><span>${MONTH(d.month).toUpperCase()}</span></div>`) + `
  <div class="fin-kpis grid4 dash-kpis">
   ${UI.kpi('k-total', 'Saldo kas', 'wallet', UI.money(d.saldo), 'Dana Arisan + Kas Wajib', d.funds ? `<div class="kpi-flow"><span>Arisan <b>${rp(d.funds.arisan)}</b></span><span>Wajib <b>${rp(d.funds.kas)}</b></span></div>` : '')}
   ${UI.kpi('k-kas', 'Anggota aktif', 'users', `${d.members} <small>orang</small>`, 'Terdaftar di arisan')}
   ${UI.kpi(d.round ? (pct >= 80 ? 'k-ok' : 'k-arisan') : 'k-flat', d.round ? 'Iuran ' + PER(d.period) : 'Iuran arisan', 'target', d.round ? `${pct}<small>%</small>` : '—', d.round ? `<span>${d.paid} dari ${d.members} lunas${wj ? ` • wajib ${wj.paid}/${d.members}` : ''}</span>` : 'Belum ada putaran aktif', d.round ? UI.progress(pct, pct >= 80 ? '#17b9a0' : '#6957ff') : '')}
   ${UI.kpi('k-flat', 'Arisan berikutnya', 'calendar', n ? fd(n.date) : '—', n ? `<span><b>${esc(n.title)}</b> • ${UI.rel(n.date)}</span>` : 'Belum ada agenda mendatang', '', n ? '#e0a23a' : '#8a94a8')}
  </div>
  <div class="dash-split">
   <div class="card chart-card">${UI.head('Arus kas 6 bulan terakhir', 'Pemasukan dan pengeluaran per bulan, dalam rupiah')}<div class="fin-chartbox">${UI.barChart(rows, { inColor: '#17b9a0', outColor: '#f0996b', label: 'Arus kas 6 bulan' })}</div>
    ${rows.length ? `<div class="legend"><span><i style="background:#17b9a0"></i>Pemasukan</span><span><i style="background:#f0996b"></i>Pengeluaran</span></div><div class="fin-sumrow"><div><small>Total masuk</small><b class="in">${rp(tin)}</b></div><div><small>Total keluar</small><b class="out">${rp(tout)}</b></div><div><small>Selisih</small><b class="${tin - tout < 0 ? 'out' : 'in'}">${tin - tout < 0 ? '−' : '+'}${rp(Math.abs(tin - tout))}</b></div></div>` : ''}<div style="height:18px"></div></div>
   <div class="card">${UI.head(d.round ? 'Status iuran ' + PER(d.period) : 'Status iuran', d.round ? `${d.members} anggota terdaftar` : 'Belum ada putaran aktif')}
    ${d.round ? `<div class="dash-next" style="padding-top:0"><div class="dash-prog" style="margin-top:0"><div class="split"><span>Iuran Arisan</span><b>${pct}%</b></div><div class="progress"><span style="width:${pct}%"></span></div><small class="muted">${d.paid} dari ${d.members} anggota lunas</small></div>${wj ? `<div class="dash-prog"><div class="split"><span>Iuran Wajib</span><b>${d.members ? Math.round(wj.paid / d.members * 100) : 0}%</b></div><div class="progress"><span style="width:${d.members ? Math.round(wj.paid / d.members * 100) : 0}%;background:#17b9a0"></span></div><small class="muted">${wj.paid} dari ${d.members} anggota lunas</small></div>` : ''}<button class="primary fin-cta" onclick="showPage('arisan')">Lihat detail arisan ${UI.ic('next', 16)}</button></div>`
      : UI.empty('target', 'Belum ada putaran aktif', 'Iuran dapat dicatat setelah admin membuka putaran arisan.', `<button class="btn-s" onclick="showPage('arisan')">Buka halaman arisan</button>`)}</div>
  </div>
  <div class="dash-split">
   <div class="card activity">${UI.head('Aktivitas terbaru', 'Catatan perubahan terakhir di aplikasi')}<div class="feed">${feed || UI.empty('clock', 'Belum ada aktivitas')}</div></div>
   <div class="card members">${UI.head('Anggota terbaru', `${d.members} anggota aktif`, `<button class="btn-s" onclick="showPage('anggota')">Lihat semua</button>`)}<div class="mini-list">${(d.recent || []).map(m => `<div class="row">${UI.who(m.name, `${m.relation || '—'} • Generasi ${m.generation}`)}</div>`).join('') || UI.empty('users', 'Belum ada anggota')}</div></div>
  </div>`;
};
// R.arisan & R.keuangan ada di finance.js; R.laporan ada di report.js
// ---------- Agenda ----------
const AG = { f: 'all', q: '' }, ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const agPast = e => e.date < ymd(new Date()) || e.status === 'Selesai';
window.agF = k => { AG.f = k; agDraw(); }; window.agQ = v => { AG.q = v; agDraw(); };
function agDraw() {
  const ev = CACHE.ev || [], q = AG.q.toLowerCase(), up = ev.filter(e => !agPast(e)).sort((a, b) => a.date.localeCompare(b.date)), ps = ev.filter(agPast).sort((a, b) => b.date.localeCompare(a.date));
  const list = (AG.f === 'up' ? up : AG.f === 'past' ? ps : [...up, ...ps]).filter(e => !q || (e.title + ' ' + (e.location || '')).toLowerCase().includes(q));
  const tone = e => e.status === 'Dibatalkan' ? 'bad' : agPast(e) ? 'mute' : 'ok';
  $('#agSeg').innerHTML = UI.seg([['all', 'Semua', ev.length], ['up', 'Mendatang', up.length], ['past', 'Selesai', ps.length]], AG.f, 'agF');
  $('#agBody').innerHTML = list.map(e => `<tr><td><div class="ag-when"><div class="datebadge"><small>${esc(fd(e.date, { month: 'short' }))}</small><b>${e.date.slice(8)}</b></div><div><b>${esc(fd(e.date, { weekday: 'long' }))}</b><small class="sub">${e.date.slice(0, 4)}${e.time ? ' • ' + esc(e.time) : ''}</small></div></div></td>
    <td><div class="ag-title"><b>${esc(e.title)}</b>${e.location ? `<small>${UI.ic('pin', 13)}${esc(e.location)}</small>` : ''}</div></td>
    <td>${UI.pill(tone(e), esc(e.status || 'Terjadwal'))}<small class="sub">${agPast(e) ? '' : UI.rel(e.date)}</small></td>
    <td class="nw">${adm(`<button class="btn-s" onclick="edit(E,'ev',${e.id})">${UI.ic('edit', 13)} Ubah</button>`)}</td></tr>`).join('') || `<tr><td colspan="4">${UI.empty('calendar', q || AG.f !== 'all' ? 'Tidak ada acara yang cocok' : 'Belum ada agenda', q || AG.f !== 'all' ? 'Ubah kata kunci atau filter.' : 'Tambahkan acara keluarga pertama Anda.')}</td></tr>`;
  $('#agFoot').textContent = `Menampilkan ${list.length} dari ${ev.length} acara`;
}
R.agenda = async () => {
  const ev = CACHE.ev = await api('events'), today = ymd(new Date()), mo = today.slice(0, 7), up = ev.filter(e => !agPast(e)).sort((a, b) => a.date.localeCompare(b.date)), nx = up[0];
  $('#agenda').innerHTML = hero('Agenda Keluarga', 'Semua acara keluarga dalam satu tempat.') + `
  <div class="fin-kpis">
   ${UI.kpi('k-arisan', 'Acara mendatang', 'calendar', `${up.length} <small>acara</small>`, nx ? `<span>Berikutnya: <b>${esc(nx.title)}</b> • ${UI.rel(nx.date)}</span>` : 'Belum ada acara terjadwal')}
   ${UI.kpi('k-kas', 'Bulan ini', 'clock', `${ev.filter(e => e.date.slice(0, 7) === mo).length} <small>acara</small>`, MONTH(mo))}
   ${UI.kpi('k-flat', 'Sudah selesai', 'check', `${ev.filter(agPast).length} <small>acara</small>`, 'Riwayat kegiatan keluarga')}
  </div>
  <div class="card">${UI.head('Daftar acara', 'Urut dari yang paling dekat', adm(`<button class="primary" onclick="addEvent()">${UI.ic('plus', 16)} Agenda</button>`))}
   <div class="fin-bar"><div id="agSeg"></div>${UI.searchBox('agq', 'Cari kegiatan atau lokasi…', AG.q, 'agQ')}</div>
   <div class="tscroll"><table class="table fin-table"><thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Status</th><th></th></tr></thead><tbody id="agBody"></tbody></table></div><div class="fin-foot" id="agFoot"></div></div>`;
  agDraw();
};
R.galeri = async () => {
  const al = CACHE.al = await api('albums');
  $('#galeri').innerHTML = hero('Dokumentasi Keluarga', 'Kenangan keluarga tersimpan rapi dalam album.') + `<div class="card">${UI.head('Album keluarga', `${al.length} album`, adm(`<button class="primary" onclick="addAlbum()">${UI.ic('plus', 16)} Album</button>`))}<div class="alb-grid">${al.map(a => `<div class="alb" style="--c:hsl(${UI.hue(a.title)} 70% 55%)"><div class="alb-cv">${esc(a.emoji)}</div><div class="alb-bd"><div><b>${esc(a.title)}</b></div></div></div>`).join('') || UI.empty('image', 'Belum ada album')}</div></div>`;
};
// ---------- Pengumuman ----------
const AN = { q: '' };
window.anQ = v => { AN.q = v; anDraw(); };
const daysAgo = d => Math.round((new Date(ymd(new Date()) + 'T00:00:00') - new Date(d + 'T00:00:00')) / 864e5);
function anDraw() {
  const an = (CACHE.an || []).filter(a => !AN.q || (a.title + ' ' + (a.body || '') + ' ' + (a.author || '')).toLowerCase().includes(AN.q.toLowerCase()));
  $('#anBody').innerHTML = an.map(a => `<div class="ann-item"><span class="ann-ic">${UI.ic('megaphone', 20)}</span><div class="ann-bd"><h4>${esc(a.title)}${daysAgo(a.date) <= 7 ? UI.pill('ok', 'Baru') : ''}</h4>${a.body ? `<p>${esc(a.body)}</p>` : ''}<div class="ann-meta"><span><span class="fav" style="--h:${UI.hue(a.author)}" aria-hidden="true">${esc(UI.initials(a.author))}</span>${esc(a.author || '—')}</span><span>${UI.ic('calendar', 13)}${fd(a.date, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div></div>${adm(`<button class="btn-s" onclick="edit(A,'an',${a.id})">${UI.ic('edit', 13)} Ubah</button>`)}</div>`).join('') || UI.empty('megaphone', AN.q ? 'Tidak ada pengumuman yang cocok' : 'Belum ada pengumuman', AN.q ? 'Ubah kata kunci pencarian.' : 'Pengumuman penting untuk keluarga akan tampil di sini.');
  $('#anFoot').textContent = `Menampilkan ${an.length} dari ${(CACHE.an || []).length} pengumuman`;
}
R.pengumuman = async () => {
  const an = CACHE.an = await api('announcements'), last = an.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  $('#pengumuman').innerHTML = hero('Pengumuman', 'Informasi penting untuk seluruh anggota keluarga.') + `
  <div class="fin-kpis">
   ${UI.kpi('k-arisan', 'Total pengumuman', 'megaphone', `${an.length} <small>pengumuman</small>`, 'Seluruh arsip')}
   ${UI.kpi('k-kas', '7 hari terakhir', 'clock', `${an.filter(a => daysAgo(a.date) <= 7).length} <small>baru</small>`, 'Belum lewat seminggu')}
   ${UI.kpi('k-flat', 'Terbaru', 'calendar', last ? fd(last.date, { day: 'numeric', month: 'short' }) : '—', last ? `<span><b>${esc(last.title)}</b></span>` : 'Belum ada pengumuman')}
  </div>
  <div class="card">${UI.head('Papan pengumuman', 'Yang terbaru ada di atas', adm(`<button class="primary" onclick="addAnn()">${UI.ic('plus', 16)} Pengumuman</button>`))}
   <div class="fin-bar">${UI.searchBox('anq', 'Cari judul, isi, atau penulis…', AN.q, 'anQ')}</div><div class="ann-list" id="anBody"></div><div class="fin-foot" id="anFoot"></div></div>`;
  anDraw();
};
// ---------- Tema & boot ----------
function toggleTheme() {
  const d = document.body.classList.toggle('dark'); localStorage.setItem('familyhub-theme', d ? 'dark' : 'light');
  paintThemeBtn(); toast(d ? 'Mode gelap aktif' : 'Mode terang aktif');
}
if (localStorage.getItem('familyhub-theme') === 'dark') document.body.classList.add('dark');
paintThemeBtn();
function boot() {
  showPage(page);
}

// ---------- Gerbang persetujuan akun (v3.10) ----------
// Akun baru berstatus MENUNGGU sampai admin menyetujui. Database juga menolak semua data untuk akun ini (RLS);
// layar ini hanya memberi tahu pengguna. Tidak ada pemanggilan data selama menunggu.
function enter() {
  if (ME && ME.approved === false) return showPending();
  const pb = $('#pendingBox'); if (pb) pb.classList.remove('show');
  boot(); refreshNotif();
}
function showPending() {
  let el = $('#pendingBox');
  if (!el) { el = document.createElement('div'); el.id = 'pendingBox'; el.className = 'login'; document.body.appendChild(el); }
  el.innerHTML = `<div class="modal-box" style="text-align:center" role="alertdialog" aria-live="polite">
    <div style="font-size:44px;line-height:1;margin-bottom:10px">⏳</div>
    <h2 style="margin:0 0 6px">Menunggu persetujuan</h2>
    <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 6px">Akun <b>${esc(ME.username || '')}</b> sudah terdaftar, tetapi admin keluarga perlu menyetujuinya dulu sebelum Anda dapat melihat data.</p>
    <p style="color:var(--muted);font-size:12px;margin:0 0 18px">Hubungi admin keluarga, lalu tekan “Periksa lagi”.</p>
    <div id="pendMsg" class="loginmsg"></div>
    <button class="primary" id="pendRetry" style="width:100%;margin-top:6px">Periksa lagi</button>
    <button class="ghost" id="pendOut" style="width:100%;margin-top:8px;padding:11px;border-radius:13px">Keluar</button></div>`;
  el.classList.add('show');
  $('#pendOut').onclick = logout;
  $('#pendRetry').onclick = async () => {
    const b = $('#pendRetry'), m = $('#pendMsg'); b.disabled = true; b.textContent = 'Memeriksa…';
    try { const u = await api('me'); ME = u; if (u.approved !== false) return enter(); m.textContent = 'Belum disetujui. Coba lagi nanti.'; m.className = 'loginmsg show'; }
    catch (e) { if (e) console.error(e); } finally { b.disabled = false; b.textContent = 'Periksa lagi'; }
  };
}

// ---------- Notifikasi: pendaftar yang menunggu persetujuan (admin) ----------
let PENDING_N = 0;
async function refreshNotif() {
  const dot = $('#notifDot'), btn = $('#notifBtn'); if (!dot) return;
  PENDING_N = 0;
  if (isA()) { try { PENDING_N = (await api('users')).filter(u => u.approved === false).length; } catch (e) { } }
  dot.hidden = !PENDING_N; btn.title = PENDING_N ? `${PENDING_N} pendaftar menunggu persetujuan` : 'Notifikasi';
}
function openNotif() {
  if (PENDING_N && isA()) { PG_TAB = 'kelola'; return showPage('pengguna'); }
  toast('Tidak ada notifikasi baru');
}
setInterval(() => { if (ME && ME.approved !== false && !document.hidden) refreshNotif(); }, 5 * 60 * 1000);
// Pintu masuk aplikasi. Dipanggil dari AKHIR router.js (skrip terakhir), bukan di sini: skrip lain (tree.js, members.js, router.js, …)
// baru mendefinisikan R.silsilah, R.anggota, dst. setelah app.js. Memulai lebih awal membuat halaman-halaman itu kosong dan
// alamat /silsilah jatuh ke Dashboard bila respons server lebih cepat daripada pemuatan skrip (terutama saat refresh).
let STARTED = false;
function startApp() {
  if (STARTED) return; STARTED = true;
  api('me').then(u => { ME = u; enter(); }).catch(e => { if (e) console.error('Gagal memulai aplikasi:', e); });
}
