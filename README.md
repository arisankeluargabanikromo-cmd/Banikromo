# FamilyHub — Arisan & Family Network
Frontend statis (HTML/CSS/JS) + **Supabase** (Postgres, Auth, RLS) · deploy via **GitHub → Vercel**.

```
public/            index.html, app.js (tampilan), data.js (lapisan Supabase), config.js
supabase/          schema.sql (wajib), seed.sql (opsional, data contoh)
scripts/           gen-config.js (isi config.js dari env var saat build Vercel)
vercel.json        outputDirectory = public
```

## 1) Siapkan Supabase
1. https://supabase.com → **New project** (pilih region Singapore).
2. **SQL Editor → New query** → tempel isi `supabase/schema.sql` → **Run**.
3. (Opsional) jalankan `supabase/seed.sql` untuk data contoh.
4. **Authentication → Providers → Email**: aktif. Untuk percobaan, matikan *Confirm email* agar bisa langsung login.
5. **Project Settings → API**: salin **Project URL** dan **anon public key**.

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
