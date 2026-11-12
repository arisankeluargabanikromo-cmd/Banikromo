# SekolahHub 2.16.0 → 2.17.0: Scan QR kartu ID

## Fitur
- **Pemindai kartu ID** (`js/scan.js`, `css/scan.css`). Buka dari tombol **Scan QR** di Absensi, menu **+ Tambah** (top bar), atau pencarian aksi cepat (`/`).
- **Mode Absen hadir:** terus memindai; tiap kartu langsung dicatat *Hadir* hari ini. Kartu yang sama tidak diproses ulang dalam 3 detik. Siswa yang sudah hadir tidak digandakan. Siswa yang tercatat Sakit/Izin/Alpa **tidak ditimpa diam-diam**; muncul tombol *Ubah ke Hadir*.
- **Mode Setor:** kartu dipindai, lalu alur **Setor** bank yang sudah ada terbuka dengan siswa terpilih (konfirmasi, otorisasi, bukti, tutup buku, semua aturan buku besar tetap berlaku). Tidak ada jalan pintas yang melewati server.
- **Kolom NIS manual**: untuk kamera yang tidak tersedia atau ditolak, dan untuk pemindai USB/Bluetooth (mengetik NIS + Enter).
- Umpan balik bunyi dan getar, daftar hasil sesi, ringkasan jumlah hadir.
- Hanya Admin/Pengurus. Akun Siswa, Orang tua, dan Hanya lihat ditolak.

## Teknis
- Dekode: `BarcodeDetector` bila ada (Chrome/Android), selain itu **jsQR 1.4.0** (Apache-2.0, `vendor/jsQR.js`, dimuat hanya saat dibutuhkan).
- `vercel.json`: `Permissions-Policy` kamera dibuka untuk situs sendiri (`camera=(self)`); mikrofon, lokasi, pembayaran tetap tertutup.
- Kamera dimatikan saat jendela ditutup atau tab disembunyikan.
- QR yang berisi tautan WhatsApp wali ditolak dengan pesan jelas (kartu punya dua kode QR).
- NIS ganda ditolak dan menyebutkan nama siswa terkait.

## Pengujian
- `scan_test.js` (masuk `npm test`): QR yang dibuat `idcard.js` untuk 6 pola NIS terbaca jsQR, termasuk ukuran kecil (3 px/modul); logika pencocokan dan absen (tanpa ganda, tanpa menimpa).
- `scan_ui_test.js` (butuh `npm i jsdom`): jendela, mode absen/setor, pemanggilan `A.trx`, penolakan peran, XSS pada isian NIS.
- **Belum diuji:** kamera dan izin di perangkat sungguhan (Android Chrome, iOS Safari), pencahayaan, dan kartu hasil cetak. Uji dengan beberapa kartu nyata sebelum dipakai di kelas.

## Catatan pakai
- Wajib HTTPS (Vercel otomatis) atau `localhost`. Pertama kali, peramban meminta izin kamera.
- Tanggal absen = hari ini (tidak mengikuti tanggal yang dipilih di halaman Absensi).
- Ukuran kartu cetak: QR NIS sebaiknya ≥ 1,8 cm dan tidak mengilap agar mudah terbaca.
