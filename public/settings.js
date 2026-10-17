// ============================================================
// Pengaturan (v3.2) — khusus admin
//   Umum & Logo · Backup & Pemulihan · Impor Data · Ekspor Data · Reset Data
// Operasi berisiko (restore, reset, impor massal) dijalankan oleh fungsi database yang atomik
// (supabase/patch-009-pengaturan.sql): bila gagal, tidak ada data yang berubah.
// ============================================================
(() => {
const VER = '3.18.0', LS = 'fh-brand';
const DEF = { name: 'FamilyHub', tagline: 'Arisan & Family Network', shape: 'rounded', logo: '' };
const SAFE_LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const ST = { tab: 'umum', ready: null, brand: { ...DEF }, pend: { ...DEF }, last: null, counts: null, rst: null, imp: { ds: 'anggota', res: null, skip: true } };

// Tabel yang ikut backup: [kunci, tabel, kolom urut]
const BK = [['settings', 'settings', 'k'], ['fee_types', 'fee_types', 'id'], ['members', 'members', 'id'], ['payments', 'payments', 'id'], ['transactions', 'transactions', 'id'],
  ['events', 'events', 'id'], ['announcements', 'announcements', 'id'], ['albums', 'albums', 'id'], ['photos', 'photos', 'id'], ['draws', 'draws', 'id'], ['activity', 'activity', 'id'], ['arisan_rounds', 'arisan_rounds', 'id']];
const OPT = new Set(['arisan_rounds']);   // bagian opsional: backup sebelum v3.16 tidak memilikinya (server membentuk putaran dari data lama / arisan_periods)
const TL = { members: 'Anggota', payments: 'Pembayaran iuran', transactions: 'Transaksi kas', fee_types: 'Jenis iuran', draws: 'Pengocokan', events: 'Agenda', announcements: 'Pengumuman', albums: 'Album', photos: 'Foto', activity: 'Log aktivitas', settings: 'Pengaturan', arisan_rounds: 'Putaran arisan' };

// ---------- Utilitas ----------
const E = id => document.getElementById(id), nf = n => Number(n || 0).toLocaleString('id-ID'), pad = n => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'familyhub';
const initials = n => { const w = String(n || '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || 'FH').slice(0, 2)).toUpperCase(); };
const wib = iso => iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 16) : '';
const when = iso => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const rel = iso => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' menit lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; const d = Math.floor(s / 86400); return d < 60 ? d + ' hari lalu' : fd(iso.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
async function sha256(s) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch { return ''; } }
async function readText(file) { const buf = await file.arrayBuffer(); try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); } }
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = '/vendor/xlsx-0.18.5.full.min.js'; s.onload = () => window.XLSX ? ok(window.XLSX) : bad(); s.onerror = bad; document.head.appendChild(s); });
}
// Panggilan RPC: bila fungsi belum ada (patch-009 belum dijalankan) tampilkan petunjuk yang jelas
async function rpc(fn, args) {
  const r = await sb.rpc(fn, args);
  if (!r.error) return r.data;
  if (r.error.code === 'PGRST202' || /could not find the function/i.test(r.error.message || '')) { ST.ready = false; toast('Database belum diperbarui — jalankan supabase/patch-009-pengaturan.sql'); throw 0; }
  return fail(r.error);
}
async function fetchAll(table, cols = '*', order = 'id') {
  const out = []; let from = 0;
  for (;;) {
    const r = await sb.from(table).select(cols).order(order, { ascending: true }).range(from, from + 999);
    if (r.error) return fail(r.error);
    out.push(...r.data); if (r.data.length < 1000) return out; from += 1000;
  }
}
async function loadCounts(force) {
  if (ST.counts && !force) return ST.counts;
  const names = Object.keys(TL), res = await Promise.all(names.map(t => sb.from(t).select('*', { count: 'exact', head: true })));
  return ST.counts = Object.fromEntries(names.map((t, i) => [t, res[i].error ? 0 : (res[i].count || 0)]));
}
const needSql = () => { if (ST.ready === false) { toast('Fitur ini memerlukan patch-009-pengaturan.sql (lihat peringatan di atas)'); return true; } return false; };

