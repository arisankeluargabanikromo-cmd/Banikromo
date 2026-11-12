# SekolahHub 2.23.x → 2.24.0: Tampilan Tugas Kelas lebih profesional

Hanya tampilan (`js/tugas.js`, `css/tugas.css`). Wewenang, database, dan migrasi tidak berubah; tidak ada migrasi baru.

- **Tata letak dua kolom di desktop:** daftar siswa/catatan di kiri, panel ringkasan di kanan (tanggal atau minggu, progres, tombol aksi). Di ponsel menjadi satu kolom dengan ringkasan di atas dan bar simpan absensi di atas navigasi bawah.
- **Kepala halaman:** kelas dan jabatan sebagai label; daftar wewenang dipindah ke dialog "Lihat wewenang" agar halaman tidak penuh teks.
- **Tab bergaris bawah** yang bisa digeser di ponsel (label "Pengumuman" menggantikan "Pengumuman & Agenda"; pilihan Pengumuman/Agenda ada di dalam tab).
- **Absensi:** avatar inisial, satu kontrol segmen per siswa (H/S/I/A, di layar lebar tertulis penuh), garis warna status di tepi baris, bar progres dan hitungan per status, tombol simpan menampilkan jumlah perubahan.
- **Iuran:** angka "Terkumpul" besar dengan progres, penyaring Semua/Belum lunas/Lunas, status "Belum bayar" berwarna netral (bukan merah), "Catat" lebih ringan, "Batalkan" sebagai tautan.
- **Kas:** saldo besar, formulir dengan pilihan Pengeluaran/Pemasukan dan awalan "Rp", meter batas harian, catatan dengan ikon masuk/keluar.
- Mode gelap, fokus keyboard, target sentuh 44 px, dan pengurangan gerak (prefers-reduced-motion) diperhatikan.

Diuji di Chromium (desktop 1366 px dan ponsel 390 px, terang dan gelap) dengan data contoh; alur ketua dan bendahara dijalankan ulang dan lulus; `npm test` lulus. Safari dan Firefox belum dicoba.
