// Lapisan data: menerjemahkan panggilan api() ke Supabase (Auth, tabel + RLS, dan fungsi RPC).
const cfg = window.FH_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('GANTI')) addEventListener('load', () => alert('Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY (lihat README).'));

const MSG = { 42501: 'Hanya admin yang boleh mengubah data', 23503: 'Data masih dipakai (mis. anggota pernah menang undian) — nonaktifkan saja', 23505: 'Data sudah ada' };
const fail = (e, msg) => { if (e.status === 401 || e.code === 'PGRST301') { showLogin(); throw 0; } toast(msg || MSG[e.code] || e.message); throw e; };
const TB = {
  members: { o: [['generation'], ['name']], req: ['name'], num: ['generation', 'parent_id', 'joined', 'active'] },
  events: { o: [['date']], req: ['date', 'title'], num: [] },
  announcements: { o: [['date', 0], ['id', 0]], req: ['title'], num: [] },
  albums: { o: [['id']], req: ['title'], num: [] },
  transactions: { o: [['date', 0], ['id', 0]], req: ['date', 'description', 'type', 'amount'], num: ['amount'] },
};
function clean(t, b) {
  const c = TB[t];
  for (const f of c.req) if (b[f] === '' || b[f] == null) { const m = `Kolom "${f}" wajib diisi`; toast(m); throw new Error(m); }
  const o = {}; for (const [k, v] of Object.entries(b)) o[k] = v === '' ? null : c.num.includes(k) ? +v : v;
  if (t === 'announcements') { o.date = o.date || new Date().toISOString().slice(0, 10); o.author = o.author || ME.name; }
  return o;
}
async function profile(u) {
  const { data, error } = await sb.from('profiles').select('name,role').eq('id', u.id).single();
  if (error) return fail(error, 'Profil tidak ditemukan');
  return { username: u.email, name: data.name, role: data.role };
}
async function api(p, m = 'GET', b = {}) {
  const [t, id] = p.split('/'), rpc = async (fn, a) => { const r = await sb.rpc(fn, a); return r.error ? fail(r.error) : r.data; };
  if (t === 'login') { const r = await sb.auth.signInWithPassword({ email: b.username.trim(), password: b.password }); return r.error ? fail(r.error, 'Email atau password salah') : profile(r.data.user); }
  if (t === 'logout') { await sb.auth.signOut(); return {}; }
  if (t === 'me') { const { data: { session } } = await sb.auth.getSession(); if (!session) { showLogin(); throw 0; } return profile(session.user); }
  if (t === 'dashboard' || t === 'report') return rpc(t);
  if (t === 'payments') return m === 'POST' ? rpc('record_payment', { p_member: +b.member_id, p_period: b.period }) : m === 'DELETE' ? rpc('void_payment', { p_id: +id }) : rpc('get_payments', { p_period: null });
  if (t === 'settings') return rpc('set_iuran', { p: +b.iuran });
  if (t === 'draw') return id === 'new-cycle' ? rpc('new_cycle') : m === 'POST' ? rpc('run_draw') : rpc('draw_state');
  const c = TB[t]; if (!c) throw new Error('Endpoint tidak dikenal: ' + p);
  if (m === 'GET') { let q = sb.from(t).select('*'); c.o.forEach(([k, asc = 1]) => q = q.order(k, { ascending: !!asc })); const r = await q; return r.error ? fail(r.error) : r.data; }
  if (m === 'DELETE') { const r = await sb.from(t).delete().eq('id', +id); return r.error ? fail(r.error) : {}; }
  const row = clean(t, b), r = m === 'POST' ? await sb.from(t).insert(row) : await sb.from(t).update(row).eq('id', +id);
  return r.error ? fail(r.error) : {};
}
// Pendaftaran akun baru (akun pertama otomatis admin; berikutnya viewer)
document.getElementById('signupBtn').onclick = async () => {
  const f = Object.fromEntries(new FormData(document.getElementById('loginForm')));
  if (!f.username || (f.password || '').length < 6) return toast('Isi email dan password (min. 6 karakter)');
  const name = prompt('Nama lengkap Anda?') || f.username.split('@')[0];
  const { data, error } = await sb.auth.signUp({ email: f.username.trim(), password: f.password, options: { data: { name } } });
  if (error) return toast(error.message);
  data.session ? location.reload() : toast('Akun dibuat. Cek email untuk konfirmasi, lalu login.');
};
