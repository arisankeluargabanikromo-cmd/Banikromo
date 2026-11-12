# SekolahHub

> **v2.23.0:** hak akses **Ketua, Sekretaris, Bendahara** kelas (akun Siswa + jabatan, menu *Tugas Kelas*, wewenang terbatas dan diperiksa server). **Wajib** menjalankan migrasi `020_pengurus_kelas.sql`; belum diuji di Postgres, coba di staging dulu. Rincian: `CHANGELOG_2.23.0.md`.

> **v2.22.0:** akun Orang tua memakai tampilan yang sama dengan akun Siswa (pemilih anak bila lebih dari satu anak; voting hanya-lihat). **Wajib** menjalankan migrasi `019_portal_ortu_setara_siswa.sql`. Rincian: `CHANGELOG_2.22.0.md`.

> **v2.21.0**: perbaikan tata letak saat zoom-out (header profil, konten dipusatkan di layar lebar). Lihat `CHANGELOG_2.21.0.md`.
>
> **v2.20.0**: perapihan tampilan (halaman Akun Saya dirancang ulang, bilah alat desktop satu baris, grafik batang tidak lagi membengkak). Lihat `CHANGELOG_2.20.0.md`; perkakas uji tampilan di `tools/visual/`.
>
> **v2.19.0**: menu **Akun Saya** di grup Sistem untuk akun Siswa dan Orang tua (profil, ganti kata sandi, keluar dari semua perangkat, tampilan). Staf tetap memakai Pengaturan > Akun. Lihat `CHANGELOG_2.19.0.md`.
>
> **v2.18.0**: **Kuitansi PDF dengan QR verifikasi** (tombol *PDF* di bukti tabungan, kas, iuran) dan halaman publik `/verifikasi`. Jalankan `supabase/migrations/018_verifikasi_transaksi.sql` agar QR dapat diverifikasi. Lihat `CHANGELOG_2.18.0.md`.
>
> **v2.17.0**: **Scan QR kartu ID** untuk absen hadir dan setor cepat (tombol *Scan QR* di Absensi, atau menu *+ Tambah*). Butuh HTTPS dan izin kamera. Lihat `CHANGELOG_2.17.0.md`.
>
> **v2.16.0**: nama siswa tidak lagi tersimpan di uraian kas turunan iuran (jalankan `supabase/migrations/017_privasi_kas_iuran.sql`, lalu `supabase/tests/privasi_check.sql`). Tanpa migrasi, aplikasi tetap berjalan.
>
> **v2.15.0**: lapisan profesional (kunci otomatis, banner offline, pemberitahuan versi baru, pintasan papan ketik, aksesibilitas) dan saldo berindeks. Lihat `CHANGELOG_2.15.0.md` dan `ROADMAP_IDE.md`.

Aplikasi grup sekolah dan tabungan siswa. Frontend statis (HTML, CSS, JS), database dan login di **Supabase**, kode di **GitHub**, hosting di **Vercel**.

## Struktur folder

```
sekolahhub/
├─ public/                 ← folder yang dipublikasikan
│  ├─ index.html
│  ├─ css/style.css        ← tampilan desktop + SEMUA token warna tema terang & gelap (glassmorphism)
│  ├─ css/mobile.css       ← tampilan mobile gaya Android (Material 3), aktif di layar ≤ 860px
│  ├─ css/idcard.css       ← tab Kartu ID (antarmuka, memakai token tema) + desain kartu CR80 dan aturan cetak
│  ├─ js/app.js            ← logika aplikasi (UI, tabungan, voting, laporan)
│  ├─ js/data.js           ← lapisan Supabase (login, sinkronisasi, realtime)
│  ├─ js/theme.js          ← pemilih tema terang / gelap / ikuti perangkat (dimuat di <head>)
│  ├─ js/pengaturan.js     ← halaman Pengaturan: identitas + logo, hak akses, data & cadangan, akun, reset
│  ├─ js/import.js         ← impor data dari Excel (.xlsx) / CSV + template
│  ├─ js/akun.js           ← manajemen akun: persetujuan terpandu, peran, tautan siswa, sambutan akun portal
│  ├─ js/bank.js           ← menu Keuangan standar perbankan: tabungan, kas kelas, iuran (butuh migrasi 013)
│  ├─ css/bank.css         ← kartu rekening, bukti transaksi (memakai token tema)
│  ├─ js/statement.js      ← dokumen & tabel gaya rekening koran: kertas cetak, Laporan, tampilan Pengingat (v2.12)
│  ├─ css/statement.css    ← pita ringkasan, tabel buku, kertas A4, tata letak ponsel dan @page cetak
│  ├─ js/idcard.js         ← kartu ID siswa: pembuat QR, desain kartu, galeri, sistem cetak A4 / CR80
│  ├─ vendor/fflate.min.js ← pustaka zip (MIT) untuk membaca/menulis .xlsx
│  ├─ js/auth.js           ← layar masuk / daftar / menunggu persetujuan
│  ├─ js/mobile.js         ← navigasi bawah, app bar, FAB, halaman Menu, tabel jadi kartu
│  ├─ manifest.webmanifest ← agar bisa dipasang ke layar utama Android (PWA)
│  ├─ sw.js                ← service worker (jaringan dulu, cache sebagai cadangan)
│  ├─ icons/               ← ikon aplikasi (192, 512, maskable)
│  ├─ js/config.js         ← URL dan anon key Supabase
│  └─ vendor/supabase.js   ← supabase-js 2.45.4 (di-host sendiri)
├─ supabase/schema.sql     ← tabel, aturan keamanan (RLS), peran
├─ supabase/migrations/    ← migrasi untuk database yang sudah berjalan (006 = tema per akun, 007 = logo & identitas, 008 = kop instansi kartu ID, 009 = NIP kepala sekolah, 010 = akun siswa, 011 = akses menu siswa, 012 = iuran mingguan, 013 = standar perbankan)
├─ supabase/tests/         ← skrip uji keamanan (RLS)
├─ scripts/gen-config.js   ← menulis config.js dari environment variable
├─ vercel.json             ← build dan header keamanan
└─ package.json
```

## 1. Siapkan Supabase

1. Buat project baru di supabase.com.
2. Buka **SQL Editor → New query**, tempel isi `supabase/schema.sql`, lalu **Run**.
3. Buka **Project Settings → API**, salin **Project URL** dan **anon public key**.
4. Buka **Authentication → Providers → Email** (aktif). Untuk sekolah, disarankan mengaktifkan konfirmasi email.

## 2. Jalankan di komputer sendiri

1. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `public/js/config.js`.
2. Jalankan `npx serve public`, lalu buka alamat yang tampil.
3. Daftar akun pertama. **Akun pertama otomatis menjadi admin.**

## 3. GitHub dan Vercel

