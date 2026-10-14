// ===== Akun & Pengguna (v3.9) — satu halaman /pengguna untuk semua peran =====
//  • Tab "Akun Saya"       (/pengguna)         : profil, hak akses, ganti password — semua peran
//  • Tab "Kelola Pengguna" (/pengguna/kelola)  : daftar pengguna & peran — khusus admin (isi dari extras.js)
// Dimuat sebelum router.js, yang membaca PG_TAB untuk membentuk URL.
let PG_TAB = 'akun';
window.goPgTab = t => { if (PG_TAB === t) return; PG_TAB = t; showPage('pengguna'); };

(() => {
const E = id => document.getElementById(id), MIN = 8;
const LVL = ['', 'Lemah', 'Cukup', 'Baik', 'Kuat'];
const CAN = {
  viewer: ['Melihat data keluarga, silsilah, keuangan, agenda, dan pengumuman', 'Mengganti password akun sendiri'],
  pengelola: ['Semua hak Viewer', 'Menambah & mengubah anggota, hubungan keluarga, foto, dan impor data silsilah'],
  admin: ['Semua hak Pengelola Silsilah', 'Mengelola keuangan, arisan & pengocokan, agenda, pengumuman, dokumentasi', 'Mengatur pengguna, hak akses, serta backup & pengaturan aplikasi'],
};

function strength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= MIN) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return p.length < MIN ? 1 : Math.max(1, Math.min(4, s));
}
const field = (id, label, ac) => `<label class="st-lab" for="${id}">${label}<span class="pw-in"><input class="st-in" id="${id}" name="${id}" type="password" autocomplete="${ac}" spellcheck="false" autocapitalize="off"><button type="button" class="pw-eye" data-eye="${id}" aria-label="Tampilkan password" title="Tampilkan / sembunyikan">👁</button></span></label>`;

function explain(e) {                                          // terjemahkan galat Supabase
  const m = String((e && e.message) || '');
  if (/different from the old/i.test(m)) return 'Password baru harus berbeda dari password saat ini.';
  if (/weak|easy to guess|pwned|at least|characters/i.test(m)) return 'Password baru terlalu lemah. Gunakan minimal ' + MIN + ' karakter dan hindari kata yang mudah ditebak.';
  if (/rate|too many|limit/i.test(m)) return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  if (/fetch|network/i.test(m)) return 'Tidak bisa terhubung ke server. Periksa koneksi internet Anda.';
  if (/session|jwt|not logged|reauth/i.test(m)) return 'Sesi login berakhir. Silakan keluar lalu masuk kembali.';
  return m || 'Gagal mengganti password. Coba lagi.';
}

// ---------- Tab "Akun Saya" ----------
const CHIP = { admin: 'warn', pengelola: 'ok', viewer: '' };            // warna selaras kartu peran di tab Kelola Pengguna
function accountHtml() {
  const role = CAN[ME.role] ? ME.role : 'viewer', lbl = ROLE_LBL[role];
  return `<div class="st-grid pg-grid">
  <div class="card st-card">
    <div class="st-h"><div><h3>Profil Saya</h3><p>Identitas dan hak akses akun Anda di FamilyHub.</p></div><span class="st-chip ${CHIP[role]}">${esc(lbl)}</span></div>
    <div class="pg-me"><div class="avatar pg-av">${esc(ini(ME.name))}</div><div><b>${esc(ME.name)}</b><small>${esc(ME.username || '')}</small></div></div>
    <div class="st-sub">Yang bisa Anda lakukan</div>
    <ul class="pg-can">${CAN[role].map(x => `<li>${x}</li>`).join('')}</ul>
    ${role === 'viewer' ? '<p class="st-note">Butuh akses lebih? Hubungi admin keluarga untuk mengubah peran Anda.</p>' : ''}
  </div>
  <div class="card st-card">
    <div class="st-h"><div><h3>Ganti Password</h3><p>Gunakan password yang kuat dan belum pernah dipakai di akun lain.</p></div></div>
    <form id="pwForm" novalidate>
      <input type="text" name="username" value="${esc(ME.username || '')}" autocomplete="username" readonly tabindex="-1" aria-hidden="true" class="pw-ghost">
      ${field('pwOld', 'Password saat ini', 'current-password')}
      ${field('pwNew', 'Password baru', 'new-password')}
      <div class="pw-meter" id="pwMeter" data-l="0"><i></i><i></i><i></i><i></i><span id="pwMeterTx">Minimal ${MIN} karakter</span></div>
      ${field('pwNew2', 'Ulangi password baru', 'new-password')}
      <p class="pw-msg" id="pwMsg" role="alert" aria-live="polite"></p>
      <div class="st-btnrow" style="margin-top:20px"><button class="primary st-btn" id="pwBtn">Simpan password baru</button></div>
    </form>
    <p class="st-note">Setelah diganti, perangkat lain yang sedang login akan diminta masuk ulang. Gunakan campuran huruf besar, kecil, angka, dan simbol.</p>
  </div></div>`;
}

