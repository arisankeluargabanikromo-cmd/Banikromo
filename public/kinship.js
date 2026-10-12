// ============================================================
// Silsilah v2.8 — mudah dipahami
//   1) Sebutan kekerabatan dari sudut pandang "Saya" (Paman, Sepupu, Keponakan, Mertua, Ipar, …)
//   2) Panduan "Cara membaca silsilah" (legenda selalu tersedia, juga di HP)
//   3) Pemilih "Posisi saya" (disimpan di perangkat ini)
// Mesin sebutan memakai model unit/pasangan dari buildFam (tree.js): tiap orang punya SATU orang tua tercatat,
// pasangan orang tua otomatis ikut menjadi orang tua (satu unit), sehingga garis ayah & ibu keduanya ditelusuri.
// ============================================================
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) { } }
};
let SELF_ID = +LS.get('fh-self', 0) || null;          // anggota yang dipilih sebagai "Saya"
let REL_ON = LS.get('fh-rel', '1') !== '0';           // tampilkan sebutan pada kartu
let TERM = LS.get('fh-term', 'umum');                  // 'umum' (Paman/Bibi) atau 'jawa' (Pakde/Bude/Paklik/Bulik, Mbah)

// ---------- Mesin sebutan ----------
const pickG = (t, l, p, n) => t.gender === 'L' ? l : t.gender === 'P' ? p : n;
const NUMW = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan'];
const ancWord = a => ['', 'orang tua', 'kakek-nenek', 'buyut', 'canggah'][a] || `leluhur ke-${a}`;
const lcf = s => s.charAt(0).toLowerCase() + s.slice(1);
const older = (x, y) => x && y && x.birth_year && y.birth_year ? Math.sign(y.birth_year - x.birth_year) : 0;   // +1: x lebih tua dari y

function ancMap(id) {                                       // unit leluhur beserta jaraknya (jumlah generasi di atas) — menelusuri garis ayah DAN ibu
  const F = FAM, cache = F._anc || (F._anc = new Map()); if (cache.has(id)) return cache.get(id);
  const out = new Map(), me = F.byId.get(id); let level = [me];
  for (let d = 1; d <= 12 && level.length; d++) {
    const next = [];
    for (const m of level) { const p = F.par(m); if (!p) continue; const u = F.unitOf.get(p.id); if (!out.has(u)) { out.set(u, { d, via: m }); u.members.forEach(x => next.push(x)); } }
    level = next;
  }
  cache.set(id, out); return out;
}

function rel1(aId, bId, jw) {                              // hubungan sedarah / pasangan dari a ke b (tanpa pernikahan lanjutan)
  const F = FAM, a = F.byId.get(aId), b = F.byId.get(bId); if (!a || !b) return null;
  if (aId === bId) return { kind: 'self', term: 'Anda' };
  const uA = F.unitOf.get(aId), uB = F.unitOf.get(bId);
  if (uA === uB) {
    if (F.adj.get(aId).has(bId)) { const ex = F.st.get(Math.min(aId, bId) + '-' + Math.max(aId, bId)) === 'cerai'; return { kind: 'spouse', term: (ex ? 'Mantan ' + lcf(pickG(b, 'Suami', 'Istri', 'Pasangan')) : pickG(b, 'Suami', 'Istri', 'Pasangan')), ex }; }
    return { kind: 'cospouse', term: 'Pasangan dari pasangan' };
  }
  const A = ancMap(aId), B = ancMap(bId);
  if (A.has(uB)) {
    const n = A.get(uB).d;
    const term = n === 1 ? pickG(b, 'Ayah', 'Ibu', 'Orang tua') : n === 2 ? (jw ? 'Mbah ' + pickG(b, 'Kakung', 'Putri', '').trim() : pickG(b, 'Kakek', 'Nenek', 'Kakek/Nenek')) : n === 3 ? (jw ? 'Mbah Buyut' : 'Buyut') : n === 4 ? 'Canggah' : `Leluhur ke-${n}`;
    return { kind: 'anc', blood: true, a: n, term };
  }
  if (B.has(uA)) { const n = B.get(uA).d; return { kind: 'desc', blood: true, b: n, term: ['', 'Anak', 'Cucu', 'Cicit', 'Piut'][n] || `Keturunan ke-${n}` }; }
  let best = null;
  for (const [u, x] of A) { const y = B.get(u); if (!y) continue; const s = x.d + y.d; if (!best || s < best.s || (s === best.s && Math.abs(x.d - y.d) < Math.abs(best.a - best.b))) best = { s, a: x.d, b: y.d, C: u, viaMe: x.via, viaT: y.via }; }
  if (!best) return null;
  const { a: x, b: y } = best, old = older(best.viaT, best.viaMe);   // old > 0: b lebih tua dari jalur a pada percabangan
  let term;
  if (x === 1 && y === 1) term = old > 0 ? 'Kakak' : old < 0 ? 'Adik' : 'Saudara';
  else if (x === 2 && y === 1) term = jw && old ? pickG(b, old > 0 ? 'Pakde' : 'Paklik', old > 0 ? 'Bude' : 'Bulik', 'Paman/Bibi') : pickG(b, 'Paman', 'Bibi', 'Paman/Bibi');
  else if (x === 1 && y === 2) term = 'Keponakan';
  else if (x === y && x === 2) term = 'Sepupu';
  else if (x === y) term = `Sepupu ${NUMW[x - 1] || x - 1} kali`;
  else if (y === 1 && x === 3) term = 'Saudara kakek/nenek';
  else if (y === 1) term = 'Saudara leluhur';
  else if (x === 1 && y === 3) term = 'Cucu keponakan';
  else if (x === 1) term = 'Keturunan keponakan';
  else if (x === y + 1 && y === 2) term = 'Sepupu orang tua';
  else if (x === y + 1) term = 'Sepupu jauh (generasi di atas)';
  else if (y === x + 1 && x === 2) term = 'Anak sepupu';
  else if (y === x + 1) term = 'Anak sepupu jauh';
  else term = 'Kerabat jauh';
  return { kind: 'col', blood: true, a: x, b: y, C: best.C, old, term, viaMe: best.viaMe, viaT: best.viaT };
}

