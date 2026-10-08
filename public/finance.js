// ============================================================
// Keuangan profesional (v2.6): dua jenis iuran (Arisan & Wajib), dua dana (Dana Arisan & Kas Wajib),
// kuitansi, tunggakan, pencairan arisan, buku kas.
// ============================================================
(() => {
const FUND = { arisan: 'Dana Arisan', kas: 'Kas Wajib' }, FUNDC = { arisan: '#6957ff', kas: '#17b9a0' };
const FIN = { tab: 'ringkasan', per: null, flt: 'all', q: '', lg: { fund: '', from: null, to: null, q: '' }, cur: false, pay: null, arr: null };
const pad = n => String(n).padStart(2, '0'), num = n => Number(n || 0).toLocaleString('id-ID');
const addM = (p, n) => { const [y, m] = p.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const lastDay = p => { const [y, m] = p.split('-').map(Number); return p + '-' + pad(new Date(y, m, 0).getDate()); };
const monS = p => MONTH(p).slice(0, 3) + ' ' + p.slice(2, 4);
const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------------- Modal ----------------
function finModal(html, cls = '') {
  let m = $('#finModal'); if (!m) { m = document.createElement('div'); m.id = 'finModal'; m.className = 'modal'; m.innerHTML = '<div class="modal-box fin-box" id="finBox"></div>'; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) finClose(); }); }
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
  return `<div class="rcp"><div class="rcp-h"><div><b>${esc(cfg.meta.org)}</b><small>KUITANSI PEMBAYARAN IURAN</small></div><div class="rcp-no">No. ${esc(r.no)}</div></div>
  <table><tr><td>Telah terima dari</td><td>: <b>${esc(r.name)}</b></td></tr><tr><td>Untuk pembayaran</td><td>: ${esc(r.jenis)} — ${esc(MONTH(r.period))}</td></tr><tr><td>Metode</td><td>: ${esc(r.method)}</td></tr><tr><td>Terbilang</td><td>: <i>${esc(terbilang(r.amount))} rupiah</i></td></tr></table>
  <div class="rcp-amt">Rp ${num(r.amount)}</div><div class="rcp-sign">${esc(d)}<br>Penerima / Bendahara<div class="sp"></div><b>${esc(cfg.meta.treasurer || '(                         )')}</b></div><div class="rcp-clr"></div></div>`;
}
async function showReceipt(r) {
  const body = await receiptBody(r); window._rcp = body;
  finModal(`<h3>Kuitansi</h3><div class="rcp-prev">${body}</div><div class="row"><button class="ghost" onclick="finClose()">Tutup</button><button class="primary" onclick="rptPrint(window._rcp,'Kuitansi ${esc(r.no)}')">🖨 Cetak kuitansi</button></div>`, 'wide');
}
function rcpOf(name, t, p, period) { return { no: p.receipt_no, name, jenis: t.name, period, amount: p.amount, method: p.method, paid_at: p.paid_at }; }
function receiptFor(mid, tid) { const r = FIN.pay.rows.find(x => x.member_id === mid), t = FIN.pay.types.find(x => x.id === tid), p = r && r.paid[tid]; if (p) showReceipt(rcpOf(r.name, t, p, FIN.pay.period)); }

