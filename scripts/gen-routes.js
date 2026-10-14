// Membuat salinan index.html untuk setiap alamat menu (public/arisan/index.html, dst.).
// Tujuannya: refresh / link langsung (mis. /arisan) tetap berhasil di hosting statis APA PUN,
// bahkan bila aturan rewrite di vercel.json tidak terbaca (salah Root Directory, dll.).
// Semua aset di index.html memakai alamat absolut ("/style.css"), jadi salinan aman di folder bertingkat.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');
const ROUTES = ['arisan', 'silsilah', 'anggota', 'keuangan', 'agenda', 'galeri', 'pengumuman', 'laporan',
  'pengguna', 'pengguna/kelola', 'pengguna/iuran', 'pengaturan', 'password', 'dashboard'];
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
for (const r of ROUTES) {
  const dir = path.join(PUB, r);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
console.log(`rute dibuat: ${ROUTES.length} alamat menu`);
module.exports = { ROUTES };
