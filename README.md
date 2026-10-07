# FamilyHub — Arisan & Family Network
Frontend statis (HTML/CSS/JS) + **Supabase** (Postgres, Auth, RLS) · deploy via **GitHub → Vercel**.

```
public/            index.html, app.js (tampilan), data.js (lapisan Supabase), config.js
supabase/          schema.sql (wajib, sudah mencakup semua fitur), seed.sql (opsional),
                   patch-001/002/003/004 (HANYA untuk yang sudah terlanjur memakai versi lama),
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
> (bila belum) lalu `patch-002-foto-pengguna.sql`, `patch-003-silsilah.sql`, dan `patch-004-foto-status.sql` (berurutan) di SQL Editor — semuanya aman diulang.

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