function computeRel(meId, tid) {                           // hasil: { term, why, kind, law } — law: terhubung lewat pernikahan
  const F = FAM, jw = TERM === 'jawa', t = F.byId.get(tid), fn = m => first(m.name), U = s => s.charAt(0).toUpperCase() + s.slice(1);
  if (!F.byId.get(meId) || !t) return { term: '', none: true };
  const d = rel1(meId, tid, jw);
  if (d) {
    let why = '';
    if (d.kind === 'col') {                                // penjelasan paling dekat dengan cara orang bertutur
      const vm = d.viaMe, vt = d.viaT, par = pickG(vm, 'ayah', 'ibu', 'orang tua'), el = d.old > 0 ? 'kakak' : d.old < 0 ? 'adik' : 'saudara';
      if (d.a === 1 && d.b === 1) why = `Sama-sama anak dari ${unitLabel(d.C)}`;
      else if (d.a === 2 && d.b === 1) why = `${U(el)} dari ${fn(vm)} (${par} Anda)`;
      else if (d.a === 1 && d.b === 2) why = `Anak dari ${fn(vt)} (${pickG(vt, 'saudara laki-laki', 'saudara perempuan', 'saudara')} Anda)`;
      else if (d.a === 2 && d.b === 2) why = `Anak dari ${fn(vt)}, ${el} dari ${fn(vm)} (${par} Anda)`;
      else why = `Leluhur bersama: ${unitLabel(d.C)} (${ancWord(d.a)} Anda)`;
    }
    else if (d.kind === 'anc' && d.a > 1) why = `${d.a} generasi di atas Anda`;
    else if (d.kind === 'desc' && d.b > 1) why = `${d.b} generasi di bawah Anda`;
    return { term: d.term, why, kind: d.kind, law: false };
  }
  const sT = [...F.adj.get(tid)], sM = [...F.adj.get(meId)];
  for (const s of sT) {                                    // T adalah pasangan dari kerabat sedarah saya
    const r = rel1(meId, s, jw); if (!r || !r.blood) continue; const x = F.byId.get(s); let term;
    if (r.kind === 'desc') term = r.b === 1 ? 'Menantu' : r.b === 2 ? 'Cucu menantu' : 'Menantu keturunan';
    else if (r.kind === 'col' && r.a === 1 && r.b === 1) term = 'Ipar';
    else if (r.kind === 'col' && r.a === 2 && r.b === 1) term = jw && r.old ? pickG(t, r.old > 0 ? 'Pakde' : 'Paklik', r.old > 0 ? 'Bude' : 'Bulik', 'Paman/Bibi') : pickG(t, 'Paman', 'Bibi', 'Paman/Bibi');
    else term = 'Pasangan ' + lcf(r.term);
    return { term, why: `${U(lcf(pickG(t, 'Suami', 'Istri', 'Pasangan')))} dari ${fn(x)} (${lcf(r.term)} Anda)`, kind: 'inlaw', law: true };
  }
  for (const z of sM) {                                    // T adalah kerabat sedarah dari pasangan saya
    const r = rel1(z, tid, jw); if (!r || !r.blood) continue; const x = F.byId.get(z); let term;
    if (r.kind === 'anc' && r.a === 1) term = 'Mertua';
    else if (r.kind === 'col' && r.a === 1 && r.b === 1) term = 'Ipar';
    else term = `${r.term} (dari pasangan)`;
    return { term, why: `${U(lcf(r.term))} dari ${fn(x)} (pasangan Anda)`, kind: 'inlaw', law: true };
  }
  for (const z of sM) for (const s of sT) {                // keduanya: pasangan dari kerabat pasangan saya
    const r = rel1(z, s, jw); if (!r || !r.blood) continue;
    if (r.kind === 'col' && r.a === 1 && r.b === 1) return { term: 'Ipar', why: `${U(lcf(pickG(t, 'Suami', 'Istri', 'Pasangan')))} dari ${fn(F.byId.get(s))}, saudara pasangan Anda`, kind: 'inlaw', law: true };
    return { term: 'Kerabat lewat pernikahan', why: `Terhubung melalui ${fn(F.byId.get(z))} (pasangan Anda) dan ${fn(F.byId.get(s))}`, kind: 'inlaw', law: true };
  }
  return { term: '', none: true };
}

