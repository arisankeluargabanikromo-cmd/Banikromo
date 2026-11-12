# SekolahHub 2.19.0 → 2.20.0: Perapihan tampilan

Semua temuan di bawah diperoleh dari **tangkapan layar nyata** (Chromium headless, data contoh) di desktop 1366 px dan ponsel 390 px, mode terang dan gelap, untuk peran admin, siswa, dan orang tua.

## Yang diperbaiki
| Masalah yang terlihat | Perbaikan |
|---|---|
| **Akun Saya berantakan**: isi kartu mengalir sejajar satu baris. Penyebab: nama kelas `.akn` bentrok dengan `.akn` milik baris akun di `akun.js` (flex-row). | Kelas diganti `.aks-*` (css/akunsaya.css). Halaman didesain ulang: kartu profil dengan avatar inisial dan lencana peran, bagian berikon (Profil, Keamanan, Tampilan, Aplikasi), dua kolom di desktop dan satu kolom di ponsel. |
| **Bilah alat desktop membungkus**: tombol utama (Setor / Tarik, Catat kas) jatuh sendirian ke baris kedua di Tabungan dan Kas. | Jarak dan padding tombol diringkas, lebar pencarian/pilihan disesuaikan: kini satu baris di 1366 px (Tabungan, Kas, Iuran, Siswa, Absensi). |
| **Placeholder pencarian terpotong** ("…no. rekenin"). | Teks dipersingkat: "Cari nama, NIS, atau rekening". |
| **Grafik batang terlalu tinggi** di Kas dan Iuran (371 px) dengan huruf membesar, sehingga tabel terdorong jauh ke bawah. | Lebar `viewBox` grafik batang disesuaikan di layar ≥1100 px: tinggi 236 px, huruf proporsional. Dashboard dan ponsel tidak berubah. |
| Pilihan bulat/kotak (absensi, formulir) memakai warna bawaan peramban. | `accent-color` mengikuti warna tema. |

## Yang diperiksa dan sudah baik (tidak diubah)
Dashboard, Tabungan, Kas, Iuran, Data Siswa, Absensi, Laporan, Pengaturan, Portal Siswa dan Orang tua, menu ponsel, tema terang dan gelap.

## Perkakas baru
`tools/visual/`: server data contoh + klien Supabase palsu + pemotret layar, agar tampilan dapat diperiksa ulang setiap rilis (lihat README di sana).

## Batas
- Diuji di Chromium; Safari (iOS) dan Firefox belum. Pengujian memakai data contoh, bukan data sekolah Anda.
- Lebar 901 sampai ±1000 px (tablet landscape) tetap dapat membungkus bilah alat; itu perilaku wajar, bukan galat.
- Kolom "Uraian" Kas pada data contoh memecah "Mg 2026-11-09" ke dua baris; itu artefak format tanggal data contoh, bukan format asli aplikasi.
