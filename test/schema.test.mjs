import { freshDb, as, signup, tryQ, check, summary } from './harness.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = path.join(ROOT, 'supabase/schema.sql'), PATCH = path.join(ROOT, 'supabase/patch-011-keamanan.sql');
const OLD = path.join(ROOT, 'supabase/base/schema-v3.9.1.sql');   // skema dasar v3.9.1, sebelum patch-011 (untuk uji upgrade)

async function seed(db) {
  const admin = await signup(db, 'admin@keluarga.id', 'Admin');
  await db.exec(`insert into members(name,relation) values('Budi','Anak'),('Siti','Anak'),('Andi','Anak')`);
  return admin;
}
const mid = async (db, n) => (await db.query(`select id from members where name=$1`, [n])).rows[0].id;
const pay = (db, m, per = '2026-10') => tryQ(db, `select record_payment($1::bigint,$2::text,1::smallint,'Tunai'::text)`, [m, per]);

console.log('═══ A. Instalasi baru dari schema.sql (sudah memuat patch-011) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await seed(db);
  const orang = await signup(db, 'asing@mail.com', 'Orang Asing');
  const prof = (await db.query(`select name,role,approved from profiles order by name`)).rows;
  check('pendaftar pertama = admin & disetujui', prof.find(p => p.name === 'Admin').approved === true && prof.find(p => p.name === 'Admin').role === 'admin');
  check('pendaftar kedua = viewer & MENUNGGU', prof.find(p => p.name === 'Orang Asing').approved === false && prof.find(p => p.name === 'Orang Asing').role === 'viewer');

  console.log('\n  — akun menunggu persetujuan —');
  await as(db, orang, async () => {
    const m = await tryQ(db, `select name from members`);
    check('TIDAK melihat anggota (0 baris)', m.ok && m.rows.length === 0, JSON.stringify(m));
    for (const t of ['transactions', 'payments', 'events', 'announcements', 'draws', 'activity', 'settings', 'fee_types', 'albums', 'photos']) {
      const r = await tryQ(db, `select 1 from ${t} limit 1`); if (!(r.ok && r.rows.length === 0)) check('tabel ' + t + ' tertutup', false, JSON.stringify(r));
    }
    check('semua tabel data tertutup untuk akun menunggu', true);
    for (const fn of ['dashboard()', 'report()', 'draw_state()', 'fee_config()', 'get_payments()', 'finance_dashboard()', `finance_summary('2026-01-01'::date,'2026-12-31'::date)`, `iuran_arrears()`, `finance_ledger('2026-01-01'::date,'2026-12-31'::date)`, `iuran_recap('2026-01','2026-12')`, `compliance_matrix(2026,1::smallint)`]) {
      const r = await tryQ(db, `select ${fn}`); if (r.ok) check(fn + ' ditolak', false, 'masih bisa dipanggil!');
    }
    check('semua 11 RPC baca ditolak untuk akun menunggu', true);
    const p = await tryQ(db, `select name from profiles`);
    check('hanya melihat profil sendiri', p.ok && p.rows.length === 1 && p.rows[0].name === 'Orang Asing', JSON.stringify(p));
    const e = await tryQ(db, `select ensure_profile() r`);
    check('ensure_profile melaporkan approved=false', e.ok && e.rows[0].r.approved === false, JSON.stringify(e));
    check('tidak bisa menulis anggota', !(await tryQ(db, `insert into members(name) values('X')`)).ok);
    check('tidak bisa mengangkat diri jadi admin', !(await tryQ(db, `update profiles set role='admin',approved=true where id='${orang}'`)).rows?.length);
    check('is_admin() = false', (await tryQ(db, `select is_admin() a`)).rows[0].a === false);
    check('tidak bisa approve_user', !(await tryQ(db, `select approve_user('${orang}','admin')`)).ok);
    check('tidak bisa membaca audit_log', ((await tryQ(db, `select * from audit_log`)).rows || []).length === 0);
    check('tidak bisa list_users', !(await tryQ(db, `select list_users()`)).ok);
  });
  const stillViewer = (await db.query(`select role,approved from profiles where id=$1`, [orang])).rows[0];
  check('(DB) upaya naik pangkat tidak mengubah apa pun', stillViewer.role === 'viewer' && stillViewer.approved === false, JSON.stringify(stillViewer));

  console.log('\n  — anon (belum login) & fungsi internal —');
  await as(db, null, async () => {
    check('anon: 0 baris', ((await tryQ(db, `select * from members`)).rows || []).length === 0);
    check('anon: RPC ditolak', !(await tryQ(db, `select dashboard()`)).ok);
    check('anon: approve_user ditolak', !(await tryQ(db, `select approve_user('${orang}')`)).ok);
  });
  await as(db, admin, async () => {
    check('dashboard__impl TIDAK bisa dipanggil langsung (admin sekalipun)', !(await tryQ(db, `select dashboard__impl()`)).ok);
    check('cfg() internal tidak bisa dipanggil dari browser', !(await tryQ(db, `select cfg('iuran')`)).ok);
    check('eligible_members() internal tidak bisa dipanggil', !(await tryQ(db, `select * from eligible_members('2026-10')`)).ok);
    check('admin: dashboard() bekerja lewat pembungkus', (await tryQ(db, `select dashboard() d`)).ok);
    check('admin: finance_ledger() dengan argumen default bekerja', (await tryQ(db, `select finance_ledger('2026-01-01'::date,'2026-12-31'::date) r`)).ok);
    check('admin: get_payments() tanpa argumen & dengan argumen bekerja', (await tryQ(db, `select get_payments() a`)).ok && (await tryQ(db, `select get_payments('2026-10') a`)).ok);
    const lu = await tryQ(db, `select list_users() u`);
    check('admin: list_users memuat pendaftar menunggu', lu.ok && lu.rows[0].u.some(u => u.email === 'asing@mail.com' && u.approved === false), JSON.stringify(lu));
  });

  console.log('\n  — alur persetujuan —');
  await as(db, admin, async () => {
    check('admin menyetujui sebagai viewer', (await tryQ(db, `select approve_user('${orang}','viewer')`)).ok);
    check('approve_user peran ngawur ditolak', !(await tryQ(db, `select approve_user('${orang}','dewa')`)).ok);
  });
  await as(db, orang, async () => {
    const m = await tryQ(db, `select name from members`);
    check('setelah disetujui: melihat 3 anggota', m.ok && m.rows.length === 3, JSON.stringify(m));
    check('setelah disetujui: dashboard() bekerja', (await tryQ(db, `select dashboard()`)).ok);
    check('viewer tetap tidak bisa menulis', !(await tryQ(db, `insert into members(name) values('X')`)).ok);
    check('viewer tidak bisa list_users / approve_user', !(await tryQ(db, `select list_users()`)).ok && !(await tryQ(db, `select approve_user('${orang}','admin')`)).ok);
  });
  const baru = await signup(db, 'penipu@mail.com', 'Penipu');
  await as(db, admin, async () => {
    check('reject_user menghapus pendaftar menunggu', (await tryQ(db, `select reject_user('${baru}')`)).ok);
    check('reject_user pada akun yang SUDAH disetujui ditolak', !(await tryQ(db, `select reject_user('${orang}')`)).ok);
  });
  check('(DB) akun yang ditolak benar-benar hilang', (await db.query(`select count(*)::int c from auth.users where id=$1`, [baru])).rows[0].c === 0);
  await as(db, admin, async () => {
    check('admin tidak bisa menurunkan dirinya jika satu-satunya admin', !(await tryQ(db, `select set_role('${admin}','viewer')`)).ok);
  });

  console.log('\n  — peran pengelola tetap berfungsi (patch 010 tidak rusak) —');
  const pg = await signup(db, 'pengelola@mail.com', 'Pengelola');
  await as(db, admin, async () => { await tryQ(db, `select set_role('${pg}','pengelola')`); });
  check('set_role otomatis menyetujui akun', (await db.query(`select approved from profiles where id=$1`, [pg])).rows[0].approved === true);
  await as(db, pg, async () => {
    const i = await tryQ(db, `insert into members(name) values('Anggota Baru') returning active`);
    check('pengelola bisa menambah anggota (otomatis nonaktif arisan)', i.ok && i.rows[0].active === 0, JSON.stringify(i));
    check('pengelola tidak bisa mencatat iuran', !(await pay(db, await mid(db, 'Budi'))).ok);
  });

  console.log('\n  — kunci transaksi iuran —');
  await as(db, admin, async () => {
    const b = await mid(db, 'Budi'), s = await mid(db, 'Siti'), a = await mid(db, 'Andi');
    check('admin mencatat 3 iuran', (await pay(db, b)).ok && (await pay(db, s)).ok && (await pay(db, a)).ok);
    const u = await tryQ(db, `update transactions set amount=1 where payment_id is not null`);
    check('ubah nominal transaksi iuran DITOLAK', !u.ok && /tidak boleh diubah/.test(u.err), JSON.stringify(u));
    check('hapus transaksi iuran DITOLAK', !(await tryQ(db, `delete from transactions where payment_id is not null`)).ok);
    const ins = await tryQ(db, `insert into transactions(date,description,type,amount) values('2026-10-05','Beli konsumsi','keluar',120000) returning id`);
    check('kas manual tetap bisa ditambah', ins.ok);
    check('kas manual tetap bisa diubah', (await tryQ(db, `update transactions set amount=130000 where id=${ins.rows[0].id}`)).ok);
    const py = (await db.query(`select id from payments where member_id=${a} limit 1`)).rows[0].id;
    check('Batalkan pembayaran (void_payment) tetap bekerja (cascade tidak terblokir)', (await tryQ(db, `select void_payment(${py}::bigint,'salah catat'::text)`)).ok, '');
    check('transaksi terkait ikut hilang', (await db.query(`select count(*)::int c from transactions where payment_id=${py}`)).rows[0].c === 0);
  });

  console.log('\n  — jejak audit —');
  await as(db, admin, async () => {
    const r = await tryQ(db, `select audit_recent(100) a`); const a = r.rows[0].a;
    check('audit_recent terbaca admin', r.ok && a.length > 0);
    const upd = a.find(x => x.tbl === 'transactions' && x.op === 'UPDATE');
    check('perubahan kas tercatat dgn nilai lama & baru (120000 → 130000)', upd && +upd.old_row.amount === 120000 && +upd.new_row.amount === 130000, JSON.stringify(upd));
    check('pembatalan pembayaran tercatat', a.some(x => x.tbl === 'payments' && x.op === 'DELETE'));
    check('perubahan peran tercatat', a.some(x => x.tbl === 'profiles' && x.op === 'UPDATE'));
    check('pelaku tercatat (nama admin)', a.some(x => x.actor_name === 'Admin'));
    check('admin tidak bisa mengubah/menghapus audit_log', !(await tryQ(db, `delete from audit_log`)).ok && !(await tryQ(db, `update audit_log set tbl='x'`)).ok && !(await tryQ(db, `insert into audit_log(tbl,op) values('x','y')`)).ok);
  });
  await as(db, orang, async () => {
    check('viewer tidak bisa membaca audit', !(await tryQ(db, `select audit_recent()`)).ok && ((await tryQ(db, `select * from audit_log`)).rows || []).length === 0);
  });

  console.log('\n  — undian tetap berjalan (fungsi internal dipanggil dari dalam) —');
  await as(db, admin, async () => {
    const ds = await tryQ(db, `select draw_state() d`);
    check('draw_state lewat pembungkus', ds.ok && ds.rows[0].d.eligible.length === 2, JSON.stringify(ds.rows && ds.rows[0].d.eligible));
    await tryQ(db, `select record_payment(${await mid(db, 'Andi')}::bigint,'${ds.rows[0].d.period}'::text,1::smallint,'Tunai'::text)`);
    const per = ds.rows[0].d.period;
    for (const n of ['Budi', 'Siti']) await tryQ(db, `select record_payment(${await mid(db, n)}::bigint,'${per}'::text,1::smallint,'Tunai'::text)`);
    const rd = await tryQ(db, `select run_draw() r`); check('run_draw bekerja', rd.ok, JSON.stringify(rd));
    if (rd.ok) {
      const cf = await tryQ(db, `select confirm_draw(${rd.rows[0].r.id}::bigint) r`); check('confirm_draw bekerja', cf.ok, JSON.stringify(cf));
      check('disburse_arisan bekerja', (await tryQ(db, `select disburse_arisan() r`)).ok);
    }
  });

  console.log('\n  — Reset & Pemulihan backup tidak terblokir oleh kunci —');
  await as(db, admin, async () => {
    const bk = (await db.query(`select jsonb_build_object('app','FamilyHub','format',1,'created_at',now()::text,'data',jsonb_build_object(
      'settings',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from settings x),'fee_types',(select jsonb_agg(to_jsonb(x)) from fee_types x),
      'members',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from members x),'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from payments x),
      'transactions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from transactions x),'events','[]'::jsonb,'announcements','[]'::jsonb,'albums','[]'::jsonb,'photos','[]'::jsonb,
      'draws',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from draws x),'activity',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from activity x))) b`)).rows[0].b;
    const nTx = (await db.query(`select count(*)::int c from transactions`)).rows[0].c;
    const rs = await tryQ(db, `select restore_backup($1::jsonb) r`, [JSON.stringify(bk)]);
    check('restore_backup berhasil (tidak diblokir kunci transaksi)', rs.ok, JSON.stringify(rs));
    check('data kembali utuh setelah restore', (await db.query(`select count(*)::int c from transactions`)).rows[0].c === nTx);
    const before = (await db.query(`select count(*)::int c from audit_log`)).rows[0].c;
    const rr = await tryQ(db, `select reset_data('semua',true) r`);
    check('reset_data("semua") berhasil (tidak diblokir kunci)', rr.ok, JSON.stringify(rr));
    check('transaksi kosong setelah reset', (await db.query(`select count(*)::int c from transactions`)).rows[0].c === 0);
    const after = (await db.query(`select count(*)::int c from audit_log`)).rows[0].c;
    check('audit_log TIDAK ikut terhapus oleh reset/restore', after >= before && before > 0, `${before} → ${after}`);
  });
  const adm2 = await tryQ(db, `select count(*)::int c from profiles where approved`);
  check('akun pengguna tidak tersentuh oleh reset', adm2.rows[0].c >= 3);
}

