# FamilyHub — Arisan & Family Network
Frontend statis (HTML/CSS/JS) + **Supabase** (Postgres, Auth, RLS) · deploy via **GitHub → Vercel**.

```
public/            index.html, app.js (tampilan), data.js (lapisan Supabase), config.js
supabase/          schema.sql (wajib, sudah mencakup semua fitur), seed.sql (opsional),
                   patch-001/002 (HANYA untuk yang sudah terlanjur memakai versi lama)
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
> (bila belum) lalu `supabase/patch-002-foto-pengguna.sql` di SQL Editor — keduanya aman diulang.

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
