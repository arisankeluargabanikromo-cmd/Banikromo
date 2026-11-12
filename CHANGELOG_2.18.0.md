# SekolahHub 2.17.0 → 2.18.0: Kuitansi PDF dengan QR verifikasi

## Fitur
- Tombol **PDF** pada bukti **Tabungan** (setoran/penarikan/pembatalan), **Kas**, dan **Iuran**. Mengunduh kuitansi A5 berisi: identitas sekolah, judul, nomor referensi, status (Berhasil / Dibatalkan / Pembatalan), nominal + terbilang, rincian, kolom tanda tangan, dan **QR verifikasi**.
- Transaksi yang dibatalkan diberi cap diagonal **DIBATALKAN** dan nominal berwarna merah.
- **Halaman publik `/verifikasi?r=<nomor referensi>`**: orang tua memindai QR, lalu melihat status keaslian, jenis, tanggal, nominal, nama siswa tersamar ("Budi S."), dan apakah transaksi sudah dibatalkan. Tanpa login.
- PDF dibuat sepenuhnya di peramban (`js/pdf.js`, penulis PDF kecil tanpa pustaka luar); data tidak dikirim ke layanan lain.

## Keamanan & privasi
- Fungsi database `verifikasi_transaksi(p_ref)` (migrasi 018) boleh dipanggil tanpa login, jadi keluarannya minimal. **Tidak** mengembalikan saldo, NIS, kelas, nomor rekening, uraian/keterangan, atau nama lengkap.
- Hanya cocok pada nomor referensi persis berpola `TRX|IUR|KAS|REV` + `yymmdd` + `-` + 8 heksa acak; input lain ditolak sebelum menyentuh tabel (mencegah injeksi dan pemindaian pola).
- Halaman verifikasi merender seluruh nilai dengan `textContent` (diuji terhadap XSS), tidak menyimpan sesi, dan ber-`noindex`.
- **Batas yang perlu diketahui:** tidak ada pembatasan laju per-IP di fungsi. Delapan heksa acak per hari membuat tebakan acak tidak praktis, namun pasang pembatasan di Vercel/Supabase bila dipakai luas. Verifikasi hanya membuktikan bahwa nomor itu **ada dan statusnya apa**; pemeriksa harus mencocokkan nominal dan tanggal di layar dengan kertas.
- Kuitansi dan QR **bukan bukti perbankan berlisensi**; teks ini juga tercetak di PDF tabungan.

## Pasang
1. Deploy v2.18.0. Tombol PDF langsung berfungsi.
2. **Staging dulu:** jalankan `supabase/migrations/018_verifikasi_transaksi.sql`, lalu `supabase/tests/verifikasi_check.sql` (hasil lulus muncul di pesan error terakhir, disengaja). Setelah itu jalankan di produksi. Sebelum migrasi, halaman `/verifikasi` menampilkan "belum diaktifkan oleh sekolah".
3. **Cetak dari domain produksi.** QR memuat alamat situs yang sedang dipakai saat PDF dibuat; PDF yang dibuat dari `localhost` akan berisi QR ke `localhost`.

## Pengujian
- `npm test` menjalankan: `kuitansi_test.js` (PDF valid, teks terbaca lewat `pdftotext`, dirender `pdftoppm` lalu **QR terbaca kembali oleh jsQR** dan sama dengan tautan; kasus tanpa QR bila alamat terlalu panjang) dan `kuitansi_bank_test.js` (deskriptor tabungan/kas/iuran, status pembatalan, tanpa HTML bocor). Bila `pdftotext`/`pdftoppm` tidak terpasang, bagian render dilewati.
- `verifikasi_test.js` (butuh `npm i jsdom`): ref dinormalkan, status ok/dibatalkan/pembatalan, tidak ditemukan, format salah tanpa panggilan server, migrasi belum jalan, offline, XSS.
- **Belum diuji:** SQL di Postgres; unduhan PDF dan tata letak halaman verifikasi di peramban/ponsel sungguhan; pembacaan QR pada kertas hasil cetak (cetak 1 contoh dan pindai dengan ponsel).
- Batas teknis: huruf di luar WinAnsi/Latin-1 (mis. aksara non-Latin pada nama) tercetak sebagai "?". QR memuat hingga ±105 karakter tautan; domain yang sangat panjang mencetak tautan tanpa QR.