function relInfo(id) {                                     // hasil per (saya, orang, gaya istilah), disimpan selama FAM yang sama
  if (!SELF_ID || !FAM || !FAM.byId.has(SELF_ID)) return null;
  const c = FAM._rel || (FAM._rel = new Map()), k = SELF_ID + ':' + id + ':' + TERM; let v = c.get(k);
  if (!v) { v = id === SELF_ID ? { term: 'Anda', kind: 'self', why: '' } : computeRel(SELF_ID, id); c.set(k, v); }
  return v;
}
const selfName = () => { const m = FAM && SELF_ID && FAM.byId.get(SELF_ID); return m ? m.name : ''; };

// ---------- Elemen tampilan sebutan ----------
function relBadge(m) {                                     // strip di dasar kartu pohon
  if (!SELF_ID || !REL_ON) return '';
  const r = relInfo(m.id); if (!r) return '';
  if (r.kind === 'self') return '<div class="rk rk-me">Anda</div>';
  if (r.none) return '<div class="rk rk-none" title="Tidak ada hubungan keluarga tercatat dengan Anda">—</div>';
  return `<div class="rk ${r.law ? 'rk-law' : 'rk-blood'}" title="${esc(r.term + (r.why ? ' — ' + r.why : ''))}">${esc(r.term)}</div>`;
}
function relInline(m) {                                    // di tampilan daftar
  if (!SELF_ID || !REL_ON) return '';
  const r = relInfo(m.id); if (!r || r.none) return '';
  return `<em class="rk-i ${r.kind === 'self' ? 'rk-me' : r.law ? 'rk-law' : 'rk-blood'}">${esc(r.term)}</em>`;
}
const relPrefix = m => { if (!SELF_ID) return ''; const r = relInfo(m.id); return r && r.term ? (r.kind === 'self' ? 'Anda' : r.term) + ' · ' : ''; };

function relProfile(m) {                                   // blok di profil
  if (!SELF_ID) return `<div class="detail relme off" style="grid-column:span 2"><span>Hubungan dengan Anda</span><div class="rtxt">Pilih “Posisi saya” agar tampil sebutan seperti <b>Paman</b>, <b>Sepupu</b>, atau <b>Ipar</b> dari sudut pandang Anda. <button class="btn-s" onclick="setSelf(${m.id})">📍 Ini saya</button> <button class="btn-s" onclick="openSelfPicker()">Pilih orang lain…</button></div></div>`;
  const r = relInfo(m.id); if (!r) return '';
  if (r.kind === 'self') return `<div class="detail relme me" style="grid-column:span 2"><span>Hubungan dengan Anda</span><b><em class="rk-i rk-me">Ini Anda</em></b><div class="rtxt">Sebutan pada seluruh silsilah dihitung dari sudut pandang orang ini. <button class="btn-s" onclick="openSelfPicker()">Ganti</button></div></div>`;
  const nm = esc(first(selfName()));
  return `<div class="detail relme" style="grid-column:span 2"><span>Hubungan dengan Anda <small>(sebagai ${nm})</small></span>${r.term ? `<b class="relterm"><em class="rk-i ${r.law ? 'rk-law' : 'rk-blood'}">${esc(r.term)}</em> <small>bagi ${nm}</small></b>${r.why ? `<div class="rtxt">${esc(r.why)}</div>` : ''}` : `<div class="rtxt">Belum ada hubungan keluarga atau pernikahan yang tercatat dengan ${nm}.</div>`}<div class="rtxt"><button class="btn-s" onclick="setSelf(${m.id})">📍 Ini saya</button> <button class="btn-s" onclick="openSelfPicker()">Ganti sudut pandang</button></div></div>`;
}

