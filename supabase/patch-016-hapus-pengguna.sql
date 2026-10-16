-- ============================================================
-- PATCH 016 — Hapus pengguna (FamilyHub v3.15)
--  Admin kini bisa menghapus akun pengguna yang SUDAH aktif dari Akun & Pengguna → Kelola Pengguna.
--  (Sebelumnya hanya pendaftar yang belum disetujui yang bisa ditolak/dihapus.)
--  Aturan, dipaksa di database:
--   • hanya admin;
--   • tidak bisa menghapus akun sendiri;
--   • harus tersisa minimal satu admin;
--   • data keluarga (anggota, iuran, kas, dll.) TIDAK ikut terhapus — hanya akun & profil login-nya.
--  Tercatat di log aktivitas dan jejak audit. Aman dijalankan berulang. Prasyarat: patch-011, patch-013.
-- ============================================================

create or replace function public.delete_user(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare nm text; rl text; ok boolean; em text;
begin
 perform need_admin();
 if p_id is not distinct from auth.uid() then raise exception 'Anda tidak bisa menghapus akun Anda sendiri'; end if;
 select p.name,p.role,p.approved,u.email into nm,rl,ok,em from profiles p join auth.users u on u.id=p.id where p.id=p_id;
 if not found then raise exception 'Pengguna tidak ditemukan'; end if;
 if rl='admin' and ok and not exists(select 1 from profiles where role='admin' and approved and id<>p_id) then raise exception 'Harus ada minimal satu admin'; end if;
 delete from auth.users where id=p_id;                 -- profil ikut terhapus (cascade); anggota yang terhubung tetap ada
 perform log_act('✗','Akun pengguna dihapus: '||coalesce(nm,'?'),coalesce(em,'')||' · '||rl);
end $$;

revoke execute on function public.delete_user(uuid) from public, anon;
grant execute on function public.delete_user(uuid) to authenticated;
