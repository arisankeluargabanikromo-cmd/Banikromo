# FamilyHub — Arisan & Family Network
Frontend statis (HTML/CSS/JS) + **Supabase** (Postgres, Auth, RLS) · deploy via **GitHub → Vercel**.

```
public/            index.html, app.js (tampilan), data.js (lapisan Supabase), config.js
supabase/          schema.sql (wajib, sudah mencakup semua fitur), seed.sql (opsional),
                   patch-001 … patch-014 (HANYA untuk yang sudah terlanjur memakai versi lama),
                   demo-500-keluarga.sql (opsional, data uji 500 orang)
scripts/           gen-config.js (isi config.js dari env var saat build Vercel)
supabase/base/      skema dasar v3.9.1 (beku); supabase/migrations/ = format Supabase CLI (dihasilkan otomatis)
tests/             drift.test.mjs (skema tidak melenceng), schema.test.mjs (uji SQL di Postgres sungguhan via PGlite), frontend.test.mjs (uji UI di jsdom) — `npm test`
public/vendor/     supabase-js & SheetJS yang di-host sendiri (lihat vendor/README.md)
vercel.json        outputDirectory = public
```

## 1) Siapkan Supabase
1. https://supabase.com → **New project** (pilih region Singapore).
2. **SQL Editor → New query** → tempel isi `supabase/schema.sql` → **Run**.
3. (Opsional) jalankan `supabase/seed.sql` untuk data contoh.
4. **Authentication → Providers → Email**: aktif. Untuk percobaan, matikan *Confirm email* agar bisa langsung login.
5. **Project Settings → API**: salin **Project URL** dan **anon public key**.

> **Sudah menjalankan versi sebelumnya?** Jangan jalankan ulang `schema.sql`. Cukup jalankan `supabase/patch-001-ensure-profile.sql`
> (bila belum) lalu `patch-002-foto-pengguna.sql`, `patch-003-silsilah.sql`, `patch-004-foto-status.sql`, dan **`patch-005-pengocokan-ulang.sql`**, lalu **`patch-006-keuangan.sql`**, dan **`patch-007-silsilah-asli.sql`** (berurutan) di SQL Editor.
> Patch 001–004 aman diulang. Patch 005 cukup dijalankan sekali; data undian lama tetap aman (otomatis berstatus *sah*).

## 2) Jalankan lokal (opsional)
Edit `public/config.js` dengan URL & anon key, lalu `npm run dev` → buka alamat yang ditampilkan.

## 3) Push ke GitHub
```bash
git init && git add . && git commit -m "FamilyHub + Supabase"
git branch -M main
git remote add origin https://github.com/USERNAME/familyhub.git
git push -u origin main
```

## 4) Deploy di Vercel
1. https://vercel.com → **Add New → Project** → impor repo GitHub tadi. Framework: **Other**.
2. **Environment Variables**: `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (nilai dari langkah 1.5).
3. **Deploy**. Setiap `git push` otomatis memperbarui situs.
4. Di Supabase → **Authentication → URL Configuration**: isi **Site URL** dengan alamat Vercel Anda
   (mis. `https://familyhub.vercel.app`) agar link konfirmasi email benar.

## 5) Akun & peran
- Buka situs → **Daftar akun baru**. **Akun pertama otomatis menjadi admin**; akun berikutnya berstatus **menunggu persetujuan** — admin menyetujuinya di *Akun & Pengguna → Kelola Pengguna* (sejak v3.10).
- **Daftarkan akun admin Anda segera setelah deploy**: pendaftar pertama selalu menjadi admin.
- Jadikan admin tambahan (SQL Editor): `update profiles set role='admin' where id=(select id from auth.users where email='email@anda.com');`

## Keamanan
- Anon key memang publik; yang melindungi data adalah **Row Level Security** dan fungsi SQL di server. Sejak v3.10, **hanya akun yang disetujui admin** yang bisa membaca data — pendaftar baru melihat layar "Menunggu persetujuan" dan database menolak semua permintaan data mereka (tabel, fungsi RPC, dan foto di Storage).
- Hanya admin yang boleh menulis (pengelola silsilah: hanya anggota & silsilah).
- Pencatatan iuran, undian, dan laporan berjalan sebagai fungsi SQL di server (tidak bisa dimanipulasi dari browser). Baris kas hasil pembayaran iuran **dikunci**: tidak bisa diubah/dihapus langsung, hanya lewat *Batalkan pembayaran*.
- **Jejak audit** (tabel `audit_log`): perubahan buku kas, pembatalan pembayaran, tarif iuran, dan peran/persetujuan pengguna tercatat dengan nilai lama & baru. Hanya admin yang bisa membacanya; tidak bisa diubah dari aplikasi dan tidak ikut terhapus oleh Reset/Pemulihan.
- Pengundian memakai UUID acak kriptografis, sekali per bulan, tersimpan dengan kode bukti SHA-256.
- Header keamanan (CSP, anti-framing, nosniff, dll.) diatur di `vercel.json`. Pustaka pihak ketiga di-host sendiri (`public/vendor`), jadi tidak ada skrip dari CDN.
- **Jangan pernah** memasang `service_role` key di frontend atau Vercel env publik.
- Opsional, lapisan tambahan: setelah semua anggota keluarga punya akun, matikan pendaftaran publik di Supabase → **Authentication → Sign In / Providers → "Allow new users to sign up"** (admin tetap bisa mengundang lewat *Authentication → Users → Invite*). Catatan: pendaftar yang diundang tetap berstatus menunggu sampai disetujui.
- Bila memakai *custom domain* Supabase, tambahkan domain itu ke `connect-src` dan `img-src` pada CSP di `vercel.json`.

## Troubleshooting login
Pesan kesalahan kini tampil langsung di kotak login (merah) dan di konsol browser (F12 → Console).
| Pesan / gejala | Penyebab & solusi |
|---|---|
| "Tidak bisa terhubung ke Supabase" / alert "Supabase belum dikonfigurasi" | `SUPABASE_URL`/`SUPABASE_ANON_KEY` salah atau belum diisi. Di Vercel: isi env var lalu **Redeploy**. Lokal: edit `public/config.js`. |
| "Email belum dikonfirmasi" | Buka email konfirmasi, atau matikan *Confirm email* di Authentication → Providers → Email. |
| "Email atau password salah" | Akun belum ada → klik **Daftar akun baru** dulu. |
| "Profil tidak ditemukan" / error fungsi `ensure_profile` | `schema.sql` belum dijalankan penuh. Jalankan `schema.sql`, atau bila sudah pernah, jalankan `supabase/patch-001-ensure-profile.sql`. |
| Berhasil login tapi data kosong / error di dashboard | Skema belum lengkap. Jalankan ulang di project kosong, lalu `seed.sql` (opsional). |