1. Buat repository di GitHub, lalu push seluruh isi folder ini.
2. Di vercel.com pilih **Add New → Project**, impor repository tersebut.
3. Framework Preset: **Other**. Build dan output sudah diatur oleh `vercel.json`.
4. Tambahkan **Environment Variables**: `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (lihat `.env.example`).
5. **Deploy**. Setelah dapat domain, tambahkan domain itu di Supabase pada **Authentication → URL Configuration → Site URL**.

## Fitur

- **Top bar:** pencarian global (tekan `/` atau Ctrl+K) untuk siswa, menu, dan aksi; tombol **Tambah** untuk aksi cepat; **notifikasi** (siswa belum menabung, iuran belum lunas, agenda hari ini dan besok, ulang tahun siswa, pengumuman baru, pemilihan yang dibuka); indikator status penyimpanan; dan menu akun.
- **Dasbor bergaya layar data:** tiga kolom dengan cincin distribusi tabungan per kelas, radar kesehatan kelas, grafik area halus setoran vs penarikan (6 atau 12 bulan), lima bulan terbaik, tiga indikator cincin (kehadiran, iuran, partisipasi menabung), status iuran, dan peringkat saldo. Grafik juga ada di profil siswa, portal orang tua, kas, iuran, dan laporan. Semua dibuat dengan SVG murni tanpa pustaka tambahan.
- **Tabungan:** setoran, penarikan, setoran massal per kelas, buku tabungan, bukti setoran yang bisa dicetak, dan target tabungan per siswa.
- **Iuran:** tabel pembayaran iuran per siswa per bulan. Nominal iuran diatur di Pengaturan.
- **Absensi:** kehadiran harian per kelas (Hadir, Sakit, Izin, Alpa) dengan rekap bulanan dan ringkasan di profil siswa.
- **Kas kelas, agenda, pengumuman, voting, struktur kelas, laporan** (bisa dicetak atau diekspor CSV), dan **riwayat aktivitas**.
- **Profil siswa** bergaya media sosial dengan data lengkap, foto, dan sampul.
- **Kartu ID siswa** (tab *Kartu ID* di Data Siswa): kartu pelajar berfoto ukuran CR80 dengan kode QR, siap cetak. Lihat bagian *Kartu ID siswa*.
- **Pengingat WhatsApp:** daftar siswa yang belum menabung atau belum lunas iuran bulan ini, lengkap dengan tombol kirim yang membuka WhatsApp dengan pesan terisi. Isi pesan bisa diubah di Pengaturan. Bukti setoran juga bisa dikirim ke wali.
- **Ekspor CSV** untuk data siswa, transaksi, dan rekap tabungan.

## Keuangan standar perbankan (v2.11, migrasi 013)

Menu **Tabungan**, **Kas Kelas**, **Iuran**, dan **Pengingat** mengikuti praktik aplikasi perbankan (alur ala BRImo). Aturan pentingnya ditegakkan **di database** lewat trigger (`013_perbankan.sql`), bukan hanya di tampilan.

**Urutan pasang (penting):** jalankan `supabase/migrations/013_perbankan.sql` di SQL Editor **sebelum** men-deploy versi ini (instalasi baru sudah termasuk di `schema.sql`). Aman dijalankan ulang; data lama otomatis diberi nomor referensi. Tanpa migrasi, aplikasi tetap berjalan seperti v2.10 dan menampilkan petunjuk.

| Standar | Perilaku |
|---|---|
| **Buku besar permanen** | Transaksi tabungan, pembayaran iuran, dan catatan kas manual **tidak bisa diubah atau dihapus** dari aplikasi. Kesalahan dikoreksi dengan **pembatalan (reversal)**: baris lawan bernilai negatif yang menunjuk transaksi asal. Transaksi asal tetap tampil berstatus *Dibatalkan*; satu transaksi hanya bisa dibatalkan sekali dan pembatalan tidak bisa dibatalkan. |
| **Nomor referensi, waktu, petugas** | Setiap transaksi punya nomor unik (`TRX`/`IUR`/`KAS`/`REV` + yymmdd + 8 karakter), waktu pembukuan dari server, dan petugas (email disamarkan). |
| **Alur transaksi** | Input → **konfirmasi** (rincian + saldo sebelum/sesudah) → **otorisasi kata sandi** → pembukuan → **bukti**. Bukti *Transaksi Berhasil* hanya tampil setelah server menerima; bila ditolak, tidak ada yang tercatat dan pesan alasannya ditampilkan. |
| **Otorisasi** | Pembatalan selalu meminta kata sandi akun. Penarikan tabungan dan pengeluaran kas sebesar *Batas otorisasi* atau lebih juga meminta kata sandi (*Pengaturan → Keuangan*; 0 = nonaktif). Opname kas dengan selisih dan tutup buku juga meminta kata sandi. |
| **Saldo mengendap** | *Pengaturan → Keuangan*. Penarikan tidak boleh menyisakan saldo di bawah nilai ini, kecuali layanan **Tutup rekening** (menarik seluruh saldo). Rekening bersaldo tidak bisa dihapus dari Data Siswa. |
| **Saldo kas tidak minus** | Pengeluaran kas, pembatalan pemasukan kas, dan pembatalan iuran mingguan ditolak bila dananya sudah terpakai. |
| **Pembatalan lintas hari** | Pengurus hanya bisa membatalkan transaksi yang dibukukan **hari yang sama**; transaksi hari sebelumnya hanya oleh admin. Pembatalan selalu bertanggal hari ini. |
| **Tutup buku** | *Tabungan → Penutupan harian* (admin). Transaksi bertanggal sampai tanggal tutup buku ditolak untuk **semua** peran, termasuk admin; hanya *Buka kembali* (dengan alasan, tercatat di Aktivitas) yang bisa melonggarkannya. Tanggal di masa depan (lebih dari 1 hari) ditolak. |
| **Hapus data** | `DELETE` pada buku besar hanya admin (untuk reset, pemulihan cadangan, urungkan impor). Menghapus siswa membersihkan tabungan dan iurannya lewat cascade. **Urungkan impor oleh pengurus kini ditolak server**; minta admin, atau batalkan transaksi satu per satu. |

**Tabungan.** Tab *Rekening* (nomor rekening 12 digit diturunkan dari NIS, status Aktif/Dormant >90 hari), *Mutasi* (filter tanggal, jenis, pencarian referensi; kolom kredit/debit/status) dan *Penutupan harian* (rekap per hari + saldo akhir hari). **Mutasi Rekening** per siswa berupa kartu rekening (saldo bisa disembunyikan), saldo awal/akhir periode, mutasi per hari dengan saldo berjalan, dan **cetak rekening koran**. Setoran massal menghasilkan rekap dengan nomor batch.

**Kas Kelas.** Buku kas per bulan dengan saldo awal, pemasukan, pengeluaran, saldo akhir, kategori, nomor bukti, **bukti kas (kwitansi dengan terbilang dan kolom tanda tangan)**, **cetak buku kas**, dan **opname kas** (bandingkan uang fisik dengan saldo buku; selisih dibukukan sebagai penyesuaian bertanda *Selisih kas*). Baris *Dari Iuran* dibuat otomatis dan hanya berubah lewat menu Iuran.

**Iuran.** Matriks mingguan tetap ada, ditambah nomor tagihan, **kwitansi**, riwayat pembayaran dengan status, **tunggakan** per siswa (tombol *Bayar* memilih beberapa minggu sekaligus), indikator kolektibilitas (lancar / tunggakan 1–2 minggu / 3 minggu atau lebih), dan persentase kolektibilitas bulan berjalan. *Tunggakan* = minggu yang sudah lewat dan belum lunas, dihitung sejak minggu pertama yang pernah tercatat di sistem (atau sejak siswa masuk bila lebih baru), supaya iuran yang baru diaktifkan tidak menimbulkan tunggakan semu.

**Pengingat.** Tab ketiga *Tunggakan iuran* dengan kata kunci pesan `{tunggakan}` dan `{minggu_tunggak}`; kolom saldo/kekurangan/tunggakan ditampilkan.

**Catatan penting**
- Ini sistem pembukuan untuk kelas/sekolah, bukan sistem perbankan berlisensi; **tidak ada uang yang dipindahkan** dan nomor rekening hanyalah label di aplikasi.
- Kata sandi untuk otorisasi diverifikasi ulang ke Supabase Auth (tidak disimpan). Ini mengurangi salah klik dan pemakaian perangkat yang ditinggal terbuka, bukan pengganti kontrol akses peran.
- Portal siswa dan orang tua tetap hanya-baca; kini menampilkan nomor referensi, dan baris pembatalan tampil jelas.
- Saldo berjalan di tampilan dihitung berurutan menurut tanggal lalu waktu pembukuan; transaksi bertanggal mundur disisipkan sesuai tanggalnya.

**Pengujian.** `supabase/tests/ledger_check.sql` (49 pemeriksaan: permanen, referensi unik, pembatalan, saldo mengendap, tutup buku, kas tidak minus, peran) dijalankan seperti uji lain: tempel di SQL Editor, Run, baca pesan *HASIL UJI BUKU BESAR* (error di akhir disengaja). Jalankan juga `security_check.sql` dan `akses_siswa_check.sql` setelah migrasi.

## Tampilan keuangan gaya rekening koran (v2.12)

Seluruh menu **Tabungan, Kas Kelas, Iuran, Pengingat, Laporan**, dan semua hasil cetak mengikuti format *Rekening Koran (Account Statement)* bank. Tidak ada migrasi database baru.

| Bagian | Isi |
|---|---|
| **Kertas dokumen** | Kop sekolah + logo di kanan atas, judul tengah dua baris (mis. *Rekening Koran / Account Statement*), blok identitas (Periode Dari/Sampai, No. Rekening, Mata Uang, Kelas, Saldo Awal), tabel dengan pita header biru (Tanggal & Waktu, Tgl. Valuta, Uraian, No. Referensi, Debit, Kredit, Saldo), ringkasan saldo, tanda tangan, dan catatan kaki. Angka berformat `3.000.000,00`. |
| **Dokumen** | Rekening koran siswa (Tabungan > Mutasi), Buku Kas Kelas, Laporan Rekap Tabungan, Laporan Iuran Kelas, rekap batch (setoran/iuran massal). |
| **Laporan** | Tiga jenis (Tabungan, Kas Kelas, Iuran) dengan pratinjau kertas, filter periode dan kelas, **Cetak / PDF**, dan **Ekspor CSV** yang isinya sama dengan kertas. Saldo awal dan akhir dihitung per periode. |
| **Cetak** | A4 portrait, header tabel berulang di tiap halaman, baris tidak terpotong, nomor halaman *Halaman X dari Y* lewat `@page` (Chrome/Edge 131 ke atas; peramban lain tetap mencetak tanpa nomor). Aktifkan *Grafik latar belakang* agar pita biru tercetak. Akun Siswa dan Hanya lihat juga bisa mencetak. |
| **Layar desktop** | Pita ringkasan angka, tab segmen, tabel dengan pita header, tanggal dan jam dua baris, angka rata kanan, baris dibatalkan dicoret. |
| **Layar ponsel (≤ 860px)** | Tabel menjadi daftar transaksi (judul + nominal, tanggal + saldo, referensi, aksi). Matriks iuran bisa digeser dengan kolom nama menempel. Kertas di dialog menjadi daftar kartu per transaksi; saat dicetak tetap berbentuk tabel A4. |

Kertas selalu putih dengan huruf Arial (media cetak), sehingga warnanya memakai token `--pp-*` di `statement.css`, bukan token tema gelap. Untuk dokumen baru cukup memanggil `ST.doc({...})` dan `ST.t(kolom, baris, {paper:true})`, lalu `ST.open({title, paper})`.

## Tampilan mobile (gaya Gojek)

Di layar ≤ 860px aplikasi tampil seperti aplikasi Android native bergaya Gojek. Desktop tidak berubah. Warna **diwarisi langsung dari token di `style.css`** (gelap + aksen teal, sama dengan desktop), jadi mengganti `--pr`, `--bg`, dll. di `style.css` otomatis mengubah desktop dan mobile sekaligus.

| Elemen | Perilaku |
|---|---|
| **Navigasi bawah** | Hanya 3 menu. Staf: Beranda, Aktivitas, Akun. Orang tua: Beranda, Info, Akun. |
| **Beranda** | Header teal + pencarian, kartu saldo dengan 4 aksi cepat (bisa disembunyikan dengan ikon mata), grid layanan, carousel Info & agenda, lalu ringkasan, daftar yang perlu ditindak, dan analitik. |
| **Grid layanan** | Maksimal 7 layanan + tombol **Lainnya**. Ketuk **Atur** (di Beranda atau di Akun) untuk menambah (+) atau menghapus (−) layanan. Pilihan tersimpan di perangkat per peran. Badge merah muncul pada Pengingat dan Pengumuman. |
| **Halaman dalam** | App bar putih dengan tombol kembali. Aksi utama halaman (mis. Catat transaksi) menjadi tombol FAB teal. |
| **Form** | Bottom sheet dengan tombol simpan yang selalu terlihat. |
| **Tabel** | Daftar kartu. Absensi memakai empat chip status. Matriks iuran bisa digeser dengan kolom nama menempel. |

**Pasang ke layar utama:** buka situs di Chrome Android, menu titik tiga, **Tambahkan ke layar utama**. Aplikasi terbuka layar penuh tanpa bilah browser (butuh HTTPS, otomatis di Vercel).

Menambah layanan baru: tambahkan satu entri di `NAV` pada `app.js`. Grid dan sheet **Semua layanan** mengambilnya otomatis. Warna ikon layanan di `COL` memakai token warna yang sama dan nama pendek di `SHORT` pada `mobile.js`.

## Akun siswa dan persetujuan akun

Setiap siswa dapat memiliki akun sendiri dengan peran **Siswa**: akun itu **hanya-baca**. Beranda menampilkan **kartu pelajar lanskap (halaman depan)** di bagian paling atas; ketuk untuk melihat depan dan belakang. Di bawah kartu ada **Ringkasan Anda**, tampilan analitik seperti dashboard kelas (KPI, arus tabungan, radar profil, gauge kehadiran/iuran/menabung, status iuran, rekap kehadiran) yang seluruhnya dihitung dari data siswa itu sendiri. Seluruh menu **Keuangan** (Tabungan, Kas Kelas, Iuran, Pengingat) dan **Kelas** (Data Siswa, Struktur Kelas, Absensi, Agenda, Pengumuman, Voting) dapat dibuka dengan tampilan khusus siswa (`js/siswa.js`). Data pribadi, tabungan, iuran, dan absensi hanya milik siswa yang tertaut; kas kelas, struktur kelas, dan hasil voting terlihat untuk seluruh kelas (migrasi 011), lengkap dengan nama teman sekelas saja. Siswa tidak bisa memberi suara, menulis, atau melihat riwayat aktivitas dan data pribadi siswa lain. Berbeda dengan peran *Hanya lihat* yang melihat seluruh kelas.

**Migrasi 011 (akses menu Siswa).** Database yang sudah berjalan: jalankan `supabase/migrations/011_akses_menu_siswa.sql` sekali di SQL Editor setelah migrasi 010 (instalasi baru sudah termasuk di `schema.sql`). Aman dijalankan ulang. Tanpa migrasi 011, Kas Kelas, Struktur Kelas, dan Voting tampil kosong di akun Siswa; menu lain tetap berfungsi.

**Alur:**
1. Siswa (atau orang tua/guru) mendaftar di layar masuk dan memilih **Saya mendaftar sebagai** Siswa / Orang tua / Guru-staf, dengan NIS bila ada. Akun berstatus *Menunggu* dan belum bisa membuka data apa pun.
2. Admin membuka **Pengguna** atau *Pengaturan > Hak akses* dan memilih **Tinjau & setujui**. Dialog menampilkan klaim pendaftar yang sudah **dicocokkan otomatis ke data siswa** (lencana *Cocok* atau *NIS tidak ditemukan*), lalu admin menentukan peran dan siswa yang ditautkan dalam satu langkah.
3. Setelah disetujui, saat pertama kali masuk akun portal melihat dialog sambutan yang menjelaskan hak aksesnya, lalu **Portal Siswa** (atau Portal Orang Tua).

**Prinsip keamanan:**
- Klaim saat mendaftar hanyalah **saran untuk admin**; tidak pernah memberi akses. Admin tetap memverifikasi.
- Aturan ditegakkan **di database**, bukan hanya di tampilan: kebijakan RLS, trigger, dan fungsi `approve_account` (satu transaksi, hanya admin). Akun siswa wajib tertaut ke **tepat satu** siswa, dan satu siswa hanya boleh punya **satu** akun siswa. Orang tua boleh tertaut ke beberapa anak.
- Mengganti peran lewat jalur mana pun otomatis menyesuaikan tautan; peran non-portal otomatis kehilangan tautan. **Cabut akses** mengembalikan akun ke *Menunggu* dan menghapus tautannya tanpa menghapus akun.
- Admin tidak dapat mengubah peran akunnya sendiri. Persetujuan mencatat siapa dan kapan (`disetujui_oleh`, `disetujui_pada`) dan masuk ke riwayat aktivitas.
- Di profil siswa (admin) terlihat status akun siswa, jumlah akun orang tua, dan pendaftar menunggu yang mengklaim NIS siswa itu.

**Migrasi 010 (wajib untuk peran Siswa).** Database yang sudah berjalan: jalankan `supabase/migrations/010_akun_siswa.sql` sekali di SQL Editor, setelah migrasi 003 dan 005 (instalasi baru sudah termasuk di `schema.sql`). Aman dijalankan ulang, tautan orang tua yang ada tetap berfungsi. Tanpa migrasi, aplikasi tetap berjalan: opsi *Siswa* dinonaktifkan dan persetujuan memakai jalur lama.

**Iuran mingguan (migrasi 012, wajib).** Iuran kini dibayar **per minggu** (Senin sampai Minggu), bukan per bulan. Jalankan `supabase/migrations/012_iuran_mingguan.sql` sekali di SQL Editor (instalasi baru sudah termasuk di `schema.sql`); tanpa migrasi, menu Iuran menampilkan petunjuk dan tidak menyimpan apa pun.
- **Nominal:** *Pengaturan → Iuran kelas per minggu*. Nilai lama (per bulan) tidak dikonversi; sesuaikan angkanya.
- **Mencatat:** menu Iuran menampilkan kolom per minggu untuk satu bulan; klik sel untuk mencatat atau membatalkan. Tombol *Lunaskan semua minggu ini* mencatat nominal bawaan untuk semua siswa (kelas terpilih) yang belum membayar. Minggu dihitung ke bulan dari hari Senin-nya.
- **Sinkron ke Kas Kelas:** setiap pembayaran mingguan otomatis menjadi satu baris *Pemasukan* di Kas Kelas (label *Otomatis dari Iuran*). Membatalkan pembayaran, mengimpor, menghapus siswa, atau memulihkan cadangan memperbarui kas dengan sendirinya. Baris otomatis tidak bisa dihapus dari Kas Kelas.
- **Data lama:** iuran bulanan sebelumnya tetap tersimpan dan tetap dihitung di total tahunan, tetapi tidak dimasukkan ke Kas Kelas (agar tidak ganda dengan catatan kas manual).
- **Impor Excel:** format daftar (NIS/Nama, Minggu, Jumlah, Tanggal Bayar); matriks bulanan tidak dipakai lagi. Pengingat WhatsApp, dashboard, dan portal siswa/orang tua kini menilai iuran **minggu berjalan**; pesan memakai `{minggu}` selain `{bulan}`.

**Pengujian akses.** Jalankan `supabase/tests/akses_siswa_check.sql` di SQL Editor setelah migrasi 011. Skrip membuat data uji sementara, memeriksa isolasi data akun siswa, orang tua, viewer, dan pending (termasuk bahwa siswa tidak bisa menulis, menaikkan perannya, atau menautkan dirinya ke siswa lain), lalu membatalkan semuanya otomatis. Hasil ada di pesan *HASIL UJI AKSES SISWA*. Catatan: siswa yang lulus (dihapus lewat *Tahun ajaran baru*) membuat akun siswanya kehilangan tautan; cabut akses akun itu dari halaman Pengguna.

## Portal orang tua

Orang tua mendaftar sendiri dari halaman login. Admin membuka menu **Pengguna**, mengubah peran akun itu menjadi `ortu`, lalu menekan **Atur** untuk menautkan satu atau lebih anak. Orang tua hanya melihat saldo, iuran, kehadiran, dan transaksi anaknya sendiri, ditambah pengumuman dan agenda. Pembatasan ini dijaga oleh Row Level Security di database, jadi orang tua tidak bisa membuka data siswa lain walau memakai alat selain aplikasi ini.

## Foto tidak tampil setelah deploy

Gejala klasik: foto tampil di localhost tetapi kosong di Vercel. Penyebabnya hampir selalu **Content-Security-Policy** di `vercel.json`: header itu hanya berlaku di Vercel, dan `img-src` harus memuat `https://*.supabase.co` karena foto disajikan dari Supabase Storage lewat URL bertanda tangan. Pastikan `vercel.json` versi terbaru ter-deploy, lalu bersihkan cache aplikasi.

