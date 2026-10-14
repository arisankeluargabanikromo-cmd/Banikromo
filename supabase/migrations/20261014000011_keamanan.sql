-- ============================================================
-- PATCH 011 — Keamanan & jejak audit (FamilyHub v3.10)
--
--  1) PERSETUJUAN AKUN. Sebelumnya siapa pun yang mendaftar langsung menjadi "viewer" dan bisa membaca SEMUA data
--     keluarga (anggota, nomor HP, alamat, keuangan, foto). Kini akun baru berstatus MENUNGGU sampai admin
--     menyetujui. Dipaksakan di database (RLS + fungsi + Storage), bukan hanya di tampilan.
--     Akun yang sudah ada otomatis dianggap disetujui. Pendaftar PERTAMA tetap menjadi admin (kini aman dari
--     pendaftaran serentak).
--  2) JEJAK AUDIT (tabel audit_log): perubahan transaksi, jenis iuran, pembatalan pembayaran, dan perubahan
--     peran/persetujuan tercatat beserta nilai lama & baru. Tidak bisa diubah/dihapus dari aplikasi dan TIDAK ikut
--     terhapus oleh Reset/Pemulihan backup.
--  3) TRANSAKSI IURAN DIKUNCI: baris kas yang lahir dari pembayaran iuran tidak bisa diubah/dihapus langsung lewat
--     API (sebelumnya admin bisa mengubah nominalnya sehingga kas tidak cocok dengan pembayaran). Pembatalan tetap
--     lewat "Batalkan pembayaran".
--  4) Pengerasan: search_path pada fungsi bantu; fungsi internal (cfg, eligible_members) tidak lagi bisa dipanggil
--     langsung dari browser.
-- Aman dijalankan berulang (idempotent). Tidak mengubah data yang ada.
-- Prasyarat: schema.sql (atau patch 001–010) sudah dijalankan.
-- ============================================================

-- ---------- 1. Persetujuan akun ----------
alter table public.profiles add column if not exists approved boolean not null default true;   -- akun lama = disetujui
alter table public.profiles alter column approved set default false;                            -- akun baru = menunggu

create or replace function public.is_approved() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select approved from profiles where id=auth.uid()),false) $$;
create or replace function public.need_approved() returns void language plpgsql stable set search_path=public as $$
begin if not public.is_approved() then raise exception 'Akun Anda masih menunggu persetujuan admin'; end if; end $$;

-- Admin & pengelola hanya berlaku bila akun sudah disetujui
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select role='admin' and approved from profiles where id=auth.uid()),false) $$;
create or replace function public.is_member_editor() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select role in('admin','pengelola') and approved from profiles where id=auth.uid()),false) $$;

-- Pendaftar pertama = admin & disetujui; berikutnya = viewer & MENUNGGU. Kunci mencegah dua admin dari pendaftaran serentak.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare first_user boolean;
begin
 perform pg_advisory_xact_lock(hashtext('fh_first_user'));
 first_user:=not exists(select 1 from profiles);
 insert into profiles(id,name,role,approved)
  values(new.id, coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1)), case when first_user then 'admin' else 'viewer' end, first_user);
 return new; end $$;

create or replace function public.ensure_profile() returns jsonb language plpgsql security definer set search_path=public as $$
declare u auth.users; p profiles; first_user boolean;
begin
 if auth.uid() is null then raise exception 'Silakan login'; end if;
 select * into p from profiles where id=auth.uid();
 if not found then
  perform pg_advisory_xact_lock(hashtext('fh_first_user'));
  first_user:=not exists(select 1 from profiles);
  select * into u from auth.users where id=auth.uid();
  insert into profiles(id,name,role,approved) values(u.id, coalesce(nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1)), case when first_user then 'admin' else 'viewer' end, first_user) returning * into p;
 end if;
 return jsonb_build_object('name',p.name,'role',p.role,'approved',p.approved);
end $$;

-- Semua kebijakan baca ("baca") kini mensyaratkan akun disetujui. Profil sendiri selalu boleh dibaca (untuk layar "menunggu").
do $$ declare r record; begin
 for r in select schemaname,tablename from pg_policies where schemaname='public' and policyname='baca' and cmd='SELECT' loop
  if r.tablename='profiles' then
   execute format('alter policy "baca" on %I.%I using (id=auth.uid() or public.is_approved())',r.schemaname,r.tablename);
  else
   execute format('alter policy "baca" on %I.%I using (public.is_approved())',r.schemaname,r.tablename);
  end if;
 end loop;
