-- ============================================================
-- PATCH 014 — Anti-spam pendaftaran (FamilyHub v3.13)
--  Pendaftaran publik membuat daftar "menunggu persetujuan" rawan dibanjiri. Kini:
--   1) Paling banyak 50 pendaftar menunggu sekaligus; pendaftaran ke-51 ditolak sampai admin menyetujui/menolak.
--   2) reject_all_pending(): admin menolak & menghapus semua pendaftar menunggu sekali klik.
-- Aman dijalankan berulang. Prasyarat: patch-011.
-- ============================================================

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare first_user boolean;
begin
 perform pg_advisory_xact_lock(hashtext('fh_first_user'));
 first_user:=not exists(select 1 from profiles);
 if not first_user and (select count(*) from profiles where not approved)>=50 then
  raise exception 'Pendaftaran sedang penuh: terlalu banyak pendaftar menunggu persetujuan. Hubungi admin keluarga.';
 end if;
 insert into profiles(id,name,role,approved)
  values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),split_part(new.email,'@',1)),80), case when first_user then 'admin' else 'viewer' end, first_user);
 return new; end $$;

create or replace function public.reject_all_pending() returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
 perform need_admin();
 with d as (delete from auth.users where id in(select id from profiles where not approved) returning 1) select count(*) into n from d;
 if n>0 then perform log_act('✗','Semua pendaftar menunggu ditolak',n||' akun'); end if;
 return n; end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.reject_all_pending() from public, anon;
grant execute on function public.reject_all_pending() to authenticated;