Untuk mengetahui penyebab pastinya tanpa membuka console, buka *Pengaturan > Data > Tes tampilan foto*. Alat ini membuat URL foto, memeriksa respons server, dan mendeteksi pelanggaran CSP, lalu menyebut langkah perbaikannya. Bila foto gagal dimuat karena alasan apa pun, avatar kini kembali menampilkan inisial dan sampul menampilkan gradien (bukan lingkaran/area kosong).

## Foto dan kinerja

Foto profil dan sampul disimpan di **Supabase Storage** (bucket privat `foto-siswa`, maksimal 1 MB per file, hanya JPEG). Di database hanya tersimpan nama file, jadi data siswa tetap ringan. Foto diakses lewat URL bertanda tangan yang berlaku 24 jam, dan orang tua hanya bisa membuka foto anaknya. Foto lama yang masih tersimpan langsung di database bisa dipindahkan lewat tombol di **Pengaturan**. Pembaruan realtime hanya memuat ulang tabel yang berubah.

## Kartu ID siswa

**Hak akses.** Galeri dan pencetakan Kartu ID tersedia untuk admin, pengurus, dan viewer. Akun **Siswa** dan **Orang tua** tidak melihat menu Kartu ID (halaman Data Siswa tidak dapat dibuka oleh peran portal).