// ---------------- Catat / batalkan pembayaran ----------------
function payDlg(mid, tid) {
  const r = FIN.pay.rows.find(x => x.member_id === mid), t = FIN.pay.types.find(x => x.id === tid), per = FIN.pay.period;
  finModal(`<h3>Catat Pembayaran</h3><div class="fin-sum"><div><small>Anggota</small><b>${esc(r.name)}</b></div><div><small>Jenis iuran</small><b>${esc(t.name)}</b></div><div><small>Periode</small><b>${esc(MONTH(per))}</b></div><div><small>Nominal</small><b class="big">Rp ${num(t.amount)}</b></div></div>
  <p class="muted" style="margin:6px 0 12px;font-size:12px">Masuk ke <b>${FUND[t.fund]}</b>${t.required_for_draw ? ' • syarat ikut kocok' : ''}.</p>
  <label class="flab">Metode pembayaran<select id="payMeth" class="select"><option>Tunai</option><option>Transfer</option><option>Lainnya</option></select></label>
  <div class="row"><button class="ghost" onclick="finClose()">Batal</button><button class="primary" id="payGo">Simpan pembayaran</button></div>`);
  $('#payGo').onclick = guard(async () => {
    $('#payGo').disabled = true; const meth = $('#payMeth').value;
    try { const x = await api('payments', 'POST', { member_id: mid, period: per, type: tid, method: meth });
      finModal(`<div class="fin-ok"><div class="ck">✓</div><h3>Pembayaran tercatat</h3><p>${esc(r.name)} • ${esc(t.name)} • ${esc(MONTH(per))}<br><b>Rp ${num(t.amount)}</b></p><p class="muted">No. kuitansi <b>${esc(x.receipt_no)}</b></p></div>
      <div class="row"><button class="ghost" onclick="finDone()">Selesai</button><button class="primary" id="payRc">🖨 Cetak kuitansi</button></div>`);
      $('#payRc').onclick = async () => rptPrint(await receiptBody({ no: x.receipt_no, name: r.name, jenis: t.name, period: per, amount: x.amount, method: meth, paid_at: new Date() }), 'Kuitansi ' + x.receipt_no);
      reloadBg();
    } catch (e) { $('#payGo').disabled = false; throw e; }
  });
}
const reloadBg = () => { clearTimeout(reloadBg._t); reloadBg._t = setTimeout(reload, 50); };
const voidPay = guard(async (pid) => { const why = prompt('Batalkan pembayaran ini?\nAlasan pembatalan (opsional):'); if (why === null) return; await api('payments/' + pid, 'DELETE', { reason: why }); toast('Pembayaran dibatalkan'); reload(); });

// ---------------- Pelunasan tunggakan (beberapa bulan sekaligus) ----------------
async function settleDlg(mid) {
  const arr = (await api('fin/arrears', 'GET', { cur: FIN.cur })).filter(a => a.member_id === mid); if (!arr.length) return toast('Anggota ini tidak punya tunggakan');
  finModal(`<h3>Lunasi Tunggakan</h3><p style="margin:0 0 10px"><b>${esc(arr[0].name)}</b></p>${arr.map(a => `<div class="stl"><div class="stl-h"><b>${esc(a.type_name)}</b><small>Rp ${num(a.amount)}/bulan</small></div><div class="stl-p">${a.periods.map(p => `<label class="chip"><input type="checkbox" data-t="${a.type_id}" data-p="${p}" data-a="${a.amount}" checked> ${monS(p)}</label>`).join('')}</div></div>`).join('')}
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
    <div class="fee-g"><label class="flab">Nama<input name="name" value="${esc(t.name)}"></label><label class="flab">Nominal / bulan (Rp)<input name="amount" type="number" min="1" value="${t.amount}"></label>
    <label class="flab">Berlaku mulai<input name="start" type="month" value="${t.start_period}"></label></div>
    <label class="chk"><input type="checkbox" name="required" ${t.required_for_draw ? 'checked' : ''}> Wajib lunas untuk ikut kocok arisan</label><label class="chk"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Iuran aktif</label></fieldset>`).join('')}
  <fieldset class="fee"><legend>Identitas laporan</legend><div class="fee-g"><label class="flab" style="grid-column:span 3">Nama organisasi / keluarga<input id="mOrg" value="${esc(cfg.meta.org)}"></label><label class="flab" style="grid-column:span 2">Bendahara<input id="mTre" value="${esc(cfg.meta.treasurer)}"></label><label class="flab">Ketua<input id="mCha" value="${esc(cfg.meta.chair)}"></label></div></fieldset>
  <div class="row"><button class="ghost" onclick="finClose()">Batal</button><button class="primary" id="feeGo">Simpan pengaturan</button></div>`, 'wide');
  $('#feeGo').onclick = guard(async () => {
    $('#feeGo').disabled = true;
    try { for (const f of $('#finBox').querySelectorAll('fieldset.fee[data-id]')) {
        const g = n => f.querySelector(`[name=${n}]`); await api('fin/feetype', 'PUT', { id: +f.dataset.id, name: g('name').value, amount: g('amount').value, start: g('start').value, required: g('required').checked, active: g('active').checked }); }
      await api('fin/meta', 'PUT', { org: $('#mOrg').value, treasurer: $('#mTre').value, chair: $('#mCha').value }); resetCfg(); toast('Pengaturan tersimpan'); done();
    } catch (e) { $('#feeGo').disabled = false; throw e; }
  });
}

// ---------------- Pencairan arisan ----------------
function disburseDlg(i) {
  const p = FIN.pend[i]; if (!p) return;
  finModal(`<h3>Cairkan Dana Arisan</h3><div class="fin-sum"><div><small>Periode</small><b>${esc(MONTH(p.period))}</b></div><div><small>Penerima (pemenang)</small><b>${esc(p.winner)}</b></div><div><small>Terkumpul</small><b>Rp ${num(p.collected)}</b></div><div><small>Sudah dicairkan</small><b>Rp ${num(p.disbursed)}</b></div></div>
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
function arrearsText(a) { return a.map(x => `${x.type_name}: ${x.periods.map(monS).join(', ')} (${x.n} bln, Rp ${num(x.total)})`).join('; '); }
function wa(id) {
  const d = FIN.pay, r = d.rows.find(x => x.member_id === id), n = waNum(r.phone); if (!n) return toast('Nomor HP ' + r.name + ' belum diisi (menu Anggota → Ubah)');
  const un = d.types.filter(t => !r.paid[t.id]), ar = (FIN.arr || []).filter(a => a.member_id === id);
  const txt = `Halo ${r.name}, pengingat iuran ${MONTH(d.period)}${un.length ? ': ' + un.map(t => `${t.name} Rp ${num(t.amount)}`).join(', ') : ''}.` + (ar.length ? `\nTunggakan: ${arrearsText(ar)}.` : '') + '\nTerima kasih 🙏';
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(txt), '_blank');
}
function waGroup() {
  const d = FIN.pay, un = d.rows.filter(r => d.types.some(t => !r.paid[t.id])); if (!un.length) return toast('Semua anggota sudah lunas 🎉');
  window.open('https://wa.me/?text=' + encodeURIComponent(`Pengingat iuran ${MONTH(d.period)}:\n${d.types.map(t => `• ${t.name}: Rp ${num(t.amount)}`).join('\n')}\n\nBelum lunas:\n` + un.map((r, i) => `${i + 1}. ${r.name} (${d.types.filter(t => !r.paid[t.id]).map(t => t.name.replace('Iuran ', '')).join(', ')})`).join('\n') + '\nTerima kasih 🙏'), '_blank');
}
function waArr(mid) {
  const ar = (FIN.arr || []).filter(a => a.member_id === mid); if (!ar.length) return; const n = waNum(ar[0].phone); if (!n) return toast('Nomor HP ' + ar[0].name + ' belum diisi (menu Anggota → Ubah)');
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(`Halo ${ar[0].name}, pengingat tunggakan iuran: ${arrearsText(ar)}. Total Rp ${num(ar.reduce((s, x) => s + x.total, 0))}.\nTerima kasih 🙏`), '_blank');
}

