// ===== Anggota: form (jenis kelamin, pasangan, tahun), profil keluarga, direktori besar, impor CSV =====
async function ensureMembers() { if (!MEMBERS.length) MEMBERS = await api('members'); return famOf(); }
const label = m => `${m.name} (#${m.id})`;
const spousesOf = id => [...famOf().adj.get(id) || []].map(i => FAM.byId.get(i));
const childrenOf = id => { const u = famOf().unitOf.get(id); if (!u) return []; const ids = new Set(u.members.map(m => m.id)); return MEMBERS.filter(x => ids.has(x.parent_id) && !ids.has(x.id)); };

function descendantIds(id) {                                  // keturunan tidak boleh dipilih sebagai orang tua (mencegah siklus)
  const kids = new Map(); MEMBERS.forEach(m => { if (m.parent_id) (kids.get(m.parent_id) || kids.set(m.parent_id, []).get(m.parent_id)).push(m.id); });
  const out = new Set([id]), st = [id]; while (st.length) for (const k of kids.get(st.pop()) || []) if (!out.has(k)) { out.add(k); st.push(k); } return out;
}
function memberFields(self) {
  const ex = self ? descendantIds(self.id) : new Set();
  return [
    { k: 'name', l: 'Nama lengkap', req: 1 },
    { k: 'gender', l: 'Jenis kelamin', t: 'select', req: 1, half: 1, o: [['', '— Pilih —'], ['L', '♂ Laki-laki'], ['P', '♀ Perempuan']] },
    { k: 'marital_status', l: 'Status pernikahan', t: 'select', half: 1, o: [['', '— Pilih —'], ['belum_menikah', 'Belum menikah'], ['menikah', 'Menikah'], ['cerai', 'Cerai'], ['cerai_mati', 'Cerai mati (duda/janda)']] },
    { k: 'parent_id', l: 'Orang tua (ayah atau ibu)', t: 'pick', o: MEMBERS.filter(m => !ex.has(m.id)).map(m => [m.id, label(m)]) },
    { k: 'spouse_id', l: 'Pasangan (suami / istri) — isi bila menikah / pernah menikah', t: 'pick', o: MEMBERS.filter(m => !self || m.id !== self.id).map(m => [m.id, label(m)]) },
    { k: 'relation', l: 'Hubungan / keterangan', half: 1 },
    { k: 'active', l: 'Status arisan', t: 'select', half: 1, o: [[1, 'Aktif'], [0, 'Nonaktif']] },
    { k: 'birth_year', l: 'Tahun lahir', t: 'number', half: 1 },
    { k: 'death_year', l: 'Tahun wafat (kosongkan jika masih hidup)', t: 'number', half: 1 },
    { k: 'phone', l: 'No. HP / WhatsApp', half: 1 },
    { k: 'joined', l: 'Anggota sejak (tahun)', t: 'number', half: 1 },
  ];
}
async function saveMember(id, b) {
  if (b.birth_year && b.death_year && +b.death_year < +b.birth_year) { toast('Tahun wafat tidak boleh lebih awal dari tahun lahir'); throw 0; }
  if (id && String(b.spouse_id) === String(id)) { toast('Pasangan tidak boleh diri sendiri'); throw 0; }
  let ms = b.marital_status; if (b.spouse_id && (!ms || ms === 'belum_menikah')) ms = 'menikah';           // ada pasangan -> otomatis menikah
  if (!b.spouse_id && ms === 'belum_menikah' && FAM && id && [...(FAM.adj.get(id) || [])].length && !confirm('Anggota ini tercatat punya pasangan di anggota lain. Tetap tandai “Belum menikah”?')) throw 0;
  b.marital_status = ms; b.spouse_status = ms === 'cerai' ? 'cerai' : 'menikah';
  await api(id ? 'members/' + id : 'members', id ? 'PUT' : 'POST', b);
  if (id && b.spouse_id) await sb.from('members').update({ spouse_status: b.spouse_status }).eq('id', +b.spouse_id).eq('spouse_id', id);   // samakan status di sisi pasangan
}
const addMember = guard(async (vals = {}) => { await ensureMembers(); openForm('Tambah Anggota', memberFields(null), { gender: '', active: 1, spouse_status: 'menikah', joined: new Date().getFullYear(), marital_status: 'belum_menikah', ...vals }, b => saveMember(null, b)); });
const editMember = guard(async id => {
  await ensureMembers(); const m = FAM.byId.get(id), rev = MEMBERS.find(x => x.spouse_id === id); closeProfile();
  openForm('Ubah Anggota', memberFields(m), { ...m, marital_status: FAM.mar.get(id).k || '', spouse_id: m.spouse_id || (rev && rev.id) || '' }, b => saveMember(id, b), () => api('members/' + id, 'DELETE'));
});
const addChild = id => { closeProfile(); addMember({ parent_id: id, relation: 'Anak' }); };
const addSpouse = id => { closeProfile(); const m = FAM.byId.get(id); addMember({ spouse_id: id, marital_status: 'menikah', gender: m.gender === 'L' ? 'P' : m.gender === 'P' ? 'L' : '', relation: 'Pasangan' }); };

