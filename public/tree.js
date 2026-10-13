// ===== Silsilah keluarga skala besar (ratusan anggota) =====
// Model: orang -> "unit keluarga" (pasangan, bisa lebih dari 2 bila menikah lagi) -> anak-anak unit.
// Tampilan: pohon yang bisa digeser/di-zoom + cabang yang bisa dilipat, atau daftar berindentasi.
let LINE = null, LINE_ID = null, ROWS = [];
let SCOPE = 'asli', PENDING_G = null, FAM = null, EXP = new Set(), VIEW = 'tree', FOCUS = null, PENDING = null, PENDING_BR = null, TREE_INIT = false;
const V = { x: 0, y: 0, k: 1 };
const TITLES = /^(h|hj|haji|hajjah|dr|drs|dra|ir|prof|kh|k\.h|ust|ustaz|ustadz|alm|almh|almarhum|almarhumah|pak|bapak|bu|ibu|mbah|eyang|mas|mbak|om|tante|kakek|nenek|opa|oma|pakde|bude|paklik|bulik)\.?,?$/i;
const first = n => { const w = String(n || '').trim().split(/\s+/); return w.find(x => !TITLES.test(x)) || w[0] || ''; };   // lewati gelar: "H. Abdullah" -> "Abdullah"
const gCls = m => m.gender === 'L' ? 'm' : m.gender === 'P' ? 'f' : 'x';
const gSym = m => m.gender === 'L' ? '♂' : m.gender === 'P' ? '♀' : '?';
const yrs = m => m.death_year ? `${m.birth_year || '?'} – ${m.death_year}` : m.birth_year ? `Lahir ${m.birth_year}` : '';
const ageOf = m => m.birth_year ? (m.death_year || new Date().getFullYear()) - m.birth_year : null;
const KST = { belum_menikah: 'Belum menikah', menikah: 'Menikah', cerai: 'Cerai' };
function maritalOf(m, byId, adj, st) {                       // status efektif: relasi pasangan lebih utama daripada isian manual
  const W = m.gender === 'L' ? 'Duda' : m.gender === 'P' ? 'Janda' : 'Cerai mati', sp = [...adj.get(m.id)].map(i => byId.get(i));
  if (sp.length) {
    const ed = sp.map(s => ({ s, c: st.get(Math.min(m.id, s.id) + '-' + Math.max(m.id, s.id)) === 'cerai' }));
    if (ed.some(e => !e.c && !e.s.death_year) || (m.death_year && ed.some(e => !e.c))) return { k: 'menikah', t: 'Menikah' };
    return ed.some(e => !e.c) ? { k: 'cerai_mati', t: W } : { k: 'cerai', t: 'Cerai' };
  }
  const x = m.marital_status; return x === 'cerai_mati' ? { k: x, t: W } : KST[x] ? { k: x, t: KST[x] } : { k: '', t: '' };
}
const avHtml = (m, sz = 's', cls = '') => `<div class="av${cls ? ' ' + cls : ''}"${m.photo_path ? ` data-pp="${esc(m.photo_path)}" data-sz="${sz}"` : ''}>${esc(ini(m.name))}<i>${gSym(m)}</i></div>`;
const stPill = s => s && s.k && s.k !== 'menikah' ? `<em class="st st-${s.k}">${s.t}</em>` : '';
const cardYrs = m => m.death_year ? `${m.birth_year || '?'}–${m.death_year}` : m.birth_year ? `${m.birth_year} · ${ageOf(m)} th` : '';   // usia orang wafat ada di tooltip & profil
const cmpP = (a, b) => ((a.gender === 'L' ? 0 : a.gender === 'P' ? 1 : 2) - (b.gender === 'L' ? 0 : b.gender === 'P' ? 1 : 2)) || ((a.birth_year || 9999) - (b.birth_year || 9999)) || a.id - b.id;

