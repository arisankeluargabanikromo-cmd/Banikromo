// ============================================================
// Form Anggota bergaya "Profil Keluarga" (v3.17.0)
//   Sampul + foto besar + nama (ikut berubah saat mengetik) • tab Data diri / Keluarga / Kontak & alamat
//   • panel Ringkasan langsung + indikator kelengkapan • bilah simpan melekat di bawah.
//   Memakai ulang: memberFields() & saveMember() (members.js), fieldHtml()/readForm() (app.js), gaya fbp-* (silsilah-ux.css).
// ============================================================
let MF = null;                                                   // form yang sedang terbuka: { dirty() }

const MF_HALF = new Set(['gender', 'relation', 'birth_year', 'death_year', 'joined', 'active']);
const MF_LBL = {                                                 // label singkat + teks bantuan (label panjang lama dipecah)
  name: ['Nama lengkap', ''],
  gender: ['Jenis kelamin', 'Menentukan warna profil & pohon'],
  relation: ['Hubungan / keterangan', 'Mis. Anak, Menantu, Cucu'],
  birth_year: ['Tahun lahir', 'Contoh: 1975'],
  death_year: ['Tahun wafat', 'Kosongkan jika masih hidup'],
  joined: ['Anggota sejak (tahun)', ''],
  active: ['Status arisan', 'Nonaktif = tidak ikut kocokan & tidak ditagih iuran'],
  marital_status: ['Status pernikahan', ''],
  spouse_id: ['Pasangan (suami / istri)', 'Isi bila menikah atau pernah menikah'],
  parent_id: ['Orang tua (ayah atau ibu)', 'Untuk menantu, isi bila keluarga asalnya (besan) ingin dicatat'],
  phone: ['No. HP / WhatsApp', 'Contoh: 0812xxxxxxx'],
  address: ['Alamat lengkap', 'Jalan, RT/RW, desa/kelurahan, kota'],
};
const MF_TABS = [                                                // [id, judul tab, [[judul bagian, [kolom…]]…]]
  ['id', '🪪 Data diri', [['Identitas', ['name', 'gender', 'relation']], ['Tahun', ['birth_year', 'death_year']], ['Keanggotaan arisan', ['joined', 'active', '#note']]]],
  ['fam', '👪 Keluarga', [['Pernikahan', ['marital_status', 'spouse_id']], ['Keluarga asal', ['parent_id']]]],
  ['ctc', '📞 Kontak & alamat', [['Kontak', ['phone']], ['Alamat', ['address']]]],
];
const mfGrad = g => g === 'L' ? 'linear-gradient(135deg,#6f95ff,#4b7bff)' : g === 'P' ? 'linear-gradient(135deg,#ff8fc0,#ec5f9a)' : 'linear-gradient(135deg,#9aa4b8,#7a8499)';

// Dipanggil closeProfile(): true = boleh menutup.
function mfGuard() {
  if (!MF) return true;
  if (MF.dirty() && !confirm('Perubahan belum disimpan. Tutup tanpa menyimpan?')) return false;
  MF = null; return true;
}