// ---------------- Blok daftar iuran (dipakai halaman Keuangan & Arisan) ----------------
async function loadPay() { const cfg = await getCfg(); FIN.per = FIN.per || cfg.period; const [d, ar] = await Promise.all([api('payments', 'GET', { period: FIN.per }), api('fin/arrears', 'GET', { cur: false })]); FIN.pay = window._pay = d; FIN.arr = ar; return d; }
function iuranBlock(d) { return `<div id="iuranWrap">${iuranInner(d)}</div>`; }
function iuranInner(d) {
  const T = d.types, showDraw = T.some(t => t.required_for_draw), arr = {}; FIN.arr.forEach(a => { (arr[a.member_id] = arr[a.member_id] || []).push(a); });
  const rows = d.rows.filter(r => (FIN.flt === 'all' || (FIN.flt === 'belum' ? T.some(t => !r.paid[t.id]) : T.every(t => r.paid[t.id]))) && (!FIN.q || r.name.toLowerCase().includes(FIN.q.toLowerCase())));
  const st = T.map(t => { const p = d.rows.filter(r => r.paid[t.id]).length, real = d.rows.reduce((s, r) => s + (r.paid[t.id] ? r.paid[t.id].amount : 0), 0), tgt = d.rows.length * t.amount, pc = d.rows.length ? Math.round(p / d.rows.length * 100) : 0;
    return `<div class="card stat fin-st"><span class="stat-label">${esc(t.name)} <i class="dot" style="background:${FUNDC[t.fund]}"></i></span><h2>${p}/${d.rows.length} <small>lunas</small></h2><div class="progress"><span style="width:${pc}%;background:${FUNDC[t.fund]}"></span></div><small>Rp ${num(real)} dari Rp ${num(tgt)} • ${pc}%</small></div>`; }).join('');
  const lay = d.rows.filter(r => r.can_draw).length;
  const cell = (r, t) => { const p = r.paid[t.id]; return p ? `<td><span class="status">✓ Lunas</span><div class="rc"><a class="lnk" onclick="finReceipt(${r.member_id},${t.id})" title="Lihat kuitansi">🧾 ${esc(p.receipt_no)}</a>${adm(`<a class="lnk d" onclick="finVoid(${p.pid})" title="Batalkan pembayaran">✕</a>`)}</div></td>`
    : `<td>${isA() ? `<button class="btn-s pay" onclick="finPay(${r.member_id},${t.id})">＋ Catat</button>` : '<span class="status pending">Belum</span>'}</td>`; };
  return `<div class="grid4 fin-stats">${st}${showDraw ? `<div class="card stat fin-st"><span class="stat-label">Layak ikut kocok</span><h2>${lay}/${d.rows.length}</h2><small>${T.filter(t => t.required_for_draw).map(t => esc(t.name)).join(' + ')} lunas</small></div>` : ''}</div>
  <div class="card"><div class="card-head"><div><h3>Iuran ${esc(MONTH(d.period))}</h3><span>${T.map(t => `${esc(t.name)} Rp ${num(t.amount)}`).join(' • ')}</span></div><span class="fin-act">${adm('<button class="primary" onclick="waGroup()">💬 Ingatkan grup</button> <button class="ghost" onclick="finFee()">⚙ Atur iuran</button>')}</span></div>
  <div class="fin-bar"><div class="seg"><button onclick="finPer('${addM(d.period, -1)}')">‹</button><input type="month" value="${d.period}" onchange="finPer(this.value)"><button onclick="finPer('${addM(d.period, 1)}')">›</button></div>
   <div class="seg">${[['all', 'Semua'], ['belum', 'Belum lunas'], ['lunas', 'Lunas']].map(([k, l]) => `<button class="${FIN.flt === k ? 'on' : ''}" onclick="finFlt('${k}')">${l}</button>`).join('')}</div>
   <input class="search" placeholder="Cari nama anggota…" value="${esc(FIN.q)}" oninput="finQ(this.value)" id="finSearch"></div>
  <div class="tscroll"><table class="table"><thead><tr><th>Anggota</th>${T.map(t => `<th>${esc(t.name)}<br><small class="muted">Rp ${num(t.amount)} → ${FUND[t.fund]}</small></th>`).join('')}${showDraw ? '<th>Syarat kocok</th>' : ''}<th>Tunggakan</th></tr></thead><tbody>
  ${rows.map(r => { const a = arr[r.member_id]; return `<tr><td><b>${esc(r.name)}</b><br><small class="muted">${esc(r.relation || '')}</small></td>${T.map(t => cell(r, t)).join('')}${showDraw ? `<td>${r.can_draw ? '<span class="status">✓ Layak</span>' : '<span class="status pending">Belum</span>'}</td>` : ''}
   <td>${a ? `<span class="status bad">⚠ ${a.reduce((s, x) => s + x.n, 0)} bln • Rp ${num(a.reduce((s, x) => s + x.total, 0))}</span>${adm(` <button class="btn-s" onclick="finSettle(${r.member_id})">Lunasi</button><button class="btn-s" onclick="finWa(${r.member_id})">💬</button>`)}` : '<span class="muted">—</span>'}</td></tr>`; }).join('') || `<tr><td colspan="${T.length + 3}" class="c muted" style="padding:24px">Tidak ada anggota yang cocok.</td></tr>`}</tbody></table></div></div>`;
}

