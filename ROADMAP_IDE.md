# Ide pengembangan SekolahHub (urut prioritas)

## A. Tutup celah sebelum menambah fitur
1. **Privasi nama di `kas.ket` (audit #15).** Hilangkan nama siswa dari kolom `ket` baris turunan iuran, tampilkan nama di klien dari data `iuran` (hanya terlihat staf). Penyamaran di UI saja belum melindungi di tingkat API. Butuh migrasi 017 dan uji di staging.
2. **Pendaftaran publik & akun admin pertama.** Tutup pendaftaran bebas di Supabase setelah admin dibuat; pakai undangan atau daftar putih domain email sekolah.
3. **MFA (TOTP) wajib untuk admin dan bendahara.** Supabase Auth sudah menyediakannya; cocok dengan otorisasi kata sandi yang ada.
4. **CSP tanpa `'unsafe-inline'`.** Perlu memindahkan `onclick="..."` inline ke event listener; ini juga langkah pertama modularisasi.
5. **`config.js` jadi placeholder di repositori**, nilai asli hanya dari environment Vercel.

## B. Kualitas kode & operasional
1. `app.js` (dan file lain) ditulis sangat padat; pecah per modul (ES modules), tambah ESLint + Prettier.
2. **CI GitHub Actions**: jalankan `npm test` di setiap push; uji SQL (`supabase/tests/*.sql`) di proyek staging.
3. `schema.sql` idempoten (`drop policy if exists`) agar aman dijalankan ulang.
4. **Backup terjadwal** (Supabase cron atau Edge Function) ke penyimpanan terpisah, bukan hanya unduhan manual.
5. Skala besar: saldo dan rekap dihitung di database (view / tabel ringkasan harian), paginasi sisi server untuk Mutasi.

## C. Fitur bernilai tinggi
1. **Kuitansi PDF dengan QR verifikasi**: orang tua memindai QR, melihat keabsahan transaksi berdasarkan nomor referensi.
2. **Scan kartu ID (QR) untuk setor cepat dan absensi**: kartu sudah punya QR; tambahkan pemindai kamera (izinkan `camera=(self)` di Permissions-Policy).
3. **Maker-checker**: penarikan/pengeluaran di atas batas dibuat pengurus, disetujui bendahara/admin.
4. **Pengingat WhatsApp terjadwal** lewat Edge Function (saat ini manual lewat tautan).
5. **Rekonsiliasi harian & tutup kas** dengan berita acara cetak (melengkapi opname kas).
6. **Dasbor eksekutif kepala sekolah**: banyak kelas, tren tunggakan, kolektibilitas, ekspor XLSX.
7. **Multi-kelas / multi-sekolah (tenant)** bila ingin dipakai di luar satu kelas.

## D. Polesan tampilan
1. Onboarding wizard pertama kali (identitas, nominal iuran, impor siswa).
2. Skeleton loading dan *empty state* ber-ilustrasi, bukan teks polos.
3. Tabel: urut kolom, paginasi, aksi massal, dan **Urungkan** pada toast.
4. Validasi formulir inline (bukan hanya pesan setelah kirim).
5. Palet perintah (Ctrl+K) diperluas: lompat ke transaksi lewat nomor referensi.
