// ===== Fitur lanjutan: album foto (Supabase Storage), pengingat WhatsApp, manajemen pengguna =====
const BUCKET = 'photos';

// ---------- Foto ----------
async function signed(paths) {                       // bucket privat → URL bertanda tangan (berlaku 1 jam)
  if (!paths.length) return {};
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) { toast(error.message); return {}; }
  return Object.fromEntries(data.map(x => [x.path, x.signedUrl]));
}
async function resize(file, max = 1600) {           // perkecil di browser agar hemat kuota (maks 1600px, JPEG 82%)
  const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .82));
}
R.galeri = async () => {
  const [al, ph] = await Promise.all([api('albums'), api('photos')]); CACHE.al = al;
  const cover = {}, cnt = {}; ph.forEach(p => { cnt[p.album_id] = (cnt[p.album_id] || 0) + 1; if (!cover[p.album_id]) cover[p.album_id] = p.path; });
  const u = await signed(Object.values(cover));
  $('#galeri').innerHTML = hero('Dokumentasi Keluarga', 'Kenangan keluarga tersimpan rapi dalam album.') + `${adm('<div class="toolbar"><button class="primary" onclick="addAlbum()">＋ Album</button></div>')}<div class="grid4">${al.map(a => { const c = u[cover[a.id]]; return `<div class="card album" style="cursor:pointer;${c ? `background:linear-gradient(#0000 40%,#000b),url('${c}') center/cover;color:#fff` : ''}" onclick="openAlbum(${a.id})"><div>${c ? '' : esc(a.emoji)}<small>${esc(a.title)} · ${cnt[a.id] || 0} foto</small></div>${adm(`<button class="btn-s x" onclick="event.stopPropagation();edit(AL,'al',${a.id})">Ubah</button>`)}</div>`; }).join('')}</div>`;
};
const openAlbum = guard(async id => {
  const a = CACHE.al.find(x => x.id === id), { data, error } = await sb.from('photos').select('*').eq('album_id', id).order('id', { ascending: false });
  if (error) return toast(error.message);
  window._ph = data; window._phu = await signed(data.map(p => p.path));
  $('#galeri').innerHTML = hero(esc(a.emoji + ' ' + a.title), data.length + ' foto') + `<div class="toolbar"><button class="primary" onclick="R.galeri()">← Semua album</button>${adm(`<label class="primary">＋ Unggah foto<input type="file" accept="image/*" multiple hidden onchange="uploadPhotos(${id},this.files)"></label>`)}</div>` +
    (data.length ? `<div class="pgrid">${data.map((p, i) => `<div class="pthumb" onclick="lightbox(${i})"><img loading="lazy" alt="" src="${window._phu[p.path] || ''}"></div>`).join('')}</div>` : '<div class="card" style="padding:30px;text-align:center">Belum ada foto di album ini.</div>');
});
const uploadPhotos = guard(async (id, files) => {
  let ok = 0, n = files.length;
  for (const f of [...files]) {
    try {
      toast(`Mengunggah ${ok + 1} dari ${n}…`);
      const blob = await resize(f), path = `${id}/${crypto.randomUUID()}.jpg`, up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const ins = await sb.from('photos').insert({ album_id: id, path }); if (ins.error) { await sb.storage.from(BUCKET).remove([path]); throw ins.error; }
      ok++;
    } catch (e) { toast('Gagal mengunggah ' + f.name + ': ' + (e.message || 'format tidak didukung')); await new Promise(r => setTimeout(r, 1800)); }
  }
  toast(ok + ' foto terunggah'); openAlbum(id);
});
function lightbox(i) {
  let el = $('#lb'); if (!el) { el = document.createElement('div'); el.id = 'lb'; el.className = 'lb'; document.body.appendChild(el); }
  const ph = window._ph, show = k => { i = (k + ph.length) % ph.length; el.innerHTML = `<img alt="" src="${window._phu[ph[i].path]}"><div class="lbbar"><button data-d="-1">‹</button><span>${i + 1} / ${ph.length}</span><button data-d="1">›</button>${isA() ? '<button data-d="x" class="danger">Hapus</button>' : ''}<button data-d="c">✕</button></div>`; };
  el.onclick = e => { const k = e.target.dataset.d; if (k === 'c' || e.target === el) el.classList.remove('show'); else if (k === 'x') delPhoto(ph[i]); else if (k) show(i + +k); };
  document.onkeydown = e => { if (!el.classList.contains('show')) return; if (e.key === 'Escape') el.classList.remove('show'); if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); };
  show(i); el.classList.add('show');
}
const delPhoto = guard(async p => {
  if (!confirm('Hapus foto ini?')) return;
  const d = await sb.from('photos').delete().eq('id', p.id); if (d.error) return toast(d.error.message);   // baris dulu; berkas yatim lebih aman daripada baris tanpa berkas
  await sb.storage.from(BUCKET).remove([p.path]);
  $('#lb').classList.remove('show'); toast('Foto dihapus'); openAlbum(p.album_id);
});

