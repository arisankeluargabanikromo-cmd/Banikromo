# Audit FamilyHub v3.9.1 → v3.13.0

**Cakupan:** seluruh isi zip — 18 berkas JS (±3.600 baris, baris-baris yang padat), `schema.sql` (1.122 baris) + 10 patch, konfigurasi Vercel/PWA.
**Metode:** baca kode manual; analisis otomatis fungsi `security definer` (53 fungsi); menjalankan `schema.sql` asli di Postgres sungguhan
(PGlite, Postgres 18) dengan tiruan `auth`/`storage`/peran Supabase untuk **membuktikan** temuan, lalu menguji perbaikannya.

## Kesimpulan singkat
Fondasi keamanannya **baik**: RLS aktif di semua tabel, semua fungsi tulis memeriksa peran, `anon` dicabut dari fungsi, `search_path` dipin,
output di-escape konsisten, logo divalidasi, undian memakai kunci & indeks unik. Satu celah serius dan beberapa kelemahan menengah
ditemukan; semuanya yang bisa diperbaiki secara aman sudah diperbaiki di v3.10.0 dan diuji.

## Temuan

| # | Tingkat | Temuan | Status |
|---|---|---|---|
| 1 | **Tinggi** | **Pendaftaran terbuka = akses baca penuh.** Pendaftar mana pun langsung berperan `viewer` dan bisa membaca semua anggota (nomor HP, alamat), keuangan, undian, foto. Terbukti: akun asing membaca 3 anggota & memanggil `dashboard()`. | ✅ Diperbaiki: akun baru *menunggu persetujuan*; RLS, 11 fungsi baca, dan Storage menolaknya. |
| 2 | Menengah | **Kas hasil iuran bisa diubah lewat API.** Admin bisa `update transactions set amount=1` pada baris dari pembayaran → buku kas tak cocok dengan pembayaran. Terbukti. | ✅ Dikunci oleh trigger (pembatalan lewat *Batalkan pembayaran* tetap jalan). |
| 3 | Menengah | **Tidak ada jejak audit.** Log aktivitas hanya teks, bisa terhapus oleh Restore/Reset. | ✅ Tabel `audit_log` (nilai lama/baru, pelaku), admin-baca, tak terhapus oleh Reset/Restore. |
| 4 | Menengah | **Pendaftar pertama = admin, rawan balapan.** Dua pendaftaran serentak bisa menghasilkan dua admin; di deploy baru, siapa cepat dia admin. | ⚠️ Balapan ditutup (advisory lock). Risiko "siapa pertama" tetap — **daftarkan admin segera setelah deploy** (tercantum di README). |
| 5 | Menengah | **Skrip CDN tanpa SRI** (supabase-js, SheetJS dari jsDelivr): kompromi CDN = kendali penuh atas sesi admin. | ✅ Di-host sendiri di `public/vendor/`. |
| 6 | Menengah | **Tanpa header keamanan/CSP** (framing, sniffing, dll.). | ✅ Di `vercel.json`. Catatan: CSP masih butuh `'unsafe-inline'` karena ±160 atribut handler inline (`onclick`, `onchange`, …) (lihat peta jalan). |
| 7 | Rendah-Menengah | **SheetJS 0.18.5** punya CVE saat *membaca* xlsx (CVE-2023-30533, CVE-2024-22363). Hanya admin yang mengimpor berkas pilihannya sendiri. | ⚠️ Belum — versi aman hanya di cdn.sheetjs.com (tak terjangkau dari lingkungan audit). Langkah di `public/vendor/README.md`. |
| 8 | Rendah | Password pendaftaran min. 6 vs Ganti Password min. 8. | ✅ Disamakan (8). |
| 9 | Rendah | Pendaftaran memakai `prompt()` untuk nama. | ✅ Kolom di form. |
| 10 | Rendah | Fungsi bantu (`need_admin`, `cur_period`, …) tanpa `search_path`; `cfg()` & `eligible_members()` bisa dipanggil dari browser. | ✅ |
| 11 | Rendah | Tombol notifikasi hiasan (titik merah permanen). | ✅ Kini menandai pendaftar yang menunggu. |
| 12 | Rendah | Berkas sisa: `_redirects` (Netlify), `.icon-512.png` duplikat; ikon manifest `any maskable` pada gambar yang sama; `VER` backup masih 3.2.0. | ✅ |
| 13 | Rendah | **Restore rapuh terhadap backup lama:** kolom yang belum ada di backup menjadi NULL → melanggar `NOT NULL`. Terbukti. Backup juga tidak memuat berkas foto Storage maupun peran pengguna. | ✅ (v3.11) Restore hanya mengisi kolom yang ada di backup; sisanya default. ❌ Foto Storage & peran tetap belum ikut di-backup. |
| 14 | Rendah | `schema.sql` memuat definisi ganda dan 10 patch yang menduplikasi isinya → rawan melenceng. | ✅ (v3.13) `schema.sql` & `migrations/` kini dihasilkan dari satu sumber (dasar + patch); tes gagal bila tidak sinkron dan membuktikan katalog DB identik di tiga jalur instalasi. |
| 15 | Rendah | Hapus foto/album: berkas Storage dihapus dulu, baris DB sesudahnya → bisa yatim bila gagal di tengah. `void_payment` tanpa kunci terhadap `disburse_arisan`. | ✅ (v3.11) Baris dulu, berkas sesudahnya; kunci disamakan. |
| 17 | Rendah | **Pendaftaran publik bisa membanjiri daftar persetujuan** (300 akun spam masuk tanpa batas; terbukti). | ✅ (v3.13) Batas 50 pendaftar menunggu + tombol Tolak semua. |
| 16 | Info | `config.js` berisi URL & anon key proyek nyata. Aman dipublikasikan (dilindungi RLS), tetapi pastikan itu memang proyek yang dimaksud. | — |

