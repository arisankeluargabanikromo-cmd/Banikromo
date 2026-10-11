// ============================================================
// Silsilah v2.7 — garis keturunan asli vs keluarga besan
//   Keturunan asli : anak-cucu leluhur (lewat ayah maupun ibu) — batang utama pohon, bernomor generasi
//   Menantu        : pasangan yang masuk lewat pernikahan — menempel di samping pasangannya
//   Keluarga besan : keluarga asal menantu — cabang TERPISAH (tidak pernah jadi leluhur pohon utama), tertaut dua arah
// Klasifikasi dihitung otomatis dari data (buildFam di tree.js); admin dapat menegaskan leluhur utama.
// ============================================================

// ---------- Pemilih lingkup & bilah info ----------
function scopeSegHtml() {
  const S = FAM.stats; if (!FAM.besan.length && !FAM.other.length) return '';
  const o = [['asli', '🧬 Keturunan asli', S.asli + S.menantu]]; if (FAM.besan.length) o.push(['besan', '🏠 Keluarga besan', S.besan]); if (FAM.other.length) o.push(['luar', 'Keluarga lain', S.luar - S.loose]);
  return `<div class="seg" id="ftscope" title="Pilih kelompok yang ditampilkan">${o.map(([k, l, n]) => `<button data-s="${k}" class="${SCOPE === k ? 'on' : ''}">${l} <i>${n}</i></button>`).join('')}</div>`;
}
const besanActive = () => FAM.src.filter(m => kinOf(m).k === 'besan' && +m.active === 1);
function linLineHtml() {                                    // satu baris ringkas di atas pohon
  const L = FAM.lin, S = FAM.stats; if (!L.roots.length || L.mode === 'none') return '';
  const how = L.mode === 'manual' ? 'ditetapkan admin' : 'terdeteksi otomatis';
  return `<span class="ll" title="Keturunan asli ${how}. Menantu dan keluarga besan ditampilkan terpisah.">🧬 Keturunan dari <b>${esc(L.roots.map(unitLabel).join(' · '))}</b> <small>· ${S.asli} orang</small></span>${adm('<button class="btn-s" onclick="openLineage()">Atur</button>')}`;
}
function linWarnHtml() {                                    // peringatan yang memengaruhi kebenaran pohon: tetap di atas
  const L = FAM.lin; if (!L.roots.length || L.mode === 'none' || !L.ambiguous) return '';
  return `<div class="finfo warn"><span>⚠ Ada keluarga lain yang ukurannya sebanding, sehingga garis keturunan asli belum pasti. ${isA() ? '<b>Mohon konfirmasi</b> agar pohon tidak keliru.' : 'Admin belum menegaskannya.'}</span>${adm('<button class="btn-s" onclick="openLineage()">Konfirmasi</button>')}</div>`;
}
function linNotesHtml() {                                   // tugas perapian untuk admin: dipindah ke bawah pohon
  const act = isA() ? besanActive() : []; if (!act.length) return '';
  return `<div class="finfo soft"><span>ℹ ${act.length} anggota keluarga besan masih berstatus <b>aktif arisan</b> (ikut daftar iuran, tunggakan, dan kocokan).</span><button class="btn-s" onclick="deactivateBesan()">Nonaktifkan dari arisan</button></div>`;
}
function syncScopeUI() { const s = $('#ftscope'); if (s) s.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === SCOPE)); }
function setScope(sc) {
  if (sc === SCOPE) return; SCOPE = sc; FOCUS = null; LINE = null; LINE_ID = null; syncScopeUI(); autoExpand(); renderCrumb(); renderBody();
  if (VIEW === 'tree') requestAnimationFrame(() => { if (typeof initialView === 'function') initialView(); drawMini(); });
}