## Fitur lanjutan (v2.1)
- **Album foto**: klik album → unggah banyak foto sekaligus (otomatis diperkecil ke maks 1600px di browser), tampilan galeri + lightbox (panah ◀ ▶ / Esc), hapus foto (admin). Foto disimpan di **bucket privat** Supabase Storage dan ditampilkan lewat URL bertanda tangan (berlaku 1 jam) — hanya pengguna login yang bisa melihat. Menghapus album ikut menghapus filenya.
- **Pengingat iuran WhatsApp**: di halaman Arisan, tombol 💬 *Ingatkan* per anggota (pesan ke nomor HP anggota) dan 💬 *Ingatkan grup* (daftar yang belum bayar, tinggal pilih grup WhatsApp). Isi nomor HP di menu Anggota → Ubah.
- **Riwayat di profil anggota**: iuran 12 bulan terakhir dan bulan menang arisan.
- **Pengguna & Hak Akses** (menu khusus admin): ubah peran admin/viewer. Sistem mencegah tidak adanya admin sama sekali.
- **PWA**: di HP buka situs → menu browser → *Tambah ke layar utama*; tampil seperti aplikasi.

Batas Supabase gratis (Storage 1 GB) cukup untuk ±3.000 foto setelah diperkecil.

## Perbaikan tampilan (v2.2)
- **Sidebar tidak lagi tumpang tindih**: daftar menu berada di area yang bisa di-scroll (ada penanda pudar bila masih ada menu di bawah), kartu pengguna selalu menempel di bawah. Pada layar pendek jarak menu dirapatkan otomatis.
- **Mode terang menyeluruh**: sidebar, banner, panel undian, dan layar login ikut berganti tema (warna sidebar kini memakai variabel `--sb-*` di `public/style.css`). Warna bilah browser di HP juga ikut tema.
- **HP**: ikon menu kini tampil (sebelumnya tersembunyi oleh aturan CSS lama) dan ada tombol Keluar di topbar.

## Silsilah skala besar — hingga ratusan anggota (v2.3)
**Data baru per anggota:** jenis kelamin (♂/♀), pasangan (suami/istri), status pernikahan (menikah/cerai), tahun lahir, tahun wafat.
**Generasi dihitung otomatis** oleh database dari hubungan keluarga (tidak perlu diketik): leluhur = 1, anak = orang tua + 1, menantu mengikuti generasi pasangannya — termasuk anak yang tercatat pada orang tua yang masuk keluarga lewat pernikahan.

**Cara mencatat hubungan**
- *Orang tua*: pilih salah satu (ayah **atau** ibu) — anak otomatis tampil di bawah kartu pasangan tersebut.
- *Pasangan*: pilih pasangannya. Satu orang boleh punya lebih dari satu pasangan (menikah lagi): semua tampil dalam satu kartu keluarga; yang cerai ditandai ✕, yang wafat ditandai †.
- Dari profil anggota (admin): tombol **＋ Anak** dan **＋ Pasangan** mengisi hubungan otomatis — cara tercepat memasukkan data.

**Tampilan Pohon:** kartu pasangan berwarna (biru ♂ / merah muda ♀, almarhum diredupkan), cabang bisa dilipat/dibuka (badge **+N** = jumlah keturunan di dalamnya), geser dengan seret, zoom dengan Ctrl+scroll / cubit / tombol ＋－, **minimap** untuk melompat, pencarian nama yang langsung memusatkan & menyorot orangnya, **Fokus cabang** (⤢) untuk menampilkan satu cabang saja, pilihan *Generasi s/d*, dan tombol Pas layar. Keluarga kecil otomatis muat satu layar; keluarga besar dibuka secara bertahap.
**Tampilan Daftar:** daftar berindentasi yang ringkas — bawaan di HP.
**Belum terhubung:** anggota tanpa orang tua/pasangan/anak ditampilkan terpisah agar mudah dilengkapi.

**Impor CSV (admin)** — untuk memasukkan ratusan anggota sekaligus: menu Silsilah/Anggota → *Impor CSV* → unduh template → isi di Excel/Google Sheets (pemisah `;` atau `,` keduanya didukung) → simpan CSV → unggah. Hubungan ditulis lewat kolom **kode** bebas (A1, A2, …):
`kode;nama;jk;kode_ortu;kode_pasangan;status_pasangan;lahir;wafat;hubungan;telepon`
Impor bersifat **atomik**: bila ada satu baris salah (mis. jenis kelamin tak dikenal, kode ganda, kode orang tua tidak ada) seluruh impor dibatalkan dan pesan menyebut nomor barisnya. Maksimal 2000 baris per impor.

**Uji dengan 500 anggota:** di project percobaan, jalankan `supabase/demo-500-keluarga.sql` (data fiktif, 5 generasi, poligami, cerai, wafat, dan anggota belum terhubung). Hapus kembali dengan `delete from members where phone = 'DEMO';`.

**Catatan**
- Anggota yang ditandai punya dua orang tua dari keluarga yang sama (mis. sepupu menikah) tampil di bawah satu orang tua dan ditautkan lewat chip ↪ di keluarga lainnya.
- Menghapus orang tua tidak menghapus anaknya; anak menjadi cabang tersendiri sampai dihubungkan lagi.
- Siklus hubungan yang keliru (A anak B, B anak A) dicegah di form dan tidak membuat aplikasi macet bila terlanjur ada di data.

## Foto profil, status pernikahan & silsilah yang lebih mudah dipahami (v2.4)

**Foto profil anggota** (admin): buka profil → ikon 📷 (atau tombol *Foto*) → pilih foto → seret & zoom untuk mengatur posisi wajah → Simpan. Foto disimpan di bucket **privat** `photos` dalam dua ukuran: kecil 96 px (kartu, daftar, tabel) dan besar 480 px (profil), ditampilkan lewat URL bertanda tangan (1 jam). Foto hanya dimuat untuk kartu yang sedang tampil, jadi tetap ringan walau 500 anggota. Mengganti/menghapus foto otomatis membersihkan berkas lama, begitu juga saat anggota dihapus. Kapasitas: ±50 KB per orang, sehingga 500 anggota ≈ 25 MB dari 1 GB gratis. Format HEIC (iPhone) belum didukung — gunakan JPG/PNG/WebP.

