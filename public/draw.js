// ============================================================
// Pengocokan digital — panggung layar penuh (v2.5)
//
// Alur sistem:
//   MULAI  -> reel berputar (hanya animasi)
//   STOP   -> server mengacak pemenang (crypto random) & mencatatnya sbg "menunggu"
//             reel melambat dan MENDARAT tepat di nama hasil server (animasi tidak menentukan hasil)
//   REVEAL -> admin konfirmasi kehadiran:
//             ✓ Hadir        -> disahkan (status "sah", periode selesai)
//             ✗ Tidak hadir  -> dicatat, dilewati di periode ini, lalu KOCOK ULANG (pool berkurang)
//   Bila pool habis karena semua dilewati -> "Panggil ulang yang tidak hadir".
// Status "menunggu" tersimpan di database, jadi refresh/tutup layar tidak menghilangkan pemenang sementara.
// ============================================================
(() => {
const VMAX = 26, IDLE = 1.3, ROWS = 9;           // baris/detik saat mengocok & saat siaga; jumlah baris reel
const DS = { el: null, open: false, st: 'idle', d: null, ring: [], pos: 0, vel: 0, shift: 0, anim: null, raf: 0, last: 0,
  busy: false, mute: false, rh: 100, pend: null, spinAt: 0, rain: 0, wake: null };
try { DS.mute = localStorage.getItem('fh-draw-mute') === '1'; } catch (_) {}

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const delay = ms => new Promise(r => setTimeout(r, ms));
const q = s => DS.el.querySelector(s);
// draw_state versi lama (sebelum patch-005) tidak punya daftar "absent" -> database belum diperbarui
const stale = d => !d || !Array.isArray(d.absent);
const STALE_MSG = 'Database belum diperbarui. Jalankan <b>supabase/patch-005-pengocokan-ulang.sql</b> sekali di SQL Editor Supabase, lalu muat ulang halaman.';
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;

// ---------------- Suara (WebAudio, tanpa berkas) ----------------
const snd = (() => {
  let ctx, lastTick = 0;
  const get = () => { if (DS.mute) return null; try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch (_) { return null; } };
  const tone = (c, f, t0, d, type = 'sine', v = .06, f2) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + .01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + d + .02);
  };
  return {
    tick(speed) { const c = get(); if (!c) return; const n = c.currentTime; if (n - lastTick < .05) return; lastTick = n; tone(c, 700 + Math.min(speed, 30) * 14 + Math.random() * 80, n, .045, 'triangle', .05); },
    start() { const c = get(); if (!c) return; const n = c.currentTime; tone(c, 180, n, .55, 'sawtooth', .04, 900); },
    land() { const c = get(); if (!c) return; const n = c.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(c, f, n + i * .09, .45, 'triangle', .09)); },
    win() { const c = get(); if (!c) return; const n = c.currentTime; [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(c, f, n + i * .11, .6, 'triangle', .1)); tone(c, 131, n, 1.4, 'sine', .12); },
    thud() { const c = get(); if (!c) return; const n = c.currentTime; tone(c, 220, n, .5, 'sawtooth', .08, 70); }
  };
})();