// ---------- Navigasi ke keluarga besan ----------
function focusGroup(gid) {
  const g = FAM.besan.find(x => x.id === gid); if (!g) return; if (SCOPE !== 'besan') setScope('besan');
  g.roots.forEach(u => { if (u.kids.length || u.ext.length) EXP.add(u.id); }); renderBody();
  requestAnimationFrame(() => { const el = $(`.bgrp[data-g="${gid}"]`); if (!el) return; if (VIEW === 'tree') centerOn(el, Math.max(V.k, .9), true); else el.scrollIntoView({ block: 'start', behavior: 'smooth' }); flash(el.querySelector('.pc,.ol-r') || el); });
}
function goBesan(gid) {
  closeProfile();
  if ($('#ftstage') || $('#ftlist')) { focusGroup(gid); return; }
  PENDING_G = gid; SCOPE = 'besan'; FOCUS = null; showPage('silsilah');
}

// ---------- Atur garis keturunan asli ----------
function openLineage() {
  const L = FAM.lin, manual = L.mode === 'manual', sel = new Set(L.roots), cands = L.cands.slice(0, 14).map(c => c.u); L.roots.forEach(u => { if (!cands.includes(u)) cands.unshift(u); });
  const cnt = u => { const c = L.cands.find(x => x.u === u); return c ? c.total : u.desc; };
  $('#fTitle').textContent = 'Atur garis keturunan asli';
  $('#fForm').innerHTML = `<p class="imp-note">Garis keturunan asli adalah anak-cucu dari <b>leluhur / pendiri</b> keluarga. Pasangan yang masuk lewat pernikahan (<b>menantu</b>) dan keluarga asalnya (<b>besan</b>) ditampilkan terpisah: tidak dihitung keturunan asli dan tidak pernah menjadi leluhur di pohon utama.</p>
  <label class="lopt"><input type="radio" name="lm" value="auto" ${manual ? '' : 'checked'}><div><b>Otomatis (disarankan)</b><small>Keluarga dengan keturunan terbanyak; bila ada yang sebanding, yang paling awal dicatat.</small></div></label>
  <label class="lopt"><input type="radio" name="lm" value="manual" ${manual ? 'checked' : ''}><div><b>Tetapkan sendiri</b><small>Pilih satu atau lebih leluhur utama (puncak keluarga):</small></div></label>
  <div class="lcands" id="lc" ${manual ? '' : 'hidden'}>${cands.map(u => `<label class="lc"><input type="checkbox" value="${u.members[0].id}" ${sel.has(u) ? 'checked' : ''}><div><b>${esc(unitLabel(u))}</b><small>${cnt(u)} keturunan tercatat${u.members[0].birth_year ? ' · lahir ' + u.members[0].birth_year : ''}</small></div></label>`).join('') || '<small class="muted">Belum ada keluarga yang memiliki keturunan.</small>'}</div>
  <div class="row"><button type="button" class="ghost" onclick="closeForm()">Batal</button><button class="primary">Simpan</button></div>`;
  const tog = () => { $('#lc').hidden = $('#fForm').lm.value !== 'manual'; }; $('#fForm').querySelectorAll('[name=lm]').forEach(r => r.onchange = tog);
  $('#fForm').onsubmit = guard(async e => {
    e.preventDefault(); const man = e.target.lm.value === 'manual', ids = man ? [...$('#lc').querySelectorAll('input:checked')].map(x => +x.value) : [];
    if (man && !ids.length) { toast('Pilih minimal satu leluhur, atau pakai mode Otomatis'); throw 0; }
    await api('lineage', 'POST', { ids }); closeForm(); toast(man ? 'Garis keturunan asli ditetapkan' : 'Kembali ke deteksi otomatis'); MEMBERS = []; reload();
  });
  $('#formModal').classList.add('show');
}

