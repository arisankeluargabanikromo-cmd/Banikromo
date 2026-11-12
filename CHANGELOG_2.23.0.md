# SekolahHub 2.22.x → 2.23.0: Hak akses Ketua, Sekretaris, dan Bendahara kelas

## Konsep
Pengurus kelas tetap akun **Siswa** (hanya-baca seperti siswa lain, tetap memberi suara di voting). Wewenang tambahan disimpan di `profiles.jabatan` (boleh lebih dari satu) dan **hanya admin** yang bisa mengubahnya, lewat Pengguna > Atur tautan & jabatan. Akun berjabatan mendapat satu menu baru, **Tugas Kelas**.

Tabel **tidak dibuka untuk ditulis**. Semua tindakan lewat fungsi server (`pj_*`) yang memeriksa jabatan, kelas, tanggal, dan batas jumlah, lalu mencatat jejak di Riwayat aktivitas. Trigger buku besar yang sudah ada (tutup buku, pembatalan hanya hari yang sama, saldo kas tidak boleh minus) tetap berlaku. Tampilan hanya menyembunyikan yang memang tidak boleh; keputusan akhir ada di server.

## Wewenang (semuanya hanya untuk kelas siswa yang ditautkan ke akun itu)
| | Ketua | Sekretaris | Bendahara |
|---|---|---|---|
| Mengisi absensi kelas | hari ini saja | hari ini sampai 7 hari ke belakang | tidak |
| Rekap absensi kelas | ya | ya | tidak |
| Pengumuman dan agenda | membuat, mengubah, menghapus **buatan sendiri** (maks. 10 per hari), tampil dengan label "Dari Ketua kelas 5A" | sama | tidak |
| Iuran mingguan | tidak | tidak | mencatat (maks. sebesar iuran per minggu per siswa; minggu ini sampai 12 minggu ke belakang), membatalkan **catatan sendiri hari yang sama** |
| Kas kelas manual | tidak | tidak | mencatat masuk/keluar dengan keterangan wajib, **batas harian per jenis** (Pengaturan, default Rp 100.000, 0 = tidak diizinkan), membatalkan catatan sendiri hari yang sama |

**Tidak diberikan kepada siapa pun dari mereka:** tabungan siswa, mengubah atau menghapus catatan lama, koreksi lintas hari, tutup buku, data pribadi siswa lain (hanya nama sekelas), pengaturan, akun, impor/ekspor.

Alasan pembagian ini: prinsip hak akses minimum dan pemisahan tugas. Ketua tidak memegang uang dan tidak melihat status iuran teman; bendahara tidak mengubah absensi; sekretaris tidak menyentuh keuangan. Setiap catatan uang bertanda pembuat, dan koreksi hanya sampai hari yang sama sehingga guru/admin yang menangani sisanya.

## Database: migrasi 020 (WAJIB)
Jalankan `supabase/migrations/020_pengurus_kelas.sql` setelah 013, 016, 018, dan 019. Instalasi baru: sudah ada di akhir `schema.sql`. Isinya: kolom `profiles.jabatan`, `pengaturan.batas_bendahara`, `pengumuman/agenda.oleh,sumber`, `approve_account` dengan parameter `p_jabatan`, dan 10 fungsi `pj_*`. Lalu jalankan `supabase/tests/pengurus_kelas_check.sql`. Tanpa migrasi, aplikasi tetap berjalan seperti 2.22; hanya pilihan jabatan yang menolak dengan pesan jelas.

## Perilaku yang perlu Anda ketahui
- **Kas Kelas adalah satu buku untuk seluruh sekolah** (tabel `kas` tidak punya kolom kelas). Bila beberapa kelas memakai satu instalasi, bendahara kelas mana pun menulis ke buku yang sama dan batas harian per akun adalah satu-satunya pengaman. Memisahkan kas per kelas butuh perubahan skema dan trigger saldo; belum dikerjakan.
- **Bendahara melihat status iuran teman sekelas** (nama dan lunas/belum) untuk bisa menagih. Ketua dan sekretaris tidak.
- Pengurus kelas tetap bisa melihat Kas Kelas dan nama pengurus seperti siswa lain (sejak 2.22).
- Jabatan otomatis hilang bila peran akun diubah dari Siswa, dan wewenang mengikuti kelas siswa yang ditautkan (pindah kelas = pindah wewenang).
- Seorang siswa boleh memegang beberapa jabatan; wewenangnya digabung. Aplikasi tidak membatasi jumlah pemegang jabatan yang sama per kelas.

## Berkas
Baru: `migrations/020_pengurus_kelas.sql`, `tests/pengurus_kelas_check.sql`, `js/tugas.js`, `css/tugas.css`. Diubah: `js/data.js` (jabatan, pembungkus `Data.pj`, kolom hanya-baca), `js/app.js` (menu, routing), `js/akun.js` (pilih jabatan), `js/akunsaya.js`, `js/pengaturan.js` (matriks jabatan, batas bendahara), `js/siswa.js` (label sumber), `js/mobile.js`, `index.html`, `sw.js`, `tests_node/akses_test.js`, `tools/visual/*`, `schema.sql`.

## Diuji dan belum diuji
Diuji di Chromium dengan klien Supabase palsu: menu Tugas Kelas muncul hanya untuk siswa berjabatan (tidak untuk admin, pengurus, ortu, siswa biasa); ketua mengisi absensi (tanggal terkunci hari ini), menerbitkan pengumuman yang tampil dengan label asal; bendahara mencatat iuran, membatalkan, mencatat kas, dan ditolak di atas batas; tata letak ponsel 390 px; `npm test` lulus.
**Belum diuji:** migrasi 020 dan semua fungsi `pj_*` **belum pernah dijalankan di Postgres/Supabase** (tidak tersedia di lingkungan pengembangan ini; sintaks hanya ditinjau manual). Uji di staging dengan akun sungguhan: satu per jabatan, satu siswa biasa, dan satu siswa dari kelas lain. Coba khusus: bendahara mencatat iuran lalu admin membuka menu Iuran/Kas (sinkronisasi baris kas turunan), pembatalan lintas hari, melewati batas harian, dan sekretaris mengisi absensi di luar 7 hari.

## 2.23.1
Perbaikan migrasi 020: kondisi `IF ... CASE ... THEN` di `pj_info_simpan` menyebabkan galat sintaks (PL/pgSQL memotong pada THEN pertama). Diganti variabel `v_max`.