**Status pernikahan**: *Belum menikah · Menikah · Cerai · Cerai mati (Duda/Janda)*. Bila pasangan sudah dicatat, status **dihitung otomatis** dari hubungan itu (pasangan wafat → Duda/Janda; semua hubungan berstatus cerai → Cerai); isian manual dipakai untuk anggota tanpa pasangan tercatat. Memilih pasangan pada form otomatis menjadikan status *Menikah*. Status tampil sebagai label di kartu pohon, daftar, tabel Anggota (dengan filter), dan profil. Anggota lama yang statusnya kosong: tombol **Isi otomatis “Belum menikah”** di halaman Silsilah (khusus admin) menandai yang tidak punya pasangan tercatat sekaligus. Kolom CSV impor: `status_nikah` (belum menikah / menikah / cerai / cerai mati / duda / janda).

**Agar pohon mudah dipahami**
- **Penggaris & pita generasi** di tepi kiri: "Generasi 3 · lahir 1950–1984", pita berselang-seling sejajar tiap baris, mengikuti zoom dan geser.
- **Label “dari Nadia”** pada anak di keluarga dengan beberapa pasangan, agar jelas anak siapa.
- **Sorot garis keturunan** (profil → 🧬): leluhur dan seluruh keturunan disorot, cabang lain diredupkan; hapus dengan tombol ✕ atau Esc.
- **Ringkasan cabang** saat Fokus cabang: jumlah orang, generasi, ♂/♀, wafat, belum menikah.
- **Kartu lebih detail**: foto, usia, label status, tooltip lengkap (nama, usia, status, pasangan); nama depan dibaca tanpa gelar (H., Hj., Dr.).
- **Profil lebih lengkap**: kedudukan ("Cicit dari Abdullah & Siti", "Istri dari Ilham"), Ayah/Ibu, "Anak ke-2 dari 5 bersaudara", **garis leluhur** yang bisa diklik, status pernikahan dengan keterangan (mis. "Menikah dengan almarhum …"), serta riwayat iuran.

## Panggung Pengocokan layar penuh, STOP & kocok ulang (v2.5)
Halaman **Pengocokan Digital** kini punya *panggung* khusus untuk acara arisan (ideal disambungkan ke proyektor/TV):

- **Layar penuh** — tombol ⛶ di panggung (atau tombol *Layar Penuh* di halaman). Pintasan keyboard: `Spasi` Mulai/Stop · `F` layar penuh · `M` suara · `Esc` tutup. Layar tidak mati selama panggung terbuka (Wake Lock). Di iPhone yang tidak mendukung Fullscreen API, panggung tetap memenuhi layar.
- **Tampilan atraktif** — latar aurora & sorot lampu, daftar nama berputar dengan efek *motion blur*, melambat lalu mendarat di nama pemenang, confetti, efek suara (bisa dimatikan), dan kartu pemenang dengan foto profil bila ada.
- **MULAI → STOP** — reel berputar sampai admin menekan **STOP**. Saat STOP ditekan, *server* mengacak pemenang (crypto random) lalu animasi mendarat tepat di hasil itu; waktu menekan tombol tidak mempengaruhi hasil.
- **Konfirmasi kehadiran** — pemenang tampil sebagai *pemenang sementara*. Admin memilih:
  - **✓ Hadir — Sahkan** → pemenang disahkan, periode selesai.
  - **✗ Tidak hadir — Kocok ulang** → dicatat *tidak hadir*, dilewati untuk periode ini, lalu dikocok ulang dari peserta yang tersisa. Peserta yang tidak hadir **tidak dihitung menang**, sehingga masih bisa menang di bulan berikutnya. Kedua tombol memakai *ketuk dua kali* agar tidak salah pencet.
  - Bila semua peserta eligible sudah dilewati → tombol **Panggil ulang yang tidak hadir**.
- **Aman & dapat diaudit** — setiap kocokan (termasuk yang tidak hadir) tersimpan beserta nomor kocokan, status, dan kode bukti; riwayat menampilkan semuanya. Pemenang sementara tersimpan di database, jadi refresh / tutup layar tidak menghilangkannya, dan kocokan baru tidak bisa dimulai sebelum pemenang sementara diputuskan (mencegah mengocok berulang sampai "cocok").
- Pengguna *viewer* bisa membuka panggung untuk menonton, tetapi hanya admin yang bisa mengocok/konfirmasi.

**Upgrade dari v2.4:** jalankan `supabase/patch-005-pengocokan-ulang.sql` sekali di SQL Editor, lalu deploy ulang. Instalasi baru cukup menjalankan `schema.sql` terbaru.

**Pemenang sudah terlanjur disahkan tetapi tidak hadir?** Di halaman Pengocokan (atau di panggung) tekan **↩ Pemenang tidak hadir — Kocok ulang**. Pemenang dicatat tidak hadir (jejak tetap ada), tidak dihitung menang, dan pengocokan dibuka lagi. Gunakan `patch-005` yang terbaru agar fungsi `reopen_draw` tersedia.

## Keuangan profesional: Iuran Arisan & Iuran Wajib, dua dana, laporan siap cetak (v2.6)

### Konsep pembukuan
| | **Iuran Arisan** | **Iuran Wajib** |
|---|---|---|
| Dibukukan ke | **Dana Arisan** (dana titipan) | **Kas Wajib** (milik bersama) |
| Penggunaan | Dicairkan ke pemenang arisan | Operasional & sosial (konsumsi, santunan, acara) |
| Syarat ikut kocok | Ya (bawaan) | Tidak (bawaan; bisa dijadikan syarat di *Atur iuran*) |
| Tarif bawaan | sesuai pengaturan lama | Rp 50.000 — **ubah di Keuangan → Iuran → ⚙ Atur iuran** |

Saldo kedua dana dibukukan **terpisah**, sehingga uang titipan arisan tidak tercampur dengan kas keluarga. Setiap pembayaran otomatis menjadi transaksi pada dana yang sesuai.