// ---------- Catat keluarga asal menantu ----------
const addParent = guard(async id => {
  await ensureMembers(); closeProfile(); const m = FAM.byId.get(id); if (!m) return;
  const fields = [{ k: 'name', l: 'Nama orang tua', req: 1 }, { k: 'gender', l: 'Sebagai', t: 'select', half: 1, o: [['', '— Pilih —'], ['L', '♂ Ayah'], ['P', '♀ Ibu']] }, { k: 'birth_year', l: 'Tahun lahir', t: 'number', half: 1 }, { k: 'death_year', l: 'Tahun wafat (bila sudah wafat)', t: 'number', half: 1 },
    { k: 'active', l: 'Status arisan', t: 'select', half: 1, o: [[0, 'Nonaktif (hanya untuk silsilah)'], [1, 'Aktif (ikut arisan)']] }];
  openForm('Catat orang tua ' + first(m.name), fields, { active: 0, gender: '' }, async b => {
    if (b.birth_year && b.death_year && +b.death_year < +b.birth_year) { toast('Tahun wafat tidak boleh lebih awal dari tahun lahir'); throw 0; }
    const r = await sb.from('members').insert(clean('members', { ...b, relation: m.gender || m.spouse_id ? 'Besan' : 'Orang tua', marital_status: 'menikah' })).select('id').single();
    if (r.error) throw r.error; const nid = (Array.isArray(r.data) ? r.data[0] : r.data).id;
    const u = await sb.from('members').update({ parent_id: nid }).eq('id', id); if (u.error) throw u.error; MEMBERS = [];
  });
});
const deactivateBesan = guard(async () => {
  const l = besanActive(); if (!l.length) return;
  if (!confirm(`Nonaktifkan ${l.length} anggota keluarga besan dari arisan?\n\nMereka tidak lagi muncul di daftar iuran, tunggakan, dan kocokan. Data silsilah TIDAK dihapus, dan bisa diaktifkan lagi kapan saja lewat menu Anggota.`)) return;
  const n = await api('memactive', 'POST', { ids: l.map(x => x.id), active: 0 }); toast(n + ' anggota dinonaktifkan dari arisan'); MEMBERS = []; reload();
});

// ---------- Blok "Hubungan dengan keturunan asli" di profil ----------
function kinBlock(m) {
  const k = kinOf(m), u = FAM.unitOf.get(m.id), g = FAM.gen.get(m.id), blk = (badge, txt, extra = '') => `<div class="detail kin" style="grid-column:span 2"><span>Posisi dalam silsilah</span><b>${badge}</b>${txt ? `<div class="rtxt">${txt}</div>` : ''}${extra}</div>`;
  if (k.k === 'pendiri') return blk('<em class="kt kt-pendiri">Leluhur</em> pendiri garis keturunan asli', `Generasi 1 • ${u.descA} keturunan dan ${u.desc - u.descA} menantu tercatat di bawahnya`);
  if (k.k === 'asli') return blk('<em class="kt kt-asli">Keturunan asli</em>', `Generasi ${g} dari garis keturunan asli`);
  if (k.k === 'menantu') {
    const sp = asliSpouses(m), o = u.origins.find(x => x.member === m), par = o && o.parent, pu = par && FAM.unitOf.get(par.id);
    const ex = o ? `<div class="rtxt">Keluarga asal: <span class="rchips">${pu.members.map(x => chipL(x, x.gender === 'L' ? 'Ayah' : x.gender === 'P' ? 'Ibu' : 'Orang tua')).join('')}</span> • ${o.grp.size} orang tercatat <button class="btn-s" onclick="goBesan(${o.grp.id})">⌂ Lihat keluarga asal</button></div>`
      : `<div class="rtxt">Keluarga asal belum dicatat. ${adm(`<button class="btn-s" onclick="addParent(${m.id})">＋ Catat orang tua</button>`)}</div>`;
    return blk('<em class="kt kt-menantu">Menantu</em> — masuk lewat pernikahan', `${m.gender === 'P' ? 'Istri' : m.gender === 'L' ? 'Suami' : 'Pasangan'} dari <span class="rchips">${sp.map(chip).join('')}</span> • sejajar Generasi ${g}`, ex);
  }
  if (k.k === 'besan') {
    const A = k.anchors || [k.grp.anchors[0]], sp = [...new Map(A.flatMap(asliSpouses).map(x => [x.id, x])).values()], nm = A.map(a => esc(first(a.name))).join(' &amp; ');
    return blk(`<em class="kt kt-besan">${KB[k.role]}</em> — keluarga besan`, `Keluarga asal <strong class="nm">${nm}</strong> (menantu), yang menikah dengan <span class="rchips">${sp.map(chip).join('')}</span>`, `<div class="rtxt">${A.map(a => `<button class="btn-s" onclick="goTree(${a.id})">🌳 Lihat ${esc(first(a.name))} di pohon keturunan asli</button>`).join(' ')}</div>`);
  }
  return '';
}