// ---------------- Efek: bintang & confetti (satu kanvas) ----------------
const FX = { cv: null, cx: null, W: 0, H: 0, stars: [], parts: [] };
const COLORS = ['#ffd86b', '#ff6b9d', '#8d7cff', '#22c7a9', '#ffffff', '#ff9f43', '#5fb0ff'];
function fxResize() {
  const c = FX.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
  FX.W = innerWidth; FX.H = innerHeight; c.width = FX.W * dpr; c.height = FX.H * dpr; FX.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.max(60, Math.min(150, Math.round(FX.W * FX.H / 9500)));
  FX.stars = Array.from({ length: n }, () => ({ x: Math.random() * FX.W, y: Math.random() * FX.H, r: Math.random() * 1.6 + .3, v: Math.random() * 14 + 4, p: Math.random() * 6.28 }));
}
function burst(x, y, n = 140) {
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  for (let i = 0; i < n && FX.parts.length < 900; i++) { const a = Math.random() * Math.PI * 2, s = 250 + Math.random() * 900;
    FX.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 350, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 14, c: COLORS[rnd(COLORS.length)], round: Math.random() < .3 }); }
}
function fxFrame(dt, t) {
  const c = FX.cx; c.clearRect(0, 0, FX.W, FX.H);
  const boost = 1 + Math.min(DS.vel, 30) * .12;
  for (const s of FX.stars) { s.y += s.v * dt * boost; if (s.y > FX.H) { s.y = -4; s.x = Math.random() * FX.W; } c.globalAlpha = .25 + .45 * Math.abs(Math.sin(t / 900 + s.p)); c.fillStyle = '#fff'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.28); c.fill(); }
  if (DS.rain > t && FX.parts.length < 700) for (let i = 0; i < 4; i++) FX.parts.push({ x: Math.random() * FX.W, y: -12, vx: (Math.random() - .5) * 160, vy: 160 + Math.random() * 280, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 10, c: COLORS[rnd(COLORS.length)], round: Math.random() < .25 });
  for (let i = FX.parts.length - 1; i >= 0; i--) {
    const p = FX.parts[i]; p.vy += 900 * dt; p.vx *= 1 - Math.min(1, 1.1 * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.y > FX.H + 30) { FX.parts.splice(i, 1); continue; }
    c.globalAlpha = 1; c.fillStyle = p.c; c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
    if (p.round) { c.beginPath(); c.arc(0, 0, p.w / 2.4, 0, 6.28); c.fill(); } else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
  }
  c.globalAlpha = 1;
}

// ---------------- Reel ----------------
function buildRing() {
  const list = shuffle((DS.d.eligible || []).map(e => ({ id: e.id, name: e.name })));
  let ring = list.length ? list : [{ id: 0, name: '—' }];
  while (ring.length < 7) ring = ring.concat(ring);          // daftar pendek diulang agar reel tetap penuh
  DS.ring = ring; DS.shift = 0;
}
function sizeReel() { const r = q('.ds-reel'); if (!r) return; DS.rh = Math.max(56, (r.clientHeight || 300) / 5); r.style.setProperty('--rh', DS.rh + 'px'); }
function drawReel() {
  const n = DS.ring.length, rows = DS.rows; if (!n || !rows) return;
  const base = Math.round(DS.pos), blur = Math.min(7, Math.max(0, (Math.abs(DS.vel) - 6) * .34));
  DS.rowsBox.style.filter = blur > .4 ? `blur(${blur.toFixed(1)}px)` : '';
  for (let k = -4; k <= 4; k++) {
    const s = base + k, off = s - DS.pos, ab = Math.abs(off), r = rows[k + 4], nm = DS.ring[((s + DS.shift) % n + n) % n].name;
    if (r._n !== nm) { r.firstChild.textContent = nm; r._n = nm; }
    r.style.transform = `translateY(${(off * DS.rh).toFixed(1)}px) scale(${(1 - Math.min(ab, 2.2) * .14).toFixed(3)})`;
    r.style.opacity = Math.max(0, 1 - ab * .36).toFixed(2);
    r.classList.toggle('c', ab < .5);
  }
  if (base !== DS._f) { DS._f = base; if (Math.abs(DS.vel) > .8 && (DS.st === 'spin' || DS.st === 'stopping')) snd.tick(Math.abs(DS.vel)); }
}
function frame(t) {
  if (!DS.open) return;
  const dt = Math.min(.05, (t - DS.last) / 1000 || 0); DS.last = t; const a = DS.anim;
  if (a) {                                                     // pendaratan: easeOutCubic menuju slot tujuan
    const k = Math.min(1, (t - a.t0) / a.T);
    DS.pos = a.p0 + a.D * (1 - Math.pow(1 - k, 3)); DS.vel = a.D * 3 * Math.pow(1 - k, 2) / (a.T / 1000);
    if (k >= 1) { DS.pos = a.p0 + a.D; DS.vel = 0; DS.anim = null; a.done && a.done(); }
  } else if (DS.st === 'spin') { DS.vel += (VMAX - DS.vel) * Math.min(1, dt * 3.2); DS.pos += DS.vel * dt; }
  else if (DS.st === 'idle') { DS.vel += (IDLE - DS.vel) * Math.min(1, dt * 2); DS.pos += DS.vel * dt; }
  else DS.vel = 0;
  drawReel(); fxFrame(dt, t); DS.raf = requestAnimationFrame(frame);
}
// Hitung pendaratan: kecepatan awal = kecepatan putar saat ini (mulus), slot akhir = bilangan bulat berisi pemenang.
function land(winner, done) {
  let wi = DS.ring.findIndex(x => x.id === winner.id);
  if (wi < 0) { DS.ring.push({ id: winner.id, name: winner.name }); wi = DS.ring.length - 1; }   // pemenang di luar daftar tampilan (data berubah)
  const n = DS.ring.length, v0 = Math.max(DS.vel, 14);
  const sf = Math.round(DS.pos) + Math.round(v0 * 4.2 / 3) + 2, D = sf - DS.pos, T = 3000 * D / v0;
  DS.shift = ((wi - sf) % n + n) % n;     // nama di slot akhir = pemenang; pergantian tak terlihat karena reel sedang buram
  DS.anim = { t0: performance.now(), T, p0: DS.pos, D, done }; DS.st = 'stopping';
}