console.log('\n═══ B. Upgrade dari database LAMA (schema.sql asli + pengguna eksisting) ═══');
{
  const db = await freshDb([OLD]);
  const admin = await seed(db);
  const lama = await signup(db, 'saudara@mail.com', 'Saudara Lama');   // sudah terdaftar sebelum patch
  const pb = await pay(db, 1).catch(() => 0);
  await db.exec(await (await import('node:fs')).promises.readFile(PATCH, 'utf8'));
  const rows = (await db.query(`select name,approved from profiles order by name`)).rows;
  check('SEMUA akun lama otomatis disetujui (tidak ada yang terkunci keluar)', rows.every(r => r.approved === true), JSON.stringify(rows));
  const baru = await signup(db, 'baru@mail.com', 'Baru');
  check('pendaftar sesudah patch = menunggu', (await db.query(`select approved from profiles where id=$1`, [baru])).rows[0].approved === false);
  await as(db, lama, async () => { check('akun lama tetap bisa membaca', (await tryQ(db, `select name from members`)).rows.length === 3); check('akun lama bisa dashboard()', (await tryQ(db, `select dashboard()`)).ok); });
  await as(db, baru, async () => { check('pendaftar baru tidak bisa membaca', (await tryQ(db, `select name from members`)).rows.length === 0); });

  console.log('\n  — idempotent: jalankan patch KEDUA kali —');
  const sql = await (await import('node:fs')).promises.readFile(PATCH, 'utf8');
  let ok = true, msg = ''; try { await db.exec(sql); } catch (e) { ok = false; msg = e.message; }
  check('patch dapat dijalankan ulang tanpa galat', ok, msg);
  const w = (await db.query(`select count(*)::int c from pg_proc where pronamespace='public'::regnamespace and proname like '%\\_\\_impl\\_\\_impl'`)).rows[0].c;
  check('tidak ada pembungkus ganda (…__impl__impl)', w === 0);
  await as(db, admin, async () => { check('dashboard() tetap bekerja setelah patch kedua', (await tryQ(db, `select dashboard()`)).ok); });
  const dups = (await db.query(`select proname,count(*)::int c from pg_proc where pronamespace='public'::regnamespace group by 1 having count(*)>1 and proname in('dashboard','report','get_payments','finance_ledger')`)).rows;
  check('tidak ada fungsi ganda (overload) tersisa', dups.length === 0, JSON.stringify(dups));
}