async function openMemberForm(id, vals) {
  await ensureMembers();
  const m = id ? FAM.byId.get(id) : null, box = $('#profileBox');
  const fields = memberFields(m).map(f => MF_LBL[f.k] ? { ...f, l: MF_LBL[f.k][0] + (f.req ? ' <b class="mf-req">*</b>' : ''), h: MF_LBL[f.k][1], half: MF_HALF.has(f.k) ? 1 : 0 } : f);
  const byK = Object.fromEntries(fields.filter(f => f.k).map(f => [f.k, f])), notes = fields.filter(f => f.t === 'note');
  const sec = ([title, keys]) => {
    const fs = keys.filter(k => k !== '#note').map(k => byK[k]).filter(Boolean), nt = keys.includes('#note') ? notes : [];
    return fs.length || nt.length ? `<section class="fbp-sec"><h3>${title}</h3><div class="mf-grid">${fs.map(f => fieldHtml(f, vals[f.k])).join('')}${nt.map(f => fieldHtml(f)).join('')}</div></section>` : '';
  };
  const gradNow = m ? mfGrad(m.gender) : mfGrad(vals.gender);
  const canDel = !!id && isA();

  box.className = 'modal-box fbp-box mf-box';
  box.innerHTML = `<div class="fbp-cover cv-${gCls({ gender: vals.gender || (m && m.gender) })}" id="mfCover"><div class="cvbg"${m && m.photo_path ? ` data-pp="${esc(m.photo_path)}" data-sz="l"` : ''}></div><div class="cvtag">${id ? '✎ Ubah Profil' : '＋ Anggota Baru'}</div><button type="button" class="close fbp-x" onclick="closeProfile()" aria-label="Tutup">×</button></div>
  <div class="fbp-head"><div class="pavw"><div class="pav" id="mfAv" style="background:${gradNow}"${m && m.photo_path ? ` data-pp="${esc(m.photo_path)}" data-sz="l"` : ''}>${esc(ini(vals.name || '?'))}</div>${id ? mgr(`<button type="button" class="pcam" onclick="openPhotoEditor(${id})" title="${m.photo_path ? 'Ganti' : 'Tambah'} foto">📷</button>`) : ''}</div>
    <div class="fbp-id"><h2 id="mfName">${esc(vals.name || 'Anggota baru')}</h2><p class="prel">${id ? esc(relLabel(m)) : 'Isi data di bawah, lalu simpan'}</p><p class="fbp-sub" id="mfSub"></p></div></div>
  <div class="fbp-tabs" role="tablist">${MF_TABS.map((t, i) => `<button type="button" class="${i ? '' : 'on'}" data-pt="${t[0]}" role="tab">${t[1]}</button>`).join('')}</div>
  <form class="fbp-body mf" id="mfForm" novalidate>
    <aside class="fbp-intro"><h3>Ringkasan</h3><div id="mfSum"></div>
      <div class="mf-comp"><div class="mf-comp-top"><span>Kelengkapan data</span><b id="mfCompTx"></b></div><div class="mf-comp-bg"><i id="mfCompBar"></i></div><small id="mfCompHint"></small></div>
      ${id ? '' : '<p class="fbp-empty mf-photo-note">📷 Foto profil dapat ditambahkan setelah anggota disimpan.</p>'}</aside>
    <main class="fbp-main">${MF_TABS.map((t, i) => `<div data-pane="${t[0]}"${i ? ' hidden' : ''}>${t[2].map(sec).join('')}</div>`).join('')}</main>
    <div class="mf-foot"><span class="mf-dirty" id="mfDirty" hidden>● Perubahan belum disimpan</span><span class="mf-sp"></span>${canDel ? '<button type="button" class="danger" id="mfDel">Hapus anggota</button>' : ''}<button type="button" class="ghost" id="mfCancel">Batal</button><button class="primary" id="mfSave">${id ? 'Simpan perubahan' : 'Simpan anggota'}</button></div>
  </form>`;

  const form = $('#mfForm'), val = k => form.elements[k] ? form.elements[k].value.trim() : '';
  const selTx = k => { const el = form.elements[k]; return el && el.tagName === 'SELECT' && el.value ? el.options[el.selectedIndex].text : ''; };
  const snap = () => JSON.stringify([...new FormData(form).entries()]);
  const base = snap();
  MF = { dirty: () => snap() !== base };

  const paint = () => {                                          // header, ringkasan, kelengkapan — diperbarui setiap kali mengetik
    const name = val('name'), g = val('gender'), by = +val('birth_year') || null, dy = +val('death_year') || null, nowY = new Date().getFullYear();
    const age = by ? (dy || nowY) - by : null, ms = selTx('marital_status'), sp = val('spouse_id'), pa = val('parent_id'), ph = val('phone'), ad = val('address');
    $('#mfName').textContent = (name || 'Anggota baru') + (dy ? ' †' : '');
    const av = $('#mfAv'); av.firstChild.nodeValue = ini(name || '?'); if (!(m && m.photo_path)) av.style.background = mfGrad(g);
    $('#mfCover').className = `fbp-cover cv-${gCls({ gender: g })}`;
    $('#mfSub').textContent = [g === 'L' ? '♂ Laki-laki' : g === 'P' ? '♀ Perempuan' : 'Jenis kelamin belum dipilih', dy ? `Wafat ${dy}` : age != null ? `${age} tahun` : '', val('relation')].filter(Boolean).join(' · ');
    $('#mfSum').innerHTML = [
      irow('🎂', by ? `<small>${dy ? 'Lahir' : 'Lahir · usia'}</small>${by}${!dy && age != null ? ` · <b>${age} tahun</b>` : ''}` : ''),
      irow('🕊', dy ? `<small>Wafat</small>${dy}${age != null ? ` · usia ${age} tahun` : ''}` : ''),
      irow('💍', ms ? `<small>Status pernikahan</small>${esc(ms)}${sp ? `<div class="sub">Pasangan: ${esc(sp)}</div>` : ''}` : ''),
      irow('👪', pa ? `<small>Orang tua</small>${esc(pa)}` : ''),
      irow('📞', ph ? `<small>HP / WhatsApp</small>${esc(ph)}` : ''),
      irow('🏠', ad ? `<small>Alamat</small>${esc(ad.length > 90 ? ad.slice(0, 90) + '…' : ad)}` : ''),
      form.elements.active ? irow('💰', `<small>Arisan</small>${+form.elements.active.value ? '✓ Aktif' : 'Nonaktif'}`) : '',
    ].join('') || '<p class="fbp-empty">Ringkasan akan muncul saat Anda mengisi data.</p>';
    const need = [['Nama', name], ['Jenis kelamin', g], ['Tahun lahir', by], ['Status pernikahan', val('marital_status')], ['HP', ph], ...(HAS_ADDR() ? [['Alamat', ad]] : [])], got = need.filter(x => x[1]), pct = Math.round(got.length / need.length * 100), miss = need.filter(x => !x[1]).map(x => x[0]);
    $('#mfCompTx').textContent = pct + '%'; $('#mfCompBar').style.width = pct + '%'; $('#mfCompBar').className = pct >= 80 ? 'ok' : pct >= 50 ? 'mid' : '';
    $('#mfCompHint').textContent = miss.length ? 'Belum diisi: ' + miss.join(', ') : 'Data sudah lengkap 👍';
    $('#mfDirty').hidden = !MF || !MF.dirty();
  };
  form.addEventListener('input', paint); form.addEventListener('change', paint); paint();

  // kolom wajib yang kosong di tab tersembunyi: pindah ke tab-nya & tandai (tanpa ini, validasi browser gagal diam-diam)
  const showTab = pane => { box.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('on', x.dataset.pt === pane)); box.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== pane; }); };
  const firstBad = () => [...form.querySelectorAll('[required]')].find(el => !el.value.trim());

  $('#mfCancel').onclick = () => { if (!mfGuard()) return; id ? openProfile(id) : closeProfile(); };
  const del = $('#mfDel'); if (del) del.onclick = guard(async () => {
    if (!confirm(`Hapus ${m.name}? Tindakan ini tidak bisa dibatalkan.`)) return;
    await api('members/' + id, 'DELETE'); MF = null; closeProfile(); toast('Dihapus'); MEMBERS = []; await ensureMembers(); reload();
  });
  form.onsubmit = async e => {
    e.preventDefault(); const bad = firstBad();
    if (bad) { showTab(bad.closest('[data-pane]').dataset.pane); bad.focus(); bad.classList.add('mf-bad'); toast('Lengkapi kolom yang wajib diisi'); return; }
    const btn = $('#mfSave'), label = btn.textContent; let ok = false; btn.disabled = true; btn.textContent = 'Menyimpan…';
    await guard(async () => { await saveMember(id, readForm(form, fields)); ok = true; })();
    if (!ok) { btn.disabled = false; btn.textContent = label; return; }                // pesan galat sudah ditampilkan api()/saveMember
    MF = null; toast('✓ Tersimpan'); MEMBERS = []; await ensureMembers(); reload(); id ? openProfile(id) : closeProfile();
  };
  form.addEventListener('input', e => e.target.classList.remove('mf-bad'));

  $('#profileBox').scrollTop = 0; $('#profileModal').classList.add('show'); hydratePhotos(box);
  if (!id) setTimeout(() => { const n = form.elements.name; if (n) n.focus(); }, 60);
}

// openProfile membuka tampilan profil biasa → form dianggap selesai
{ const _op = openProfile; openProfile = async id => { MF = null; return _op(id); }; }
// Esc = Batal (dengan konfirmasi bila ada perubahan)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MF && $('#profileModal').classList.contains('show')) { const c = $('#mfCancel'); if (c) c.click(); } });