function buildFam(list) {
  // ============================================================
  // Model: orang -> "unit" (kelompok pasangan; >2 bila menikah lagi) -> anak-anak unit.
  // Klasifikasi terhadap GARIS KETURUNAN ASLI (dihitung dari data, bukan urutan input):
  //   pendiri  = unit akar garis keturunan asli (leluhur)
  //   asli     = keturunan darah pendiri (lewat ayah maupun ibu)
  //   menantu  = pasangan yang masuk lewat pernikahan (anggota unit inti yang bukan keturunan darah)
  //   besan    = keluarga asal menantu (orang tua, ipar, kerabat): cabang TERPISAH, tidak pernah menjadi leluhur pohon utama
  //   luar     = keluarga lain yang tidak terhubung lewat pernikahan
  // ============================================================
  const byId = new Map(list.map(m => [m.id, m])), adj = new Map(list.map(m => [m.id, new Set()])), st = new Map();
  for (const m of list) { const s = m.spouse_id; if (s && s !== m.id && byId.has(s)) { adj.get(m.id).add(s); adj.get(s).add(m.id); st.set(Math.min(m.id, s) + '-' + Math.max(m.id, s), m.spouse_status || 'menikah'); } }
  const unitOf = new Map(), units = [];
  for (const m of list) if (!unitOf.has(m.id)) {            // satu unit = satu kelompok pasangan yang saling terhubung
    const u = { id: 0, members: [], kids: [], refs: [], pu: null, pm: null, depth: 0, desc: 0, descA: 0, kind: 'luar', grp: null, ext: [], origins: [] }, stack = [m.id]; unitOf.set(m.id, u);
    while (stack.length) { const x = stack.pop(); u.members.push(byId.get(x)); for (const y of adj.get(x)) if (!unitOf.has(y)) { unitOf.set(y, u); stack.push(y); } }
    u.members.sort(cmpP); u.id = Math.min(...u.members.map(m => m.id)); units.push(u);
  }
  // orang tua (darah) yang valid: ada di daftar & bukan di unit yang sama
  const par = m => { const p = m.parent_id && byId.get(m.parent_id); return p && unitOf.get(p.id) !== unitOf.get(m.id) ? p : null; };
  const bd = m => m.birth_year || 9999, cmpK = (a, b) => bd(a) - bd(b) || a.id - b.id;
  const kidsP = new Map(units.map(u => [u, []]));          // anak kandung (orang) per unit orang tua
  for (const m of list) { const p = par(m); if (p) kidsP.get(unitOf.get(p.id)).push(m); }
  kidsP.forEach(a => a.sort(cmpK));

  // ---- 1. tentukan akar garis keturunan asli ----
  const bloodFrom = rootUnits => {                          // telusuri keturunan darah: peta orang->kedalaman & unit->kedalaman
    const asli = new Map(), dep = new Map(), q = []; for (const u of rootUnits) { dep.set(u, 0); q.push(u); }
    for (let i = 0; i < q.length; i++) { const u = q[i], d = dep.get(u); for (const c of kidsP.get(u)) { if (!asli.has(c.id)) asli.set(c.id, d + 1); const cu = unitOf.get(c.id); if (!dep.has(cu)) { dep.set(cu, d + 1); q.push(cu); } } }
    return { asli, dep };
  };
  const hasPar = u => u.members.some(m => par(m));
  // Skor kandidat = jumlah keturunan dengan bobot pecahan: keturunan yang diklaim k keluarga (hasil pernikahan antar-keluarga) bernilai 1/k bagi masing-masing,
  // sehingga anak-cucu pasangan campuran tidak dihitung ganda dan keluarga besan tidak tampak sebesar keluarga inti.
  const raw = units.filter(u => !hasPar(u) && kidsP.get(u).length).map(u => ({ u, set: bloodFrom([u]).asli })).sort((a, b) => b.set.size - a.set.size || a.u.id - b.u.id).slice(0, 30);
  const claim = new Map(); raw.forEach(c => c.set.forEach((d, id) => claim.set(id, (claim.get(id) || 0) + 1)));
  const cands = raw.map(c => { let n = 0; c.set.forEach((d, id) => { n += 1 / claim.get(id); }); return { u: c.u, n: Math.round(n * 10) / 10, total: c.set.size }; }).sort((a, b) => b.n - a.n || b.total - a.total || a.u.id - b.u.id);
  const flagged = [...new Set(list.filter(m => m.lineage_root).map(m => unitOf.get(m.id)))];
  // Otomatis: kandidat yang sebanding (>= 70% yang terbesar) -> pilih yang paling awal dicatat (id terkecil); bila lebih dari satu ditandai AMBIGU agar admin menegaskan.
  const mode = flagged.length ? 'manual' : cands.length ? 'auto' : 'none';
  const comparable = cands.length ? cands.filter(c => c.n >= cands[0].n * .7) : [];
  const pick = comparable.length ? comparable.slice().sort((a, b) => a.u.id - b.u.id)[0] : null;
  const coreRoots = mode === 'manual' ? flagged : mode === 'auto' && pick ? [pick.u] : [];
  const ambiguous = mode === 'auto' && comparable.filter(c => c.n >= 2).length > 1;      // keluarga dengan skor <2 terlalu kecil untuk dianggap pesaing

  // ---- 2. klasifikasi ----
  const kin = new Map(), { asli, dep } = bloodFrom(coreRoots), coreUnits = new Set(dep.keys());
  coreRoots.forEach(u => u.members.forEach(m => kin.set(m.id, { k: 'pendiri' })));
  asli.forEach((d, id) => { if (!kin.has(id)) kin.set(id, { k: 'asli' }); });
  coreUnits.forEach(u => { u.kind = 'inti'; u.members.forEach(m => { if (!kin.has(m.id)) kin.set(m.id, { k: 'menantu' }); }); });

  // ---- 3. komponen non-inti: keluarga besan (terhubung lewat menantu) atau keluarga lain ----
  const nbr = u => { const o = new Set(); u.members.forEach(m => { const p = par(m); if (p) o.add(unitOf.get(p.id)); }); kidsP.get(u).forEach(c => o.add(unitOf.get(c.id))); o.delete(u); return o; };
  const seenC = new Set(), comps = [];
  for (const u of units) if (!coreUnits.has(u) && !seenC.has(u)) { const comp = [], q = [u]; seenC.add(u); while (q.length) { const x = q.pop(); comp.push(x); for (const y of nbr(x)) if (!coreUnits.has(y) && !seenC.has(y)) { seenC.add(y); q.push(y); } } comps.push(comp); }

  // pasang unit di bawah unit orang tuanya (hanya yang berada di himpunan S); rank menentukan orang tua utama bila ada dua
  const place = (S, rank) => {
    for (const u of S) {
      const c = u.members.filter(m => { const p = par(m); return p && S.has(unitOf.get(p.id)); }).sort((a, b) => rank(a) - rank(b) || a.id - b.id);
      if (c.length) { u.pm = c[0]; u.pu = unitOf.get(c[0].parent_id); u.pu.kids.push(u); for (const m of c.slice(1)) { const q = unitOf.get(m.parent_id); if (q !== u.pu) q.refs.push({ unit: u, member: m }); } }
    }
    for (const u of S) u.kids.sort((a, b) => bd(a.pm) - bd(b.pm) || a.id - b.id);
  };
  const walkAll = (S, rootsFirst) => {                      // hitung kedalaman & jumlah keturunan; putus siklus data
    const seen = new Set(), roots = [], walk = (u, d) => { seen.add(u.id); u.depth = d; u.kids = u.kids.filter(k => !seen.has(k.id)); let n = 0; for (const k of u.kids) n += k.members.length + walk(k, d + 1); u.desc = n; return n; };
    for (const u of rootsFirst) if (!u.pu && !seen.has(u.id)) { roots.push(u); walk(u, 0); }
    for (const u of S) if (!u.pu && !seen.has(u.id)) { roots.push(u); walk(u, 0); }
    for (const u of S) if (!seen.has(u.id)) { if (u.pu) { u.pu.kids = u.pu.kids.filter(k => k !== u); u.pu = null; } roots.push(u); walk(u, 0); }
    return roots;
  };

  // pohon inti
  const coreSet = new Set(coreUnits);
  place(coreSet, m => dep.get(unitOf.get(m.parent_id)) ?? 99);
  const roots = walkAll(coreSet, coreRoots).sort((a, b) => b.desc - a.desc || a.id - b.id);

  // keluarga besan & keluarga lain
  const groups = [], other = [], loose = [];
  for (const comp of comps) {
    const S = new Set(comp), links = [], anchors = new Map();
    for (const w of comp) for (const c of kidsP.get(w)) { const cu = unitOf.get(c.id), kc = kin.get(c.id); if (coreUnits.has(cu) && kc && kc.k === 'menantu') { links.push({ from: w, member: c, coreUnit: cu }); anchors.set(c.id, c); } }
    place(S, () => 0); const cr = walkAll(S, []);
    if (anchors.size) {
      const g = { id: Math.min(...comp.map(u => u.id)), kind: 'besan', units: comp, roots: cr, anchors: [...anchors.values()].sort((a, b) => a.id - b.id), links, size: comp.reduce((s, u) => s + u.members.length, 0) };
      comp.forEach(u => { u.kind = 'besan'; u.grp = g; u.members.forEach(m => kin.set(m.id, { k: 'besan', role: 'kerabat', grp: g })); });
      for (const a of g.anchors) {                          // peran relatif terhadap menantu penghubung
        const pu = unitOf.get(par(a).id), add = (x, role) => { x.role = role; (x.anchors = x.anchors || []).push(a); x.anchor = x.anchors[0]; };
        pu.members.forEach(m => add(kin.get(m.id), 'ortu'));                         // orang tua menantu = besan (bisa besan dari >1 menantu)
        kidsP.get(pu).forEach(s => { const x = kin.get(s.id); if (s.id !== a.id && x && x.k === 'besan' && (x.role === 'kerabat' || x.role === 'ipar')) add(x, 'ipar'); });
      }
      for (const l of links) { l.from.ext.push({ member: l.member, coreUnit: l.coreUnit }); const cu = l.coreUnit; const o = cu.origins.find(x => x.member === l.member); if (!o) cu.origins.push({ member: l.member, parent: par(l.member), grp: g }); }
      g.label = 'Keluarga asal ' + g.anchors.map(a => first(a.name)).join(' & ');
      g.sub = (() => { const pu = unitOf.get(par(g.anchors[0]).id); return 'orang tua: ' + pu.members.map(m => m.name).join(' & '); })();
      groups.push(g);
    } else for (const u of cr) { if (u.members.length === 1 && !u.kids.length && !u.refs.length) loose.push(u); else other.push(u); }
  }
  groups.sort((a, b) => b.size - a.size || a.id - b.id);
  other.sort((a, b) => b.desc - a.desc || a.id - b.id);
  let top = roots;
  if (!coreRoots.length) { top = other.splice(0); if (!top.length) top = loose.splice(0); top.forEach(u => u.kind = 'inti'); top.forEach(u => { const q = [u]; while (q.length) { const x = q.pop(); x.kind = 'inti'; x.members.forEach(m => kin.set(m.id, { k: 'asli' })); x.kids.forEach(k => q.push(k)); } }); }
  units.forEach(u => u.members.forEach(m => { if (!kin.has(m.id)) kin.set(m.id, { k: 'luar' }); }));

  const blood = x => { const k = kin.get(x.id); return k && (k.k === 'asli' || k.k === 'pendiri'); };
  const calcA = u => { let n = 0; for (const k of u.kids) n += k.members.filter(blood).length + calcA(k); return (u.descA = n); };   // keturunan darah (tanpa menantu)
  units.filter(u => !u.pu).forEach(calcA);
  const gen = new Map(); units.forEach(u => { if (u.kind === 'inti' || u.kind === 'luar') u.members.forEach(m => gen.set(m.id, u.depth + 1)); });
  const mar = new Map(); for (const m of list) mar.set(m.id, maritalOf(m, byId, adj, st));
  const cnt = k => [...kin.values()].filter(x => x.k === k).length;
  const stats = { total: list.length, single: [...mar.values()].filter(x => x.k === 'belum_menikah').length, nomar: [...mar.values()].filter(x => !x.k).length, L: list.filter(m => m.gender === 'L').length, P: list.filter(m => m.gender === 'P').length, pairs: st.size, dead: list.filter(m => m.death_year).length,
    maxGen: Math.max(1, ...units.filter(u => u.kind === 'inti').map(u => u.depth + 1)), asli: cnt('pendiri') + cnt('asli'), menantu: cnt('menantu'), besan: cnt('besan'), luar: cnt('luar'), loose: loose.length };
  stats.unk = stats.total - stats.L - stats.P;
  return { src: list, mar, byId, adj, st, units, uById: new Map(units.map(u => [u.id, u])), unitOf, roots: top, besan: groups, other, loose, gen, kin, stats, par, kidsP,
    lin: { mode, roots: coreRoots, cands, ambiguous } };
}
const famOf = () => (FAM && FAM.src === MEMBERS) ? FAM : (FAM = buildFam(MEMBERS));
const unitLabel = u => [...new Set(u.members.map(m => first(m.name)))].join(' & ');