// ---------------- Tampilan & status ----------------
function setMode(m) { DS.st = m; DS.el.className = 'ds show ' + m + (fsEl() === DS.el ? ' fs' : ''); renderCtrl(); }
function header() {
  const d = DS.d, w = d.winner, p = DS.pend || d.pending;
  q('#dsPeriod').textContent = `${MONTH(d.period)} · Siklus ${d.cycle}`;
  q('#dsAttempt').textContent = w ? `Disahkan di kocokan ke-${w.attempt}` : p ? `Kocokan ke-${p.attempt}` : `Kocokan ke-${(+d.attempts || 0) + 1}`;
  q('#dsAbsent').innerHTML = d.absent.length ? `<small>Dilewati (tidak hadir):</small>` + d.absent.map(a => `<span>${esc(a.name)}</span>`).join('') : '';
}
function msg(t) { q('#dsMsg').innerHTML = t || ''; }
function renderCtrl() {
  const c = q('#dsCtrl'), A = isA(), d = DS.d, st = DS.st; let h = '';
  if (st === 'idle') h = A ? `<button class="ds-btn go" id="dsGo">${(+d.attempts || 0) ? '🎲 KOCOK ULANG' : '🎲 MULAI KOCOK'}</button>` : '';
  else if (st === 'spin') h = A ? `<button class="ds-btn stop" id="dsStop">⏹ STOP</button>` : '';
  else if (st === 'stopping') h = '';
  else if (st === 'reveal') h = A ? `<button class="ds-btn yes" id="dsYes">✓ HADIR — SAHKAN</button><button class="ds-btn no" id="dsNo">✗ TIDAK HADIR — KOCOK ULANG</button>` : '';
  else if (st === 'done') h = (A ? `<button class="ds-btn no" id="dsReopen">↩ PEMENANG TIDAK HADIR — KOCOK ULANG</button>` : '') + `<button class="ds-btn soft" id="dsEnd">Selesai</button>`;
  else if (st === 'empty') h = (A && d.absent.length ? `<button class="ds-btn go" id="dsRecall">↺ PANGGIL ULANG YANG TIDAK HADIR</button>` : '') + `<button class="ds-btn soft" id="dsEnd">Tutup</button>`;
  c.innerHTML = h;
}
function showWinner(w, o) {   // w:{id,name}; o:{label,badge,ok,sub}
  q('.ds-win .ds-name').textContent = w.name;
  q('#dsBadge').className = 'ds-badge ' + (o.ok ? 'ok' : 'wait'); q('#dsBadge').textContent = o.badge;
  q('#dsWSub').textContent = o.sub || ''; q('#dsLabel').innerHTML = o.label;
  const av = q('.ds-av'); av.classList.remove('has'); av.style.backgroundImage = ''; av.textContent = ini(w.name); delete av.dataset.pp; loadPhoto(w.id);
}
async function loadPhoto(id) {   // foto profil (bila ada) via URL bertanda tangan yang sudah dipakai modul anggota
  try {
    const { data } = await sb.from('members').select('photo_path').eq('id', id).maybeSingle(); if (!data || !data.photo_path || !DS.open) return;
    const av = q('.ds-av'); av.dataset.pp = data.photo_path; av.dataset.sz = 'l'; await hydratePhotos(q('.ds-win'));
  } catch (_) {}
}

