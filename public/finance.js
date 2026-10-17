// ============================================================
// Keuangan profesional (v2.6): dua jenis iuran (Arisan & Wajib), dua dana (Dana Arisan & Kas Wajib),
// kuitansi, tunggakan, pencairan arisan, buku kas.
// ============================================================
(() => {
const FUND = { arisan: 'Dana Arisan', kas: 'Kas Wajib' }, FUNDC = { arisan: '#6957ff', kas: '#17b9a0' };
const FIN = { tab: 'ringkasan', per: null, flt: 'all', q: '', lg: { fund: '', from: null, to: null, q: '' }, cur: false, pay: null, arr: null };
const pad = n => String(n).padStart(2, '0'), num = n => Number(n || 0).toLocaleString('id-ID');
const lastDay = p => { const [y, m] = p.split('-').map(Number); return p + '-' + pad(new Date(y, m, 0).getDate()); };
const monS = p => isMonthKey(p) ? MONTH(p).slice(0, 3) + ' ' + p.slice(2, 4) : PER(p);
const arrLbl = (a, p) => a.schedule === 'putaran' ? PER(p) : monS(p);                                    // label tunggakan menurut jadwal iuran
const keyOf = t => t.schedule === 'putaran' ? FIN.pay.period : FIN.pay.month;                              // kunci periode yang berlaku untuk jenis iuran ini
const canPay = t => t.schedule !== 'putaran' || (!!FIN.pay.round && ['aktif', 'selesai'].includes(FIN.pay.round.status));
const perTxt = d => { const T = d.types, p = []; if (T.some(t => t.schedule === 'putaran') && d.round) p.push(PER(d.period) + (d.round.held_on ? ' (' + fd(d.round.held_on, { day: 'numeric', month: 'long' }) + ')' : '')); if (T.some(t => t.schedule !== 'putaran')) p.push(MONTH(d.month)); return p.join(' & ') || 'arisan'; };
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------------- Komponen tampilan: ikon SVG, pill status, kartu ringkasan ----------------
const IC = {
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3.5"/><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9.5a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z"/><circle cx="16.5" cy="14.5" r="1.1" fill="currentColor"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  bank: '<path d="M3 10l9-6 9 6"/><path d="M5.5 10v8M9.8 10v8M14.2 10v8M18.5 10v8"/><path d="M3 20.5h18"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".7" fill="currentColor"/>',
  grid: '<rect x="3" y="3" width="7.5" height="9" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.8"/><rect x="13.5" y="12" width="7.5" height="9" rx="1.8"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="1.8"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9.5 8h5M9.5 12h5"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14.6c2.4.2 4 1.8 4 4.4"/>',
  file: '<path d="M7 3h8l4 4v14H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'
};
const ic = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const ini = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const hue = s => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const who = (name, sub) => `<div class="fin-who"><span class="fav" style="--h:${hue(name)}" aria-hidden="true">${esc(ini(name))}</span><div><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
const pill = (tone, html, title = '') => `<span class="pill ${tone}"${title ? ` title="${esc(title)}"` : ''}>${html}</span>`;
const money = n => `<span class="cur">Rp</span>${n < 0 ? `<span class="neg">${num(n)}</span>` : num(n)}`;                                               // "Rp" kecil + angka besar: lebih mudah dibaca
const cmp = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' jt' : a >= 1e3 ? (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' rb' : String(Math.round(n)); };
const niceMax = v => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 10) * p; };   // batas sumbu yang habis dibagi 4
const OUTC = '#f0996b';
const kpi = (cls, label, icon, val, sub = '', extra = '', color = '') => `<div class="card kpi ${cls}"${color ? ` style="--k:${color}"` : ''}><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-ic">${ic(icon, 20)}</span></div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}${extra}</div>`;

// ---------------- Modal ----------------
function finModal(html, cls = '') {
  let m = $('#finModal'); if (!m) { m = document.createElement('div'); m.id = 'finModal'; m.className = 'modal'; m.innerHTML = '<div class="modal-box fin-box" id="finBox"></div>'; document.body.appendChild(m); backdropClose(m, finClose); }
  $('#finBox').className = 'modal-box fin-box ' + cls; $('#finBox').innerHTML = html; m.classList.add('show');
}
const finClose = () => { const m = $('#finModal'); if (m) m.classList.remove('show'); };
const done = () => { finClose(); reload(); };

// ---------------- Terbilang & kuitansi ----------------
function terbilang(n) {
  n = Math.floor(Math.abs(n)); const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const t = n => n < 12 ? s[n] : n < 20 ? t(n - 10) + ' belas' : n < 100 ? t(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + t(n % 10) : '') : n < 200 ? 'seratus' + (n > 100 ? ' ' + t(n - 100) : '')
    : n < 1e3 ? t(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + t(n % 100) : '') : n < 2e3 ? 'seribu' + (n > 1e3 ? ' ' + t(n - 1e3) : '')
    : n < 1e6 ? t(Math.floor(n / 1e3)) + ' ribu' + (n % 1e3 ? ' ' + t(n % 1e3) : '') : n < 1e9 ? t(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + t(n % 1e6) : '') : n < 1e12 ? t(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + t(n % 1e9) : '') : String(n);
  return n === 0 ? 'nol' : t(n);
}
async function receiptBody(r) {   // r: {no,name,jenis,period,amount,method,paid_at}
  const cfg = await getCfg(), d = new Date(r.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="rcp"><div class="rcp-h"><div style="display:flex;gap:10px;align-items:center">${window.fhBrandImg ? fhBrandImg(40, 'flex:none') : ''}<div><b>${esc(cfg.meta.org)}</b><small>KUITANSI PEMBAYARAN IURAN</small></div></div><div class="rcp-no">No. ${esc(r.no)}</div></div>
  <table><tr><td>Telah terima dari</td><td>: <b>${esc(r.name)}</b></td></tr><tr><td>Untuk pembayaran</td><td>: ${esc(r.jenis)} — ${esc(FP(r, r.period))}</td></tr><tr><td>Metode</td><td>: ${esc(r.method)}</td></tr><tr><td>Terbilang</td><td>: <i>${esc(terbilang(r.amount))} rupiah</i></td></tr></table>
  <div class="rcp-amt">Rp ${num(r.amount)}</div><div class="rcp-sign">${esc(d)}<br>Penerima / Bendahara<div class="sp"></div><b>${esc(cfg.meta.treasurer || '(                         )')}</b></div><div class="rcp-clr"></div></div>`;
}
async function showReceipt(r) {
  const body = await receiptBody(r); window._rcp = body;
  finModal(`<h3>Kuitansi</h3><div class="rcp-prev">${body}</div><div class="row"><button class="ghost" onclick="finClose()">Tutup</button><button class="primary" onclick="rptPrint(window._rcp,'Kuitansi ${esc(r.no)}')">🖨 Cetak kuitansi</button></div>`, 'wide');
}
function rcpOf(name, t, p, period) { return { no: p.receipt_no, name, jenis: t.name, schedule: t.schedule, period, amount: p.amount, method: p.method, paid_at: p.paid_at }; }
function receiptFor(mid, tid) { const r = FIN.pay.rows.find(x => x.member_id === mid), t = FIN.pay.types.find(x => x.id === tid), p = r && r.paid[tid]; if (p) showReceipt(rcpOf(r.name, t, p, keyOf(t))); }

// ---------------- Catat / batalkan pembayaran ----------------
// Peringatan bila yang dicatat BUKAN putaran aktif / bukan bulan berjalan (mencegah salah periode saat berpindah putaran atau bulan).
function warnOff(t, cfg) {
  let w = '';
  if (t.schedule === 'putaran') { const rd = FIN.pay.round; if (rd && rd.status === 'selesai') w = `Putaran ${rd.seq} sudah <b>selesai</b> — ini pembayaran <b>susulan</b>.`; else if (rd && cfg.period && rd.period !== cfg.period) w = `Ini bukan putaran aktif (aktif: ${esc(PER(cfg.period))}).`; }
  else if (cfg.month && FIN.pay.month !== cfg.month) w = `Bulan ini ${esc(MONTH(FIN.pay.month))}, <b>bukan bulan berjalan</b> (${esc(MONTH(cfg.month))}).`;
  return w ? `<div class="per-warn" style="margin:8px 0">⚠ ${w} Pastikan periodenya benar sebelum menyimpan.</div>` : '';
}
async function payDlg(mid, tid) {
  const cfg = await getCfg().catch(() => ({}));
  const r = FIN.pay.rows.find(x => x.member_id === mid), t = FIN.pay.types.find(x => x.id === tid), per = keyOf(t);
  finModal(`<h3>Catat Pembayaran</h3><div class="fin-sum"><div><small>Anggota</small><b>${esc(r.name)}</b></div><div><small>Jenis iuran</small><b>${esc(t.name)}</b></div><div><small>${t.schedule === 'putaran' ? 'Putaran' : 'Bulan'}</small><b>${esc(FP(t, per))}</b></div><div><small>Nominal</small><b class="big">Rp ${num(t.amount)}</b></div></div>
  ${warnOff(t, cfg)}<p class="muted" style="margin:6px 0 12px;font-size:12px">Masuk ke <b>${FUND[t.fund]}</b>${t.required_for_draw ? ' • syarat ikut kocok' : ''}.</p>
  <label class="flab">Metode pembayaran<select id="payMeth" class="select"><option>Tunai</option><option>Transfer</option><option>Lainnya</option></select></label>
  <div class="row"><button class="ghost" onclick="finClose()">Batal</button><button class="primary" id="payGo">Simpan pembayaran</button></div>`);
  $('#payGo').onclick = guard(async () => {
    $('#payGo').disabled = true; const meth = $('#payMeth').value;
    try { const x = await api('payments', 'POST', { member_id: mid, period: per, type: tid, method: meth });
      finModal(`<div class="fin-ok"><div class="ck">✓</div><h3>Pembayaran tercatat</h3><p>${esc(r.name)} • ${esc(t.name)} • ${esc(FP(t, per))}<br><b>Rp ${num(t.amount)}</b></p><p class="muted">No. kuitansi <b>${esc(x.receipt_no)}</b></p></div>
      <div class="row"><button class="ghost" onclick="finDone()">Selesai</button><button class="primary" id="payRc">🖨 Cetak kuitansi</button></div>`);
      $('#payRc').onclick = async () => rptPrint(await receiptBody({ no: x.receipt_no, name: r.name, jenis: t.name, schedule: t.schedule, period: per, amount: x.amount, method: meth, paid_at: new Date() }), 'Kuitansi ' + x.receipt_no);
      reloadBg();
    } catch (e) { $('#payGo').disabled = false; throw e; }
  });
}
const reloadBg = () => { clearTimeout(reloadBg._t); reloadBg._t = setTimeout(reload, 50); };
const voidPay = guard(async (pid) => { const why = prompt('Batalkan pembayaran ini?\nAlasan pembatalan (opsional):'); if (why === null) return; await api('payments/' + pid, 'DELETE', { reason: why }); toast('Pembayaran dibatalkan'); reload(); });

// ---------------- Pelunasan tunggakan (beberapa bulan sekaligus) ----------------
async function settleDlg(mid) {
  const arr = (await api('fin/arrears', 'GET', { cur: FIN.cur })).filter(a => a.member_id === mid); if (!arr.length) return toast('Anggota ini tidak punya tunggakan');
  finModal(`<h3>Lunasi Tunggakan</h3><p style="margin:0 0 10px"><b>${esc(arr[0].name)}</b></p>${arr.map(a => `<div class="stl"><div class="stl-h"><b>${esc(a.type_name)}</b><small>Rp ${num(a.amount)}/${UNIT(a)}</small></div><div class="stl-p">${a.periods.map(p => `<label class="chip"><input type="checkbox" data-t="${a.type_id}" data-p="${p}" data-a="${a.amount}" checked> ${esc(arrLbl(a, p))}</label>`).join('')}</div></div>`).join('')}
  <label class="flab">Metode pembayaran<select id="stlMeth" class="select"><option>Tunai</option><option>Transfer</option><option>Lainnya</option></select></label>
  <div class="stl-tot">Total dibayar: <b id="stlTot">Rp 0</b></div><div class="row"><button class="ghost" onclick="finClose()">Batal</button><button class="primary" id="stlGo">Simpan pembayaran</button></div>`);
  const calc = () => { const c = [...$('#finBox').querySelectorAll('input[type=checkbox]:checked')]; $('#stlTot').textContent = 'Rp ' + num(c.reduce((s, x) => s + +x.dataset.a, 0)); $('#stlGo').disabled = !c.length; };
  $('#finBox').querySelectorAll('input[type=checkbox]').forEach(x => x.onchange = calc); calc();
  $('#stlGo').onclick = guard(async () => {
    $('#stlGo').disabled = true; const sel = {}; $('#finBox').querySelectorAll('input[type=checkbox]:checked').forEach(x => (sel[x.dataset.t] = sel[x.dataset.t] || []).push(x.dataset.p));
    try { let n = 0; for (const [t, ps] of Object.entries(sel)) { const r = await api('payments/bulk', 'POST', { member_id: mid, type: +t, periods: ps, method: $('#stlMeth').value }); n += r.length; }
      toast(n + ' pembayaran tercatat'); done();
    } catch (e) { $('#stlGo').disabled = false; throw e; }
  });
}

// ---------------- Pengaturan jenis iuran ----------------
async function feeDlg() {
  const cfg = await getCfg();
  finModal(`<h3>Pengaturan Iuran & Laporan</h3><p class="muted" style="margin:0 0 12px;font-size:12px">Perubahan tarif hanya berlaku untuk pembayaran berikutnya. Pembayaran yang sudah tercatat tidak berubah.</p>
  ${cfg.types.map(t => `<fieldset class="fee" data-id="${t.id}"><legend>${esc(t.name)} <small>→ ${FUND[t.fund]}</small></legend>
    <div class="fee-g"><label class="flab">Nama<input name="name" value="${esc(t.name)}"></label><label class="flab">Nominal / ${UNIT(t)} (Rp)<input name="amount" type="number" min="1" value="${t.amount}"></label>
    <label class="flab">Berlaku mulai<input name="start" type="month" value="${t.start_period}"></label>
    <label class="flab">Ditagih<select name="schedule" ${t.fund === 'arisan' ? 'disabled' : ''}><option value="putaran" ${t.schedule === 'putaran' ? 'selected' : ''}>Per putaran arisan</option><option value="bulanan" ${t.schedule !== 'putaran' ? 'selected' : ''}>Per bulan</option></select></label></div>
    <label class="chk"><input type="checkbox" name="required" ${t.required_for_draw ? 'checked' : ''}> Wajib lunas untuk ikut kocok arisan</label><label class="chk"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Iuran aktif</label></fieldset>`).join('')}
  <fieldset class="fee"><legend>Identitas laporan</legend><div class="fee-g"><label class="flab" style="grid-column:span 3">Nama organisasi / keluarga<input id="mOrg" value="${esc(cfg.meta.org)}"></label><label class="flab" style="grid-column:span 2">Bendahara<input id="mTre" value="${esc(cfg.meta.treasurer)}"></label><label class="flab">Ketua<input id="mCha" value="${esc(cfg.meta.chair)}"></label></div></fieldset>
  <div class="row"><button class="ghost" onclick="finClose()">Batal</button><button class="primary" id="feeGo">Simpan pengaturan</button></div>`, 'wide');
  $('#feeGo').onclick = guard(async () => {
    $('#feeGo').disabled = true;
    try { for (const f of $('#finBox').querySelectorAll('fieldset.fee[data-id]')) {
        const g = n => f.querySelector(`[name=${n}]`); await api('fin/feetype', 'PUT', { id: +f.dataset.id, name: g('name').value, amount: g('amount').value, start: g('start').value, schedule: g('schedule').value, required: g('required').checked, active: g('active').checked }); }
      await api('fin/meta', 'PUT', { org: $('#mOrg').value, treasurer: $('#mTre').value, chair: $('#mCha').value }); resetCfg(); toast('Pengaturan tersimpan'); done();
    } catch (e) { $('#feeGo').disabled = false; throw e; }
  });
}

// ---------------- Pencairan arisan ----------------
function disburseDlg(i) {
  const p = FIN.pend[i]; if (!p) return;
  finModal(`<h3>Cairkan Dana Arisan</h3><div class="fin-sum"><div><small>Putaran</small><b>${esc(PERX(p.period))}</b></div><div><small>Penerima (pemenang)</small><b>${esc(p.winner)}</b></div><div><small>Terkumpul</small><b>Rp ${num(p.collected)}</b></div><div><small>Sudah dicairkan</small><b>Rp ${num(p.disbursed)}</b></div></div>
  <div class="stl-tot" style="margin-top:14px">Dicairkan sekarang: <b>Rp ${num(p.amount)}</b></div><p class="muted" style="font-size:12px">Dicatat sebagai pengeluaran <b>Dana Arisan</b> (kategori Pencairan Arisan) dan muncul di Buku Kas serta laporan.</p>
  <div class="row"><button class="ghost" onclick="finClose()">Batal</button><button class="primary" id="dsbGo">Cairkan Rp ${num(p.amount)}</button></div>`);
  $('#dsbGo').onclick = guard(async () => { $('#dsbGo').disabled = true; try { await api('fin/disburse', 'POST', { period: p.period }); toast('Dana arisan dicairkan ke ' + p.winner); done(); } catch (e) { $('#dsbGo').disabled = false; throw e; } });
}
const undisburse = guard(async id => { if (confirm('Batalkan pencairan ini? Dana kembali ke Dana Arisan dan perlu dicairkan ulang.')) { await api('fin/undisburse', 'POST', { id }); toast('Pencairan dibatalkan'); reload(); } });

// ---------------- Transaksi manual ----------------
const CAT = { masuk: ['Donasi / Sumbangan', 'Saldo Awal', 'Penerimaan Lain'], keluar: ['Konsumsi & Acara', 'Santunan / Sosial', 'Operasional', 'Pengeluaran Lain'] };
function txDlg(t) {
  t = t || { date: todayStr(), type: 'keluar', fund: 'kas', category: '', description: '', amount: '' };
  const cats = ty => { const l = CAT[ty].slice(); if (t.category && ty === t.type && !l.includes(t.category)) l.unshift(t.category); return l; };
  finModal(`<h3>${t.id ? 'Ubah' : 'Tambah'} Transaksi</h3><form id="txF" class="fin-form">
  <label class="flab">Tanggal<input name="date" type="date" required value="${esc(t.date)}"></label>
  <label class="flab">Jenis<select name="type" id="txType"><option value="masuk" ${t.type === 'masuk' ? 'selected' : ''}>Pemasukan</option><option value="keluar" ${t.type === 'keluar' ? 'selected' : ''}>Pengeluaran</option></select></label>
  <label class="flab">Dana<select name="fund"><option value="kas" ${t.fund === 'kas' ? 'selected' : ''}>Kas Wajib</option><option value="arisan" ${t.fund === 'arisan' ? 'selected' : ''}>Dana Arisan</option></select></label>
  <label class="flab">Kategori<select name="category" id="txCat">${cats(t.type).map(c => `<option ${c === t.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
  <label class="flab" style="grid-column:span 2">Keterangan<input name="description" required value="${esc(t.description)}"></label>
  <label class="flab" style="grid-column:span 2">Nominal (Rp)<input name="amount" type="number" min="1" required value="${t.amount}"></label>
  <div class="row" style="grid-column:span 2"><button type="button" class="ghost" onclick="finClose()">Batal</button>${t.id ? '<button type="button" class="danger" id="txDel">Hapus</button>' : ''}<button class="primary">Simpan</button></div></form>`);
  $('#txType').onchange = e => { const ty = e.target.value; $('#txCat').innerHTML = CAT[ty].map(c => `<option>${esc(c)}</option>`).join(''); };
  $('#txF').onsubmit = guard(async e => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); await api(t.id ? 'transactions/' + t.id : 'transactions', t.id ? 'PUT' : 'POST', b); toast('Tersimpan'); done(); });
  if (t.id) $('#txDel').onclick = guard(async () => { if (confirm('Hapus transaksi ini?')) { await api('transactions/' + t.id, 'DELETE'); toast('Dihapus'); done(); } });
}
function addTx() { txDlg(); }

// ---------------- WhatsApp ----------------
function arrearsText(a) { return a.map(x => `${x.type_name}: ${x.periods.map(p => arrLbl(x, p)).join(', ')} (${x.n} ${UNIT(x)}, Rp ${num(x.total)})`).join('; '); }
function wa(id) {
  const d = FIN.pay, r = d.rows.find(x => x.member_id === id), n = waNum(r.phone); if (!n) return toast('Nomor HP ' + r.name + ' belum diisi (menu Anggota → Ubah)');
  const un = d.types.filter(t => !r.paid[t.id]), ar = (FIN.arr || []).filter(a => a.member_id === id);
  const txt = `Halo ${r.name}, pengingat iuran ${perTxt(d)}${un.length ? ': ' + un.map(t => `${t.name} Rp ${num(t.amount)}`).join(', ') : ''}.` + (ar.length ? `\nTunggakan: ${arrearsText(ar)}.` : '') + '\nTerima kasih 🙏';
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(txt), '_blank');
}
function waGroup() {
  const d = FIN.pay, un = d.rows.filter(r => d.types.some(t => !r.paid[t.id])); if (!un.length) return toast('Semua anggota sudah lunas 🎉');
  window.open('https://wa.me/?text=' + encodeURIComponent(`Pengingat iuran ${perTxt(d)}:\n${d.types.map(t => `• ${t.name}: Rp ${num(t.amount)}`).join('\n')}\n\nBelum lunas:\n` + un.map((r, i) => `${i + 1}. ${r.name} (${d.types.filter(t => !r.paid[t.id]).map(t => t.name.replace('Iuran ', '')).join(', ')})`).join('\n') + '\nTerima kasih 🙏'), '_blank');
}
function waArr(mid) {
  const ar = (FIN.arr || []).filter(a => a.member_id === mid); if (!ar.length) return; const n = waNum(ar[0].phone); if (!n) return toast('Nomor HP ' + ar[0].name + ' belum diisi (menu Anggota → Ubah)');
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(`Halo ${ar[0].name}, pengingat tunggakan iuran: ${arrearsText(ar)}. Total Rp ${num(ar.reduce((s, x) => s + x.total, 0))}.\nTerima kasih 🙏`), '_blank');
}