// ---------- Render pohon ----------
// Garis keluarga: Leluhur / Keturunan asli (tanpa label) / Menantu (pasangan masuk) / Besan (keluarga asal menantu)
const KT = { pendiri: 'Leluhur', menantu: 'Menantu' }, KB = { ortu: 'Besan', ipar: 'Ipar', kerabat: 'Kerabat besan' };
const kinOf = m => (FAM && FAM.kin && FAM.kin.get(m.id)) || { k: 'asli' };
const kinTag = m => { const k = kinOf(m); return k.k === 'besan' ? KB[k.role] : KT[k.k] || ''; };
const kinHtml = m => { const t = kinTag(m); return t ? `<span class="kt kt-${kinOf(m).k}">${t}</span>` : ''; };
const asliSpouses = m => [...FAM.adj.get(m.id)].map(i => FAM.byId.get(i)).filter(x => { const k = kinOf(x).k; return k === 'asli' || k === 'pendiri'; });
const scopeRoots = () => SCOPE === 'besan' ? FAM.besan.flatMap(g => g.roots) : SCOPE === 'luar' ? FAM.other : FAM.roots;
const scopeTotal = () => SCOPE === 'besan' ? FAM.stats.besan : SCOPE === 'luar' ? FAM.stats.luar - FAM.stats.loose : FAM.stats.asli + FAM.stats.menantu;
const visibleRoots = () => FOCUS ? [FOCUS] : scopeRoots();
const pHtml = (m, u) => {
  const s = FAM.mar.get(m.id), cap = u.members.length > 2 ? [...FAM.adj.get(m.id)].map(i => first(FAM.byId.get(i).name)).join(', ') : '', kn = kinOf(m), kt = kinTag(m);
  const orig = kn.k === 'menantu' ? u.origins.find(o => o.member === m) : null;
  const tip = [m.name + (m.death_year ? ' (alm.)' : ''), kt ? 'Hubungan: ' + kt + (kn.k === 'menantu' ? ' (masuk lewat pernikahan)' : '') : '', (m.gender === 'L' ? 'Laki-laki' : m.gender === 'P' ? 'Perempuan' : '') + (cardYrs(m) ? ' · ' + cardYrs(m) + (m.death_year && ageOf(m) != null ? ' (usia ' + ageOf(m) + ' th)' : '') : ''), s.t ? 'Status: ' + s.t : '', FAM.adj.get(m.id).size ? 'Pasangan: ' + [...FAM.adj.get(m.id)].map(i => FAM.byId.get(i).name).join(', ') : '', relTip(m)].filter(Boolean).join('\n');
  return `<div class="pc g-${gCls(m)}${m.death_year ? ' dead' : ''} kn-${kn.k}${SELF_ID === m.id ? ' me' : ''}" data-p="${m.id}" title="${esc(tip)}">${kinHtml(m)}${avHtml(m)}<div class="pi"><b>${esc(m.name)}</b><span>${esc(cardYrs(m))}</span>${cap ? `<em>♥ ${esc(cap)}</em>` : stPill(s)}</div>${orig ? `<button class="orig" data-o="${orig.grp.id}" data-m="${m.id}" title="Lihat keluarga asal ${esc(first(m.name))} (besan)">⌂</button>` : ''}${relBadge(m)}</div>`;
};
function unitHtml(u) {
  const two = u.members.length === 2, has = u.kids.length || u.refs.length || u.ext.length, open = EXP.has(u.id);
  const sep = (a, b) => { if (!two) return '<div class="uj dot"></div>'; const c = FAM.st.get(Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id)) === 'cerai'; return `<div class="uj${c ? ' x' : ''}" title="${c ? 'Cerai' : 'Menikah'}">${c ? '✕' : '♥'}</div>`; };
  const ps = u.members.map((m, i) => (i ? sep(u.members[i - 1], m) : '') + pHtml(m, u)).join('');
  return `<div class="uwrap k-${u.kind}${LINE && LINE.has(u.id) ? ' lin' : ''}${LINE_ID && u.members.some(x => x.id === LINE_ID) ? ' self' : ''}" data-u="${u.id}" data-d="${u.depth}"><div class="unit">${ps}</div>${has ? `<button class="fbr" data-b="${u.id}" title="Fokus cabang ini">⤢</button><button class="tgl${open ? ' open' : ''}" data-t="${u.id}" title="${open ? 'Lipat' : 'Buka'} cabang">${open ? '−' : u.desc ? '+' + u.desc : '↪'}</button>` : ''}</div>`;
}
const ptag = (u, k) => { if (u.members.length < 3 || !k.pm) return ''; const p = FAM.byId.get(k.pm.parent_id); return p ? `<span class="ptag g-${gCls(p)}" title="Anak dari ${esc(p.name)}">dari ${esc(first(p.name))}</span>` : ''; };
const extTxt = e => { const sp = asliSpouses(e.member); return `${esc(first(e.member.name))}${sp.length ? ' · menikah dengan ' + esc(sp.map(x => first(x.name)).join(' & ')) : ''}`; };
function nodeHtml(u) {
  let kids = ''; VMAX = Math.max(VMAX, u.depth);
  if (EXP.has(u.id) && (u.kids.length || u.refs.length || u.ext.length))
    kids = `<div class="tkids">${u.kids.map(k => `<div class="tkid">${ptag(u, k)}${nodeHtml(k)}</div>`).join('')}${u.refs.map(r => `<div class="tkid"><button class="tref" data-f="${r.member.id}" title="Anggota ini juga tercatat di keluarga lain">↪ ${esc(first(r.member.name))}</button></div>`).join('')}${u.ext.map(e => `<div class="tkid"><button class="tref ext" data-f="${e.member.id}" title="Buka di pohon keturunan asli">💍 ${extTxt(e)} ↪</button></div>`).join('')}</div>`;
  return `<div class="tnode">${unitHtml(u)}${kids}</div>`;
}
let VMAX = 0;
const grpHead = g => `<header class="bgh"><div><b>${esc(g.label)}</b><small>${esc(g.sub)} · ${g.size} orang</small></div><div class="bgl">${g.anchors.map(a => { const sp = asliSpouses(a); return `<button data-f="${a.id}" title="Buka di pohon keturunan asli">💍 ${esc(first(a.name))}${sp.length ? ' &amp; ' + esc(sp.map(x => first(x.name)).join(' &amp; ')) : ''} ↪</button>`; }).join('')}</div></header>`;
function rootsHtml(fn) {                                      // keluarga besan ditampilkan per kelompok (berjudul), sisanya apa adanya
  if (FOCUS || SCOPE !== 'besan') return visibleRoots().map(fn).join('');
  return FAM.besan.map(g => `<section class="bgrp" data-g="${g.id}">${grpHead(g)}<div class="bgr">${g.roots.map(fn).join('')}</div></section>`).join('');
}
function syncMeta(n) {
  const v = $('#ftvis'); if (v) v.textContent = `Menampilkan ${n} dari ${scopeTotal()} orang`;
  const g = $('#ftgen'); if (g) g.value = Math.min(FAM.stats.maxGen, VMAX + 1);
}
function renderStage() {
  const s = $('#ftstage'); if (!s) return; VMAX = 0; s.innerHTML = `<div class="troots sc-${SCOPE}">${rootsHtml(nodeHtml)}</div>`;
  const v = viewEl(); if (v) v.dataset.scope = SCOPE;
  s.classList.toggle('lineage', !!LINE); syncMeta(s.querySelectorAll('.pc').length); hydratePhotos(s); requestAnimationFrame(() => { drawMini(); buildRulers(); });
}