// ---------------- Halaman Arisan ----------------
R.arisan = async () => {
  const d = await loadPay();
  $('#arisan').innerHTML = hero('Monitoring Arisan', 'Iuran arisan & iuran wajib bulan ini, kelayakan ikut kocok, dan status pembayaran tiap anggota.') + iuranBlock(d);
};

// ---------------- Halaman Keuangan ----------------
const TABS = [['ringkasan', 'Ringkasan'], ['iuran', 'Iuran'], ['bukukas', 'Buku Kas'], ['tunggakan', 'Tunggakan']];
R.keuangan = async () => {
  const body = await ({ ringkasan: tabRingkasan, iuran: tabIuran, bukukas: tabBuku, tunggakan: tabTunggakan }[FIN.tab] || tabRingkasan)();
  $('#keuangan').innerHTML = hero('Keuangan Keluarga', 'Pembukuan terpisah Dana Arisan & Kas Wajib: iuran, tunggakan, pencairan, dan buku kas.') + `<div class="fin-tabs">${TABS.map(([k, l]) => `<button class="${FIN.tab === k ? 'on' : ''}" onclick="finTab('${k}')">${l}</button>`).join('')}</div>` + body;
};
const finTab = k => { FIN.tab = k; reload(); };

async function tabRingkasan() {
  const d = await api('fin/dashboard'); FIN.pend = d.pending; const tot = d.funds.reduce((s, f) => s + f.saldo, 0), ar = d.funds.find(f => f.fund === 'arisan').saldo, kas = d.funds.find(f => f.fund === 'kas').saldo, pend = d.pending, pendAmt = pend.reduce((s, p) => s + p.amount, 0);
  const cards = [['Total Saldo', tot, '◆', 'Dana Arisan + Kas Wajib'], ['Dana Arisan', ar, '◎', pendAmt ? `Rp ${num(pendAmt)} menunggu dicairkan` : 'Dana titipan • semua sudah dicairkan'], ['Kas Wajib', kas, '▣', `Bulan ini +${num(d.month.masuk)} / −${num(d.month.keluar)}`], ['Tunggakan', d.arrears.amount, '⚠', `${d.arrears.members} anggota menunggak`]];
  const mo = d.monthly, mx = Math.max(1, ...mo.map(m => Math.max(m.masuk_arisan + m.masuk_kas, m.keluar))), W = 700, H = 210, bw = mo.length ? W / mo.length : W;
  const chart = mo.length ? `<svg viewBox="0 0 ${W} ${H + 26}" class="fin-chart" role="img" aria-label="Arus kas 6 bulan">${mo.map((m, i) => { const x = i * bw + bw * .14, w = bw * .3, a = m.masuk_arisan / mx * H, k = m.masuk_kas / mx * H, o = m.keluar / mx * H;
    return `<g><title>${MONTH(m.m)}: masuk ${num(m.masuk_arisan + m.masuk_kas)} (arisan ${num(m.masuk_arisan)}, wajib ${num(m.masuk_kas)}), keluar ${num(m.keluar)}</title><rect x="${x}" y="${H - a - k}" width="${w}" height="${a}" fill="${FUNDC.arisan}" rx="3"/><rect x="${x}" y="${H - k}" width="${w}" height="${k}" fill="${FUNDC.kas}" rx="3"/><rect x="${x + w + 5}" y="${H - o}" width="${w}" height="${o}" fill="#f0996b" rx="3"/><text x="${i * bw + bw / 2}" y="${H + 18}" text-anchor="middle" font-size="12" fill="currentColor" opacity=".7">${monS(m.m).split(' ')[0]}</text></g>`; }).join('')}</svg>` : '<p class="muted">Belum ada transaksi.</p>';
  return `<div class="grid4">${cards.map(c => `<div class="card stat"><div class="stat-top"><span class="stat-label">${c[0]}</span><div class="stat-icon">${c[2]}</div></div><h2>${rp(c[1])}</h2><small>${c[3]}</small></div>`).join('')}</div>
  ${pend.length ? `<div class="card fin-pend"><div class="card-head"><div><h3>Dana arisan menunggu dicairkan</h3><span>PEMENANG SUDAH DISAHKAN</span></div></div>${pend.map((p, i) => `<div class="pend-row"><div><b>${esc(p.winner)}</b><small>Arisan ${esc(MONTH(p.period))} • terkumpul Rp ${num(p.collected)}${p.disbursed ? ` • sudah dicairkan Rp ${num(p.disbursed)}` : ''}</small></div><div class="pend-amt">Rp ${num(p.amount)}</div>${adm(`<button class="primary" onclick="finDisburse(${i})">Cairkan</button>`)}</div>`).join('')}</div>` : ''}
  <div class="content2"><div class="card chart-card"><div class="card-head"><h3>Arus kas 6 bulan</h3><span>Rp</span></div><div style="padding:6px 20px 4px">${chart}</div><div class="legend"><span><i style="background:${FUNDC.arisan}"></i>Masuk Dana Arisan</span><span><i style="background:${FUNDC.kas}"></i>Masuk Kas Wajib</span><span><i style="background:#f0996b"></i>Keluar</span></div></div>
  <div class="card"><div class="card-head"><h3>Iuran ${esc(MONTH(d.period))}</h3><span>${d.types[0] ? d.types[0].members + ' ANGGOTA' : ''}</span></div><div style="padding:0 20px 20px">${d.types.map(t => { const pc = t.members ? Math.round(t.paid / t.members * 100) : 0; return `<div class="fin-prog"><div class="split"><b>${esc(t.name)}</b><span>${t.paid}/${t.members} • ${pc}%</span></div><div class="progress"><span style="width:${pc}%;background:${FUNDC[t.fund]}"></span></div><small class="muted">Rp ${num(t.realized)} dari Rp ${num(t.members * t.amount)} → ${FUND[t.fund]}${t.required ? ' • syarat kocok' : ''}</small></div>`; }).join('')}
  <button class="primary" style="width:100%;margin-top:6px" onclick="finTab('iuran')">Catat pembayaran</button></div></div></div>
  <div class="fin-links card"><div><b>Laporan keuangan</b><small>Posisi kas, rincian kategori, realisasi iuran, buku kas, kepatuhan & tunggakan — cetak PDF atau ekspor Excel.</small></div><button class="primary" onclick="showPage('laporan')">Buka laporan →</button></div>`;
}