Buka **Data Siswa → tab Kartu ID**. Kartu juga bisa dibuka per siswa lewat tombol **Kartu** di tabel dan **Kartu ID** di profil siswa. Tidak perlu migrasi database.

**Isi kartu**

| Sisi | Isi |
|---|---|
| Depan | **Kop** rata tengah (logo, instansi induk, nama sekolah, alamat sekolah), judul kecil **KARTU PELAJAR**, foto berbingkai lingkaran (kembali ke inisial bila foto kosong atau gagal dimuat), **barcode Code 128** berisi NIS, lalu baris Nama, NIS, Jenis Kelamin, Lahir, Alamat siswa, dan strip tahun ajaran |
| Belakang | Kop yang sama seperti depan, **dua kode QR sejajar** (QR **NIS** dan QR **WhatsApp wali**, masing-masing dengan keterangan dan nomor), **ketentuan penggunaan kartu**, dan **tanda tangan kepala sekolah** (nama dan NIP). Semua rata tengah. Tidak memuat data lain |

Data diambil dari data siswa dan *Pengaturan > Umum* (logo, nama sekolah, instansi induk, alamat sekolah, tahun ajaran). Semua teks kop dan data **tidak pernah dipotong**: ukuran huruf mengecil bertahap dan teks membungkus ke baris berikutnya bila panjang.

