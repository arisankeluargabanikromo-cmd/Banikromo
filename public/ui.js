// ============================================================
// Kit tampilan bersama (v3.18.0) — bahasa desain yang sama dengan menu Keuangan Keluarga:
//   ikon garis SVG • kartu KPI bergaris aksen • pill status • avatar berwarna • keadaan kosong • grafik berskala
// Dipakai oleh Dashboard, Anggota, Agenda, Pengumuman, Dokumentasi, dst. agar semua menu tampil konsisten.
// Gaya (CSS) ada di finance.css (komponen dasar) dan ui.css (tambahan & penyeragaman halaman lama).
// ============================================================
(() => {
const P = {
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3.5"/><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9.5a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z"/><circle cx="16.5" cy="14.5" r="1.1" fill="currentColor"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".7" fill="currentColor"/>',
  grid: '<rect x="3" y="3" width="7.5" height="9" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.8"/><rect x="13.5" y="12" width="7.5" height="9" rx="1.8"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="1.8"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9.5 8h5M9.5 12h5"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14.6c2.4.2 4 1.8 4 4.4"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>',
  file: '<path d="M7 3h8l4 4v14H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  megaphone: '<path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  tree: '<circle cx="12" cy="5" r="2.5"/><circle cx="5.5" cy="19" r="2.5"/><circle cx="18.5" cy="19" r="2.5"/><path d="M12 7.5V12M12 12l-6.5 4.5M12 12l6.5 4.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5L15.5 10"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L20 3M16 7l3 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".8" fill="currentColor"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
};
const ic = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.dot}</svg>`;
const hue = s => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const num = n => Number(n || 0).toLocaleString('id-ID');
const e = s => (typeof esc === 'function' ? esc(s) : String(s ?? ''));

// kartu ringkasan (KPI): cls = k-total|k-arisan|k-kas|k-ok|k-warn|k-in|k-out|k-flat
const kpi = (cls, label, icon, val, sub = '', extra = '', color = '') => `<div class="card kpi ${cls}"${color ? ` style="--k:${color}"` : ''}><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-ic">${ic(icon, 20)}</span></div><div class="kpi-val">${val}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}${extra}</div>`;
const progress = (pct, color = '') => `<div class="progress"><span style="width:${Math.max(0, Math.min(100, pct))}%${color ? `;background:${color}` : ''}"></span></div>`;
const pill = (tone, html, title = '') => `<span class="pill ${tone}"${title ? ` title="${e(title)}"` : ''}>${html}</span>`;
const who = (name, sub, extra = '') => `<div class="fin-who"><span class="fav" style="--h:${hue(name)}" aria-hidden="true">${e(initials(name))}</span><div><b>${e(name)}</b>${sub ? `<small>${e(sub)}</small>` : ''}</div>${extra}</div>`;
const empty = (icon, title, desc = '', action = '') => `<div class="empty">${ic(icon, 30)}<b>${title}</b>${desc ? `<span>${desc}</span>` : ''}${action}</div>`;
const money = n => `<span class="cur">Rp</span>${n < 0 ? `<span class="neg">${num(n)}</span>` : num(n)}`;
const cmp = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' jt' : a >= 1e3 ? (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' rb' : String(Math.round(n)); };
const niceMax = v => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 10) * p; };

// kepala kartu: judul + keterangan + tombol aksi
const head = (title, sub = '', actions = '') => `<div class="card-head"><div><h3>${title}</h3>${sub ? `<span>${sub}</span>` : ''}</div>${actions ? `<span class="fin-act">${actions}</span>` : ''}</div>`;
// tombol segmen dengan penghitung: items = [[key,label,count?]]
const seg = (items, active, fn) => `<div class="seg" role="group">${items.map(([k, l, n]) => `<button type="button" class="${active === k ? 'on' : ''}" onclick="${fn}('${k}')">${l}${n != null ? ` <em>${n}</em>` : ''}</button>`).join('')}</div>`;
// kotak pencarian berikon
const searchBox = (id, ph, val, fn) => `<label class="ui-search">${ic('search', 16)}<input id="${id}" type="search" placeholder="${e(ph)}" value="${e(val || '')}" oninput="${fn}(this.value)" autocomplete="off"></label>`;

// grafik batang masuk/keluar per bulan, berskala (sumbu Y & label bulan). rows: [{m:'2026-10', in:n, out:n}]
const barChart = (rows, { inColor = '#6957ff', outColor = '#f0996b', label = 'Grafik arus kas' } = {}) => {
  if (!rows.length) return empty('wallet', 'Belum ada transaksi', 'Grafik muncul setelah ada pemasukan atau pengeluaran.');
  const W = 700, H = 200, L = 40, T = 10, B = 24, cw = W - L, mx = niceMax(Math.max(1, ...rows.map(r => Math.max(r.in, r.out)))), bw = cw / rows.length, mon = m => (typeof MONTH === 'function' && /^\d{4}-\d{2}$/.test(m) ? MONTH(m).split(' ')[0].slice(0, 3) : m);
  const grid = [0, 1, 2, 3, 4].map(i => { const y = T + H - (H * i / 4); return `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="currentColor" opacity="${i ? '.10' : '.25'}"/><text x="${L - 6}" y="${y + 3.5}" text-anchor="end" font-size="10.5" fill="currentColor" opacity=".6">${i ? cmp(mx * i / 4) : '0'}</text>`; }).join('');
  const bars = rows.map((r, i) => { const x = L + i * bw + bw * .16, w = bw * .31, a = r.in / mx * H, o = r.out / mx * H; return `<g><title>${e(typeof MONTH === 'function' ? MONTH(r.m) : r.m)}: masuk Rp ${num(r.in)}, keluar Rp ${num(r.out)}</title><rect x="${x}" y="${T + H - a}" width="${w}" height="${a}" fill="${inColor}" rx="3"/><rect x="${x + w + 4}" y="${T + H - o}" width="${w}" height="${o}" fill="${outColor}" rx="3"/><text x="${L + i * bw + bw / 2}" y="${T + H + 17}" text-anchor="middle" font-size="11.5" fill="currentColor" opacity=".75">${e(mon(r.m))}</text></g>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${T + H + B}" class="fin-chart" role="img" aria-label="${e(label)}">${grid}${bars}</svg>`;
};
const rel = d => { const t = new Date(d + 'T00:00:00'), n = new Date(); n.setHours(0, 0, 0, 0); const k = Math.round((t - n) / 864e5); return k === 0 ? 'Hari ini' : k === 1 ? 'Besok' : k === -1 ? 'Kemarin' : k > 0 ? `${k} hari lagi` : `${-k} hari lalu`; };

window.UI = { ic, kpi, progress, pill, who, empty, money, cmp, niceMax, head, seg, searchBox, barChart, hue, initials, num, rel, P };
})();