### Fitur
- **Keuangan** (4 tab): *Ringkasan* (saldo per dana, grafik arus kas, progres kedua iuran, pencairan tertunda) · *Iuran* (catat per anggota per jenis per periode) · *Buku Kas* (saldo berjalan, filter dana/tanggal/cari, transaksi manual berkategori) · *Tunggakan*.
- **Kuitansi bernomor** (`ARISAN-2610-00012`, `WAJIB-2610-00031`) dengan terbilang, siap cetak. Metode bayar: Tunai / Transfer / Lainnya.
- **Tunggakan** per anggota per bulan sejak iuran mulai berlaku; **lunasi beberapa bulan sekaligus**; pengingat WhatsApp pribadi/grup.
- **Pencairan arisan**: setelah pemenang disahkan, tombol *Cairkan* mencatat pengeluaran Dana Arisan ke pemenang. Iuran susulan yang masuk belakangan muncul sebagai **pencairan susulan**. Iuran arisan yang sudah dicairkan tidak bisa dibatalkan sebelum pencairannya dibatalkan.
- **Pembatalan pembayaran** wajib beralasan dan tercatat di log aktivitas. Mengubah tarif **tidak** mengubah pembayaran lama.
- **Syarat kocok** mengikuti iuran yang ditandai *wajib lunas untuk ikut kocok* (otomatis dipakai halaman Pengocokan).
- **Laporan** (menu Laporan): *Laporan Keuangan* (A. posisi kas per dana · B. rincian per kategori · C. realisasi & kepatuhan iuran · D. pencairan arisan · E. tunggakan), *Buku Kas*, *Rekap Kepatuhan Iuran* (matriks 12 bulan), *Daftar Tunggakan*. Periode: bulan ini/lalu, kuartal, tahun, atau tanggal bebas. Keluaran: **Cetak/PDF A4** (kop organisasi + tanda tangan Ketua & Bendahara), **Excel (.xlsx)** (angka numerik, satu lembar per tabel) dan **CSV**. Nama organisasi, Ketua, dan Bendahara diatur di *⚙ Identitas laporan*.
- Dashboard menampilkan saldo per dana dan status kedua iuran.

### Upgrade dari v2.5
1. Jalankan `supabase/patch-006-keuangan.sql` **sekali** di SQL Editor (aman diulang), lalu deploy ulang. Instalasi baru cukup `schema.sql` terbaru.
2. Data lama tetap utuh: semua pembayaran lama menjadi **Iuran Arisan**; transaksi manual lama masuk **Kas Wajib** — periksa di *Buku Kas → Ubah* bila ada yang seharusnya Dana Arisan (mis. pengeluaran pencairan yang dulu dicatat manual).
3. Atur tarif & tanggal mulai di *Keuangan → Iuran → ⚙ Atur iuran*. Tunggakan dihitung sejak **tanggal mulai berlaku** tiap iuran (bawaan: bulan pertama pembayaran tercatat / bulan ini untuk Iuran Wajib).
4. Pencairan arisan dilacak mulai periode saat patch dijalankan; periode sebelumnya dianggap sudah diselesaikan di luar sistem.

### Catatan teknis
- Target iuran pada laporan = jumlah anggota aktif × tarif berlaku; realisasi = seluruh pembayaran tercatat (termasuk susulan).
- Ekspor Excel memuat pustaka SheetJS dari jsDelivr saat pertama dipakai; bila tidak ada koneksi, otomatis jatuh ke CSV (pemisah `;`, terbuka rapi di Excel berlokal Indonesia).
- Performa teruji pada 500 anggota × 12 bulan × 2 iuran (±10 ribu pembayaran): seluruh fungsi laporan < 110 ms.

## Silsilah: keturunan asli, menantu, dan keluarga besan (v2.7)

Ketika anak-cucu menikah dengan orang dari keluarga lain, keluarga pasangan (orang tua, ipar, kerabat) ikut dicatat. Dulu semuanya bercampur dan **arah pohon bergantung urutan input** (anggota ber-id terkecil menentukan di bawah siapa pasangan digantung), sehingga keluarga besan bisa menjadi "akar" pohon. Kini silsilah memahami **garis keturunan asli**:

| Kelas | Arti | Tampilan |
|---|---|---|
| **Leluhur** | Pendiri garis keturunan asli | Label emas, Generasi 1 |
| **Keturunan asli** | Anak-cucu leluhur, lewat ayah **maupun ibu** | Batang utama pohon, bernomor generasi |
| **Menantu** | Pasangan yang masuk lewat pernikahan | Kartu bergaris putus-putus di samping pasangannya; sejajar generasi pasangan |
| **Keluarga besan** | Keluarga asal menantu (*Besan* = orang tua, *Ipar* = saudara, *Kerabat besan*) | **Cabang terpisah** berwarna amber; tidak pernah menjadi leluhur pohon utama |
| **Keluarga lain** | Tidak terhubung lewat pernikahan | Tersendiri |

- **Pohon & Daftar**: pemilih *🧬 Keturunan asli · 🏠 Keluarga besan · Keluarga lain*. Penggaris generasi hanya untuk keturunan asli, sehingga nomor generasi tidak menyesatkan.
- **Tertaut dua arah**: tombol **⌂** pada menantu membuka keluarga asalnya; di cabang besan, tombol **💍 Fitri · menikah dengan Edi ↪** kembali ke pohon utama.
- **Profil** memuat blok *Hubungan dengan keturunan asli* (mis. "Istri dari Budi (menantu) • sejajar Generasi 2 • Keluarga asal: Pak Darmo & Bu Darmo"). Pencarian dan menu Anggota menampilkan label dan filter garis keluarga.
- **Catat keluarga asal**: pada profil menantu tersedia **＋ Catat orang tua**.
- **Otomatis, bukan input manual**: klasifikasi dihitung dari relasi yang sudah ada. Leluhur dideteksi otomatis (keluarga dengan keturunan terbanyak; keturunan hasil pernikahan antar-keluarga dibagi adil agar tidak dihitung ganda). Bila dua keluarga sebanding, muncul peringatan **Mohon konfirmasi**. Admin dapat menegaskan lewat **Atur** (pilih satu atau beberapa leluhur utama; kembali ke Otomatis kapan saja).
- **Besan tidak ikut arisan secara tak sengaja**: bilah info menawarkan **Nonaktifkan dari arisan** untuk anggota besan yang masih aktif (agar tidak muncul di daftar iuran, tunggakan, dan kocokan). Data silsilah tidak dihapus.

### Upgrade dari v2.6
Jalankan `supabase/patch-007-silsilah-asli.sql` sekali (aman diulang), lalu deploy ulang. Tidak ada data yang diubah; kolom baru hanya penanda leluhur (`lineage_root`).

