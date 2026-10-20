import { freshDb, as, signup, tryQ, check, summary } from './harness.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = path.join(ROOT, 'supabase/schema.sql'), PATCH = path.join(ROOT, 'supabase/patch-011-keamanan.sql');
const OLD = path.join(ROOT, 'supabase/base/schema-v3.9.1.sql');   // skema dasar v3.9.1, sebelum patch-011 (untuk uji upgrade)

async function seed(db) {
  const admin = await signup(db, 'admin@keluarga.id', 'Admin');
  await db.exec(`insert into members(name,relation) values('Budi','Anak'),('Siti','Anak'),('Andi','Anak')`);
  // instalasi baru tidak punya putaran: buka satu putaran aktif (kunci bergaya lama 'YYYY-MM' agar tes lama tetap berlaku)
  await db.exec(`do $$ begin if to_regclass('public.arisan_rounds') is not null then insert into arisan_rounds(seq,period,status,opened_at,opened_by,created_by) values(1,to_char(now() at time zone 'Asia/Jakarta','YYYY-MM'),'aktif',now(),'uji','uji'); end if; end $$`);
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

  await db.exec(`insert into arisan_rounds(seq,period,status,held_on,closed_at,closed_by) values(2,'P002','selesai',current_date-30,now(),'uji')`);   // putaran lama yang belum dibayar → tunggakan
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

console.log('\n═══ H. Putaran arisan fleksibel, tidak terikat bulan (patch-018) ═══');
{
  const fsx = await import('node:fs'); const PATCH15 = path.join(ROOT, 'supabase/patch-015-periode-manual.sql'), PATCH18 = path.join(ROOT, 'supabase/patch-018-putaran-arisan.sql');
  const db = await freshDb([SCHEMA]);
  const admin = await signup(db, 'admin@k.id', 'Admin');
  await db.exec(`insert into members(name,joined) values('Budi',2020),('Siti',2020),('Andi',2020),('Rina',2020)`);
  const viewer = await signup(db, 'v@k.id', 'Viewer'); await as(db, admin, () => tryQ(db, `select approve_user('${viewer}','viewer')`));
  const pending = await signup(db, 'p@k.id', 'Pending');
  const M = {}; for (const r of (await db.query(`select id,name from members`)).rows) M[r.name] = r.id;
  const A = (sql, p) => as(db, admin, () => tryQ(db, sql, p));
  const one = async (sql, p) => (await A(sql, p)).rows?.[0]?.r;
  const pay = (m, k, t = 1) => A(`select record_payment($1::bigint,$2::text,$3::smallint,'Tunai'::text) r`, [m, k, t]);

  console.log('  — instalasi baru: belum ada putaran —');
  check('instalasi baru tidak membuat putaran bayangan', (await db.query(`select count(*)::int c from arisan_rounds`)).rows[0].c === 0);
  check('cur_period() = NULL (tidak jatuh ke bulan kalender)', (await db.query(`select cur_period() p`)).rows[0].p === null);
  { const r = await A(`select run_draw()`); check('run_draw ditolak: belum ada putaran aktif', !r.ok && /putaran arisan aktif/i.test(r.err || ''), JSON.stringify(r)); }
  check('draw_state/dashboard/get_payments/fee_config/finance_dashboard tetap jalan tanpa putaran aktif', (await A(`select draw_state() a, dashboard() b, get_payments() c, fee_config() d, finance_dashboard() e`)).ok);
  check('draw_state: peserta kosong & period null', (await one(`select draw_state() r`)).period === null);
  check('fee_types.schedule: Iuran Arisan = putaran, Iuran Wajib = bulanan', JSON.stringify((await db.query(`select code,schedule from fee_types order by id`)).rows.map(x => x.schedule)) === '["putaran","bulanan"]');

  console.log('\n  — hak akses —');
  for (const [who, uid] of [['viewer', viewer], ['akun menunggu', pending], ['anon', null]]) await as(db, uid, async () => {
    for (const fn of [`create_round('x')`, `update_round(1::bigint)`, `open_round(1::bigint)`, `close_round()`, `cancel_round(1::bigint,'x')`]) check(`${who}: ${fn} ditolak`, !(await tryQ(db, `select ${fn}`)).ok);
  });
  await as(db, viewer, async () => { check('viewer boleh melihat round_state', (await tryQ(db, `select round_state()`)).ok); check('viewer tidak bisa menulis tabel putaran langsung', !(await tryQ(db, `insert into arisan_rounds(seq,period) values(9,'P009')`)).ok); });
  await as(db, pending, async () => { check('akun menunggu: round_state ditolak & tabel tertutup', !(await tryQ(db, `select round_state()`)).ok && (await tryQ(db, `select * from arisan_rounds`)).rows.length === 0); });
  await as(db, null, async () => { check('anon: round_state ditolak', !(await tryQ(db, `select round_state()`)).ok); });
  check('admin pun tidak bisa menulis tabel langsung (hanya lewat fungsi)', !(await A(`insert into arisan_rounds(seq,period) values(9,'P009')`)).ok);

  console.log('\n  — membuat putaran —');
  for (const [lbl, sql] of [['judul >80 karakter', `select create_round('${'x'.repeat(81)}')`], ['tanggal 1999', `select create_round('a','1999-01-01'::date)`], ['tanggal >3 tahun ke depan', `select create_round('a',(current_date+1200)::date)`],
    ['peminta tidak ada', `select create_round('a',null::date,null::text,99999::bigint)`], ['catatan >500', `select create_round('a',null::date,null::text,null::bigint,'${'n'.repeat(501)}')`]]) check(lbl + ' ditolak', !(await A(sql)).ok);
  const r1 = await one(`select create_round('Arisan Lebaran','2026-10-20'::date,'Rumah Bu Rina',${M.Rina}::bigint,'Rina minta dipercepat') r`);
  check('putaran 1: nomor 1, kunci P001, status rencana', r1.seq === 1 && r1.period === 'P001' && (await db.query(`select status from arisan_rounds where seq=1`)).rows[0].status === 'rencana', JSON.stringify(r1));
  check('peminta, tempat & catatan tersimpan', (await db.query(`select place,note,requested_by from arisan_rounds where seq=1`)).rows.some(x => x.place === 'Rumah Bu Rina' && x.requested_by === M.Rina && /dipercepat/.test(x.note)));
  check('putaran boleh TANPA tanggal (belum pasti)', (await A(`select create_round() r`)).ok && (await db.query(`select held_on from arisan_rounds where seq=2`)).rows[0].held_on === null);
  check('mencatat iuran pada putaran yang masih rencana DITOLAK', !(await pay(M.Budi, 'P001')).ok);
  check('mencatat iuran pada putaran tak dikenal ditolak', !(await pay(M.Budi, 'P077')).ok);
  check('ubah putaran: tanggal & tempat berubah', (await A(`select update_round(2::bigint,'Arisan Akhir Tahun','2026-12-27'::date,'Surabaya',null::bigint,null::text)`)).ok && (await db.query(`select title,place from arisan_rounds where seq=2`)).rows[0].place === 'Surabaya');
  check('putaran dicatat di jejak audit & log aktivitas', (await db.query(`select count(*)::int c from audit_log where tbl='arisan_rounds' and actor_name='Admin'`)).rows[0].c >= 3 && (await db.query(`select count(*)::int c from activity where text like 'Putaran arisan %'`)).rows[0].c >= 3);

  console.log('\n  — membuka putaran, iuran, kocok —');
  check('membuka putaran 1', (await A(`select open_round(1::bigint)`)).ok && (await db.query(`select cur_period() p`)).rows[0].p === 'P001');
  check('membuka putaran yang sudah aktif ditolak', !(await A(`select open_round(1::bigint)`)).ok);
  check('indeks unik menolak DUA putaran aktif', !(await db.query(`update arisan_rounds set status='aktif' where seq=2`).then(() => ({ ok: true }), () => ({ ok: false }))).ok);
  const p1 = await pay(M.Budi, 'P001'); check('iuran dicatat pada putaran aktif', p1.ok);
  check('keterangan transaksi memakai "Putaran 1" (bukan kunci mentah)', (await db.query(`select description from transactions order by id desc limit 1`)).rows[0].description === 'Iuran Arisan Putaran 1 - Budi');
  check('duplikat iuran pada putaran yang sama ditolak', !(await pay(M.Budi, 'P001')).ok);
  check('iuran bulanan memakai format bulan, bukan kunci putaran', !(await pay(M.Budi, 'P001', 2)).ok && (await pay(M.Budi, '2026-10', 2)).ok);
  check('iuran arisan dengan kunci bulan yang bukan putaran ditolak', !(await pay(M.Siti, '2026-10')).ok);
  await pay(M.Siti, 'P001'); await pay(M.Andi, 'P001');
  { const gp = await one(`select get_payments() r`); check('get_payments: putaran aktif & kolom per jenis mengikuti jadwalnya', gp.period === 'P001' && gp.rows.find(x => x.name === 'Budi').paid['1'] && gp.rows.find(x => x.name === 'Budi').paid['2'] && !gp.rows.find(x => x.name === 'Siti').paid['2'], JSON.stringify(gp.rows[0])); }
  check('draw_state: 3 peserta layak (yang sudah bayar)', (await one(`select draw_state() r`)).eligible.length === 3);
  const d1 = await one(`select run_draw() r`); check('pengocokan putaran 1', d1 && d1.pool === 3, JSON.stringify(d1));
  check('tutup putaran ditolak saat ada pemenang menunggu', !(await A(`select close_round()`)).ok && !(await A(`select open_round(2::bigint)`)).ok);
  check('pemenang disahkan', (await A(`select confirm_draw(${d1.id}::bigint)`)).ok);
  check('putaran dengan pemenang sah tidak bisa dibatalkan', !(await A(`select cancel_round(1::bigint,'x')`)).ok);

  console.log('\n  — dua putaran dalam SATU bulan & jeda panjang —');
  check('membuka putaran 2 menutup putaran 1 otomatis', (await A(`select open_round(2::bigint)`)).ok && (await db.query(`select status from arisan_rounds where seq=1`)).rows[0].status === 'selesai' && (await db.query(`select cur_period() p`)).rows[0].p === 'P002');
  check('tunggakan: Rina belum bayar putaran 1 = 1 putaran (bukan per bulan)', await (async () => { const ar = (await one(`select iuran_arrears(1::smallint,false) r`)).filter(x => x.name === 'Rina'); return ar.length === 1 && ar[0].n === 1 && ar[0].periods[0] === 'P001' && ar[0].schedule === 'putaran' && ar[0].total === 350000; })());
  check('yang sudah bayar putaran 1 tidak menunggak', (await one(`select iuran_arrears(1::smallint,false) r`)).every(x => x.name === 'Rina'));
  check('iuran susulan putaran 1 (yang sudah selesai) boleh dicatat', (await pay(M.Rina, 'P001')).ok && (await one(`select iuran_arrears(1::smallint,false) r`)).length === 0);
  for (const n of ['Budi', 'Siti', 'Andi', 'Rina']) await pay(M[n], 'P002');
  const d2 = await one(`select run_draw() r`); check('putaran 2 dikocok dalam bulan yang sama; pemenang putaran 1 tidak ikut (siklus sama)', d2 && d2.pool === 3 && d2.winner.id !== d1.winner.id, JSON.stringify(d2));
  await A(`select confirm_draw(${d2.id}::bigint)`);
  check('dua pemenang sah di bulan yang sama, kunci berbeda', (await db.query(`select count(*)::int c from draws where status='sah'`)).rows[0].c === 2);
  check('tutup putaran 2 tanpa membuka lagi → arisan jeda (tanpa putaran aktif)', (await A(`select close_round()`)).ok && (await db.query(`select cur_period() p`)).rows[0].p === null);
  check('tutup lagi ditolak (tidak ada putaran aktif)', !(await A(`select close_round()`)).ok);
  check('bulan tanpa arisan TIDAK menunggak: Iuran Arisan semua lunas', (await one(`select iuran_arrears(1::smallint,false) r`)).length === 0);

  console.log('\n  — pencairan —');
  { const fd = await one(`select finance_dashboard() r`); check('finance_dashboard: 2 pencairan tertunda (per putaran)', fd.pending.length === 2 && fd.pending.every(x => x.collected === 1400000), JSON.stringify(fd.pending)); }
  check('pencairan putaran 1', (await A(`select disburse_arisan('P001') r`)).ok);
  check('keterangan pencairan memakai nama putaran', (await db.query(`select description from transactions where category='Pencairan Arisan' order by id limit 1`)).rows[0].description.startsWith('Pencairan arisan Putaran 1 - '));
  check('pencairan tanpa argumen saat jeda ditolak jelas', !(await A(`select disburse_arisan()`)).ok);
  check('batalkan iuran putaran yang sudah dicairkan ditolak', !(await A(`select void_payment((select id from payments where period='P001' and fee_type_id=1 limit 1),'x')`)).ok);
  check('dana arisan masuk = 8 pembayaran × tarif (iuran wajib tidak tercampur)', (await db.query(`select coalesce(sum(amount),0)::int s from transactions where fund='arisan' and type='masuk'`)).rows[0].s === 8 * 350000);

  console.log('\n  — membatalkan & membuka kembali —');
  const r3 = await one(`select create_round('Percobaan') r`), r4 = await one(`select create_round() r`);
  check('batalkan putaran rencana (alasan opsional)', (await A(`select cancel_round(${r3.id}::bigint)`)).ok && (await db.query(`select status,closed_at from arisan_rounds where id=${r3.id}`)).rows[0].closed_at !== null);
  check('putaran batal tidak bisa dibuka / diubah / dibatalkan lagi', !(await A(`select open_round(${r3.id}::bigint)`)).ok && !(await A(`select update_round(${r3.id}::bigint,'x')`)).ok && !(await A(`select cancel_round(${r3.id}::bigint)`)).ok);
  check('putaran batal tidak muncul sebagai tunggakan & tidak bisa menerima iuran', !(await pay(M.Budi, r3.period)).ok);
  await A(`select open_round(${r4.id}::bigint)`);
  check('batalkan putaran AKTIF wajib alasan', !(await A(`select cancel_round(${r4.id}::bigint)`)).ok && (await A(`select cancel_round(${r4.id}::bigint,'Anggota membatalkan permintaan')`)).ok && (await db.query(`select cur_period() p`)).rows[0].p === null);
  check('putaran dengan pembayaran tidak bisa dibatalkan', await (async () => { const r5 = await one(`select create_round() r`); await A(`select open_round(${r5.id}::bigint)`); await pay(M.Budi, r5.period); const x = await A(`select cancel_round(${r5.id}::bigint,'x')`); return !x.ok && /pembayaran/.test(x.err); })());
  check('tutup tanpa pemenang: tanpa "paksa" ditolak, tanpa alasan ditolak', !(await A(`select close_round()`)).ok && !(await A(`select close_round('  '::text,true)`)).ok);
  check('tutup tanpa pemenang dengan alasan tertulis', (await A(`select close_round('Arisan ditunda'::text,true)`)).ok && (await db.query(`select close_note from arisan_rounds where period='P005'`)).rows[0].close_note === 'Arisan ditunda');
  check('buka kembali putaran selesai untuk koreksi', (await A(`select open_round(1::bigint) r`)).ok && (await db.query(`select cur_period() p`)).rows[0].p === 'P001');
  check('putaran 1 (dibuka kembali) sudah punya pemenang sah: draw ditolak', !(await A(`select run_draw()`)).ok);
  await A(`select close_round()`);

  console.log('\n  — jadwal iuran & matriks —');
  check('Iuran Arisan tidak bisa dijadikan bulanan (selalu putaran)', (await A(`select set_fee_type(1::smallint,'Iuran Arisan',350000,true,true,'2026-01','bulanan'::text)`)).ok && (await db.query(`select schedule from fee_types where id=1`)).rows[0].schedule === 'putaran');
  check('jadwal Iuran Wajib tidak bisa diubah bila sudah ada pembayaran', !(await A(`select set_fee_type(2::smallint,'Iuran Wajib',50000,false,true,'2026-01','putaran'::text)`)).ok);
  { const mx = await one(`select compliance_matrix(extract(year from current_date)::int,1::smallint) r`); check('compliance_matrix iuran putaran: kolom = putaran pada tahun itu', mx.schedule === 'putaran' && mx.cols.length >= 1 && mx.rows.every(x => x.m.length === mx.cols.length), JSON.stringify(mx).slice(0, 200)); }
  { const mx = await one(`select compliance_matrix(extract(year from current_date)::int,2::smallint) r`); check('compliance_matrix iuran bulanan: 12 kolom bulan', mx.schedule === 'bulanan' && mx.cols.length === 12 && mx.rows.every(x => x.m.length === 12)); }
  { const rc = await one(`select iuran_recap('2026-01','2026-12') r`); check('iuran_recap: baris putaran memuat nomor putaran & berjadwal putaran', rc.some(x => x.schedule === 'putaran' && x.seq >= 1) && rc.some(x => x.schedule === 'bulanan'), JSON.stringify(rc.slice(0, 2))); }
  { const ms = await A(`select my_status() r`); check('my_status tetap valid saat jeda (admin tanpa anggota terhubung)', ms.ok); }

  console.log('\n  — Backup, Restore & Reset —');
  await as(db, admin, async () => {
    const mk = (mode) => db.query(`select jsonb_build_object('app','FamilyHub','format',1,'created_at',now()::text,'data',jsonb_strip_nulls(jsonb_build_object(
      'settings',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from settings x),'fee_types',(select jsonb_agg(to_jsonb(x)) from fee_types x),
      'members',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from members x),'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from payments x),
      'transactions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from transactions x),'events','[]'::jsonb,'announcements','[]'::jsonb,'albums','[]'::jsonb,'photos','[]'::jsonb,
      'draws',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from draws x),'activity',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from activity x),
      'arisan_rounds',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from arisan_rounds x)))) b`).then(r => { const o = r.rows[0].b; if (mode === 'lama') { delete o.data.arisan_rounds; o.data.settings = o.data.settings.filter(s => s.k !== 'disburse_from_seq'); for (const f of o.data.fee_types) delete f.schedule; } return o; });
    const full = await mk('baru'), nR = (await db.query(`select count(*)::int c from arisan_rounds`)).rows[0].c, st = JSON.stringify((await db.query(`select seq,period,status,title,held_on from arisan_rounds order by seq`)).rows);
    await tryQ(db, `select create_round('sementara')`);
    const rs = await tryQ(db, `select restore_backup($1::jsonb) r`, [JSON.stringify(full)]);
    check('restore backup baru (memuat putaran) berhasil', rs.ok, JSON.stringify(rs));
    check('putaran kembali persis seperti saat backup (nomor, status, judul)', (await db.query(`select count(*)::int c from arisan_rounds`)).rows[0].c === nR && JSON.stringify((await db.query(`select seq,period,status,title,held_on from arisan_rounds order by seq`)).rows) === st);
    check('urutan nomor tersinkron: putaran baru tidak bentrok', (await tryQ(db, `select create_round('lagi') r`)).ok);
    const per = { ...full, data: { ...full.data, arisan_periods: [{ period: '2026-03', status: 'selesai', opened_at: '2026-03-01T00:00:00Z', closed_at: '2026-03-30T00:00:00Z', closed_by: 'Admin', close_note: 'x' }, { period: '2026-04', status: 'aktif', opened_at: '2026-04-01T00:00:00Z' }] } };
    delete per.data.arisan_rounds; per.data.payments = []; per.data.transactions = []; per.data.draws = [];
    const rp = await tryQ(db, `select restore_backup($1::jsonb) r`, [JSON.stringify(per)]);
    check('restore backup v3.14/3.15 (arisan_periods) dikonversi menjadi putaran', rp.ok && JSON.stringify((await db.query(`select seq,period,status from arisan_rounds order by seq`)).rows) === JSON.stringify([{ seq: 1, period: '2026-03', status: 'selesai' }, { seq: 2, period: '2026-04', status: 'aktif' }]), JSON.stringify(rp));
    await tryQ(db, `select restore_backup($1::jsonb) r`, [JSON.stringify(full)]);
    const old = await mk('lama');
    const r2 = await tryQ(db, `select restore_backup($1::jsonb) r`, [JSON.stringify(old)]);
    check('restore backup LAMA (tanpa putaran & tanpa kolom schedule) berhasil', r2.ok, JSON.stringify(r2));
    check('putaran dibentuk ulang dari kocokan & iuran; Iuran Arisan tetap berjadwal putaran', (await db.query(`select count(*)::int c from arisan_rounds`)).rows[0].c >= 2 && (await db.query(`select schedule from fee_types where id=1`)).rows[0].schedule === 'putaran');
    check('setelah restore lama: pencairan tertunda tidak meledak (batas disburse_from_seq terisi)', (await db.query(`select v from settings where k='disburse_from_seq'`)).rows.length === 1);
    const rr = await tryQ(db, `select reset_data('arisan',true) r`);
    check('reset arisan berhasil', rr.ok, JSON.stringify(rr));
    check('reset arisan: putaran & kocokan kosong, TANPA putaran aktif, batas pencairan = 1', (await db.query(`select count(*)::int c from arisan_rounds`)).rows[0].c === 0 && (await db.query(`select count(*)::int c from draws`)).rows[0].c === 0 && (await db.query(`select v from settings where k='disburse_from_seq'`)).rows[0].v === '1');
    { const nr = (await tryQ(db, `select create_round('baru') r`)).rows[0].r, mx = (await db.query(`select coalesce(max(substr(period,2)::int),0) m from (select period from payments union all select period from transactions) u where period ~ '^P\\d{3,6}$'`)).rows[0].m;
      check('setelah reset: nomor putaran baru melewati kunci iuran lama (tidak mewarisi pembayaran lama)', nr.seq > mx && (await db.query(`select count(*)::int c from payments where period=$1`, [nr.period])).rows[0].c === 0, JSON.stringify({ nr, mx })); }
    check('reset semua (tanpa simpan pengaturan) berhasil', (await tryQ(db, `select reset_data('semua',false) r`)).ok);
  });

  console.log('\n  — upgrade dari v3.15 yang sudah punya data (patch-015 → patch-018) —');
  {
    const d3 = await freshDb([OLD]); await seed(d3);
    for (const f of ['patch-011-keamanan.sql', 'patch-012-restore-tahan-versi.sql', 'patch-013-portal-anggota.sql', 'patch-014-anti-spam.sql', 'patch-006-keuangan.sql']) await d3.exec(fsx.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
    const mm = (await d3.query(`select id,name from members order by id`)).rows;
    await d3.exec(`insert into draws(cycle,period,participants,winner_id,winner_name,proof,status,attempt) values(1,'2026-03','[${mm[0].id}]',${mm[0].id},'${mm[0].name}','p','sah',1),(1,'2026-04','[${mm[1].id}]',${mm[1].id},'${mm[1].name}','p','tidak_hadir',1),(1,'2026-05','[${mm[1].id}]',${mm[1].id},'${mm[1].name}','p','sah',1)`);
    await d3.exec(`insert into payments(member_id,period,amount,fee_type_id) values(${mm[0].id},'2026-03',350000,1),(${mm[0].id},'2026-03',50000,2)`);
    await d3.exec(fsx.readFileSync(PATCH15, 'utf8'));
    const before = (await d3.query(`select count(*)::int c from audit_log`)).rows[0].c;
    await d3.exec(fsx.readFileSync(PATCH18, 'utf8')); await d3.exec(fsx.readFileSync(PATCH18, 'utf8'));
    const rs = (await d3.query(`select seq,period,status,held_on is not null h from arisan_rounds order by seq`)).rows;
    check('upgrade (018 dua kali): periode kocokan lama → putaran 1..3 berurutan, kunci lama dipertahankan', JSON.stringify(rs.map(x => [x.seq, x.period])) === JSON.stringify([[1, '2026-03'], [2, '2026-04'], [3, '2026-05']]), JSON.stringify(rs));
    check('putaran bentukan kosong dari bulan kalender TIDAK ikut (tanpa putaran aktif)', rs.every(x => x.status === 'selesai') && (await d3.query(`select cur_period() p`)).rows[0].p === null);
    check('tanggal putaran lama diambil dari pemenang sah', rs[0].h === true && rs[1].h === false);
    check('tabel arisan_periods & fungsi lama dihapus', (await d3.query(`select to_regclass('public.arisan_periods') r`)).rows[0].r === null && (await d3.query(`select count(*)::int c from pg_proc where proname in('set_active_period','period_state','_ensure_periods')`)).rows[0].c === 0);
    check('pembayaran & kocokan lama tidak berubah (kunci tetap)', (await d3.query(`select count(*)::int c from payments where period='2026-03'`)).rows[0].c === 2 && (await d3.query(`select count(*)::int c from draws`)).rows[0].c === 3);
    check('upgrade tidak menulis jejak audit palsu', (await d3.query(`select count(*)::int c from audit_log where tbl in('arisan_rounds','fee_types')`)).rows[0].c === 0 && (await d3.query(`select count(*)::int c from audit_log`)).rows[0].c === before);
    check('batas pencairan: putaran lama tidak dianggap "tertunda" setelah upgrade', (await d3.query(`select v::int v from settings where k='disburse_from_seq'`)).rows[0].v >= 1);
    check('Iuran Arisan berjadwal putaran, Iuran Wajib bulanan setelah upgrade', JSON.stringify((await d3.query(`select schedule from fee_types order by id`)).rows.map(x => x.schedule)) === '["putaran","bulanan"]');
  }
}

console.log('\n═══ I. Hapus pengguna (patch-016) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await seed(db), admin2 = await signup(db, 'admin2@mail.com', 'Admin Dua'), vw = await signup(db, 'viewer@mail.com', 'Viewer'), pend = await signup(db, 'tunggu@mail.com', 'Menunggu');
  await as(db, admin, async () => { await tryQ(db, `select set_role('${admin2}','admin')`); await tryQ(db, `select set_role('${vw}','viewer')`); });
  const mA = await mid(db, 'Budi'); await as(db, admin, async () => { await tryQ(db, `select link_member('${vw}',${mA}::bigint)`); });

  await as(db, vw, async () => { check('viewer tidak bisa delete_user', !(await tryQ(db, `select delete_user('${admin2}')`)).ok); });
  await as(db, pend, async () => { check('akun menunggu tidak bisa delete_user', !(await tryQ(db, `select delete_user('${admin2}')`)).ok); });
  await as(db, null, async () => { check('anon tidak bisa delete_user', !(await tryQ(db, `select delete_user('${vw}')`)).ok); });
  check('(DB) upaya ditolak tidak menghapus siapa pun', (await db.query(`select count(*)::int c from auth.users`)).rows[0].c === 4);

  await as(db, admin, async () => {
    const self = await tryQ(db, `select delete_user('${admin}')`);
    check('admin tidak bisa menghapus akunnya sendiri', !self.ok && /sendiri/.test(self.err), JSON.stringify(self));
    check('id tak dikenal ditolak', !(await tryQ(db, `select delete_user(gen_random_uuid())`)).ok);
    check('admin menghapus viewer yang sudah aktif', (await tryQ(db, `select delete_user('${vw}')`)).ok);
    check('admin menghapus pendaftar menunggu', (await tryQ(db, `select delete_user('${pend}')`)).ok);
    check('admin menghapus admin lain selama masih ada admin tersisa (dirinya)', (await tryQ(db, `select delete_user('${admin2}')`)).ok);
  });
  check('(DB) akun & profil yang dihapus benar-benar hilang', (await db.query(`select count(*)::int c from auth.users where id in ('${vw}','${pend}','${admin2}')`)).rows[0].c === 0 && (await db.query(`select count(*)::int c from profiles where id in ('${vw}','${pend}','${admin2}')`)).rows[0].c === 0);
  check('(DB) data anggota yang tadinya terhubung TIDAK ikut terhapus', (await db.query(`select count(*)::int c from members where id=$1`, [mA])).rows[0].c === 1);
  check('(DB) admin yang menghapus tetap ada', (await db.query(`select count(*)::int c from profiles where id=$1 and role='admin'`, [admin])).rows[0].c === 1);
  check('(DB) tercatat di log aktivitas', (await db.query(`select count(*)::int c from activity where text ilike 'Akun pengguna dihapus%'`).catch(() => ({ rows: [{ c: -1 }] }))).rows[0].c !== 0);
  check('(DB) tercatat di jejak audit (hapus profil)', (await db.query(`select count(*)::int c from audit_log where tbl='profiles' and op='DELETE'`)).rows[0].c >= 3);
}

console.log('\n═══ J. Ubah nama pengguna (patch-017) ═══');
{
  const db = await freshDb([SCHEMA]); const admin = await seed(db), vw = await signup(db, 'v@mail.com', 'Viewer');
  await as(db, admin, async () => { await tryQ(db, `select set_role('${vw}','viewer')`); });
  await as(db, vw, async () => { check('viewer tidak bisa rename_user', !(await tryQ(db, `select rename_user('${vw}','Hacker')`)).ok); });
  await as(db, null, async () => { check('anon tidak bisa rename_user', !(await tryQ(db, `select rename_user('${vw}','Hacker')`)).ok); });
  await as(db, admin, async () => {
    check('admin mengubah nama', (await tryQ(db, `select rename_user('${vw}','  Nama Baru  ')`)).ok);
    check('nama kosong ditolak', !(await tryQ(db, `select rename_user('${vw}','   ')`)).ok);
    check('id tak dikenal ditolak', !(await tryQ(db, `select rename_user(gen_random_uuid(),'X')`)).ok);
  });
  check('(DB) nama tersimpan & dipangkas spasi', (await db.query(`select name from profiles where id=$1`, [vw])).rows[0].name === 'Nama Baru');
  check('(DB) tercatat di log aktivitas', (await db.query(`select count(*)::int c from activity where text='Nama pengguna diubah'`)).rows[0].c === 1);
}

console.log('\n═══ K. Integritas arisan: pencairan, putaran tanpa pemenang, reset (patch-019) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await signup(db, 'admin@k.id', 'Admin'), viewer = await signup(db, 'v@k.id', 'Viewer');
  await as(db, admin, () => tryQ(db, `select approve_user('${viewer}','viewer')`));
  await db.exec(`insert into members(name,joined) values('Budi',2020),('Siti',2020),('Andi',2020)`);
  const M = {}; for (const r of (await db.query(`select id,name from members`)).rows) M[r.name] = r.id;
  const A = (sql, p) => as(db, admin, () => tryQ(db, sql, p));
  const one = async (sql, p) => (await A(sql, p)).rows?.[0]?.r;
  const pay = (m, k, t = 1) => A(`select record_payment($1::bigint,$2::text,$3::smallint,'Tunai'::text) r`, [m, k, t]);
  const year = new Date().getFullYear();

  console.log('  — pencairan vs. ganti pemenang —');
  await A(`select create_round('Satu') r`); await A(`select open_round(1::bigint)`);
  for (const n of ['Budi', 'Siti', 'Andi']) await pay(M[n], 'P001');
  const d1 = await one(`select run_draw() r`); await A(`select confirm_draw(${d1.id}::bigint)`);
  check('log pemenang memakai "Putaran 1" (bukan kunci mentah P001)', (await db.query(`select count(*)::int c from activity where text like 'Pemenang arisan Putaran 1:%'`)).rows[0].c === 1 && (await db.query(`select count(*)::int c from activity where text like 'Pemenang arisan P0%'`)).rows[0].c === 0);
  const ds = await one(`select disburse_arisan('P001') r`); check('dana putaran 1 dicairkan', ds && ds.amount === 3 * 350000, JSON.stringify(ds));
  { const r = await A(`select reopen_draw() r`); check('reopen_draw DITOLAK setelah dana dicairkan', !r.ok && /dicairkan/.test(r.err || ''), JSON.stringify(r)); }
  check('pemenang tetap sah setelah penolakan', (await db.query(`select count(*)::int c from draws where period='P001' and status='sah'`)).rows[0].c === 1);
  { const r = await A(`select void_payment((select id from payments where period='P001' and fee_type_id=1 limit 1),'x')`); check('pesan batal-iuran memakai "Putaran 1"', !r.ok && /Putaran 1/.test(r.err || '') && !/P001/.test(r.err || ''), JSON.stringify(r)); }
  await as(db, viewer, async () => { check('viewer tidak bisa reopen_draw', !(await tryQ(db, `select reopen_draw()`)).ok); check('viewer tidak bisa cancel_disbursement', !(await tryQ(db, `select cancel_disbursement(1::bigint)`)).ok); });
  const tid = (await db.query(`select id from transactions where category='Pencairan Arisan' limit 1`)).rows[0].id;
  check('batalkan pencairan', (await A(`select cancel_disbursement(${tid}::bigint)`)).ok);
  check('setelah pencairan dibatalkan, pemenang boleh diganti', (await A(`select reopen_draw() r`)).ok && (await db.query(`select count(*)::int c from draws where period='P001' and status='tidak_hadir'`)).rows[0].c === 1);
  const d1b = await one(`select run_draw() r`); check('kocok ulang: pemenang lama dilewati (pool 2)', d1b && d1b.pool === 2 && d1b.winner.id !== d1.winner.id, JSON.stringify(d1b));
  await A(`select confirm_draw(${d1b.id}::bigint)`);
  { const r = await one(`select disburse_arisan('P001') r`); check('pemenang pengganti menerima dana penuh', r && r.amount === 3 * 350000 && r.winner === d1b.winner.name, JSON.stringify(r)); }

  console.log('\n  — putaran tanpa pemenang tidak membuat tunggakan —');
  await A(`select create_round('Dua') r`); await A(`select open_round(2::bigint)`);
  check('tutup putaran 2 tanpa pemenang & tanpa iuran (arisan ditiadakan)', (await A(`select close_round('Ditiadakan'::text,true)`)).ok);
  check('tidak ada tunggakan dari putaran yang ditiadakan', (await one(`select iuran_arrears(1::smallint,false) r`)).length === 0);
  { const mx = await one(`select compliance_matrix(${year},1::smallint) r`); check('matriks kepatuhan tidak memuat putaran yang ditiadakan', mx.cols.some(c => c.key === 'P001') && mx.cols.every(c => c.key !== 'P002'), JSON.stringify(mx.cols)); }
  { const rc = await one(`select iuran_recap('${year}-01','${year}-12') r`); check('rekap realisasi tidak memuat putaran yang ditiadakan', rc.some(x => x.period === 'P001') && !rc.some(x => x.period === 'P002')); }
  await A(`select create_round('Tiga') r`); await A(`select open_round(3::bigint)`); await pay(M.Budi, 'P003');
  check('putaran tanpa pemenang tetapi sudah ada iuran masuk → ditutup', (await A(`select close_round('Ditunda'::text,true)`)).ok);
  { const ar = await one(`select iuran_arrears(1::smallint,false) r`); check('putaran yang sudah ada iuran tetap ditagih ke yang belum bayar (Siti, Andi)', ar.length === 2 && ar.every(x => x.name !== 'Budi' && x.periods.length === 1 && x.periods[0] === 'P003'), JSON.stringify(ar)); }

  console.log('\n  — reset arisan tidak membuat nomor putaran bentrok dengan iuran lama —');
  check('pembantu internal tidak bisa dipanggil dari browser', !(await A(`select round_held('P001')`)).ok && !(await A(`select _next_round_seq()`)).ok);
  check('reset arisan berhasil', (await A(`select reset_data('arisan',true) r`)).ok);
  check('iuran lama tetap ada setelah reset arisan (keuangan tidak berubah)', (await db.query(`select count(*)::int c from payments where period in('P001','P003')`)).rows[0].c === 4);
  { const nr = await one(`select create_round('Baru') r`); check('putaran baru TIDAK memakai kunci iuran lama (P004, bukan P001)', nr.seq === 4 && nr.period === 'P004', JSON.stringify(nr));
    await A(`select open_round(${nr.id}::bigint)`);
    check('putaran baru mulai bersih: tak ada iuran warisan', (await one(`select get_payments() r`)).rows.every(x => !x.paid['1'])); }
}

console.log('\n═══ L. Input iuran saat periode berganti (patch-020) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await signup(db, 'admin@k.id', 'Admin');
  await db.exec(`insert into members(name,joined) values('Budi',2020),('Siti',2020)`);
  await db.exec(`update fee_types set start_period='2020-01'`);
  const M = {}; for (const r of (await db.query(`select id,name from members`)).rows) M[r.name] = r.id;
  const A = (sql, p) => as(db, admin, () => tryQ(db, sql, p));
  const one = async (sql, p) => (await A(sql, p)).rows?.[0]?.r;
  const pay = (m, k, t = 1) => A(`select record_payment($1::bigint,$2::text,$3::smallint,'Tunai'::text) r`, [m, k, t]);

  await A(`select create_round('Tanpa tanggal') r`); await A(`select open_round(1::bigint)`);
  await db.exec(`update arisan_rounds set opened_at='2026-03-28 10:00+07', ref_month=null where seq=1`);     // meniru DATA LAMA (sebelum patch-021, bulan belum tersimpan): dibuka akhir Maret; hari ini jauh sesudahnya
  check('bulan acuan putaran tanpa tanggal TETAP di bulan dibuka (bukan bulan kalender)', (await db.query(`select ref_month('P001') m`)).rows[0].m === '2026-03');
  await db.exec(`update fee_types set required_for_draw=true where id=2`);                   // Iuran Wajib jadi syarat kocok
  await pay(M.Budi, 'P001'); await pay(M.Siti, 'P001'); await pay(M.Budi, '2026-03', 2);
  check('syarat kocok mengikuti bulan acuan tetap: Budi (Wajib Maret lunas) layak, Siti tidak', await (async () => { const e = (await one(`select draw_state() r`)).eligible; return e.length === 1 && e[0].name === 'Budi'; })());
  { const gp = await one(`select get_payments() r`); check('get_payments bawaan: bulan = bulan acuan putaran aktif', gp.month === '2026-03' && gp.rows.find(x => x.name === 'Budi').paid['2'], gp.month); }

  await A(`select create_round('Juni','2026-06-10'::date) r`);
  { const gp = await one(`select get_payments('P002') r`); check('memilih putaran lain: bulan bawaan mengikuti putaran ITU (2026-06), bukan putaran aktif', gp.period === 'P002' && gp.month === '2026-06' && !gp.rows.find(x => x.name === 'Budi').paid['2'], JSON.stringify({ p: gp.period, m: gp.month })); }
  { const gp = await one(`select get_payments('P002','2026-03') r`); check('bulan yang dipilih eksplisit tetap dihormati', gp.month === '2026-03' && gp.rows.find(x => x.name === 'Budi').paid['2']); }
  check('ref_month putaran tak dikenal jatuh ke bulan kalender', (await db.query(`select ref_month('P999') m, calendar_period() c`)).rows.every(x => x.m === x.c));
  check('ref_month putaran lama ber-kunci bulan memakai bulan kuncinya', await (async () => { await db.exec(`insert into arisan_rounds(seq,period,status,opened_at,opened_by,created_by,closed_at,closed_by) values(9,'2025-11','selesai',now(),'x','x',now(),'x')`); return (await db.query(`select ref_month('2025-11') m`)).rows[0].m === '2025-11'; })());
}

console.log('\n═══ M. Iuran Wajib tidak terbawa ke putaran baru (patch-021) ═══');
{
  const db = await freshDb([SCHEMA]);
  const admin = await signup(db, 'admin@k.id', 'Admin');
  await db.exec(`insert into members(name,joined) values('Budi',2020),('Siti',2020)`);
  await db.exec(`update fee_types set start_period='2020-01', required_for_draw=true where id=2`);
  const M = {}; for (const r of (await db.query(`select id,name from members`)).rows) M[r.name] = r.id;
  const A = (sql, p) => as(db, admin, () => tryQ(db, sql, p));
  const one = async (sql, p) => (await A(sql, p)).rows?.[0]?.r;
  const pay = (m, k, t = 1) => A(`select record_payment($1::bigint,$2::text,$3::smallint,'Tunai'::text) r`, [m, k, t]);
  const wajibLunas = gp => !!gp.rows.find(x => x.name === 'Budi').paid['2'];

  const r1 = await one(`select create_round('Satu','2026-10-10'::date) r`); await A(`select open_round(${r1.id}::bigint)`);
  await pay(M.Budi, 'P001'); await pay(M.Budi, '2026-10', 2);
  check('putaran bertanggal: bulan acuan = bulan tanggalnya & tersimpan', r1.ref_month === '2026-10' && (await db.query(`select ref_month from arisan_rounds where seq=1`)).rows[0].ref_month === '2026-10');
  check('putaran 1: Iuran Wajib Okt lunas (sebagaimana dicatat)', wajibLunas(await one(`select get_payments('P001') r`)));

  const r2 = await one(`select create_round('Dua') r`);
  check('putaran baru TANPA tanggal mendapat bulan SESUDAH putaran sebelumnya (bukan bulan yang sama)', r2.ref_month === '2026-11', r2.ref_month);
  { const gp = await one(`select get_payments('P002') r`); check('Iuran Wajib putaran lama TIDAK tampil lunas di putaran baru', gp.month === '2026-11' && !wajibLunas(gp), gp.month); }
  await A(`select open_round(${r2.id}::bigint,'tutup',true)`);
  { const gp = await one(`select get_payments() r`); check('setelah dibuka & jadi putaran aktif: bulan tetap 2026-11, Wajib belum lunas', gp.period === 'P002' && gp.month === '2026-11' && !wajibLunas(gp)); }
  { const e = (await one(`select draw_state() r`)).eligible; check('syarat kocok putaran baru butuh Iuran Wajib bulan barunya (Budi belum layak)', !e.some(x => x.name === 'Budi'), JSON.stringify(e.map(x => x.name))); }
  await pay(M.Budi, '2026-11', 2);
  check('setelah Budi bayar Wajib bulan baru: tampil lunas di putaran baru, putaran lama tetap lunas Okt', wajibLunas(await one(`select get_payments('P002') r`)) && wajibLunas(await one(`select get_payments('P001') r`)));

  const r3 = await one(`select create_round('Tiga') r`); check('putaran tanpa tanggal berikutnya maju lagi (Desember)', r3.ref_month === '2026-12', r3.ref_month);
  await A(`select update_round(${r3.id}::bigint,'Tiga baru'::text)`);
  check('mengubah judul putaran tanpa tanggal TIDAK menggeser bulan acuan', (await db.query(`select ref_month('P003') m`)).rows[0].m === '2026-12');
  await A(`select update_round(${r3.id}::bigint,'Tiga'::text,'2027-02-14'::date)`);
  check('mengisi tanggal pelaksanaan memindahkan bulan acuan ke bulan tanggalnya', (await db.query(`select ref_month('P003') m`)).rows[0].m === '2027-02');
  await A(`select update_round(${r3.id}::bigint,'Tiga'::text,null::date)`);
  check('mengosongkan tanggal kembali ke aturan "sesudah putaran sebelumnya"', (await db.query(`select ref_month('P003') m`)).rows[0].m === '2026-12');
  check('putaran yang dibatalkan tidak dihitung: berikutnya tetap sesudah putaran terakhir yang berlaku (Jan 2027)', await (async () => { const b = await one(`select create_round('Batal') r`); await A(`select cancel_round(${b.id}::bigint) r`); const n = await one(`select create_round('Setelah batal') r`); return n.ref_month === '2027-01'; })());
  check('pembantu _next_ref_month tidak bisa dipanggil dari browser', !(await A(`select _next_ref_month()`)).ok);
  check('daftar putaran untuk aplikasi memuat ref_month tiap putaran', (await one(`select get_payments() r`)).rounds.every(x => /^\d{4}-\d{2}$/.test(x.ref_month)));
}

process.exit(summary() ? 0 : 1);