**Kop instansi:** baris kop di atas nama sekolah (depan dan belakang) diisi di **Pengaturan > Umum > Instansi induk (kop kartu ID)**, misalnya `PEMERINTAH KABUPATEN MADIUN`. Nama sekolah di bawahnya diambil dari kolom *Nama sekolah* di halaman yang sama, jadi tulis lengkap dan benar (misalnya `SMP NEGERI 1 WONOASRI`). Kolom ini butuh **migrasi 008**: jalankan `supabase/migrations/008_kop_instansi.sql` sekali di SQL Editor (instalasi baru sudah termasuk di `schema.sql`). Tanpa migrasi atau bila dikosongkan, kartu tetap tercetak tanpa baris kop. Teks kop mengecil otomatis bila panjang.

**QR WhatsApp wali:** berisi tautan `https://wa.me/<nomor>` dari kolom *Kontak wali* siswa (nomor `08…` otomatis diubah ke `62…`). Bila dipindai, WhatsApp langsung membuka chat ke wali. Bila siswa tidak punya nomor, hanya QR NIS yang dicetak. Bila nomornya bukan nomor seluler yang valid untuk WhatsApp, nomor tampil sebagai teks *Kontak Wali* tanpa QR. QR ini bisa dimatikan lewat opsi **WhatsApp wali (belakang)** di tab Kartu ID.

**Tanda tangan:** nama kepala sekolah diambil dari *Pengaturan > Umum > Kepala sekolah*, NIP dari **NIP kepala sekolah** di halaman yang sama. NIP butuh **migrasi 009**: jalankan `supabase/migrations/009_nip_kepsek.sql` sekali di SQL Editor (instalasi baru sudah termasuk di `schema.sql`). Tanpa migrasi atau bila NIP kosong, hanya nama yang dicetak. Bila nama juga kosong, kartu menyediakan garis titik agar bisa diisi tangan. Ruang tanda tangan dibiarkan kosong untuk tanda tangan basah atau stempel.

**Tampilan:** desain mengikuti contoh kartu pelajar bergradien (lanskap sebagai bawaan; potret memakai bahasa desain yang sama). Enam pilihan warna gradien, orientasi potret atau lanskap, pratinjau depan atau belakang, dan pilihan data tambahan (alamat siswa di depan, kontak wali di belakang). Pilihan disimpan per perangkat (`localStorage`, kunci `sh.idcard`). Pencarian, saringan kelas, dan saringan **Belum ada foto** memudahkan memeriksa kelengkapan sebelum mencetak. Tombol cetak berbunyi *Cetak semua* atau *Cetak terpilih* sesuai pilihan.

**Mencetak** (hanya admin dan pengurus; peran lain bisa melihat pratinjau):

| Media | Hasil |
|---|---|
| Kertas A4 (potong manual) | Potret 9 kartu per lembar (3 x 3), lanskap 10 kartu (2 x 5), dengan garis potong tipis. Cocok untuk dilaminasi |
| Printer kartu PVC (CR80) | Satu kartu per halaman seukuran kartu (54 x 85,6 mm), untuk printer kartu (Evolis, Zebra, HiTi, dan sejenisnya) |

Sisi yang dicetak: depan dan belakang, depan saja, atau belakang saja. Pada A4, sisi belakang **sudah dicerminkan** agar pas dengan sisi depan saat dicetak bolak-balik (pilih *dua sisi, balik pada sisi panjang*). Siswa tanpa foto bisa dilewati otomatis (bawaan: dilewati). Setiap pencetakan dicatat di *Aktivitas*.

Pengaturan di jendela cetak peramban: skala **100%**, margin **Tidak ada**, aktifkan **Grafik latar belakang**. Hasil bisa disimpan sebagai PDF untuk dikirim ke percetakan.

**Catatan teknis**