console.log('\n═══ C. Kontrol: baseline lama masih terbukti bermasalah, tanpa patch ═══');
{
  const db = await freshDb([OLD]); await seed(db); const o = await signup(db, 'x@mail.com', 'X');
  await as(db, o, async () => check('(kontrol) tanpa patch pendaftar publik membaca anggota', (await tryQ(db, `select 1 from members`)).rows.length === 3));
}

console.log('\n═══ D. Restore tahan versi (patch-012) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await seed(db);
  const strip = (arr, drop) => arr.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));
  const m = (await db.query(`select * from members`)).rows, ft = (await db.query(`select * from fee_types`)).rows;
  const old = { app: 'FamilyHub', format: 1, data: { settings: [{ k: 'iuran', v: '350000' }], fee_types: ft,
    members: strip(m, ['gender', 'spouse_id', 'spouse_status', 'birth_year', 'death_year', 'lineage_root', 'photo_path', 'marital_status', 'address']),
    payments: [], transactions: [], events: [], announcements: [], albums: [], photos: [], draws: [], activity: [] } };
  await as(db, admin, async () => {
    const r = await tryQ(db, `select restore_backup($1::jsonb) r`, [JSON.stringify(old)]);
    check('backup bergaya LAMA (tanpa kolom baru) berhasil dipulihkan', r.ok, r.err);
  });
  const row = (await db.query(`select name,spouse_status,lineage_root from members order by id limit 1`)).rows[0];
  check('kolom yang tak ada di backup memakai DEFAULT (spouse_status=menikah, lineage_root=false)', row && row.spouse_status === 'menikah' && row.lineage_root === false, JSON.stringify(row));
  check('jumlah anggota kembali 3', (await db.query(`select count(*)::int c from members`)).rows[0].c === 3);
  await as(db, admin, async () => {
    check('pembantu internal _restore_rows tidak bisa dipanggil dari browser', !(await tryQ(db, `select _restore_rows('members','[]'::jsonb)`)).ok);
    const bad = await tryQ(db, `select restore_backup($1::jsonb)`, [JSON.stringify({ ...old, data: { ...old.data, members: [{ id: 1, nama_ngawur: 'x' }] } })]);
    check('backup dengan kolom tak dikenal ditolak rapi (tanpa merusak data)', !bad.ok);
  });
  check('data tetap utuh setelah restore gagal (transaksi dibatalkan)', (await db.query(`select count(*)::int c from members`)).rows[0].c === 3);
  const pa = await signup(db, 'pa@x.id', 'PA');
  await as(db, pa, async () => { check('pendaftar menunggu tidak bisa restore', !(await tryQ(db, `select restore_backup($1::jsonb)`, [JSON.stringify(old)])).ok); });
}

