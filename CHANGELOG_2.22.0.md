# SekolahHub 2.21.0 → 2.22.0: Tampilan akun Orang tua sama persis dengan akun Siswa

## Yang berubah
Akun **Orang tua** sekarang memakai tampilan, menu, dan halaman yang **sama** dengan akun **Siswa** (`js/siswa.js`): Beranda dengan kartu pelajar dan ringkasan analitik, Tabungan (rekening koran), Kas Kelas, Iuran, Pengingat, Data Siswa, Struktur Kelas, Absensi, Agenda, Pengumuman, Voting, dan Akun Saya. Sebelumnya orang tua hanya punya Portal, Pengumuman, dan Agenda dengan tampilan lama.

Diuji di Chromium dengan data contoh (desktop 1366 px dan ponsel 390 px): untuk anak yang sama, HTML 10 halaman (Beranda, Tabungan, Kas, Iuran, Pengingat, Siswa, Struktur, Absensi, Agenda, Pengumuman) dan menu samping **identik** antara akun Siswa dan akun Orang tua.

## Dua perbedaan yang sengaja dipertahankan
1. **Beberapa anak.** Siswa hanya tertaut ke satu siswa, orang tua bisa ke beberapa. Bila anak lebih dari satu, muncul **pemilih anak** (chip nama) di atas halaman; seluruh halaman menampilkan anak yang dipilih, dan pilihan diingat per akun di perangkat. Dengan satu anak, pemilih tidak muncul sehingga tampilan persis sama.
2. **Voting hanya-lihat.** Pemberian suara tetap hanya untuk akun Siswa (satu siswa satu suara, rahasia). Orang tua melihat daftar kandidat, status, dan hasil setelah ditutup, tanpa tombol pilih. Bila orang tua boleh memberi suara atas nama anak, aturan "satu akun satu suara" dan rahasia suara perlu dirancang ulang.

Teks sebagian halaman ("Ringkasan Anda", "Status Anda") tetap memakai kata "Anda" seperti di akun Siswa, agar tampilan sama persis.

## Database: migrasi 019 (WAJIB dijalankan)
Tanpa migrasi ini, menu Kas Kelas dan Struktur Kelas di akun Orang tua kosong, nama pengurus tampil "Siswa lain", dan Voting kosong. Tampilan lain (Tabungan, Iuran, Absensi, Agenda, Pengumuman, profil) sudah berfungsi karena RLS lama.
- Policy baca `kas_portal` dan `struktur_portal` untuk peran `siswa` dan `ortu` (menggantikan `kas_siswa` dan `struktur_siswa`).
- `rekan_kelas()` dan `voting_siswa()` mencakup peran `ortu` (kelas gabungan semua anak). `saya` selalu kosong untuk orang tua.
- `beri_suara()` **tidak diubah**: tetap khusus Siswa. Tabel `voting` tetap tidak terbaca langsung oleh orang tua.
- Jalankan `supabase/migrations/019_portal_ortu_setara_siswa.sql` di SQL Editor (setelah 011 dan 015). Instalasi baru: sudah ada di akhir `schema.sql`. Lalu jalankan `supabase/tests/portal_ortu_check.sql`.

## Konsekuensi privasi yang perlu Anda setujui
Orang tua sekarang membaca **seluruh Kas Kelas** (pemasukan dan pengeluaran kelas, uraian iuran sudah tanpa nama siswa sejak migrasi 017) dan **struktur pengurus**, sama seperti siswa. Data pribadi, tabungan, iuran, dan absensi anak lain tetap tertutup. Bila kas tidak boleh dilihat orang tua, hapus `'ortu'` dari policy `kas_portal` (dan hapus menu `kas` dari tampilan orang tua).

## Berkas yang berubah
`js/app.js` (PORTAL_OK, vw, navOk, notifikasi, nama menu), `js/siswa.js` (pemilih anak, voting hanya-lihat), `js/data.js` (`Data.portal()`, voting dan rekan untuk orang tua), `js/mobile.js`, `js/akun.js` (sambutan), `js/akunsaya.js`, `js/pengaturan.js` (matriks hak akses + 2 baris baru), `css/siswa.css`, `sw.js`, `package.json`, `tests_node/akses_test.js`, `supabase/` (migrasi 019, schema, tes), `tools/visual/fake.js`.

## Belum diuji
- Migrasi 019 belum dijalankan di Postgres/Supabase sungguhan; tampilan diuji dengan klien Supabase palsu. Uji dengan akun orang tua sungguhan (satu anak dan dua anak, beda kelas) di staging.
- Orang tua dengan anak di kelas berbeda: rekap voting dan struktur memuat gabungan kelas; belum dicoba dengan data nyata.
- Safari dan Firefox belum dicoba.