async function tabIuran() { const d = await loadPay(); return iuranBlock(d); }

async function tabBuku() {
  const cfg = await getCfg(), L = FIN.lg; if (!L.from) { L.from = cfg.period + '-01'; L.to = lastDay(cfg.period); }
  const r = FIN.led = await api('fin/ledger', 'GET', { from: L.from, to: L.to, fund: L.fund, limit: 1500 }); CACHE.tx = r.rows;
  return `<div id="bukuWrap">${bukuInner(r)}</div>`;
}
function bukuInner(r) {
  const L = FIN.lg, q = L.q.toLowerCase(), rows = r.rows.filter(x => !q || (x.description + ' ' + x.category + ' ' + (x.receipt_no || '')).toLowerCase().includes(q)), mk = rows.filter(x => x.type === 'masuk').reduce((s, x) => s + x.amount, 0), kl = rows.filter(x => x.type === 'keluar').reduce((s, x) => s + x.amount, 0);
  return `<div class="grid4">${[['Saldo awal', r.opening], ['Penerimaan', mk], ['Pengeluaran', kl], ['Saldo akhir', r.rows.length ? r.rows[r.rows.length - 1].bal : r.opening]].map(s => `<div class="card stat"><span class="stat-label">${s[0]}</span><h2>${rp(s[1])}</h2></div>`).join('')}</div>
  <div class="card"><div class="card-head"><div><h3>Buku Kas${L.fund ? ' — ' + FUND[L.fund] : ''}</h3><span>${r.total} TRANSAKSI${r.truncated ? ' • DITAMPILKAN 1.500 PERTAMA' : ''}</span></div>${adm('<button class="primary" onclick="addTx()">＋ Transaksi</button>')}</div>
  <div class="fin-bar"><div class="seg">${[['', 'Semua dana'], ['arisan', 'Dana Arisan'], ['kas', 'Kas Wajib']].map(([k, l]) => `<button class="${L.fund === k ? 'on' : ''}" onclick="finLg('fund','${k}')">${l}</button>`).join('')}</div>
   <label class="mini">Dari <input type="date" value="${L.from}" onchange="finLg('from',this.value)"></label><label class="mini">Sampai <input type="date" value="${L.to}" onchange="finLg('to',this.value)"></label>
   <input class="search" placeholder="Cari keterangan / kategori / no. bukti…" value="${esc(L.q)}" oninput="finLgQ(this.value)" id="finSearch"></div>
  <div class="tscroll"><table class="table"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Dana</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th><th></th></tr></thead><tbody>
  <tr class="opn"><td>${fd(L.from)}</td><td colspan="5"><i>Saldo awal</i></td><td class="r money">${num(r.opening)}</td><td></td></tr>
  ${rows.map(x => `<tr><td>${fd(x.date)}</td><td>${esc(x.description)}${x.receipt_no ? `<br><small class="muted">${esc(x.receipt_no)}</small>` : ''}</td><td><span class="cat">${esc(x.category)}</span></td><td><span class="fd" style="--c:${FUNDC[x.fund]}">${FUND[x.fund]}</span></td>
   <td class="r money in">${x.type === 'masuk' ? num(x.amount) : ''}</td><td class="r money out">${x.type === 'keluar' ? num(x.amount) : ''}</td><td class="r money">${L.q ? '' : num(x.bal)}</td>
   <td>${adm(x.category === 'Pencairan Arisan' ? `<button class="btn-s d" onclick="finUndis(${x.id})">Batalkan</button>` : x.payment_id ? '' : `<button class="btn-s" onclick="finEditTx(${x.id})">Ubah</button>`)}</td></tr>`).join('') || '<tr><td colspan="8" class="c muted" style="padding:24px">Belum ada transaksi pada rentang ini.</td></tr>'}</tbody></table></div></div>`;
}