// ---------- Foto profil (Storage privat, URL bertanda tangan, dimuat hanya untuk kartu yang tampil) ----------
const PH = {};
async function signPaths(paths) {
  const need = [...new Set(paths)].filter(p => !PH[p] || PH[p].t < Date.now());
  for (let i = 0; i < need.length; i += 150) {
    const { data, error } = await sb.storage.from('photos').createSignedUrls(need.slice(i, i + 150), 3600); if (error) { console.error(error); return; }
    data.forEach(d => { if (d.signedUrl) PH[d.path] = { u: d.signedUrl, t: Date.now() + 3300000 }; });
  }
}
async function hydratePhotos(root) {
  try {
    const els = [...(root || document).querySelectorAll('[data-pp]:not(.has)')]; if (!els.length) return;
    const ps = els.map(e => e.dataset.pp + (e.dataset.sz === 'l' ? '_l.jpg' : '_s.jpg')); await signPaths(ps);
    els.forEach((e, i) => { const o = PH[ps[i]]; if (o && e.isConnected) { e.style.backgroundImage = `url("${o.u}")`; e.classList.add('has'); } });
  } catch (e) { console.error(e); }
}
const photoFiles = base => [base + '_s.jpg', base + '_l.jpg'];
const openPhotoEditor = guard(async id => {
  await ensureMembers(); const m = FAM.byId.get(id); closeProfile();
  $('#fTitle').textContent = 'Foto profil — ' + m.name;
  $('#fForm').innerHTML = `<div class="pe"><div class="pe-stage"><canvas id="peCv" width="300" height="300"></canvas><div class="pe-ring"></div><div class="pe-ph" id="pePh">Pilih foto untuk memulai<small>JPG, PNG, atau WebP</small></div></div>
  <label class="pe-zoom">Zoom <input type="range" id="peZ" min="100" max="400" value="100" disabled></label><p class="imp-note" id="peMsg">Seret foto untuk mengatur posisi wajah di dalam lingkaran. Foto disimpan privat dan hanya terlihat oleh anggota yang login.</p>
  <div class="row"><button type="button" class="ghost" onclick="closeForm()">Batal</button>${m.photo_path ? '<button type="button" class="danger" id="peDel">Hapus foto</button>' : ''}<label class="ghost filebtn">Pilih foto<input id="peFile" type="file" accept="image/*" hidden></label><button class="primary" id="peSave" disabled>Simpan</button></div></div>`;
  const cv = $('#peCv'), cx = cv.getContext('2d'); let img = null, z = 1, ox = 0, oy = 0, base = 1;
  const draw = (ctx, S) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S); if (!img) return; const f = S / 300, sc = base * z * f; ctx.drawImage(img, S / 2 + ox * f - img.width * sc / 2, S / 2 + oy * f - img.height * sc / 2, img.width * sc, img.height * sc); };
  const clamp = () => { const w = img.width * base * z, h = img.height * base * z; ox = Math.max(-(w - 300) / 2, Math.min((w - 300) / 2, ox)); oy = Math.max(-(h - 300) / 2, Math.min((h - 300) / 2, oy)); };
  const redraw = () => { if (img) clamp(); draw(cx, 300); };
  $('#peFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { img = await createImageBitmap(f); } catch (_) { toast('Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.'); return; }
    base = Math.max(300 / img.width, 300 / img.height); z = 1; ox = oy = 0; $('#peZ').value = 100; $('#peZ').disabled = false; $('#peSave').disabled = false; $('#pePh').style.display = 'none'; redraw();
  };
  $('#peZ').oninput = e => { z = e.target.value / 100; redraw(); };
  let drag = null; cv.onpointerdown = e => { if (!img) return; drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!drag) return; const r = 300 / cv.getBoundingClientRect().width; ox += (e.clientX - drag.x) * r; oy += (e.clientY - drag.y) * r; drag = { x: e.clientX, y: e.clientY }; redraw(); };
  cv.onpointerup = () => { drag = null; };
  cv.onwheel = e => { if (!img) return; e.preventDefault(); z = Math.min(4, Math.max(1, z * Math.exp(-e.deltaY * .002))); $('#peZ').value = z * 100; redraw(); };
  const out = S => new Promise(r => { const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S); c.toBlob(r, 'image/jpeg', S > 200 ? .86 : .8); });
  const done = async msg => { closeForm(); toast(msg); MEMBERS = []; await ensureMembers(); reload(); openProfile(id); };
  $('#peSave').onclick = guard(async () => {
    const b = $('#peSave'); b.disabled = true; b.textContent = 'Menyimpan…'; const nb = `profile/${id}-${Date.now().toString(36)}`, [fs, fl] = photoFiles(nb), old = m.photo_path;
    try {
      const [bl, bs] = [await out(480), await out(96)];
      for (const [p, bb] of [[fl, bl], [fs, bs]]) { const r = await sb.storage.from('photos').upload(p, bb, { contentType: 'image/jpeg' }); if (r.error) throw r.error; }
      const u = await sb.from('members').update({ photo_path: nb }).eq('id', id); if (u.error) throw u.error;
      if (old) await sb.storage.from('photos').remove(photoFiles(old));
      await done('✓ Foto profil disimpan');
    } catch (e) { await sb.storage.from('photos').remove([fs, fl]); b.disabled = false; b.textContent = 'Simpan'; toast('Gagal menyimpan foto: ' + (e.message || 'coba lagi')); }
  });
  const del = $('#peDel'); if (del) del.onclick = guard(async () => {
    if (!confirm('Hapus foto profil ' + m.name + '?')) return;
    await sb.storage.from('photos').remove(photoFiles(m.photo_path)); const u = await sb.from('members').update({ photo_path: null }).eq('id', id); if (u.error) return toast(u.error.message); await done('Foto dihapus');
  });
  $('#formModal').classList.add('show');
});