// ---------- Daftar (outline) ----------
function olHtml(u) {
  VMAX = Math.max(VMAX, u.depth); const has = u.kids.length || u.refs.length || u.ext.length, open = EXP.has(u.id), two = u.members.length === 2;
  const people = u.members.map(m => { const o = kinOf(m).k === 'menantu' ? u.origins.find(x => x.member === m) : null; return `<a class="ol-p g-${gCls(m)}${m.death_year ? ' dead' : ''} kn-${kinOf(m).k}${SELF_ID === m.id ? ' me' : ''}" data-p="${m.id}">${avHtml(m, 's', 'sm')}<i>${gSym(m)}</i>${esc(m.name)}${m.death_year ? ' †' : ''}${kinHtml(m)}${relInline(m)}<small>${esc(yrs(m))}</small>${stPill(FAM.mar.get(m.id))}</a>${o ? `<a class="ol-orig" data-o="${o.grp.id}" data-m="${m.id}" title="Lihat keluarga asal (besan)">⌂ keluarga asal</a>` : ''}`; }).join(two ? '<span class="ol-h">♥</span>' : '<span class="ol-h">·</span>');
  return `<div class="ol-u k-${u.kind}"><div class="ol-r${LINE && LINE.has(u.id) ? ' lin' : ''}${LINE_ID && u.members.some(x => x.id === LINE_ID) ? ' self' : ''}" data-u="${u.id}">${has ? `<button class="ol-t" data-t="${u.id}">${open ? '▾' : '▸'}</button>` : '<span class="ol-t"></span>'}<div class="ol-b"><div class="ol-ps">${people}</div>${u.kids.length ? `<span class="ol-c">${u.kids.length} anak · ${SCOPE === 'asli' ? u.descA + ' keturunan' + (u.desc > u.descA ? ' + ' + (u.desc - u.descA) + ' menantu' : '') : u.desc + ' orang'}</span>` : ''}</div></div>${open && has ? `<div class="ol-k">${u.kids.map(olHtml).join('')}${u.refs.map(r => `<div class="ol-r"><span class="ol-t"></span><a class="ol-p" data-f="${r.member.id}">↪ ${esc(r.member.name)}</a></div>`).join('')}${u.ext.map(e => `<div class="ol-r"><span class="ol-t"></span><a class="ol-p ext" data-f="${e.member.id}">💍 ${extTxt(e)} ↪</a></div>`).join('')}</div>` : ''}</div>`;
}
const renderList = () => {
  const l = $('#ftlist'); if (!l) return; VMAX = 0; l.classList.toggle('lineage', !!LINE); l.innerHTML = rootsHtml(olHtml); hydratePhotos(l);
  const cnt = u => u.members.length + (EXP.has(u.id) ? u.kids.reduce((a, k) => a + cnt(k), 0) : 0);
  syncMeta(visibleRoots().reduce((a, u) => a + cnt(u), 0));
};
const renderBody = () => VIEW === 'tree' ? renderStage() : renderList();