function wirePassword() {
  const form = E('pwForm'); if (!form) return;
  const msg = (t, ok) => { const m = E('pwMsg'); m.textContent = t || ''; m.className = 'pw-msg' + (t ? ' show' : '') + (ok ? ' ok' : ''); };
  const bad = (t, id) => { msg(t); if (id) E(id).focus(); };

  form.addEventListener('click', e => {                         // tampil / sembunyikan password
    const b = e.target.closest('[data-eye]'); if (!b) return;
    const i = E(b.dataset.eye), show = i.type === 'password'; i.type = show ? 'text' : 'password';
    b.classList.toggle('on', show); b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  });
  E('pwNew').addEventListener('input', e => {                   // pengukur kekuatan
    const v = e.target.value, l = strength(v);
    E('pwMeter').dataset.l = l;
    E('pwMeterTx').textContent = l ? (v.length < MIN ? `Kurang ${MIN - v.length} karakter` : 'Kekuatan: ' + LVL[l]) : `Minimal ${MIN} karakter`;
  });
  form.addEventListener('input', () => msg(''));

  form.onsubmit = async e => {
    e.preventDefault();
    const o = E('pwOld').value, n = E('pwNew').value, n2 = E('pwNew2').value, btn = E('pwBtn');
    if (!o) return bad('Masukkan password Anda saat ini.', 'pwOld');
    if (n.length < MIN) return bad('Password baru minimal ' + MIN + ' karakter.', 'pwNew');
    if (n === o) return bad('Password baru harus berbeda dari password saat ini.', 'pwNew');
    if (n !== n2) return bad('Konfirmasi password baru tidak sama.', 'pwNew2');
    if (!navigator.onLine) return bad('Tidak ada koneksi internet.');
    btn.disabled = true; btn.textContent = 'Memproses…'; msg('');
    try {
      const v = await sb.auth.signInWithPassword({ email: ME.username, password: o });   // verifikasi password lama
      if (v.error) return bad(/invalid|credential/i.test(v.error.message) ? 'Password saat ini salah.' : explain(v.error), 'pwOld');
      const u = await sb.auth.updateUser({ password: n });
      if (u.error) return bad(explain(u.error), 'pwNew');
      try { await sb.auth.signOut({ scope: 'others' }); } catch (_) { }                   // sesi di perangkat lain berakhir
      form.reset(); E('pwMeter').dataset.l = 0; E('pwMeterTx').textContent = `Minimal ${MIN} karakter`;
      form.querySelectorAll('[data-eye]').forEach(b => { E(b.dataset.eye).type = 'password'; b.classList.remove('on'); });
      msg('✓ Password berhasil diganti. Gunakan password baru saat masuk berikutnya.', true); toast('✓ Password berhasil diganti', true);
    } catch (ex) { console.error(ex); bad(explain(ex)); }
    finally { btn.disabled = false; btn.textContent = 'Simpan password baru'; }
  };
  setTimeout(() => { const f = E('pwOld'); if (f && page === 'pengguna' && PG_TAB === 'akun' && innerWidth > 760) f.focus(); }, 60);
}

