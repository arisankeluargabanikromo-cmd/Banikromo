# SekolahHub 2.14.10 → 2.15.0

## Yang berubah
| Area | Perubahan | Berkas |
|---|---|---|
| Kinerja | `saldo()` kini berindeks (Map per siswa, dibangun sekali per perubahan). Sebelumnya O(siswa × transaksi) per render. Hasil identik dengan hitungan lama (diuji 5.000 transaksi). Cache dibatalkan otomatis oleh `Data.push`, rollback, dan pull. | app.js, data.js |
| Keamanan perangkat | **Kunci otomatis** saat tidak aktif (bawaan 20 menit, peringatan 60 detik, lalu keluar). Aktivitas di tab lain dihitung. Atur per perangkat: `localStorage['sh.idle']='30'` (menit; `0` = nonaktif). | pro.js |
| Ketahanan | Banner **offline**, pemberitahuan **versi baru** (tombol Muat ulang), penangkap galat global dengan pesan ramah (jejak teknis hanya di konsol). | pro.js, pro.css |
| Aksesibilitas | Tautan "Lewati ke konten utama", `aria-live` pada toast, nama dialog otomatis, cincin fokus papan ketik, hormati `prefers-reduced-motion`. | pro.js, pro.css |
| Produktivitas | Pintasan: `?` bantuan, `g` lalu `d/t/k/i/l/s/a` pindah menu (mengikuti hak akses peran). | pro.js |
| Tampilan | Angka keuangan `tabular-nums` agar kolom sejajar; sentuhan fokus/seleksi; banner disembunyikan saat cetak. | pro.css |
| Rilis | Versi 2.15.0 di package.json, sw.js, Pengaturan; `npm test` menjalankan 3 uji Node. | |

## Pengujian
- `npm test`: data_test, import_test, saldo_test (baru) lulus.
- `tests_node/pro_test.js` (butuh `npm i jsdom`): skip link, aria-live, pintasan, bantuan, banner offline, galat global, peringatan + logout otomatis lulus.
- **Belum diuji:** tampilan di peramban sungguhan (tata letak banner/panel di mobile) dan SQL. Tidak ada migrasi baru di rilis ini.

## Cara pasang
Timpa folder lama dengan isi paket ini, lalu deploy seperti biasa. Service worker akan memperbarui cache otomatis (nama cache berganti).