// ---------- Pan / zoom ----------
const stageEl = () => $('#ftstage'), viewEl = () => $('#ftview');
function apply(anim) {
  const s = stageEl(), v = viewEl(); if (!s) return;
  s.classList.toggle('anim', !!anim); s.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.k})`;
  v.classList.toggle('lod1', V.k < .45); v.classList.toggle('lod2', V.k < .3);
  const z = $('#ftzoom'); if (z) z.textContent = Math.round(V.k * 100) + '%'; mapRect(); mapRulers();
  if (anim) { clearTimeout(apply._t); apply._t = setTimeout(() => s.classList.remove('anim'), 520); }
}
function zoomAt(cx, cy, nk, anim) { nk = Math.min(1.6, Math.max(.03, nk)); const r = nk / V.k; V.x = cx - (cx - V.x) * r; V.y = cy - (cy - V.y) * r; V.k = nk; apply(anim); }
const zoomBy = f => { const v = viewEl(); zoomAt(v.clientWidth / 2, v.clientHeight / 2, V.k * f, true); };
const GUT = () => SCOPE === 'asli' && innerWidth > 760 ? 56 : 0;      // lajur kiri untuk pita "Generasi" agar tidak menimpa kartu
function fitView(anim) {
  const s = stageEl(), v = viewEl(); if (!s) return; const w = s.offsetWidth, h = s.offsetHeight, vw = v.clientWidth, vh = v.clientHeight, g = GUT();
  const k = Math.min(1, Math.max(.03, Math.min((vw - g) / w, vh / h) * .96)); V.k = k; V.x = g + (vw - g - w * k) / 2; V.y = Math.max(10, Math.min((vh - h * k) / 2, 40)); apply(anim); return k;
}
function centerOn(el, k, anim) {                          // letakkan elemen di tengah layar pada skala k
  const s = stageEl(), v = viewEl(), sr = s.getBoundingClientRect(), r = el.getBoundingClientRect();
  const cx = (r.left + r.width / 2 - sr.left) / V.k, cy = (r.top + r.height / 2 - sr.top) / V.k;
  V.k = k; V.x = v.clientWidth / 2 - cx * k; V.y = v.clientHeight / 2 - cy * k; apply(anim);
}
function initialView() {                                   // keluarga kecil: pas layar; besar: skala nyaman terbaca, berpusat di akar
  const s = stageEl(), v = viewEl(); V.x = 0; V.y = 0; V.k = 1; apply();
  const fk = Math.min((v.clientWidth - GUT()) / s.offsetWidth, v.clientHeight / s.offsetHeight) * .96; if (fk >= .55) return fitView();
  const el = s.querySelector('.uwrap'), sr = s.getBoundingClientRect(), r = el.getBoundingClientRect();
  V.k = .6; V.x = v.clientWidth / 2 - (r.left + r.width / 2 - sr.left) * .6; V.y = 36; apply();
}
function flash(el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 2600); }

function bindView() {
  const v = viewEl(), ptr = new Map(); let moved = false, start = null, pin = null;
  v.addEventListener('pointerdown', e => {
    if (e.target.closest('.ftctl,.ftmini,.fthint2')) return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; start = { x: e.clientX, y: e.clientY };
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pin = { d: Math.hypot(a.x - b.x, a.y - b.y), k: V.k }; }
  });
  v.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return;
    if (ptr.size === 2 && pin) { ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...ptr.values()], r = v.getBoundingClientRect(); moved = true; zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pin.k * Math.hypot(a.x - b.x, a.y - b.y) / pin.d); return; }
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
    if (!moved) { moved = true; v.classList.add('drag'); try { v.setPointerCapture(e.pointerId); } catch (_) { } }
    V.x += e.clientX - p.x; V.y += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; apply();
  });
  const up = e => { ptr.delete(e.pointerId); if (ptr.size < 2) pin = null; if (!ptr.size) { v.classList.remove('drag'); setTimeout(() => { moved = false; }, 60); } };   // tunda reset agar klik setelah geser tidak terbaca sebagai ketukan
  v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
  v.addEventListener('wheel', e => {                          // geser dengan scroll; zoom dengan Ctrl/⌘ + scroll atau cubit
    e.preventDefault(); const r = v.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, V.k * Math.exp(-e.deltaY * .01));
    else { V.x -= e.deltaX; V.y -= e.deltaY; apply(); }
  }, { passive: false });
  v.addEventListener('keydown', e => {
    const m = { '+': () => zoomBy(1.25), '=': () => zoomBy(1.25), '-': () => zoomBy(.8), '0': () => fitView(true), ArrowLeft: () => { V.x += 80; apply(); }, ArrowRight: () => { V.x -= 80; apply(); }, ArrowUp: () => { V.y += 80; apply(); }, ArrowDown: () => { V.y -= 80; apply(); } }[e.key];
    if (m) { e.preventDefault(); m(); }
  });
  v.addEventListener('click', e => { if (moved) return; hit(e); });
}

// ---------- Penggaris & pita generasi (menempel di tepi, mengikuti zoom/geser) ----------
function buildRulers() {
  const s = stageEl(), r = $('#ftrule'); if (!s || !r) return; if (SCOPE !== 'asli') { r.innerHTML = ''; ROWS = []; return; } const sr = s.getBoundingClientRect(), k = V.k || 1, by = new Map();
  s.querySelectorAll('.uwrap').forEach(el => { const d = +el.dataset.d; if (by.has(d)) return; const b = el.getBoundingClientRect(); by.set(d, { d, y: (b.top - sr.top) / k, h: b.height / k }); });
  ROWS = [...by.values()].sort((a, b) => a.d - b.d);
  const yr = new Map(); FAM.src.forEach(m => { if (m.birth_year && ['asli', 'pendiri', 'menantu'].includes(kinOf(m).k)) { const g = FAM.gen.get(m.id), o = yr.get(g) || [9999, 0]; o[0] = Math.min(o[0], m.birth_year); o[1] = Math.max(o[1], m.birth_year); yr.set(g, o); } });
  r.innerHTML = ROWS.map(o => { const y = yr.get(o.d + 1); return `<div class="gb${o.d % 2 ? ' odd' : ''}"></div><div class="gl" title="Generasi ${o.d + 1}${y ? ' · lahir ' + y[0] + (y[1] > y[0] ? '–' + y[1] : '') : ''}"><b>Gen ${o.d + 1}</b>${y ? `<small>${y[0]}${y[1] > y[0] ? '–' + y[1] : ''}</small>` : ''}</div>`; }).join('');
  mapRulers();
}
function mapRulers() {
  const r = $('#ftrule'), v = viewEl(); if (!r || !v || !ROWS.length || r.children.length < ROWS.length * 2) return; const vh = v.clientHeight;
  ROWS.forEach((o, i) => {
    const top = V.y + (o.y - 22) * V.k, h = (o.h + 44) * V.k, band = r.children[i * 2], lab = r.children[i * 2 + 1], a = Math.max(top, 0), b = Math.min(top + h, vh);
    band.style.top = top + 'px'; band.style.height = h + 'px';
    if (b - a < 30) lab.style.display = 'none'; else { lab.style.display = ''; lab.style.top = ((a + b) / 2 - 17) + 'px'; }
  });
}
addEventListener('resize', () => mapRulers());
const lineageSet = id => { const u = FAM.unitOf.get(id), S = new Set(); for (let x = u; x; x = x.pu) S.add(x.id); const st = [u]; while (st.length) for (const k of st.pop().kids) { S.add(k.id); st.push(k); } return S; };
function highlightLine(id) { FAM = famOf(); LINE = lineageSet(id); LINE_ID = id; closeProfile(); if (!$('#ftstage') && !$('#ftlist')) { PENDING = id; showPage('silsilah'); return; } focusPerson(id); }
function clearLine() { LINE = null; LINE_ID = null; renderCrumb(); renderBody(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && LINE) clearLine(); });
function branchStats(u) {
  const s = { n: 0, L: 0, P: 0, dead: 0, single: 0, asli: 0, men: 0, g: new Set() };
  (function w(x) { x.members.forEach(m => { s.n++; const kk = kinOf(m).k; if (kk === 'menantu') s.men++; else if (kk === 'asli' || kk === 'pendiri') s.asli++; if (m.gender === 'L') s.L++; else if (m.gender === 'P') s.P++; if (m.death_year) s.dead++; if (FAM.mar.get(m.id).k === 'belum_menikah') s.single++; }); s.g.add(x.depth); x.kids.forEach(w); })(u);
  return s;
}

// ---------- Minimap ----------
let MINI = { W: 1, H: 1 };
function drawMini() {
  const c = $('#ftmc'), s = stageEl(); if (!c || !s) return; const ctx = c.getContext && c.getContext('2d'); if (!ctx) return; MINI = { W: s.offsetWidth || 1, H: s.offsetHeight || 1 };
  ctx.clearRect(0, 0, c.width, c.height); const sx = c.width / MINI.W, sy = c.height / MINI.H, sr = s.getBoundingClientRect(), k = V.k || 1;
  s.querySelectorAll('.pc').forEach(el => { const r = el.getBoundingClientRect(); ctx.fillStyle = el.classList.contains('g-m') ? '#4b7bff' : el.classList.contains('g-f') ? '#ec5f9a' : '#8b95a8'; ctx.fillRect((r.left - sr.left) / k * sx, (r.top - sr.top) / k * sy, Math.max(1.6, r.width / k * sx), Math.max(2.5, r.height / k * sy)); });
  mapRect();
}
function mapRect() {
  const m = $('#ftmv'), v = viewEl(); if (!m || !v) return; const c = $('#ftmc'), sx = c.width / MINI.W, sy = c.height / MINI.H;
  const x = -V.x / V.k * sx, y = -V.y / V.k * sy, w = v.clientWidth / V.k * sx, h = v.clientHeight / V.k * sy;
  m.style.cssText = `left:${Math.max(0, Math.min(c.width - 4, x))}px;top:${Math.max(0, Math.min(c.height - 3, y))}px;width:${Math.max(6, Math.min(c.width, w))}px;height:${Math.max(5, Math.min(c.height, h))}px`;
}
function bindMini() {
  const mini = $('#ftmini'); if (!mini) return; let down = false;
  const go = (e, anim) => { const r = mini.getBoundingClientRect(), v = viewEl(); V.x = v.clientWidth / 2 - ((e.clientX - r.left) / r.width) * MINI.W * V.k; V.y = v.clientHeight / 2 - ((e.clientY - r.top) / r.height) * MINI.H * V.k; apply(anim); };
  mini.addEventListener('pointerdown', e => { down = true; mini.setPointerCapture(e.pointerId); go(e, true); });
  mini.addEventListener('pointermove', e => { if (down) go(e, false); });
  mini.addEventListener('pointerup', () => { down = false; });
}

// ---------- Aksi ----------
function toggleUnit(id) {
  const v = VIEW === 'tree' ? $(`#ftstage [data-u="${id}"]`) : null, before = v && v.getBoundingClientRect();
  EXP.has(id) ? EXP.delete(id) : EXP.add(id);
  if (VIEW === 'list') { const sc = window.scrollY; renderList(); window.scrollTo(0, sc); return; }
  renderStage(); const after = $(`#ftstage [data-u="${id}"]`);          // jaga posisi unit di layar agar tidak "loncat"
  if (before && after) { const a = after.getBoundingClientRect(); V.x += before.left - a.left; V.y += before.top - a.top; apply(); }
}
function hit(e) {
  const t = e.target.closest('[data-t],[data-b],[data-f],[data-o],.pc,[data-p]'); if (!t) return;
  if (t.dataset.o) return goBesan(+t.dataset.o);
  if (t.dataset.t) return toggleUnit(+t.dataset.t);
  if (t.dataset.b) return focusBranch(+t.dataset.b);
  if (t.dataset.f) return focusPerson(+t.dataset.f);
  const p = t.closest('[data-p]'); if (p) openProfile(+p.dataset.p);
}
function focusBranch(uid) { FOCUS = uid == null ? null : FAM.uById.get(uid); if (FOCUS && FOCUS.kids.length) EXP.add(FOCUS.id); renderCrumb(); renderBody(); if (VIEW === 'tree') requestAnimationFrame(() => fitView(true)); }
function focusPerson(id) {
  FAM = famOf(); const u = FAM.unitOf.get(id); if (!u) return;
  if (FAM.loose.includes(u)) return openProfile(id);
  { const kk = kinOf(FAM.byId.get(id)).k, sc = kk === 'besan' ? 'besan' : kk === 'luar' ? 'luar' : 'asli'; if (sc !== SCOPE) { SCOPE = sc; FOCUS = null; syncScopeUI(); } }
  if (FOCUS) { let x = u; while (x && x !== FOCUS) x = x.pu; if (!x) FOCUS = null; }
  for (let x = u.pu; x; x = x.pu) EXP.add(x.id);
  renderCrumb(); renderBody();
  requestAnimationFrame(() => {
    const el = $(`#fttree [data-p="${id}"]`) ; if (!el) return;
    if (VIEW === 'tree') centerOn(el, Math.max(V.k, .9), true); else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash(el);
  });
}
function goBranch(uid) { closeProfile(); PENDING_BR = uid; VIEW = 'tree'; showPage('silsilah'); }
function goTree(id) { closeProfile(); PENDING = id; VIEW = 'tree'; showPage('silsilah'); }
function setExpDepth(n) { EXP = new Set(); FAM.units.forEach(u => { if (u.depth <= n - 2 && (u.kids.length || u.refs.length || u.ext.length)) EXP.add(u.id); }); }
function fitDepth() {                                       // buka cabang sedalam yang masih muat & terbaca dalam satu layar (selebihnya ditandai +N)
  const v = viewEl(), s = stageEl(); if (!v || !s) return; const md = (u) => Math.max(u.depth, ...u.kids.map(md)), mg = Math.max(1, ...scopeRoots().map(u => md(u) + 1));
  for (let n = mg; n >= 2; n--) {
    setExpDepth(n); renderStage();
    if (Math.min((v.clientWidth - GUT()) / s.offsetWidth, v.clientHeight / s.offsetHeight) * .96 >= .62) break;
  }
}
function expandTo(n) { EXP = new Set(); FAM.units.forEach(u => { if (u.depth <= n - 2 && (u.kids.length || u.refs.length || u.ext.length)) EXP.add(u.id); }); renderBody(); if (VIEW === 'tree') requestAnimationFrame(() => fitView(true)); }
function renderCrumb() {
  const c = $('#ftcrumb'), s = $('#ftsum'); if (!c) return; let h = '';
  if (FOCUS) { const ch = []; for (let x = FOCUS; x; x = x.pu) ch.unshift(x); h += `<button data-c="-1">${SCOPE === 'besan' ? '⌂ Keluarga besan' : SCOPE === 'luar' ? '⌂ Keluarga lain' : '⌂ Keturunan asli'}</button>` + ch.map((u, i) => `<span>›</span><button data-c="${u.id}"${i === ch.length - 1 ? ' class="cur"' : ''}>${esc(unitLabel(u))}</button>`).join(''); }
  if (LINE && FAM.byId.get(LINE_ID)) h += `<span class="linepill">🧬 Garis keturunan <b>${esc(first(FAM.byId.get(LINE_ID).name))}</b><button data-c="line">✕ Hapus sorotan</button></span>`;
  c.style.display = h ? '' : 'none'; c.innerHTML = h;
  if (s) { if (FOCUS) { const b = branchStats(FOCUS); s.style.display = ''; s.innerHTML = `<b>Cabang ${esc(unitLabel(FOCUS))}</b><span><i>${b.n}</i> orang</span>${SCOPE === 'asli' ? `<span><i>${b.asli}</i> keturunan</span><span><i>${b.men}</i> menantu</span>` : ''}<span><i>${b.g.size}</i> generasi</span><span class="g-m">♂ <i>${b.L}</i></span><span class="g-f">♀ <i>${b.P}</i></span><span>† <i>${b.dead}</i></span><span>Belum menikah <i>${b.single}</i></span>`; } else s.style.display = 'none'; }
}