## Yang sudah baik (tidak diubah)
RLS konsisten + 53 fungsi diperiksa: semua fungsi tulis memeriksa peran; fungsi trigger/internal dicabut dari `authenticated`;
undian memakai `pg_advisory_xact_lock` + indeks unik parsial; backup berchecksum; pagar peran *pengelola* dipaksa di database;
`esc()` dipakai konsisten, tidak ada `eval`/`document.write`, handler inline lama hanya menerima konstanta internal.

## Verifikasi (dan batasnya)
- `npm test` → **131 tes SQL + 59 tes frontend**, semuanya lulus. Tes SQL mencakup instalasi baru, **upgrade dari DB v3.9.1 yang sudah berisi pengguna**,
  menjalankan patch dua kali, RLS per peran (anon/menunggu/viewer/pengelola/admin), undian end-to-end, serta Restore & Reset terhadap kunci transaksi.
- Setiap temuan 1–2 punya **tes kontrol** yang membuktikan masalahnya ada pada skema lama.
- **Batas:** SQL diuji di PGlite (Postgres 18) dengan tiruan Supabase, bukan project Supabase asli; UI diuji di jsdom, **bukan browser sungguhan**.
  Karena itu: (a) coba alur setujui/tolak sekali di project Anda; `reject_user` menghapus `auth.users` dan membutuhkan fungsi dijalankan sebagai pemilik `postgres` (default SQL Editor);
  (b) buka aplikasi sekali dan lihat Console untuk pelanggaran CSP (mis. bila memakai *custom domain* Supabase, tambahkan ke `connect-src`/`img-src`).

## Peta jalan pengembangan (belum dikerjakan)
1. **Ganti handler inline dengan event delegation** → CSP tanpa `'unsafe-inline'` (perlindungan XSS jauh lebih kuat).
2. ~~Migrasi Supabase CLI~~ ✅ selesai di v3.13 (`supabase/migrations/`, dihasilkan otomatis; CI sudah ada).
3. ~~Restore tahan versi~~ ✅ selesai di v3.11. Tersisa: **backup yang menyertakan foto Storage & peran pengguna**.
4. **Service worker** agar benar-benar bisa dipasang & dibuka offline (kini hanya manifest).
5. ~~Portal anggota~~ ✅ selesai di v3.12 (tab *Iuran Saya*).
6. **Pengingat otomatis** (Supabase Edge Function + jadwal) menggantikan tombol WhatsApp manual; bukti transfer (unggah foto) pada pembayaran.
7. **Pemecahan skrip global → ES modules** (±3.600 baris padat, 18 berkas global yang saling bergantung urutan muat, beberapa fungsi dibungkus ulang lintas berkas).