async function tabTunggakan() {
  const ar = FIN.arr = await api('fin/arrears', 'GET', { cur: FIN.cur }), by = {}; ar.forEach(a => { (by[a.member_id] = by[a.member_id] || { name: a.name, phone: a.phone, items: [] }).items.push(a); });
  const mem = Object.entries(by), tot = ar.reduce((s, a) => s + a.total, 0), types = {}; ar.forEach(a => { types[a.type_name] = (types[a.type_name] || 0) + a.total; });
  return `<div class="grid4"><div class="card stat"><span class="stat-label">Anggota menunggak</span><h2>${mem.length}</h2></div><div class="card stat"><span class="stat-label">Total tunggakan</span><h2>${rp(tot)}</h2></div>${Object.entries(types).map(([k, v]) => `<div class="card stat"><span class="stat-label">${esc(k)}</span><h2>${rp(v)}</h2></div>`).join('')}</div>
  <div class="card"><div class="card-head"><div><h3>Daftar tunggakan</h3><span>PERIODE SEBELUM BULAN BERJALAN${FIN.cur ? ' + BULAN BERJALAN' : ''}</span></div><label class="chk"><input type="checkbox" ${FIN.cur ? 'checked' : ''} onchange="finCur(this.checked)"> Sertakan bulan berjalan</label></div>
  <div class="tscroll"><table class="table"><thead><tr><th>Anggota</th><th>Rincian</th><th class="r">Total</th><th></th></tr></thead><tbody>${mem.map(([id, m]) => `<tr><td><b>${esc(m.name)}</b></td><td>${m.items.map(a => `<div class="arr"><b>${esc(a.type_name)}</b> <span class="muted">${a.n} bln</span><div>${a.periods.map(p => `<span class="chip s">${monS(p)}</span>`).join('')}</div></div>`).join('')}</td><td class="r money">${num(m.items.reduce((s, a) => s + a.total, 0))}</td>
   <td>${adm(`<button class="btn-s" onclick="finSettle(${id})">Lunasi</button><button class="btn-s" onclick="finWaArr(${id})">💬 Ingatkan</button>`)}</td></tr>`).join('') || '<tr><td colspan="4" class="c muted" style="padding:28px">Tidak ada tunggakan 🎉</td></tr>'}</tbody></table></div></div>`;
}