- Kode QR (belakang) dan barcode Code 128 (depan) dibuat oleh `idcard.js` sendiri tanpa pustaka luar. Keduanya hanya berisi NIS, tanpa data pribadi lain, sehingga bisa dipakai untuk pemindaian absensi di kemudian hari. QR (versi 1 sampai 6) sudah diuji terbaca pemindai; tabel Code 128 sudah dicocokkan dengan pustaka pembanding. NIS angka memakai set C agar barcode rapat dan mudah dipindai.
- Ukuran kartu memakai satuan milimeter yang diturunkan dari lebar kartu (`cqw`), jadi desain yang sama tampil identik di layar dan di kertas. Warna kartu sengaja tetap (tidak mengikuti tema terang/gelap) karena kartu adalah media cetak.
- Semua kelas CSS internal kartu berawalan `ic-` agar tidak bentrok dengan kelas lain (`style.css` sudah memakai `.hd`, `.kv`, `.pg`, dan `.fr` untuk profil siswa).
- Foto kartu diambil dari URL bertanda tangan Supabase Storage yang sama dengan profil. Bila foto tidak tampil di kartu, jalankan *Pengaturan > Data > Tes tampilan foto*.
- Foto tersimpan persegi (320 x 320 px) dan ditampilkan dalam bingkai lingkaran. Gunakan foto dengan wajah di tengah.

## Uji keamanan

Setelah semua migrasi dijalankan, buka `supabase/tests/security_check.sql`, tempel di SQL Editor, lalu Run. Skrip membuat akun dan data uji sementara, memeriksa apakah orang tua, viewer, akun pending, dan pengunjung tanpa login hanya bisa mengakses yang seharusnya, lalu **membatalkan semuanya**. Hasilnya tampil sebagai pesan error berjudul `HASIL UJI KEAMANAN`. Error itu disengaja. Setiap baris harus bertuliskan `LULUS`. Jalankan ulang setiap kali aturan akses diubah.

## Upgrade dari versi sebelumnya

Jika database sudah dibuat dengan `schema.sql` versi awal, jalankan migrasi yang belum pernah dijalankan, berurutan, di SQL Editor: `002_absensi_iuran.sql` (versi 1.1) lalu `003_portal_ortu.sql` (versi 1.2), `004_pengingat_wa.sql` (versi 1.3), `005_foto_storage.sql` (versi 1.4), `006_preferensi_tema.sql` (tema per akun, opsional), dan `007_logo_identitas.sql` (logo sekolah, versi 2.3). Instalasi baru cukup menjalankan `schema.sql`.

## Impor data dari Excel

Tombol **Impor Excel** ada di halaman Data Siswa, Tabungan, Iuran, Absensi, Kas Kelas, Agenda, dan Pengumuman, juga di *Pengaturan > Data*. Hanya admin dan pengurus yang dapat mengimpor.

Alurnya tiga langkah di dalam satu dialog: **pilih berkas** (.xlsx atau .csv, seret atau pilih, maksimal 5 MB dan 3.000 baris) → **petakan kolom** (judul kolom dikenali otomatis, bisa diubah; baris judul dan lembar kerja bisa dipilih) → **pratinjau** (tiap baris diberi status *Baru*, *Ubah*, *Lewati*, atau *Masalah* beserta alasannya, laporan masalah bisa diunduh) → impor. Setelah impor muncul tombol **Urungkan impor** untuk mengembalikan keadaan sebelumnya.

| Data | Kunci pencocokan | Yang istimewa |
|---|---|---|
| Siswa | NIS | Siswa yang sudah ada diperbarui (hanya kolom berisi) atau dilewati. Jenis kelamin, agama, golongan darah, dan tanggal dinormalkan. Angka 0 di depan nomor HP yang hilang di Excel dikembalikan. Penulisan kelas diseragamkan dengan data yang ada |
| Tabungan | Siswa (NIS, atau nama) + tanggal + jenis + jumlah | Kolom *Jenis + Jumlah* atau *Setoran/Penarikan* terpisah. Saldo dihitung berjalan sehingga penarikan yang melebihi saldo ditolak sebelum dikirim ke server. Baris identik yang sudah ada dilewati (aman diimpor dua kali) |
| Iuran | Siswa + bulan | Format daftar, atau **matriks** (kolom Jan sampai Des): angka = nominal, tanda `v`/`lunas` = iuran per bulan di Pengaturan |
| Absensi | Siswa + tanggal | Format daftar, atau **matriks** (kolom berjudul tanggal) berisi H/S/I/A |
| Kas | Tanggal + jenis + jumlah + keterangan | Kolom *Pemasukan/Pengeluaran* terpisah didukung |
| Agenda, Pengumuman | Tanggal + judul | Tanggal pengumuman kosong memakai hari ini |

Setiap wizard punya **Unduh template Excel**: kolom NIS/NISN/HP sudah berformat Teks, daftar siswa terisi otomatis pada template tabungan, iuran, dan absensi, dan lembar *Petunjuk* menjelaskan tiap kolom.

Catatan teknis:
- Pembaca .xlsx ditulis di atas `fflate` (disertakan di `public/vendor/`, lisensi MIT) tanpa SheetJS, dan hanya membaca nilai tersimpan: formula dan makro tidak dijalankan. Tanggal Excel (termasuk sistem 1904), angka berformat Indonesia (`Rp 1.250.000`), CSV dengan pemisah `,` `;` atau tab, dan encoding Windows-1252 didukung. Format lama **.xls tidak didukung**; simpan ulang sebagai .xlsx.
- Penarikan tabungan dikirim berurutan menurut tanggal (setoran lebih dulu pada hari yang sama) agar lolos penjaga saldo di server (`guard_saldo`).
- Urungkan hanya tersedia di layar hasil impor. Setelah dialog ditutup, gunakan cadangan (*Pengaturan > Data*) bila perlu mengembalikan data.

## Layar masuk

Tampilan dua kolom di desktop: panel merek (logo dan nama sekolah dari cache perangkat, nilai jual, tiga fitur utama) dan form di sisi kanan. Di ponsel berubah menjadi header merek dengan lembar form di bawahnya. Mengikuti tema terang/gelap dan memuat tombol ganti tema di pojok.

- Tab **Masuk / Daftar** dalam satu form; email terbawa saat berpindah tab, daftar menambah kolom *Ulangi kata sandi*.
- Validasi per kolom (format email, panjang sandi, kecocokan sandi) dengan penanda `aria-invalid` dan fokus otomatis ke kolom yang salah.
- Ikon mata untuk menampilkan sandi, peringatan **Caps Lock**, tombol dengan status *Memproses…* (mencegah kirim ganda), dan atribut `autocomplete` yang benar agar pengelola kata sandi peramban bekerja.
- Pesan galat Supabase diterjemahkan ke bahasa Indonesia (sandi salah, email sudah terdaftar, terlalu banyak percobaan, tidak ada koneksi, dan lainnya).
- Layar *Menunggu persetujuan* memakai tampilan yang sama.
- Logo sekolah tampil di layar masuk setelah login pertama di perangkat tersebut (disimpan di cache karena data sekolah belum bisa dibaca sebelum login).


### Kop sekolah dan nama aplikasi (v2.13, migrasi 014)