// ---------------- Aksi ----------------
async function refresh() {
  const d = await api('draw');
  if (stale(d)) { DS.d = d; setStale(); throw null; }
  DS.d = d; header();
}
function setStale() {
  DS.pend = null; DS.st = 'empty'; DS.el.className = 'ds show empty';
  q('#dsLabel').innerHTML = 'PERLU <b>PEMBARUAN</b>'; msg(STALE_MSG);
  q('#dsCtrl').innerHTML = '<button class="ds-btn soft" id="dsEnd">Tutup</button>';
}
function onGo() {
  if (DS.busy || DS.st !== 'idle' || !isA()) return;
  if (!DS.d.eligible.length) return setMode('empty');
  buildRing(); DS.vel = 2; DS.spinAt = performance.now(); DS.el.classList.remove('landed');
  q('#dsLabel').innerHTML = 'MENGOCOK…'; msg('Tekan <b>STOP</b> saat sudah siap — pemenang ditentukan acak oleh sistem.'); snd.start(); setMode('spin');
}
async function onStop() {
  if (DS.busy || DS.st !== 'spin' || !isA()) return; DS.busy = true;
  const b = q('#dsStop'); if (b) { b.disabled = true; b.textContent = 'Menentukan pemenang…'; } msg('');
  let r;
  try { r = await api('draw', 'POST'); }
  catch (e) {   // gagal: mungkin respons hilang padahal server sudah mencatat pemenang -> cek ulang & pulihkan
    DS.busy = false; try { await refresh(); } catch (_) {}
    if (DS.d && DS.d.pending) return resumePending();
    buildRing(); setMode('idle'); q('#dsLabel').innerHTML = 'PEMENANG <b>ARISAN</b>'; msg('Gagal mengocok. Periksa koneksi lalu coba lagi.'); return;
  }
  DS.pend = { id: r.id, attempt: r.attempt, winner_id: r.winner.id, winner_name: r.winner.name }; header();
  setMode('stopping'); q('#dsLabel').innerHTML = 'MEMILIH <b>PEMENANG</b>…';
  land(r.winner, async () => {
    DS.busy = false; if (!DS.open) return;
    snd.land(); DS.el.classList.add('landed'); burst(FX.W / 2, FX.H * .48, 130);
    await delay(1000); if (!DS.open) return;
    reveal(r.winner, r.attempt, r.pool);
  });
}
function reveal(w, attempt, pool) {
  showWinner(w, { label: 'PEMENANG <b>SEMENTARA</b>', badge: '⏳ MENUNGGU KONFIRMASI KEHADIRAN', sub: `Kocokan ke-${attempt}${pool ? ` · dipilih acak dari ${pool} peserta` : ''}` });
  setMode('reveal'); msg(isA() ? 'Panggil nama pemenang. Apakah beliau hadir?' : 'Menunggu admin mengonfirmasi kehadiran pemenang…');
  DS.rain = performance.now() + 2600; burst(FX.W / 2, FX.H * .4, 160); snd.win();
}
function resumePending() { const p = DS.d.pending; DS.pend = p; reveal({ id: p.winner_id, name: p.winner_name }, p.attempt, 0); burst(FX.W / 2, FX.H * .4, 60); }
async function onYes() {
  if (DS.busy || !DS.pend) return; DS.busy = true;
  try {
    await api('draw/confirm', 'POST', { id: DS.pend.id }); const w = DS.pend; DS.pend = null; await refresh();
    showWinner({ id: w.winner_id, name: w.winner_name }, { label: `PEMENANG ARISAN <b>${esc(MONTH(DS.d.period).toUpperCase())}</b>`, badge: '✓ DISAHKAN — SELAMAT!', ok: 1, sub: w.attempt > 1 ? `Disahkan pada kocokan ke-${w.attempt}` : '' });
    setMode('done'); msg('Pemenang telah tercatat di riwayat pengundian beserta kode bukti.'); DS.rain = performance.now() + 7000; burst(FX.W / 2, FX.H * .4, 220); snd.win(); toast('Pemenang disahkan: ' + w.winner_name, true);
  } catch (e) { if (e) console.error(e); } finally { DS.busy = false; }
}
async function onNo() {
  if (DS.busy || !DS.pend) return; DS.busy = true;
  try {
    const w = DS.pend, r = await api('draw/absent', 'POST', { id: w.id }); DS.pend = null; await refresh(); snd.thud();
    DS.el.classList.remove('landed'); buildRing(); q('#dsLabel').innerHTML = 'PEMENANG <b>ARISAN</b>';
    if (!DS.d.eligible.length) { setMode('empty'); msg(`${esc(w.winner_name)} dicatat tidak hadir. Tidak ada peserta tersisa untuk diundi.`); }
    else { setMode('idle'); msg(`<b>${esc(w.winner_name)}</b> dicatat tidak hadir. ${DS.d.eligible.length} peserta masih bisa diundi — tekan <b>KOCOK ULANG</b>.`); }
  } catch (e) { if (e) console.error(e); } finally { DS.busy = false; }
}
async function onReopen() {
  if (DS.busy) return; DS.busy = true;
  try {
    const nm = DS.d.winner.winner_name; await api('draw/reopen', 'POST'); await refresh(); snd.thud(); DS.el.classList.remove('landed'); buildRing(); q('#dsLabel').innerHTML = 'PEMENANG <b>ARISAN</b>';
    if (!DS.d.eligible.length) { setMode('empty'); msg(`${esc(nm)} dicatat tidak hadir. Tidak ada peserta tersisa untuk diundi.`); }
    else { setMode('idle'); msg(`<b>${esc(nm)}</b> dicatat tidak hadir. ${DS.d.eligible.length} peserta masih bisa diundi — tekan <b>KOCOK ULANG</b>.`); }
  } catch (e) { if (e) console.error(e); } finally { DS.busy = false; }
}
async function onRecall() {
  if (DS.busy) return; DS.busy = true;
  try { const n = await api('draw/recall', 'POST'); await refresh(); buildRing(); q('#dsLabel').innerHTML = 'PEMENANG <b>ARISAN</b>'; setMode('idle'); msg(`${n} peserta yang tadi tidak hadir dipanggil kembali ke dalam undian.`); }
  catch (e) { if (e) console.error(e); } finally { DS.busy = false; }
}
function arm(btn, label, fn) {      // ketuk dua kali agar tidak salah tekan saat acara berlangsung
  const other = btn.id === 'dsYes' ? q('#dsNo') : btn.id === 'dsNo' ? q('#dsYes') : null;
  if (other && other.dataset.armed) disarm(other);
  if (btn.dataset.armed) { disarm(btn, true); return fn(); }
  btn.dataset.armed = 1; btn._o = btn.innerHTML; btn.innerHTML = label; btn.classList.add('armed'); btn._t = setTimeout(() => disarm(btn), 4500);
}
function disarm(b) { clearTimeout(b._t); delete b.dataset.armed; if (b._o) b.innerHTML = b._o; b.classList.remove('armed'); }
function primary() { const a = document.activeElement; a && a.blur && a.blur(); if (DS.st === 'idle') onGo(); else if (DS.st === 'spin') onStop(); }