// ---------- Profil ----------
const chipL = (m, l) => `<button class="rchip g-${gCls(m)}${m.death_year ? ' dead' : ''}" onclick="openProfile(${m.id})">${avHtml(m, 's', 'sm')}<span>${esc(m.name)}${l ? `<small>${l}</small>` : ''}</span></button>`;
const chip = m => chipL(m);
const REL = ['Leluhur', 'Anak', 'Cucu', 'Cicit'];
function relLabel(m) {                                      // kedudukan dalam keluarga, mis. "Cucu dari H. Abdullah & Hj. Siti"
  const u = FAM.unitOf.get(m.id); let top = u; while (top.pu) top = top.pu;
  const blood = m.parent_id && FAM.byId.has(m.parent_id) && FAM.unitOf.get(m.parent_id) !== u;
  if (u.pm && !blood) return `${m.gender === 'L' ? 'Suami' : m.gender === 'P' ? 'Istri' : 'Pasangan'} dari ${first(u.pm.name)}`;
  if (!u.pu) return FAM.loose.includes(u) ? 'Belum terhubung ke pohon keluarga' : 'Leluhur keluarga'; return `${u.depth <= 3 ? REL[u.depth] : 'Keturunan ke-' + u.depth} dari ${unitLabel(top)}`;
}
async function openProfile(id) {
  await ensureMembers(); const m = FAM.byId.get(id); if (!m) return;
  const hist = await api('history/' + id), cur = new Date().toISOString().slice(0, 7), paid = hist.pays.some(x => x.period === cur && x.fee_type_id === 1), paidW = hist.pays.some(x => x.period === cur && x.fee_type_id === 2), hl = t => hist.pays.filter(x => x.fee_type_id === t).slice(0, 12).map(x => '✓ ' + MONTH(x.period).slice(0, 3) + ' ' + x.period.slice(2, 4)).join(' · ') || 'Belum ada';
  const par = FAM.byId.get(m.parent_id), u = FAM.unitOf.get(id), sp = spousesOf(id), kids = childrenOf(id), sib = m.parent_id ? MEMBERS.filter(x => x.parent_id === m.parent_id && x.id !== id) : [], age = ageOf(m), stt = FAM.mar.get(id);
  const lab = x => x.gender === 'L' ? 'Ayah' : x.gender === 'P' ? 'Ibu' : 'Orang tua', pu = par && FAM.unitOf.get(par.id), other = pu && pu.members.length === 2 ? pu.members.find(x => x.id !== par.id) : null;
  const blood = m.parent_id && FAM.byId.has(m.parent_id) && FAM.unitOf.get(m.parent_id) !== u, nth = blood && u.pu ? `Anak ke-${u.pu.kids.indexOf(u) + 1} dari ${u.pu.kids.length} bersaudara` : '';
  const anc = []; for (let x = par, g = 0; x && g < 12; x = FAM.byId.get(x.parent_id), g++) anc.unshift(x);
  const more = (arr, n) => arr.slice(0, n).map(chip).join('') + (arr.length > n ? `<span class="rmore">+${arr.length - n} lagi</span>` : '');
  const row = (l, h) => h ? `<div class="detail" style="grid-column:span 2"><span>${l}</span><div class="rchips">${h}</div></div>` : '';
  const edges = sp.map(s => { const c = FAM.st.get(Math.min(id, s.id) + '-' + Math.max(id, s.id)) === 'cerai'; return c ? `Cerai dengan ${esc(s.name)}` : s.death_year ? `Menikah dengan almarhum ${esc(s.name)} (wafat ${s.death_year})` : `Menikah dengan ${esc(s.name)}`; });
  const grad = m.gender === 'L' ? 'linear-gradient(135deg,#6f95ff,#4b7bff)' : m.gender === 'P' ? 'linear-gradient(135deg,#ff8fc0,#ec5f9a)' : 'linear-gradient(135deg,#9aa4b8,#7a8499)';
  $('#profileBox').innerHTML = `<div class="modal-top"><b>Profil Keluarga</b><button class="close" onclick="closeProfile()">×</button></div>
  <div class="profile"><div class="pavw"><div class="pav" style="background:${grad}"${m.photo_path ? ` data-pp="${esc(m.photo_path)}" data-sz="l"` : ''}>${esc(ini(m.name))}</div>${adm(`<button class="pcam" onclick="openPhotoEditor(${id})" title="${m.photo_path ? 'Ganti' : 'Tambah'} foto">📷</button>`)}</div>
  <h2>${esc(m.name)}${m.death_year ? ' †' : ''}</h2>
  <p class="prel">${esc(relLabel(m))}</p>
  <p>${m.gender ? (m.gender === 'L' ? '♂ Laki-laki' : '♀ Perempuan') : 'Jenis kelamin belum diisi'} • Generasi ${FAM.gen.get(id)}${m.relation ? ' • ' + esc(m.relation) : ''}</p>
  <p style="margin-top:4px">${m.death_year ? `Wafat ${m.death_year}${age != null ? ` • usia ${age} th` : ''}` : age != null ? `Lahir ${m.birth_year} • usia ${age} th` : ''}${nth ? ` • ${nth}` : ''}${m.phone && m.phone !== 'DEMO' ? ' • ' + esc(m.phone) : ''}</p></div>
  <div class="detail-grid">
    <div class="detail" style="grid-column:span 2"><span>Status pernikahan</span><b>${stt.t ? `<em class="st st-${stt.k || 'x'} big">${stt.t}</em>` : 'Belum diisi'}</b>${edges.length ? `<div class="rtxt">${edges.join(' · ')}</div>` : ''}</div>
    ${row('Pasangan' + (u && u.members.length > 2 ? ' (lebih dari satu)' : ''), more(sp, 6))}
    ${row('Orang tua', par ? chipL(par, lab(par)) + (other ? chipL(other, lab(other)) : '') : '')}${row(`Saudara (${sib.length})`, more(sib, 8))}${row(`Anak (${kids.length})`, more(kids, 10))}
    ${anc.length ? `<div class="detail" style="grid-column:span 2"><span>Garis leluhur</span><div class="rchips anc">${anc.map((x, i) => (i ? '<span class="rarr">›</span>' : '') + chip(x)).join('')}<span class="rarr">›</span><span class="rme">${esc(first(m.name))}</span></div></div>` : ''}
    <div class="detail"><span>Status Arisan</span><b>${m.active ? '✓ Aktif' : 'Nonaktif'}</b></div><div class="detail"><span>Iuran Bulan Ini</span><b style="font-size:12px">Arisan ${paid ? '✓' : '✗'} · Wajib ${paidW ? '✓' : '✗'}</b></div>
    <div class="detail" style="grid-column:span 2"><span>Riwayat iuran</span><b style="font-size:12px;line-height:1.8">Arisan: ${hl(1)}<br>Wajib: ${hl(2)}</b></div>
    <div class="detail" style="grid-column:span 2"><span>Menang arisan</span><b>${hist.wins.map(w => MONTH(w.period)).join(', ') || 'Belum pernah'}</b></div></div>
  <div class="pbtns"><button class="primary" onclick="goTree(${id})">🌳 Lihat di pohon</button><button class="ghost" onclick="highlightLine(${id})">🧬 Sorot garis keturunan</button>${u && (u.kids.length || u.refs.length) ? `<button class="ghost" onclick="goBranch(${u.id})">⤢ Fokus cabang</button>` : ''}</div>
  ${adm(`<div class="pbtns"><button class="ghost" onclick="addChild(${id})">＋ Anak</button><button class="ghost" onclick="addSpouse(${id})">＋ Pasangan</button><button class="ghost" onclick="openPhotoEditor(${id})">📷 Foto</button><button class="ghost" onclick="editMember(${id})">✎ Ubah</button></div>`)}`;
  $('#profileModal').classList.add('show'); hydratePhotos($('#profileBox'));
}
function goMembers(g, st) { showPage('anggota'); setTimeout(() => { if (g) $('#mj').value = g; if (st) $('#ms').value = st; drawMembers(); }, 400); }
const fillMarital = guard(async () => {
  if (!confirm('Tandai “Belum menikah” untuk semua anggota yang statusnya masih kosong dan tidak punya pasangan tercatat?\n\nYang sebenarnya janda/duda/cerai bisa diubah manual setelahnya.')) return;
  const n = await api('fill', 'POST'); toast(`✓ ${n} anggota ditandai Belum menikah`); reload();
});

