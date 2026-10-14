// Lapisan data: menerjemahkan panggilan api() ke Supabase (Auth, tabel + RLS, dan fungsi RPC).
const cfg = window.FH_CONFIG || {};
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('GANTI')) addEventListener('load', () => alert('Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY (lihat README).'));

const MSG = { 'Database error saving new user': 'Pendaftaran sedang penuh atau tidak dapat diproses. Hubungi admin keluarga.', 'Email not confirmed': 'Email belum dikonfirmasi. Buka email konfirmasi dari Supabase, atau matikan "Confirm email" di Authentication → Providers → Email.', 'Invalid login credentials': 'Email atau password salah (atau akun belum terdaftar — klik "Daftar akun baru").', 'Failed to fetch': 'Tidak bisa terhubung ke Supabase. Periksa SUPABASE_URL & SUPABASE_ANON_KEY di config.js / Environment Variables Vercel.', 42501: 'Hanya admin yang boleh mengubah data', 23503: 'Data masih dipakai (mis. anggota pernah menang undian) — nonaktifkan saja', 23505: 'Data sudah ada' };
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
  // 'approved' ada sejak patch-011. Bila SQL belum di-patch (kolom tidak ada), anggap disetujui agar tidak terkunci keluar.
  let { data, error } = await sb.from('profiles').select('name,role,approved').eq('id', u.id).maybeSingle();
  if (error && (error.code === '42703' || /approved/.test(error.message || ''))) ({ data, error } = await sb.from('profiles').select('name,role').eq('id', u.id).maybeSingle());
  if (!data && !error) { const r = await sb.rpc('ensure_profile'); data = r.data; error = r.error; }   // buat profil bila belum ada
  if (error || !data) return fail(error || {}, 'Profil tidak ditemukan. Pastikan supabase/schema.sql sudah dijalankan.');
  return { username: u.email, name: data.name, role: data.role, approved: data.approved !== false };
}
async function api(p, m = 'GET', b = {}) {
  const [t, id] = p.split('/'), rpc = async (fn, a) => { const r = await sb.rpc(fn, a); return r.error ? fail(r.error) : r.data; };
  if (t === 'login') { const r = await sb.auth.signInWithPassword({ email: b.username.trim(), password: b.password }); return r.error ? fail(r.error, MSG[r.error.message] || r.error.message) : profile(r.data.user); }
  if (t === 'logout') { await sb.auth.signOut(); return {}; }
  if (t === 'me') { const { data: { session } } = await sb.auth.getSession(); if (!session) { showLogin(); throw 0; } return profile(session.user); }
  if (t === 'dashboard' || t === 'report') return rpc(t);
  if (t === 'payments') {   // iuran: tiap jenis (arisan/wajib) dicatat per anggota per periode
    if (id === 'bulk') return rpc('record_payments', { p_member: +b.member_id, p_type: +b.type, p_periods: b.periods, p_method: b.method || 'Tunai' });
    return m === 'POST' ? rpc('record_payment', { p_member: +b.member_id, p_period: b.period, p_type: +(b.type || 1), p_method: b.method || 'Tunai' })
      : m === 'DELETE' ? rpc('void_payment', { p_id: +id, p_reason: b.reason || null }) : rpc('get_payments', { p_period: b.period || null });
  }
  if (t === 'fin') {        // keuangan & laporan
    if (id === 'config') return rpc('fee_config');
    if (id === 'dashboard') return rpc('finance_dashboard');
    if (id === 'summary') return rpc('finance_summary', { p_from: b.from, p_to: b.to });
    if (id === 'ledger') return rpc('finance_ledger', { p_from: b.from, p_to: b.to, p_fund: b.fund || null, p_category: b.category || null, p_limit: b.limit || 1000 });
    if (id === 'recap') return rpc('iuran_recap', { p_from: b.from, p_to: b.to });
    if (id === 'arrears') return rpc('iuran_arrears', { p_type: b.type ? +b.type : null, p_include_current: !!b.cur });
    if (id === 'matrix') return rpc('compliance_matrix', { p_year: +b.year, p_type: +b.type });
    if (id === 'feetype') return rpc('set_fee_type', { p_id: +b.id, p_name: b.name, p_amount: +b.amount, p_required: !!b.required, p_active: !!b.active, p_start: b.start });
    if (id === 'meta') return rpc('set_report_meta', { p_org: b.org, p_treasurer: b.treasurer, p_chair: b.chair });
    if (id === 'disburse') return rpc('disburse_arisan', { p_period: b.period || null });
    if (id === 'undisburse') return rpc('cancel_disbursement', { p_id: +b.id });
  }
  if (t === 'users') {
    if (id === 'link') return rpc('link_member', { p_user: b.id, p_member: b.member_id ?? null });   // hubungkan akun ↔ anggota (admin)
    if (id === 'approve') return rpc('approve_user', { p_id: b.id, p_role: b.role || 'viewer' });   // setujui pendaftar baru
    if (id === 'reject_all') return rpc('reject_all_pending');                                         // tolak semua pendaftar menunggu
    if (id === 'reject') return rpc('reject_user', { p_id: b.id });                                  // tolak pendaftar yang belum disetujui
    if (id === 'audit') return rpc('audit_recent', { p_limit: +b.limit || 100 });                    // jejak audit (admin)
    return m === 'PUT' ? rpc('set_role', { p_id: id, p_role: b.role }) : rpc('list_users');
  }
  if (t === 'history') { const [a, w] = await Promise.all([sb.from('payments').select('period,fee_type_id').eq('member_id', +id).order('period', { ascending: false }).limit(36), sb.from('draws').select('period').eq('winner_id', +id).eq('status', 'sah').order('period')]); return { pays: a.data || [], wins: w.data || [] }; }
  if (t === 'members' && m === 'DELETE') {      // hapus baris dulu; berkas foto baru dibersihkan bila berhasil (penghapusan bisa ditolak pagar database)
    const { data } = await sb.from('members').select('photo_path').eq('id', +id).maybeSingle(), r = await sb.from('members').delete().eq('id', +id);
    if (r.error) return fail(r.error);
    if (data && data.photo_path) await sb.storage.from('photos').remove([data.photo_path + '_s.jpg', data.photo_path + '_l.jpg']);
    return {};
  }
  if (t === 'albums' && m === 'DELETE') {      // hapus baris dulu (foto ikut terhapus lewat cascade); berkas dibersihkan hanya bila berhasil
    const { data } = await sb.from('photos').select('path').eq('album_id', +id), r = await sb.from('albums').delete().eq('id', +id);
    if (r.error) return fail(r.error);
    if (data && data.length) await sb.storage.from('photos').remove(data.map(x => x.path));
    return {};
  }
  if (t === 'my') return rpc('my_status');                                                          // portal anggota: iuran milik sendiri
  if (t === 'fill') return rpc('fill_marital_status');
  if (t === 'import') return rpc('import_members', { p: b.rows });
  if (t === 'lineage') return rpc('set_lineage_roots', { p_ids: b.ids || [] });          // leluhur utama garis keturunan asli
  if (t === 'memactive') return rpc('set_members_active', { p_ids: b.ids || [], p_active: +b.active });
  if (t === 'settings') return rpc('set_iuran', { p: +b.iuran });
  if (t === 'draw') {   // pengocokan: kocok -> (sahkan | tidak hadir -> kocok ulang)
    if (id === 'new-cycle') return rpc('new_cycle');
    if (id === 'confirm') return rpc('confirm_draw', { p_id: +b.id });
    if (id === 'absent') return rpc('absent_draw', { p_id: +b.id });
    if (id === 'reopen') return rpc('reopen_draw');
    if (id === 'recall') return rpc('recall_absent');
    return m === 'POST' ? rpc('run_draw') : rpc('draw_state');
  }
  const c = TB[t]; if (!c) throw new Error('Endpoint tidak dikenal: ' + p);
  if (m === 'GET') {   // ambil bertahap per 1000 baris (batas bawaan Supabase) agar data besar tidak terpotong
    let all = [], from = 0;
    for (;;) { let q = sb.from(t).select('*'); c.o.forEach(([k, asc = 1]) => q = q.order(k, { ascending: !!asc })); const r = await q.range(from, from + 999); if (r.error) return fail(r.error); all = all.concat(r.data); if (r.data.length < 1000) return all; from += 1000; }
  }
  if (m === 'DELETE') { const r = await sb.from(t).delete().eq('id', +id); return r.error ? fail(r.error) : {}; }
  const row = clean(t, b), r = m === 'POST' ? await sb.from(t).insert(row) : await sb.from(t).update(row).eq('id', +id);
  return r.error ? fail(r.error) : {};
}
// Pendaftaran akun baru. Akun PERTAMA otomatis admin; berikutnya viewer berstatus MENUNGGU persetujuan admin.
let SIGNUP = false;
function setSignupMode(on) {
  SIGNUP = on; const f = document.getElementById('loginForm'), $e = id => document.getElementById(id);
  $e('nameRow').style.display = on ? '' : 'none'; $e('loginBtn').style.display = on ? 'none' : ''; $e('backLogin').style.display = on ? '' : 'none';
  $e('signupBtn').textContent = on ? 'Kirim pendaftaran' : 'Daftar akun baru'; $e('loginSub').textContent = on ? 'Buat akun — admin keluarga akan menyetujuinya' : 'Masuk untuk melanjutkan';
  f.elements.password.autocomplete = on ? 'new-password' : 'current-password'; $e('loginMsg').className = 'loginmsg';
  if (on) f.elements.name.focus();
}
async function doSignup() {
  const f = Object.fromEntries(new FormData(document.getElementById('loginForm')));
  const name = (f.name || '').trim();
  if (!f.username || !name) return toast('Isi nama lengkap dan email');
  if ((f.password || '').length < 8) return toast('Password minimal 8 karakter');
  const b = document.getElementById('signupBtn'); b.disabled = true;
  try {
    const { data, error } = await sb.auth.signUp({ email: f.username.trim(), password: f.password, options: { data: { name } } });
    if (error) return toast(MSG[error.message] || error.message);
    data.session ? location.reload() : toast('Pendaftaran terkirim. Buka email untuk konfirmasi, lalu masuk. Setelah itu admin keluarga perlu menyetujui akun Anda.', true);
  } finally { b.disabled = false; }
}
document.getElementById('signupBtn').onclick = () => SIGNUP ? doSignup() : setSignupMode(true);
document.getElementById('backLogin').onclick = () => setSignupMode(false);
