# SekolahHub 2.15.0 → 2.16.0: menutup kebocoran privasi (audit #15)

## Masalah
Uraian kas turunan iuran memuat nama siswa ("Iuran mingguan · Budi · Mg 1 Nov 2026"). Akun Siswa boleh membaca seluruh kas kelas, jadi lewat API mereka bisa mengetahui siapa yang sudah atau belum membayar iuran. Penyamaran di tampilan (v2.14.10) tidak cukup.

## Perbaikan
| Lapisan | Perubahan |
|---|---|
| Aplikasi (`data.js`) | `toRow()` membuang nama dari uraian baris `iu_*` sebelum dikirim dan sebelum dibandingkan dengan snapshot. Catatan kas manual tidak disentuh. |
| Aplikasi (`app.js`) | `enrichKas()` memasang nama kembali **hanya di memori staf** (dari tabel iuran + siswa). Tampilan, cetak, dan CSV staf tidak berubah. Tidak dijalankan untuk akun Siswa / Orang tua. |
| Database (`017_privasi_kas_iuran.sql`) | Membersihkan nama pada data lama, dan memasang trigger `kas_ket_privasi` yang membuang nama pada setiap INSERT/UPDATE baris `iu_*` (melindungi dari klien/cache lama). |
| Uji | `privasi_test.js`, `enrich_test.js` (Node), `supabase/tests/privasi_check.sql` (SQL). |

## Urutan pasang
1. Deploy aplikasi v2.16.0 (aman tanpa migrasi; data lama tetap memuat nama sampai migrasi dijalankan).
2. **Staging dulu:** jalankan migrasi 017, lalu `privasi_check.sql` (hasil lulus berupa pesan di error terakhir).
3. Jalankan di produksi. Backup dulu lewat Pengaturan > Data & cadangan.

## Batas
- **SQL belum diuji di Postgres** (tidak tersedia di lingkungan pengembangan); regex memakai sintaks Postgres standar. Uji di staging.
- Cadangan lama (sebelum 2.16) yang dipulihkan tetap aman: trigger membuang nama saat dimasukkan.
- Catatan kas **manual** yang Anda tulis sendiri bisa memuat nama; jangan menulis nama siswa di sana.