// ---------- Memilih "Posisi saya" ----------
function setSelf(id, quiet) {
  SELF_ID = id || null; LS.set('fh-self', SELF_ID); if (FAM) { FAM._rel = null; }
  closeModal2('selfModal'); if (typeof closeProfile === 'function') closeProfile();
  syncSelfBtn(); if (page === 'silsilah' && $('#fttree')) { renderCrumb(); renderBody(); if (SELF_ID && !quiet) focusPerson(SELF_ID); }
  if (!quiet) toast(SELF_ID ? '📍 Sudut pandang: ' + FAM.byId.get(SELF_ID).name : 'Sudut pandang dihapus');
}
const syncSelfBtn = () => { const b = $('#ftme'); if (!b) return; const n = SELF_ID && FAM && FAM.byId.get(SELF_ID); b.classList.toggle('on', !!n); b.innerHTML = n ? `📍 Saya: <b>${esc(first(n.name))}</b>` : '📍 Posisi saya'; const v = viewEl && viewEl(); if (v) v.classList.toggle('relon', !!(n && REL_ON)); };
function modal2(id, html, cls = '') {                      // dialog ringan, memakai gaya .modal bawaan
  let m = document.getElementById(id); if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = id; backdropClose(m, () => m.classList.remove('show')); document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-box ${cls}">${html}</div>`; m.classList.add('show'); return m;
}
const closeModal2 = id => { const m = document.getElementById(id); if (m) m.classList.remove('show'); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') ['selfModal', 'guideModal'].forEach(closeModal2); });

function openSelfPicker() {
  FAM = famOf(); const cur = SELF_ID && FAM.byId.get(SELF_ID), guess = !cur && ME ? first(ME.name) : '';
  const m = modal2('selfModal', `<div class="modal-top"><b>📍 Posisi saya di silsilah</b><button class="close" onclick="closeModal2('selfModal')">×</button></div>
  <p class="sm-note">Pilih nama Anda. Setelah itu setiap kartu menampilkan <b>sebutan hubungan</b> terhadap Anda — mis. <em class="rk-i rk-blood">Paman</em> <em class="rk-i rk-blood">Sepupu</em> <em class="rk-i rk-law">Ipar</em> — sehingga tidak perlu menebak siapa-siapa. Pilihan hanya tersimpan di perangkat ini.</p>
  ${cur ? `<div class="sm-cur"><span>Sekarang: <b>${esc(cur.name)}</b></span><button class="btn-s" onclick="focusPerson(${cur.id});closeModal2('selfModal')">Pusatkan ke saya</button><button class="btn-s" onclick="setSelf(null)">Hapus pilihan</button></div>` : ''}
  <div class="ftsearch sm-search"><input id="smq" placeholder="Ketik nama Anda…" autocomplete="off" value="${esc(guess)}"></div><div id="smres" class="sm-res"></div>
  <div class="sm-opts"><label class="sm-opt"><input type="checkbox" id="smrel" ${REL_ON ? 'checked' : ''}> Tampilkan sebutan di kartu pohon &amp; daftar</label>
  <div class="sm-opt">Istilah paman/bibi: <div class="seg" id="smterm"><button data-t="umum" class="${TERM === 'umum' ? 'on' : ''}">Umum<small>Paman · Bibi · Kakek</small></button><button data-t="jawa" class="${TERM === 'jawa' ? 'on' : ''}">Jawa<small>Pakde · Bude · Mbah</small></button></div></div></div>`, 'sm');
  const q = m.querySelector('#smq'), res = m.querySelector('#smres');
  const draw = () => { const items = searchMembers(q.value).concat([]); res.innerHTML = q.value.trim() ? (items.length ? items.map(x => `<button data-id="${x.id}" class="g-${gCls(x)}">${avHtml(x, 's', 'sm')}<b>${esc(x.name)}</b><small>${esc(x.birth_year ? 'lahir ' + x.birth_year : '')}${FAM.gen.get(x.id) ? ' · Gen ' + FAM.gen.get(x.id) : ''}</small></button>`).join('') : '<small class="muted">Tidak ada nama yang cocok.</small>') : '<small class="muted">Mulai mengetik untuk mencari nama…</small>'; hydratePhotos(res); };
  q.oninput = draw; draw(); setTimeout(() => { q.focus(); q.select(); }, 60);
  res.onclick = e => { const b = e.target.closest('[data-id]'); if (b) setSelf(+b.dataset.id); };
  q.onkeydown = e => { if (e.key === 'Enter') { const b = res.querySelector('[data-id]'); if (b) setSelf(+b.dataset.id); } };
  m.querySelector('#smrel').onchange = e => { REL_ON = e.target.checked; LS.set('fh-rel', REL_ON ? '1' : '0'); syncSelfBtn(); if (page === 'silsilah' && $('#fttree')) renderBody(); };
  m.querySelector('#smterm').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; TERM = b.dataset.t; LS.set('fh-term', TERM); m.querySelectorAll('#smterm button').forEach(x => x.classList.toggle('on', x === b)); if (FAM) FAM._rel = null; if (page === 'silsilah' && $('#fttree')) renderBody(); };
}

