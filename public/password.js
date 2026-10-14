// ===== Ganti password (v3.8) — halaman /password, tersedia untuk semua peran =====
// Alur: verifikasi password lama (login ulang) → updateUser({ password }) → keluarkan sesi di perangkat lain.
(() => {
titles.password = 'Ganti Password';
const E = id => document.getElementById(id), MIN = 8;
const LVL = ['', 'Lemah', 'Cukup', 'Baik', 'Kuat'];

function strength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= MIN) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]|[a-zA-Z]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return p.length < MIN ? 1 : Math.max(1, Math.min(4, s));
}
const field = (id, label, ac) => `<label for="${id}">${label}<span class="pw-in"><input id="${id}" name="${id}" type="password" autocomplete="${ac}" spellcheck="false" autocapitalize="off"><button type="button" class="pw-eye" data-eye="${id}" aria-label="Tampilkan password" title="Tampilkan / sembunyikan">👁</button></span></label>`;

// Terjemahkan pesan galat Supabase
function explain(e) {
  const m = String((e && e.message) || '');
  if (/different from the old/i.test(m)) return 'Password baru harus berbeda dari password saat ini.';
  if (/weak|easy to guess|pwned|at least|characters/i.test(m)) return 'Password baru terlalu lemah. Gunakan minimal ' + MIN + ' karakter dan hindari kata yang mudah ditebak.';
  if (/rate|too many|limit/i.test(m)) return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  if (/fetch|network/i.test(m)) return 'Tidak bisa terhubung ke server. Periksa koneksi internet Anda.';
  if (/session|jwt|not logged|reauth/i.test(m)) return 'Sesi login berakhir. Silakan keluar lalu masuk kembali.';
  return m || 'Gagal mengganti password. Coba lagi.';
}

R.password = async () => {
  E('password').innerHTML = hero('Ganti Password', 'Ubah password login Anda secara berkala agar akun keluarga tetap aman.') + `
  <div class="card pw-card">
    <div class="pw-who"><div class="avatar">${esc(ini(ME.name))}</div><div><b>${esc(ME.name)}</b><small>${esc(ME.username || '')}</small></div></div>
    <form id="pwForm" class="fform" novalidate>
      <input type="text" name="username" value="${esc(ME.username || '')}" autocomplete="username" readonly tabindex="-1" aria-hidden="true" class="pw-ghost">
      ${field('pwOld', 'Password saat ini', 'current-password')}
      ${field('pwNew', 'Password baru', 'new-password')}
      <div class="pw-meter" id="pwMeter" data-l="0"><i></i><i></i><i></i><i></i><span id="pwMeterTx">Minimal ${MIN} karakter</span></div>
      ${field('pwNew2', 'Ulangi password baru', 'new-password')}
      <p class="pw-msg" id="pwMsg" role="alert" aria-live="polite"></p>
      <div class="row"><button class="primary" id="pwBtn">Simpan password baru</button></div>
    </form>
    <ul class="pw-tips"><li>Gunakan minimal ${MIN} karakter, campuran huruf besar, kecil, angka, dan simbol.</li><li>Jangan memakai password yang sama dengan akun lain (email, bank, media sosial).</li><li>Setelah diganti, perangkat lain yang sedang login akan diminta masuk ulang.</li></ul>
  </div>`;

  const form = E('pwForm'), msg = (t, ok) => { const m = E('pwMsg'); m.textContent = t || ''; m.className = 'pw-msg' + (t ? ' show' : '') + (ok ? ' ok' : ''); };
  const bad = (t, id) => { msg(t); if (id) E(id).focus(); };

  form.addEventListener('click', e => {                         // tampil / sembunyikan password
    const b = e.target.closest('[data-eye]'); if (!b) return;
    const i = E(b.dataset.eye), show = i.type === 'password'; i.type = show ? 'text' : 'password';
    b.classList.toggle('on', show); b.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  });
  E('pwNew').addEventListener('input', e => {                   // pengukur kekuatan
    const l = strength(e.target.value);
    E('pwMeter').dataset.l = l;
    E('pwMeterTx').textContent = l ? (e.target.value.length < MIN ? `Kurang ${MIN - e.target.value.length} karakter` : 'Kekuatan: ' + LVL[l]) : `Minimal ${MIN} karakter`;
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
  setTimeout(() => { const f = E('pwOld'); if (f && page === 'password' && innerWidth > 760) f.focus(); }, 50);
};
})();
