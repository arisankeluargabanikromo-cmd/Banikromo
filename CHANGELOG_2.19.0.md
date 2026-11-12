# SekolahHub 2.18.0 → 2.19.0: Menu "Akun Saya" di grup Sistem

## Latar belakang
Grup **Sistem** memuat Aktivitas, Pengguna (admin), dan Pengaturan. Staf (admin, pengurus, hanya lihat) sudah punya akses akun lewat **Pengaturan > Akun** (kata sandi, keluar, tampilan). Akun **Siswa** dan **Orang tua** tidak punya menu apa pun di grup Sistem, sehingga tidak ada jalan ke ganti kata sandi.

## Matriks hak akses (hasil)
| Peran | Grup Sistem | Akses akun |
|---|---|---|
| Admin | Aktivitas, Pengguna, Pengaturan | Pengaturan > Akun (tidak berubah) |
| Pengurus | Aktivitas, Pengaturan | Pengaturan > Akun (tidak berubah) |
| Hanya lihat | Aktivitas, Pengaturan | Pengaturan > Akun (tidak berubah) |
| **Siswa** | **Akun Saya** (baru) | Akun Saya |
| **Orang tua** | **Akun Saya** (baru) | Akun Saya |

Akun Saya sengaja **tidak** ditampilkan untuk staf agar tidak ada dua pintu ke hal yang sama.

## Isi halaman Akun Saya (hanya menyentuh akun sendiri)
- **Profil akun** (hanya-baca): email, peran, sekolah; Siswa melihat nama, kelas, NIS dirinya; Orang tua melihat daftar anak yang ditautkan (tanpa NIS). Ringkasan hak akses peran ditampilkan agar jelas apa yang boleh dan tidak. Bila belum ditautkan, ada petunjuk menghubungi wali kelas/admin.
- **Keamanan**: ganti kata sandi, **keluar dari semua perangkat** (baru, `Data.logoutAll`, mencabut seluruh sesi dengan konfirmasi), keluar.
- **Tampilan**: terang / gelap / ikut perangkat.
- **Aplikasi**: versi, status sinkronisasi, muat ulang data, bersihkan cache.
- Juga muncul di menu akun (bilah atas), menu mobile grup Sistem, dan pencarian global.

## Yang sengaja TIDAK diberikan ke akun portal (prinsip hak minimum)
Identitas sekolah, cadangan/ekspor data, impor, reset/hapus data, kelola pengguna, riwayat aktivitas, pengaturan keuangan, laporan. Menu dan rute tetap ditolak (`navOk`, `PORTAL_OK`), dan database tetap menegakkan batas lewat RLS/trigger; halaman ini tidak memberi izin baru, hanya pintu masuk.

## Berkas
`js/akunsaya.js` (baru), `app.js` (NAV, navOk, PORTAL_OK, menu akun), `data.js` (`logoutAll`), `pengaturan.js` (ekspor versi), `index.html`, `sw.js`.

## Pengujian
- `akses_test.js` (masuk `npm test`): matriks menu per peran, akun portal tidak melihat/mengakses menu sensitif, staf tidak melihat Akun Saya.
- `akunsaya_test.js` (butuh `npm i jsdom`): isi halaman siswa dan orang tua, escape XSS pada nama, tidak ada elemen terlarang, konfirmasi sebelum keluar global.
- **Belum diuji:** tampilan di peramban/ponsel sungguhan, dan `signOut({scope:'global'})` terhadap server Supabase sungguhan (bila gagal, aplikasi jatuh ke keluar biasa).

## Catatan
- Akun berstatus **pending** (menunggu persetujuan) tidak masuk aplikasi, jadi tidak mendapat menu ini; mereka melihat layar menunggu persetujuan.
- Ganti kata sandi memakai dialog yang sama dengan staf (minimal 6 karakter). Bila ingin kebijakan lebih ketat (mis. 8 karakter), ubah di satu tempat (`A.sandi` di pengaturan.js).