// ---------- Panduan "Cara membaca silsilah" ----------
function openGuide() {
  LS.set('fh-guide', '1'); const h = $('#fthint2'); if (h) h.remove();
  const mem = (n, g, y, extra = '', cls = '') => `<div class="pc g-${g} ${cls}"><div class="av">${esc(ini(n))}<i>${g === 'm' ? '♂' : '♀'}</i></div><div class="pi"><b>${n}</b><span>${y}</span>${extra}</div></div>`;
  const row = (sample, t, d) => `<div class="gd-row"><div class="gd-s">${sample}</div><div class="gd-t"><b>${t}</b><span>${d}</span></div></div>`;
  modal2('guideModal', `<div class="modal-top"><b>Cara membaca silsilah</b><button class="close" onclick="closeModal2('guideModal')">×</button></div>
  <div class="gd">
  <h4>① Satu bingkai = satu keluarga</h4>
  ${row(`<div class="unit">${mem('Ahmad', 'm', '1950 · 76 th')}<div class="uj" title="Menikah">♥</div>${mem('Fitri', 'f', '1953 · 73 th')}</div>`, 'Suami &amp; istri dalam satu bingkai', 'Garis ke bawah menuju <b>anak-anak</b> mereka. Biru = laki-laki, merah muda = perempuan. Bila pernah menikah lagi, semua pasangan ada dalam satu bingkai.')}
  ${row(`<div class="unit">${mem('Fajar', 'm', '1962 · 64 th')}<div class="uj x" title="Cerai">✕</div>${mem('Gita', 'f', '1964 · 62 th')}</div>`, '✕ = cerai, ♥ = menikah', 'Tanda <b>†</b> di depan nama dan kartu yang redup berarti <b>almarhum/ah</b>.')}
  <h4>② Siapa yang masuk lewat pernikahan?</h4>
  ${row(`<div class="unit"><div class="pc g-m kn-pendiri"><span class="kt kt-pendiri">Leluhur</span><div class="av">DW<i>♂</i></div><div class="pi"><b>Darmo</b><span>1925–2005</span></div></div></div>`, 'Leluhur', 'Pendiri keluarga (generasi 1). Semua <b>keturunan asli</b> adalah anak-cucunya, lewat ayah maupun ibu.')}
  ${row(`<div class="unit"><div class="pc g-f kn-menantu"><span class="kt kt-menantu">Menantu</span><div class="av">FH<i>♀</i></div><div class="pi"><b>Fitri</b><span>1953 · 73 th</span></div><button class="orig" tabindex="-1">⌂</button></div></div>`, 'Menantu — garis putus-putus', 'Pasangan yang masuk keluarga lewat pernikahan. Tombol <b>⌂</b> membuka <b>keluarga asalnya</b>.')}
  ${row(`<div class="unit"><div class="pc g-m kn-besan" style="background:var(--k-besbg)"><span class="kt kt-besan">Besan</span><div class="av">PH<i>♂</i></div><div class="pi"><b>Pak Hasan</b><span>1925–1999</span></div></div></div>`, 'Besan — latar kuning', 'Keluarga asal menantu (orang tua = <b>besan</b>, saudara = <b>ipar</b>). Ditampilkan sebagai kelompok tersendiri agar tidak mengacaukan pohon utama.')}
  <h4>③ Tombol &amp; tanda kecil</h4>
  ${row('<span class="gd-ic"><span class="tgl" style="position:static;transform:none">+5</span></span>', 'Angka <b>+5</b>', 'Ada 5 keturunan di bawahnya yang masih tertutup. Klik untuk membuka; klik <b>−</b> untuk melipat.')}
  ${row('<span class="gd-ic"><span class="fbr" style="position:static;opacity:1">⤢</span></span>', '⤢ Fokus cabang', 'Muncul saat kursor di atas bingkai. Menampilkan <b>hanya cabang itu</b> beserta ringkasannya.')}
  ${row('<span class="gd-ic"><span class="tref" style="margin:0">↪ Nama</span></span>', '↪ Pindah ke orangnya', 'Orang ini juga tercatat di keluarga lain. Klik untuk melompat ke sana.')}
  ${row('<span class="gd-ic"><span class="gl" style="position:static"><b>Generasi 2</b><small>lahir 1950–1970</small></span></span>', 'Pita generasi', 'Pita warna di tepi kiri menandai baris generasi dan rentang tahun lahirnya.')}
  <h4>④ Menjelajah</h4>
  <ul class="gd-ul"><li><b>Cari nama</b> di kolom pencarian — pohon langsung berpindah dan menyorot orangnya.</li><li><b>Seret</b> untuk menggeser · <b>Ctrl + scroll</b> atau <b>cubit</b> untuk zoom · tombol <b>⤢</b> di kanan bawah = pas layar.</li><li><b>Klik kartu</b> untuk melihat profil; tombol <b>🧬 Sorot garis keturunan</b> menandai leluhur &amp; keturunan orang itu.</li><li>Di HP, tampilan <b>Daftar</b> lebih nyaman; ketuk ▸ untuk membuka cabang.</li></ul>
  <h4>⑤ Lihat hubungan langsung dengan Anda</h4>
  <p class="gd-p">Tekan <b>📍 Posisi saya</b>, pilih nama Anda, maka tiap kartu bertanda <em class="rk-i rk-blood">Paman</em> <em class="rk-i rk-blood">Sepupu</em> <em class="rk-i rk-law">Ipar</em> … sesuai hubungannya dengan Anda.</p>
  <div class="row"><button class="ghost" onclick="closeModal2('guideModal');openSelfPicker()">📍 Pilih posisi saya</button><button class="primary" onclick="closeModal2('guideModal')">Mengerti</button></div></div>`, 'gd-box');
}
function hintHtml() {                                      // ajakan satu kali untuk pengguna baru
  if (LS.get('fh-guide', '') === '1') return '';
  return `<div class="fthint2" id="fthint2"><span>👋 <b>Baru melihat silsilah ini?</b><span class="hd"> Pelajari cara membacanya — hanya 1 menit.</span></span><div><button class="btn-s" onclick="openGuide()">Cara membaca</button>${SELF_ID ? '' : '<button class="btn-s" onclick="openSelfPicker()">📍 Posisi saya</button>'}<button class="x" title="Tutup" onclick="LS.set('fh-guide','1');this.closest('.fthint2').remove()">✕</button></div></div>`;
}

const relTip = m => { if (!SELF_ID) return ''; const r = relInfo(m.id); return !r ? '' : r.kind === 'self' ? 'Ini Anda' : r.term ? 'Bagi Anda: ' + r.term : ''; };
function showSelf() {                                      // saat halaman dibuka: tandai kartu "Anda"; bila tidak terlihat, buka jalurnya & pusatkan
  const el = $(`#fttree [data-p="${SELF_ID}"]`), v = viewEl();
  if (el && v) { const r = el.getBoundingClientRect(), q = v.getBoundingClientRect(); if (r.right > q.left && r.left < q.right && r.bottom > q.top && r.top < q.bottom) return flash(el); }
  focusPerson(SELF_ID);
}
document.addEventListener('click', e => {                  // tab di profil: Keluarga | Arisan & iuran
  const b = e.target.closest('[data-pt]'); if (!b) return; const box = b.closest('#profileBox'); if (!box) return;
  box.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('on', x === b));
  box.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.pt; });
});
