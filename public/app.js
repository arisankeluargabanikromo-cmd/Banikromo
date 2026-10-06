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
function openForm(title, fields, vals, onSave, onDel) {
  $('#fTitle').textContent = title;
  $('#fForm').innerHTML = fields.map(f => {
    const v = vals[f.k] ?? '', a = `name="${f.k}" ${f.req ? 'required' : ''}`;
    const inp = f.t === 'select' ? `<select ${a}>${f.o.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
      : f.t === 'textarea' ? `<textarea ${a} rows="3">${esc(v)}</textarea>` : `<input type="${f.t || 'text'}" ${a} value="${esc(v)}" ${f.t === 'number' ? 'min="0"' : ''}>`;
    return `<label>${f.l}${inp}</label>`;
  }).join('') + `<div class="row"><button type="button" class="ghost" onclick="closeForm()">Batal</button>${onDel ? '<button type="button" class="danger" id="fDel">Hapus</button>' : ''}<button class="primary">Simpan</button></div>`;
  $('#fForm').onsubmit = guard(async e => { e.preventDefault(); await onSave(Object.fromEntries(new FormData(e.target))); closeForm(); toast('Tersimpan'); reload(); });
  if (onDel) $('#fDel').onclick = guard(async () => { if (confirm('Hapus data ini?')) { await onDel(); closeForm(); toast('Dihapus'); reload(); } });
  $('#formModal').classList.add('show');
}
const closeForm = () => $('#formModal').classList.remove('show');
const crud = (t, fields, title) => ({
  add: () => openForm('Tambah ' + title, fields, {}, b => api(t, 'POST', b)),
  edit: o => openForm('Ubah ' + title, fields, o, b => api(`${t}/${o.id}`, 'PUT', b), () => api(`${t}/${o.id}`, 'DELETE')),
});
const mFields = () => [{ k: 'name', l: 'Nama lengkap', req: 1 }, { k: 'relation', l: 'Hubungan (mis. Cucu)' }, { k: 'generation', l: 'Generasi', t: 'select', o: [1, 2, 3, 4, 5] },
  { k: 'parent_id', l: 'Orang tua', t: 'select', o: [['', '— Tidak ada —'], ...MEMBERS.map(m => [m.id, m.name])] }, { k: 'phone', l: 'No. HP / WhatsApp' }, { k: 'joined', l: 'Anggota sejak (tahun)', t: 'number' }, { k: 'active', l: 'Status arisan', t: 'select', o: [[1, 'Aktif'], [0, 'Nonaktif']] }];
const M = crud('members', [], 'Anggota'), addMember = () => openForm('Tambah Anggota', mFields(), { generation: 1, active: 1, joined: new Date().getFullYear() }, b => api('members', 'POST', b));
const editMember = id => { const o = MEMBERS.find(m => m.id === id); closeProfile(); openForm('Ubah Anggota', mFields(), o, b => api('members/' + id, 'PUT', b), () => api('members/' + id, 'DELETE')); };
const TXF = [{ k: 'date', l: 'Tanggal', t: 'date', req: 1 }, { k: 'description', l: 'Keterangan', req: 1 }, { k: 'type', l: 'Jenis', t: 'select', o: [['masuk', 'Pemasukan'], ['keluar', 'Pengeluaran']] }, { k: 'amount', l: 'Nominal (Rp)', t: 'number', req: 1 }];
const T = crud('transactions', TXF, 'Transaksi'), addTx = () => openForm('Tambah Transaksi', TXF, { date: new Date().toISOString().slice(0, 10) }, b => api('transactions', 'POST', b));
const EVF = [{ k: 'date', l: 'Tanggal', t: 'date', req: 1 }, { k: 'time', l: 'Jam', t: 'time' }, { k: 'title', l: 'Kegiatan', req: 1 }, { k: 'location', l: 'Lokasi' }, { k: 'status', l: 'Status', t: 'select', o: ['Terjadwal', 'Selesai', 'Dibatalkan'] }];
const E = crud('events', EVF, 'Agenda'), addEvent = () => E.add();
const ANF = [{ k: 'title', l: 'Judul', req: 1 }, { k: 'body', l: 'Isi pengumuman', t: 'textarea' }], A = crud('announcements', ANF, 'Pengumuman'), addAnn = () => A.add();
const ALF = [{ k: 'title', l: 'Nama album', req: 1 }, { k: 'emoji', l: 'Emoji sampul' }], AL = crud('albums', ALF, 'Album'), addAlbum = () => AL.add();
let CACHE = {}; const edit = (c, k, id) => c.edit(CACHE[k].find(x => x.id === id));

// ---------- Profil ----------
async function openProfile(id) {
  if (!MEMBERS.length) MEMBERS = await api('members');
  const m = MEMBERS.find(x => x.id === id); if (!m) return; const p = MEMBERS.find(x => x.id === m.parent_id), kids = MEMBERS.filter(x => x.parent_id === id);
  const pay = (await api('payments')).rows.find(r => r.member_id === id), hist = await api('history/' + id);
  $('#profileBox').innerHTML = `<div class="modal-top"><b>Profil Keluarga</b><button class="close" onclick="closeProfile()">×</button></div><div class="profile"><div class="avatar">${ini(m.name)}</div><h2>${esc(m.name)}</h2><p>${esc(m.relation || '')} • Generasi ${m.generation}${m.phone ? ' • ' + esc(m.phone) : ''}</p></div>
  <div class="detail-grid"><div class="detail"><span>Status Arisan</span><b>${m.active ? '✓ Aktif' : 'Nonaktif'}</b></div><div class="detail"><span>Iuran Bulan Ini</span><b>${pay && pay.pid ? '✓ Lunas' : 'Belum bayar'}</b></div><div class="detail"><span>Orang Tua</span><b>${esc(p ? p.name : '—')}</b></div><div class="detail"><span>Anggota Sejak</span><b>${m.joined || '—'}</b></div><div class="detail" style="grid-column:span 2"><span>Anak</span><b>${kids.map(k => esc(k.name)).join(', ') || '—'}</b></div><div class="detail" style="grid-column:span 2"><span>Riwayat iuran (12 bulan)</span><b style="font-size:12px;line-height:1.8">${hist.pays.map(x => '✓ ' + MONTH(x.period).slice(0, 3) + ' ' + x.period.slice(2, 4)).join(' · ') || 'Belum ada'}</b></div><div class="detail" style="grid-column:span 2"><span>Menang arisan</span><b>${hist.wins.map(w => MONTH(w.period)).join(', ') || 'Belum pernah'}</b></div></div>
  ${adm(`<button class="primary" style="width:100%;margin-top:15px" onclick="editMember(${id})">Ubah data</button>`)}`;
  $('#profileModal').classList.add('show');
}
const closeProfile = () => $('#profileModal').classList.remove('show');
$('#profileModal').addEventListener('click', e => { if (e.target.id === 'profileModal') closeProfile(); });
$('#formModal').addEventListener('click', e => { if (e.target.id === 'formModal') closeForm(); });

// ---------- Halaman ----------
R.dashboard = async () => {
  const d = await api('dashboard'), pct = d.members ? Math.round(d.paid / d.members * 100) : 0, cf = d.cashflow, mx = Math.max(1, ...cf.flatMap(c => [c.masuk, c.keluar]));
  const pts = k => cf.map((c, i) => `${cf.length > 1 ? i * 700 / (cf.length - 1) : 350},${200 - c[k] / mx * 180}`);
  const line = k => 'M' + pts(k).join(' L'), n = d.next;
  $('#dashboard').innerHTML = hero(`Selamat datang, ${esc(ME.name)} 👋`, 'Satu tempat untuk menjaga silaturahmi, transparansi arisan, dan cerita keluarga.', `<div class="hero-date"><strong>${String(new Date().getDate()).padStart(2, '0')}</strong><span>${MONTH(d.period).toUpperCase()}</span></div>`) + `
  <div class="grid4">${[['Saldo Kas', rp(d.saldo), '◆', `Pemasukan ${rp(d.masuk)}`], ['Anggota Aktif', d.members, '♙', 'terdaftar di arisan'], ['Iuran ' + MONTH(d.period).split(' ')[0], pct + '%', '✓', `${d.paid} dari ${d.members} lunas`], ['Arisan Berikutnya', n ? fd(n.date) : '—', '◷', n ? esc(n.title) : 'Belum ada agenda']]
      .map(s => `<div class="card stat"><div class="stat-top"><span class="stat-label">${s[0]}</span><div class="stat-icon">${s[2]}</div></div><h2>${s[1]}</h2><small>${s[3]}</small><div class="wave"></div></div>`).join('')}</div>
  <div class="content2"><div class="card chart-card"><div class="card-head"><h3>Arus Kas Arisan</h3><span>${cf.length} bulan terakhir</span></div><div class="chart">${cf.length ? `<svg viewBox="0 0 700 210" preserveAspectRatio="none"><path d="${line('masuk')}" fill="none" stroke="#6957ff" stroke-width="4"/><path d="${line('keluar')}" fill="none" stroke="#22c7a9" stroke-width="3" stroke-dasharray="7 6"/></svg>` : ''}</div><div class="legend"><span><i></i>Pemasukan</span><span><i class="g"></i>Pengeluaran</span></div></div>
  <div class="card next"><div class="card-head" style="padding:0 0 18px"><h3>Arisan berikutnya</h3></div>${n ? `<div class="event-date"><div class="datebox"><small>${fd(n.date, { month: 'short' }).toUpperCase()}</small><b>${n.date.slice(8)}</b></div><div><h4>${esc(n.title)}</h4><p>${esc(n.location || '')} • ${esc(n.time || '')}</p></div></div>` : '<p>Belum ada agenda mendatang.</p>'}<div class="progress"><span style="width:${pct}%"></span></div><div class="split"><span>${d.paid}/${d.members} iuran masuk</span><b style="color:#22a98f">${pct}%</b></div><button class="primary" style="width:100%;margin-top:18px" onclick="showPage('arisan')">Lihat detail arisan</button></div></div>
  <div class="content2"><div class="card activity"><div class="card-head"><h3>Aktivitas terbaru</h3></div>${d.activity.map(a => `<div class="activity-row"><div class="activity-icon">${esc(a.icon)}</div><div class="activity-text"><b>${esc(a.text)}</b><span>${esc(a.detail)} • ${ft(a.at)}</span></div></div>`).join('')}</div>
  <div class="card members"><div class="card-head"><h3>Anggota terbaru</h3><span>${d.members} ANGGOTA</span></div>${d.recent.map(m => `<div class="member-row"><div class="avatar">${ini(m.name)}</div><div class="member-info"><b>${esc(m.name)}</b><span>${esc(m.relation || '')} • Generasi ${m.generation}</span></div></div>`).join('')}</div></div>`;
};
R.arisan = async () => {
  const d = window._pay = await api('payments'), paid = d.rows.filter(r => r.pid), tot = d.rows.length * d.iuran, got = paid.length * d.iuran;
  $('#arisan').innerHTML = hero('Monitoring Arisan', 'Transparansi iuran, jadwal, penerima giliran, dan histori kegiatan.') + `
  <div class="card" style="margin-bottom:20px"><div class="card-head"><h3>Arisan ${MONTH(d.period)} — iuran ${rp(d.iuran)}</h3><span>${adm('<button class="primary" onclick="waGroup()">💬 Ingatkan grup</button> <button class="primary" onclick="setIuran(' + d.iuran + ')">Atur iuran</button>')}</span></div><table class="table"><thead><tr><th>Anggota</th><th>Iuran</th><th>Status</th><th>Waktu</th><th></th></tr></thead><tbody>${d.rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="money">${rp(d.iuran)}</td><td><span class="status ${r.pid ? '' : 'pending'}">${r.pid ? 'Lunas' : 'Belum'}</span></td><td>${r.pid ? ft(r.paid_at) : '—'}</td><td>${adm(r.pid ? `<button class="btn-s d" onclick="unpay(${r.pid})">Batalkan</button>` : `<button class="btn-s" onclick="pay(${r.member_id},'${d.period}')">Catat bayar</button>`)}${adm(r.pid ? '' : `<button class="btn-s" onclick="wa(${r.member_id})">💬 Ingatkan</button>`)}</td></tr>`).join('')}</tbody></table></div>
  <div class="grid4">${[['Target Iuran', tot], ['Sudah Masuk', got], ['Belum Masuk', tot - got]].map(s => `<div class="card stat"><span class="stat-label">${s[0]}</span><h2>${rp(s[1])}</h2></div>`).join('')}<div class="card stat"><span class="stat-label">Lunas</span><h2>${paid.length}/${d.rows.length}</h2></div></div>`;
};
const pay = guard(async (id, p) => { await api('payments', 'POST', { member_id: id, period: p }); toast('Pembayaran dicatat'); reload(); });
const unpay = guard(async id => { if (confirm('Batalkan pembayaran ini?')) { await api('payments/' + id, 'DELETE'); reload(); } });
const setIuran = v => openForm('Atur Iuran Bulanan', [{ k: 'iuran', l: 'Nominal per anggota (Rp)', t: 'number', req: 1 }], { iuran: v }, b => api('settings', 'PUT', b));

let drawing = false;
R.pengocokan = async () => {
  const d = await api('draw'), done = d.history.some(h => h.period === d.period);
  $('#pengocokan').innerHTML = hero('Pengocokan Digital', 'Pengundian pemenang arisan secara transparan, teracak, dan dapat diaudit.', `<div class="hero-date"><strong>${MONTH(d.period).split(' ')[0]}</strong><span>SIKLUS ${d.cycle}</span></div>`) + `
  <div class="content2"><div class="card"><div class="card-head"><div><h3>Pengundian Pemenang</h3><span>MODE TRANSPARAN</span></div><span class="status ${done ? '' : 'pending'}" id="drawStatus">${done ? 'Sudah diundi' : 'Siap diundi'}</span></div><div style="padding:10px 25px 25px"><div class="draw-stage" style="min-height:230px;border-radius:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;padding:25px"><div style="font-size:12px;color:#aeb6cc;letter-spacing:1.5px">PEMENANG ARISAN</div><div id="drawName" style="font-size:32px;font-weight:800;margin:15px 0">${done ? esc(d.history[0].winner_name) : 'Siap Diundi'}</div><div id="drawSub" style="font-size:11px;color:#aeb6cc">${d.eligible.length} peserta memenuhi syarat${d.unpaid ? ` • ${d.unpaid} belum bayar` : ''}</div></div>
  ${adm(`<div style="display:flex;gap:10px;margin-top:15px"><button class="primary" id="drawBtn" style="flex:1" ${done || !d.eligible.length ? 'disabled style="flex:1;opacity:.5"' : ''} onclick="startDraw()">⚡ Mulai Pengocokan</button><button class="icon-btn" title="Mulai siklus baru" onclick="newCycle()">↻</button></div>`)}</div></div>
  <div class="card"><div class="card-head"><h3>Aturan Pengundian</h3><span>TRANSPARANSI</span></div><div style="padding:5px 20px 20px">${[['Hanya anggota aktif', 'Peserta harus terdaftar sebagai anggota arisan.'], ['Sudah bayar iuran bulan ini', 'Yang belum lunas otomatis tidak ikut diundi.'], ['Satu kali menang per siklus', 'Pemenang sebelumnya tidak ikut sampai siklus baru dimulai.'], ['Acak aman & tercatat', 'Diundi di server (crypto random), disimpan beserta kode bukti.']].map(a => `<div class="activity-row"><div class="activity-icon">✓</div><div class="activity-text"><b>${a[0]}</b><span>${a[1]}</span></div></div>`).join('')}</div></div></div>
  <div class="card" style="margin-bottom:20px"><div class="card-head"><h3>Peserta Eligible</h3><span>${d.eligible.length} peserta</span></div><div style="padding:0 20px 20px;display:flex;flex-wrap:wrap;gap:8px">${d.eligible.map(e => `<span style="padding:8px 11px;border:1px solid var(--line);border-radius:20px;background:var(--panel2);font-size:10px">✓ ${esc(e.name)}</span>`).join('') || '<small>Belum ada peserta eligible.</small>'}</div></div>
  <div class="card"><div class="card-head"><h3>Histori Pengundian</h3><span>TERCATAT OTOMATIS</span></div><table class="table"><thead><tr><th>Periode</th><th>Waktu</th><th>Peserta</th><th>Pemenang</th><th>Kode bukti</th></tr></thead><tbody>${d.history.map(h => `<tr><td>${MONTH(h.period)}</td><td>${ft(h.at)}</td><td>${JSON.parse(h.participants).length}</td><td><b>${esc(h.winner_name)}</b></td><td class="proof">${esc(h.proof.slice(0, 16))}…</td></tr>`).join('')}</tbody></table></div>`;
  window._el = d.eligible;
};
const startDraw = guard(async () => {
  if (drawing) return; drawing = true; const btn = $('#drawBtn'), nm = $('#drawName'); btn.disabled = true; btn.style.opacity = .6; $('#drawStatus').textContent = 'Sedang mengocok…';
  const spin = setInterval(() => { nm.textContent = window._el[Math.floor(Math.random() * window._el.length)].name; }, 80);
  try { const [r] = await Promise.all([api('draw', 'POST'), new Promise(r => setTimeout(r, 2600))]); clearInterval(spin); nm.textContent = r.winner.name; nm.className = 'stage-pop'; toast('Pemenang: ' + r.winner.name); setTimeout(reload, 1800); }
  catch (e) { clearInterval(spin); reload(); } finally { drawing = false; }
});
const newCycle = guard(async () => { if (confirm('Mulai siklus arisan baru? Semua anggota bisa menang lagi.')) { await api('draw/new-cycle', 'POST'); reload(); } });

R.silsilah = async () => {
  MEMBERS = await api('members'); const kids = id => MEMBERS.filter(m => m.parent_id === id && m.id !== id);
  const node = m => `<div class="node" onclick="openProfile(${m.id})"><div class="avatar">${ini(m.name)}</div><b>${esc(m.name.split(' ')[0] === 'H.' ? m.name : m.name.split(' ')[0])}</b><span>Generasi ${m.generation}</span></div>`;
  const sub = m => { const k = kids(m.id); return node(m) + (k.length ? `<div class="connector"></div><div class="branches" style="gap:${m.generation > 1 ? 18 : 55}px">${k.map(c => `<div class="branch">${sub(c)}</div>`).join('')}</div>` : ''); };
  const roots = MEMBERS.filter(m => !m.parent_id || !MEMBERS.some(p => p.id === m.parent_id));
  $('#silsilah').innerHTML = hero('Silsilah Keluarga', 'Jelajahi hubungan keluarga dari generasi ke generasi.') + `<div class="card"><div class="card-head"><h3>Family Tree</h3><span>Klik anggota untuk melihat profil</span></div><div class="tree-wrap"><div class="tree"><div class="branches" style="gap:40px">${roots.map(r => `<div class="branch" style="padding-top:0">${sub(r)}</div>`).join('')}</div></div></div></div>`;
};
R.anggota = async () => {
  MEMBERS = await api('members');
  $('#anggota').innerHTML = hero('Anggota Keluarga', 'Direktori anggota, hubungan keluarga, dan status arisan.') + `<div class="toolbar"><input class="search" id="mq" placeholder="Cari nama anggota..." oninput="drawMembers()"><select class="select" id="mg" onchange="drawMembers()"><option value="">Semua generasi</option>${[1, 2, 3, 4, 5].map(g => `<option value="${g}">Generasi ${g}</option>`).join('')}</select>${adm('<button class="primary" onclick="addMember()">＋ Anggota</button>')}</div><div class="card"><table class="table"><thead><tr><th>Nama</th><th>Hubungan</th><th>Generasi</th><th>Arisan</th><th>Aksi</th></tr></thead><tbody id="memberTable"></tbody></table></div>`;
  drawMembers();
};
function drawMembers() {
  const q = $('#mq').value.toLowerCase(), g = $('#mg').value;
  $('#memberTable').innerHTML = MEMBERS.filter(m => m.name.toLowerCase().includes(q) && (!g || m.generation == g)).map(m => `<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.relation || '—')}</td><td>${m.generation}</td><td><span class="status ${m.active ? '' : 'pending'}">${m.active ? 'Aktif' : 'Nonaktif'}</span></td><td><button class="btn-s" onclick="openProfile(${m.id})">Detail</button></td></tr>`).join('') || '<tr><td colspan="5">Tidak ada data</td></tr>';
}
R.keuangan = async () => {
  const [d, tx] = await Promise.all([api('dashboard'), api('transactions')]); CACHE.tx = tx;
  $('#keuangan').innerHTML = hero('Keuangan Keluarga', 'Catatan pemasukan dan pengeluaran arisan secara transparan.') + `<div class="grid4">${[['Saldo', rp(d.saldo)], ['Pemasukan', rp(d.masuk)], ['Pengeluaran', rp(d.keluar)], ['Transaksi', d.n]].map(s => `<div class="card stat"><span class="stat-label">${s[0]}</span><h2>${s[1]}</h2></div>`).join('')}</div><div class="card"><div class="card-head"><h3>Transaksi terbaru</h3>${adm('<button class="primary" onclick="addTx()">＋ Transaksi</button>')}</div><table class="table"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Jenis</th><th>Nominal</th><th></th></tr></thead><tbody>${tx.map(t => `<tr><td>${fd(t.date)}</td><td>${esc(t.description)}</td><td><span class="status ${t.type == 'keluar' ? 'pending' : ''}">${t.type == 'masuk' ? 'Masuk' : 'Keluar'}</span></td><td class="money">${t.type == 'masuk' ? '+' : '-'} ${rp(t.amount)}</td><td>${adm(t.payment_id ? '' : `<button class="btn-s" onclick="edit(T,'tx',${t.id})">Ubah</button>`)}</td></tr>`).join('')}</tbody></table></div>`;
};
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
R.laporan = async () => {
  const r = CACHE.rep = await api('report');
  $('#laporan').innerHTML = hero('Laporan', 'Ringkasan aktivitas arisan dan keuangan keluarga.') + `<div class="card"><div class="card-head"><h3>Periode laporan</h3><span class="no-print"><button class="primary" onclick="window.print()">⇩ Cetak / PDF</button> <button class="primary" onclick="csv()">CSV</button></span></div><table class="table"><thead><tr><th>Periode</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo akhir</th></tr></thead><tbody>${r.map(x => `<tr><td>${MONTH(x.m)}</td><td>${rp(x.masuk)}</td><td>${rp(x.keluar)}</td><td class="money">${rp(x.saldo)}</td></tr>`).join('')}</tbody></table></div>`;
};
function csv() {
  const t = 'Periode,Pemasukan,Pengeluaran,Saldo\n' + CACHE.rep.map(x => [x.m, x.masuk, x.keluar, x.saldo].join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = 'laporan-familyhub.csv'; a.click();
}

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
