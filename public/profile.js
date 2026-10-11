// ============================================================
// Profil Keluarga v2.9 — tampilan halaman profil ala Facebook
//   Sampul + foto profil besar • kolom "Intro" (alamat, lahir, status, HP) • tab Keluarga / Tentang / Arisan
//   Keluarga ditampilkan sebagai kotak foto (seperti daftar teman) — klik untuk berpindah profil
// ============================================================
const HAS_ADDR = () => !MEMBERS.length || 'address' in MEMBERS[0];          // kolom alamat ada di database (patch-008)?
const waLink = p => { const d = String(p || '').replace(/\D/g, ''); return d.length < 8 ? '' : 'https://wa.me/' + (d.startsWith('0') ? '62' + d.slice(1) : d); };
const mapLink = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

const tile = (x, lbl) => `<button class="ftile g-${gCls(x)}${x.death_year ? ' dead' : ''}" onclick="openProfile(${x.id})" title="${esc(x.name)}">${avHtml(x, 's', 'tl')}<b>${esc(x.name)}${x.death_year ? ' †' : ''}</b><small>${esc(lbl || '')}</small></button>`;
const tiles = (arr, f, n = 18) => arr.length ? `<div class="ftiles">${arr.slice(0, n).map(f).join('')}</div>${arr.length > n ? `<div class="rmore">+${arr.length - n} lagi</div>` : ''}` : '';
const sect = (title, count, body, empty) => `<section class="fbp-sec"><h3>${title}${count != null ? ` <small>${count}</small>` : ''}</h3>${body || `<p class="fbp-empty">${empty}</p>`}</section>`;
const irow = (ic, html) => html ? `<div class="irow"><span class="ic">${ic}</span><div>${html}</div></div>` : '';
const dl = rows => `<dl class="fbp-dl">${rows.filter(r => r[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

async function openProfile(id) {
  await ensureMembers(); const m = FAM.byId.get(id); if (!m) return;
  const hist = await api('history/' + id), cur = new Date().toISOString().slice(0, 7), paid = hist.pays.some(x => x.period === cur && x.fee_type_id === 1), paidW = hist.pays.some(x => x.period === cur && x.fee_type_id === 2), hl = t => hist.pays.filter(x => x.fee_type_id === t).slice(0, 12).map(x => '✓ ' + MONTH(x.period).slice(0, 3) + ' ' + x.period.slice(2, 4)).join(' · ') || 'Belum ada';
  const par = FAM.byId.get(m.parent_id), u = FAM.unitOf.get(id), sp = spousesOf(id), kids = childrenOf(id), pU = par && FAM.unitOf.get(par.id), age = ageOf(m), stt = FAM.mar.get(id);
  const sibAll = pU ? MEMBERS.filter(x => pU.members.some(pm => pm.id === x.parent_id) && !pU.members.some(pm => pm.id === x.id)).sort((a, b) => (a.birth_year || 9999) - (b.birth_year || 9999) || a.id - b.id) : [], sib = sibAll.filter(x => x.id !== id);
  const lab = x => x.gender === 'L' ? 'Ayah' : x.gender === 'P' ? 'Ibu' : 'Orang tua', other = par && pU.members.length === 2 ? pU.members.find(x => x.id !== par.id) : null;
  const nth = par && sibAll.length > 1 ? `Anak ke-${sibAll.findIndex(x => x.id === id) + 1} dari ${sibAll.length} bersaudara` : '';
  const anc = []; for (let x = par, g = 0; x && g < 12; x = FAM.byId.get(x.parent_id), g++) anc.unshift(x);
  const edges = sp.map(s => { const c = FAM.st.get(Math.min(id, s.id) + '-' + Math.max(id, s.id)) === 'cerai'; return c ? `Cerai dengan ${esc(s.name)}` : s.death_year ? `Menikah dengan almarhum ${esc(s.name)} (wafat ${s.death_year})` : `Menikah dengan ${esc(s.name)}`; });
  const grad = m.gender === 'L' ? 'linear-gradient(135deg,#6f95ff,#4b7bff)' : m.gender === 'P' ? 'linear-gradient(135deg,#ff8fc0,#ec5f9a)' : 'linear-gradient(135deg,#9aa4b8,#7a8499)';
  const gid = FAM.gen.get(id), hasPhone = m.phone && m.phone !== 'DEMO', wa = hasPhone ? waLink(m.phone) : '', addr = (m.address || '').trim(), canAddr = HAS_ADDR();
  const sibLbl = x => older(x, m) > 0 ? 'Kakak' : older(x, m) < 0 ? 'Adik' : 'Saudara';
  const spLbl = x => { const ex = FAM.st.get(Math.min(id, x.id) + '-' + Math.max(id, x.id)) === 'cerai'; return (ex ? 'Mantan ' : '') + (x.gender === 'L' ? 'suami' : x.gender === 'P' ? 'istri' : 'pasangan'); };
  const kidLbl = x => x.birth_year ? `Lahir ${x.birth_year}` : 'Anak';
  const addrHtml = addr ? `<span class="addr">${esc(addr)}</span> <a class="maplink" href="${mapLink(addr)}" target="_blank" rel="noopener">🗺 Buka di peta ↗</a>`
    : canAddr ? `<span class="fbp-empty">Alamat belum diisi</span> ${adm(`<button class="btn-s" onclick="editMember(${id})">＋ Tambah alamat</button>`)}`
      : adm('<span class="fbp-empty">Fitur alamat belum aktif — jalankan <b>supabase/patch-008-alamat.sql</b> di SQL Editor.</span>');
  const sideStat = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;

  const intro = `<aside class="fbp-intro"><h3>Intro</h3>
    ${irow('🏠', canAddr || addr ? `<small>Alamat</small>${addrHtml}` : addrHtml)}
    ${irow('🎂', m.birth_year ? `<small>${m.death_year ? 'Lahir' : 'Lahir · usia'}</small>${m.birth_year}${!m.death_year && age != null ? ` · <b>${age} tahun</b>` : ''}` : '')}
    ${irow('🕊', m.death_year ? `<small>Wafat</small>${m.death_year}${age != null ? ` · usia ${age} tahun` : ''}` : '')}
    ${irow('💍', stt.t ? `<small>Status pernikahan</small><em class="st st-${stt.k || 'x'} big">${stt.t}</em>${edges.length ? `<div class="sub">${edges.join('<br>')}</div>` : ''}` : '')}
    ${irow('📞', hasPhone ? `<small>HP / WhatsApp</small>${esc(m.phone)}${wa ? ` <a class="maplink" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp ↗</a>` : ''}` : '')}
    ${irow('👪', nth ? `<small>Urutan</small>${nth}` : '')}
    ${irow('🧬', `<small>Kedudukan</small>${esc(relLabel(m))}${gid ? ` · Generasi ${gid}` : ''}`)}
    ${irow('🗓', m.joined ? `<small>Anggota sejak</small>${m.joined}` : '')}
    <div class="istats">${sideStat(kids.length, 'Anak')}${sideStat(sib.length, 'Saudara')}${sideStat(u ? u.descA || 0 : 0, 'Keturunan')}</div>
  </aside>`;

  const famPane = `<div data-pane="fam"><div class="detail-grid">${relProfile(m)}</div>
    ${sect('Orang tua', null, par ? `<div class="ftiles">${tile(par, lab(par))}${other ? tile(other, lab(other)) : ''}</div>` : '', par === undefined || !par ? (kinOf(m).k === 'menantu' ? 'Keluarga asal belum dicatat.' : 'Orang tua belum dicatat.') : '')}
    ${sect(u && u.members.length > 2 ? 'Pasangan (lebih dari satu)' : 'Pasangan', sp.length || null, tiles(sp, x => tile(x, spLbl(x))), 'Tidak ada pasangan tercatat.')}
    ${sect('Anak', kids.length, tiles(kids, x => tile(x, kidLbl(x))), 'Belum ada anak tercatat.')}
    ${sib.length ? sect('Saudara', sib.length, tiles(sib, x => tile(x, sibLbl(x)))) : ''}
    ${anc.length ? `<section class="fbp-sec"><h3>${kinOf(m).k === 'menantu' ? 'Garis leluhur (keluarga asal)' : 'Garis leluhur'}</h3><div class="rchips anc">${anc.map((x, i) => (i ? '<span class="rarr">›</span>' : '') + chip(x)).join('')}<span class="rarr">›</span><span class="rme">${esc(first(m.name))}</span></div></section>` : ''}</div>`;

  const aboutPane = `<div data-pane="abt" hidden>
    <section class="fbp-sec"><h3>Informasi dasar</h3>${dl([['Nama lengkap', esc(m.name) + (m.death_year ? ' †' : '')], ['Jenis kelamin', m.gender === 'L' ? '♂ Laki-laki' : m.gender === 'P' ? '♀ Perempuan' : ''], ['Tahun lahir', m.birth_year || ''], ['Tahun wafat', m.death_year || ''], ['Usia', age != null ? age + ' tahun' + (m.death_year ? ' (saat wafat)' : '') : ''], ['Generasi', gid || ''], ['Keterangan', esc(m.relation || '')], ['Anggota sejak', m.joined || '']])}</section>
    <section class="fbp-sec"><h3>Kontak &amp; alamat</h3>${dl([['HP / WhatsApp', hasPhone ? esc(m.phone) + (wa ? ` <a class="maplink" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp ↗</a>` : '') : ''], ['Alamat', addr ? `<span class="addr">${esc(addr)}</span> <a class="maplink" href="${mapLink(addr)}" target="_blank" rel="noopener">🗺 Buka di peta ↗</a>` : '']])}${!hasPhone && !addr ? `<p class="fbp-empty">Belum ada kontak atau alamat. ${adm(`<button class="btn-s" onclick="editMember(${id})">✎ Lengkapi data</button>`)}</p>` : ''}</section>
    <section class="fbp-sec"><h3>Pernikahan &amp; posisi dalam silsilah</h3><div class="detail-grid"><div class="detail" style="grid-column:span 2"><span>Status pernikahan</span><b>${stt.t ? `<em class="st st-${stt.k || 'x'} big">${stt.t}</em>` : 'Belum diisi'}</b>${edges.length ? `<div class="rtxt">${edges.join(' · ')}</div>` : ''}</div>${kinBlock(m)}</div></section></div>`;

  const arsPane = `<div data-pane="ars" hidden><section class="fbp-sec"><h3>Arisan &amp; iuran</h3><div class="detail-grid">
    <div class="detail"><span>Status Arisan</span><b>${m.active ? '✓ Aktif' : 'Nonaktif'}</b></div><div class="detail"><span>Iuran Bulan Ini</span><b style="font-size:12px">Arisan ${paid ? '✓' : '✗'} · Wajib ${paidW ? '✓' : '✗'}</b></div>
    <div class="detail" style="grid-column:span 2"><span>Riwayat iuran</span><b style="font-size:12px;line-height:1.8">Arisan: ${hl(1)}<br>Wajib: ${hl(2)}</b></div>
    <div class="detail" style="grid-column:span 2"><span>Menang arisan</span><b>${hist.wins.map(w => MONTH(w.period)).join(', ') || 'Belum pernah'}</b></div></div></section></div>`;

  $('#profileBox').className = 'modal-box fbp-box';
  $('#profileBox').innerHTML = `<div class="fbp-cover cv-${gCls(m)}"><div class="cvbg"${m.photo_path ? ` data-pp="${esc(m.photo_path)}" data-sz="l"` : ''}></div><div class="cvtag">Profil Keluarga</div><button class="close fbp-x" onclick="closeProfile()" aria-label="Tutup">×</button></div>
  <div class="fbp-head"><div class="pavw"><div class="pav" style="background:${grad}"${m.photo_path ? ` data-pp="${esc(m.photo_path)}" data-sz="l"` : ''}>${esc(ini(m.name))}</div>${adm(`<button class="pcam" onclick="openPhotoEditor(${id})" title="${m.photo_path ? 'Ganti' : 'Tambah'} foto">📷</button>`)}</div>
    <div class="fbp-id"><h2>${esc(m.name)}${m.death_year ? ' †' : ''}</h2><p class="prel">${esc(relLabel(m))}</p>
      <p class="fbp-sub">${m.gender ? (m.gender === 'L' ? '♂ Laki-laki' : '♀ Perempuan') : 'Jenis kelamin belum diisi'}${gid ? ' · Generasi ' + gid : ''}${m.death_year ? ` · Wafat ${m.death_year}` : age != null ? ` · ${age} tahun` : ''}${m.relation ? ' · ' + esc(m.relation) : ''}</p></div>
    <div class="fbp-act"><button class="primary" onclick="goTree(${id})">🌳 Lihat di pohon</button><button class="ghost" onclick="highlightLine(${id})">🧬 Sorot leluhur &amp; keturunan</button>${u && (u.kids.length || u.refs.length) ? `<button class="ghost" onclick="goBranch(${u.id})">⤢ Cabang ini</button>` : ''}${adm(`<button class="ghost" onclick="editMember(${id})">✎ Ubah</button>`)}</div></div>
  ${adm(`<div class="fbp-adm"><span>Tambah cepat:</span><button class="btn-s" onclick="addChild(${id})">＋ Anak</button><button class="btn-s" onclick="addSpouse(${id})">＋ Pasangan</button>${!m.parent_id ? `<button class="btn-s" onclick="addParent(${id})">＋ Orang tua</button>` : ''}<button class="btn-s" onclick="openPhotoEditor(${id})">📷 Foto</button></div>`)}
  <div class="fbp-tabs" role="tablist"><button class="on" data-pt="fam" role="tab">👪 Keluarga</button><button data-pt="abt" role="tab">ℹ️ Tentang</button><button data-pt="ars" role="tab">💰 Arisan &amp; iuran</button></div>
  <div class="fbp-body">${intro}<main class="fbp-main">${famPane}${aboutPane}${arsPane}</main></div>`;
  $('#profileBox').scrollTop = 0; $('#profileModal').classList.add('show'); hydratePhotos($('#profileBox'));
}