// ---------- Pencarian ----------
function searchMembers(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const out = []; for (const m of FAM.src) { if (m.name.toLowerCase().includes(q)) { out.push(m); if (out.length >= 8) break; } } return out;
}
function relText(m) {
  const k = kinOf(m), sp = [...FAM.adj.get(m.id)].map(i => first(FAM.byId.get(i).name)), p = FAM.byId.get(m.parent_id), g = FAM.gen.get(m.id);
  const lead = k.k === 'besan' ? `${KB[k.role]} · ${k.grp.label.replace('Keluarga asal ', 'asal ')}` : k.k === 'menantu' ? `Menantu · Gen ${g}` : k.k === 'pendiri' ? 'Leluhur · Gen 1' : g ? `Gen ${g}` : '';
  return `${relPrefix(m)}${lead}${p ? ' · anak ' + first(p.name) : ''}${sp.length ? ' · ♥ ' + sp.join(', ') : ''}`;
}
function showResults(items, sel) {
  const r = $('#ftres'); if (!r) return; if (!items.length) { r.classList.remove('show'); return; }
  r.innerHTML = items.map((m, i) => `<button class="${i === sel ? 'sel' : ''} g-${gCls(m)}" data-id="${m.id}">${avHtml(m, 's', 'sm')}<b>${esc(m.name)}</b><small>${esc(relText(m))}</small></button>`).join(''); r.classList.add('show'); hydratePhotos(r);
}

