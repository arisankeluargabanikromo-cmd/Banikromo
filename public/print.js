// ============================================================
// Cetak Silsilah (v3.4) — Studio Cetak untuk poster yang dipajang di ruang keluarga
//
// Sistem:
//   1. Model keluarga memakai buildFam() yang sama dengan halaman Silsilah (unit pasangan → anak).
//   2. Mesin tata letak menyusun pohon dalam "satuan desain" (du), dua arah: Atas→Bawah & Kiri→Kanan.
//   3. Poster dibuat sebagai SVG berukuran milimeter sungguhan → vektor, tajam di kertas apa pun (A4 s.d. A0).
//   4. "Otomatis" mencoba semua kombinasi tata letak × orientasi dan memilih yang hurufnya paling besar.
//   5. Keluaran: cetak langsung / simpan PDF (lewat dialog cetak), poster tempel dari beberapa lembar, PNG, SVG.
// ============================================================
(() => {
const LSK = 'fh-print-v1', MMPT = 72 / 25.4;
const PAPER = { a4: ['A4', 210, 297], a3: ['A3', 297, 420], a2: ['A2', 420, 594], a1: ['A1', 594, 841], a0: ['A0', 841, 1189],
  b3040: ['30 × 40 cm', 300, 400], b4060: ['40 × 60 cm', 400, 600], b5070: ['50 × 70 cm', 500, 700], b6090: ['60 × 90 cm', 600, 900] };
const SHEET = { a4: ['A4', 210, 297], a3: ['A3', 297, 420], letter: ['Letter', 216, 279] };
const SERIF = "Georgia,'Times New Roman',serif", SANS = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const TH = {   // [isi, garis] untuk laki-laki (m), perempuan (f), netral (x)
  klasik: { n: 'Klasik Krem', bg: '#fbf5e6', band: 'rgba(168,131,47,.09)', ink: '#3b2a1d', soft: '#7a6652', acc: '#a8832f', line: '#b49c72', hf: SERIF, bf: SERIF, m: ['#e8eef4', '#6b88a6'], f: ['#f8e8eb', '#b56e7d'], x: ['#f0ebdf', '#a39378'] },
  modern: { n: 'Modern Putih', bg: '#ffffff', band: 'rgba(105,87,255,.05)', ink: '#172033', soft: '#6b7690', acc: '#6957ff', line: '#c5cde0', hf: SANS, bf: SANS, m: ['#eaf0ff', '#4b7bff'], f: ['#fde8f1', '#ec5f9a'], x: ['#eef1f6', '#8b95a8'], up: 1 },
  gelap: { n: 'Elegan Gelap', bg: '#0e1530', band: 'rgba(255,255,255,.04)', ink: '#f3ecd9', soft: '#a9b0c8', acc: '#e2b857', line: '#4d5a85', hf: SERIF, bf: SANS, m: ['#1b2a52', '#7da0ff'], f: ['#3a2140', '#ff86b8'], x: ['#1d2540', '#8b95a8'] },
  alam: { n: 'Hijau Alam', bg: '#f1f6ee', band: 'rgba(60,110,70,.08)', ink: '#1f3a27', soft: '#5f7a66', acc: '#3f8a52', line: '#9db9a3', hf: SERIF, bf: SERIF, m: ['#e3eef4', '#5b8aa8'], f: ['#f6e8e4', '#c07a68'], x: ['#e8efe4', '#8aa38f'] },
  hitam: { n: 'Hitam Putih (hemat tinta)', bg: '#ffffff', band: 'rgba(0,0,0,.045)', ink: '#111111', soft: '#555555', acc: '#111111', line: '#888888', hf: SERIF, bf: SANS, m: ['#ffffff', '#111111'], f: ['#ebebeb', '#111111'], x: ['#ffffff', '#777777'] },
};
const DEF = { scope: 'all', branch: null, depth: 99, spouses: true, dead: true, photos: true, years: true, nameMode: 'full', theme: 'klasik', gender: true,
  title: '', subtitle: '', motto: '', logo: true, frame: true, bands: true, legend: true, date: true, gap: 'normal',
  paper: 'a1', orient: 'auto', layout: 'auto', margin: 'normal', mode: 'single', sheet: 'a4', pngq: 'hi' };
const PERSIST = ['depth', 'spouses', 'dead', 'photos', 'years', 'nameMode', 'theme', 'gender', 'motto', 'logo', 'frame', 'bands', 'legend', 'date', 'gap', 'paper', 'orient', 'layout', 'margin', 'mode', 'sheet', 'pngq'];
let O = null, TAB = 'isi', ZOOM = 1, LAST = null, TOK = 0, BR = [], timer = 0;
const PD = {};   // cache foto: kunci berkas → data-URL ('' = gagal)

// ---------- Utilitas ----------
const n2 = n => +Number(n).toFixed(2), roman = n => { const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
let _cx, _cxTried = false; const MC = new Map();
function em(t, bold, fam) {    // lebar teks dalam satuan em (ukuran font 1)
  const k = (bold ? 'b' : 'n') + fam.length + t; if (MC.has(k)) return MC.get(k);
  let w; if (!_cxTried) { _cxTried = true; try { _cx = document.createElement('canvas').getContext('2d'); } catch (e) { _cx = null; } }
  if (_cx) { _cx.font = `${bold ? 700 : 400} 100px ${fam}`; w = _cx.measureText(t).width / 100; } else w = t.length * (bold ? .58 : .52);
  MC.set(k, w); return w;
}
const tw = (t, fs, bold, fam) => em(t, bold, fam) * fs;
function trunc(t, maxW, fs, bold, fam) { while (t.length > 1 && tw(t + '…', fs, bold, fam) > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; }
function wrapName(name, maxW, fs0, maxLines, fam) {
  const words = String(name).trim().split(/\s+/);
  for (const k of [1, .92, .84, .76, .7]) {
    const fs = fs0 * k, lines = []; let cur = '', ok = true;
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (tw(t, fs, true, fam) <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; if (tw(cur, fs, true, fam) > maxW) ok = false; } }
    if (cur) lines.push(cur);
    if (ok && lines.length <= maxLines) return { lines, fs };
  }
  const fs = fs0 * .7, lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (tw(t, fs, true, fam) <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines); if (lines.length > maxLines || tw(out[out.length - 1], fs, true, fam) > maxW) out[out.length - 1] = trunc(lines.slice(maxLines - 1).join(' '), maxW, fs, true, fam);
  return { lines: out, fs };
}
const isBlood = m => { const k = FAM.kin.get(m.id); return !k || k.k === 'asli' || k.k === 'pendiri'; };
const unitsLabel = u => u.members.map(m => m.name).join(' & ');

// ---------- Model pohon (dari buildFam) ----------
function scopeUnits(o) { if (o.scope === 'branch' && o.branch != null) { const u = FAM.uById.get(o.branch); if (u) return [u]; } return FAM.roots; }
function mkTree(o) {
  let count = 0, maxD = 0;
  const mk = (u, d) => {
    let ms = u.members; if (!o.spouses) { const b = ms.filter(isBlood); ms = b.length ? b : ms.slice(0, 1); }
    count += ms.length; maxD = Math.max(maxD, d);
    const n = { u, ms, d, kids: [], hid: 0 };
    if (u.kids.length && d < o.depth - 1) n.kids = u.kids.map(k => mk(k, d + 1)); else n.hid = u.desc || 0;
    return n;
  };
  const roots = scopeUnits(o).map(u => mk(u, 0)); return { roots, count, maxD };
}
const fullDepth = o => mkTree({ ...o, depth: 99 }).maxD + 1;

// ---------- Mesin tata letak ----------
function geom(tb, o) {
  const f = { rapat: .7, normal: 1, lega: 1.4 }[o.gap] || 1, ph = !!o.photos;
  return tb ? { tb, cw: 30, ch: ph ? 38 : 20, ph, pd: 15, nfs: 3.3, yfs: 2.5, lines: 3, cgp: 7, lg: 15 * (.85 + .15 * f), sgS: 3 * f, sgB: 7 * f }
    : { tb, cw: ph ? 50 : 42, ch: ph ? 15 : 13, ph, pd: 11, nfs: 3.2, yfs: 2.4, lines: 2, cgp: 5, lg: 14 * (.9 + .1 * f), sgS: 2.2 * f, sgB: 4.5 * f };
}
function prepare(o, tb, xl = 0) {
  const T = mkTree(o), G = geom(tb, o); G.lg += xl; G.cm = tb ? G.ch : G.cw; G.cc = tb ? G.cw : G.ch;
  const nodes = [], gapB = (a, b) => (a.kids.length || b.kids.length || a.hid || b.hid) ? G.sgB : G.sgS;
  const size = n => { nodes.push(n); n.cs = n.ms.length * G.cc + (n.ms.length - 1) * G.cgp; let w = 0; n.kids.forEach((k, i) => { size(k); w += k.sw + (i ? gapB(n.kids[i - 1], k) : 0); }); n.sw = Math.max(n.cs, w); n.kw = w; n.m = n.d * (G.cm + G.lg); };
  const place = (n, left) => {
    if (n.kids.length) {
      let x = left + (n.sw - n.kw) / 2; n.kids.forEach((k, i) => { if (i) x += gapB(n.kids[i - 1], k); place(k, x); x += k.sw; });
      n.cx = (n.kids[0].cx + n.kids[n.kids.length - 1].cx) / 2; n.cx = Math.min(Math.max(n.cx, left + n.cs / 2), left + n.sw - n.cs / 2);
    } else n.cx = left + n.sw / 2;
  };
  let x = 0; T.roots.forEach((r, i) => { size(r); if (i) x += G.sgB * 2; place(r, x); x += r.sw; });
  const GUT = o.bands ? (tb ? 9 : 8) : 0, pad = 3, cross = x, main = (T.maxD + 1) * G.cm + T.maxD * G.lg;
  return { T, G, nodes, GUT, pad, cross, main, Wd: (tb ? GUT + cross : main) + 2 * pad, Hd: (tb ? main : GUT + cross) + 2 * pad };
}

// ---------- Judul bawaan ----------
function defTitle(o) { const r = scopeUnits(o); return r.length === 1 ? 'Keluarga Besar ' + [...new Set(r[0].members.map(m => first(m.name)))].join(' & ') : 'Silsilah Keluarga Besar'; }
function defSub(o, P) { const r = scopeUnits(o), S = FAM.stats; const who = r.length === 1 ? 'Keturunan ' + r[0].members.map(m => m.name).join(' & ') + ' • ' : '';
  return `${who}${P.T.maxD + 1} generasi • ${P.T.count} anggota`; }

// ---------- Metrik kertas ----------
function metrics(W, H, o, title, sub) {
  const u = Math.min(W, H) / 100, m = ({ sempit: 2.6, normal: 4, lega: 6 }[o.margin] || 4) * u, th = TH[o.theme] || TH.klasik;
  const logo = o.logo && window.FH_BRAND && FH_BRAND.logo ? 7.5 * u : 0, availT = W - 2 * m - 4 * u;
  const tFs = Math.min(4.6 * u, availT / Math.max(.1, em(th.up ? title.toUpperCase() : title, true, th.hf) * (th.up ? 1.08 : 1))), sFs = Math.min(1.8 * u, availT / Math.max(.1, em(sub, false, th.bf)));
  const hh = (logo ? logo + 1.4 * u : 0) + tFs * 1.2 + 1.6 * u + (sub ? sFs * 1.5 : 0) + 2.6 * u;
  const fh = (o.legend && o.date ? 6.8 : o.legend || o.date ? 3.8 : 0) * u + (o.motto ? 4.6 * u : 0) + 1.6 * u;
  return { u, m, logo, tFs, sFs, hh, fh, ax: m, ay: m + hh, aw: W - 2 * m, ah: H - 2 * m - hh - fh };
}
function fitScale(P, M) {
  const s = Math.min(M.aw / P.Wd, M.ah / P.Hd), cap = (0.2 * Math.min(M.aw, M.ah + M.hh)) / P.G.cw;   // kartu tak boleh > 20% sisi pendek
  return Math.max(.0001, Math.min(s, cap));
}
function pickPaper(o) { let [, W, H] = PAPER[o.paper] || PAPER.a1; return [W, H]; }
function choose(o, title, sub) {     // pilih tata letak × orientasi dengan skala (huruf) terbesar
  const [a, b] = pickPaper(o), ors = o.orient === 'auto' ? ['p', 'l'] : [o.orient === 'portrait' ? 'p' : 'l'], lays = o.layout === 'auto' ? [true, false] : [o.layout === 'tb'];
  let best = null;
  for (const tb of lays) { const P = prepare(o, tb);
    for (const or of ors) { const [W, H] = or === 'p' ? [Math.min(a, b), Math.max(a, b)] : [Math.max(a, b), Math.min(a, b)], M = metrics(W, H, o, title, sub || defSub(o, P)), s = fitScale(P, M) * (or === 'p' ? 1.03 : 1);
      if (!best || s > best.score) best = { P, W, H, M, tb, or, score: s }; } }
  best.s = fitScale(best.P, best.M); return best;
}

// ---------- Foto ----------
async function ensure(keys, prog) {
  const need = [...new Set(keys)].filter(k => PD[k] === undefined); if (!need.length) return;
  await signPaths(need);
  let i = 0, done = 0;
  const work = async () => { while (i < need.length) { const k = need[i++]; try { const u = PH[k] && PH[k].u; if (u) { const r = await fetch(u); if (r.ok) PD[k] = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; r.blob().then(b => f.readAsDataURL(b)); }); } } catch (e) { } if (!PD[k]) PD[k] = ''; done++; prog && prog(done, need.length); } };
  await Promise.all(Array.from({ length: 6 }, work));
}

// ---------- Gambar kartu & pohon (satuan desain) ----------
const yearsTxt = m => m.death_year ? `${m.birth_year || '?'} – ${m.death_year}` : m.birth_year ? 'Lahir ' + m.birth_year : '';
function cardSvg(m, x, y, G, th, o, ctx) {
  const w = G.cw, h = G.ch, kn = FAM.kin.get(m.id) || { k: 'asli' }, sty = !o.gender ? th.x : m.gender === 'L' ? th.m : m.gender === 'P' ? th.f : th.x;
  const dead = !!m.death_year, lead = kn.k === 'pendiri', yt = o.years ? yearsTxt(m) : '', nm = o.nameMode === 'short' ? first(m.name) : m.name;
  const tx = (G.tb ? w - 4 : (G.ph ? w - 2 - 15 - 2 : w - 6)), wr = wrapName(nm, tx, G.nfs, G.lines, th.bf), lh = wr.fs * 1.2, p = [];
  p.push(`<rect x="${n2(x + .5)}" y="${n2(y + .7)}" width="${w}" height="${h}" rx="3" fill="#000" opacity=".07"/><rect x="${n2(x)}" y="${n2(y)}" width="${w}" height="${h}" rx="3" fill="${sty[0]}" stroke="${lead ? th.acc : sty[1]}" stroke-width="${lead ? 1 : .55}"/>`);
  let px, py, tx0, ty, anchor, bh = wr.lines.length * lh + (yt ? .9 + G.yfs : 0);
  if (G.tb) { px = x + w / 2 - G.pd / 2; py = y + 2.5; anchor = 'middle'; tx0 = x + w / 2; ty = G.ph ? y + 2.5 + G.pd + 1.5 : y + (h - bh) / 2; }
  else { px = x + 2; py = y + (h - G.pd) / 2; anchor = 'start'; tx0 = G.ph ? x + 2 + G.pd + 2 : x + 3; ty = y + (h - bh) / 2; }
  if (G.ph) {
    const base = m.photo_path, d = ctx.dia, key = base ? base + (d >= 16 ? '_l.jpg' : '_s.jpg') : null, src = key ? PD[key] : null;
    if (key && PD[key] === undefined) ctx.need.push(key);
    const cx = px + G.pd / 2, cy = py + G.pd / 2;
    if (src) p.push(`<image href="${src}" xlink:href="${src}" x="${n2(px)}" y="${n2(py)}" width="${G.pd}" height="${G.pd}" preserveAspectRatio="xMidYMid slice" clip-path="url(#fhcp)"/>`);
    else p.push(`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${G.pd / 2}" fill="${th.bg}" opacity=".75"/><text x="${n2(cx)}" y="${n2(cy + G.pd * .15)}" text-anchor="middle" font-size="${n2(G.pd * .4)}" font-weight="700" fill="${sty[1]}">${esc(ini(m.name))}</text>`);
    p.push(`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${G.pd / 2}" fill="none" stroke="${sty[1]}" stroke-width=".55"/>`);
  }
  wr.lines.forEach((ln, i) => p.push(`<text x="${n2(tx0)}" y="${n2(ty + wr.fs * .85 + i * lh)}" text-anchor="${anchor}" font-size="${n2(wr.fs)}" font-weight="700" fill="${th.ink}">${esc(ln)}</text>`));
  if (yt) { const yy = G.tb && G.ph ? y + h - 2.4 : ty + wr.lines.length * lh + .9 + G.yfs * .85; p.push(`<text x="${n2(tx0)}" y="${n2(yy)}" text-anchor="${anchor}" font-size="${G.yfs}" fill="${th.soft}">${esc(yt)}</text>`); }
  if (dead && o.dead) p.push(`<path d="M${n2(x + w - 3.4)} ${n2(y + 1.7)}v3.4M${n2(x + w - 4.6)} ${n2(y + 2.9)}h2.4" stroke="${th.soft}" stroke-width=".55" fill="none" stroke-linecap="round"/>`);
  return p.join('');
}
function drawTree(P, th, o, ctx) {
  const { G, T, GUT, nodes } = P, out = [], pt = (m, c) => G.tb ? [GUT + c, m] : [m, GUT + c], L = (m, c) => { const q = pt(m, c); return n2(q[0]) + ' ' + n2(q[1]); };
  const crossOf = (n, i) => n.cx - n.cs / 2 + i * (G.cc + G.cgp);
  // pita generasi
  if (o.bands) for (let d = 0; d <= T.maxD; d++) {
    const m0 = d * (G.cm + G.lg), a = d === 0 ? -P.pad : m0 - G.lg / 2, b = d === T.maxD ? m0 + G.cm + P.pad : m0 + G.cm + G.lg / 2, c1 = P.cross + P.pad;
    const rect = G.tb ? [-P.pad, a, GUT + c1 + P.pad, b - a] : [a, -P.pad, b - a, GUT + c1 + P.pad];
    if (d % 2 === 0) out.push(`<rect x="${n2(rect[0])}" y="${n2(rect[1])}" width="${n2(rect[2])}" height="${n2(rect[3])}" fill="${th.band}"/>`);
    const lab = G.tb ? [GUT / 2, (a + b) / 2] : [(a + b) / 2, GUT / 2];
    out.push(`<text x="${n2(lab[0])}" y="${n2(lab[1] + 1.2)}" text-anchor="middle" font-size="4.4" font-weight="700" fill="${th.soft}" opacity=".9" font-family="${th.hf}">${roman(d + 1)}</text>`);
  }
  // garis
  const lines = [], rings = [];
  for (const n of nodes) {
    const base = n.m + G.cm / 2;
    for (let i = 0; i + 1 < n.ms.length; i++) {          // ikatan pasangan
      const a = crossOf(n, i) + G.cc, b = crossOf(n, i + 1), mid = (a + b) / 2, cer = FAM.st.get(Math.min(n.ms[i].id, n.ms[i + 1].id) + '-' + Math.max(n.ms[i].id, n.ms[i + 1].id)) === 'cerai';
      lines.push(`<path d="M${L(base, a)}L${L(base, b)}" ${cer ? 'stroke-dasharray="1 .8"' : ''}/>`);
      const p1 = pt(base, mid - .75), p2 = pt(base, mid + .75);
      rings.push(cer ? `<path d="M${L(base - 1, mid - .6)}L${L(base + 1, mid + .6)}" stroke="${th.soft}" stroke-width=".5"/>` : `<circle cx="${n2(p1[0])}" cy="${n2(p1[1])}" r="1.25"/><circle cx="${n2(p2[0])}" cy="${n2(p2[1])}" r="1.25"/>`);
    }
    if (n.kids.length) {
      const bus = n.m + G.cm + G.lg / 2, pair = n.ms.length === 2;
      for (const k of n.kids) {
        let sm = n.m + G.cm, sc = n.cx;
        if (pair) sm = n.m + G.cm / 2 + 1.9;
        else if (n.ms.length > 2 && k.u.pm) { const i = n.ms.indexOf(k.u.pm); if (i >= 0) sc = crossOf(n, i) + G.cc / 2; }
        lines.push(`<path d="M${L(sm, sc)}L${L(bus, sc)}L${L(bus, k.cx)}L${L(k.m, k.cx)}"/>`);
      }
    }
    if (n.hid) { const c = G.tb ? [GUT + n.cx, n.m + G.cm + 3.4] : [n.m + G.cm + 6, GUT + n.cx]; out.push(`<g><rect x="${n2(c[0] - 4.2)}" y="${n2(c[1] - 1.9)}" width="8.4" height="3.8" rx="1.9" fill="${th.band}" stroke="${th.line}" stroke-width=".3"/><text x="${n2(c[0])}" y="${n2(c[1] + .9)}" text-anchor="middle" font-size="2.3" font-weight="700" fill="${th.soft}">+${n.hid}</text></g>`); }
  }
  out.push(`<g fill="none" stroke="${th.line}" stroke-width=".6" stroke-linejoin="round">${lines.join('')}</g><g fill="none" stroke="${th.acc}" stroke-width=".45">${rings.join('')}</g>`);
  // kartu
  const cards = [];
  for (const n of nodes) n.ms.forEach((m, i) => { const q = pt(n.m, crossOf(n, i)); cards.push(cardSvg(m, q[0], q[1], G, th, o, ctx)); });
  out.push(cards.join(''));
  return out.join('');
}

// ---------- Susunan poster (mm) ----------
function legendItems(th, o, u) {
  const it = []; const ic = u * 1.6;
  if (o.gender) { it.push({ t: 'Laki-laki', d: (x, y) => `<rect x="${n2(x)}" y="${n2(y - ic * .5)}" width="${n2(ic)}" height="${n2(ic)}" rx="${n2(ic * .25)}" fill="${th.m[0]}" stroke="${th.m[1]}" stroke-width="${n2(u * .12)}"/>`, w: ic }); it.push({ t: 'Perempuan', d: (x, y) => `<rect x="${n2(x)}" y="${n2(y - ic * .5)}" width="${n2(ic)}" height="${n2(ic)}" rx="${n2(ic * .25)}" fill="${th.f[0]}" stroke="${th.f[1]}" stroke-width="${n2(u * .12)}"/>`, w: ic }); }
  it.push({ t: 'Menikah', d: (x, y) => `<g fill="none" stroke="${th.acc}" stroke-width="${n2(u * .14)}"><circle cx="${n2(x + ic * .36)}" cy="${n2(y)}" r="${n2(ic * .3)}"/><circle cx="${n2(x + ic * .64)}" cy="${n2(y)}" r="${n2(ic * .3)}"/></g>`, w: ic });
  it.push({ t: 'Cerai', d: (x, y) => `<path d="M${n2(x)} ${n2(y)}h${n2(ic)}" stroke="${th.line}" stroke-width="${n2(u * .16)}" stroke-dasharray="${n2(u * .35)} ${n2(u * .3)}"/>`, w: ic });
  if (o.dead) it.push({ t: 'Almarhum/ah', d: (x, y) => `<path d="M${n2(x + ic / 2)} ${n2(y - ic * .5)}v${n2(ic)}M${n2(x + ic * .15)} ${n2(y - ic * .12)}h${n2(ic * .7)}" stroke="${th.soft}" stroke-width="${n2(u * .16)}" fill="none" stroke-linecap="round"/>`, w: ic });
  it.push({ t: 'Leluhur', d: (x, y) => `<rect x="${n2(x)}" y="${n2(y - ic * .5)}" width="${n2(ic)}" height="${n2(ic)}" rx="${n2(ic * .25)}" fill="none" stroke="${th.acc}" stroke-width="${n2(u * .24)}"/>`, w: ic });
  return it;
}
function compose(o, withPhotos = true) {
  FAM = famOf();
  const prelim = choose(o, '', ''), title = (o.title || '').trim() || defTitle(o), sub = (o.subtitle || '').trim() || defSub(o, prelim.P);
  const B = choose(o, title, sub), { P, W, H, M, tb } = B, th = TH[o.theme] || TH.klasik, u = M.u, s = B.s;
  let PP = P;   // bila ruang masih longgar pada sumbu generasi, lebarkan jarak antar generasi (kartu tidak berubah ukuran)
  if (P.T.maxD > 0) { const avail = (tb ? M.ah : M.aw) / s - 2 * P.pad, extra = Math.min(P.G.lg * 1.4, Math.max(0, (avail - P.main) / P.T.maxD)); if (extra > 1) PP = prepare(o, tb, extra); }
  const ctx = { need: [], dia: P.G.pd * s }, tree = drawTree(PP, th, o, ctx);
  const cw = PP.Wd * s, ch = PP.Hd * s, ox = M.ax + (M.aw - cw) / 2 + P.pad * s, oy = M.ay + (M.ah - ch) / 2 + P.pad * s, body = [];
  body.push(`<defs><clipPath id="fhcp" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs><rect width="${W}" height="${H}" fill="${th.bg}"/>`);
  if (o.frame) { const i = M.m * .4, j = i + u * .9, k = u * 1.1;
    body.push(`<rect x="${n2(i)}" y="${n2(i)}" width="${n2(W - 2 * i)}" height="${n2(H - 2 * i)}" fill="none" stroke="${th.acc}" stroke-width="${n2(u * .28)}"/><rect x="${n2(j)}" y="${n2(j)}" width="${n2(W - 2 * j)}" height="${n2(H - 2 * j)}" fill="none" stroke="${th.line}" stroke-width="${n2(u * .12)}"/>`);
    for (const [cx, cy] of [[i, i], [W - i, i], [i, H - i], [W - i, H - i]]) body.push(`<path d="M${n2(cx)} ${n2(cy - k)}L${n2(cx + k)} ${n2(cy)}L${n2(cx)} ${n2(cy + k)}L${n2(cx - k)} ${n2(cy)}Z" fill="${th.bg}" stroke="${th.acc}" stroke-width="${n2(u * .2)}"/>`); }
  // kepala
  let y = M.m + u * 1.2; const cxm = W / 2;
  if (M.logo) { body.push(`<image href="${FH_BRAND.logo}" xlink:href="${FH_BRAND.logo}" x="${n2(cxm - M.logo / 2)}" y="${n2(y)}" width="${n2(M.logo)}" height="${n2(M.logo)}" preserveAspectRatio="xMidYMid meet"/>`); y += M.logo + 1.4 * u; }
  body.push(`<text x="${n2(cxm)}" y="${n2(y + M.tFs * .85)}" text-anchor="middle" font-family="${th.hf}" font-size="${n2(M.tFs)}" font-weight="700" fill="${th.ink}"${th.up ? ` letter-spacing="${n2(M.tFs * .06)}"` : ''}>${esc(th.up ? title.toUpperCase() : title)}</text>`); y += M.tFs * 1.2 + .9 * u;
  const dw = Math.min(W * .3, 34 * u); body.push(`<g stroke="${th.acc}" stroke-width="${n2(u * .16)}" fill="none"><path d="M${n2(cxm - dw / 2)} ${n2(y)}H${n2(cxm - u * 1.1)}M${n2(cxm + u * 1.1)} ${n2(y)}H${n2(cxm + dw / 2)}"/><path d="M${n2(cxm)} ${n2(y - u * .7)}l${n2(u * .7)} ${n2(u * .7)}l${n2(-u * .7)} ${n2(u * .7)}l${n2(-u * .7)} ${n2(-u * .7)}z" fill="${th.acc}"/></g>`); y += 1.5 * u;
  if (sub) body.push(`<text x="${n2(cxm)}" y="${n2(y + M.sFs * .85)}" text-anchor="middle" font-family="${th.bf}" font-size="${n2(M.sFs)}" fill="${th.soft}">${esc(sub)}</text>`);
  // pohon
  body.push(`<g transform="translate(${n2(ox)} ${n2(oy)}) scale(${+s.toFixed(5)})" font-family="${th.bf}">${tree}</g>`);
  // kaki (disusun dari bawah: tanggal cetak → keterangan simbol → pesan)
  let fy = H - M.m - u * 1.2;
  if (o.date) { const d = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); body.push(`<text x="${n2(cxm)}" y="${n2(fy)}" text-anchor="middle" font-size="${n2(u * 1.05)}" fill="${th.soft}" opacity=".8" font-family="${th.bf}">Dicetak ${esc(d)} • FamilyHub</text>`); fy -= u * 2.8; }
  if (o.legend) {
    const fs = 1.3 * u, items = legendItems(th, o, u), gap = u * 2.2, lab = i => tw(i.t, fs, false, th.bf) + i.w + u * .7;
    const total = items.reduce((a, i) => a + lab(i), 0) + gap * Math.max(0, items.length - 1), k = Math.min(1, (W - 2 * M.m - 4 * u) / Math.max(1, total)); let x = cxm - total * k / 2;
    body.push(`<g font-size="${n2(fs * k)}" fill="${th.soft}" font-family="${th.bf}">`); items.forEach(i => { body.push(i.d(x, fy - fs * .35)); body.push(`<text x="${n2(x + i.w + u * .7 * k)}" y="${n2(fy)}">${esc(i.t)}</text>`); x += lab(i) * k + gap * k; }); body.push('</g>');
  }
  if (o.motto) { const mt = o.motto.trim(); const f = Math.min(2.1 * u, (W - 2 * M.m - 6 * u) / Math.max(.1, em(mt, false, th.hf))); body.push(`<text x="${n2(cxm)}" y="${n2(H - M.m - M.fh + u * 3.6)}" text-anchor="middle" font-family="${th.hf}" font-style="italic" font-size="${n2(f)}" fill="${th.acc}">${esc(mt)}</text>`); }
  const nm = P.G.nfs * s * MMPT, info = { count: P.T.count, gens: P.T.maxD + 1, W, H, tb, or: B.or, s, namePt: nm, minPt: P.G.yfs * s * MMPT, th, dia: ctx.dia, level: nm >= 9 ? 'ok' : nm >= 6.5 ? 'warn' : 'bad', title, sub };
  return { body: body.join(''), W, H, info, need: [...new Set(ctx.need)], mk: (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${W} ${H}" font-family="${th.bf}">${body.join('')}</svg>` };
}
// Rencana poster tempel
function tilePlan(W, H, o) {
  const [, a, b] = SHEET[o.sheet] || SHEET.a4, pm = 8, ov = 10; let best = null;
  for (const [pw, ph] of [[a, b], [b, a]]) { const ww = pw - 2 * pm, wh = ph - 2 * pm, cols = W <= ww ? 1 : Math.ceil((W - ov) / (ww - ov)), rows = H <= wh ? 1 : Math.ceil((H - ov) / (wh - ov)); if (!best || cols * rows < best.n) best = { pw, ph, ww, wh, cols, rows, n: cols * rows, pm, ov }; }
  return best;
}

// ---------- Keluaran ----------
const fileName = (ext) => `silsilah-keluarga_${new Date().toISOString().slice(0, 10)}.${ext}`;
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
async function finalCompose(setMsg) {
  let r = compose(O);
  for (let i = 0; i < 2 && r.need.length; i++) { await ensure(r.need, (d, n) => setMsg && setMsg(`Memuat foto ${d}/${n}…`)); r = compose(O); }
  return r;
}
function pageCss(w, h) { return `@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;padding:0;background:#fff}.sheet{width:${w}mm;height:${h}mm;overflow:hidden;page-break-after:always;break-after:page;position:relative}.sheet:last-child{page-break-after:auto;break-after:auto}.sheet svg{display:block}`; }
function sheetsHtml(r) {
  if (O.mode !== 'tile') return { css: pageCss(r.W, r.H), html: `<div class="sheet">${r.mk(r.W + 'mm', r.H + 'mm')}</div>`, n: 1 };
  const t = tilePlan(r.W, r.H, O), th = r.info.th, pages = [];
  let n = 0;
  for (let ro = 0; ro < t.rows; ro++) for (let c = 0; c < t.cols; c++) {
    n++; const ox = c * (t.ww - t.ov), oy = ro * (t.wh - t.ov), id = 'w' + n, mk = [];
    mk.push(`<defs><clipPath id="${id}"><rect x="${t.pm}" y="${t.pm}" width="${t.ww}" height="${t.wh}"/></clipPath></defs><rect width="${t.pw}" height="${t.ph}" fill="#fff"/>`);
    mk.push(`<g clip-path="url(#${id})"><use href="#poster" xlink:href="#poster" transform="translate(${n2(t.pm - ox)} ${n2(t.pm - oy)})"/></g>`);
    const q = t.pm, L = 4; mk.push(`<g stroke="#444" stroke-width=".25" fill="none">${[[q, q, 1, 1], [t.pw - q, q, -1, 1], [q, t.ph - q, 1, -1], [t.pw - q, t.ph - q, -1, -1]].map(([x, y, a, b]) => `<path d="M${x - a * L} ${y}H${x}M${x} ${y - b * L}V${y}"/>`).join('')}</g>`);
    if (c > 0) mk.push(`<rect x="${t.pm}" y="${t.pm}" width="${t.ov}" height="${t.wh}" fill="#6957ff" opacity=".07"/><path d="M${t.pm + t.ov} ${t.pm}V${t.pm + t.wh}" stroke="#6957ff" stroke-width=".25" stroke-dasharray="2 1.5"/>`);
    if (ro > 0) mk.push(`<rect x="${t.pm}" y="${t.pm}" width="${t.ww}" height="${t.ov}" fill="#6957ff" opacity=".07"/><path d="M${t.pm} ${t.pm + t.ov}H${t.pm + t.ww}" stroke="#6957ff" stroke-width=".25" stroke-dasharray="2 1.5"/>`);
    mk.push(`<text x="${t.pw / 2}" y="${t.pm - 2.6}" text-anchor="middle" font-family="Arial,sans-serif" font-size="3" fill="#333">Lembar ${n} dari ${t.n} • baris ${ro + 1}, kolom ${c + 1} — pangkas di garis siku, tumpuk pada area ungu (10 mm), rekatkan</text>`);
    const cs = 3.2, mx = t.pw - t.pm - t.cols * cs, my = t.ph - t.pm + 2.4;
    for (let a = 0; a < t.rows; a++) for (let b = 0; b < t.cols; b++) mk.push(`<rect x="${mx + b * cs}" y="${my + a * (cs * .8)}" width="${cs - .4}" height="${cs * .8 - .4}" fill="${a === ro && b === c ? '#6957ff' : '#ddd'}"/>`);
    pages.push(`<div class="sheet"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${t.pw}mm" height="${t.ph}mm" viewBox="0 0 ${t.pw} ${t.ph}">${mk.join('')}</svg></div>`);
  }
  const hidden = `<svg width="0" height="0" style="position:absolute" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="poster" font-family="${th.bf}">${r.body}</g></svg>`;
  return { css: pageCss(t.pw, t.ph), html: hidden + pages.join(''), n: t.n };
}
const doPrint = guard(async () => {
  const busy = stBusy(); busy.set('Menyiapkan poster…', null);
  try {
    const r = await finalCompose(m => busy.set(m, null)), s = sheetsHtml(r);
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr); const d = fr.contentWindow.document; d.open();
    d.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(r.info.title)}</title><style>${s.css}</style></head><body>${s.html}</body></html>`); d.close();
    busy.close(); await new Promise(ok => setTimeout(ok, 350));
    fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000);
  } catch (e) { busy.close(); throw e; }
});
const doSvg = guard(async () => { const busy = stBusy(); busy.set('Menyiapkan SVG…', null); try { const r = await finalCompose(m => busy.set(m, null)); busy.close(); dl(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + r.mk(r.W + 'mm', r.H + 'mm')], { type: 'image/svg+xml' }), fileName('svg')); toast('✓ SVG diunduh — kualitas vektor, cocok untuk percetakan'); } catch (e) { busy.close(); throw e; } });
const doPng = guard(async () => {
  const busy = stBusy(); busy.set('Menyiapkan gambar…', null);
  try {
    const r = await finalCompose(m => busy.set(m, null)), asp = r.H / r.W;
    let long = O.pngq === 'hi' ? Math.round(Math.max(r.W, r.H) / 25.4 * 150) : 2400; long = Math.min(long, 9000);
    for (let tries = 0; tries < 4; tries++) {
      const w = r.W >= r.H ? long : Math.round(long / asp), h = r.W >= r.H ? Math.round(long * asp) : long;
      if (w * h > 45e6) { long = Math.round(long * .75); continue; }
      busy.set(`Merender ${w} × ${h} px…`, null);
      try {
        const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(new Blob([r.mk(w, h)], { type: 'image/svg+xml' })); });
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(img.src);
        const blob = await new Promise(ok => c.toBlob(ok, 'image/png')); if (!blob) throw 0;
        busy.close(); dl(blob, fileName('png')); toast(`✓ PNG ${w} × ${h} px diunduh`); return;
      } catch (e) { long = Math.round(long * .7); }
    }
    busy.close(); toast('Gagal membuat PNG pada ukuran ini. Gunakan SVG atau Cetak → Simpan sebagai PDF.');
  } catch (e) { busy.close(); throw e; }
});

// ---------- Antarmuka Studio ----------
const $$ = id => document.getElementById(id);
const seg = (k, opts) => `<div class="pr-seg" data-o="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(O[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const tog = (k, l, hint = '') => `<label class="pr-tg"><input type="checkbox" data-o="${k}" ${O[k] ? 'checked' : ''}><span><b>${l}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
const fld = (l, h) => `<div class="pr-f"><label>${l}</label>${h}</div>`;
function panel() {
  const P = prepare({ ...O, depth: 99 }, true), dMax = P.T.maxD + 1, hasPh = FAM.src.some(m => m.photo_path);
  if (TAB === 'isi') return `${fld('Cakupan', seg('scope', [['all', 'Seluruh keluarga'], ['branch', 'Satu cabang']]))}
    ${O.scope === 'branch' ? fld('Cabang (ketik nama untuk mencari)', `<input class="pr-in" id="prBrIn" list="prBr" autocomplete="off" placeholder="Mis. Budi & Sri…" value="${esc(brLabel(O.branch))}"><datalist id="prBr">${BR.map(b => `<option value="${esc(b.l)}">`).join('')}</datalist>`) : ''}
    ${fld(`Tampilkan s/d generasi ke-<output id="prDo">${Math.min(O.depth, dMax)}</output> <small>(dari ${dMax})</small>`, `<input type="range" min="1" max="${dMax}" value="${Math.min(O.depth, dMax)}" data-o="depth">`)}
    <div class="pr-grp">${tog('spouses', 'Sertakan pasangan & menantu', 'Matikan untuk garis keturunan darah saja')}${tog('dead', 'Tandai almarhum/ah', 'Salib kecil di sudut kartu')}${tog('photos', 'Tampilkan foto', hasPh ? 'Foto kecil bila kartu padat' : 'Belum ada foto — inisial akan ditampilkan')}${tog('years', 'Tahun lahir / wafat')}</div>
    ${fld('Nama pada kartu', seg('nameMode', [['full', 'Lengkap'], ['short', 'Singkat (nama depan)']]))}`;
  if (TAB === 'gaya') return `${fld('Tema', `<div class="pr-sws">${Object.entries(TH).map(([k, t]) => `<button type="button" class="pr-sw ${O.theme === k ? 'on' : ''}" data-o="theme" data-v="${k}" title="${t.n}"><i style="background:${t.bg};border-color:${t.line}"><b style="background:${t.m[1]}"></b><b style="background:${t.f[1]}"></b><b style="background:${t.acc}"></b></i><span>${t.n}</span></button>`).join('')}</div>`)}
    ${fld('Judul', `<input class="pr-in" data-o="title" placeholder="${esc(LAST ? LAST.info.title : '')}" value="${esc(O.title)}" maxlength="80">`)}
    ${fld('Subjudul', `<input class="pr-in" data-o="subtitle" placeholder="${esc(LAST ? LAST.info.sub : '')}" value="${esc(O.subtitle)}" maxlength="140">`)}
    ${fld('Pesan / doa di bagian bawah', `<input class="pr-in" data-o="motto" placeholder="Mis. Silaturahmi memperpanjang umur dan melapangkan rezeki" value="${esc(O.motto)}" maxlength="120">`)}
    <div class="pr-grp">${tog('gender', 'Warna menurut jenis kelamin')}${tog('bands', 'Pita & nomor generasi')}${tog('frame', 'Bingkai berornamen')}${tog('legend', 'Keterangan simbol')}${tog('date', 'Tanggal cetak')}${window.FH_BRAND && FH_BRAND.logo ? tog('logo', 'Logo keluarga di judul') : ''}</div>
    ${fld('Jarak antar kartu', seg('gap', [['rapat', 'Rapat'], ['normal', 'Normal'], ['lega', 'Lega']]))}`;
  const t = O.mode === 'tile' && LAST ? tilePlan(LAST.W, LAST.H, O) : null;
  return `${fld('Ukuran poster', `<select class="pr-in" data-o="paper">${Object.entries(PAPER).map(([k, v]) => `<option value="${k}" ${O.paper === k ? 'selected' : ''}>${v[0]} (${v[1]} × ${v[2]} mm)</option>`).join('')}</select>`)}
    ${fld('Orientasi', seg('orient', [['auto', 'Otomatis'], ['portrait', 'Potret'], ['landscape', 'Lanskap']]))}
    ${fld('Tata letak pohon', seg('layout', [['auto', 'Otomatis'], ['tb', 'Atas → Bawah'], ['lr', 'Kiri → Kanan']]))}
    ${fld('Margin', seg('margin', [['sempit', 'Sempit'], ['normal', 'Normal'], ['lega', 'Lega']]))}
    ${fld('Cara mencetak', seg('mode', [['single', 'Satu lembar'], ['tile', 'Tempel beberapa lembar']]))}
    ${O.mode === 'tile' ? fld('Kertas printer', `<select class="pr-in" data-o="sheet">${Object.entries(SHEET).map(([k, v]) => `<option value="${k}" ${O.sheet === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>${t ? `<p class="pr-hint">Poster dipotong menjadi <b>${t.n} lembar</b> (${t.cols} × ${t.rows}) dengan area tumpuk 10 mm. ${t.n > 20 ? '⚠ Cukup banyak — pertimbangkan ukuran poster lebih kecil.' : ''}</p>` : ''}`) : `<p class="pr-hint">Untuk percetakan: unduh <b>SVG</b> atau cetak ke PDF. Cetak langsung: pilih ukuran kertas yang sama, skala 100%, margin “Tidak ada”.</p>`}
    ${fld('Resolusi PNG', `<select class="pr-in" data-o="pngq"><option value="hi" ${O.pngq === 'hi' ? 'selected' : ''}>Tinggi (≈150 dpi, untuk cetak)</option><option value="sd" ${O.pngq === 'sd' ? 'selected' : ''}>Sedang (2400 px, untuk dibagikan)</option></select>`)}`;
}
function brLabel(id) { const b = BR.find(x => x.id === id); return b ? b.l : ''; }
function buildBr() {
  const seen = new Map(); BR = FAM.units.filter(u => u.kids.length && (u.kind === 'inti' || u.kind === 'luar')).sort((a, b) => a.depth - b.depth || b.desc - a.desc || a.id - b.id)
    .map(u => { let l = `${[...new Set(u.members.map(m => first(m.name)))].join(' & ')} — ${u.desc} keturunan`; const c = (seen.get(l) || 0) + 1; seen.set(l, c); if (c > 1) l += ` (#${u.id})`; return { id: u.id, l }; });
}
function drawPanel() { $$('prSide').innerHTML = `<nav class="pr-tabs">${[['isi', '① Isi'], ['gaya', '② Gaya'], ['kertas', '③ Kertas']].map(([k, l]) => `<button type="button" class="${TAB === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav><div class="pr-pbody">${panel()}</div>`; }
function paint(r) {
  LAST = r; const i = r.info, el = $$('prPaper'); if (!el) return;
  let grid = '';
  if (O.mode === 'tile') { const t = tilePlan(r.W, r.H, O); let g = ''; for (let c = 1; c < t.cols; c++) g += `<path d="M${c * (t.ww - t.ov)} 0V${r.H}"/>`; for (let q = 1; q < t.rows; q++) g += `<path d="M0 ${q * (t.wh - t.ov)}H${r.W}"/>`;
    let lb = ''; for (let q = 0; q < t.rows; q++) for (let c = 0; c < t.cols; c++) lb += `<text x="${c * (t.ww - t.ov) + 4}" y="${q * (t.wh - t.ov) + 12}" font-size="${Math.min(r.W, r.H) / 12}" fill="#6957ff" opacity=".55" font-weight="700" font-family="Arial">${q * t.cols + c + 1}</text>`;
    grid = `<g stroke="#6957ff" stroke-width="${Math.min(r.W, r.H) / 400}" stroke-dasharray="${Math.min(r.W, r.H) / 60} ${Math.min(r.W, r.H) / 90}" fill="none">${g}</g>${lb}`; }
  el.dataset.asp = r.H / r.W; el.innerHTML = r.mk('100%', '100%').replace('</svg>', grid + '</svg>'); fit();
  const lv = { ok: ['ok', '✓ Nyaman dibaca'], warn: ['warn', '⚠ Agak kecil'], bad: ['bad', '✕ Terlalu kecil'] }[i.level];
  $$('prInfo').innerHTML = `<span class="pr-chip">${PAPER[O.paper][0]} • ${i.or === 'p' ? 'Potret' : 'Lanskap'} • ${i.tb ? 'Atas→Bawah' : 'Kiri→Kanan'}</span><span class="pr-chip">${i.count} kartu • ${i.gens} generasi</span><span class="pr-chip ${lv[0]}" title="Ukuran huruf nama pada kertas. Untuk dipajang, ≥ 9 pt nyaman dibaca dari ±1,5 m.">Huruf nama ≈ ${i.namePt.toFixed(1)} pt ${lv[1]}</span>${i.level !== 'ok' ? `<span class="pr-tip">Saran: pilih kertas lebih besar, kurangi generasi, pilih satu cabang, atau gunakan nama singkat.</span>` : ''}`;
  if (TAB === 'gaya') { const t = document.querySelector('[data-o=title]'), s = document.querySelector('[data-o=subtitle]'); if (t) t.placeholder = i.title; if (s) s.placeholder = i.sub; }
}
function fit() {
  const sc = $$('prScroll'), p = $$('prPaper'); if (!sc || !p) return; const asp = +p.dataset.asp || 1.41, aw = sc.clientWidth - 40, ah = sc.clientHeight - 40;
  const w = Math.max(80, Math.min(aw, ah / asp)) * ZOOM; p.style.width = w + 'px'; p.style.height = w * asp + 'px'; $$('prZoom').textContent = Math.round(ZOOM * 100) + '%';
}
const status = m => { const e = $$('prMsg'); if (e) e.textContent = m || ''; };
async function render() {
  const my = ++TOK; let r; try { r = compose(O); } catch (e) { console.error(e); toast('Gagal menyusun poster'); return; }
  paint(r);
  if (r.need.length) { status('Memuat foto…'); await ensure(r.need, (d, n) => my === TOK && status(`Memuat foto ${d}/${n}…`)); if (my !== TOK) return; paint(compose(O)); status(''); }
}
function schedule() { clearTimeout(timer); timer = setTimeout(render, 90); }
function save() { try { const o = {}; PERSIST.forEach(k => o[k] = O[k]); localStorage.setItem(LSK, JSON.stringify(o)); } catch (e) { } }
function setOpt(k, v) {
  O[k] = v; save();
  if (['scope', 'depth', 'paper', 'orient', 'layout', 'mode', 'sheet', 'theme', 'photos', 'spouses', 'nameMode'].includes(k) || k === 'branch') { if (TAB !== 'gaya' || k === 'theme') { const keep = $$('prSide').querySelector('.pr-pbody').scrollTop; drawPanel(); $$('prSide').querySelector('.pr-pbody').scrollTop = keep; } }
  schedule();
}
function onInput(e) {
  const t = e.target;
  if (t.id === 'prBrIn') { const b = BR.find(x => x.l === t.value); if (b) { O.branch = b.id; O.depth = 99; save(); schedule(); const d = $$('prSide').querySelector('[data-o=depth]'); if (d) { drawPanel(); } } return; }
  const k = t.dataset && t.dataset.o; if (!k) return;
  if (t.type === 'checkbox') return setOpt(k, t.checked);
  if (t.type === 'range') { const v = +t.value; $$('prDo').textContent = v; return setOpt(k, v); }
  if (t.tagName === 'SELECT') return setOpt(k, t.value);
  O[k] = t.value; save(); schedule();
}
function onClick(e) {
  const a = e.target.closest('[data-a]'); if (a) { ({ close: closeStudio, print: doPrint, png: doPng, svg: doSvg, zin: () => { ZOOM = Math.min(4, ZOOM * 1.25); fit(); }, zout: () => { ZOOM = Math.max(.4, ZOOM / 1.25); fit(); }, zfit: () => { ZOOM = 1; fit(); } })[a.dataset.a](); return; }
  const tb = e.target.closest('[data-tab]'); if (tb) { TAB = tb.dataset.tab; drawPanel(); return; }
  const b = e.target.closest('.pr-seg button[data-v],button[data-o][data-v]'); if (!b) return; const k = b.dataset.o || b.closest('[data-o]').dataset.o; let v = b.dataset.v;
  if (k === 'scope' && v === 'branch' && O.branch == null && BR.length) O.branch = (FOCUS && FOCUS.kids.length ? FOCUS.id : BR[0].id);
  setOpt(k, v);
}
function closeStudio() { const s = $$('pr'); if (s) { s.remove(); document.body.classList.remove('pr-open'); document.removeEventListener('keydown', onKey); removeEventListener('resize', fit); } }
const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.st-ov')) closeStudio(); };
window.openPrintStudio = function () {
  try { FAM = famOf(); } catch (e) { return toast('Data silsilah belum dimuat'); }
  if (!FAM.roots.length) return toast('Belum ada data silsilah untuk dicetak');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(LSK) || '{}'); } catch (e) { }
  O = { ...DEF, ...saved, branch: null, scope: 'all', title: '', subtitle: '' }; if (!TH[O.theme]) O.theme = 'klasik'; if (!PAPER[O.paper]) O.paper = 'a1';
  buildBr(); if (FOCUS && FOCUS.kids.length) { O.scope = 'branch'; O.branch = FOCUS.id; }
  if (FAM.stats.total > 250 && saved.paper == null) O.paper = 'a0';
  TAB = 'isi'; ZOOM = 1; LAST = null; closeStudio();
  const el = document.createElement('div'); el.id = 'pr'; el.className = 'pr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Cetak silsilah');
  el.innerHTML = `<header class="pr-top"><div class="pr-ttl"><b>🖨 Cetak Silsilah</b><small>Poster untuk dipajang di ruang keluarga</small></div><div class="pr-acts"><button class="ghost pr-b" data-a="svg" title="Vektor — terbaik untuk percetakan">⬇ SVG</button><button class="ghost pr-b" data-a="png">⬇ PNG</button><button class="primary pr-b" data-a="print">🖨 Cetak / PDF</button><button class="pr-x" data-a="close" title="Tutup (Esc)" aria-label="Tutup">✕</button></div></header>
  <div class="pr-body"><section class="pr-stage"><div class="pr-scroll" id="prScroll"><div class="pr-paper" id="prPaper"></div></div><div class="pr-bar"><div class="pr-info" id="prInfo"></div><span class="pr-msg" id="prMsg"></span><div class="pr-zoom"><button data-a="zout" aria-label="Perkecil">−</button><span id="prZoom">100%</span><button data-a="zin" aria-label="Perbesar">＋</button><button data-a="zfit" title="Pas layar">⤢</button></div></div></section><aside class="pr-side" id="prSide"></aside></div>`;
  document.body.appendChild(el); document.body.classList.add('pr-open'); drawPanel();
  el.addEventListener('click', onClick); el.addEventListener('input', onInput); el.addEventListener('change', onInput); document.addEventListener('keydown', onKey); addEventListener('resize', fit);
  setTimeout(render, 30);
};

// ---------- Tombol pada halaman Silsilah ----------
const _sil = R.silsilah;
R.silsilah = async (...a) => {
  await _sil(...a);
  const g = document.getElementById('ftguide'); if (g && !document.getElementById('ftprint')) { g.insertAdjacentHTML('afterend', '<button class="ghost" id="ftprint" title="Cetak silsilah sebagai poster untuk dipajang">🖨 Cetak</button>'); document.getElementById('ftprint').onclick = window.openPrintStudio; }
};
window.FHPrint = { compose: (o) => { O = { ...DEF, ...o }; FAM = famOf(); return compose(O); }, DEF, TH, PAPER, tilePlan: (W, H, o) => tilePlan(W, H, { ...DEF, ...o }), sheetsHtml: (o, r) => { O = { ...DEF, ...o }; return sheetsHtml(r); } };
})();