// ---------------- Blok daftar iuran (dipakai halaman Keuangan & Arisan) ----------------
async function loadPay() {
  const cfg = await getCfg();
  if (FIN.per && !(cfg.rounds || []).some(r => r.period === FIN.per && r.status !== 'batal')) FIN.per = null;   // putaran pilihan sudah tidak ada/dibatalkan: ikuti putaran aktif
  // bulan kosong = server memakai bulan acuan putaran yang tampil
  const [d, ar] = await Promise.all([api('payments', 'GET', { period: FIN.per || cfg.period || null, month: null }), api('fin/arrears', 'GET', { cur: false })]); FIN.pay = window._pay = d; FIN.arr = ar; return d; }
function iuranBlock(d) { return `<div id="iuranWrap">${iuranInner(d)}</div>`; }
function iuranInner(d) {
  const T = d.types, showDraw = T.some(t => t.required_for_draw), arr = {}; FIN.arr.forEach(a => { (arr[a.member_id] = arr[a.member_id] || []).push(a); });
  const nAll = d.rows.length, nBelum = d.rows.filter(r => T.some(t => !r.paid[t.id])).length, cnt = { all: nAll, belum: nBelum, lunas: nAll - nBelum };
  const rows = d.rows.filter(r => (FIN.flt === 'all' || (FIN.flt === 'belum' ? T.some(t => !r.paid[t.id]) : T.every(t => r.paid[t.id]))) && (!FIN.q || r.name.toLowerCase().includes(FIN.q.toLowerCase())));
  const st = T.map(t => { const p = d.rows.filter(r => r.paid[t.id]).length, real = d.rows.reduce((s, r) => s + (r.paid[t.id] ? r.paid[t.id].amount : 0), 0), tgt = nAll * t.amount, pc = nAll ? Math.round(p / nAll * 100) : 0;
    return `<div class="card kpi" style="--k:${FUNDC[t.fund]}"><div class="kpi-top"><span class="kpi-label">${esc(t.name)}</span><span class="fd" style="--c:${FUNDC[t.fund]}">${FUND[t.fund]}</span></div><div class="kpi-val">${p}<small> dari ${nAll} anggota lunas</small></div><div class="progress" role="progressbar" aria-label="${esc(t.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}"><span style="width:${pc}%;background:${FUNDC[t.fund]}"></span></div><div class="kpi-sub"><span>Rp ${num(real)} dari Rp ${num(tgt)}</span><b>${pc}%</b></div></div>`; }).join('');
  const lay = d.rows.filter(r => r.can_draw).length, hasR = T.some(t => t.schedule === 'putaran'), hasM = T.some(t => t.schedule !== 'putaran');
  const drawCard = showDraw ? `<div class="card kpi" style="--k:#f6a623"><div class="kpi-top"><span class="kpi-label">Layak ikut kocok</span><span class="kpi-ic">${ic('target', 20)}</span></div><div class="kpi-val">${lay}<small> dari ${nAll} anggota</small></div><div class="kpi-sub">Syarat: ${T.filter(t => t.required_for_draw).map(t => esc(t.name)).join(' + ')} lunas</div></div>` : '';
  const rsel = hasR ? `<select class="select" aria-label="Putaran" onchange="finPerR(this.value)">${(d.rounds || []).filter(r => r.status !== 'batal').map(r => `<option value="${esc(r.period)}" ${r.period === d.period ? 'selected' : ''}>${esc('Putaran ' + r.seq + (r.title ? ' · ' + r.title : ''))}${r.status === 'aktif' ? ' (aktif)' : r.status === 'rencana' ? ' (rencana)' : ''}</option>`).join('') || '<option value="">Belum ada putaran</option>'}</select>` : '';
  const ttl = [hasR ? (d.round ? PERX(d.period) : 'Belum ada putaran aktif') : '', hasM ? MONTH(d.month) : ''].filter(Boolean).join(' · ');
  const note = hasR && !d.round ? `<div class="per-warn" style="margin:0 20px 12px">⏸ Arisan sedang jeda — belum ada putaran. ${adm('<button onclick="openRounds()">Kelola putaran</button>')}</div>` : hasR && d.round.status === 'rencana' ? `<div class="per-warn" style="margin:0 20px 12px">Putaran ini masih <b>rencana</b>${d.round.held_on ? ' (' + esc(fd(d.round.held_on, { day: 'numeric', month: 'long', year: 'numeric' })) + ')' : ''}: iuran belum bisa dicatat. ${adm('<button onclick="openRounds()">Buka putaran</button>')}</div>` : '';
  const shared = hasM && hasR && d.round ? (d.rounds || []).filter(x => x.period !== d.period && x.status !== 'batal' && x.ref_month === d.month) : [];
  const sharedNote = shared.length ? `<div class="per-warn" style="margin:0 20px 12px">Iuran Wajib <b>${esc(MONTH(d.month))}</b> juga dipakai oleh ${shared.map(x => esc(PER(x.period))).join(', ')}, jadi pembayaran bulan ini tampil di putaran-putaran tersebut. Agar periodenya terpisah, ubah tanggal pelaksanaan putaran ke bulan yang berbeda. ${adm('<button onclick="openRounds()">Kelola putaran</button>')}</div>` : '';
  const cell = (r, t) => { const p = r.paid[t.id];
    if (p) return `<td>${pill('ok', ic('check', 13) + 'Lunas')}<div class="rc"><a class="lnk" onclick="finReceipt(${r.member_id},${t.id})" title="Lihat kuitansi">${ic('receipt', 13)} ${esc(p.receipt_no)}</a>${adm(`<a class="lnk d" onclick="finVoid(${p.pid})" title="Batalkan pembayaran ini">Batalkan</a>`)}</div></td>`;
    return `<td>${!canPay(t) ? '<span class="muted" title="Putaran belum dibuka / belum ada putaran aktif">—</span>' : isA() ? `<button class="btn-s pay" onclick="finPay(${r.member_id},${t.id})">${ic('plus', 13)} Catat</button>` : pill('warn', 'Belum lunas')}</td>`; };
  const arrCell = r => { const a = arr[r.member_id]; if (!a) return '<span class="muted">—</span>';
    return `<div class="arr-cell">${pill('bad', ic('alert', 13) + a.reduce((s, x) => s + x.n, 0) + ' tagihan · Rp ' + num(a.reduce((s, x) => s + x.total, 0)))}${adm(`<button class="btn-s" onclick="finSettle(${r.member_id})">Lunasi</button><button class="btn-s ico" onclick="finWa(${r.member_id})" title="Kirim pengingat lewat WhatsApp" aria-label="Kirim pengingat lewat WhatsApp">${ic('bell', 15)}</button>`)}</div>`; };
  return `<div class="fin-kpis">${st}${drawCard}</div>
  <div class="card"><div class="card-head"><div><h3>Iuran ${esc(ttl)}</h3><span>${T.map(t => `${esc(t.name)} Rp ${num(t.amount)}`).join(' • ')}</span></div><span class="fin-act">${adm(`<button class="primary" onclick="waGroup()">${ic('bell', 16)} Ingatkan grup</button> <button class="ghost" onclick="finFee()">${ic('gear', 16)} Atur iuran</button>`)}</span></div>
  ${note}${sharedNote}<div class="fin-bar">${rsel}
   <div class="seg" role="group" aria-label="Filter status">${[['all', 'Semua'], ['belum', 'Belum lunas'], ['lunas', 'Lunas']].map(([k, l]) => `<button class="${FIN.flt === k ? 'on' : ''}" aria-pressed="${FIN.flt === k}" onclick="finFlt('${k}')">${l}<em>${cnt[k]}</em></button>`).join('')}</div>
   <input class="search" type="search" aria-label="Cari anggota" placeholder="Cari nama anggota…" value="${esc(FIN.q)}" oninput="finQ(this.value)" id="finSearch"></div>
  <div class="tscroll"><table class="table fin-table stk"><thead><tr><th>Anggota</th>${T.map(t => `<th>${esc(t.name)}<small>Rp ${num(t.amount)} → <span class="fd" style="--c:${FUNDC[t.fund]}">${FUND[t.fund]}</span></small><small class="per">Periode: ${esc(t.schedule === 'putaran' ? (d.round ? PERX(d.period) : 'belum ada putaran') : MONTH(d.month))}</small></th>`).join('')}${showDraw ? '<th>Syarat kocok</th>' : ''}<th>Tunggakan</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${who(r.name, r.relation)}</td>${T.map(t => cell(r, t)).join('')}${showDraw ? `<td>${r.can_draw ? pill('ok', ic('check', 13) + 'Layak') : pill('warn', 'Belum layak')}</td>` : ''}<td>${arrCell(r)}</td></tr>`).join('') || `<tr><td colspan="${T.length + 3}"><div class="empty">${ic('users', 26)}<b>Tidak ada anggota yang cocok</b><span>Ubah kata pencarian atau filter status di atas.</span></div></td></tr>`}</tbody></table></div>
  <div class="fin-foot">Menampilkan ${rows.length} dari ${nAll} anggota</div></div>`;
}

// ---------------- Halaman Arisan ----------------
R.arisan = async () => {
  const d = await loadPay();
  $('#arisan').innerHTML = hero('Monitoring Arisan', 'Iuran per putaran arisan (dan iuran bulanan bila ada), kelayakan ikut kocok, dan status pembayaran tiap anggota.') + iuranBlock(d);
};

// ---------------- Halaman Keuangan ----------------
const TABS = [['ringkasan', 'Ringkasan', 'grid'], ['iuran', 'Iuran', 'receipt'], ['bukukas', 'Buku Kas', 'book'], ['tunggakan', 'Tunggakan', 'alert']];
R.keuangan = async () => {
  const body = await ({ ringkasan: tabRingkasan, iuran: tabIuran, bukukas: tabBuku, tunggakan: tabTunggakan }[FIN.tab] || tabRingkasan)();
  $('#keuangan').innerHTML = hero('Keuangan Keluarga', 'Saldo, iuran, tunggakan, dan buku kas dalam satu tempat. Dana Arisan dan Kas Wajib dibukukan terpisah.')
    + `<div class="fin-tabs" role="tablist" aria-label="Bagian keuangan">${TABS.map(([k, l, i]) => `<button role="tab" aria-selected="${FIN.tab === k}" class="${FIN.tab === k ? 'on' : ''}" onclick="finTab('${k}')">${ic(i, 16)}<span>${l}</span></button>`).join('')}</div>` + body;
};
const finTab = k => { FIN.tab = k; reload(); };

function cashChart(mo) {
  if (!mo.length) return `<div class="empty">${ic('book', 26)}<b>Belum ada transaksi</b><span>Grafik muncul setelah ada pemasukan atau pengeluaran.</span></div>`;
  const W = 720, H = 220, ML = 58, MT = 12, MB = 28, PW = W - ML - 10, gw = PW / mo.length, bw = Math.min(30, gw * .3);
  const mx = niceMax(Math.max(1, ...mo.map(m => Math.max(m.masuk_arisan + m.masuk_kas, m.keluar)))), y = v => MT + H - v / mx * H;
  const grid = [0, 1, 2, 3, 4].map(i => { const v = mx / 4 * i, yy = y(v); return `<line x1="${ML}" x2="${W - 10}" y1="${yy}" y2="${yy}" stroke="currentColor" opacity="${i ? .1 : .28}"/><text x="${ML - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="currentColor" opacity=".7">${cmp(v)}</text>`; }).join('');
  const bars = mo.map((m, i) => { const cx = ML + gw * i + gw / 2, a = m.masuk_arisan / mx * H, k = m.masuk_kas / mx * H, o = m.keluar / mx * H, x1 = cx - bw - 2, x2 = cx + 2;
    return `<g><title>${esc(MONTH(m.m))}: masuk Rp ${num(m.masuk_arisan + m.masuk_kas)} (arisan ${num(m.masuk_arisan)}, wajib ${num(m.masuk_kas)}), keluar Rp ${num(m.keluar)}</title>`
      + (k > 0 ? `<rect x="${x1}" y="${MT + H - k}" width="${bw}" height="${k}" fill="${FUNDC.kas}" rx="3"/>` : '') + (a > 0 ? `<rect x="${x1}" y="${MT + H - k - a}" width="${bw}" height="${a}" fill="${FUNDC.arisan}" rx="3"/>` : '') + (o > 0 ? `<rect x="${x2}" y="${MT + H - o}" width="${bw}" height="${o}" fill="${OUTC}" rx="3"/>` : '')
      + `<text x="${cx}" y="${MT + H + 19}" text-anchor="middle" font-size="12" fill="currentColor" opacity=".78">${esc(monS(m.m).split(' ')[0])}</text></g>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${MT + H + MB}" class="fin-chart" role="img" aria-label="Grafik arus kas ${mo.length} bulan terakhir: pemasukan dan pengeluaran tiap bulan">${grid}${bars}</svg>`;
}

async function tabRingkasan() {
  const d = await api('fin/dashboard'); FIN.pend = d.pending; const tot = d.funds.reduce((s, f) => s + f.saldo, 0), ar = d.funds.find(f => f.fund === 'arisan').saldo, kas = d.funds.find(f => f.fund === 'kas').saldo, pend = d.pending, pendAmt = pend.reduce((s, p) => s + p.amount, 0);
  const mo = d.monthly, sIn = mo.reduce((s, m) => s + m.masuk_arisan + m.masuk_kas, 0), sOut = mo.reduce((s, m) => s + m.keluar, 0), net = sIn - sOut, noArr = !d.arrears.amount;
  const cards = [
    kpi('k-total', 'Total saldo', 'wallet', money(tot), 'Dana Arisan + Kas Wajib'),
    kpi('k-arisan', 'Dana Arisan', 'target', money(ar), pendAmt ? `<span class="tone-warn">Rp ${num(pendAmt)} menunggu dicairkan</span>` : 'Dana titipan · semua sudah dicairkan'),
    kpi('k-kas', 'Kas Wajib', 'bank', money(kas), 'Pergerakan bulan ini', `<div class="kpi-flow"><span class="up">${ic('up', 13)} Masuk <b>Rp ${num(d.month.masuk)}</b></span><span class="down">${ic('down', 13)} Keluar <b>Rp ${num(d.month.keluar)}</b></span></div>`),
    kpi(noArr ? 'k-ok' : 'k-warn', 'Tunggakan', noArr ? 'check' : 'alert', money(d.arrears.amount), noArr ? 'Tidak ada tunggakan' : `${d.arrears.members} anggota menunggak`)];
  const prog = d.types.map(t => { const pc = t.members ? Math.round(t.paid / t.members * 100) : 0;
    return `<div class="fin-prog"><div class="split"><b>${esc(t.name)} <small class="muted">· ${esc(FP(t, t.key))}</small></b><span class="pct">${pc}%</span></div><div class="progress" role="progressbar" aria-label="${esc(t.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}"><span style="width:${pc}%;background:${FUNDC[t.fund]}"></span></div><div class="meta"><span>${t.paid} dari ${t.members} anggota lunas</span><span>Rp ${num(t.realized)} dari Rp ${num(t.members * t.amount)}</span></div><div class="tags"><span class="fd" style="--c:${FUNDC[t.fund]}">${FUND[t.fund]}</span>${t.required ? '<span class="cat">Syarat ikut kocok</span>' : ''}</div></div>`; }).join('');
  return `<div class="fin-kpis">${cards.join('')}</div>
  ${pend.length ? `<div class="card fin-pend"><div class="card-head"><div><h3>Dana arisan menunggu dicairkan</h3><span>Pemenang sudah disahkan · ${pend.length} putaran</span></div></div>${pend.map((p, i) => `<div class="pend-row">${who(p.winner, 'Arisan ' + PERX(p.period) + ' · terkumpul Rp ' + num(p.collected) + (p.disbursed ? ' · sudah dicairkan Rp ' + num(p.disbursed) : ''))}<div class="pend-amt"><small>Siap dicairkan</small>Rp ${num(p.amount)}</div>${adm(`<button class="primary" onclick="finDisburse(${i})">Cairkan</button>`)}</div>`).join('')}</div>` : ''}
  <div class="content2"><div class="card chart-card"><div class="card-head"><div><h3>Arus kas ${mo.length || 6} bulan terakhir</h3><span>Pemasukan dan pengeluaran per bulan, dalam rupiah</span></div></div><div class="fin-chartbox">${cashChart(mo)}</div>
  <div class="legend"><span><i style="background:${FUNDC.arisan}"></i>Masuk Dana Arisan</span><span><i style="background:${FUNDC.kas}"></i>Masuk Kas Wajib</span><span><i style="background:${OUTC}"></i>Keluar</span></div>
  ${mo.length ? `<div class="fin-sumrow"><div><small>Total masuk</small><b class="in">Rp ${num(sIn)}</b></div><div><small>Total keluar</small><b class="out">Rp ${num(sOut)}</b></div><div><small>Selisih</small><b class="${net < 0 ? 'out' : 'in'}">${net < 0 ? '−' : '+'}Rp ${num(Math.abs(net))}</b></div></div>` : ''}</div>
  <div class="card"><div class="card-head"><div><h3>Status iuran ${esc(d.round ? PER(d.period) : 'arisan')}</h3><span>${d.types[0] ? d.types[0].members + ' anggota terdaftar' : ''}</span></div></div><div class="fin-progwrap">${prog}
  <button class="primary fin-cta" onclick="finTab('iuran')">${ic('plus', 16)} Catat pembayaran</button></div></div></div>
  <div class="fin-links card"><div class="fl-ic">${ic('file', 22)}</div><div class="fl-tx"><b>Laporan keuangan</b><small>Posisi kas, rincian kategori, realisasi iuran, buku kas, kepatuhan &amp; tunggakan — cetak PDF atau ekspor Excel.</small></div><button class="primary" onclick="showPage('laporan')">Buka laporan ${ic('next', 16)}</button></div>`;
}

async function tabIuran() { const d = await loadPay(); return iuranBlock(d); }

async function tabBuku() {
  const cfg = await getCfg(), L = FIN.lg; if (!L.from) { L.from = cfg.month + '-01'; L.to = lastDay(cfg.month); }
  const r = FIN.led = await api('fin/ledger', 'GET', { from: L.from, to: L.to, fund: L.fund, limit: 1500 }); CACHE.tx = r.rows;
  return `<div id="bukuWrap">${bukuInner(r)}</div>`;
}
function bukuInner(r) {
  const L = FIN.lg, q = L.q.toLowerCase(), rows = r.rows.filter(x => !q || (x.description + ' ' + x.category + ' ' + (x.receipt_no || '')).toLowerCase().includes(q)), inn = rows.filter(x => x.type === 'masuk'), out = rows.filter(x => x.type === 'keluar'), mk = inn.reduce((s, x) => s + x.amount, 0), kl = out.reduce((s, x) => s + x.amount, 0);
  const closing = r.rows.length ? r.rows[r.rows.length - 1].bal : r.opening, D = { day: 'numeric', month: 'long', year: 'numeric' };
  return `<div class="fin-kpis">${[
    kpi('k-flat', 'Saldo awal', 'wallet', money(r.opening), 'Per ' + fd(L.from, D)),
    kpi('k-in', 'Penerimaan', 'up', money(mk), inn.length + ' transaksi'),
    kpi('k-out', 'Pengeluaran', 'down', money(kl), out.length + ' transaksi'),
    kpi('k-total', 'Saldo akhir', 'bank', money(closing), 'Per ' + fd(L.to, D))].join('')}</div>
  <div class="card"><div class="card-head"><div><h3>Buku Kas${L.fund ? ' — ' + FUND[L.fund] : ''}</h3><span>${r.total} transaksi${r.truncated ? ' · ditampilkan 1.500 pertama' : ''}</span></div>${adm(`<button class="primary" onclick="addTx()">${ic('plus', 16)} Tambah transaksi</button>`)}</div>
  <div class="fin-bar"><div class="seg" role="group" aria-label="Filter dana">${[['', 'Semua dana'], ['arisan', 'Dana Arisan'], ['kas', 'Kas Wajib']].map(([k, l]) => `<button class="${L.fund === k ? 'on' : ''}" aria-pressed="${L.fund === k}" onclick="finLg('fund','${k}')">${l}</button>`).join('')}</div>
   <label class="mini">Dari <input type="date" value="${L.from}" onchange="finLg('from',this.value)"></label><label class="mini">Sampai <input type="date" value="${L.to}" onchange="finLg('to',this.value)"></label>
   <input class="search" type="search" aria-label="Cari transaksi" placeholder="Cari keterangan, kategori, no. bukti…" value="${esc(L.q)}" oninput="finLgQ(this.value)" id="finSearch"></div>
  <div class="tscroll"><table class="table fin-table bk"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Dana</th><th class="r">Masuk (Rp)</th><th class="r">Keluar (Rp)</th><th class="r">Saldo (Rp)</th><th><span class="sr">Aksi</span></th></tr></thead><tbody>
  <tr class="opn"><td>${fd(L.from)}</td><td colspan="5"><i>Saldo awal periode</i></td><td class="r money">${num(r.opening)}</td><td></td></tr>
  ${rows.map(x => `<tr><td class="nw">${fd(x.date)}</td><td>${esc(x.description)}${x.receipt_no ? `<small class="sub">${esc(x.receipt_no)}</small>` : ''}</td><td><span class="cat">${esc(x.category)}</span></td><td><span class="fd" style="--c:${FUNDC[x.fund]}">${FUND[x.fund]}</span></td>
   <td class="r money in">${x.type === 'masuk' ? '+' + num(x.amount) : ''}</td><td class="r money out">${x.type === 'keluar' ? '−' + num(x.amount) : ''}</td><td class="r money">${L.q ? '' : num(x.bal)}</td>
   <td class="nw">${adm(x.category === 'Pencairan Arisan' ? `<button class="btn-s d" onclick="finUndis(${x.id})">Batalkan</button>` : x.payment_id ? '' : `<button class="btn-s" onclick="finEditTx(${x.id})">Ubah</button>`)}</td></tr>`).join('') || `<tr><td colspan="8"><div class="empty">${ic('book', 26)}<b>Belum ada transaksi</b><span>Tidak ada transaksi pada rentang tanggal atau filter ini.</span></div></td></tr>`}</tbody>
  ${rows.length ? `<tfoot><tr><td colspan="4">Total periode (${rows.length} transaksi)</td><td class="r money in">+${num(mk)}</td><td class="r money out">−${num(kl)}</td><td class="r money">${L.q ? '' : num(closing)}</td><td></td></tr></tfoot>` : ''}</table></div>
  ${L.q ? '<div class="fin-foot">Saldo berjalan disembunyikan selama pencarian aktif, karena saldo hanya akurat pada daftar lengkap.</div>' : ''}</div>`;
}

async function tabTunggakan() {
  const ar = FIN.arr = await api('fin/arrears', 'GET', { cur: FIN.cur }), by = {}; ar.forEach(a => { (by[a.member_id] = by[a.member_id] || { name: a.name, phone: a.phone, items: [] }).items.push(a); });
  const mem = Object.entries(by), tot = ar.reduce((s, a) => s + a.total, 0), types = {}; ar.forEach(a => { types[a.type_name] = (types[a.type_name] || 0) + a.total; });
  const none = !mem.length;
  return `<div class="fin-kpis">${kpi(none ? 'k-ok' : 'k-warn', 'Anggota menunggak', 'users', String(mem.length), none ? 'Semua anggota sudah lunas' : 'Perlu ditindaklanjuti')}${kpi(none ? 'k-ok' : 'k-warn', 'Total tunggakan', none ? 'check' : 'alert', money(tot), none ? '' : 'Seluruh jenis iuran')}${Object.entries(types).map(([k, v]) => kpi('k-flat', esc(k), 'receipt', money(v), 'Tunggakan jenis ini')).join('')}</div>
  <div class="card"><div class="card-head"><div><h3>Daftar tunggakan</h3><span>Putaran selesai &amp; bulan sebelum bulan ini${FIN.cur ? ' + berjalan' : ''}</span></div><label class="chk"><input type="checkbox" ${FIN.cur ? 'checked' : ''} onchange="finCur(this.checked)"> Sertakan putaran/bulan berjalan</label></div>
  <div class="tscroll"><table class="table fin-table"><thead><tr><th>Anggota</th><th>Rincian</th><th class="r">Total (Rp)</th><th><span class="sr">Aksi</span></th></tr></thead><tbody>${mem.map(([id, m]) => `<tr><td>${who(m.name)}</td><td>${m.items.map(a => `<div class="arr"><b>${esc(a.type_name)}</b> <span class="muted">${a.n} ${UNIT(a)}</span><div>${a.periods.map(p => `<span class="chip s">${esc(arrLbl(a, p))}</span>`).join('')}</div></div>`).join('')}</td><td class="r money out">${num(m.items.reduce((s, a) => s + a.total, 0))}</td>
   <td class="nw">${adm(`<button class="btn-s" onclick="finSettle(${id})">Lunasi</button><button class="btn-s" onclick="finWaArr(${id})">${ic('bell', 14)} Ingatkan</button>`)}</td></tr>`).join('') || `<tr><td colspan="4"><div class="empty ok">${ic('check', 28)}<b>Tidak ada tunggakan</b><span>Semua iuran sampai periode ini sudah lunas.</span></div></td></tr>`}</tbody></table></div></div>`;
}

// ---------------- Penghubung inline-handler ----------------
const dbc = (f, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
function relocal(wrap, html, inputId) {   // render ulang tanpa ke server; pertahankan fokus kotak cari
  const w = $(wrap); if (!w) return; const had = document.activeElement && document.activeElement.id === inputId; w.innerHTML = html;
  if (had) { const s = $('#' + inputId); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}
Object.assign(window, {
  finClose, finDone: done, finPay: payDlg, finVoid: voidPay, finReceipt: receiptFor, finSettle: settleDlg, finFee: feeDlg, finDisburse: disburseDlg, finUndis: undisburse, finTab, addTx, wa, waGroup, finWa: wa, finWaArr: waArr,
  finPerR: k => { FIN.per = k || null; reload(); }, finResetView: () => { FIN.per = null; }, finCur: v => { FIN.cur = v; reload(); },
  finFlt: k => { FIN.flt = k; relocal('#iuranWrap', iuranInner(FIN.pay), 'finSearch'); },
  finQ: dbc(v => { FIN.q = v; relocal('#iuranWrap', iuranInner(FIN.pay), 'finSearch'); }),
  finLg: (k, v) => { FIN.lg[k] = v; reload(); },
  finLgQ: dbc(v => { FIN.lg.q = v; relocal('#bukuWrap', bukuInner(FIN.led), 'finSearch'); }),
  finEditTx: id => { const t = (CACHE.tx || []).find(x => x.id === id); if (t) txDlg(t); },
});
})();
