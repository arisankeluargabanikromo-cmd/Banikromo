# Pustaka pihak ketiga (di-host sendiri)

Dihost dari domain sendiri agar tidak bergantung pada CDN dan supaya CSP cukup `script-src 'self'`.
Berkas diambil dari paket npm resmi tanpa diubah. Verifikasi: `npm pack <paket>@<versi>` lalu bandingkan hash.

| Berkas | Paket | SHA-384 |
|---|---|---|
| supabase-js-2.45.4.js | @supabase/supabase-js@2.45.4 (dist/umd/supabase.js) | sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o |
| xlsx-0.18.5.full.min.js | xlsx@0.18.5 (dist/xlsx.full.min.js) | sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw |

Catatan: SheetJS 0.18.5 (versi terakhir di npm) punya kerentanan yang diketahui saat MEMBACA berkas xlsx tak tepercaya
(CVE-2023-30533, CVE-2024-22363). Aplikasi hanya membaca xlsx yang dipilih admin sendiri pada Pengaturan → Impor.
Untuk menutupnya, ganti dengan SheetJS >= 0.20.3 dari https://cdn.sheetjs.com (unduh & simpan di folder ini).