end $$;
drop policy if exists "fh baca foto" on storage.objects;
create policy "fh baca foto" on storage.objects for select to authenticated using (bucket_id='photos' and public.is_approved());

-- Fungsi baca (security definer melewati RLS) dibungkus pemeriksaan persetujuan. Isi aslinya dipindah ke <nama>__impl
-- yang TIDAK bisa dipanggil dari browser; pembungkus memeriksa dulu baru memanggilnya.
do $$ declare f record; ident text; args text; res text; call text; impl text; begin
 for f in select p.oid,p.proname,p.proargnames,p.pronargs from pg_proc p
          where p.pronamespace='public'::regnamespace
            and p.proname in('dashboard','report','draw_state','fee_config','get_payments','iuran_arrears','iuran_recap',
                             'compliance_matrix','finance_summary','finance_ledger','finance_dashboard')
            and position('need_approved' in p.prosrc)=0 loop
  ident:=pg_get_function_identity_arguments(f.oid); args:=pg_get_function_arguments(f.oid); res:=pg_get_function_result(f.oid);
  impl:=f.proname||'__impl';
  select coalesce(string_agg(format('%I := %I',n,n),', '),'') into call from unnest(coalesce(f.proargnames,array[]::text[])) n;
  execute format('alter function public.%I(%s) rename to %I',f.proname,ident,impl);
  execute format('revoke execute on function public.%I(%s) from public, anon, authenticated',impl,ident);
  execute format('create function public.%I(%s) returns %s language plpgsql stable security definer set search_path=public as $b$ begin perform public.need_approved(); return public.%I(%s); end $b$',f.proname,args,res,impl,call);
  execute format('revoke execute on function public.%I(%s) from public, anon',f.proname,ident);
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,ident);
 end loop;
end $$;

-- Fungsi internal tidak perlu bisa dipanggil dari browser
revoke execute on function public.cfg(text), public.eligible_members(text) from public, anon, authenticated;

-- Daftar pengguna kini memuat status persetujuan & tanggal daftar
create or replace function public.list_users() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform need_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',u.email,'role',p.role,'approved',p.approved,'created_at',u.created_at)
        order by p.approved,u.created_at desc) from profiles p join auth.users u on u.id=p.id),'[]'::jsonb); end $$;

-- Setujui / tolak pendaftar
create or replace function public.approve_user(p_id uuid,p_role text default 'viewer') returns void language plpgsql security definer set search_path=public as $$
declare nm text;
begin
 perform need_admin();
 if p_role is null or p_role not in('admin','pengelola','viewer') then raise exception 'Peran tidak valid'; end if;
 update profiles set approved=true,role=p_role where id=p_id returning name into nm;
 if not found then raise exception 'Pengguna tidak ditemukan'; end if;
 perform log_act('✓','Akun disetujui: '||coalesce(nm,'?'),'peran '||p_role);
end $$;