console.log('\n═══ E. Upgrade berantai v3.9.1 → patch-011 → patch-012 ═══');
{
  const fsx = await import('node:fs');
  const db = await freshDb([OLD]); await seed(db);
  await db.exec(fsx.readFileSync(PATCH, 'utf8')); await db.exec(fsx.readFileSync(path.join(ROOT, 'supabase/patch-012-restore-tahan-versi.sql'), 'utf8'));
  await db.exec(fsx.readFileSync(path.join(ROOT, 'supabase/patch-012-restore-tahan-versi.sql'), 'utf8'));
  check('patch 011 + 012 (012 dijalankan 2x) berurutan tanpa galat', true);
  const admin = (await db.query(`select id from profiles where role='admin'`)).rows[0].id;
  await as(db, admin, async () => {
    const b = await mid(db, 'Budi'); check('void_payment bekerja setelah patch-012', (await pay(db, b)).ok && (await tryQ(db, `select void_payment((select id from payments limit 1)::bigint,'uji'::text)`)).ok);
  });
}

console.log('\n═══ F. Portal anggota: Iuran Saya (patch-013) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await seed(db);
  await db.exec(`update fee_types set start_period='2026-01'`);
  const ub = await signup(db, 'budi@x.id', 'Budi'), us = await signup(db, 'siti@x.id', 'Siti'), up = await signup(db, 'pending@x.id', 'Pending');
  await as(db, admin, async () => { await tryQ(db, `select approve_user('${ub}','viewer')`); await tryQ(db, `select approve_user('${us}','viewer')`); });
  const b = await mid(db, 'Budi'), si = await mid(db, 'Siti');

  await as(db, ub, async () => {
    const r = await tryQ(db, `select my_status() s`);
    check('akun belum dihubungkan → linked=false (bukan galat)', r.ok && r.rows[0].s.linked === false, JSON.stringify(r));
    check('viewer tidak bisa menghubungkan akun', !(await tryQ(db, `select link_member('${ub}',${b}::bigint)`)).ok);
    await tryQ(db, `update profiles set member_id=${si} where id='${ub}'`);
  });
  check('viewer tidak bisa mengubah member_id dirinya lewat API (RLS)', (await db.query(`select member_id from profiles where id=$1`, [ub])).rows[0].member_id === null);
  await as(db, up, async () => { check('akun menunggu tidak bisa my_status', !(await tryQ(db, `select my_status()`)).ok); });

  await as(db, admin, async () => {
    check('admin menghubungkan akun Budi ke anggota Budi', (await tryQ(db, `select link_member('${ub}',${b}::bigint)`)).ok);
    check('anggota yang sama tidak bisa dihubungkan ke akun kedua', !(await tryQ(db, `select link_member('${us}',${b}::bigint)`)).ok);
    check('anggota tak ada ditolak', !(await tryQ(db, `select link_member('${us}',99999::bigint)`)).ok);
    check('pengguna tak ada ditolak', !(await tryQ(db, `select link_member('00000000-0000-0000-0000-000000000000'::uuid,${b}::bigint)`)).ok);
    check('akun Siti dihubungkan ke Siti', (await tryQ(db, `select link_member('${us}',${si}::bigint)`)).ok);
    const lu = (await tryQ(db, `select list_users() u`)).rows[0].u;
    check('list_users memuat member_id & member_name', lu.find(x => x.email === 'budi@x.id').member_name === 'Budi');
    const per = (await tryQ(db, `select cur_period() p`)).rows[0].p;
    check('admin mencatat iuran Budi (bulan ini) & Siti (bulan ini)', (await tryQ(db, `select record_payment(${b}::bigint,'${per}'::text,1::smallint,'Tunai'::text)`)).ok && (await tryQ(db, `select record_payment(${si}::bigint,'${per}'::text,1::smallint,'Transfer'::text)`)).ok);
  });

  let mine;
  await as(db, ub, async () => {
    const r = await tryQ(db, `select my_status() s`); mine = r.rows[0].s;
    check('linked=true & nama anggota benar', mine.linked === true && mine.member.name === 'Budi', JSON.stringify(mine.member));
    const t1 = mine.types.find(t => t.id === 1);
    check('iuran bulan ini tampil LUNAS', t1.paid_now === true);
    check('riwayat hanya milik Budi (1 baris, tidak bocor data Siti)', mine.recent.length === 1 && mine.recent.every(x => x.receipt_no), JSON.stringify(mine.recent));
    check('tunggakan: ada & konsisten (n × tarif = total)', t1.arrears > 0 && t1.arrears_total === t1.arrears * t1.amount && t1.arrears_periods.length === t1.arrears, JSON.stringify(t1));
  });
  await as(db, admin, async () => {
    const all = (await tryQ(db, `select iuran_arrears() a`)).rows[0].a.filter(x => x.member_id === b);
    const mineT = Object.fromEntries(mine.types.map(t => [t.id, t.arrears_total]));
    const same = all.every(x => mineT[x.type_id] === x.total) && mine.types.filter(t => t.arrears > 0).length === all.length;
    check('SILANG-CEK: tunggakan di my_status = hasil iuran_arrears() milik admin', same, JSON.stringify({ all, mineT }));
    check('can_draw = semua iuran wajib-undian bulan ini lunas', mine.can_draw === !mine.types.some(t => t.required_for_draw && !t.paid_now), JSON.stringify(mine.types.map(t => [t.id, t.required_for_draw, t.paid_now])));
  });
  const audit = (await db.query(`select count(*)::int c from audit_log where tbl='profiles' and (new_row->>'member_id') is not null`)).rows[0].c;
  check('penghubungan akun tercatat di jejak audit', audit >= 2, String(audit));

  await as(db, admin, async () => { check('admin melepas hubungan (null)', (await tryQ(db, `select link_member('${ub}',null::bigint)`)).ok); });
  await as(db, ub, async () => { check('setelah dilepas → linked=false lagi', (await tryQ(db, `select my_status() s`)).rows[0].s.linked === false); });
  await as(db, admin, async () => { await tryQ(db, `select link_member('${ub}',${b}::bigint)`); await tryQ(db, `delete from members where id=${b}`); });
  await as(db, ub, async () => { check('anggota dihapus → akun tetap ada, linked=false (tanpa galat)', (await tryQ(db, `select my_status() s`)).rows[0].s.linked === false); });

  // upgrade berantai penuh
  const fsx = await import('node:fs'); const db2 = await freshDb([OLD]); await seed(db2);
  for (const f of ['patch-011-keamanan.sql', 'patch-012-restore-tahan-versi.sql', 'patch-013-portal-anggota.sql', 'patch-013-portal-anggota.sql']) await db2.exec(fsx.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
  check('upgrade berantai v3.9.1 → 011 → 012 → 013 (013 dua kali) tanpa galat', true);
}

console.log('\n═══ G. Anti-spam pendaftaran (patch-014) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await seed(db);
  const ok = await signup(db, 'sah@x.id', 'Sah'); await as(db, admin, () => tryQ(db, `select approve_user('${ok}','viewer')`));
  let last = null; for (let i = 0; i < 50; i++) last = await tryQ(db, `insert into auth.users(email,raw_user_meta_data) values('spam${i}@x.id','{"name":"Spam"}'::jsonb)`);
  check('50 pendaftar menunggu masih diterima', (await db.query(`select count(*)::int c from profiles where not approved`)).rows[0].c === 50 && last.ok);
  const over = await tryQ(db, `insert into auth.users(email,raw_user_meta_data) values('spam51@x.id','{"name":"Spam"}'::jsonb)`);
  check('pendaftar ke-51 DITOLAK dengan pesan jelas', !over.ok && /sedang penuh/.test(over.err), over.err);
  check('akun ke-51 tidak tertinggal setengah jadi (auth.users & profiles konsisten)', (await db.query(`select (select count(*) from auth.users)::int u,(select count(*) from profiles)::int p`)).rows.every(r => r.u === r.p));
  await as(db, ok, async () => { check('viewer tidak bisa reject_all_pending', !(await tryQ(db, `select reject_all_pending()`)).ok); });
  await as(db, null, async () => { check('anon tidak bisa reject_all_pending', !(await tryQ(db, `select reject_all_pending()`)).ok); });
  await as(db, admin, async () => {
    const r = await tryQ(db, `select reject_all_pending() n`);
    check('admin: reject_all_pending menghapus 50 pendaftar', r.ok && +r.rows[0].n === 50, JSON.stringify(r));
    check('dicatat di log aktivitas', (await db.query(`select count(*)::int c from activity where text like 'Semua pendaftar menunggu ditolak%'`)).rows[0].c === 1);
    check('tanpa pendaftar menunggu → 0 & tidak galat', (await tryQ(db, `select reject_all_pending() n`)).rows[0].n === 0);
  });
  const left = (await db.query(`select name from profiles order by name`)).rows.map(r => r.name);
  check('akun yang sudah disetujui (admin & Sah) TIDAK ikut terhapus', left.length === 2 && left.includes('Admin') && left.includes('Sah'), JSON.stringify(left));
  check('setelah dibersihkan pendaftaran baru diterima lagi', (await tryQ(db, `insert into auth.users(email) values('baru@x.id')`)).ok);
  const long = await signup(db, 'panjang@x.id', 'N'.repeat(200));
  check('nama pendaftar dipangkas maksimal 80 karakter', (await db.query(`select length(name)::int l from profiles where id=$1`, [long])).rows[0].l === 80);
  const fsx = await import('node:fs'); const db2 = await freshDb([OLD]); await seed(db2);
  for (const f of ['patch-011-keamanan.sql', 'patch-012-restore-tahan-versi.sql', 'patch-013-portal-anggota.sql', 'patch-014-anti-spam.sql', 'patch-014-anti-spam.sql']) await db2.exec(fsx.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
  check('upgrade berantai 011 → 012 → 013 → 014 (014 dua kali) tanpa galat', true);
}

process.exit(summary() ? 0 : 1);
