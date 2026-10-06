// Menulis public/config.js dari environment variable (dipakai oleh Vercel saat build).
const fs = require('fs'), u = process.env.SUPABASE_URL, k = process.env.SUPABASE_ANON_KEY;
if (u && k) { fs.writeFileSync('public/config.js', `window.FH_CONFIG = ${JSON.stringify({ SUPABASE_URL: u, SUPABASE_ANON_KEY: k })};\n`); console.log('config.js dibuat dari env'); }
else console.warn('SUPABASE_URL / SUPABASE_ANON_KEY belum di-set — memakai public/config.js apa adanya');