- Layar masuk menampilkan logo sekolah berukuran besar dengan kop: instansi induk, nama sekolah, alamat, dan telepon, dipisah garis ganda seperti kop surat. Isinya diambil dari **Pengaturan > Umum**.
- Tulisan **SekolahHub** dapat diganti admin di **Pengaturan > Umum > Nama aplikasi** (maksimal 40 karakter). Nama baru tampil di menu samping, layar masuk, judul tab, tampilan mobile, dan cetakan. Kosongkan lalu simpan untuk kembali ke "SekolahHub".
- Jalankan `supabase/migrations/014_nama_aplikasi.sql` sekali di SQL Editor. Migrasi menambah kolom `app_nama` dan fungsi `brand_publik()` yang hanya mengembalikan nama aplikasi, nama sekolah, logo, instansi, alamat, dan telepon (data non-sensitif) agar kop tampil juga di perangkat yang baru dipakai sebelum login. Tanpa migrasi, kop tetap tampil dari salinan perangkat setelah login pertama, dan nama aplikasi tetap "SekolahHub".
- Kotak **Masuk** dan **Daftar** kini berukuran sama di desktop (tinggi tetap; isi menggulir di dalam kotak bila layar sangat pendek). Di ponsel, lebar dan posisi tab identik.

### Absensi: pembatalan dan laporan cetak (v2.14.3)
- Absensi yang salah input bisa dibatalkan: klik ulang pilihan aktif, tombol **Batal** per siswa, atau **Kosongkan hari ini** untuk satu kelas.
- Menu **Kelas > Absensi** punya dua tab: **Catat harian** dan **Laporan**. Tab Laporan mencetak laporan kehadiran per periode (bulan atau semua periode) dan per kelas, dalam bentuk rekap per siswa atau matriks harian. Tersedia ekspor CSV (pilihan kelas dan bulan ikut terbawa saat berpindah tab).

### Pembukaan tanpa kedipan (v2.14.1)

- Aplikasi menampilkan layar pembuka (splash) seketika dari HTML. Perangkat yang sudah login melihat logo dan nama sekolah; perangkat yang belum login melihat indikator memuat netral, karena salinan merek di perangkat bisa sudah usang bila admin mengganti logo.
- Data merek terbaru diminta ke server **bersamaan** dengan pemeriksaan sesi, lalu layar masuk digambar sekali dengan kop yang benar. Tidak ada lagi logo lama atau lambang bawaan yang berganti setelah beberapa detik.
- Bila server lebih lambat dari 1,2 detik, layar tampil dengan salinan perangkat lalu kop diganti dengan pemudaran halus setelah logo baru selesai dimuat.

## Voting per akun (v2.14, migrasi 015)

- **Siapa yang memilih:** akun **Siswa** yang sedang login, atas nama siswa yang tertaut ke akunnya. Admin dan pengurus tidak lagi memilihkan suara; mereka membuat pemilihan, memantau partisipasi, dan menutupnya. Siswa yang belum punya akun belum dapat memilih: buat dan tautkan akunnya di menu **Pengguna**.
- **Aturan:** satu akun satu suara per pemilihan, tidak dapat diubah, hanya saat pemilihan dibuka, dan hanya untuk siswa dari **kelas kandidat** (kandidat kelas 5A hanya dipilih siswa 5A).
- **Rahasia:** akun Siswa tidak lagi membaca tabel `voting` (yang memuat siapa memilih siapa). Siswa hanya menerima rekap dan pilihannya sendiri, dan rekap baru tampil setelah pemilihan **ditutup** agar tidak memengaruhi pilihan teman. Admin dan pengurus melihat perolehan suara dan daftar siswa yang belum memilih, tanpa pilihan per orang di layar.
- **Ditegakkan di database:** identitas pemilih diambil dari sesi login di server, bukan dari kiriman aplikasi. Trigger mengabaikan penulisan langsung ke kolom `suara`.
- **Pasang:** jalankan `supabase/migrations/015_voting_per_akun.sql` sekali di SQL Editor setelah migrasi 011 (instalasi baru sudah termasuk di `schema.sql`). Tanpa migrasi, akun Siswa melihat pesan bahwa fitur belum aktif. Setelah itu jalankan `supabase/tests/akses_siswa_check.sql` untuk memverifikasi.
- **Catatan:** pemilihan lama yang suaranya dicatat manual tetap tampil di sisi admin. Akun Siswa tidak lagi melihat daftar suara lama, hanya rekap.

## Pengaturan

Halaman Pengaturan dibagi menjadi tujuh bagian dengan pil navigasi yang ikut menandai posisi saat digulir. Perubahan isian ditampung dulu dan baru disimpan lewat bar **Simpan perubahan** (bisa dibatalkan), serta tidak tertimpa pembaruan realtime saat sedang mengetik.

| Bagian | Isi | Siapa |
|---|---|---|
| Umum | **Logo sekolah** (unggah, hapus), nama sekolah, tahun ajaran, wali kelas, kepala sekolah, alamat, telepon | Admin mengubah; peran lain hanya melihat |
| Keuangan | Iuran per bulan, pesan pengingat WhatsApp dengan tombol sisip kata kunci | Admin mengubah |
| Hak akses | Matriks kemampuan per peran, persetujuan akun baru langsung dari sini, ringkasan jumlah akun per peran | Admin |
| Tampilan | Terang / gelap / ikuti perangkat, atur layanan Beranda (mobile) | Semua |
| Data | Ringkasan data, **unduh cadangan (.json)**, **pulihkan dari berkas**, ekspor CSV (siswa, transaksi, iuran, kas, absensi), pindah foto ke Storage, muat ulang data, bersihkan cache | Semua mengunduh; admin memulihkan |
| Akun | Email, peran, **ganti kata sandi**, versi aplikasi, status sinkronisasi, keluar | Semua |
| Zona berisiko | **Mulai tahun ajaran baru** (naik kelas, luluskan siswa, bersihkan data musiman), **hapus data terpilih** | Admin |

Pengamanan tindakan berisiko: pemulihan, tahun ajaran baru, dan penghapusan meminta pengguna mengetik kata kunci (`PULIHKAN`, `TAHUN BARU`, `RESET`), dan **cadangan otomatis diunduh lebih dulu**. Memilih *Data siswa* untuk dihapus otomatis mengunci dan menghapus data turunannya (tabungan, iuran, absensi, struktur, voting) agar tidak ada data yatim. Riwayat aktivitas tidak dapat dihapus dari aplikasi.

Logo disimpan di bucket publik `logo-sekolah` (logo bukan data sensitif dan perlu tampil di layar masuk sebelum login). Gambar otomatis diperkecil ke sisi terpanjang 256 px. Logo tampil di menu samping, app bar mobile, layar masuk (disimpan di cache perangkat), ikon tab, buku tabungan, dan bukti setoran.