// ---------- Direktori anggota ----------
let MLIMIT = 100;
R.anggota = async () => {
  MEMBERS = await api('members'); famOf(); MLIMIT = 100;
  $('#anggota').innerHTML = hero('Anggota Keluarga', `${MEMBERS.length} anggota — direktori, status pernikahan, pasangan, dan status arisan.`) + `<div class="toolbar"><input class="search" id="mq" placeholder="Cari nama anggota..." oninput="MLIMIT=100;drawMembers()">
  <select class="select" id="mg" onchange="MLIMIT=100;drawMembers()"><option value="">Semua generasi</option>${Array.from({ length: FAM.stats.maxGen }, (_, i) => `<option value="${i + 1}">Generasi ${i + 1}</option>`).join('')}</select>
  <select class="select" id="mj" onchange="MLIMIT=100;drawMembers()"><option value="">Semua jenis kelamin</option><option value="L">♂ Laki-laki</option><option value="P">♀ Perempuan</option><option value="?">Belum diisi</option></select>
  <select class="select" id="ms" onchange="MLIMIT=100;drawMembers()"><option value="">Semua status nikah</option><option value="belum_menikah">Belum menikah</option><option value="menikah">Menikah</option><option value="cerai">Cerai</option><option value="cerai_mati">Duda / Janda</option><option value="-">Belum diisi</option></select>
  ${adm('<button class="primary" onclick="addMember()">＋ Anggota</button><button class="ghost" onclick="openImport()">⇪ Impor CSV</button>')}</div>
  <div class="card"><div class="tscroll"><table class="table"><thead><tr><th>Nama</th><th>Status</th><th>Pasangan</th><th>Orang tua</th><th>Gen</th><th>Tahun</th><th>Arisan</th><th></th></tr></thead><tbody id="memberTable"></tbody></table></div><div id="mmore" class="mmore"></div></div>`;
  drawMembers();
};
function drawMembers() {
  const q = $('#mq').value.toLowerCase(), g = $('#mg').value, j = $('#mj').value, s = $('#ms').value;
  const res = MEMBERS.filter(m => m.name.toLowerCase().includes(q) && (!g || FAM.gen.get(m.id) == g) && (!j || (j === '?' ? !m.gender : m.gender === j)) && (!s || (s === '-' ? !FAM.mar.get(m.id).k : FAM.mar.get(m.id).k === s)));
  $('#memberTable').innerHTML = res.slice(0, MLIMIT).map(m => {
    const sp = spousesOf(m.id), p = FAM.byId.get(m.parent_id), st = FAM.mar.get(m.id);
    return `<tr><td><span class="mcell g-${gCls(m)}">${avHtml(m, 's', 'sm')}<span><b>${esc(m.name)}</b>${m.death_year ? ' †' : ''}<br><small class="muted">${esc(m.relation || '')}</small></span></span></td><td>${st.t ? `<em class="st st-${st.k} big">${st.t}</em>` : '<small class="muted">—</small>'}</td><td>${sp.map(x => `<a class="lnk" onclick="openProfile(${x.id})">${esc(x.name)}</a>`).join(', ') || '—'}</td><td>${p ? `<a class="lnk" onclick="openProfile(${p.id})">${esc(p.name)}</a>` : '—'}</td><td>${FAM.gen.get(m.id)}</td><td>${esc(yrs(m).replace('Lahir ', '') || '—')}</td><td><span class="status ${m.active ? '' : 'pending'}">${m.active ? 'Aktif' : 'Nonaktif'}</span></td><td><button class="btn-s" onclick="openProfile(${m.id})">Detail</button></td></tr>`;
  }).join('') || '<tr><td colspan="8">Tidak ada data</td></tr>';
  $('#mmore').innerHTML = res.length > MLIMIT ? `<button class="ghost" onclick="MLIMIT+=100;drawMembers()">Tampilkan 100 lagi (${res.length - MLIMIT} tersisa)</button>` : `<small class="muted">${res.length} anggota</small>`;
  hydratePhotos($('#memberTable'));
}

