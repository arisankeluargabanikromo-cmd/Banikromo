-- ============================================================
-- PATCH 017 — Ubah nama pengguna (FamilyHub v3.15)
--  Admin kini bisa mengubah nama tampilan pengguna dari Akun & Pengguna → Kelola Pengguna → Ubah.
--  (Peran dan hubungan ke anggota sudah ada: set_role, link_member.) Email/password dikelola Supabase Auth.
--  Aturan: hanya admin; nama 1–80 karakter. Tercatat di log aktivitas. Aman dijalankan berulang. Prasyarat: patch-011.
-- ============================================================

create or replace function public.rename_user(p_id uuid, p_name text) returns void language plpgsql security definer set search_path=public as $$
declare nm text:=left(trim(coalesce(p_name,'')),80); old text;
begin
 perform need_admin();
 if nm='' then raise exception 'Nama tidak boleh kosong'; end if;
 select name into old from profiles where id=p_id;
 if not found then raise exception 'Pengguna tidak ditemukan'; end if;
 if old=nm then return; end if;
 update profiles set name=nm where id=p_id;
 perform log_act('✎','Nama pengguna diubah',old||' → '||nm);
end $$;

revoke execute on function public.rename_user(uuid,text) from public, anon;
grant execute on function public.rename_user(uuid,text) to authenticated;