// ---------------- Layar penuh, suara, wake lock ----------------
function enterFs() {
  const e = DS.el, f = e.requestFullscreen || e.webkitRequestFullscreen;
  if (!f) return toast('Layar penuh tidak didukung di perangkat ini. Panggung sudah memenuhi layar.');
  try { const p = f.call(e, { navigationUI: 'hide' }); p && p.catch && p.catch(() => {}); } catch (_) {}
}
function exitFs() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) {} }
const toggleFs = () => fsEl() === DS.el ? exitFs() : enterFs();
function syncFs() { if (!DS.el) return; const on = fsEl() === DS.el; DS.el.classList.toggle('fs', on); const b = q('#dsFs'); if (b) { b.textContent = on ? '🗗' : '⛶'; b.title = on ? 'Keluar layar penuh (F)' : 'Layar penuh (F)'; } setTimeout(() => { fxResize(); sizeReel(); }, 120); }
function toggleMute() { DS.mute = !DS.mute; try { localStorage.setItem('fh-draw-mute', DS.mute ? '1' : '0'); } catch (_) {} q('#dsSound').textContent = DS.mute ? '🔇' : '🔊'; }
async function wakeLock() { try { if (navigator.wakeLock && DS.open) DS.wake = await navigator.wakeLock.request('screen'); } catch (_) {} }

