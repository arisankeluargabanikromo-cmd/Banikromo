// Lapisan data: menerjemahkan panggilan api() ke Supabase (Auth, tabel + RLS, dan fungsi RPC).
const cfg = window.FH_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('GANTI')) addEventListener('load', () => alert('Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY (lihat README).'));

const MSG = { 'Email not confirmed': 'Email belum dikonfirmasi. Buka email konfirmasi dari Supabase, atau matikan "Confirm email" di Authentication → Providers → Email.', 'Invalid login credentials': 'Email atau password salah (atau akun belum terdaftar — klik "Daftar akun baru").', 'Failed to fetch': 'Tidak bisa terhubung ke Supabase. Periksa SUPABASE_URL & SUPABASE_ANON_KEY di config.js / Environment Variables Vercel.', 42501: 'Hanya admin yang boleh mengubah data', 23503: 'Data masih dipakai (mis. anggota pernah menang undian) — nonaktifkan saja', 23505: 'Data sudah ada' };
const fail = (e, msg) => { if (e.status === 401 || e.code === 'PGRST301') { showLogin(); throw 0; } toast(msg || MSG[e.message] || MSG[e.code] || e.message); throw e; };
const TB = {
  members: { o: [['generation'], ['name'], ['id']], req: ['name'], num: ['generation', 'parent_id', 'spouse_id', 'joined', 'active', 'birth_year', 'death_year'] },
  events: { o: [['date'], ['id']], req: ['date', 'title'], num: [] },
  announcements: { o: [['date', 0], ['id', 0]], req: ['title'], num: [] },
  albums: { o: [['id']], req: ['title'], num: [] },
  photos: { o: [['id', 0]], req: ['album_id', 'path'], num: ['album_id'] },
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
  let { data, error } = await sb.from('profiles').select('name,role').eq('id', u.id).maybeSingle();
  if (!data && !error) { const r = await sb.rpc('ensure_profile'); data = r.data; error = r.error; }   // buat profil bila belum ada
  if (error || !data) return fail(error || {}, 'Profil tidak ditemukan. Pastikan supabase/schema.sql sudah dijalankan.');
  return { username: u.email, name: data.name, role: data.role };
}
async function api(p, m = 'GET', b = {}) {
  const [t, id] = p.split('/'), rpc = async (fn, a) => { const r = await sb.rpc(fn, a); return r.error ? fail(r.error) : r.data; };
  if (t === 'login') { const r = await sb.auth.signInWithPassword({ email: b.username.trim(), password: b.password }); return r.error ? fail(r.error, MSG[r.error.message] || r.error.message) : profile(r.data.user); }
  if (t === 'logout') { await sb.auth.signOut(); return {}; }
  if (t === 'me') { const { data: { session } } = await sb.auth.getSession(); if (!session) { showLogin(); throw 0; } return profile(session.user); }
  if (t === 'dashboard' || t === 'report') return rpc(t);
  if (t === 'payments') return m === 'POST' ? rpc('record_payment', { p_member: +b.member_id, p_period: b.period }) : m === 'DELETE' ? rpc('void_payment', { p_id: +id }) : rpc('get_payments', { p_period: null });
  if (t === 'users') return m === 'PUT' ? rpc('set_role', { p_id: id, p_role: b.role }) : rpc('list_users');
  if (t === 'history') { const [a, w] = await Promise.all([sb.from('payments').select('period').eq('member_id', +id).order('period', { ascending: false }).limit(12), sb.from('draws').select('period').eq('winner_id', +id).order('period')]); return { pays: a.data || [], wins: w.data || [] }; }
  if (t === 'members' && m === 'DELETE') { const { data } = await sb.from('members').select('photo_path').eq('id', +id).maybeSingle(); if (data && data.photo_path) await sb.storage.from('photos').remove([data.photo_path + '_s.jpg', data.photo_path + '_l.jpg']); }   // hapus berkas foto
  if (t === 'albums' && m === 'DELETE') { const { data } = await sb.from('photos').select('path').eq('album_id', +id); if (data && data.length) await sb.storage.from('photos').remove(data.map(x => x.path)); }  // bersihkan file foto
  if (t === 'fill') return rpc('fill_marital_status');
  if (t === 'import') return rpc('import_members', { p: b.rows });
  if (t === 'settings') return rpc('set_iuran', { p: +b.iuran });
  if (t === 'draw') return id === 'new-cycle' ? rpc('new_cycle') : m === 'POST' ? rpc('run_draw') : rpc('draw_state');
  const c = TB[t]; if (!c) throw new Error('Endpoint tidak dikenal: ' + p);
  if (m === 'GET') {   // ambil bertahap per 1000 baris (batas bawaan Supabase) agar data besar tidak terpotong
    let all = [], from = 0;
    for (;;) { let q = sb.from(t).select('*'); c.o.forEach(([k, asc = 1]) => q = q.order(k, { ascending: !!asc })); const r = await q.range(from, from + 999); if (r.error) return fail(r.error); all = all.concat(r.data); if (r.data.length < 1000) return all; from += 1000; }
  }
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
  if (error) return toast(MSG[error.message] || error.message);
  data.session ? location.reload() : toast('Akun dibuat. Buka email untuk konfirmasi, lalu login di sini.', true);
};