create or replace function public.reject_user(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare nm text; ok boolean;
begin
 perform need_admin();
 select name,approved into nm,ok from profiles where id=p_id;
 if not found then raise exception 'Pengguna tidak ditemukan'; end if;
 if ok then raise exception 'Akun ini sudah disetujui. Ubah perannya, bukan menolaknya.'; end if;
 delete from auth.users where id=p_id;                 -- profil ikut terhapus (cascade)
 perform log_act('✗','Pendaftaran ditolak: '||coalesce(nm,'?'),'');
end $$;

-- Mengubah peran = juga menyetujui akun; minimal satu admin harus tersisa
create or replace function public.set_role(p_id uuid,p_role text) returns void language plpgsql security definer set search_path=public as $$
declare nm text;
begin
 perform need_admin();
 if p_role is null or p_role not in('admin','pengelola','viewer') then raise exception 'Peran tidak valid'; end if;
 if p_role<>'admin' and not exists(select 1 from profiles where role='admin' and approved and id<>p_id) then raise exception 'Harus ada minimal satu admin'; end if;
 update profiles set role=p_role,approved=true where id=p_id returning name into nm;
 if not found then raise exception 'Pengguna tidak ditemukan'; end if;
 perform log_act('⚙','Peran pengguna diubah',coalesce(nm,'?')||' → '||case p_role when 'admin' then 'Admin' when 'pengelola' then 'Pengelola Silsilah' else 'Viewer' end);
end $$;

-- ---------- 2. Jejak audit ----------
create table if not exists public.audit_log(
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid, actor_name text,
  tbl text not null, op text not null, row_id text,
  old_row jsonb, new_row jsonb);
create index if not exists audit_at_idx on public.audit_log(at desc);
alter table public.audit_log enable row level security;
drop policy if exists "admin baca audit" on public.audit_log;
create policy "admin baca audit" on public.audit_log for select to authenticated using (public.is_admin());
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;      -- dibatasi policy: hanya admin

create or replace function public.trg_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare o jsonb:=case when tg_op<>'INSERT' then to_jsonb(old) end; n jsonb:=case when tg_op<>'DELETE' then to_jsonb(new) end;
begin
 if coalesce(current_setting('fh.skip_recalc',true),'')='1' then return null; end if;       -- Reset/Pemulihan massal punya log sendiri
 if tg_table_name='profiles' and tg_op='UPDATE' and o->>'role'=n->>'role' and o->>'approved'=n->>'approved' then return null; end if;
 insert into audit_log(actor,actor_name,tbl,op,row_id,old_row,new_row)
  values(auth.uid(),(select name from profiles where id=auth.uid()),tg_table_name,tg_op,coalesce(n->>'id',o->>'id'),o,n);
 return null; end $$;

drop trigger if exists audit_tx_ins on public.transactions;
drop trigger if exists audit_tx_upd on public.transactions;
drop trigger if exists audit_tx_del on public.transactions;
create trigger audit_tx_ins after insert on public.transactions for each row when (new.payment_id is null) execute function public.trg_audit();   -- kas manual (iuran sudah tercatat di payments)
create trigger audit_tx_upd after update on public.transactions for each row execute function public.trg_audit();
create trigger audit_tx_del after delete on public.transactions for each row execute function public.trg_audit();
drop trigger if exists audit_pay_del on public.payments;
create trigger audit_pay_del after delete on public.payments for each row execute function public.trg_audit();                                      -- pembatalan pembayaran
drop trigger if exists audit_fee on public.fee_types;
create trigger audit_fee after update on public.fee_types for each row execute function public.trg_audit();
drop trigger if exists audit_prof on public.profiles;
create trigger audit_prof after update on public.profiles for each row execute function public.trg_audit();

create or replace function public.audit_recent(p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform need_admin();
 return coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (select id,at,actor_name,tbl,op,row_id,old_row,new_row from audit_log order by id desc limit least(greatest(coalesce(p_limit,100),1),500)) a),'[]'::jsonb); end $$;

-- ---------- 3. Kunci transaksi hasil pembayaran iuran ----------
-- Pengecualian: sesi server (tanpa pengguna), pembatalan lewat void_payment / hapus anggota (cascade, trigger bersarang),
-- serta Reset & Pemulihan backup (menandai fh.skip_recalc).
create or replace function public.trg_tx_lock() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null and pg_trigger_depth()<=1 and coalesce(current_setting('fh.skip_recalc',true),'')<>'1' and old.payment_id is not null then
  raise exception 'Transaksi iuran tidak boleh diubah atau dihapus langsung. Untuk membatalkan, gunakan "Batalkan pembayaran" pada menu Iuran.';
 end if;
 if tg_op='DELETE' then return old; end if; return new; end $$;
drop trigger if exists tx_lock on public.transactions;
create trigger tx_lock before update or delete on public.transactions for each row execute function public.trg_tx_lock();

-- ---------- 4. Pengerasan ----------
alter function public.need_admin() set search_path=public;
alter function public.need_member_editor() set search_path=public;
alter function public.cur_period() set search_path=public;
alter function public.pengaturan_ready() set search_path=public;

-- ---------- 5. Hak eksekusi ----------
revoke execute on function public.is_approved(), public.need_approved(), public.approve_user(uuid,text), public.reject_user(uuid), public.audit_recent(int),
  public.trg_audit(), public.trg_tx_lock() from public, anon;
grant execute on function public.is_approved(), public.need_approved(), public.approve_user(uuid,text), public.reject_user(uuid), public.audit_recent(int) to authenticated;
revoke execute on function public.trg_audit(), public.trg_tx_lock() from authenticated;
revoke execute on function public.handle_new_user(), public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.is_admin(), public.is_member_editor(), public.list_users(), public.set_role(uuid,text) from public, anon;