// ---------------- Bangun & buka/tutup ----------------
function build() {
  if (DS.el) return;
  const el = DS.el = document.createElement('div'); el.id = 'dstage'; el.className = 'ds'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Panggung pengocokan arisan');
  el.innerHTML = `<div class="ds-aurora"><i></i><i></i><i></i></div><div class="ds-beams"></div><div class="ds-vig"></div><canvas class="ds-fx"></canvas>
  <header class="ds-top"><div class="ds-brand"><div class="lm">FH</div><div>ARISAN KELUARGA<small id="dsPeriod"></small></div></div>
    <div class="ds-tools"><span class="ds-chip" id="dsAttempt"></span><button id="dsSound" title="Suara (M)" aria-label="Suara">${DS.mute ? '🔇' : '🔊'}</button><button id="dsFs" title="Layar penuh (F)" aria-label="Layar penuh">⛶</button><button id="dsClose" title="Tutup (Esc)" aria-label="Tutup">✕</button></div></header>
  <main class="ds-mid"><div class="ds-label" id="dsLabel">PEMENANG <b>ARISAN</b></div>
    <div class="ds-reel"><div class="ds-rows">${'<div class="ds-row"><span></span></div>'.repeat(ROWS)}</div><div class="ds-frame"></div><i class="ds-arrow l">▶</i><i class="ds-arrow r">◀</i></div>
    <div class="ds-win"><div class="ds-avw"><div class="ds-av"></div><span class="ds-crown">👑</span></div><div class="ds-name"></div><div class="ds-badge wait" id="dsBadge"></div><div class="ds-sub" id="dsWSub"></div></div>
    <div class="ds-msg" id="dsMsg"></div></main>
  <footer class="ds-bot"><div class="ds-absent" id="dsAbsent"></div><div class="ds-ctrl" id="dsCtrl"></div>
    <div class="ds-hint"><kbd>Spasi</kbd> Mulai / Stop &nbsp;·&nbsp; <kbd>F</kbd> Layar penuh &nbsp;·&nbsp; <kbd>M</kbd> Suara &nbsp;·&nbsp; <kbd>Esc</kbd> Tutup</div></footer>`;
  document.body.appendChild(el);
  DS.rowsBox = q('.ds-rows'); DS.rows = [...el.querySelectorAll('.ds-row')]; FX.cv = q('.ds-fx'); FX.cx = FX.cv.getContext('2d');
  q('#dsClose').onclick = closeStage; q('#dsFs').onclick = toggleFs; q('#dsSound').onclick = toggleMute;
  q('#dsCtrl').onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.id === 'dsGo') onGo(); else if (b.id === 'dsStop') onStop();
    else if (b.id === 'dsYes') arm(b, 'KETUK LAGI UNTUK MENYAHKAN', onYes);
    else if (b.id === 'dsNo') arm(b, 'KETUK LAGI: TIDAK HADIR', onNo);
    else if (b.id === 'dsReopen') arm(b, 'KETUK LAGI UNTUK MEMBATALKAN PEMENANG', onReopen);
    else if (b.id === 'dsRecall') onRecall(); else if (b.id === 'dsEnd') closeStage();
  };
  addEventListener('resize', () => { if (DS.open) { fxResize(); sizeReel(); } });
  document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeLock(); });
  document.addEventListener('keydown', e => {
    if (!DS.open || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.code === 'Space') { e.preventDefault(); primary(); }
    else if (e.key === 'f' || e.key === 'F') toggleFs();
    else if (e.key === 'm' || e.key === 'M') toggleMute();
    else if (e.key === 'Escape' && !fsEl()) closeStage();
  });
}
async function initState() {
  try { await refresh(); } catch (e) { if (e === null) return; return closeStage(); }   // null = database lama (pesan sudah tampil)
  const d = DS.d; buildRing(); DS.pos = rnd(DS.ring.length); sizeReel(); q('#dsLabel').innerHTML = 'PEMENANG <b>ARISAN</b>';
  if (d.winner) {
    showWinner({ id: d.winner.winner_id, name: d.winner.winner_name }, { label: `PEMENANG ARISAN <b>${esc(MONTH(d.period).toUpperCase())}</b>`, badge: '✓ DISAHKAN', ok: 1, sub: d.winner.attempt > 1 ? `Disahkan pada kocokan ke-${d.winner.attempt}` : '' });
    setMode('done'); msg('Pengundian bulan ini sudah selesai.'); burst(FX.W / 2, FX.H * .4, 90);
  } else if (d.pending) resumePending();
  else if (!d.eligible.length) { setMode('empty'); msg(d.absent.length ? 'Semua peserta yang memenuhi syarat sudah dilewati karena tidak hadir.' : `Belum ada peserta yang memenuhi syarat${d.unpaid ? ` (${d.unpaid} anggota belum bayar iuran)` : ''}.`); }
  else { setMode('idle'); msg(isA() ? `${d.eligible.length} peserta siap diundi${d.unpaid ? ` · ${d.unpaid} belum bayar (tidak ikut)` : ''}` : `${d.eligible.length} peserta siap diundi — menunggu admin memulai.`); }
  header();
}
window.openStage = fs => {        // dipanggil dari tombol (gesture pengguna) agar layar penuh diizinkan browser
  build(); if (DS.open) return; DS.open = true; DS.el.classList.add('show'); document.body.style.overflow = 'hidden';
  if (fs) enterFs(); fxResize(); sizeReel(); DS.last = performance.now(); DS.raf = requestAnimationFrame(frame); wakeLock(); syncFs(); initState();
};
function closeStage() {
  if (!DS.open) return; DS.open = false; DS.anim = null; DS.busy = false; cancelAnimationFrame(DS.raf); FX.parts = [];
  if (fsEl() === DS.el) exitFs(); DS.el.className = 'ds'; document.body.style.overflow = '';
  try { DS.wake && DS.wake.release(); } catch (_) {} DS.wake = null; if (page === 'pengocokan') reload();
}
window.closeStage = closeStage;

