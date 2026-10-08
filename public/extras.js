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
  const r = await sb.storage.from(BUCKET).remove([p.path]); if (r.error) return toast(r.error.message);
  const d = await sb.from('photos').delete().eq('id', p.id); if (d.error) return toast(d.error.message);
  $('#lb').classList.remove('show'); toast('Foto dihapus'); openAlbum(p.album_id);
});

// ---------- Pengingat WhatsApp ----------
const waNum = p => { let n = String(p || '').replace(/\D/g, ''); if (n.startsWith('0')) n = '62' + n.slice(1); else if (n.startsWith('8')) n = '62' + n; return n.length >= 10 ? n : ''; };
// wa() & waGroup() kini ada di finance.js (mendukung dua jenis iuran + tunggakan)

// ---------- Manajemen pengguna (admin) ----------
titles.pengguna = 'Pengguna';
R.pengguna = async () => {
  const us = await api('users');
  $('#pengguna').innerHTML = hero('Pengguna & Hak Akses', 'Admin dapat mengubah data; viewer hanya melihat. Anggota baru mendaftar lewat halaman login.') + `<div class="card"><table class="table"><thead><tr><th>Nama</th><th>Email</th><th>Peran</th></tr></thead><tbody>${us.map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td><select class="select" onchange="setRole('${u.id}',this.value)"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option><option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option></select></td></tr>`).join('')}</tbody></table></div>`;
};
const setRole = async (id, role) => { try { await api('users/' + id, 'PUT', { role }); toast('Peran diperbarui'); } catch (e) { } reload(); };
// Sinkronkan warna bilah browser (mobile) dengan tema + beri tooltip menu saat sidebar hanya ikon
const syncTheme = () => { const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = document.body.classList.contains('dark') ? '#101426' : '#ffffff'; };
const _tt = toggleTheme; toggleTheme = () => { _tt(); syncTheme(); }; syncTheme();
const _boot = boot; boot = () => {
  $('#navUsers').style.display = isA() ? '' : 'none';
  document.querySelectorAll('.nav button').forEach(b => { b.title = b.querySelector('span:last-child').textContent; });
  _boot();
  const sc = document.querySelector('.side-scroll'), fade = () => sc.classList.toggle('more', sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4);
  sc.addEventListener('scroll', fade); addEventListener('resize', fade); setTimeout(fade, 50);
};