// ---------- Halaman ----------
function autoExpand() {
  let level = scopeRoots(), vis = level.length;
  while (level.length) { const nxt = level.flatMap(u => u.kids); if (nxt.length && vis + nxt.length > 36) break; level.forEach(u => { if (u.kids.length || u.ext.length) EXP.add(u.id); }); if (!nxt.length) break; vis += nxt.length; level = nxt; }
}
R.silsilah = async () => {
  MEMBERS = await api('members'); FAM = buildFam(MEMBERS); const S = FAM.stats, firstRun = !TREE_INIT; if (SELF_ID && !FAM.byId.has(SELF_ID)) { SELF_ID = null; LS.set('fh-self', null); } if (!TREE_INIT && innerWidth <= 760) VIEW = 'list';
  if (PENDING_G != null) { SCOPE = 'besan'; FOCUS = null; }
  if ((SCOPE === 'besan' && !FAM.besan.length) || (SCOPE === 'luar' && !FAM.other.length)) SCOPE = 'asli';
  if (!TREE_INIT || !FAM.units.some(u => EXP.has(u.id))) { autoExpand(); } else EXP = new Set([...EXP].filter(i => FAM.uById.has(i)));
  if (SCOPE !== 'asli' && !scopeRoots().some(u => EXP.has(u.id))) autoExpand();
  FOCUS = FOCUS ? (FAM.uById.get(FOCUS.id) || null) : null;
  const chip = (i, n, l) => `<div class="fchip"><span class="fi">${i}</span><div><b>${n}</b><small>${l}</small></div></div>`;
  const notes = [S.unk && isM() ? `<div class="fnote">⚠ ${S.unk} anggota belum diisi jenis kelamin. <button class="btn-s" onclick="goMembers('?')">Lengkapi sekarang →</button></div>` : '', S.nomar && isM() ? `<div class="fnote">ℹ ${S.nomar} anggota belum diisi status pernikahan. <button class="btn-s" onclick="fillMarital()">Isi otomatis “Belum menikah” untuk yang tanpa pasangan</button> <button class="btn-s" onclick="goMembers('', '-')">Lihat daftarnya</button></div>` : '', linNotesHtml()].filter(Boolean).join('');
  const hs = (n, l) => `<div class="hs"><b>${n}</b><span>${l}</span></div>`;
  $('#silsilah').innerHTML = hero('Silsilah Keluarga', `Telusuri ${S.total} anggota dalam ${S.maxGen} generasi — cari nama, buka cabang, atau pilih “Posisi saya” untuk melihat sebutan hubungan.`,
    `<div class="hero-stats">${hs(S.total, 'anggota')}${hs(S.asli, 'keturunan asli')}${hs(S.maxGen, 'generasi')}${S.besan ? hs(S.besan, 'keluarga besan') : ''}<button class="hs-more" id="fsMore" aria-expanded="false" title="Statistik lengkap">Statistik ▾</button></div>`) + `
  <div class="card fsall" id="fsAll" hidden><div class="fstats">${chip('👥', S.total, 'Anggota')}${chip('🧬', S.asli, 'Keturunan asli')}${chip('💍', S.menantu, 'Menantu')}${S.besan ? chip('🏠', S.besan, 'Keluarga besan') : ''}${chip('<span class="g-m">♂</span>', S.L, 'Laki-laki')}${chip('<span class="g-f">♀</span>', S.P, 'Perempuan')}${chip('♥', S.pairs, 'Pasangan')}${chip('⇅', S.maxGen, 'Generasi')}${chip('○', S.single, 'Belum menikah')}${chip('†', S.dead, 'Almarhum/ah')}</div></div>
  ${linWarnHtml()}
  <div class="card ftcard"><div class="ftbar">
    <div class="ftrow">
      <div class="ftsearch"><input id="ftq" placeholder="Cari nama anggota…" autocomplete="off"><div id="ftres" class="ftres"></div></div>
      <div class="seg" id="ftseg" title="Pohon = bagan bercabang · Daftar = daftar bertingkat (lebih nyaman di HP)"><button data-v="tree" class="${VIEW === 'tree' ? 'on' : ''}">🌳 Pohon</button><button data-v="list" class="${VIEW === 'list' ? 'on' : ''}">☰ Daftar</button></div>
      ${scopeSegHtml()}<span class="ftgap"></span>
      <button class="ghost ftme" id="ftme" title="Pilih nama Anda agar tiap kartu menampilkan sebutan hubungan (Paman, Sepupu, Ipar …)">📍 Posisi saya</button><button class="ghost" id="ftguide" title="Cara membaca silsilah">❓ Panduan</button>
    </div>
    <div class="ftrow ftrow2">
      <label class="ftsel">Tampilkan s/d generasi <select id="ftgen">${Array.from({ length: S.maxGen }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      <button class="ghost" id="ftAll">Buka semua cabang</button><button class="ghost" id="ftNone">Tutup semua</button><span class="ftgap"></span>
      ${mgr('<button class="primary" onclick="addMember()">＋ Anggota</button><button class="ghost" onclick="openImport()">⇪ Impor CSV</button>')}
    </div>
  </div>${VIEW === 'tree' ? '' : hintHtml()}
  <div class="crumbrow"><div class="lineline">${linLineHtml()}</div><div id="ftcrumb" class="crumb" style="display:none"></div><span class="ftvis" id="ftvis"></span></div><div id="ftsum" class="ftsum" style="display:none"></div>
  <div id="fttree">${VIEW === 'tree' ? `<div class="ftview${SELF_ID && REL_ON ? ' relon' : ''}" id="ftview" tabindex="0"><div class="ftrule" id="ftrule"></div><div class="ftstage" id="ftstage"></div>${hintHtml()}
      <div class="ftctl"><button data-z="in" title="Perbesar (+)">＋</button><button data-z="out" title="Perkecil (−)">－</button><button data-z="fit" title="Pas layar (0)">⤢</button><span id="ftzoom">100%</span></div>
      <div class="ftlegend"><span><i class="lg m"></i>Laki-laki</span><span><i class="lg f"></i>Perempuan</span><span class="r">♥ Menikah</span><span>✕ Cerai</span><span>† Wafat</span><span><i class="lg k-pendiri"></i>Leluhur</span><span><i class="lg k-menantu"></i>Menantu</span>${S.besan ? '<span><i class="lg k-besan"></i>Besan</span>' : ''}<a class="lgmore" onclick="openGuide()">❓ Penjelasan</a></div>
      <div class="ftmini" id="ftmini"><canvas id="ftmc" width="280" height="54"></canvas><div class="ftmv" id="ftmv"></div></div>
      <div class="fthint">Seret = geser · Ctrl + scroll / cubit = zoom · klik kartu = profil · Esc = hapus sorotan</div></div>` : '<div class="ftlist" id="ftlist"></div>'}</div></div>
  ${notes ? `<div class="fnotes">${notes}</div>` : ''}${FAM.loose.length ? `<div class="card floose"><b>Belum terhubung (${FAM.loose.length})</b><span>Tanpa orang tua, pasangan, maupun anak — hubungkan lewat menu Ubah.</span><div>${FAM.loose.slice(0, 14).map(u => `<button class="lchip g-${gCls(u.members[0])}" data-p="${u.members[0].id}">${gSym(u.members[0])} ${esc(u.members[0].name)}</button>`).join('')}${FAM.loose.length > 14 ? `<em>+${FAM.loose.length - 14} lainnya</em>` : ''}</div></div>` : ''}`;
  TREE_INIT = true; const sec = $('#silsilah'); if (VIEW === 'tree') bindMini(); renderCrumb(); renderBody();
  if (VIEW === 'tree') { bindView(); requestAnimationFrame(() => { if (firstRun && PENDING_G == null && PENDING_BR == null && !PENDING) fitDepth(); initialView(); if (PENDING_G != null) { const g = PENDING_G; PENDING_G = null; focusGroup(g); } else if (PENDING_BR != null) { const b = PENDING_BR; PENDING_BR = null; focusBranch(b); } else if (PENDING) { const p = PENDING; PENDING = null; focusPerson(p); } else if (SELF_ID) showSelf(); }); } else if (PENDING_G != null) { const g = PENDING_G; PENDING_G = null; focusGroup(g); } else if (PENDING) { const p = PENDING; PENDING = null; focusPerson(p); } else if (SELF_ID && firstRun) focusPerson(SELF_ID);
  const inp = $('#ftq'); let items = [], sel = 0;
  inp.oninput = () => { items = searchMembers(inp.value); sel = 0; showResults(items, sel); };
  inp.onkeydown = e => { if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); showResults(items, sel); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); showResults(items, sel); e.preventDefault(); } else if (e.key === 'Enter' && items[sel]) pickResult(items[sel].id); else if (e.key === 'Escape') $('#ftres').classList.remove('show'); };
  $('#ftres').onclick = e => { const b = e.target.closest('[data-id]'); if (b) pickResult(+b.dataset.id); };
  $('#ftseg').onclick = e => { const b = e.target.closest('[data-v]'); if (b && b.dataset.v !== VIEW) { VIEW = b.dataset.v; R.silsilah(); } };
  $('#ftgen').onchange = e => expandTo(+e.target.value);
  const scp = $('#ftscope'); if (scp) scp.onclick = e => { const b = e.target.closest('[data-s]'); if (b) setScope(b.dataset.s); };
  $('#ftAll').onclick = () => { FAM.units.forEach(u => { if (u.kids.length || u.refs.length || u.ext.length) EXP.add(u.id); }); renderBody(); if (VIEW === 'tree') { requestAnimationFrame(() => { initialView(); drawMini(); if (SELF_ID) showSelf(); }); if (FAM.stats.total > 120) toast('Semua cabang terbuka. Pakai minimap, cari nama, atau tampilan Daftar untuk menelusuri.'); } };
  $('#ftNone').onclick = () => { EXP = new Set(); renderBody(); if (VIEW === 'tree') requestAnimationFrame(() => { initialView(); drawMini(); }); };
  $('#ftcrumb').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; const v = b.dataset.c; v === 'line' ? clearLine() : focusBranch(+v < 0 ? null : +v); };
  const ctl = $('.ftctl'); if (ctl) ctl.onclick = e => { const z = e.target.closest('[data-z]'); if (!z) return; ({ in: () => zoomBy(1.3), out: () => zoomBy(.77), fit: () => fitView(true) })[z.dataset.z](); };
  const lst = $('#ftlist'); if (lst) lst.onclick = hit;
  $('#ftme').onclick = openSelfPicker; $('#ftguide').onclick = openGuide; syncSelfBtn();
  $('#fsMore').onclick = e => { const a = $('#fsAll'), o = a.hidden; a.hidden = !o; e.currentTarget.setAttribute('aria-expanded', o); e.currentTarget.textContent = o ? 'Statistik ▴' : 'Statistik ▾'; };
  sec.querySelectorAll('.lchip').forEach(b => b.onclick = () => openProfile(+b.dataset.p));
};
function pickResult(id) { $('#ftres').classList.remove('show'); $('#ftq').value = ''; const m = FAM.byId.get(id); focusPerson(id); toast('📍 ' + m.name); }
document.addEventListener('click', e => { if (!e.target.closest('.ftsearch')) { const r = $('#ftres'); if (r) r.classList.remove('show'); } });