// ---------- Iuran Saya (portal anggota, v3.12) ----------
// Menampilkan HANYA data anggota yang dihubungkan admin ke akun ini (server: my_status()).
async function myIuranHtml() {
  const s = await api('my');
  if (!s.linked) return `<div class="card st-card"><h3 style="margin:0 0 6px">Akun belum dihubungkan ke anggota</h3><p class="st-note" style="margin:0">Status iuran belum bisa ditampilkan karena akun Anda belum dihubungkan ke data anggota keluarga. Minta admin menghubungkannya di <b>Akun &amp; Pengguna → Kelola Pengguna</b>.</p></div>`;
  const m = s.member, owed = s.types.reduce((a, t) => a + t.arrears_total, 0), nOwed = s.types.reduce((a, t) => a + t.arrears, 0), unpaid = s.types.filter(t => !t.paid_now);
  const ok = !owed && !unpaid.length;
  const banner = !m.active ? `<div class="card st-card"><b>Anggota nonaktif.</b> <span class="st-note">Iuran tidak ditagihkan untuk anggota yang nonaktif.</span></div>`
    : `<div class="card st-card" style="border-left:4px solid var(${ok ? '--green, #22c55e' : '--amber, #f59e0b'})"><b style="font-size:16px">${ok ? '✓ Iuran Anda lunas' : 'Ada iuran yang perlu diselesaikan'}</b><div class="st-note" style="margin:4px 0 0">${esc(m.name)} · periode ${esc(MONTH(s.period))}${owed ? ` · tunggakan <b>${esc(rp(owed))}</b> (${nOwed} bulan)` : ''}</div></div>`;
  const per = ps => ps.slice(0, 6).map(p => esc(MONTH(p))).join(', ') + (ps.length > 6 ? ` dan ${ps.length - 6} bulan lainnya` : '');
  const types = s.types.map(t => `<div class="card st-card" style="flex:1 1 240px;margin:0"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(t.name)}</b><span class="status ${t.paid_now ? 'done' : 'bad'}">${t.paid_now ? 'Lunas bulan ini' : 'Belum dibayar'}</span></div><div class="st-note" style="margin:6px 0 0">${esc(rp(t.amount))} / bulan${t.required_for_draw ? ' · wajib untuk undian' : ''}</div>${t.arrears ? `<div style="margin-top:8px;color:var(--danger,#ef4444)"><b>${t.arrears} bulan menunggak · ${esc(rp(t.arrears_total))}</b><div class="st-note" style="margin:2px 0 0">${per(t.arrears_periods)}</div></div>` : ''}</div>`).join('');
  const draw = `<div class="card st-card" style="margin:0"><b>🎲 Arisan</b><div class="st-note" style="margin:6px 0 0">${!m.active ? 'Anggota nonaktif tidak ikut undian.' : s.can_draw ? '✓ Anda memenuhi syarat undian bulan ini.' : 'Belum memenuhi syarat undian bulan ini — lunasi iuran yang wajib untuk undian.'}</div>${s.won.length ? `<div style="margin-top:8px">🏆 Pernah menang: ${s.won.map(w => esc(MONTH(w.period))).join(', ')}</div>` : ''}</div>`;
  const hist = s.recent.length ? `<div class="card"><div class="card-head"><h3>Riwayat pembayaran</h3><span>${s.recent.length} TERAKHIR</span></div><div class="tscroll"><table class="table"><thead><tr><th>Periode</th><th>Jenis</th><th>Nominal</th><th>Dibayar</th><th>Metode</th><th>No. kuitansi</th></tr></thead><tbody>${s.recent.map(r => `<tr><td>${esc(MONTH(r.period))}</td><td>${esc(r.type)}</td><td>${esc(rp(r.amount))}</td><td>${esc(fd(r.paid_at, { day: '2-digit', month: 'short', year: 'numeric' }))}</td><td>${esc(r.method)}</td><td><code>${esc(r.receipt_no || '—')}</code></td></tr>`).join('')}</tbody></table></div></div>` : `<div class="card st-card"><span class="st-note">Belum ada pembayaran tercatat.</span></div>`;
  return `<div style="display:flex;flex-direction:column;gap:14px">${banner}<div style="display:flex;flex-wrap:wrap;gap:14px">${types}${draw}</div>${hist}<p class="st-note">Data ini hanya milik Anda. Pembayaran dicatat oleh admin; hubungi admin bila ada yang tidak sesuai.</p></div>`;
}

// ---------- Halaman ----------
const ROLE_TAG = { admin: 'ADMIN', pengelola: 'PENGELOLA', viewer: 'ANGGOTA' };
R.pengguna = async () => {
  const admin = isA(); if (!admin && PG_TAB === 'kelola') PG_TAB = 'akun';
  const tab = PG_TAB, root = E('pengguna');
  const TABS = [['akun', '◉', 'Akun Saya'], ['iuran', '◈', 'Iuran Saya']].concat(admin ? [['kelola', '⚙', 'Kelola Pengguna']] : []);
  const tabs = `<div class="st-tabs" role="tablist">${TABS.map(([k, ic, l]) => `<button class="st-tab ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" onclick="goPgTab('${k}')"><span>${ic}</span>${l}</button>`).join('')}</div>`;
  root.innerHTML = hero(admin ? 'Akun & Pengguna' : 'Akun Saya',
    tab === 'kelola' ? 'Setujui pendaftar baru, atur peran, dan hubungkan akun ke anggota keluarga.' : tab === 'iuran' ? 'Status iuran, tunggakan, dan kuitansi Anda.' : 'Profil, hak akses, dan keamanan akun Anda.',
    `<div class="hero-date"><strong>${esc(ini(ME.name))}</strong><span>${ROLE_TAG[ME.role] || 'ANGGOTA'}</span></div>`) + tabs + '<div id="pgBody"></div>';
  const body = E('pgBody');
  if (tab === 'kelola') {
    body.innerHTML = '<div class="card st-card pg-load">Memuat daftar pengguna…</div>';
    const html = await usersAdminHtml();
    if (page === 'pengguna' && PG_TAB === 'kelola' && E('pgBody') === body) body.innerHTML = html;   // abaikan jika pengguna sudah pindah tab
  } else if (tab === 'iuran') {
    body.innerHTML = '<div class="card st-card pg-load">Memuat status iuran…</div>';
    let html; try { html = await myIuranHtml(); } catch (e) { html = '<div class="card st-card"><span class="st-note">Status iuran belum tersedia. Jalankan patch-013 pada database, lalu muat ulang.</span></div>'; }
    if (page === 'pengguna' && PG_TAB === 'iuran' && E('pgBody') === body) body.innerHTML = html;
  } else { body.innerHTML = accountHtml(); wirePassword(); }
};
})();