### Catatan
- Keturunan dihitung **bilateral** (anak dari jalur ayah maupun ibu sama-sama keturunan asli).
- Pilih leluhur **puncak** keluarga. Bila leluhur punya orang tua yang dicatat, tetapkan yang paling atas.
- Nama dengan sapaan (Pak, Bu, Mbah, H., Hj., dll.) dipersingkat tanpa sapaan di label.

## Silsilah yang lebih mudah dipahami (v2.8)
Tanpa perubahan database — cukup deploy ulang. File baru: `public/kinship.js`, `public/silsilah-ux.css`.

**Pohon tampil lebih dulu**
- Hero, statistik, dan toolbar diringkas: 4 angka utama ada di hero, **Statistik** membuka rincian lengkap. Di HP, daftar silsilah kini terlihat di layar pertama (sebelumnya harus menggulir 10 kartu statistik).
- Toolbar dikelompokkan dua baris (cari · tampilan · kelompok · bantuan / kedalaman · buka-tutup · tombol admin). Catatan perapian admin dipindah ke bawah pohon; hanya peringatan yang memengaruhi kebenaran pohon yang tetap di atas.
- **Pembukaan cabang bertahap**: pohon dibuka sedalam yang masih muat & terbaca dalam satu layar (skala ≥ 62%); sisanya ditandai badge **+N**. Tidak lagi terpotong di kiri-kanan saat pertama dibuka. Pita **Gen N** dipadatkan dan pohon disisakan lajur agar kartu tidak tertimpa.

**📍 Posisi saya — sebutan kekerabatan**
Pilih nama Anda sekali (tersimpan di perangkat), lalu setiap kartu pohon/daftar, hasil pencarian, dan profil menampilkan hubungan terhadap Anda: *Ayah, Kakek, Paman, Bibi, Kakak/Adik, Sepupu, Sepupu dua kali, Keponakan, Menantu, Mertua, Ipar, Pasangan sepupu, Mantan istri/suami* dst., lengkap dengan alasannya (mis. “Anak dari Budi, adik dari Ahmad (ayah Anda)”). Kartu Anda diberi cincin **Anda**; tampilan otomatis berpusat di sana.
- Garis ayah **dan** ibu ditelusuri, termasuk anak yang tercatat di bawah ibu yang berasal dari keluarga besan.
- Istilah dapat dipilih: **Umum** (Paman/Bibi, Kakek/Nenek) atau **Jawa** (Pakde/Bude bila lebih tua dari orang tua, Paklik/Bulik bila lebih muda, Mbah Kakung/Putri). Pakde/Paklik memerlukan tahun lahir; tanpa itu dipakai Paman/Bibi.
- Batasan: model data hanya mencatat satu orang tua per anak, sehingga tiri/kandung tidak dibedakan; hubungan lewat dua pernikahan berantai ditampilkan sebagai “Kerabat lewat pernikahan”.

**❓ Panduan “Cara membaca silsilah”** — tombol selalu tersedia (juga di HP) berisi contoh kartu nyata: pasangan, cerai, almarhum, leluhur, menantu, besan, arti **+N**, ⤢, ⌂, ↪, pita generasi, dan cara menjelajah. Pengguna baru melihat ajakan sekali (bisa ditutup).

**Profil bertab**: *👪 Keluarga* (hubungan dengan Anda → orang tua → pasangan → anak → saudara → garis leluhur → status) dan *💰 Arisan & iuran*. Tombol dijelaskan lebih jelas (“Sorot leluhur & keturunan”, “Tampilkan cabang ini saja”).

## Profil keluarga ala Facebook + alamat (v2.9)
**Upgrade dari v2.8:** jalankan `supabase/patch-008-alamat.sql` **sekali** di SQL Editor (aman diulang, tidak mengubah data), lalu deploy ulang. Instalasi baru cukup `schema.sql` terbaru. Sebelum patch dijalankan, aplikasi tetap normal — hanya kolom alamat yang disembunyikan (admin diberi petunjuk di profil).

- **Halaman profil besar** (hingga 1120 px, hampir layar penuh; layar penuh di HP): **sampul** berwarna (biru/merah muda sesuai jenis kelamin; bila ada foto, fotonya dikaburkan jadi latar sampul), **foto profil bulat besar** yang menimpa sampul, nama, kedudukan, dan tombol aksi.
- **Kolom Intro** tetap terlihat di kiri: 🏠 alamat (+ tautan **Buka di peta**), 🎂 lahir & usia, 🕊 wafat, 💍 status pernikahan, 📞 HP (+ tautan **WhatsApp**), 👪 urutan anak, 🧬 kedudukan, jumlah anak/saudara/keturunan.
- **Tab**: 👪 *Keluarga* (orang tua, pasangan, anak, saudara sebagai **kotak foto** seperti daftar teman — klik untuk berpindah profil; garis leluhur; sebutan hubungan dengan Anda) · ℹ️ *Tentang* (informasi dasar, kontak & alamat, pernikahan, posisi dalam silsilah) · 💰 *Arisan & iuran*.
- **Alamat**: kolom baru di form **Tambah/Ubah Anggota** (teks bebas, boleh beberapa baris) dan di **Impor CSV** (kolom `alamat`; template diperbarui).

## Pengocokan pindah ke Dashboard (v3.0)
Tanpa perubahan database — cukup deploy ulang. Menu **Pengocokan Digital** di sidebar dihapus; fungsinya kini ada di **Dashboard**, tepat di bawah banner sambutan.
- **Kartu pengocokan** (gaya panggung mini): periode & siklus, status (*Siap diundi · Menunggu konfirmasi · Sudah diundi · Belum ada peserta*), pemenang dengan foto & mahkota, serta tombol **Mulai / Lanjutkan / Lihat pemenang**, **⛶ Layar penuh** (untuk proyektor/TV), dan — khusus admin — **↻ Siklus baru** serta **↩ Batalkan & kocok ulang**. Viewer melihat tombol “Tonton pengocokan”.
- **Samping**: peserta undian (chip berinisial, “+N lainnya” membuka daftar lengkap), peserta yang dilewati karena tidak hadir, 3 riwayat terbaru (**Lihat semua** = tabel lengkap beserta kode bukti), dan **Aturan pengundian**.
- **Panggung layar penuh tidak berubah** (reel, suara, konfirmasi hadir/tidak hadir, kocok ulang). Setelah panggung ditutup, dashboard otomatis dimuat ulang sehingga kartu langsung menampilkan hasil terbaru.
- Bila database belum menjalankan `patch-005`, kartu menampilkan petunjuk pembaruan, bukan galat.