// ---------- Impor CSV ----------
const TPL = 'kode;nama;jk;status_nikah;kode_ortu;kode_pasangan;status_pasangan;lahir;wafat;hubungan;telepon\nA1;H. Santoso;L;menikah;;A2;menikah;1938;2015;Kakek;\nA2;Hj. Aminah;P;menikah;;;;1942;;Nenek;\nA3;Budi Santoso;L;menikah;A1;A4;menikah;1965;;Anak;081234567890\nA4;Sri Wahyuni;P;menikah;;;;1968;;Menantu;\nA5;Andi Pratama;L;belum menikah;A3;;;1992;;Cucu;\n';
const KEYS = { kode: 'kode', id: 'kode', nama: 'nama', name: 'nama', jk: 'gender', jenis_kelamin: 'gender', kelamin: 'gender', gender: 'gender', kode_ortu: 'kode_ortu', ortu: 'kode_ortu', orang_tua: 'kode_ortu', kode_orang_tua: 'kode_ortu', parent: 'kode_ortu', kode_pasangan: 'kode_pasangan', pasangan: 'kode_pasangan', spouse: 'kode_pasangan', status_pasangan: 'status_pasangan', status: 'status_pasangan', lahir: 'lahir', tahun_lahir: 'lahir', birth: 'lahir', wafat: 'wafat', tahun_wafat: 'wafat', meninggal: 'wafat', hubungan: 'hubungan', relation: 'hubungan', telepon: 'telepon', hp: 'telepon', no_hp: 'telepon', phone: 'telepon', status_nikah: 'marital', status_pernikahan: 'marital', pernikahan: 'marital', marital: 'marital' };
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, ''); const head = text.split(/\r?\n/)[0] || '', d = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === d) { r.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; } else c += ch;
  }
  r.push(c); if (r.some(x => x.trim())) rows.push(r); return rows;
}
const normM = v => { v = String(v || '').trim().toLowerCase().replace(/[_-]+/g, ' '); if (!v) return ''; if (/^(belum|lajang|single|bujang|perawan)/.test(v)) return 'belum_menikah'; if (/^(cerai mati|duda|janda|wafat)/.test(v)) return 'cerai_mati'; if (/^cerai/.test(v)) return 'cerai'; if (/^(menikah|kawin|nikah|married)/.test(v)) return 'menikah'; return '!'; };
const normG = v => { v = String(v || '').trim().toLowerCase(); return ['l', 'laki', 'laki-laki', 'laki laki', 'pria', 'm', 'male'].includes(v) ? 'L' : ['p', 'perempuan', 'wanita', 'f', 'female'].includes(v) ? 'P' : v ? '!' : ''; };
function readCsv(text) {
  const t = parseCsv(text); if (t.length < 2) return { rows: [], errs: ['File kosong atau tidak ada baris data.'] };
  const cols = t[0].map(h => KEYS[h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] || null), errs = [], rows = [], codes = new Set();
  if (!cols.includes('nama')) return { rows: [], errs: ['Kolom "nama" tidak ditemukan pada baris judul.'] };
  t.slice(1).forEach((cells, i) => {
    const o = {}; cols.forEach((k, j) => { if (k) o[k] = (cells[j] || '').trim(); }); const n = i + 2;
    if (!o.nama) return errs.push(`Baris ${n}: nama kosong`);
    const g = normG(o.gender); if (g === '!') errs.push(`Baris ${n}: jenis kelamin "${o.gender}" tidak dikenali (pakai L atau P)`); o.gender = g === '!' ? '' : g;
    const mm = normM(o.marital); if (mm === '!') errs.push(`Baris ${n}: status nikah "${o.marital}" tidak dikenali (belum menikah / menikah / cerai / cerai mati)`); o.marital_status = mm === '!' ? '' : mm; delete o.marital;
    for (const f of ['lahir', 'wafat']) if (o[f] && !/^\d{4}$/.test(o[f])) errs.push(`Baris ${n}: ${f} harus 4 digit tahun`);
    if (o.kode) { if (codes.has(o.kode)) errs.push(`Baris ${n}: kode "${o.kode}" dipakai dua kali`); codes.add(o.kode); }
    const sp = (o.status_pasangan || '').toLowerCase(); o.status_pasangan = sp.startsWith('cerai') ? 'cerai' : 'menikah'; rows.push(o);
  });
  rows.forEach((o, i) => { for (const f of ['kode_ortu', 'kode_pasangan']) if (o[f] && !codes.has(o[f])) errs.push(`Baris ${i + 2}: ${f} "${o[f]}" tidak ada di kolom kode`); });
  if (rows.length > 2000) errs.push('Maksimal 2000 baris per impor — pecah file menjadi beberapa bagian.');
  return { rows, errs };
}
function openImport() {
  $('#fTitle').textContent = 'Impor anggota dari CSV';
  $('#fForm').innerHTML = `<p class="imp-note">Siapkan data di Excel/Google Sheets, simpan sebagai <b>CSV</b>. Hubungkan orang tua &amp; pasangan lewat kolom <b>kode</b> (bebas, mis. A1, A2). Generasi dihitung otomatis. Jika ada satu baris yang salah, <b>seluruh impor dibatalkan</b> sehingga data tidak setengah masuk.</p>
  <div class="row"><button type="button" class="ghost" id="impTpl">⇩ Unduh template</button><label class="ghost filebtn">Pilih file CSV<input id="impFile" type="file" accept=".csv,text/csv,text/plain" hidden></label></div>
  <div id="impPrev" class="imp-prev"></div><div class="row"><button type="button" class="ghost" onclick="closeForm()">Batal</button><button class="primary" id="impGo" disabled>Impor</button></div>`;
  let rows = [];
  $('#impTpl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + TPL], { type: 'text/csv' })); a.download = 'template-anggota.csv'; a.click(); };
  $('#impFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const res = readCsv(await f.text()); rows = res.rows;
    const L = rows.filter(r => r.gender === 'L').length, P = rows.filter(r => r.gender === 'P').length, rel = rows.filter(r => r.kode_ortu || r.kode_pasangan).length;
    $('#impPrev').innerHTML = res.errs.length ? `<div class="imp-err"><b>${res.errs.length} masalah ditemukan</b> — perbaiki file lalu pilih ulang:<ul>${res.errs.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${res.errs.length > 8 ? `<em>+${res.errs.length - 8} lainnya</em>` : ''}</div>` : `<div class="imp-ok">✓ <b>${rows.length}</b> baris siap diimpor — ♂ ${L} · ♀ ${P} · ${rows.filter(r => r.marital_status === 'belum_menikah').length} belum menikah${rows.length - L - P ? ` · ${rows.length - L - P} tanpa jenis kelamin` : ''} · ${rel} baris punya hubungan keluarga</div>`;
    $('#impGo').disabled = !!res.errs.length || !rows.length;
  };
  $('#fForm').onsubmit = guard(async e => { e.preventDefault(); const b = $('#impGo'); b.disabled = true; b.textContent = 'Mengimpor…'; try { const n = await api('import', 'POST', { rows }); closeForm(); MEMBERS = []; toast(`✓ ${n} anggota berhasil diimpor`); reload(); } catch (err) { b.disabled = false; b.textContent = 'Impor'; throw err; } });
  $('#formModal').classList.add('show');
}