// ---------------- Penghubung inline-handler ----------------
const dbc = (f, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
function relocal(wrap, html, inputId) {   // render ulang tanpa ke server; pertahankan fokus kotak cari
  const w = $(wrap); if (!w) return; const had = document.activeElement && document.activeElement.id === inputId; w.innerHTML = html;
  if (had) { const s = $('#' + inputId); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}
Object.assign(window, {
  finClose, finDone: done, finPay: payDlg, finVoid: voidPay, finReceipt: receiptFor, finSettle: settleDlg, finFee: feeDlg, finDisburse: disburseDlg, finUndis: undisburse, finTab, addTx, wa, waGroup, finWa: wa, finWaArr: waArr,
  finPer: p => { if (/^\d{4}-\d{2}$/.test(p)) { FIN.per = p; reload(); } }, finCur: v => { FIN.cur = v; reload(); },
  finFlt: k => { FIN.flt = k; relocal('#iuranWrap', iuranInner(FIN.pay), 'finSearch'); },
  finQ: dbc(v => { FIN.q = v; relocal('#iuranWrap', iuranInner(FIN.pay), 'finSearch'); }),
  finLg: (k, v) => { FIN.lg[k] = v; reload(); },
  finLgQ: dbc(v => { FIN.lg.q = v; relocal('#bukuWrap', bukuInner(FIN.led), 'finSearch'); }),
  finEditTx: id => { const t = (CACHE.tx || []).find(x => x.id === id); if (t) txDlg(t); },
});
})();
