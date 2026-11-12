# Laporan Audit SekolahHub v2.14.9 → v2.14.10

Cakupan: 15 berkas JS, 16 migrasi/skema SQL, konfigurasi Vercel/SW. Metode: baca kode penuh, uji otomatis (Node + mock Supabase, decode QR dengan OpenCV).
**Belum diuji:** SQL (tidak ada Postgres di lingkungan audit) dan UI di peramban. Uji migrasi 016 di proyek staging dulu.

## Diperbaiki

| # | Tingkat | Berkas | Masalah | Perbaikan |
|---|---|---|---|---|
| 1 | Tinggi | data.js | Snapshot diperbarui sebelum server menerima perubahan. Bila simpan gagal (offline/ditolak), baris itu tidak pernah dikirim ulang: data hilang diam-diam. Terbukti di uji. | `rollback()` mengembalikan snapshot baris yang gagal |
| 2 | Tinggi | data.js | Baris buku besar dikirim dalam urutan array. Pembatalan bisa terkirim sebelum transaksi asal, penarikan sebelum setoran (id acak) → ditolak trigger. Terbukti di uji. Memicu kegagalan pemulihan cadangan. | Urutan: kredit, debit, pembatalan debit, pembatalan kredit |
| 3 | Tinggi | app.js, bank.js | Saat offline, `pull()` ikut gagal tanpa penanganan; transaksi "ditolak" bisa dicoba ulang sebelum rollback selesai (risiko ganda) | `onError` tahan galat; `commit()` menunggu rollback (`Data.rb`) |
| 4 | Tinggi | import.js | "Urungkan impor" memulihkan snapshot seluruh koleksi → ikut menghapus data yang dicatat orang lain sesudahnya; bagi pengurus ditolak server | Urungkan hanya baris hasil impor; disembunyikan bagi non-admin pada buku besar |
| 5 | Tinggi | import.js | Mode "Perbarui" iuran melakukan UPDATE yang selalu ditolak trigger; iuran yang sudah dibatalkan dianggap masih ada | Iuran selalu "Lewati" di mode buku besar; deteksi memakai saldo bersih |
| 6 | Sedang | import.js | Tabungan/Iuran/Kas tidak divalidasi terhadap tutup buku, tanggal masa depan, saldo mengendap, saldo kas minus → satu baris buruk menggagalkan paket 300 baris | Validasi di pratinjau (diuji) |
| 7 | Sedang | pengaturan.js | Tahun ajaran baru: siswa "Lulus" bersaldo dihapus beserta ledger-nya (tidak seperti Hapus siswa yang memblokir) | Diblokir sampai Tutup rekening |
| 8 | Sedang | pengaturan.js | Pulihkan cadangan menimpa `tutup_buku` dari berkas lama (membuka buku tanpa jejak) | Tutup buku dipertahankan + peringatan |
| 9 | Sedang | supabase | Baris kas `iu_*` melewati semua penjaga trigger; id ditentukan klien, sehingga pengurus bisa menghindari batas saldo kas/tutup buku | Migrasi 016 (juga di schema.sql) |
| 10 | Sedang | bank.js | Ekspor CSV mutasi O(n²·log n): peramban membeku pada data besar | Saldo berjalan dihitung sekali |
| 11 | Sedang | app.js | Gagal memuat data → layar kosong dengan toast 2 detik | Layar galat + "Coba lagi"/"Keluar" |
| 12 | Rendah | app.js | `<option value>`/checkbox tidak di-escape (XSS tersimpan lewat nama kelas, pengurus → admin) | `esc()` |
| 13 | Rendah | app.js, pengaturan.js | File foto/logo lama dihapus sebelum simpan sukses → tautan putus bila gagal | Hapus setelah sukses |
| 14 | Rendah | app.js | Setoran massal (jalur lama) tanpa validasi tanggal kosong; hash `#constructor` merender `[object Object]`; CSV tidak memblokir awalan tab/CR | Diperbaiki |
| 15 | Rendah | siswa.js | Akun Siswa melihat nama siswa lain pada baris kas turunan iuran (bertentangan dengan dokumentasi migrasi 011) | Nama disamarkan di tampilan (lihat catatan) |
| 16 | Rendah | pengaturan.js, sw.js | Versi di UI 2.14.1 vs rilis 2.14.9 | Disinkronkan 2.14.10 |

## Diverifikasi tanpa masalah
Encoder QR (8/8 decode OpenCV, v1–v3); struktur Code128; sintaks seluruh JS; RLS, `approve_account`, `beri_suara` (kunci baris, rahasia suara), trigger buku besar 013 (kunci advisory, validasi pembatalan).

## Perlu keputusan pemilik (tidak diubah)
1. **Kebocoran privasi tingkat API (#15):** kolom `kas.ket` turunan iuran memuat nama; RLS `kas_siswa` mengizinkan akun Siswa membaca semuanya. Penyamaran di UI bukan perlindungan penuh. Opsi: hilangkan nama dari `ket` dan tampilkan nama di sisi klien dari data iuran (hanya terlihat staf).
2. **Akun pertama otomatis admin:** tutup pendaftaran publik di Supabase (Auth > Providers > Email) setelah admin dibuat.
3. **Pemulihan cadangan:** `voting.suara` tidak ikut dipulihkan (sengaja, migrasi 015); tautan wali/siswa dan berkas foto tidak ada di cadangan.
4. **Kinerja:** `saldo()` dihitung ulang per siswa per render (O(siswa×transaksi)); aman untuk satu kelas, lambat untuk ribuan siswa/puluhan ribu transaksi.
5. **schema.sql tidak idempoten** (`create policy` tanpa `drop`); jalankan sekali pada proyek baru.
6. `config.js` berisi URL & anon key proyek nyata (aman dipublikasikan, dilindungi RLS), tetapi sebaiknya diganti dengan placeholder di repositori publik.

## Pengujian
`data_test.js` (urutan, tanpa kirim ulang, rollback baris & konfigurasi, hapus siswa), `import_test.js` (validasi tutup buku, saldo mengendap, saldo kas). Versi lama gagal pada uji urutan dan rollback.
