# FamilyHub — Arisan & Family Network
Frontend statis (HTML/CSS/JS) + **Supabase** (Postgres, Auth, RLS) · deploy via **GitHub → Vercel**.

```
public/            index.html, app.js (tampilan), data.js (lapisan Supabase), config.js
supabase/          schema.sql (wajib, sudah mencakup semua fitur), seed.sql (opsional),
                   patch-001/002/003/004/005/006/007/008/009 (HANYA untuk yang sudah terlanjur memakai versi lama),
                   demo-500-keluarga.sql (opsional, data uji 500 orang)
scripts/           gen-config.js (isi config.js dari env var saat build Vercel)
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
- Buka situs → **Daftar akun baru**. **Akun pertama otomatis menjadi admin**; akun berikutnya = viewer (hanya melihat).
- Jadikan admin tambahan (SQL Editor): `update profiles set role='admin' where id=(select id from auth.users where email='email@anda.com');`

## Keamanan
- Anon key memang publik; yang melindungi data adalah **Row Level Security**: semua tabel hanya bisa dibaca pengguna login, dan hanya admin yang boleh menulis.
- Pencatatan iuran, undian, dan laporan berjalan sebagai fungsi SQL di server (tidak bisa dimanipulasi dari browser).
- **Jangan pernah** memasang `service_role` key di frontend atau Vercel env publik.
- Pengundian memakai UUID acak kriptografis, sekali per bulan, tersimpan dengan kode bukti SHA-256.

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

