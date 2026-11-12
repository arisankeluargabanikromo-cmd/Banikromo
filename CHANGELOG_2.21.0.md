# SekolahHub 2.20.0 → 2.21.0: Tata letak saat zoom-out (layar lebar)

## Analisis (dari tangkapan layar yang direproduksi)
Zoom-out memperbesar lebar viewport CSS (1700 sampai 2500 px). Ada **dua akar masalah**, keduanya berlaku untuk semua peran:

1. **Header profil siswa memakai flex satu baris** (`.hd`): avatar, kolom nama (`.who`), dan 5 tombol (`.bar`, ±845 px) berebut satu baris. Kolom nama menyempit, chip dan nama membungkus ke banyak baris, dan karena baris disejajarkan ke bawah (`align-items:flex-end`) sementara seluruh header ditarik naik 58 px (`margin-top:-58px`), **kolom yang makin tinggi mendorong nama naik ke area sampul** (teks gelap di atas gradien, sulit dibaca). Chip "Akun siswa aktif · email" juga pecah menjadi dua baris berbentuk pil.
2. **Konten rata kiri dengan lebar maksimum tetap** (`main{max-width:1100px}`; 1480 px bila halaman memuat `.board`). Di layar sangat lebar sisi kanan kosong, dan lebar konten melompat antar halaman.

## Perbaikan (`css/layout.css`, tanpa mengubah logika)
- Header profil (di atas 860 px) menjadi **grid**: hanya avatar yang naik menimpa sampul; **nama, chip, dan tombol selalu di area putih** di bawah sampul, dengan tombol di baris sendiri. Nama panjang membungkus rapi (`text-wrap:balance`, ukuran huruf `clamp`), chip akun tidak pecah.
- Konten **dipusatkan** (`margin-inline:auto`) dan di layar ≥1900 px sedikit melebar (1280 px; halaman dasbor 1600 px).
- Tombol kamera avatar di ponsel/tablet diperkecil agar tidak menutupi inisial.
- Tata letak ponsel/tablet (≤860 px) tidak diubah.

## Diuji
Chromium headless, data contoh, nama 41 huruf + chip email panjang: admin 1100 / 1700 / 2000 / 2560 px (terang & gelap), siswa 1700 px, ponsel 390 px (admin & orang tua), tablet 768 px; dasbor dan portal di 2560 px. Semua rapi; tidak ada galat konsol.

## Batas
- Diuji di Chromium. Safari dan Firefox belum (CSS yang dipakai: grid, `clamp`, `text-wrap:balance`; `text-wrap` diabaikan dengan aman bila tidak didukung).
- Zoom peramban sangat kecil (≤50%) pada layar besar menghasilkan lebar >2500 px; konten tetap terpusat dengan batas lebar di atas.