## Kartu Kalender, Agenda & Pengumuman di Dashboard (v3.1)
Tanpa perubahan database — cukup deploy ulang. Tiga kartu baru tampil di bawah baris statistik dan memakai data serta form yang sama dengan halaman **Agenda** dan **Pengumuman** (tabel `events` & `announcements`).
- **Kalender** — kalender bulanan (Senin–Minggu, Minggu merah), navigasi bulan & tombol *Hari ini*, hari ini ditandai, titik penanda per hari (ungu = terjadwal, hijau = selesai, merah = dibatalkan). Klik tanggal untuk melihat acara hari itu; admin dapat langsung **＋ Tambah agenda** pada tanggal kosong yang dipilih.
- **Agenda Keluarga** — *Acara berikutnya* ditampilkan menonjol dengan hitung mundur (Hari ini / Besok / n hari lagi), diikuti daftar acara mendatang; tab **Terlewat** memuat acara selesai/dibatalkan. Klik acara → rincian lengkap + tombol **📅 Tambah ke Google Kalender** dan tautan peta lokasi.
- **Pengumuman** — empat terbaru dengan penanda **Baru** (≤ 7 hari); klik untuk membaca isi lengkap. Admin: tombol ＋ dan **✎ Ubah** pada dialog.
- Tampil rapi di HP (kartu bertumpuk), mode gelap, dan untuk viewer (tanpa tombol admin). Bila data tidak dapat dimuat, muncul pesan dengan tombol *Coba lagi* tanpa merusak dashboard.

## Halaman Pengaturan: Logo, Backup, Impor, Ekspor, Reset (v3.2)
**Upgrade dari v3.1:** jalankan `supabase/patch-009-pengaturan.sql` **sekali** di SQL Editor (aman diulang, tidak mengubah data), lalu deploy ulang. Instalasi baru cukup `schema.sql` terbaru. Menu **✦ Pengaturan** hanya tampil untuk admin. Sebelum patch dijalankan, halaman menampilkan peringatan; Ekspor dan Unduh Backup tetap berfungsi.

| Tab | Fungsi |
|---|---|
| **Umum & Logo** | Unggah logo (PNG/JPG/WebP/SVG → otomatis diperkecil), pilih bentuk (kotak membulat / bulat / asli), ubah nama & tagline aplikasi, pratinjau langsung. Logo tampil di sidebar, halaman masuk, favicon, kop laporan, dan kuitansi. Juga: identitas laporan (organisasi, bendahara, ketua) dan informasi sistem. |
| **Backup & Pemulihan** | Satu berkas `.json` berisi seluruh data + pengaturan + logo + tarif iuran, dengan checksum SHA-256. Pemulihan memvalidasi berkas, menampilkan perbandingan data, meminta ketik `PULIHKAN`, menawarkan backup otomatis data saat ini, dan berjalan **atomik** (gagal = data lama utuh). Titik kuning pada menu mengingatkan bila backup > 30 hari. |
| **Impor Data** | Anggota, Transaksi Kas, Agenda, Pengumuman dari **CSV atau Excel**. Template, panduan kolom, pratinjau, validasi per baris (tanggal `20/01/2026` atau `2026-01-20`, nominal `Rp 1.350.000`), deteksi duplikat, dan impor atomik. |
| **Ekspor Data** | Per kelompok (Excel/CSV) atau seluruhnya dalam satu berkas Excel multi-lembar. Ekspor Anggota, Kas, Agenda, Pengumuman berformat sama dengan template impor. CSV aman dari *formula injection*. |
| **Reset Data** | Per kelompok (keuangan, pengocokan, agenda, pengumuman, dokumentasi, log, anggota) atau seluruhnya. Wajib mengetik `RESET`, ada backup otomatis, berkas foto di Storage ikut dibersihkan. Akun pengguna **tidak pernah** dihapus. |

**Catatan:** backup memuat data, bukan berkas gambar di Storage maupun akun login. Semua operasi berbahaya diperiksa ulang di database (`need_admin()`), bukan hanya disembunyikan di tampilan.

## Top bar baru (v3.3)
Tanpa perubahan database — cukup deploy ulang.
- Tombol **＋ Tambah** dihapus (tiap halaman sudah punya tombol tambah sendiri).
- **Menu user** pindah dari sidebar ke pojok kanan atas: foto/inisial, nama, peran; klik untuk membuka menu (Pengaturan, Pengguna & hak akses, Mode gelap/terang, Sinkronkan data, Keluar). Bisa dipakai dengan keyboard (↑ ↓ Esc).
- **Jam & tanggal** zona waktu Jakarta (WIB), berjalan per detik.
- **Sinkron**: memuat ulang data halaman aktif dari server, sekaligus memeriksa sesi dan perubahan peran. Menampilkan waktu sinkron terakhir (kuning bila > 10 menit, merah bila gagal) dan titik status koneksi (hijau online / merah offline).


## Cetak Silsilah — poster untuk ruang keluarga (v3.4)
Tanpa perubahan database. Buka **Silsilah → 🖨 Cetak** (tersedia untuk semua pengguna) untuk membuka *Studio Cetak* dengan pratinjau langsung.

- **Vektor sungguhan**: poster dibuat sebagai SVG berukuran milimeter, tetap tajam dari A4 sampai A0 / 60×90 cm.
- **Otomatis memilih yang terbaik**: sistem mencoba tata letak *Atas→Bawah* dan *Kiri→Kanan* pada orientasi potret/lanskap, lalu memakai yang hurufnya paling besar. Indikator **ukuran huruf nama (pt)** memberi tahu apakah nyaman dibaca (≥ 9 pt) atau perlu kertas lebih besar / cakupan lebih kecil.
- **Isi**: seluruh keluarga atau satu cabang, batas generasi (ada penanda “+N” untuk yang tersembunyi), pasangan/menantu, tanda almarhum, foto, tahun lahir/wafat, nama lengkap atau singkat.
- **Gaya**: 5 tema (Klasik Krem, Modern Putih, Elegan Gelap, Hijau Alam, Hitam Putih hemat tinta), judul/subjudul/pesan bawah bisa diubah, logo keluarga, bingkai berornamen, pita & nomor generasi, keterangan simbol.
- **Kertas**: A4–A0 dan ukuran bingkai 30×40 / 40×60 / 50×70 / 60×90 cm.
- **Keluaran**: *Cetak / Simpan PDF* (dialog cetak browser: pilih ukuran kertas yang sama, skala 100%, margin “Tidak ada”), **SVG** (terbaik untuk percetakan), **PNG** (≈150 dpi), atau **poster tempel** dari banyak lembar A4/A3/Letter dengan tanda potong, area tumpuk 10 mm, dan peta nomor lembar.
- Pengaturan terakhir diingat di perangkat Anda.