// ---------- Dialog, progres & hasil ----------
function stDialog({ title, html, phrase, okText = 'Lanjutkan', danger, checks = [] }) {
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'st-ov';
    el.innerHTML = `<div class="st-dlg" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="st-dbody">${html}</div>${checks.filter(Boolean).map(c => `<label class="st-chk"><input type="checkbox" data-c="${c.id}" ${c.checked ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}${phrase ? `<label class="st-confirm">Ketik <b>${esc(phrase)}</b> untuk melanjutkan<input id="stPh" autocomplete="off" spellcheck="false" placeholder="${esc(phrase)}"></label>` : ''}<div class="st-act"><button class="ghost st-btn" data-x="0">Batal</button><button class="st-btn ${danger ? 'st-danger' : 'primary'}" data-x="1" ${phrase ? 'disabled' : ''}>${esc(okText)}</button></div></div>`;
    const key = e => { if (e.key === 'Escape') done(false); };
    const done = ok => { document.removeEventListener('keydown', key); const cs = {}; el.querySelectorAll('[data-c]').forEach(i => cs[i.dataset.c] = i.checked); el.remove(); res({ ok, checks: cs }); };
    const go = el.querySelector('[data-x="1"]'), ph = el.querySelector('#stPh');
    el.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (x && !x.disabled) done(x.dataset.x === '1'); });
    if (ph) { ph.oninput = () => go.disabled = ph.value.trim() !== phrase; ph.onkeydown = e => { if (e.key === 'Enter' && !go.disabled) done(true); }; }
    document.addEventListener('keydown', key); document.body.appendChild(el); (ph || go).focus();
  });
}
function stBusy(msg) {
  const el = document.createElement('div'); el.className = 'st-ov';
  el.innerHTML = `<div class="st-dlg st-busy" role="alertdialog" aria-live="polite"><div class="st-spin"></div><h3>Mohon tunggu…</h3><div class="st-bar ind"><i></i></div><p></p></div>`;
  document.body.appendChild(el);
  const box = el.firstElementChild, bar = box.querySelector('.st-bar'), p = box.querySelector('p');
  return {
    set(m, pct) { p.textContent = m; bar.classList.toggle('ind', pct == null); bar.firstElementChild.style.width = pct == null ? '' : Math.round(pct * 100) + '%'; },
    result(ok, title, lines, onClose, btn = 'Tutup') {
      box.innerHTML = `<div class="ico ${ok ? '' : 'bad'}">${ok ? '✓' : '!'}</div><h3>${esc(title)}</h3><div class="res st-dbody"><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul></div><div class="st-act"><button class="primary st-btn">${esc(btn)}</button></div>`;
      box.querySelector('button').onclick = () => { el.remove(); onClose && onClose(); };
    },
    close() { el.remove(); }
  };
}
window.stBusy = stBusy;   // dipakai juga oleh print.js (Studio Cetak) — tanpa ini tombol SVG/PNG/Cetak gagal diam-diam
const setBtn = (b, on, txt) => { if (!b) return; if (on) { b._t = b.innerHTML; b.disabled = true; b.innerHTML = txt || '…'; } else { b.disabled = false; if (b._t != null) b.innerHTML = b._t; } };

// ---------- Identitas & logo ----------
function paintMark(el, b) {
  el.classList.remove('has-logo', 'shape-rounded', 'shape-circle', 'shape-original');
  if (b.logo && SAFE_LOGO.test(b.logo)) { el.classList.add('has-logo', 'shape-' + b.shape); const im = new Image(); im.alt = ''; im.src = b.logo; el.replaceChildren(im); }
  else el.textContent = initials(b.name);
}
function applyBrand(b = ST.brand) {
  b = { ...DEF, ...b }; if (!SAFE_LOGO.test(b.logo || '')) b.logo = '';
  document.querySelectorAll('.sidebar .logo-mark,#loginForm .logo-mark').forEach(el => paintMark(el, b));
  const s = document.querySelector('.sidebar .logo strong'), t = document.querySelector('.sidebar .logo small'), h = document.querySelector('#loginForm h2');
  if (s) s.textContent = b.name; if (t) t.textContent = b.tagline; if (h) h.textContent = b.name;
  document.title = b.tagline ? `${b.name} — ${b.tagline}` : b.name;
  document.querySelectorAll('link[rel=icon],link[rel=apple-touch-icon]').forEach(l => l.href = b.logo || '/icon-192.png');
  window.FH_BRAND = b;
}
const cacheBrand = () => { try { localStorage.setItem(LS, JSON.stringify(ST.brand)); } catch { } };
async function loadBrand() {
  const r = await sb.from('settings').select('k,v').in('k', ['logo', 'logo_shape', 'app_name', 'app_tagline', 'last_backup_at']);
  if (r.error) return;
  const m = Object.fromEntries(r.data.map(x => [x.k, x.v]));
  ST.brand = { logo: m.logo || '', shape: m.logo_shape || DEF.shape, name: m.app_name || DEF.name, tagline: m.app_tagline ?? DEF.tagline };
  ST.last = m.last_backup_at || null; cacheBrand(); applyBrand(); warnDot();
}
function warnDot() {
  const b = E('navSettings'); if (!b) return;
  const old = isA() && (!ST.last || Date.now() - new Date(ST.last) > 30 * 864e5);
  b.classList.toggle('st-warn', old); b.title = 'Pengaturan' + (old ? (ST.last ? ' — backup terakhir lebih dari 30 hari lalu' : ' — data belum pernah di-backup') : '');
}
try { const c = JSON.parse(localStorage.getItem(LS) || 'null'); if (c) { ST.brand = { ...DEF, ...c }; applyBrand(); } } catch { }

const dirty = () => { const p = ST.pend, b = ST.brand; return p.logo !== b.logo || p.shape !== b.shape || p.name.trim() !== b.name || p.tagline.trim() !== b.tagline; };
function paintPrev() {
  const p = ST.pend, b = { ...p, name: p.name.trim() || DEF.name };
  document.querySelectorAll('#pengaturan .st-mark').forEach(el => paintMark(el, b));
  ['stPvName', 'stPvName2'].forEach(i => { const e = E(i); if (e) e.textContent = b.name; });
  const t = E('stPvTag'); if (t) t.textContent = p.tagline.trim();
  const s = E('stSaveBrand'); if (s) s.disabled = !dirty() || !p.name.trim();
  const d = E('stLogoDel'); if (d) d.style.display = p.logo ? '' : 'none';
  document.querySelectorAll('[data-act=shape]').forEach(x => x.classList.toggle('on', x.dataset.v === p.shape));
}
async function pickLogo(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) return toast('Pilih berkas gambar (PNG, JPG, WebP, atau SVG)');
  if (file.size > 8 * 1024 * 1024) return toast('Ukuran gambar maksimal 8 MB');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const w = img.naturalWidth || 256, h = img.naturalHeight || 256;
    // Letakkan di kanvas persegi (tanpa memotong) lalu perkecil sampai ≤ ±300 KB
    for (const [size, type, q] of [[256, 'image/png'], [192, 'image/png'], [128, 'image/png'], [256, 'image/webp', .9], [128, 'image/webp', .8]]) {
      const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      const k = Math.min(size / w, size / h); g.drawImage(img, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
      const out = c.toDataURL(type, q);
      if (out.startsWith('data:' + type) && out.length <= 300000) { ST.pend.logo = out; return paintPrev(); }
    }
    toast('Logo terlalu kompleks — gunakan gambar yang lebih sederhana');
  } catch { toast('Gambar tidak dapat dibaca. Coba format PNG atau JPG.'); }
  finally { URL.revokeObjectURL(url); }
}
async function saveBrand() {
  if (needSql()) return;
  const p = ST.pend, name = p.name.trim(), tagline = p.tagline.trim(); if (!name) return toast('Nama aplikasi wajib diisi');
  await rpc('set_branding', { p_logo: p.logo === ST.brand.logo ? null : (p.logo || ''), p_shape: p.shape, p_name: name, p_tagline: tagline });
  ST.brand = { logo: p.logo, shape: p.shape, name, tagline }; ST.pend = { ...ST.brand }; cacheBrand(); applyBrand(); paintPrev(); toast('✓ Identitas tersimpan');
}

// ---------- Ekspor ----------
const cellCsv = v => {   // cegah CSV-injection di Excel: sel teks berawalan = @ (atau +/− non-angka) diberi apostrof
  if (v == null) return ''; let s = String(v);
  if (typeof v === 'string' && (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s().,-]+$/.test(s)))) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (cols, rows) => '\uFEFF' + [cols.join(';'), ...rows.map(r => cols.map(c => cellCsv(r[c])).join(';'))].join('\r\n');
function sheetOf(X, cols, rows, money = []) {
  const ws = X.utils.json_to_sheet(rows, { header: cols });
  ws['!cols'] = cols.map(c => ({ wch: Math.min(50, Math.max(c.length + 2, 8, ...rows.slice(0, 300).map(r => String(r[c] ?? '').length + 2))) }));
  if (rows.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: cols.length - 1 } }) };
  money.forEach(c => { const ci = cols.indexOf(c); rows.forEach((_, i) => { const cell = ws[X.utils.encode_cell({ r: i + 1, c: ci })]; if (cell && typeof cell.v === 'number') cell.z = '#,##0'; }); });
  return ws;
}
const ctx = () => { const m = {}, once = (k, f) => () => m[k] ??= f(); return { members: once('m', () => fetchAll('members', 'id,name')), fees: once('f', () => fetchAll('fee_types', 'id,name,schedule')) }; };
const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id;
const D = {
  anggota: { t: 'Anggota & Silsilah', i: '♙', tb: 'members', sheet: 'Anggota', d: 'Data anggota lengkap: orang tua, pasangan, tahun lahir/wafat, alamat. Formatnya sama dengan impor.',
    cols: ['kode', 'nama', 'jk', 'status_nikah', 'kode_ortu', 'kode_pasangan', 'status_pasangan', 'lahir', 'wafat', 'hubungan', 'telepon', 'alamat', 'aktif', 'generasi'],
    load: async () => (await fetchAll('members')).map(x => ({ kode: x.id, nama: x.name, jk: x.gender || '', status_nikah: (x.marital_status || '').replace(/_/g, ' '), kode_ortu: x.parent_id ?? '', kode_pasangan: x.spouse_id ?? '', status_pasangan: x.spouse_id ? (x.spouse_status || '') : '', lahir: x.birth_year ?? '', wafat: x.death_year ?? '', hubungan: x.relation || '', telepon: x.phone || '', alamat: x.address || '', aktif: x.active ? 'ya' : 'tidak', generasi: x.generation })) },
  iuran: { t: 'Pembayaran Iuran', i: '◎', tb: 'payments', sheet: 'Iuran', money: ['jumlah'], d: 'Seluruh pembayaran iuran arisan & wajib beserta nomor kuitansi dan metode bayar.',
    cols: ['kuitansi', 'anggota', 'jenis_iuran', 'periode', 'jumlah', 'metode', 'dibayar'],
    load: async c => { const [p, m, f] = await Promise.all([fetchAll('payments'), c.members(), c.fees()]), mn = new Map(m.map(x => [x.id, x.name])), fn = new Map(f.map(x => [x.id, x.name])), fs = new Map(f.map(x => [x.id, x.schedule])); try { await getCfg(); } catch (_) { }   // getCfg memuat daftar putaran untuk label
      return p.map(x => ({ kuitansi: x.receipt_no || '', anggota: mn.get(x.member_id) || '', jenis_iuran: fn.get(x.fee_type_id) || '', periode: fs.get(x.fee_type_id) === 'putaran' ? PER(x.period) : x.period, jumlah: x.amount, metode: x.method || '', dibayar: wib(x.paid_at) })); } },
  kas: { t: 'Buku Kas', i: '◈', tb: 'transactions', sheet: 'Buku Kas', money: ['jumlah'], d: 'Semua transaksi pemasukan & pengeluaran dua dana (Arisan dan Kas Wajib). Bisa diimpor kembali.',
    cols: ['tanggal', 'keterangan', 'jenis', 'jumlah', 'dana', 'kategori', 'periode', 'anggota'],
    load: async c => { const [t, m] = await Promise.all([fetchAll('transactions'), c.members()]), mn = new Map(m.map(x => [x.id, x.name]));
      return t.sort(byDate).map(x => ({ tanggal: x.date, keterangan: x.description, jenis: x.type, jumlah: x.amount, dana: x.fund, kategori: x.category || '', periode: x.period || '', anggota: mn.get(x.member_id) || '' })); } },
  kocokan: { t: 'Riwayat Pengocokan', i: '✦', tb: 'draws', sheet: 'Pengocokan', d: 'Hasil pengocokan arisan: siklus, putaran, pemenang, dan status pengesahan.',
    cols: ['siklus', 'putaran', 'waktu', 'pemenang', 'status', 'percobaan'],
    load: async () => (await fetchAll('draws')).map(x => ({ siklus: x.cycle, putaran: PER(x.period), waktu: wib(x.at), pemenang: x.winner_name, status: x.status, percobaan: x.attempt })) },
  agenda: { t: 'Agenda', i: '◫', tb: 'events', sheet: 'Agenda', d: 'Daftar acara keluarga beserta lokasi dan status. Bisa diimpor kembali.',
    cols: ['tanggal', 'jam', 'kegiatan', 'lokasi', 'status'],
    load: async () => (await fetchAll('events')).sort(byDate).map(x => ({ tanggal: x.date, jam: x.time || '', kegiatan: x.title, lokasi: x.location || '', status: x.status })) },
  pengumuman: { t: 'Pengumuman', i: '◌', tb: 'announcements', sheet: 'Pengumuman', d: 'Semua pengumuman beserta penulis dan tanggal. Bisa diimpor kembali.',
    cols: ['tanggal', 'judul', 'isi', 'penulis'],
    load: async () => (await fetchAll('announcements')).sort(byDate).map(x => ({ tanggal: x.date, judul: x.title, isi: x.body || '', penulis: x.author || '' })) },
  aktivitas: { t: 'Log Aktivitas', i: '▤', tb: 'activity', sheet: 'Aktivitas', d: 'Jejak aktivitas sistem (penambahan data, pembayaran, backup, reset, dan lainnya).',
    cols: ['waktu', 'kegiatan', 'rincian'], load: async () => (await fetchAll('activity')).map(x => ({ waktu: wib(x.at), kegiatan: x.text || '', rincian: x.detail || '' })).reverse() },
};
async function exportOne(key, fmt, btn) {
  const d = D[key]; setBtn(btn, true, '…');
  try {
    const rows = await d.load(ctx()); if (!rows.length) return toast('Belum ada data untuk diekspor');
    const base = `familyhub_${key}_${stamp()}`;
    if (fmt === 'csv') download(new Blob([toCsv(d.cols, rows)], { type: 'text/csv;charset=utf-8' }), base + '.csv');
    else { const X = await loadXlsx().catch(() => null); if (!X) return toast('Pustaka Excel tidak bisa dimuat (periksa koneksi). Gunakan CSV.'); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, sheetOf(X, d.cols, rows, d.money), d.sheet); X.writeFile(wb, base + '.xlsx'); }
    toast(`✓ ${nf(rows.length)} baris diekspor`);
  } finally { setBtn(btn, false); }
}
async function exportAll(btn) {
  setBtn(btn, true, 'Menyiapkan…');
  try {
    const X = await loadXlsx().catch(() => null); if (!X) return toast('Pustaka Excel tidak bisa dimuat (periksa koneksi).');
    const c = ctx(), wb = X.utils.book_new(), info = [['FamilyHub — ekspor seluruh data'], ['Organisasi', (window.FH_BRAND || DEF).name], ['Diekspor oleh', ME.name], ['Waktu', when(new Date().toISOString())], [], ['Lembar', 'Jumlah baris']], sheets = [];
    for (const [k, d] of Object.entries(D)) { const rows = await d.load(c); sheets.push([d, rows]); info.push([d.sheet, rows.length]); }
    const is = X.utils.aoa_to_sheet(info); is['!cols'] = [{ wch: 30 }, { wch: 40 }]; X.utils.book_append_sheet(wb, is, 'Info');
    sheets.forEach(([d, rows]) => X.utils.book_append_sheet(wb, sheetOf(X, d.cols, rows, d.money), d.sheet));
    X.writeFile(wb, `familyhub_semua-data_${stamp()}.xlsx`); toast('✓ Seluruh data diekspor ke Excel');
  } finally { setBtn(btn, false); }
}

// ---------- Backup & pemulihan ----------
async function backupDownload(busy, tag) {
  const data = {};
  for (let i = 0; i < BK.length; i++) { const [k, t, o] = BK[i]; busy && busy.set(`Mengambil ${TL[k].toLowerCase()}…`, i / BK.length); try { data[k] = await fetchAll(t, '*', o); } catch (e) { if (!OPT.has(k)) throw e; data[k] = []; } }
  data.settings = data.settings.filter(x => x.k !== 'last_backup_at');
  busy && busy.set('Menyusun berkas backup…', .96);
  const counts = Object.fromEntries(BK.map(([k]) => [k, data[k].length])), org = (data.settings.find(x => x.k === 'org_name') || {}).v || 'FamilyHub';
  const payload = { app: 'FamilyHub', format: 1, version: VER, created_at: new Date().toISOString(), created_by: ME.name, organization: org, counts, checksum: await sha256(JSON.stringify(data)), data };
  download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `familyhub-backup_${slug(org)}_${stamp()}${tag ? '_' + tag : ''}.json`);
  const m = await sb.rpc('mark_backup', { p_detail: `${nf(counts.members)} anggota • ${nf(counts.payments)} iuran • ${nf(counts.transactions)} transaksi` });
  if (!m.error) { ST.last = new Date().toISOString(); warnDot(); }
  return counts;
}
async function backupNow() {
  const busy = stBusy(); busy.set('Menyiapkan backup…', 0);
  try {
    const c = await backupDownload(busy);
    busy.result(true, 'Backup berhasil diunduh', [`<b>${nf(c.members)}</b> anggota, <b>${nf(c.payments)}</b> pembayaran, <b>${nf(c.transactions)}</b> transaksi, <b>${nf(c.events)}</b> agenda, <b>${nf(c.photos)}</b> foto (data)`, 'Simpan berkas di tempat aman (mis. Google Drive atau flashdisk) — jangan hanya di perangkat ini.'], () => { if (ST.tab === 'backup') tabBackup(); });
  } catch (e) { busy.close(); throw e; }
}
async function analyzeBackup(file) {
  const out = { name: file.name, errs: [], warns: [] };
  let j; try { j = JSON.parse(await readText(file)); } catch { out.errs.push('Berkas bukan JSON yang valid.'); return out; }
  if (!j || j.app !== 'FamilyHub' || typeof j.data !== 'object' || !j.data) { out.errs.push('Ini bukan berkas backup FamilyHub.'); return out; }
  if (j.format !== 1) out.errs.push(`Format backup versi ${esc(j.format)} tidak didukung aplikasi ini.`);
  for (const [k] of BK) if (!OPT.has(k) && !Array.isArray(j.data[k])) out.errs.push(`Bagian "${TL[k]}" tidak ada di dalam backup.`);
  if (!out.errs.length) {
    if (!j.data.fee_types.length) out.errs.push('Backup tidak memuat jenis iuran — berkas diduga rusak.');
    if (j.checksum) { const sum = await sha256(JSON.stringify(j.data)); if (sum && sum !== j.checksum) out.errs.push('Checksum tidak cocok — berkas rusak atau sudah diubah. Pemulihan dibatalkan demi keamanan.'); }
    else out.warns.push('Backup ini tidak memiliki checksum, keutuhannya tidak dapat diverifikasi.');
    if (j.version && parseInt(j.version) > parseInt(VER)) out.warns.push(`Backup dibuat oleh versi lebih baru (${esc(j.version)}) daripada aplikasi ini (${VER}).`);
    if (j.data.photos.length) out.warns.push('Berkas foto (Storage) tidak ikut backup. Data album tetap dipulihkan, tetapi foto yang berkasnya sudah terhapus akan tampil kosong.');
    out.counts = Object.fromEntries(BK.map(([k]) => [k, (j.data[k] || []).length]));
  }
  out.j = j; return out;
}
async function doRestore() {
  const r = ST.rst; if (!r || !r.j || r.errs.length || needSql()) return;
  const cur = await loadCounts(true);
  const res = await stDialog({ title: 'Pulihkan dari backup?', danger: true, okText: 'Ya, pulihkan data', phrase: 'PULIHKAN',
    html: `<p>Seluruh data aplikasi saat ini <b>akan diganti</b> dengan isi <b>${esc(r.name)}</b> (dibuat ${esc(when(r.j.created_at))}).</p><ul><li>Saat ini: <b>${nf(cur.members)}</b> anggota, <b>${nf(cur.payments)}</b> pembayaran, <b>${nf(cur.transactions)}</b> transaksi</li><li>Backup: <b>${nf(r.counts.members)}</b> anggota, <b>${nf(r.counts.payments)}</b> pembayaran, <b>${nf(r.counts.transactions)}</b> transaksi</li></ul><p>Akun pengguna tidak berubah. Proses bersifat atomik: bila gagal, data lama tetap utuh.</p>`,
    checks: [{ id: 'bk', label: 'Unduh backup data saat ini terlebih dahulu (sangat disarankan)', checked: true }] });
  if (!res.ok) return;
  const busy = stBusy(); busy.set('Menyiapkan…', 0);
  try {
    if (res.checks.bk) await backupDownload(busy, 'sebelum-pemulihan');
    busy.set('Memulihkan data — jangan tutup halaman ini…', null);
    const n = await rpc('restore_backup', { p: r.j });
    ST.rst = null; ST.counts = null;
    busy.result(true, 'Pemulihan berhasil', [`<b>${nf(n.members)}</b> anggota, <b>${nf(n.payments)}</b> pembayaran, <b>${nf(n.transactions)}</b> transaksi, <b>${nf(n.events)}</b> agenda dipulihkan`, 'Aplikasi akan dimuat ulang agar seluruh tampilan memakai data terbaru.'], () => location.reload(), 'Muat ulang sekarang');
  } catch (e) { busy.close(); throw e; }
}

// ---------- Impor ----------
const isoOf = (y, m, d) => { if (y < 1900 || y > 2100) return null; const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null; };
function parseDate(v) {
  v = String(v || '').trim(); let m;
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) return isoOf(+m[1], +m[2], +m[3]);
  if ((m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/))) { let y = +m[3]; if (y < 100) y += 2000; return isoOf(y, +m[2], +m[1]); }
  return null;
}
function parseAmount(v) {
  let s = String(v ?? '').trim().replace(/rp\.?/ig, '').replace(/\s/g, ''); if (!s) return null;
  if (/[.,]\d{1,2}$/.test(s) && !/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]\d{1,2}$/, '');
  s = s.replace(/[.,]/g, ''); if (!/^\d+$/.test(s)) return null;
  const n = Number(s); return Number.isSafeInteger(n) && n > 0 && n <= 1e13 ? n : null;
}
const parseTime = v => { v = String(v || '').trim(); if (!v) return ''; const m = v.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/); return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : null; };
const normKey = h => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
function mapRows(aoa, alias, required) {
  const errs = [];
  if (aoa.length < 2) return { errs: ['File kosong atau tidak ada baris data.'], data: [] };
  const cols = aoa[0].map(h => alias[normKey(h)] || null);
  required.forEach(r => { if (!cols.includes(r)) errs.push(`Kolom "${r}" tidak ditemukan pada baris judul.`); });
  const data = aoa.slice(1).map((cells, i) => ({ n: i + 2, o: Object.fromEntries(cols.map((k, j) => [k, String(cells[j] ?? '').trim()]).filter(([k]) => k)), blank: !cells.some(c => String(c ?? '').trim()) })).filter(x => !x.blank);
  if (!data.length && !errs.length) errs.push('Tidak ada baris data.');
  if (data.length > 2000) errs.push('Maksimal 2000 baris per impor — pecah file menjadi beberapa bagian.');
  return { errs, data };
}
const STAT = { terjadwal: 'Terjadwal', jadwal: 'Terjadwal', selesai: 'Selesai', batal: 'Dibatalkan', dibatalkan: 'Dibatalkan' };
const IMP = {
  anggota: { t: 'Anggota', i: '♙', d: 'Anggota beserta hubungan orang tua & pasangan (lewat kolom kode).', tpl: () => TPL, file: 'template-anggota.csv',
    guide: [['kode', 'Ya*', 'A1 (penghubung antar baris; bebas)'], ['nama', 'Ya', 'Budi Santoso'], ['jk', 'Tidak', 'L / P'], ['status_nikah', 'Tidak', 'belum menikah / menikah / cerai / cerai mati'], ['kode_ortu', 'Tidak', 'A1 (kode orang tua)'], ['kode_pasangan', 'Tidak', 'A2'], ['lahir / wafat', 'Tidak', '1965 (4 digit)'], ['hubungan, telepon, alamat', 'Tidak', 'teks bebas']],
    note: '* wajib bila baris dihubungkan sebagai orang tua/pasangan.',
    prev: [['nama', 'Nama'], ['gender', 'JK'], ['hubungan', 'Hubungan'], ['lahir', 'Lahir'], ['kode_ortu', 'Ortu'], ['alamat', 'Alamat']],
    async parse(aoa) {
      const text = aoa.map(r => r.map(c => { const s = String(c ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n'), res = readCsv(text), warns = [];
      if (!res.errs.length) { const ex = new Set((await fetchAll('members', 'id,name')).map(x => x.name.trim().toLowerCase())), same = res.rows.filter(r => ex.has(r.nama.trim().toLowerCase())).length; if (same) warns.push(`<b>${same}</b> nama sudah ada di data anggota. Impor tidak menimpa — nama yang sama akan tercatat ganda.`); }
      return { rows: res.rows, errs: res.errs, warns };
    },
    commit: async rows => { const n = await api('import', 'POST', { rows }); MEMBERS = []; return n; } },
  transaksi: { t: 'Transaksi Kas', i: '◈', d: 'Pemasukan/pengeluaran untuk Dana Arisan atau Kas Wajib (mis. saldo awal, catatan lama).', file: 'template-transaksi.csv',
    tpl: () => 'tanggal;keterangan;jenis;jumlah;dana;kategori\n2026-01-05;Saldo awal kas;masuk;2500000;kas;Saldo Awal\n2026-01-20;Beli konsumsi rapat;keluar;350000;kas;Konsumsi\n2026-02-01;Donasi acara keluarga;masuk;500000;arisan;Penerimaan Lain\n',
    guide: [['tanggal', 'Ya', '2026-01-20 atau 20/01/2026'], ['keterangan', 'Ya', 'Beli konsumsi rapat'], ['jenis', 'Ya', 'masuk / keluar'], ['jumlah', 'Ya', '350000 (boleh "Rp 350.000")'], ['dana', 'Tidak', 'arisan / kas (kosong = kas)'], ['kategori', 'Tidak', 'Konsumsi (kosong = otomatis)']],
    note: 'Pembayaran iuran per anggota tidak diimpor di sini (agar kuitansi tetap sah) — catat lewat menu Arisan, atau pulihkan dari backup.',
    prev: [['tanggal', 'Tanggal'], ['keterangan', 'Keterangan'], ['jenis', 'Jenis'], ['jumlah', 'Jumlah', 'r'], ['dana', 'Dana'], ['kategori', 'Kategori']],
    ex: () => fetchAll('transactions', 'date,description,type,amount'), key: (r, e) => e ? `${e.date}|${e.description.trim().toLowerCase()}|${e.type}|${e.amount}` : `${r.tanggal}|${r.keterangan.toLowerCase()}|${r.jenis}|${r.jumlah}`,
    alias: { tanggal: 'tanggal', tgl: 'tanggal', date: 'tanggal', keterangan: 'keterangan', uraian: 'keterangan', deskripsi: 'keterangan', description: 'keterangan', jenis: 'jenis', tipe: 'jenis', type: 'jenis', jumlah: 'jumlah', nominal: 'jumlah', nilai: 'jumlah', amount: 'jumlah', dana: 'dana', fund: 'dana', kategori: 'kategori', category: 'kategori' },
    req: ['tanggal', 'keterangan', 'jenis', 'jumlah'],
    row(o, errs, n) {
      const r = { _row: n }, tg = parseDate(o.tanggal), jn = String(o.jenis || '').toLowerCase().trim(), jm = parseAmount(o.jumlah), dn = String(o.dana || '').toLowerCase().trim();
      if (!tg) errs.push(`Baris ${n}: tanggal "${o.tanggal || ''}" tidak valid (pakai 2026-01-20 atau 20/01/2026)`); else r.tanggal = tg;
      if (!o.keterangan) errs.push(`Baris ${n}: keterangan kosong`); else r.keterangan = o.keterangan.slice(0, 200);
      if (['masuk', 'pemasukan', 'penerimaan', 'income', 'in'].includes(jn)) r.jenis = 'masuk'; else if (['keluar', 'pengeluaran', 'pembayaran', 'expense', 'out', 'biaya'].includes(jn)) r.jenis = 'keluar'; else errs.push(`Baris ${n}: jenis "${o.jenis || ''}" harus masuk atau keluar`);
      if (!jm) errs.push(`Baris ${n}: jumlah "${o.jumlah || ''}" harus angka lebih dari 0`); else r.jumlah = jm;
      if (!dn || ['kas', 'kas wajib', 'wajib'].includes(dn)) r.dana = 'kas'; else if (['arisan', 'dana arisan'].includes(dn)) r.dana = 'arisan'; else errs.push(`Baris ${n}: dana "${o.dana}" harus arisan atau kas`);
      r.kategori = (o.kategori || '').slice(0, 80); return r;
    } },
  agenda: { t: 'Agenda', i: '◫', d: 'Acara keluarga: tanggal, jam, kegiatan, lokasi, dan status.', file: 'template-agenda.csv',
    tpl: () => 'tanggal;jam;kegiatan;lokasi;status\n2026-11-08;16:00;Arisan bulanan November;Rumah Pak Budi;Terjadwal\n2026-12-20;09:00;Halal bi halal keluarga besar;Aula Desa;Terjadwal\n',
    guide: [['tanggal', 'Ya', '2026-11-08 atau 08/11/2026'], ['kegiatan', 'Ya', 'Arisan bulanan November'], ['jam', 'Tidak', '16:00 (atau 16.00)'], ['lokasi', 'Tidak', 'Rumah Pak Budi'], ['status', 'Tidak', 'Terjadwal / Selesai / Dibatalkan']], note: '',
    prev: [['tanggal', 'Tanggal'], ['jam', 'Jam'], ['kegiatan', 'Kegiatan'], ['lokasi', 'Lokasi'], ['status', 'Status']],
    ex: () => fetchAll('events', 'date,title'), key: (r, e) => e ? `${e.date}|${e.title.trim().toLowerCase()}` : `${r.tanggal}|${r.kegiatan.toLowerCase()}`,
    alias: { tanggal: 'tanggal', tgl: 'tanggal', date: 'tanggal', jam: 'jam', waktu: 'jam', time: 'jam', kegiatan: 'kegiatan', acara: 'kegiatan', judul: 'kegiatan', title: 'kegiatan', lokasi: 'lokasi', tempat: 'lokasi', location: 'lokasi', status: 'status' },
    req: ['tanggal', 'kegiatan'],
    row(o, errs, n) {
      const r = { _row: n }, tg = parseDate(o.tanggal), jm = parseTime(o.jam), st = String(o.status || '').trim().toLowerCase();
      if (!tg) errs.push(`Baris ${n}: tanggal "${o.tanggal || ''}" tidak valid`); else r.tanggal = tg;
      if (!o.kegiatan) errs.push(`Baris ${n}: kegiatan kosong`); else r.kegiatan = o.kegiatan.slice(0, 200);
      if (jm === null) errs.push(`Baris ${n}: jam "${o.jam}" tidak valid (pakai 16:00)`); else r.jam = jm;
      r.lokasi = (o.lokasi || '').slice(0, 200);
      if (!st) r.status = 'Terjadwal'; else if (STAT[st]) r.status = STAT[st]; else errs.push(`Baris ${n}: status "${o.status}" harus Terjadwal, Selesai, atau Dibatalkan`);
      return r;
    } },
  pengumuman: { t: 'Pengumuman', i: '◌', d: 'Pengumuman keluarga beserta isi, tanggal, dan penulis.', file: 'template-pengumuman.csv',
    tpl: () => 'judul;isi;tanggal;penulis\nJadwal halal bi halal;Acara dimulai pukul 09.00 di aula desa. Mohon hadir tepat waktu.;2026-10-12;Admin\n',
    guide: [['judul', 'Ya', 'Jadwal halal bi halal'], ['isi', 'Tidak', 'Isi pengumuman'], ['tanggal', 'Tidak', '2026-10-12 (kosong = hari ini)'], ['penulis', 'Tidak', 'Admin (kosong = nama Anda)']], note: '',
    prev: [['tanggal', 'Tanggal'], ['judul', 'Judul'], ['isi', 'Isi'], ['penulis', 'Penulis']],
    ex: () => fetchAll('announcements', 'title,date'), key: (r, e) => e ? `${e.date}|${e.title.trim().toLowerCase()}` : `${r.tanggal}|${r.judul.toLowerCase()}`,
    alias: { judul: 'judul', title: 'judul', isi: 'isi', body: 'isi', pesan: 'isi', keterangan: 'isi', tanggal: 'tanggal', tgl: 'tanggal', date: 'tanggal', penulis: 'penulis', author: 'penulis', oleh: 'penulis' },
    req: ['judul'],
    row(o, errs, n) {
      const r = { _row: n }; if (!o.judul) errs.push(`Baris ${n}: judul kosong`); else r.judul = o.judul.slice(0, 200);
      r.tanggal = o.tanggal ? parseDate(o.tanggal) : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      if (!r.tanggal) errs.push(`Baris ${n}: tanggal "${o.tanggal}" tidak valid`);
      r.isi = (o.isi || '').slice(0, 4000); r.penulis = (o.penulis || ME.name || '').slice(0, 80); return r;
    } },
};
for (const k of ['transaksi', 'agenda', 'pengumuman']) {   // parser & penyimpan generik
  const d = IMP[k];
  d.parse = async aoa => {
    const m = mapRows(aoa, d.alias, d.req), errs = [...m.errs], rows = [], warns = [];
    if (!m.errs.length) m.data.forEach(x => { const e0 = errs.length, r = d.row(x.o, errs, x.n); if (errs.length === e0) rows.push(r); });
    if (errs.length > 200) errs.length = 200;
    if (!errs.length) {
      const seen = new Set((await d.ex()).map(e => d.key(null, e))); let dup = 0;
      rows.forEach(r => { const k2 = d.key(r); if (seen.has(k2)) { r._dup = true; dup++; } else seen.add(k2); });
      if (dup) warns.push(`<b>${dup}</b> baris tampaknya sudah ada (atau dobel dalam berkas). Baris tersebut dicoret di pratinjau.`);
    }
    return { rows, errs, warns };
  };
  d.commit = rows => rpc('import_data', { p_kind: k, p: rows.map(({ _dup, ...r }) => r) });
}
async function fileToAoa(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    const X = await loadXlsx().catch(() => null); if (!X) throw new Error('Pustaka Excel tidak bisa dimuat (periksa koneksi). Simpan sebagai CSV lalu coba lagi.');
    const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false }).map(r => r.map(v => v instanceof Date ? new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10) : v == null ? '' : String(v)));
  }
  return parseCsv(await readText(file));
}
async function handleImpFile(file) {
  if (!file) return; const I = ST.imp, d = IMP[I.ds];
  if (file.size > 10 * 1024 * 1024) return toast('Ukuran berkas maksimal 10 MB');
  I.res = { name: file.name, busy: true }; drawImp();
  try { const res = await d.parse(await fileToAoa(file)); I.res = { name: file.name, ...res }; }
  catch (e) { I.res = { name: file.name, rows: [], errs: [e && e.message ? e.message : 'Berkas tidak dapat dibaca'], warns: [] }; }
  drawImp();
}
async function doImport() {
  const I = ST.imp, d = IMP[I.ds], r = I.res; if (!r || r.errs.length || (I.ds !== 'anggota' && needSql())) return;
  const rows = I.ds === 'anggota' || !I.skip ? r.rows : r.rows.filter(x => !x._dup);
  if (!rows.length) return toast('Tidak ada baris baru untuk diimpor');
  const ok = await stDialog({ title: `Impor ${d.t}?`, okText: `Impor ${nf(rows.length)} baris`, html: `<p><b>${nf(rows.length)}</b> baris akan ditambahkan ke <b>${esc(d.t)}</b>. Data yang sudah ada <b>tidak</b> diubah atau dihapus.</p><p>Bila ada satu baris yang ditolak database, seluruh impor dibatalkan sehingga data tidak masuk setengah-setengah.</p>` });
  if (!ok.ok) return;
  const busy = stBusy(); busy.set(`Mengimpor ${nf(rows.length)} baris…`, null);
  try {
    const n = await d.commit(rows); CACHE = {}; ST.counts = null; I.res = null;
    busy.result(true, 'Impor selesai', [`<b>${nf(n ?? rows.length)}</b> baris berhasil ditambahkan ke ${esc(d.t)}.`], () => { if (ST.tab === 'impor') drawImp(); });
  } catch (e) { busy.close(); throw e; }
}

// ---------- Reset ----------
const RS = {
  keuangan: { i: '◈', t: 'Keuangan', d: 'Seluruh pembayaran iuran, kuitansi, dan buku kas (termasuk pencairan arisan). Saldo kembali nol.', tb: ['payments', 'transactions'] },
  arisan: { i: '◎', t: 'Pengocokan Arisan', d: 'Riwayat pengocokan, pemenang, dan daftar putaran dihapus; siklus arisan kembali ke 1 dan nomor putaran berikutnya tetap melanjutkan (tidak bentrok dengan iuran lama). Anggota & keuangan tidak berubah.', tb: ['draws'] },
  agenda: { i: '◫', t: 'Agenda', d: 'Seluruh acara di kalender dan daftar agenda.', tb: ['events'] },
  pengumuman: { i: '◌', t: 'Pengumuman', d: 'Seluruh pengumuman keluarga.', tb: ['announcements'] },
  galeri: { i: '▧', t: 'Dokumentasi', d: 'Seluruh album dan foto, termasuk berkas gambarnya di penyimpanan.', tb: ['albums', 'photos'] },
  aktivitas: { i: '▤', t: 'Log Aktivitas', d: 'Jejak aktivitas pada Dashboard. Data lain tidak berubah.', tb: ['activity'] },
  anggota: { i: '♙', t: 'Anggota & Silsilah', d: 'Seluruh anggota beserta foto & silsilah, ikut menghapus pembayaran iuran, pencairan, dan riwayat pengocokan. Catatan kas manual tetap ada.', tb: ['members', 'payments', 'draws'] },
  semua: { i: '⚠', t: 'Seluruh Data', d: 'Menghapus semua data di atas sekaligus — aplikasi kembali seperti baru. Akun pengguna tidak dihapus.', tb: ['members', 'payments', 'transactions', 'draws', 'events', 'announcements', 'albums', 'photos', 'activity'] },
};
async function storagePaths(scope) {
  const out = [];
  if (['galeri', 'semua'].includes(scope)) (await fetchAll('photos', 'id,path')).forEach(p => p.path && out.push(p.path));
  if (['anggota', 'semua'].includes(scope)) (await fetchAll('members', 'id,photo_path')).forEach(m => m.photo_path && out.push(m.photo_path + '_s.jpg', m.photo_path + '_l.jpg'));
  return out;
}
async function removeFiles(paths) {
  let bad = 0; for (let i = 0; i < paths.length; i += 100) { const r = await sb.storage.from('photos').remove(paths.slice(i, i + 100)); if (r.error) bad += Math.min(100, paths.length - i); }
  return bad;
}
async function doReset(scope) {
  const d = RS[scope]; if (!d || needSql()) return;
  const c = await loadCounts(true), list = d.tb.map(t => `<li><b>${nf(c[t])}</b> ${esc(TL[t].toLowerCase())}</li>`).join('');
  const res = await stDialog({ title: `Reset ${d.t.toLowerCase()}?`, danger: true, okText: 'Hapus permanen', phrase: 'RESET',
    html: `<p>${esc(d.d)}</p><p>Yang akan dihapus <b>permanen</b>:</p><ul>${list}</ul><p>Tindakan ini <b>tidak dapat dibatalkan</b> kecuali Anda memiliki berkas backup.</p>`,
    checks: [{ id: 'bk', label: 'Unduh backup otomatis sebelum menghapus (sangat disarankan)', checked: true }, scope === 'semua' && { id: 'keep', label: 'Pertahankan pengaturan (logo, identitas, dan tarif iuran)', checked: true }] });
  if (!res.ok) return;
  const busy = stBusy(); busy.set('Menyiapkan…', 0);
  try {
    if (res.checks.bk) await backupDownload(busy, 'sebelum-reset');
    busy.set('Menghapus data — jangan tutup halaman ini…', null);
    const paths = await storagePaths(scope);
    await rpc('reset_data', { p_scope: scope, p_keep_settings: scope === 'semua' ? !!res.checks.keep : true });
    let bad = 0; if (paths.length) { busy.set(`Membersihkan ${nf(paths.length)} berkas foto…`, null); bad = await removeFiles(paths); }
    ST.counts = null; CACHE = {}; MEMBERS = [];
    const lines = [`Reset <b>${esc(d.t)}</b> selesai.`]; if (bad) lines.push(`${bad} berkas foto gagal dihapus dari penyimpanan (dapat dihapus manual di Supabase → Storage).`);
    if (res.checks.bk) lines.push('Berkas backup sudah diunduh — simpan baik-baik.');
    busy.result(true, 'Reset berhasil', lines, () => location.reload(), 'Muat ulang aplikasi');
  } catch (e) { busy.close(); throw e; }
}

// ---------- Tampilan ----------
const TABS = [['umum', 'image', 'Umum & Logo'], ['backup', 'shield', 'Backup & Pemulihan'], ['impor', 'upload', 'Impor Data'], ['ekspor', 'download', 'Ekspor Data'], ['reset', 'alert', 'Reset Data']];
const body = () => E('stBody');
function draw() {
  const alert = ST.ready === false ? `<div class="st-alert warn"><i>⚠</i><div><b>Pembaruan database diperlukan.</b> Jalankan <code>supabase/patch-009-pengaturan.sql</code> sekali di SQL Editor Supabase (aman diulang). Ekspor dan unduh backup tetap bisa dipakai; simpan logo, impor transaksi/agenda/pengumuman, pemulihan, dan reset memerlukan pembaruan ini.</div></div>` : '';
  E('pengaturan').innerHTML = hero('Pengaturan', 'Kelola identitas, cadangan data, perpindahan data, dan pemeliharaan FamilyHub.', `<div class="hero-date"><strong>v${VER}</strong><span>PENGATURAN</span></div>`) + alert +
    `<div class="st-tabs" role="tablist">${TABS.map(([k, ic, l]) => `<button class="st-tab ${k === 'reset' ? 'dz' : ''} ${ST.tab === k ? 'on' : ''}" role="tab" aria-selected="${ST.tab === k}" data-act="tab" data-v="${k}">${UI.ic(ic, 17)}${l}</button>`).join('')}</div><div id="stBody"></div>`;
  ({ umum: tabUmum, backup: tabBackup, impor: tabImpor, ekspor: tabEkspor, reset: tabReset })[ST.tab]();
}
async function tabUmum() {
  const cfg = await getCfg().catch(() => null), m = cfg ? cfg.meta : null, p = ST.pend;
  let host = '—'; try { host = new URL((window.FH_CONFIG || {}).SUPABASE_URL).host; } catch { }
  body().innerHTML = `<div class="st-grid"><div class="card st-card">
    <div class="st-h"><div><h3>Logo & Identitas Aplikasi</h3><p>Tampil di sidebar, halaman masuk, tab browser, serta kop laporan dan kuitansi.</p></div></div>
    <div class="st-logo"><div class="st-logo-box"><div class="logo-mark st-mark"></div></div>
      <div class="st-logo-side"><div class="st-btnrow"><label class="primary st-btn" style="cursor:pointer">⬆ Unggah logo<input id="stLogoFile" type="file" accept="image/*" hidden></label><button class="ghost st-btn" data-act="logo-clear" id="stLogoDel">Hapus logo</button></div>
      <p class="st-hint">PNG, JPG, WebP, atau SVG — idealnya persegi, min. 256×256 px, latar transparan. Gambar otomatis diperkecil agar ringan.</p>
      <div class="st-lab" style="margin-top:14px">Bentuk logo</div><div class="st-seg">${[['rounded', 'Kotak membulat'], ['circle', 'Bulat'], ['original', 'Asli (tanpa bingkai)']].map(([v, l]) => `<button data-act="shape" data-v="${v}">${l}</button>`).join('')}</div></div></div>
    <div class="st-2" style="margin-top:22px"><label class="st-lab">Nama aplikasi<input class="st-in" id="stName" maxlength="40" value="${esc(p.name)}"></label><label class="st-lab">Tagline<input class="st-in" id="stTag" maxlength="60" value="${esc(p.tagline)}"></label></div>
    <div class="st-sub">Pratinjau</div><div class="st-prevs"><div class="st-prev side"><div class="cap">Sidebar</div><div class="logo"><div class="logo-mark st-mark"></div><div><strong id="stPvName"></strong><small id="stPvTag"></small></div></div></div>
      <div class="st-prev lgn"><div class="cap">Halaman masuk</div><div class="logo-mark st-mark"></div><b id="stPvName2"></b></div></div>
    <div class="st-btnrow" style="margin-top:22px"><button class="primary st-btn" id="stSaveBrand" data-act="save-brand" disabled>Simpan perubahan</button><button class="ghost st-btn" data-act="reset-brand">Batalkan</button></div></div>
    <div>${m ? `<div class="card st-card"><div class="st-h"><div><h3>Identitas Laporan & Kuitansi</h3><p>Dipakai pada kop, tanda tangan, dan kuitansi pembayaran.</p></div></div>
      <label class="st-lab">Nama organisasi / keluarga<input class="st-in" id="stOrg" value="${esc(m.org)}"></label><div class="st-2"><label class="st-lab">Bendahara<input class="st-in" id="stTre" value="${esc(m.treasurer)}"></label><label class="st-lab">Ketua<input class="st-in" id="stCha" value="${esc(m.chair)}"></label></div>
      <div class="st-btnrow" style="margin-top:18px"><button class="primary st-btn" data-act="save-meta">Simpan identitas</button></div><p class="st-note">Nominal & jenis iuran diatur dari halaman <b>Keuangan</b> (tombol pengaturan iuran).</p></div>` : ''}
    <div class="card st-card"><div class="st-h"><div><h3>Informasi Sistem</h3></div><span class="st-chip ${ST.ready ? 'ok' : 'warn'}">${ST.ready ? 'Database terbaru' : 'Perlu patch-009'}</span></div>
      <dl class="st-sys"><dt>Versi aplikasi</dt><dd>FamilyHub ${VER}</dd><dt>Basis data</dt><dd>${esc(host)}</dd><dt>Masuk sebagai</dt><dd>${esc(ME.name)} (${esc(ME.username || '')})</dd><dt>Peran</dt><dd>Admin</dd><dt>Zona waktu</dt><dd>Asia/Jakarta (WIB)</dd></dl></div></div></div>`;
  paintPrev();
}
async function tabBackup() {
  body().innerHTML = '<div class="card st-card">Memuat…</div>';
  const c = await loadCounts(true), old = !ST.last || Date.now() - new Date(ST.last) > 30 * 864e5;
  body().innerHTML = `<div class="st-grid"><div class="card st-card">
    <div class="st-h"><div><h3>Backup Data & Pengaturan</h3><p>Satu berkas <code>.json</code> berisi seluruh data aplikasi beserta pengaturan, logo, dan tarif iuran. Dilengkapi checksum untuk mendeteksi berkas rusak.</p></div><span class="st-chip ${old ? 'warn' : 'ok'}">${ST.last ? 'Terakhir: ' + esc(rel(ST.last)) : 'Belum pernah di-backup'}</span></div>
    <div class="st-counts">${['members', 'payments', 'transactions', 'events', 'announcements', 'albums', 'photos', 'draws', 'activity'].map(t => `<div class="st-count"><b>${nf(c[t])}</b><span>${TL[t]}</span></div>`).join('')}</div>
    <div class="st-btnrow"><button class="primary st-btn" data-act="backup-now">⬇ Unduh Backup Sekarang</button></div>
    <p class="st-note"><b>Tidak termasuk:</b> akun pengguna & kata sandi (dikelola Supabase Auth) serta berkas gambar di penyimpanan — hanya catatan datanya. Rutinlah backup, minimal sebulan sekali dan sebelum mengimpor atau mereset data.</p></div>
    <div class="card st-card" id="stRst"></div></div>`;
  drawRst();
}
function drawRst() {
  const el = E('stRst'); if (!el) return; const r = ST.rst;
  let h = `<div class="st-h"><div><h3>Pulihkan dari Backup</h3><p>Mengganti seluruh data aplikasi dengan isi berkas backup FamilyHub (.json).</p></div></div>`;
  if (!r) h += `<label class="st-drop" data-drop="rst"><div class="big">📂</div><b>Pilih atau seret berkas backup ke sini</b><span>Berkas .json hasil “Unduh Backup”</span><input id="stRstFile" type="file" accept=".json,application/json"></label>`;
  else {
    h += `<div class="st-file">📄 <b>${esc(r.name)}</b><button class="ghost st-btn sm" data-act="rst-clear">Ganti</button></div>`;
    if (r.errs.length) h += `<div class="st-alert bad"><i>✕</i><div><b>Berkas tidak dapat dipulihkan</b><ul>${r.errs.map(x => `<li>${x}</li>`).join('')}</ul></div></div>`;
    else {
      const cur = ST.counts || {}, j = r.j;
      h += `<div class="st-alert ok"><i>✓</i><div><b>Berkas valid</b> — dibuat ${esc(when(j.created_at))} oleh ${esc(j.created_by || '—')} • ${esc(j.organization || '')} • v${esc(j.version || '?')}</div></div>
      <div class="st-tw"><table class="st-t"><thead><tr><th>Data</th><th class="r">Di backup</th><th class="r">Saat ini</th></tr></thead><tbody>${['members', 'payments', 'transactions', 'events', 'announcements', 'albums', 'photos', 'draws'].map(t => `<tr><td>${TL[t]}</td><td class="r"><b>${nf(r.counts[t])}</b></td><td class="r">${nf(cur[t])}</td></tr>`).join('')}</tbody></table></div>
      ${r.warns.length ? `<div class="st-alert warn" style="margin-top:14px"><i>⚠</i><div><ul style="margin:0">${r.warns.map(x => `<li>${x}</li>`).join('')}</ul></div></div>` : ''}
      <div class="st-btnrow" style="margin-top:16px"><button class="st-btn st-danger" data-act="rst-go">♻ Pulihkan data…</button></div>`;
    }
  }
  el.innerHTML = h;
}
function tabImpor() {
  const I = ST.imp; body().innerHTML = `<div class="card st-card"><div class="st-h"><div><h3>Impor Data</h3><p>Tambahkan data dari berkas CSV atau Excel. Data yang sudah ada tidak diubah. Bila ada satu baris salah, seluruh impor dibatalkan.</p></div></div>
    <div class="st-pick">${Object.entries(IMP).map(([k, d]) => `<button class="st-opt ${I.ds === k ? 'on' : ''}" data-act="imp-ds" data-v="${k}"><i>${d.i}</i><b>${d.t}</b><span>${d.d}</span></button>`).join('')}</div></div><div id="stImp"></div>`;
  drawImp();
}
function drawImp() {
  const el = E('stImp'); if (!el) return; const I = ST.imp, d = IMP[I.ds], r = I.res;
  let h = `<div class="st-grid"><div class="card st-card"><div class="st-h"><div><h3>1. Unduh template</h3><p>Isi data mengikuti kolom di bawah. Pemisah koma atau titik-koma, serta berkas .xlsx, dikenali otomatis.</p></div><button class="ghost st-btn sm" data-act="imp-tpl">⬇ Template CSV</button></div>
    <div class="st-tw"><table class="st-t"><thead><tr><th>Kolom</th><th>Wajib</th><th>Contoh / format</th></tr></thead><tbody>${d.guide.map(g => `<tr><td><b>${esc(g[0])}</b></td><td>${g[1].startsWith('Ya') ? `<span class="req">${esc(g[1])}</span>` : esc(g[1])}</td><td>${esc(g[2])}</td></tr>`).join('')}</tbody></table></div>${d.note ? `<p class="st-note">${esc(d.note)}</p>` : ''}</div>
    <div class="card st-card"><div class="st-h"><div><h3>2. Pilih berkas</h3><p>CSV (.csv) atau Excel (.xlsx) — maksimal 2000 baris per impor.</p></div></div>`;
  if (!r) h += `<label class="st-drop" data-drop="imp"><div class="big">📥</div><b>Pilih atau seret berkas ke sini</b><span>.csv · .xlsx</span><input id="stImpFile" type="file" accept=".csv,.xlsx,.xls,text/csv,text/plain"></label>`;
  else if (r.busy) h += `<div class="st-file">⏳ <b>Membaca ${esc(r.name)}…</b></div>`;
  else {
    const n = r.rows.length, dup = r.rows.filter(x => x._dup).length, go = I.ds === 'anggota' || !I.skip ? n : n - dup;
    h += `<div class="st-file">📄 <b>${esc(r.name)}</b><button class="ghost st-btn sm" data-act="imp-clear">Ganti</button></div>`;
    if (r.errs.length) h += `<div class="st-alert bad"><i>✕</i><div><b>${r.errs.length} masalah ditemukan</b> — perbaiki berkas lalu pilih ulang:<ul>${r.errs.slice(0, 10).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${r.errs.length > 10 ? `<em>+${r.errs.length - 10} lainnya</em>` : ''}</div></div>`;
    else h += `<div class="st-alert ok"><i>✓</i><div><b>${nf(n)} baris valid</b>${dup ? ` • ${nf(dup)} kemungkinan duplikat` : ''}</div></div>${r.warns.length ? `<div class="st-alert warn"><i>⚠</i><div><ul style="margin:0">${r.warns.map(x => `<li>${x}</li>`).join('')}</ul></div></div>` : ''}${dup && I.ds !== 'anggota' ? `<label class="st-chk" style="margin:0 0 14px"><input type="checkbox" id="stSkip" ${I.skip ? 'checked' : ''}><span>Lewati baris yang sudah ada (disarankan)</span></label>` : ''}
      <div class="st-tw"><table class="st-t"><thead><tr>${d.prev.map(c => `<th class="${c[2] || ''}">${c[1]}</th>`).join('')}</tr></thead><tbody>${r.rows.slice(0, 6).map(x => `<tr class="${x._dup ? 'dup' : ''}">${d.prev.map((c, i) => `<td class="${c[2] || ''}">${c[0] === 'jumlah' ? nf(x[c[0]]) : esc(String(x[c[0]] ?? '').slice(0, 40))}${x._dup && i === 0 ? '<span class="tag">sudah ada</span>' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${n > 6 ? `<p class="st-hint">Menampilkan 6 dari ${nf(n)} baris.</p>` : ''}
      <div class="st-btnrow" style="margin-top:16px"><button class="primary st-btn" data-act="imp-go" ${go ? '' : 'disabled'}>⬆ Impor ${nf(go)} baris</button></div>`;
  }
  el.innerHTML = h + '</div></div>';
}
function tabEkspor() {
  loadCounts(true).then(c => { body().innerHTML = `<div class="st-hero-card"><div><h3>Ekspor seluruh data</h3><p>Satu berkas Excel berisi semua lembar kerja (anggota, iuran, buku kas, pengocokan, agenda, pengumuman, aktivitas). Cocok untuk arsip atau analisis. Untuk cadangan yang dapat dipulihkan, gunakan <b>Backup</b>.</p></div><button class="primary st-btn" data-act="exp-all">▦ Ekspor semua ke Excel</button></div>
    <div class="st-ex">${Object.entries(D).map(([k, d]) => `<div class="card st-exc"><div class="top"><div class="ic">${d.i}</div><div><h4>${d.t}</h4><p>${d.d}</p></div></div><div class="meta">${nf(c[d.tb])} baris</div><div class="st-btnrow"><button class="primary st-btn sm" data-act="exp" data-k="${k}" data-f="xlsx">Excel</button><button class="ghost st-btn sm" data-act="exp" data-k="${k}" data-f="csv">CSV</button></div></div>`).join('')}</div>
    <p class="st-note">CSV memakai pemisah titik-koma dan penyandian UTF-8 sehingga langsung rapi di Excel berlokal Indonesia. Ekspor <b>Anggota</b>, <b>Buku Kas</b>, <b>Agenda</b>, dan <b>Pengumuman</b> berformat sama dengan template impor.</p>`; }).catch(() => { });
  body().innerHTML = '<div class="card st-card">Memuat…</div>';
}
function tabReset() {
  loadCounts(true).then(c => {
    const row = k => { const d = RS[k]; return `<div class="st-rs ${k === 'semua' ? 'all' : ''}"><div class="ic">${d.i}</div><div class="tx"><b>Reset ${d.t.toLowerCase()}</b><span>${esc(d.d)}</span><span class="cnt">${d.tb.map(t => `${nf(c[t])} ${TL[t].toLowerCase()}`).join(' • ')}</span></div><button class="st-btn st-outline-danger" data-act="rs" data-k="${k}">Reset…</button></div>`; };
    body().innerHTML = `<div class="st-alert warn"><i>💾</i><div><b>Unduh backup dulu.</b> Reset menghapus data secara permanen. Setiap reset menawarkan backup otomatis, dan Anda harus mengetik kata konfirmasi sebelum data dihapus. <button class="btn-s" data-act="tab" data-v="backup">Buka Backup →</button></div></div>
    <div class="card st-card st-dz"><div class="st-dz-h"><span style="font-size:22px">⚠</span><h3>Zona Berbahaya</h3></div><p class="st-hint" style="margin:0 0 6px">Pilih kelompok data yang ingin dikosongkan. Akun pengguna dan hak aksesnya tidak pernah dihapus.</p>
      ${['keuangan', 'arisan', 'agenda', 'pengumuman', 'galeri', 'aktivitas', 'anggota'].map(row).join('')}${row('semua')}</div>`;
  }).catch(() => { });
  body().innerHTML = '<div class="card st-card">Memuat…</div>';
}

// ---------- Interaksi ----------
const ACT = {
  tab: t => { ST.tab = t.dataset.v; draw(); },
  shape: t => { ST.pend.shape = t.dataset.v; paintPrev(); },
  'logo-clear': () => { ST.pend.logo = ''; paintPrev(); },
  'reset-brand': () => { ST.pend = { ...ST.brand }; E('stName').value = ST.pend.name; E('stTag').value = ST.pend.tagline; paintPrev(); },
  'save-brand': saveBrand,
  'save-meta': async () => { await api('fin/meta', 'PUT', { org: E('stOrg').value, treasurer: E('stTre').value, chair: E('stCha').value }); resetCfg(); toast('✓ Identitas laporan tersimpan'); },
  'backup-now': backupNow,
  'rst-clear': () => { ST.rst = null; drawRst(); },
  'rst-go': doRestore,
  'imp-ds': t => { ST.imp = { ds: t.dataset.v, res: null, skip: true }; tabImpor(); },
  'imp-clear': () => { ST.imp.res = null; drawImp(); },
  'imp-tpl': () => { const d = IMP[ST.imp.ds]; download(new Blob(['\uFEFF' + d.tpl()], { type: 'text/csv;charset=utf-8' }), d.file); },
  'imp-go': doImport,
  exp: async t => exportOne(t.dataset.k, t.dataset.f, t),
  'exp-all': async t => exportAll(t),
  rs: t => doReset(t.dataset.k),
};
(() => {
  const root = E('pengaturan');
  root.addEventListener('click', guard(async e => { const t = e.target.closest('[data-act]'); if (t && !t.disabled && ACT[t.dataset.act]) await ACT[t.dataset.act](t); }));
  root.addEventListener('input', e => { if (e.target.id === 'stName') ST.pend.name = e.target.value; else if (e.target.id === 'stTag') ST.pend.tagline = e.target.value; else return; paintPrev(); });
  root.addEventListener('change', guard(async e => {
    const t = e.target, f = t.files && t.files[0];
    if (t.id === 'stLogoFile') { await pickLogo(f); t.value = ''; }
    else if (t.id === 'stRstFile' && f) { ST.rst = await analyzeBackup(f); await loadCounts(true); drawRst(); }
    else if (t.id === 'stImpFile') await handleImpFile(f);
    else if (t.id === 'stSkip') { ST.imp.skip = t.checked; drawImp(); }
  }));
  root.addEventListener('dragover', e => { const z = e.target.closest('.st-drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  root.addEventListener('dragleave', e => { const z = e.target.closest('.st-drop'); if (z) z.classList.remove('over'); });
  root.addEventListener('drop', guard(async e => {
    const z = e.target.closest('.st-drop'); if (!z) return; e.preventDefault(); z.classList.remove('over'); const f = e.dataTransfer.files[0]; if (!f) return;
    if (z.dataset.drop === 'rst') { ST.rst = await analyzeBackup(f); await loadCounts(true); drawRst(); } else await handleImpFile(f);
  }));
})();

// ---------- Pendaftaran halaman ----------
titles.pengaturan = 'Pengaturan';
R.pengaturan = async () => {
  const root = E('pengaturan');
  if (!isA()) { root.innerHTML = hero('Pengaturan', 'Halaman ini khusus admin.') + `<div class="card st-card">Anda masuk sebagai <b>${esc(ROLE_LBL[ME.role] || ROLE_LBL.viewer)}</b>. Pengaturan aplikasi hanya dapat diubah oleh admin keluarga.</div>`; return; }
  if (ST.ready === null) { const r = await sb.rpc('pengaturan_ready'); ST.ready = !r.error && r.data === true; }
  ST.pend = { ...ST.brand }; ST.rst = null; ST.imp.res = null; draw();
};
const _boot = boot;
boot = () => {
  const n = E('navSettings'); if (n) n.style.display = isA() ? '' : 'none';
  _boot(); applyBrand(); loadBrand().catch(() => { });
};
})();
