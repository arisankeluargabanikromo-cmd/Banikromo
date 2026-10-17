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
const VMAX = 26, IDLE = 1.3, ROWS = 9, STEP = .4;           // baris/detik saat mengocok & saat siaga; jumlah baris reel
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
const LIGHT = () => !document.body.classList.contains('dark');
const FX = { cv: null, cx: null, W: 0, H: 0, stars: [], parts: [] };
const COLORS = ['#22d3ee', '#a78bfa', '#ff3da6', '#ffd86b', '#fb7185', '#5eead4', '#60a5fa'];
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
  for (const s of FX.stars) { s.y += s.v * dt * boost; if (s.y > FX.H) { s.y = -4; s.x = Math.random() * FX.W; } c.globalAlpha = .25 + .45 * Math.abs(Math.sin(t / 900 + s.p)); c.fillStyle = LIGHT() ? '#7c8fd0' : '#bff3ff'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.28); c.fill(); }
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
    const th = off * STEP, R = DS.rh / STEP;                  // reel berbentuk silinder: baris melengkung menjauh ke atas/bawah
    r.style.transform = `translate3d(0,${(R * Math.sin(th)).toFixed(1)}px,${(R * Math.cos(th) - R).toFixed(1)}px) rotateX(${(-th).toFixed(3)}rad)`;
    r.style.opacity = Math.max(0, 1 - ab * .33).toFixed(2);
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
const STATUS = { idle: 'SIAGA', spin: 'MENGOCOK', stopping: 'MEMILIH', reveal: 'KONFIRMASI', done: 'SELESAI', empty: 'STANDBY' };
function setMode(m) { DS.st = m; DS.el.className = 'ds show ' + m + (fsEl() === DS.el ? ' fs' : ''); const l = q('#dsStat'); if (l) l.innerHTML = '<i></i>' + (STATUS[m] || ''); renderCtrl(); }
function header() {
  const d = DS.d, w = d.winner, p = DS.pend || d.pending;
  q('#dsPeriod').textContent = `${d.period ? PER(d.period) : 'Belum ada putaran'} · Siklus ${d.cycle}`;
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
let scr = 0;
function decode(el, text) {     // nama "terdekode" dari karakter acak; teks akhir selalu = nama pemenang
  const id = ++scr; el.textContent = text;
  if (matchMedia('(prefers-reduced-motion:reduce)').matches || text.length > 60) return;
  const G = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+<>', ch = [...text], N = ch.length, t0 = performance.now(), T = 950;
  const step = now => {
    if (id !== scr) return; if (!DS.open) { el.textContent = text; return; }
    const k = Math.min(1, (now - t0) / T), fixed = Math.floor(k * N);
    el.textContent = k >= 1 ? text : ch.map((c, i) => c === ' ' || i < fixed ? c : G[rnd(G.length)]).join('');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function showWinner(w, o) {   // w:{id,name}; o:{label,badge,ok,sub}
  decode(q('.ds-win .ds-name'), w.name);
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
    showWinner({ id: w.winner_id, name: w.winner_name }, { label: `PEMENANG ARISAN <b>${esc(PER(DS.d.period).toUpperCase())}</b>`, badge: '✓ DISAHKAN — SELAMAT!', ok: 1, sub: w.attempt > 1 ? `Disahkan pada kocokan ke-${w.attempt}` : '' });
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
  el.innerHTML = `<div class="ds-aurora"><i></i><i></i><i></i></div><div class="ds-grid"></div><div class="ds-beams"></div><div class="ds-vig"></div><canvas class="ds-fx"></canvas>
  <i class="ds-corner tl"></i><i class="ds-corner tr"></i><i class="ds-corner bl"></i><i class="ds-corner br"></i>
  <header class="ds-top"><div class="ds-brand"><div class="lm">FH</div><div>ARISAN KELUARGA<small id="dsPeriod"></small></div></div>
    <div class="ds-tools"><span class="ds-chip led" id="dsStat"></span><span class="ds-chip" id="dsAttempt"></span><button id="dsSound" title="Suara (M)" aria-label="Suara">${DS.mute ? '🔇' : '🔊'}</button><button id="dsFs" title="Layar penuh (F)" aria-label="Layar penuh">⛶</button><button id="dsClose" title="Tutup (Esc)" aria-label="Tutup">✕</button></div></header>
  <main class="ds-mid"><div class="ds-label" id="dsLabel">PEMENANG <b>ARISAN</b></div>
    <div class="ds-reel"><div class="ds-rows">${'<div class="ds-row"><span></span></div>'.repeat(ROWS)}</div><div class="ds-frame"></div><i class="ds-arrow l">▶</i><i class="ds-arrow r">◀</i></div>
    <div class="ds-win"><div class="ds-avw"><i class="ds-orbit"></i><i class="ds-orbit o2"></i><div class="ds-av"></div><span class="ds-crown">👑</span></div><div class="ds-name"></div><div class="ds-badge wait" id="dsBadge"></div><div class="ds-sub" id="dsWSub"></div></div>
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
    showWinner({ id: d.winner.winner_id, name: d.winner.winner_name }, { label: `PEMENANG ARISAN <b>${esc(PER(d.period).toUpperCase())}</b>`, badge: '✓ DISAHKAN', ok: 1, sub: d.winner.attempt > 1 ? `Disahkan pada kocokan ke-${d.winner.attempt}` : '' });
    setMode('done'); msg('Pengundian putaran ini sudah selesai.'); burst(FX.W / 2, FX.H * .4, 90);
  } else if (d.pending) resumePending();
  else if (!d.period) { setMode('empty'); msg('Belum ada putaran arisan aktif. Admin perlu membuka putaran lebih dulu (Arisan → 📅 Kelola putaran).'); }
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
  try { DS.wake && DS.wake.release(); } catch (_) {} DS.wake = null; if (page === 'dashboard') reload();
}
window.closeStage = closeStage;

// ---------------- Panel Pengocokan di Dashboard ----------------
// Kartu kendali di dashboard: status periode ini, pemenang, tombol buka panggung, peserta & riwayat.
// Pengocokan sendiri tetap berjalan di panggung layar penuh (openStage).
const STAT = { sah: ['Sah', ''], menunggu: ['Menunggu', 'pending'], tidak_hadir: ['Tidak hadir', 'bad'], dipanggil: ['Tidak hadir · dipanggil ulang', 'bad'] };
const cnt = h => { try { return JSON.parse(h.participants).length; } catch (_) { return '—'; } };
const RULES = [['Hanya anggota aktif', 'Peserta harus terdaftar sebagai anggota arisan.'], ['Sudah bayar iuran putaran ini', 'Yang belum lunas otomatis tidak ikut diundi. Putaran dijadwalkan & dibuka manual oleh admin sesuai permintaan anggota (Kelola putaran) — tidak harus sebulan sekali.'], ['Satu kali menang per siklus', 'Pemenang sebelumnya tidak ikut sampai siklus baru dimulai.'], ['Konfirmasi kehadiran', 'Pemenang sementara harus dikonfirmasi hadir. Bila tidak hadir, dicatat lalu diundi ulang; ia tidak dihitung menang dan tetap bisa ikut putaran berikutnya.'], ['Acak aman & tercatat', 'Diundi di server (crypto random), setiap kocokan disimpan beserta kode bukti.']];
let PD = null;                                               // data terakhir untuk dialog "lihat semua"
const dpChip = (n, cls = '') => `<span class="dp-chip ${cls}"><i>${esc(ini(n))}</i><span class="n">${esc(n)}</span></span>`;
// ---- Kartu dashboard: anatomi sama dengan Agenda Keluarga (kepala → hero → tab → baris → "Lihat semua") ----
let DRD, DRT = null, DRP = null, RST = null;                             // data terakhir, tab aktif, foto pemenang
const rn = k => ROUNDS[k] ? ROUNDS[k].seq : '·';
const SHORT = { sah: 'Sah', menunggu: 'Menunggu', tidak_hadir: 'Tidak hadir', dipanggil: 'Dipanggil ulang' };
function drInner(d) {
  const head = (sub, tools = '') => `<div class="card-head"><div><h3>Pengocokan Arisan</h3><span>${sub}</span></div>${tools}</div>`;
  if (d === undefined) return head('TIDAK DAPAT DIMUAT') + `<p class="dc-empty">Data pengocokan tidak dapat dimuat saat ini. <button class="btn-s" onclick="reload()">Coba lagi</button></p>`;
  if (stale(d)) return head('PERLU PEMBARUAN') + `<p class="dc-empty">⚠ <b>Pengocokan perlu pembaruan database.</b> ${STALE_MSG}</p>`;
  PD = d; const w = d.winner, p = d.pending, n = d.eligible.length, A = isA(), noR = !d.period, st = w ? 'done' : p ? 'wait' : n ? 'ready' : 'none', who = w ? w.winner_name : p ? p.winner_name : '';
  const pill = noR ? '⏸ Jeda' : { done: '✓ Sah', wait: '⏳ Menunggu', ready: 'Siap diundi', none: 'Belum siap' }[st];
  const cta = noR ? (A ? '📅 Kelola putaran' : 'Menunggu putaran dibuka') : w ? '🏆 Lihat pemenang' : p ? '▶ Lanjutkan konfirmasi' : d.attempts > 0 ? '🎲 Lanjut kocok ulang' : A ? '🎬 Mulai pengocokan' : '👁 Tonton pengocokan';
  const label = noR ? 'ARISAN JEDA' : w ? 'PEMENANG PUTARAN INI' : p ? 'PEMENANG SEMENTARA' : n ? 'SIAP DIKOCOK' : 'BELUM BISA DIKOCOK';
  const name = noR ? 'Belum ada putaran aktif' : who ? esc(who) : n ? `${n} peserta` : 'Belum ada peserta';
  const sub = noR ? (A ? 'Jadwalkan & buka putaran saat ada permintaan arisan berikutnya' : 'Menunggu admin membuka putaran berikutnya') : w ? (w.attempt > 1 ? `Disahkan pada kocokan ke-${w.attempt}` : 'Disahkan pada kocokan pertama') : p ? 'Menunggu konfirmasi kehadiran oleh admin' : n ? `memenuhi syarat${d.unpaid ? ` · ${d.unpaid} anggota belum bayar iuran (tidak ikut)` : ''}` : (d.unpaid ? `${d.unpaid} anggota belum bayar iuran` : 'Pastikan ada anggota aktif yang sudah membayar iuran');
  const av = who ? `<div class="dr-av" id="dpAv">${esc(ini(who))}${w ? '<span class="dr-crown">👑</span>' : ''}</div>` : `<div class="dr-av die">🎲</div>`;
  const tab = DRT || (w ? 'riwayat' : 'peserta'), row = (nm, sb, tail, cls = '') => `<div class="ag-row dr-row${cls}"><span class="dr-ini">${esc(ini(nm))}</span><div class="ag-t"><b>${esc(nm)}</b><small>${sb}</small></div>${tail}</div>`;
  let list, foot;
  if (tab === 'peserta') {
    const abs = d.absent.slice(0, 2).map(a => row(a.name, 'Dilewati pada putaran ini', '<span class="status bad">Tidak hadir</span>', ' abs')), ok = d.eligible.slice(0, 4 - abs.length).map(e => row(e.name, 'Memenuhi syarat', '<span class="ag-rel dr-ok">✓ Lunas</span>'));
    list = abs.concat(ok).join('') || `<p class="dc-empty">Belum ada peserta yang memenuhi syarat.${d.unpaid ? ` ${d.unpaid} anggota belum membayar iuran.` : ''}</p>`;
    foot = n ? `<button class="dc-all" onclick="openDrawList()">Lihat semua peserta (${n}) →</button>` : `<button class="dc-all" onclick="openDrawRules()">Aturan pengundian →</button>`;
  } else {
    list = d.history.slice(0, 4).map(h => { const s = STAT[h.status] || STAT.sah, mut = h.status === 'sah' || h.status === 'menunggu' ? '' : ' dr-mut';
      return `<div class="ag-row dr-row${mut}"><div class="dbx dr-mb"><small>PUTARAN</small><b>${rn(h.period)}</b></div><div class="ag-t"><b>${esc(h.winner_name)}</b><small>Kocokan ke-${h.attempt || 1} · ${cnt(h)} peserta</small></div><span class="status ${s[1]}">${SHORT[h.status] || s[0]}</span></div>`; }).join('') || '<p class="dc-empty">Belum ada pengundian tercatat.</p>';
    foot = d.history.length ? '<button class="dc-all" onclick="openDrawHistory()">Lihat semua riwayat →</button>' : '<button class="dc-all" onclick="openDrawRules()">Aturan pengundian →</button>';
  }
  const tools = `<div class="dc-ibs">${A ? '<button class="dc-ib" onclick="newCycle()" title="Mulai siklus baru (semua anggota bisa menang lagi)" aria-label="Siklus baru">↻</button>' : ''}<button class="dc-ib" onclick="openRounds()" title="Kelola putaran arisan" aria-label="Kelola putaran">📅</button><button class="dc-ib" onclick="openDrawRules()" title="Aturan pengundian &amp; transparansi" aria-label="Aturan pengundian">ℹ</button></div>`;
  return `${head(`${noR ? 'JEDA' : esc(PER(d.period).toUpperCase())} · SIKLUS ${d.cycle}`, tools)}${roundMeta(d.round)}
  <div class="dr-hero st-${st}"><div class="ah-top"><span class="ah-k">${label}</span><span class="ah-rel dr-pill ${st}">${pill}</span></div>
    <div class="dr-body">${av}<div class="dr-txt"><b>${name}</b><span>${sub}</span></div></div>
    <div class="dr-act"><button class="dr-go" onclick="${noR ? (A ? 'openRounds()' : 'void 0') : 'openStage()'}">${cta}</button>${noR ? '' : '<button class="dr-fs" onclick="openStage(true)" title="Layar penuh — cocok untuk proyektor / TV" aria-label="Layar penuh">⛶</button>'}</div>
    ${w && A ? '<button class="dr-minor" onclick="reopenDraw()">↩ Pemenang tidak hadir? Batalkan &amp; kocok ulang</button>' : ''}</div>
  <div class="ag-tabs"><div class="seg sm"><button class="${tab === 'peserta' ? 'on' : ''}" onclick="drTab('peserta')">Peserta (${n})</button><button class="${tab === 'riwayat' ? 'on' : ''}" onclick="drTab('riwayat')">Riwayat</button></div></div>
  <div class="ag-list">${list}</div>${foot}`;
}
async function drPhoto(d) {
  try { const id = d && !stale(d) && ((d.winner && d.winner.winner_id) || (d.pending && d.pending.winner_id)), av = $('#dpAv'); if (!id || !av) return;
    if (!DRP || DRP.id !== id) { const { data } = await sb.from('members').select('photo_path').eq('id', id).maybeSingle(); DRP = { id, path: (data && data.photo_path) || '' }; }
    if (!DRP.path) return; av.dataset.pp = DRP.path; av.dataset.sz = 'l'; await hydratePhotos(av.parentNode); } catch (_) { }
}
window.drTab = t => { DRT = t; const c = $('#drCard'); if (c) { c.innerHTML = drInner(DRD); drPhoto(DRD); } };
window.drCardInner = () => drInner(DRD);
window.drAfter = () => drPhoto(DRD);
const dlg = (id, title, body, cls = '') => modal2(id, `<div class="modal-top"><b>${title}</b><button class="close" onclick="closeModal2('${id}')">×</button></div><div class="dp-dlg">${body}</div>`, cls);
window.openDrawList = () => PD && dlg('drawListModal', `Peserta undian (${PD.eligible.length})`, `<div class="dp-people all">${PD.eligible.map(e => dpChip(e.name)).join('')}</div>`, 'dp-box');
window.openDrawRules = () => dlg('drawRulesModal', 'Aturan pengundian', RULES.map(a => `<div class="activity-row"><div class="activity-icon">✓</div><div class="activity-text"><b>${a[0]}</b><span>${a[1]}</span></div></div>`).join(''), 'dp-box');
window.openDrawHistory = () => PD && dlg('drawHistModal', 'Histori pengundian', `<div class="tscroll"><table class="table"><thead><tr><th>Putaran</th><th>Waktu</th><th>Kocokan</th><th>Peserta</th><th>Pemenang</th><th>Status</th><th>Kode bukti</th></tr></thead><tbody>${PD.history.map(h => { const s = STAT[h.status] || STAT.sah; return `<tr class="${h.status === 'sah' || h.status === 'menunggu' ? '' : 'dp-mut'}"><td>${esc(PERX(h.period))}</td><td>${ft(h.at)}</td><td>ke-${h.attempt || 1}</td><td>${cnt(h)}</td><td><b>${esc(h.winner_name)}</b></td><td><span class="status ${s[1]}">${s[0]}</span></td><td class="proof">${esc((h.proof || '').slice(0, 16))}…</td></tr>`; }).join('')}</tbody></table></div>`, 'dp-box wide');
const _dash = R.dashboard;                                   // dashboard dasar (app.js); kartu pengocokan ditempatkan oleh dashcards.js bersama kartu lainnya
R.dashboard = async () => { const dp = api('draw').catch(() => undefined), pp = sb.rpc('round_state').then(r => !r.error && r.data && Array.isArray(r.data.rows) ? r.data : null, () => null); DRT = null; await _dash(); DRD = await dp; RST = await pp; };   // round_state: diam bila database belum di-patch (018)
// ---------------- Putaran arisan: dijadwalkan & dibuka manual oleh admin (tidak terikat bulan) ----------------
// Arisan digelar mengikuti permintaan anggota, jadi satuannya PUTARAN, bukan bulan: bisa dua putaran dalam sebulan, bisa jeda berbulan-bulan.
// Admin menjadwalkan putaran (tanggal boleh belum pasti), membukanya saat penagihan/pengocokan dimulai, lalu menutupnya.
// Server (create_round / open_round / close_round / cancel_round) yang memvalidasi; layar ini hanya memberi petunjuk.
const rdate = d => d ? fd(d, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tanggal belum pasti';
const rname = r => 'Putaran ' + r.seq + (r.title ? ' · ' + r.title : '');
const RSTAT = { rencana: ['Rencana', 'pending'], aktif: ['Aktif', ''], selesai: ['Selesai', 'done'], batal: ['Batal', 'bad'] };
const roundMeta = r => r ? `<div class="rd-meta"><span>📅 ${esc(rdate(r.held_on))}</span>${r.place ? `<span>📍 ${esc(r.place)}</span>` : ''}${r.requester ? `<span>🙋 diminta ${esc(r.requester)}</span>` : ''}</div>` : '';
let ASK = null;                                                       // penyelesai janji untuk dialog konfirmasi putaran
window.roundAskDone = v => { closeModal2('roundAskModal'); const r = ASK; ASK = null; if (r) r(v === null ? null : { note: (($('#raNote') || {}).value || '').trim() }); };
window.roundAskChk = () => { const b = $('#raOk'), n = $('#raNote'); if (b && n) b.disabled = !n.value.trim(); };
function roundAsk({ title, msg, noteLabel, noteReq, ok, cls = 'primary' }) {
  if (ASK) ASK(null);
  return new Promise(res => {
    ASK = res;
    modal2('roundAskModal', `<div class="modal-top"><b>${esc(title)}</b><button class="close" onclick="roundAskDone(null)">×</button></div><div class="dp-dlg"><p class="rd-msg">${msg}</p>
      ${noteLabel ? `<label class="rd-f">${esc(noteLabel)}<textarea id="raNote" rows="2" maxlength="300" oninput="roundAskChk()"></textarea></label>` : ''}
      <div class="rd-btns"><button class="ghost" onclick="roundAskDone(null)">Batal</button><button class="${cls}" id="raOk" onclick="roundAskDone(true)" ${noteReq ? 'disabled' : ''}>${esc(ok)}</button></div></div>`, 'dp-box');
  });
}
function renderRounds(s) {
  RST = s; const A = isA(), act = s.rows.find(r => r.status === 'aktif');
  const st = !act ? 'Arisan sedang jeda — belum ada putaran yang dibuka.' : act.winner ? `✓ Pemenang: <b>${esc(act.winner)}</b>` : act.pending ? '⏳ Pemenang menunggu konfirmasi kehadiran' : act.attempts ? 'Belum ada pemenang yang disahkan' : 'Belum diundi';
  const btn = (k, id, lbl, cls = 'btn-s') => `<button class="${cls}" onclick="rdAct('${k}',${id})">${lbl}</button>`;
  const acts = r => !A ? '' : r.status === 'rencana' ? btn('open', r.id, 'Buka') + btn('form', r.id, 'Ubah') + btn('cancel', r.id, 'Batalkan', 'btn-s x')
    : r.status === 'aktif' ? btn('close', r.id, 'Tutup') + btn('form', r.id, 'Ubah') + btn('cancel', r.id, 'Batalkan', 'btn-s x')
    : r.status === 'selesai' ? btn('open', r.id, 'Buka kembali') + btn('form', r.id, 'Ubah') : '';
  const rows = s.rows.map(r => `<tr class="${r.status === 'aktif' || r.status === 'rencana' ? '' : 'dp-mut'}"><td><b>${esc(rname(r))}</b>${r.note ? `<br><small>${esc(r.note)}</small>` : ''}</td>
    <td>${esc(rdate(r.held_on))}${r.place ? `<br><small>📍 ${esc(r.place)}</small>` : ''}${r.status !== 'batal' && ROUNDS[r.period] && ROUNDS[r.period].ref_month ? `<br><small>Iuran Wajib: ${esc(MONTH(ROUNDS[r.period].ref_month))}</small>` : ''}</td><td>${r.requester ? esc(r.requester) : '—'}</td>
    <td><span class="status ${RSTAT[r.status][1]}">${RSTAT[r.status][0]}</span>${r.close_note ? `<br><small>${esc(r.close_note)}</small>` : ''}</td>
    <td>${r.winner ? esc(r.winner) : '—'}</td><td>${r.status === 'rencana' ? '—' : `${rp(r.collected)}<br><small>cair ${rp(r.disbursed)} · ${r.paid} bayar</small>`}</td><td class="rd-acts">${acts(r)}</td></tr>`).join('');
  dlg('roundModal', 'Kelola putaran arisan', `<div class="per-now"><small>PUTARAN AKTIF</small><b>${act ? esc(rname(act)) : 'Belum ada — arisan jeda'}</b><span>${st}</span>${act ? roundMeta(act).replace('class="rd-meta"', 'class="rd-meta" style="margin:6px 0 0"') : ''}</div>
    <p class="rd-note">Arisan tidak harus sebulan sekali. Jadwalkan putaran saat ada permintaan anggota (tanggal boleh belum pasti), buka bila penagihan & pengocokan dimulai, lalu tutup setelah selesai. Bulan tanpa putaran <b>tidak</b> dihitung tunggakan.</p>
    ${A ? '<div class="rd-top"><button class="primary" onclick="rdAct(\'form\')">＋ Jadwalkan putaran</button></div>' : ''}
    <div class="tscroll"><table class="table"><thead><tr><th>Putaran</th><th>Jadwal</th><th>Diminta oleh</th><th>Status</th><th>Pemenang</th><th>Dana arisan</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="dc-empty">Belum ada putaran. Jadwalkan putaran pertama.</td></tr>'}</tbody></table></div>`, 'dp-box wide');
}
const afterRound = async () => { if (window.resetCfg) resetCfg(); if (window.finResetView) finResetView(); reload(); renderRounds(await api('round')); };
window.openRounds = guard(async () => renderRounds(await api('round')));
window.openPeriods = window.openRounds;                              // nama lama (kompatibilitas)
window.rdAct = guard(async (kind, id) => {
  const s = RST, r = id ? s.rows.find(x => x.id === id) : null, act = s.rows.find(x => x.status === 'aktif');
  if (kind === 'form') return rdForm(r);
  if (kind === 'open') {
    const closing = act && act.id !== id ? act : null;
    if (closing && closing.pending > 0) return toast(`⛔ ${rname(closing)} masih punya pemenang yang menunggu konfirmasi kehadiran. Selesaikan dulu di pengocokan.`);
    const noWin = !!closing && !closing.winner;
    const a = await roundAsk({ title: r.status === 'selesai' ? 'Buka kembali putaran?' : 'Buka putaran?', ok: 'Buka putaran',
      msg: `Buka <b>${esc(rname(r))}</b>. Penagihan iuran dan pengocokan akan mengikuti putaran ini.${closing ? `<br>${esc(rname(closing))} akan ditutup${noWin ? ' <b>tanpa pemenang</b>' : ''}.` : ''}`,
      noteLabel: noWin ? `Alasan menutup ${rname(closing)} tanpa pemenang (wajib)` : closing ? 'Catatan penutupan (opsional)' : '', noteReq: noWin });
    if (!a) return;
    await api('round/open', 'POST', { id, note: a.note, force: noWin }); toast(`${rname(r)} dibuka`, true);
  } else if (kind === 'close') {
    if (act.pending > 0) return toast('⛔ Masih ada pemenang yang menunggu konfirmasi kehadiran. Selesaikan dulu di pengocokan.');
    const noWin = !act.winner;
    const a = await roundAsk({ title: 'Tutup putaran?', ok: 'Tutup putaran', msg: `Tutup <b>${esc(rname(act))}</b>${noWin ? ' <b>tanpa pemenang</b>' : ''}. Arisan jeda sampai putaran berikutnya dibuka. Iuran susulan putaran ini tetap bisa dicatat.`,
      noteLabel: noWin ? 'Alasan menutup tanpa pemenang (wajib)' : 'Catatan penutupan (opsional)', noteReq: noWin });
    if (!a) return;
    await api('round/close', 'POST', { note: a.note, force: noWin }); toast(`${rname(act)} ditutup`, true);
  } else if (kind === 'cancel') {
    const need = r.status !== 'rencana';
    const a = await roundAsk({ title: 'Batalkan putaran?', ok: 'Batalkan putaran', cls: 'primary danger', msg: `Batalkan <b>${esc(rname(r))}</b> karena tidak jadi digelar. Putaran yang dibatalkan tidak dihitung sebagai tunggakan dan tidak bisa dibuka lagi. (Hanya bisa bila belum ada pembayaran & pengocokan.)`,
      noteLabel: need ? 'Alasan pembatalan (wajib)' : 'Alasan (opsional)', noteReq: need });
    if (!a) return;
    await api('round/cancel', 'POST', { id, reason: a.note }); toast(`${rname(r)} dibatalkan`, true);
  }
  await afterRound();
});
window.rdForm = guard(async r => {
  let mem = []; try { mem = (await api('members')).filter(m => m.active === 1).sort((a, b) => a.name.localeCompare(b.name, 'id')); } catch (_) { }
  modal2('roundFormModal', `<div class="modal-top"><b>${r ? 'Ubah ' + esc(rname(r)) : 'Jadwalkan putaran baru'}</b><button class="close" onclick="closeModal2('roundFormModal')">×</button></div>
    <div class="dp-dlg"><div class="per-form" style="margin:0">
    <label>Judul (opsional)<input type="text" id="rfTitle" maxlength="80" value="${esc(r ? r.title || '' : '')}" placeholder="mis. Arisan Lebaran"></label>
    <label>Tanggal pelaksanaan <small>(kosongkan bila belum pasti)</small><input type="date" id="rfDate" value="${esc(r && r.held_on ? r.held_on : '')}"></label>
    <p class="rd-note" style="margin:-4px 0 0">Bulan tanggal ini menjadi <b>periode Iuran Wajib</b> putaran tersebut. Bila dikosongkan, periode otomatis jatuh pada bulan <b>sesudah</b> putaran sebelumnya, sehingga pembayaran Iuran Wajib putaran lama tidak ikut tampil di putaran baru.</p>
    <label>Tempat / tuan rumah<input type="text" id="rfPlace" maxlength="120" value="${esc(r ? r.place || '' : '')}" placeholder="mis. Rumah Bu Rina"></label>
    <label>Diminta oleh<select id="rfReq"><option value="">— tidak dicatat —</option>${mem.map(m => `<option value="${m.id}" ${r && r.requested_by === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    <label>Catatan (opsional)<textarea id="rfNote" rows="2" maxlength="500" placeholder="mis. dipercepat karena kebutuhan biaya sekolah">${esc(r ? r.note || '' : '')}</textarea></label>
    <div class="rd-btns"><button class="ghost" onclick="closeModal2('roundFormModal')">Batal</button><button class="primary" id="rfGo" onclick="rdSave(${r ? r.id : 0})">${r ? 'Simpan perubahan' : 'Jadwalkan'}</button></div></div></div>`, 'dp-box');
});
window.rdSave = guard(async id => {
  const b = $('#rfGo'); b.disabled = true;
  const body = { id, title: $('#rfTitle').value.trim(), held_on: $('#rfDate').value, place: $('#rfPlace').value.trim(), requested_by: $('#rfReq').value, note: $('#rfNote').value.trim() };
  try { await api('round/' + (id ? 'update' : 'create'), 'POST', body); } catch (e) { b.disabled = false; throw e; }
  closeModal2('roundFormModal'); toast(id ? 'Putaran diperbarui' : 'Putaran dijadwalkan', true); await afterRound();
});
window.reopenDraw = guard(async () => {
  const w = (await api('draw')).winner; if (!w) return;
  if (confirm(`Batalkan ${w.winner_name} sebagai pemenang karena tidak hadir, lalu buka pengocokan ulang?\nBeliau dicatat tidak hadir dan tidak dihitung menang.`)) { await api('draw/reopen', 'POST'); openStage(); }
});
window.newCycle = guard(async () => {
  if (confirm('Mulai siklus arisan baru? Semua anggota bisa menang lagi.')) { await api('draw/new-cycle', 'POST'); reload(); }
});
})();