## Dashboard: kartu Pengocokan sekeluarga dengan Agenda (v3.5)
Tanpa perubahan database. Kartu Pengocokan kini satu keluarga dengan Kalender, Agenda Keluarga, dan Pengumuman: kepala (judul + keterangan kecil), kartu hero bergradien, tab segmen **Peserta / Riwayat**, baris daftar, dan tombol "Lihat semua". Ikon ↻ (siklus baru, admin) dan ℹ (aturan & transparansi) ada di kepala kartu. Tema neon khusus panel dashboard dihapus; **panggung pengocokan layar penuh (proyektor/TV) tidak berubah**.

## Peran baru: Pengelola Silsilah (v3.6)
**Upgrade dari v3.5:** jalankan `supabase/patch-010-pengelola.sql` **sekali** di SQL Editor (aman diulang, tidak mengubah data), lalu deploy ulang. Instalasi baru cukup `schema.sql` terbaru. Atur peran di menu **Pengguna** (khusus admin).

| | Admin | Pengelola Silsilah | Viewer |
|---|:--:|:--:|:--:|
| Melihat semua data | ✓ | ✓ | ✓ |
| Tambah/ubah anggota, orang tua, pasangan, foto profil | ✓ | ✓ | – |
| Impor CSV anggota, tetapkan leluhur, lengkapi jenis kelamin/status nikah | ✓ | ✓ | – |
| Cetak silsilah | ✓ | ✓ | ✓ |
| Status arisan anggota (aktif/nonaktif) | ✓ | – | – |
| Hapus anggota yang punya catatan iuran/kas/pengocokan | ✓ | – | – |
| Keuangan, arisan & pengocokan, agenda, pengumuman, album | ✓ | – | – |
| Pengaturan, backup/restore/reset, pengguna & peran | ✓ | – | – |

Semua batas dipaksakan **di database** (kebijakan RLS, pemeriksaan fungsi, trigger), bukan hanya disembunyikan di tampilan. Dua pengaman khusus: anggota baru dari pengelola otomatis **nonaktif arisan** (tercatat untuk silsilah saja, admin yang mengaktifkan), dan foto Storage pengelola dibatasi ke folder `profile/` (foto album tetap khusus admin).

## Navigasi berbasis URL ala website profesional (v3.7)

Setiap menu kini punya alamat sendiri, sehingga tombol **Back/Forward** browser, **refresh (F5)**, dan **bagikan link** berfungsi normal:

| Menu | URL | Menu | URL |
|---|---|---|---|
| Dashboard | `/` | Pengumuman | `/pengumuman` |
| Arisan | `/arisan` | Laporan | `/laporan` |
| Silsilah Keluarga | `/silsilah` | Akun & Pengguna | `/pengguna` |
| Anggota | `/anggota` | Pengaturan (admin) | `/pengaturan` |
| Keuangan | `/keuangan` | Agenda · Dokumentasi | `/agenda` · `/galeri` |

- **Back/Forward**: kembali ke menu sebelumnya tanpa memuat ulang seluruh aplikasi. Modal yang sedang terbuka ditutup otomatis.
- **Refresh otomatis**: setiap pindah menu, data diambil ulang dari server (dengan bilah progres tipis di atas layar). Tab yang ditinggal >5 menit juga disegarkan saat dibuka kembali.
- **Refresh browser (F5)** tetap di halaman yang sama; URL tidak dikenal diarahkan ke `/dashboard`; `/pengguna/kelola` otomatis menjadi `/pengguna` bagi non-admin.
- Judul tab ikut berubah, misalnya *Arisan · FamilyHub*.
- **File baru**: `public/router.js`. **Diubah**: `vercel.json` (rewrite ke `index.html`), `index.html` (memuat router.js), `topbar.css` (bilah progres), `package.json` (`npm run dev` memakai `serve -s`), serta `public/_redirects` (cadangan untuk Netlify).
- **Upgrade dari v3.6**: cukup timpa file lalu deploy ulang. Tidak ada perubahan database.

## Akun & Pengguna — ganti password dalam satu halaman (v3.9)

Halaman **Akun & Pengguna** (`/pengguna`) kini dibuka oleh **semua peran**, dengan tab:

| Tab | URL | Untuk | Isi |
|---|---|---|---|
| **Akun Saya** | `/pengguna` | semua peran | profil, peran & hak akses Anda, **form ganti password** |
| **Kelola Pengguna** | `/pengguna/kelola` | admin | daftar pengguna & pengaturan peran (seperti sebelumnya) |

- Anggota biasa hanya melihat halaman **Akun Saya** (tanpa tab); menu sidebar berlabel *Akun Saya*, untuk admin *Akun & Pengguna*.
- Menu profil di pojok kanan atas: **Akun saya & ganti password** dan (admin) **Kelola pengguna & hak akses**.
- Ganti password: wajib mengisi password saat ini (diverifikasi lewat login ulang), password baru (min. 8 karakter), dan konfirmasi. Ada tombol tampil/sembunyikan dan pengukur kekuatan. Setelah berhasil, sesi di perangkat lain berakhir.
- Alamat lama `/password` otomatis diarahkan ke `/pengguna`. `/pengguna/kelola` bagi non-admin otomatis menjadi `/pengguna`.
- Password pengguna lain tidak bisa dilihat/diubah dari aplikasi. Bila ada yang lupa password, admin mengatur ulang lewat Supabase → Authentication → Users.
- Tampilan memakai komponen yang sama dengan halaman Pengaturan (tab, kartu, judul kartu, chip, tombol) sehingga seragam, termasuk mode gelap dan layar HP.
- Tanpa perubahan database. File baru: `public/account.js` (menggantikan `password.js` v3.8).

## Perbaikan Cetak Silsilah (v3.9.1)