**Migrasi 007 (wajib untuk logo).** Database yang sudah berjalan: jalankan `supabase/migrations/007_logo_identitas.sql` sekali di SQL Editor (instalasi baru sudah termasuk di `schema.sql`). Tanpa migrasi, aplikasi tetap berjalan: tombol logo dan kolom tambahan dinonaktifkan dan identitas dasar tetap bisa disimpan.

Perbaikan terkait: CSP di `vercel.json` kini mengizinkan gambar dari `https://*.supabase.co` (sebelumnya foto siswa dari Storage dan logo akan diblokir peramban). Akun tidak lagi bisa mengubah perannya sendiri di halaman Pengguna. Reset lama membuat data tanpa koleksi iuran, absensi, dan log sehingga beberapa halaman bisa error sesudahnya; kini semua koleksi selalu dibuat ulang.

## Mode terang dan gelap

Pengguna dapat memilih **Terang**, **Gelap**, atau **Ikuti perangkat** (bawaan). Pilihan disimpan di perangkat (`localStorage`, kunci `sh.theme`) dan langsung berlaku tanpa memuat ulang.

| Tempat memilih | Keterangan |
|---|---|
| Top bar (desktop) | Ikon matahari/bulan, membuka daftar pilihan |
| Menu avatar | Baris "Tampilan" untuk berganti cepat (terang → gelap → ikuti perangkat) |
| Pengaturan (desktop) dan Akun (mobile) | Tiga kartu pratinjau, juga tersedia untuk peran orang tua |
| Layar masuk | Tombol bulat di pojok kanan atas |

Cara kerjanya:

- `js/theme.js` dimuat di `<head>` setelah CSS, sehingga atribut `data-theme="light|dark"` pada `<html>` terpasang **sebelum halaman pertama digambar** (tanpa kedipan).
- Di `css/style.css`, blok `:root` memuat token tema gelap dan `:root[data-theme=light]` memuat token tema terang. **Tidak ada warna mentah di komponen**: hover, isian, garis, bayangan, scrim, snackbar, dan gradien kartu promo semuanya berupa token (`--w1…--w4`, `--ln`, `--bd2`, `--sh*`, `--scrim`, `--snb`, `--pa1`, dll.). Komponen baru cukup memakai token yang ada.
- Grafik SVG di `app.js` memakai `var(--ok)`, `var(--er)`, dan seterusnya, sehingga ikut berganti otomatis. Pendar (`drop-shadow`) pada grafik hanya aktif di tema gelap.
- Saat memilih "Ikuti perangkat", aplikasi mengikuti perubahan tema sistem secara langsung. Antar tab di peramban yang sama juga tersinkron.
- Warna bilah status / address bar (`<meta name="theme-color">`) dan `color-scheme` (kontrol bawaan peramban seperti kalender dan scrollbar) ikut berganti.
- Cetak selalu terang (hitam di atas putih) pada kedua tema.

Pilihan warna tema terang diukur dengan rasio kontras WCAG: seluruh teks, termasuk warna semantik (hijau, merah, amber, indigo) di atas kartu putih, berada di atas 4,5:1.

| Token | Gelap | Terang |
|---|---|---|
| `--bg` latar | `#0a1214` | `#edf4f4` |
| `--sf2` permukaan | `#142529` | `#ffffff` |
| `--tx` teks | `#e8f0f1` | `#0e2427` |
| `--mu` teks redup | `#8fa4a8` | `#4e676b` |
| `--pr` merek | `#5fd0cb` | `#0a7571` |
| `--pt` teks di atas isian merek | `#06201f` | `#ffffff` |
| `--ok` / `--er` / `--ac` / `--inf` | `#4cc58a` / `#ff8a84` / `#f0b72f` / `#8b9cff` | `#127a57` / `#c0362e` / `#9a6000` / `#4856c8` |

**Sinkron antar perangkat (opsional).** Jalankan `supabase/migrations/006_preferensi_tema.sql` sekali (instalasi baru sudah termasuk di `schema.sql`). Setelah itu pilihan tema tersimpan di akun dan ikut ke perangkat lain; bila akun sudah punya pilihan, itu yang dipakai. Tanpa migrasi, aplikasi tetap berjalan dan tema hanya tersimpan per perangkat. Tabelnya sengaja terpisah dari `profiles` agar pengguna tidak mendapat hak mengubah baris profilnya (yang memuat peran).

Catatan: `manifest.webmanifest` tidak bisa berganti warna per tema, jadi layar pembuka (splash) aplikasi yang dipasang ke layar utama tetap gelap sesaat sebelum aplikasi tampil.

## Panduan warna

Seluruh warna diatur dari token di bagian atas `public/css/style.css` (satu set untuk gelap, satu set untuk terang). Aturannya sama di semua halaman dan grafik:

| Makna | Token | Dipakai untuk |
|---|---|---|
| Merek, netral | `--pr` (teal) | Saldo, total, ranking, tombol utama, menu aktif |
| Masuk, baik | `--ok` (hijau) | Setoran, kas masuk, lunas, hadir, perubahan positif |
| Keluar, buruk | `--er` (koral) | Penarikan, kas keluar, belum bayar, alpa, perubahan negatif |
| Peringatan, sebagian | `--ac` (amber) | Iuran sebagian, sakit, target, peringatan |
| Kategori lain | `--inf` (indigo), `--rose` | Izin, kelas ketiga dan keempat pada grafik |

Untuk mengganti identitas warna sekolah, ubah `--pr`, `--pr2`, dan `--ac` **di kedua blok tema** (gelap: warna terang agar menyala di latar gelap; terang: warna lebih dalam agar teks tetap terbaca, rasio ≥ 4,5:1 di atas putih). Efek cahaya, batas, dan latar mengikuti otomatis.

## Peran pengguna

| Peran | Akses |
|---|---|
| pending | Akun baru, belum bisa membuka data |
| viewer | Hanya melihat |
| pengurus | Mengelola siswa, tabungan, kas, agenda, pengumuman, voting, struktur |
| ortu | Orang tua: hanya data anak yang ditautkan, plus pengumuman dan agenda |
| admin | Semua, termasuk pengaturan sekolah dan menu **Pengguna** untuk menyetujui akun |

Akun baru berstatus pending. Admin menyetujuinya lewat menu **Pengguna**.

## Catatan keamanan

- Anon key memang publik. Data dilindungi oleh Row Level Security di `schema.sql`, jadi jangan menonaktifkannya.
- Jangan pernah memasukkan `service_role` key ke frontend atau repository.
- Penarikan melebihi saldo ditolak oleh database (trigger `guard_saldo`), bukan hanya oleh tampilan.
- `vercel.json` memakai `'unsafe-inline'` pada script karena antarmuka memakai atribut `onclick`.
- Voting (sejak v2.14): suara hanya masuk lewat fungsi `beri_suara()` yang mengunci baris pemilihan, sehingga suara bersamaan tidak saling menimpa dan tidak bisa dipalsukan dari aplikasi. Menyimpan ulang atau memulihkan cadangan tidak mengubah suara yang sudah masuk (cadangan lama tidak membawa suara).