// ---------------- Halaman Pengocokan ----------------
const STAT = { sah: ['Sah', ''], menunggu: ['Menunggu', 'pending'], tidak_hadir: ['Tidak hadir', 'bad'], dipanggil: ['Tidak hadir · dipanggil ulang', 'bad'] };
const cnt = h => { try { return JSON.parse(h.participants).length; } catch (_) { return '—'; } };
R.pengocokan = async () => {
  const d = await api('draw');
  if (stale(d)) { $('#pengocokan').innerHTML = hero('Pengocokan Digital', 'Perlu pembaruan database.', '') + `<div class="card" style="padding:24px"><h3 style="margin:0 0 8px">⚠ Database belum diperbarui</h3><p style="margin:0;line-height:1.6">${STALE_MSG}</p></div>`; return; }
  const w = d.winner, p = d.pending, n = d.eligible.length;
  const stat = w ? ['', 'Sudah diundi'] : p ? ['pending', 'Menunggu konfirmasi'] : ['pending', n ? 'Siap diundi' : 'Belum ada peserta'];
  const cta = w ? '🏆 Lihat Pemenang' : p ? '▶ Lanjutkan Konfirmasi' : (d.attempts > 0 ? '🎲 Lanjut Kocok Ulang' : '🎬 Buka Panggung Pengocokan');
  const big = w ? esc(w.winner_name) : p ? esc(p.winner_name) : 'Siap Diundi';
  const sub = w ? `Disahkan di kocokan ke-${w.attempt}` : p ? 'Pemenang sementara — menunggu konfirmasi kehadiran' : `${n} peserta memenuhi syarat${d.unpaid ? ` • ${d.unpaid} belum bayar` : ''}`;
  $('#pengocokan').innerHTML = hero('Pengocokan Digital', 'Pengundian pemenang arisan secara transparan, teracak, dan dapat diaudit.', `<div class="hero-date"><strong>${MONTH(d.period).split(' ')[0]}</strong><span>SIKLUS ${d.cycle}</span></div>`) + `
  <div class="content2"><div class="card"><div class="card-head"><div><h3>Pengundian Pemenang</h3><span>MODE PANGGUNG • LAYAR PENUH</span></div><span class="status ${stat[0]}">${stat[1]}</span></div><div style="padding:10px 25px 25px">
    <div class="draw-stage dp-prev"><div class="k">PEMENANG ARISAN</div><div class="n">${big}</div><div class="s">${sub}</div></div>
    ${d.absent.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;align-items:center"><small class="muted">Dilewati (tidak hadir):</small>${d.absent.map(a => `<span class="dp-chip abs">${esc(a.name)}</span>`).join('')}</div>` : ''}
    <div class="dp-btns"><button class="primary" onclick="openStage()">${cta}</button><button class="primary" onclick="openStage(true)">⛶ Layar Penuh</button>${adm('<button class="icon-btn" title="Mulai siklus baru" onclick="newCycle()">↻</button>')}</div>
    ${w ? adm('<button class="ghost" style="margin-top:10px;width:100%" onclick="reopenDraw()">↩ Pemenang tidak hadir? Batalkan &amp; kocok ulang</button>') : ''}
  </div></div>
  <div class="card"><div class="card-head"><h3>Aturan Pengundian</h3><span>TRANSPARANSI</span></div><div style="padding:5px 20px 20px">${[['Hanya anggota aktif', 'Peserta harus terdaftar sebagai anggota arisan.'], ['Sudah bayar iuran bulan ini', 'Yang belum lunas otomatis tidak ikut diundi.'], ['Satu kali menang per siklus', 'Pemenang sebelumnya tidak ikut sampai siklus baru dimulai.'], ['Konfirmasi kehadiran', 'Pemenang sementara harus dikonfirmasi hadir. Bila tidak hadir, dicatat lalu diundi ulang; ia tidak dihitung menang dan tetap bisa ikut bulan berikutnya.'], ['Acak aman & tercatat', 'Diundi di server (crypto random), setiap kocokan disimpan beserta kode bukti.']].map(a => `<div class="activity-row"><div class="activity-icon">✓</div><div class="activity-text"><b>${a[0]}</b><span>${a[1]}</span></div></div>`).join('')}</div></div></div>
  <div class="card" style="margin-bottom:20px"><div class="card-head"><h3>Peserta Eligible</h3><span>${n} peserta</span></div><div style="padding:0 20px 20px;display:flex;flex-wrap:wrap;gap:8px">${d.eligible.map(e => `<span class="dp-chip">✓ ${esc(e.name)}</span>`).join('') || '<small>Belum ada peserta eligible.</small>'}</div></div>
  <div class="card"><div class="card-head"><h3>Histori Pengundian</h3><span>TERCATAT OTOMATIS</span></div><div class="tscroll"><table class="table"><thead><tr><th>Periode</th><th>Waktu</th><th>Kocokan</th><th>Peserta</th><th>Pemenang</th><th>Status</th><th>Kode bukti</th></tr></thead><tbody>${d.history.map(h => { const s = STAT[h.status] || STAT.sah; return `<tr class="${h.status === 'sah' || h.status === 'menunggu' ? '' : 'dp-mut'}"><td>${MONTH(h.period)}</td><td>${ft(h.at)}</td><td>ke-${h.attempt || 1}</td><td>${cnt(h)}</td><td><b>${esc(h.winner_name)}</b></td><td><span class="status ${s[1]}">${s[0]}</span></td><td class="proof">${esc((h.proof || '').slice(0, 16))}…</td></tr>`; }).join('')}</tbody></table></div></div>`;
};
window.reopenDraw = guard(async () => {
  const w = (await api('draw')).winner; if (!w) return;
  if (confirm(`Batalkan ${w.winner_name} sebagai pemenang karena tidak hadir, lalu buka pengocokan ulang?\nBeliau dicatat tidak hadir dan tidak dihitung menang.`)) { await api('draw/reopen', 'POST'); openStage(); }
});
window.newCycle = guard(async () => {
  if (confirm('Mulai siklus arisan baru? Semua anggota bisa menang lagi.')) { await api('draw/new-cycle', 'POST'); reload(); }
});
})();