- **Masalah:** di Studio Cetak, tombol **⬇ SVG**, **⬇ PNG**, dan **🖨 Cetak / PDF** tidak bereaksi sama sekali. Penyebabnya, `print.js` memanggil `stBusy()` (kotak "Menyiapkan…") yang hanya ada di dalam `settings.js` sehingga terjadi `ReferenceError` yang tertelan diam-diam.
- **Perbaikan:** `settings.js` kini mengekspos `window.stBusy`. Tidak ada perubahan database.

## Audit keamanan & jejak audit (v3.10.0)
Hasil audit lengkap ada di **AUDIT.md**. Ringkasan perubahan:
- **Persetujuan akun** — sebelumnya setiap pendaftar langsung bisa membaca seluruh data keluarga. Kini akun baru *menunggu* sampai admin menyetujui (peran bisa dipilih saat menyetujui) atau menolak. Titik merah di lonceng top bar menandakan ada pendaftar menunggu. Akun yang sudah ada otomatis disetujui, jadi tidak ada yang terkunci keluar.
- **Jejak audit** — tab *Kelola Pengguna → Jejak audit*.
- **Kunci transaksi iuran** — kas hasil pembayaran tidak bisa diutak-atik; ubah lewat Batalkan pembayaran.
- **XSS tersimpan ditutup sebelum sempat ada** — panel persetujuan tidak pernah menyisipkan nama pendaftar ke atribut HTML.
- **Pendaftaran**: nama lengkap kini kolom di form (bukan `prompt()`), password minimal 8 karakter (sama dengan halaman Ganti Password), pesan menjelaskan perlunya persetujuan admin.
- **Infrastruktur**: header keamanan di `vercel.json`, pustaka di-host sendiri, berkas sisa dihapus (`_redirects` milik Netlify, `.icon-512.png` duplikat), ikon manifest diperbaiki (`purpose: any`), versi backup kini 3.10.0.

**Upgrade dari v3.9.x:** jalankan `supabase/patch-011-keamanan.sql` sekali di SQL Editor (aman diulang), lalu deploy frontend. Urutan bebas: frontend baru tetap berjalan sebelum SQL di-patch (pengguna dianggap disetujui), dan SQL baru tetap melayani frontend lama kecuali layar "menunggu" yang baru tampil setelah frontend diperbarui.
**Instalasi baru:** `schema.sql` sudah memuat patch-011.

**Menjalankan tes** (Node ≥ 18): `npm install && npm test` — 131 tes SQL (instalasi baru, upgrade berantai dari v3.9.1, idempoten, RLS, pembungkus fungsi, undian, restore/reset, portal anggota, anti-spam, kesamaan skema) dan 59 tes frontend.

## Restore tahan versi & penghapusan aman (v3.11.0)
- **Restore backup lama kini berhasil.** Sebelumnya, backup dari versi lama gagal ("null value … violates not-null constraint") karena kolom yang ditambahkan belakangan tidak ada di berkas. Kini `restore_backup` hanya mengisi kolom yang ada di backup; sisanya memakai nilai default. Backup yang berisi kolom tak dikenal ditolak rapi dan data tetap utuh.
- **Hapus foto/album: baris database dulu, berkas sesudahnya.** Bila penghapusan di database ditolak atau gagal, berkas tidak ikut hilang (sebelumnya bisa tersisa baris foto tanpa berkas).
- **Pembatalan pembayaran** memakai kunci yang sama dengan pencairan arisan, sehingga keduanya tidak bisa bertabrakan.
- **Upgrade dari v3.10:** jalankan `supabase/patch-012-restore-tahan-versi.sql` sekali (aman diulang). Instalasi baru: `schema.sql` sudah memuatnya.

## Portal anggota "Iuran Saya" (v3.12.0)
Setiap anggota keluarga yang punya akun kini bisa melihat sendiri: status iuran bulan ini per jenis, **tunggakan** (berapa bulan & berapa rupiah, bulan mana saja), 12 pembayaran terakhir lengkap dengan **nomor kuitansi**, kelayakan undian arisan bulan ini, dan riwayat kemenangannya. Buka tab **Iuran Saya** di *Akun & Pengguna* (alamat `/pengguna/iuran`).
- **Cara mengaktifkan:** admin membuka *Akun & Pengguna → Kelola Pengguna*, lalu pada kolom **Anggota keluarga** memilih anggota yang sesuai untuk tiap akun. Satu anggota hanya bisa dihubungkan ke satu akun; anggota yang sudah terhubung tampil nonaktif di daftar. Akun yang belum dihubungkan melihat pesan penjelasan.
- **Keamanan:** halaman ini hanya menampilkan data anggota yang terhubung ke akun itu sendiri (dihitung di server oleh `my_status()`); hubungan hanya bisa diubah admin dan tercatat di jejak audit. Catatan: ini kenyamanan tampilan, bukan pembatasan — peran Viewer tetap bisa melihat seluruh data keluarga di halaman lain.
- Angka tunggakan memakai logika yang sama dengan halaman Iuran admin (tes silang otomatis membuktikan keduanya identik).
- **Upgrade dari v3.11:** jalankan `supabase/patch-013-portal-anggota.sql` sekali (aman diulang), lalu deploy frontend. Sebelum patch dijalankan, tab Iuran Saya menampilkan pesan agar patch dijalankan. Instalasi baru: `schema.sql` sudah memuatnya.

## Anti-spam pendaftaran & satu sumber skema (v3.13.0)
- **Batas pendaftar menunggu: 50.** Pendaftaran publik tidak lagi bisa membanjiri daftar persetujuan; pendaftar ke-51 ditolak dengan pesan jelas sampai admin menyetujui/menolak sebagian. Tombol **Tolak semua** di panel *Menunggu persetujuan* membersihkan semuanya sekali klik (akun yang sudah disetujui tidak tersentuh). Nama pendaftar dipangkas maksimal 80 karakter. **Upgrade dari v3.12:** jalankan `supabase/patch-014-anti-spam.sql` sekali (aman diulang).
- **`schema.sql` kini dihasilkan otomatis** dari `supabase/base/schema-v3.9.1.sql` + `patch-011…` (jangan diedit tangan). Folder `supabase/migrations/` (format Supabase CLI) ikut dihasilkan. Untuk menambah perubahan database: buat `supabase/patch-0NN-nama.sql`, lalu `npm run build:sql`. `npm test` gagal bila `schema.sql`/`migrations/` tidak sinkron, dan membuktikan ketiga jalur instalasi (schema.sql, migrations, dasar+patch) menghasilkan katalog database yang identik.
