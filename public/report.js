// ============================================================
// Laporan keuangan profesional (v2.6)
// Satu model dokumen {judul, bagian[{kolom, baris, foot}]} -> pratinjau layar, cetak/PDF A4, Excel (.xlsx), CSV.
// Semua angka berasal dari fungsi database (finance_summary, finance_ledger, iuran_recap, iuran_arrears, compliance_matrix).
// ============================================================
(() => {
const FUND = { arisan: 'Dana Arisan', kas: 'Kas Wajib' };
const pad = n => String(n).padStart(2, '0'), num = n => Number(n || 0).toLocaleString('id-ID');
const lastDay = p => { const [y, m] = p.split('-').map(Number); return p + '-' + pad(new Date(y, m, 0).getDate()); };
const addM = (p, n) => { const [y, m] = p.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const monS = p => MONTH(p).slice(0, 3) + ' ' + p.slice(2, 4);
const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
let CFG = null;
window.getCfg = async () => CFG || (CFG = await api('fin/config'));
window.resetCfg = () => { CFG = null; };

// ---------------- Gaya dokumen (dipakai pratinjau & cetak) ----------------
const RPT_BASE = `*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font:12px/1.5 "Segoe UI",Roboto,Arial,sans-serif}
@page{size:A4;margin:14mm}`;
const RPT_DOC = `.rpt,.rpt *,.rcp,.rcp *{box-sizing:border-box}
.rpt{max-width:920px;margin:0 auto;padding:30px 36px;background:#fff;color:#111;font:12px/1.5 "Segoe UI",Roboto,Arial,sans-serif;text-align:left}
.rpt-kop{text-align:center;border-bottom:3px double #222;padding-bottom:10px;margin-bottom:14px}
.rpt-org{font-size:19px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.rpt-sub{font-size:11px;color:#555;margin-top:2px}
.rpt h1{font-size:16px;text-align:center;margin:12px 0 2px;text-transform:uppercase;letter-spacing:.07em;color:#111}
.rpt-per{text-align:center;color:#444;margin-bottom:14px;font-size:12px}
.rpt h2{font-size:12.5px;margin:20px 0 7px;padding:5px 9px;background:#eef1f9;border-left:4px solid #5a48f0;color:#111}
.rpt table{width:100%;border-collapse:collapse;font-size:11px;background:#fff}
.rpt th{background:#f1f3f9;border:1px solid #c5cbdc;padding:5px 7px;text-align:left;color:#111;font-weight:700}
.rpt td{border:1px solid #dde1ec;padding:4px 7px;background:#fff;color:#111}
.rpt .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.rpt .c{text-align:center}
.rpt tr.foot td{font-weight:700;background:#f6f7fb}.rpt tr.open td{background:#fafbfd;font-style:italic}
.rpt .neg{color:#b3261e}.rpt .muted{color:#777}.rpt .note{font-size:10px;color:#555;margin:5px 0 0}
.rpt .kpi{display:flex;gap:10px;margin:6px 0 4px}.rpt .kpi div{flex:1;border:1px solid #dde1ec;border-radius:8px;padding:8px 10px}.rpt .kpi small{display:block;color:#666;font-size:10px}.rpt .kpi b{font-size:14px}
.rpt-sign{display:flex;justify-content:space-between;margin-top:36px;page-break-inside:avoid}.rpt-sign>div{width:42%;text-align:center}.rpt-sign .sp{height:64px}
.rpt-sign b{display:inline-block;border-top:1px solid #222;padding-top:3px;min-width:180px}
.rpt-foot{margin-top:20px;font-size:9.5px;color:#777;text-align:center;border-top:1px solid #ddd;padding-top:6px}
.rcp{max-width:640px;margin:20px auto;border:2px solid #222;border-radius:10px;padding:22px 26px;font:13px/1.6 "Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff}
.rcp-h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:12px}
.rcp-h b{font-size:16px;text-transform:uppercase;letter-spacing:.04em}.rcp-h small{display:block;color:#555;font-size:11px;letter-spacing:.08em}
.rcp-no{font-weight:700;border:1px solid #222;padding:4px 10px;border-radius:6px;font-size:12px}
.rcp table{width:100%;border-collapse:collapse}.rcp td{padding:4px 0;vertical-align:top}.rcp td:first-child{width:140px;color:#444}
.rcp-amt{display:inline-block;margin:14px 0 4px;padding:8px 18px;border:2px solid #222;border-radius:8px;font-size:20px;font-weight:800}
.rcp-sign{text-align:center;float:right;margin-top:6px;width:210px}.rcp-sign .sp{height:56px}.rcp-sign b{border-top:1px solid #222;display:inline-block;padding-top:3px;min-width:170px}
.rcp-clr{clear:both}
@media print{.rpt{max-width:none;padding:0}.rpt h2{break-after:avoid}.rpt tr{break-inside:avoid}.rpt thead{display:table-header-group}.rcp{margin:0 auto}}`;
const RPT_CSS = RPT_BASE + RPT_DOC;
if (!document.getElementById('rptCss')) { const st = document.createElement('style'); st.id = 'rptCss'; st.textContent = RPT_DOC; document.head.appendChild(st); }   // gaya pratinjau di halaman (ber-scope .rpt)
window.RPT_CSS = RPT_CSS;
window.rptNum = num;

function rptPrint(body, title) {   // cetak lewat iframe terpisah agar tidak terpengaruh tema aplikasi
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f); const d = f.contentWindow.document; d.open();
  d.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${RPT_CSS}</style></head><body>${body}</body></html>`); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Tidak bisa membuka dialog cetak. Gunakan Ctrl+P.'); } setTimeout(() => f.remove(), 2500); }, 300);
}
window.rptPrint = rptPrint;

// ---------------- Render dokumen ----------------
const FMT = { t: v => esc(v ?? ''), c: v => esc(v ?? ''), n: v => v === '' || v == null ? '' : num(v), rp: v => v === '' || v == null ? '' : v < 0 ? `<span class="neg">(${num(-v)})</span>` : num(v), pct: v => v === '' || v == null ? '' : Math.round(v * 100) + '%' };
const CLS = { t: '', c: 'c', n: 'r', rp: 'r', pct: 'r' };
function docHtml(rep) {
  const sec = rep.sections.map(s => `<h2>${esc(s.title)}</h2>${s.kpi ? `<div class="kpi">${s.kpi.map(k => `<div><small>${esc(k[0])}</small><b>${esc(k[1])}</b></div>`).join('')}</div>` : ''}${s.cols ? `<table><thead><tr>${s.cols.map(c => `<th class="${CLS[c.k]}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(r => `<tr class="${r._open ? 'open' : ''}">${s.cols.map((c, i) => `<td class="${CLS[c.k]}">${FMT[c.k](r[i])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.cols.length}" class="c muted">${esc(s.empty || 'Tidak ada data')}</td></tr>`}${(s.foot || []).map(r => `<tr class="foot">${s.cols.map((c, i) => `<td class="${CLS[c.k]}">${FMT[c.k](r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}`).join('');
  const dt = rep.printed.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="rpt"><div class="rpt-kop"><div class="rpt-org">${esc(rep.org)}</div><div class="rpt-sub">Laporan keuangan • disusun dari pembukuan FamilyHub</div></div>
  <h1>${esc(rep.title)}</h1><div class="rpt-per">${esc(rep.subtitle)}</div>${sec}
  <div class="rpt-sign"><div>Mengetahui,<br>Ketua<div class="sp"></div><b>${esc(rep.chair || '(                              )')}</b></div><div>${esc(dt)}<br>Bendahara<div class="sp"></div><b>${esc(rep.treasurer || '(                              )')}</b></div></div>
  <div class="rpt-foot">Dicetak ${esc(dt)} oleh ${esc(rep.by)} • Dokumen ini dihasilkan otomatis dari data pembukuan dan sah tanpa tanda tangan basah bila telah diverifikasi pengurus.</div></div>`;
}

// ---------------- Ekspor ----------------
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const fname = (rep, ext) => `${slug(rep.title)}_${rep.from}_${rep.to}.${ext}`;
function rptCsv(rep) {   // pemisah titik-koma agar terbuka rapi di Excel berlokal Indonesia
  const q = v => { if (v == null) return ''; const s = String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, L = [rep.org, rep.title, 'Periode;' + rep.subtitle, ''];
  for (const s of rep.sections) { L.push(s.title); if (s.cols) { L.push(s.cols.map(c => q(c.h)).join(';')); s.rows.forEach(r => L.push(s.cols.map((c, i) => q(r[i])).join(';'))); (s.foot || []).forEach(r => L.push(s.cols.map((c, i) => q(r[i])).join(';'))); } if (s.note) L.push(q(s.note)); L.push(''); }
  download(new Blob(['\uFEFF' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fname(rep, 'csv'));
}
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = () => window.XLSX ? ok(window.XLSX) : bad(); s.onerror = bad; document.head.appendChild(s); });
}
async function rptXlsx(rep) {
  let X; try { X = await loadXlsx(); } catch (e) { toast('Pustaka Excel tidak bisa dimuat (periksa koneksi). Mengunduh CSV sebagai gantinya.'); return rptCsv(rep); }
  const wb = X.utils.book_new(), used = new Set(), dt = rep.printed.toLocaleString('id-ID');
  const sheetName = (t, i) => { let n = t.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Data'; let k = n, j = 2; while (used.has(k.toLowerCase())) k = n.slice(0, 26) + ' ' + j++; used.add(k.toLowerCase()); return k; };
  used.add('sampul');
  const cover = [[rep.org], [rep.title], ['Periode', rep.subtitle], ['Dicetak', dt], ['Oleh', rep.by], ['Ketua', rep.chair || ''], ['Bendahara', rep.treasurer || ''], [], ['Isi lembar kerja:']];
  const names = rep.sections.filter(s => s.cols).map((s, i) => sheetName(s.sn || s.title, i)); names.forEach((n, i) => cover.push([n]));
  const cs = X.utils.aoa_to_sheet(cover); cs['!cols'] = [{ wch: 34 }, { wch: 40 }]; X.utils.book_append_sheet(wb, cs, 'Sampul');
  rep.sections.filter(s => s.cols).forEach((s, si) => {
    const aoa = [[s.title], [], s.cols.map(c => c.h)]; s.rows.forEach(r => aoa.push(s.cols.map((c, i) => r[i] ?? ''))); (s.foot || []).forEach(r => aoa.push(s.cols.map((c, i) => r[i] ?? ''))); if (s.note) { aoa.push([]); aoa.push([s.note]); }
    const ws = X.utils.aoa_to_sheet(aoa);
    aoa.forEach((row, ri) => { if (ri < 3) return; s.cols.forEach((c, ci) => { const ref = X.utils.encode_cell({ r: ri, c: ci }), cell = ws[ref]; if (cell && typeof cell.v === 'number') cell.z = c.k === 'pct' ? '0%' : '#,##0'; }); });
    ws['!cols'] = s.cols.map((c, ci) => ({ wch: Math.min(48, Math.max(c.h.length + 2, ...aoa.slice(3).map(r => String(r[ci] ?? '').length + 2), c.k === 't' ? 12 : 10)) }));
    X.utils.book_append_sheet(wb, ws, names[si]);
  });
  X.writeFile(wb, fname(rep, 'xlsx'));
}
window.rptCsv = rptCsv; window.rptXlsx = rptXlsx;

// ---------------- Pembangun laporan ----------------
function rangeLabel(from, to) {
  const mf = from.slice(0, 7), mt = to.slice(0, 7), D = { day: 'numeric', month: 'long', year: 'numeric' };
  if (from.endsWith('-01') && to === lastDay(mt)) {
    if (mf === mt) return MONTH(mf);
    if (from.slice(5) === '01-01' && to.slice(5) === '12-31' && from.slice(0, 4) === to.slice(0, 4)) return 'Tahun ' + from.slice(0, 4);
    return MONTH(mf) + ' – ' + MONTH(mt);
  }
  return fd(from, D) + ' – ' + fd(to, D);
}
const sum = (a, f) => a.reduce((s, x) => s + Number(f(x) || 0), 0);

async function buildRep(kind, o) {
  const cfg = await getCfg(), M = cfg.meta, { from, to } = o, mf = from.slice(0, 7), mt = to.slice(0, 7);
  const rep = { kind, org: M.org, treasurer: M.treasurer, chair: M.chair, from, to, by: ME.name, printed: new Date(), subtitle: 'Periode: ' + rangeLabel(from, to), sections: [] };
  if (kind === 'ringkasan') {
    rep.title = 'Laporan Keuangan';
    const start = (new Date(mt + '-01') - new Date(mf + '-01')) / 864e5 > 1070 ? addM(mt, -35) : mf;
    const [sm, rc, ar, pc] = await Promise.all([api('fin/summary', 'GET', { from, to }), api('fin/recap', 'GET', { from: start, to: mt }), api('fin/arrears', 'GET', { cur: false }), api('fin/ledger', 'GET', { from, to, category: 'Pencairan Arisan', limit: 2000 })]);
    const T = k => sum(sm.funds, f => f[k]);
    rep.sections.push({ title: 'A. Posisi Kas per Dana (Rp)', cols: [{ h: 'Dana', k: 't' }, { h: 'Saldo Awal', k: 'rp' }, { h: 'Penerimaan', k: 'rp' }, { h: 'Pengeluaran', k: 'rp' }, { h: 'Saldo Akhir', k: 'rp' }],
      rows: sm.funds.map(f => [FUND[f.fund], f.opening, f.masuk, f.keluar, f.closing]), foot: [['Total Kas', T('opening'), T('masuk'), T('keluar'), T('closing')]],
      note: 'Dana Arisan adalah dana titipan anggota yang dicairkan kepada pemenang; Kas Wajib adalah milik bersama untuk kebutuhan operasional dan sosial keluarga.' });
    const cm = sm.categories, tm = sum(cm.filter(c => c.type === 'masuk'), c => c.total), tk = sum(cm.filter(c => c.type === 'keluar'), c => c.total);
    rep.sections.push({ title: 'B. Rincian Penerimaan & Pengeluaran per Kategori (Rp)', cols: [{ h: 'Jenis', k: 't' }, { h: 'Dana', k: 't' }, { h: 'Kategori', k: 't' }, { h: 'Transaksi', k: 'n' }, { h: 'Jumlah', k: 'rp' }],
      rows: cm.map(c => [c.type === 'masuk' ? 'Penerimaan' : 'Pengeluaran', FUND[c.fund], c.category, c.n, c.total]), empty: 'Tidak ada transaksi pada periode ini',
      foot: [['Total Penerimaan', '', '', sum(cm.filter(c => c.type === 'masuk'), c => c.n), tm], ['Total Pengeluaran', '', '', sum(cm.filter(c => c.type === 'keluar'), c => c.n), tk], ['Surplus / (Defisit)', '', '', '', tm - tk]] });
    const tgt = r => r.members * r.amount;
    const rows = rc.map(r => [MONTH(r.period), r.name, tgt(r), r.realized, Math.max(0, tgt(r) - r.realized), `${r.paid}/${r.members}`, r.members ? Math.min(1, r.paid / r.members) : 0]);
    const types = [...new Set(rc.map(r => r.type_id))], foot = types.map(id => { const x = rc.filter(r => r.type_id === id), t = sum(x, tgt), re = sum(x, r => r.realized), p = sum(x, r => r.paid), m = sum(x, r => r.members); return ['Total ' + x[0].name, '', t, re, Math.max(0, t - re), `${p}/${m}`, m ? Math.min(1, p / m) : 0]; });
    rep.sections.push({ title: 'C. Realisasi Iuran per Periode', cols: [{ h: 'Periode', k: 't' }, { h: 'Jenis Iuran', k: 't' }, { h: 'Target', k: 'rp' }, { h: 'Realisasi', k: 'rp' }, { h: 'Kurang', k: 'rp' }, { h: 'Lunas', k: 'c' }, { h: 'Kepatuhan', k: 'pct' }], rows, foot,
      note: 'Target = jumlah anggota aktif × tarif iuran berlaku. Realisasi memuat seluruh pembayaran yang tercatat untuk periode tersebut (termasuk pembayaran susulan).', empty: 'Belum ada periode iuran dalam rentang ini' });
    rep.sections.push({ title: 'D. Pencairan Dana Arisan kepada Pemenang (Rp)', cols: [{ h: 'Tanggal', k: 't' }, { h: 'Periode Arisan', k: 't' }, { h: 'Penerima', k: 't' }, { h: 'Jumlah', k: 'rp' }],
      rows: pc.rows.map(r => [fd(r.date, { day: '2-digit', month: 'short', year: 'numeric' }), r.period ? MONTH(r.period) : '-', r.description.split(' - ').slice(1).join(' - ') || r.description, r.amount]), foot: pc.rows.length ? [['Total pencairan', '', '', sum(pc.rows, r => r.amount)]] : [], empty: 'Tidak ada pencairan pada periode ini' });
    rep.sections.push({ title: 'E. Tunggakan Iuran Anggota (posisi saat laporan dicetak)', cols: [{ h: 'Anggota', k: 't' }, { h: 'Jenis Iuran', k: 't' }, { h: 'Bulan', k: 'n' }, { h: 'Periode belum dibayar', k: 't' }, { h: 'Jumlah (Rp)', k: 'rp' }],
      rows: ar.map(a => [a.name, a.type_name, a.n, a.periods.map(monS).join(', '), a.total]), foot: ar.length ? [['Total tunggakan', '', sum(ar, a => a.n), '', sum(ar, a => a.total)]] : [], empty: 'Tidak ada tunggakan 🎉', note: 'Tunggakan dihitung untuk periode sebelum bulan berjalan, sejak iuran mulai berlaku.' });
    ['Posisi Kas', 'Per Kategori', 'Realisasi Iuran', 'Pencairan Arisan', 'Tunggakan'].forEach((n, i) => { rep.sections[i].sn = n; });
  } else if (kind === 'bukukas') {
    const fundTxt = o.fund ? FUND[o.fund] : 'Semua Dana (konsolidasi)'; rep.title = 'Buku Kas — ' + fundTxt;
    const L = await api('fin/ledger', 'GET', { from, to, fund: o.fund, limit: 5000 }), r = L.rows;
    const fl = f => FUND[f] || f, mk = sum(r.filter(x => x.type === 'masuk'), x => x.amount), kl = sum(r.filter(x => x.type === 'keluar'), x => x.amount), close = r.length ? r[r.length - 1].bal : L.opening;
    rep.sections.push({ sn: 'Buku Kas', title: 'Buku Kas ' + fundTxt + ' (Rp)', cols: [{ h: 'Tanggal', k: 't' }, { h: 'No. Bukti', k: 't' }, { h: 'Keterangan', k: 't' }, { h: 'Kategori', k: 't' }, { h: 'Dana', k: 't' }, { h: 'Penerimaan', k: 'rp' }, { h: 'Pengeluaran', k: 'rp' }, { h: 'Saldo', k: 'rp' }],
      rows: [Object.assign(['', '', 'Saldo awal', '', '', '', '', L.opening], { _open: 1 })].concat(r.map(x => [fd(x.date, { day: '2-digit', month: 'short', year: 'numeric' }), x.receipt_no || '', x.description, x.category, fl(x.fund), x.type === 'masuk' ? x.amount : '', x.type === 'keluar' ? x.amount : '', x.bal])),
      foot: [['', '', 'Jumlah / Saldo akhir', '', '', mk, kl, close]], note: L.truncated ? `Menampilkan ${r.length} dari ${L.total} transaksi. Persempit rentang tanggal untuk melihat seluruhnya.` : `${L.total} transaksi.` });
  } else if (kind === 'kepatuhan') {
    const year = +to.slice(0, 4); rep.title = 'Rekap Kepatuhan Iuran'; rep.subtitle = 'Tahun ' + year; rep.from = year + '-01-01'; rep.to = year + '-12-31';
    for (const t of cfg.types.filter(t => t.active)) {
      const mx = await api('fin/matrix', 'GET', { year, type: t.id }), mk = c => c === '1' ? '✓' : c === '0' ? '✗' : '–';
      const per = i => [...mx].reduce((s, r) => s + (r.m[i] === '1' ? 1 : 0), 0), tot = sum(mx, r => [...r.m].filter(c => c === '1').length);
      rep.sections.push({ sn: t.name.replace('Iuran', 'Kepatuhan'), title: `${t.name} — ${FUND[t.fund]} (Rp ${num(t.amount)}/bulan)`, cols: [{ h: 'Anggota', k: 't' }, ...MS.map(m => ({ h: m, k: 'c' })), { h: 'Lunas', k: 'n' }],
        rows: mx.map(r => [r.name, ...[...r.m].map(mk), [...r.m].filter(c => c === '1').length]), foot: [['Lunas per bulan', ...MS.map((m, i) => per(i)), tot]], note: '✓ lunas   ✗ belum dibayar   – belum berlaku / belum jatuh tempo' });
    }
  } else if (kind === 'tunggakan') {
    rep.title = 'Daftar Tunggakan Iuran'; rep.subtitle = 'Posisi per ' + fd(new Date().toISOString().slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) + (o.cur ? ' (termasuk bulan berjalan)' : '');
    const ar = await api('fin/arrears', 'GET', { cur: !!o.cur }), by = {}; ar.forEach(a => { const x = by[a.type_name] = by[a.type_name] || { m: 0, n: 0, t: 0 }; x.m++; x.n += a.n; x.t += a.total; });
    rep.sections.push({ sn: 'Ringkasan', title: 'Ringkasan per Jenis Iuran', cols: [{ h: 'Jenis Iuran', k: 't' }, { h: 'Anggota menunggak', k: 'n' }, { h: 'Jumlah bulan', k: 'n' }, { h: 'Nilai (Rp)', k: 'rp' }], rows: Object.entries(by).map(([k, v]) => [k, v.m, v.n, v.t]), foot: ar.length ? [['Total', new Set(ar.map(a => a.member_id)).size, sum(ar, a => a.n), sum(ar, a => a.total)]] : [], empty: 'Tidak ada tunggakan 🎉' });
    rep.sections.push({ sn: 'Rincian', title: 'Rincian per Anggota', cols: [{ h: 'Anggota', k: 't' }, { h: 'No. HP', k: 't' }, { h: 'Jenis Iuran', k: 't' }, { h: 'Bulan', k: 'n' }, { h: 'Periode belum dibayar', k: 't' }, { h: 'Jumlah (Rp)', k: 'rp' }], rows: ar.map(a => [a.name, a.phone || '', a.type_name, a.n, a.periods.map(monS).join(', '), a.total]), foot: ar.length ? [['Total tunggakan', '', '', sum(ar, a => a.n), '', sum(ar, a => a.total)]] : [], empty: 'Tidak ada tunggakan 🎉' });
  }
  return rep;
}

// ---------------- Halaman Laporan ----------------
const RP = window.RPT = window.RPT || { kind: 'ringkasan', preset: 'bulan', from: null, to: null, fund: '', cur: false, rep: null };
const KINDS = [['ringkasan', 'Laporan Keuangan (ringkasan)'], ['bukukas', 'Buku Kas'], ['kepatuhan', 'Rekap Kepatuhan Iuran'], ['tunggakan', 'Daftar Tunggakan']];
const PRESETS = [['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['kuartal', 'Kuartal ini'], ['tahun', 'Tahun ini'], ['tahunlalu', 'Tahun lalu'], ['custom', 'Pilih tanggal…']];
function presetRange(p, cur) {   // cur = periode berjalan 'YYYY-MM' dari server
  const y = +cur.slice(0, 4), m = +cur.slice(5);
  if (p === 'bulan') return [cur + '-01', lastDay(cur)];
  if (p === 'lalu') { const l = addM(cur, -1); return [l + '-01', lastDay(l)]; }
  if (p === 'kuartal') { const q = Math.floor((m - 1) / 3) * 3 + 1, s = y + '-' + pad(q), e = addM(s, 2); return [s + '-01', lastDay(e)]; }
  if (p === 'tahun') return [y + '-01-01', y + '-12-31'];
  if (p === 'tahunlalu') return [(y - 1) + '-01-01', (y - 1) + '-12-31'];
  return null;
}
R.laporan = async () => {
  const cfg = await getCfg(); if (RP.preset !== 'custom' || !RP.from) { const r = presetRange(RP.preset === 'custom' ? 'bulan' : RP.preset, cfg.period); RP.from = r[0]; RP.to = r[1]; }
  $('#laporan').innerHTML = `<div class="no-print">${hero('Laporan Keuangan', 'Laporan profesional siap cetak (PDF), Excel, dan CSV — dari pembukuan Dana Arisan & Kas Wajib.')}</div>
  <div class="card no-print rpt-ctl"><div class="rpt-row">
    <label>Jenis laporan<select class="select" id="rpKind">${KINDS.map(k => `<option value="${k[0]}" ${RP.kind === k[0] ? 'selected' : ''}>${k[1]}</option>`).join('')}</select></label>
    <label>Periode<select class="select" id="rpPre">${PRESETS.map(k => `<option value="${k[0]}" ${RP.preset === k[0] ? 'selected' : ''}>${k[1]}</option>`).join('')}</select></label>
    <label class="${RP.preset === 'custom' ? '' : 'hid'}" id="rpFromL">Dari<input type="date" id="rpFrom" value="${RP.from}"></label>
    <label class="${RP.preset === 'custom' ? '' : 'hid'}" id="rpToL">Sampai<input type="date" id="rpTo" value="${RP.to}"></label>
    <label class="${RP.kind === 'bukukas' ? '' : 'hid'}" id="rpFundL">Dana<select class="select" id="rpFund"><option value="">Semua dana</option><option value="arisan" ${RP.fund === 'arisan' ? 'selected' : ''}>Dana Arisan</option><option value="kas" ${RP.fund === 'kas' ? 'selected' : ''}>Kas Wajib</option></select></label>
    <label class="chk ${RP.kind === 'tunggakan' ? '' : 'hid'}" id="rpCurL"><input type="checkbox" id="rpCur" ${RP.cur ? 'checked' : ''}> Sertakan bulan berjalan</label>
  </div><div class="rpt-act"><button class="primary" id="rpPrint">🖨 Cetak / PDF</button><button class="primary" id="rpXls">▦ Excel</button><button class="ghost" id="rpCsv">CSV</button>${adm('<button class="ghost" id="rpMeta">⚙ Identitas laporan</button>')}</div></div>
  <div id="rptDoc" class="rpt-wrap"><div class="rpt-load">Menyusun laporan…</div></div>`;
  const ch = () => { RP.kind = $('#rpKind').value; RP.preset = $('#rpPre').value; RP.fund = $('#rpFund').value; RP.cur = $('#rpCur').checked;
    if (RP.preset === 'custom') { RP.from = $('#rpFrom').value || RP.from; RP.to = $('#rpTo').value || RP.to; } else { const r = presetRange(RP.preset, cfg.period); RP.from = r[0]; RP.to = r[1]; }
    if (RP.from > RP.to) { toast('Tanggal "Dari" harus sebelum "Sampai"'); return; } reload(); };
  ['rpKind', 'rpPre', 'rpFund', 'rpCur', 'rpFrom', 'rpTo'].forEach(id => $('#' + id).onchange = ch);
  const doc = $('#rptDoc');
  try { RP.rep = await buildRep(RP.kind, RP); doc.innerHTML = docHtml(RP.rep); } catch (e) { doc.innerHTML = '<div class="rpt-load">Gagal menyusun laporan.</div>'; throw e; }
  $('#rpPrint').onclick = () => rptPrint(docHtml(RP.rep), RP.rep.title + ' ' + RP.rep.subtitle);
  $('#rpXls').onclick = () => rptXlsx(RP.rep); $('#rpCsv').onclick = () => rptCsv(RP.rep);
  const mb = $('#rpMeta'); if (mb) mb.onclick = () => openForm('Identitas Laporan', [{ k: 'org', l: 'Nama organisasi / keluarga', req: 1 }, { k: 'treasurer', l: 'Nama Bendahara' }, { k: 'chair', l: 'Nama Ketua' }], cfg.meta, async b => { await api('fin/meta', 'PUT', b); resetCfg(); });
};
window.RPTAPI = { docHtml, buildRep };
})();