// ---------- Pengingat WhatsApp ----------
const waNum = p => { let n = String(p || '').replace(/\D/g, ''); if (n.startsWith('0')) n = '62' + n.slice(1); else if (n.startsWith('8')) n = '62' + n; return n.length >= 10 ? n : ''; };
// wa() & waGroup() kini ada di finance.js (mendukung dua jenis iuran + tunggakan)

// ---------- Manajemen pengguna (admin) ----------
titles.pengguna = 'Akun & Pengguna';
// Isi tab "Kelola Pengguna" (khusus admin). Kerangka halaman & tab ada di account.js
async function usersAdminHtml() {
  try { await ensureMembers(); } catch (e) { }   // daftar anggota untuk menghubungkan akun
  const all = await api('users'), pend = all.filter(u => u.approved === false), us = all.filter(u => u.approved !== false), cnt = r => us.filter(u => u.role === r).length;
  CACHE.pend = pend; CACHE.users = us; PENDING_N = pend.length; { const d = $('#notifDot'); if (d) d.hidden = !PENDING_N; }   // sinkronkan titik notifikasi
  const RC = [['admin', '👑', 'Admin', 'Akses penuh: keuangan, arisan & pengocokan, agenda, pengumuman, album, pengaturan, pengguna, serta anggota & silsilah.'],
    ['pengelola', '🌳', 'Pengelola Silsilah', 'Mengelola <b>anggota & silsilah</b>: tambah/ubah anggota, hubungan keluarga, foto profil, impor CSV, dan leluhur. Juga bisa melihat semua data. Tidak menyentuh keuangan, arisan, atau pengaturan.'],
    ['viewer', '👁', 'Viewer', 'Hanya melihat seluruh data keluarga. Peran awal setiap pendaftar baru.']];
  const opt = (u, v, l) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`;
  const pendHtml = pend.length ? `<div class="card pend-card"><div class="card-head"><h3>⏳ Menunggu persetujuan</h3><span>${pend.length} PENDAFTAR</span></div><div style="padding:0 20px 8px"><button class="btn-s d" onclick="rejectAll()">Tolak semua (${pend.length})</button></div><p class="st-note" style="margin:0 20px 8px">Orang-orang ini sudah mendaftar tetapi <b>belum bisa melihat data apa pun</b> sampai Anda menyetujuinya. Tolak bila Anda tidak mengenalnya.</p><table class="table"><thead><tr><th>Nama</th><th>Email</th><th>Mendaftar</th><th>Peran</th><th></th></tr></thead><tbody>${pend.map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${u.created_at ? ft(u.created_at) : '—'}</td><td><select class="select" id="apr_${esc(u.id)}"><option value="viewer">Viewer</option><option value="pengelola">Pengelola Silsilah</option><option value="admin">Admin</option></select></td><td style="white-space:nowrap"><button class="btn-s" onclick="approveUser('${esc(u.id)}')">Setujui</button> <button class="btn-s d" onclick="rejectUser('${esc(u.id)}')">Tolak</button></td></tr>`).join('')}</tbody></table></div>` : '';
  const auditHtml = `<div class="card" id="auditCard"><div class="card-head"><h3>Jejak audit</h3><span>PERUBAHAN PENTING</span></div><div id="auditBody" style="padding:0 20px 20px"><p class="st-note" style="margin:0 0 10px">Mencatat perubahan buku kas, pembatalan pembayaran, perubahan tarif iuran, serta peran/persetujuan pengguna — lengkap dengan nilai lama dan baru. Tidak bisa diubah atau dihapus dari aplikasi.</p><button class="btn-s" onclick="loadAudit(this)">Tampilkan 50 catatan terbaru</button></div></div>`;
  return pendHtml + `<div class="roles">${RC.map(([k, ic, t, d]) => `<div class="card role-card r-${k}"><div class="rc-h"><span class="rc-i">${ic}</span><div><b>${t}</b><small>${cnt(k)} pengguna</small></div></div><p>${d}</p></div>`).join('')}</div>
    <div class="card"><div class="card-head"><h3>Daftar pengguna</h3><span>${us.length} AKUN</span></div><table class="table"><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Anggota keluarga</th><th>Aksi</th></tr></thead><tbody>${us.map(u => `<tr><td><b>${esc(u.name)}</b>${ME && u.email === ME.username ? ' <span class="pg-you">Anda</span>' : ''}</td><td>${esc(u.email)}</td><td><select class="select" onchange="setRole('${u.id}',this.value)">${opt(u, 'admin', 'Admin')}${opt(u, 'pengelola', 'Pengelola Silsilah')}${opt(u, 'viewer', 'Viewer')}</select></td><td>${memberSel(u, us)}</td><td>${ME && u.email === ME.username ? `<button class="btn-s" aria-label="Ubah pengguna" onclick="editUser('${esc(u.id)}')">Ubah</button> <span class="muted" title="Akun yang sedang dipakai tidak bisa dihapus">—</span>` : `<button class="btn-s" aria-label="Ubah pengguna" onclick="editUser('${esc(u.id)}')">Ubah</button> <button class="btn-s d" aria-label="Hapus pengguna" onclick="deleteUser('${esc(u.id)}')">Hapus</button>`}</td></tr>`).join('')}</tbody></table></div>
    ${auditHtml}
    <p class="st-note">Password pengguna lain tidak dapat dilihat atau diubah dari sini. Jika ada yang lupa password, ia bisa menggantinya sendiri di tab <b>Akun Saya</b> setelah masuk, atau admin mengatur ulang lewat dashboard Supabase (Authentication → Users).</p>`;
}
// Pilihan anggota untuk menghubungkan akun (satu anggota = satu akun). Hanya id & nama anggota; semua di-escape.
const memberSel = (u, us) => {
  const taken = new Set(us.filter(x => x.id !== u.id && x.member_id).map(x => x.member_id)), ms = [...(MEMBERS || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  return `<select class="select" aria-label="Hubungkan ke anggota" onchange="linkMember('${esc(u.id)}',this.value)"><option value="">— belum dihubungkan —</option>${ms.map(m => `<option value="${+m.id}" ${u.member_id === m.id ? 'selected' : ''} ${taken.has(m.id) ? 'disabled' : ''}>${esc(m.name)}${taken.has(m.id) ? ' (sudah terhubung)' : ''}</option>`).join('')}</select>`;
};
const linkMember = async (id, v) => { try { await api('users/link', 'POST', { id, member_id: v ? +v : null }); toast(v ? 'Akun dihubungkan ke anggota' : 'Hubungan akun dilepas'); } catch (e) { } reload(); };
const approveUser = async id => { const sel = document.getElementById('apr_' + id); try { await api('users/approve', 'POST', { id, role: sel ? sel.value : 'viewer' }); toast('Akun disetujui'); } catch (e) { } reload(); };
// Nama pendaftar TIDAK pernah disisipkan ke atribut HTML (hanya id) — mencegah XSS tersimpan.
const rejectAll = async () => { const n = (CACHE.pend || []).length; if (!n || !confirm(`Tolak dan hapus SEMUA ${n} pendaftar yang menunggu? Akun mereka akan dihapus.`)) return; try { const c = await api('users/reject_all', 'POST'); toast(`${c} pendaftaran ditolak`); } catch (e) { } reload(); };
const rejectUser = async id => { const u = (CACHE.pend || []).find(x => x.id === id); if (!confirm(`Tolak dan hapus pendaftaran "${u ? u.name : 'ini'}"? Akunnya akan dihapus.`)) return; try { await api('users/reject', 'POST', { id }); toast('Pendaftaran ditolak'); } catch (e) { } reload(); };
// Ubah pengguna: nama, peran, dan hubungan ke anggota dalam satu form. Hanya bagian yang berubah yang dikirim ke server.
const editUser = id => {
  const us = CACHE.users || [], u = us.find(x => x.id === id); if (!u) return;
  const taken = new Set(us.filter(x => x.id !== id && x.member_id).map(x => x.member_id));
  const ms = [...(MEMBERS || [])].filter(m => !taken.has(m.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'id')).map(m => [m.id, m.name]);
  const f = [{ k: 'info', t: 'note', l: `Email: <b>${esc(u.email)}</b> (email & password dikelola lewat Supabase → Authentication → Users)` },
    { k: 'name', l: 'Nama', req: 1 }, { k: 'role', l: 'Peran', t: 'select', o: [['admin', 'Admin'], ['pengelola', 'Pengelola Silsilah'], ['viewer', 'Viewer']] },
    { k: 'member_id', l: 'Anggota keluarga', t: 'pick', o: ms }];
  openForm('Ubah Pengguna', f, { name: u.name, role: u.role, member_id: u.member_id || '' }, async b => {
    const name = String(b.name || '').trim(); if (!name) { toast('Nama tidak boleh kosong'); throw 0; }
    const mem = b.member_id === '' ? null : +b.member_id;
    if (b.role !== u.role) await api('users/' + id, 'PUT', { role: b.role });
    if (mem !== (u.member_id || null)) await api('users/link', 'POST', { id, member_id: mem });
    if (name !== u.name) await api('users/rename', 'POST', { id, name });
  });
};
// Hapus akun pengguna yang sudah aktif. Hanya id yang masuk ke atribut HTML; nama diambil dari CACHE saat konfirmasi.
const deleteUser = async id => {
  const u = (CACHE.users || []).find(x => x.id === id); if (!u) return;
  if (!confirm(`Hapus pengguna \"${u.name}\" (${u.email})?\n\nAkun ini tidak akan bisa masuk lagi dan tindakan ini tidak dapat dibatalkan. Data keluarga (anggota, iuran, kas) tidak ikut terhapus.`)) return;
  try { await api('users/delete', 'POST', { id }); toast('Pengguna dihapus'); } catch (e) { } reload();
};
const AUD_T = { transactions: 'Buku kas', payments: 'Pembayaran iuran', fee_types: 'Jenis iuran', profiles: 'Pengguna' }, AUD_O = { INSERT: 'Ditambah', UPDATE: 'Diubah', DELETE: 'Dihapus' };
const audVal = v => v == null ? '—' : String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 40);
function audRow(a) {
  const o = a.old_row || {}, n = a.new_row || {}, nm = n.description || o.description || n.name || o.name || o.receipt_no || ('#' + a.row_id);
  let det = '';
  if (a.op === 'UPDATE') det = Object.keys(n).filter(k => JSON.stringify(n[k]) !== JSON.stringify(o[k])).slice(0, 4).map(k => `${k}: ${audVal(o[k])} → ${audVal(n[k])}`).join(' · ');
  else if (o.amount != null || n.amount != null) det = rp(o.amount ?? n.amount);
  return `<tr><td style="white-space:nowrap">${ft(a.at)}</td><td>${esc(a.actor_name || 'sistem')}</td><td><span class="status ${a.op === 'DELETE' ? 'bad' : 'done'}">${esc(AUD_O[a.op] || a.op)}</span> ${esc(AUD_T[a.tbl] || a.tbl)}</td><td><b>${esc(nm)}</b>${det ? `<br><small class="muted">${esc(det)}</small>` : ''}</td></tr>`;
}
const loadAudit = async btn => {
  btn.disabled = true; btn.textContent = 'Memuat…';
  try {
    const rows = await api('users/audit', 'GET', { limit: 50 });
    $('#auditBody').innerHTML = rows.length ? `<div class="tscroll"><table class="table"><thead><tr><th>Waktu</th><th>Oleh</th><th>Kejadian</th><th>Rincian</th></tr></thead><tbody>${rows.map(audRow).join('')}</tbody></table></div>` : '<p class="st-note">Belum ada catatan.</p>';
  } catch (e) { btn.disabled = false; btn.textContent = 'Tampilkan 50 catatan terbaru'; }
};
const setRole = async (id, role) => { try { await api('users/' + id, 'PUT', { role }); toast('Peran diperbarui'); } catch (e) { } reload(); };
// Sinkronkan warna bilah browser (mobile) dengan tema + beri tooltip menu saat sidebar hanya ikon
const syncTheme = () => { const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = document.body.classList.contains('dark') ? '#101426' : '#ffffff'; };
const _tt = toggleTheme; toggleTheme = () => { _tt(); syncTheme(); }; syncTheme();
const _boot = boot; boot = () => {
  $('#navUsersTx').textContent = isA() ? 'Akun & Pengguna' : 'Akun Saya';       // semua peran punya halaman akun
  document.querySelectorAll('.nav button').forEach(b => { b.title = b.querySelector('span:last-child').textContent; });
  _boot();
  const sc = document.querySelector('.side-scroll'), fade = () => sc.classList.toggle('more', sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4);
  sc.addEventListener('scroll', fade); addEventListener('resize', fade); setTimeout(fade, 50);
};
