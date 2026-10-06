-- Jalankan SEKALI di SQL Editor jika schema.sql sudah pernah dijalankan sebelumnya.
-- Membuat profil otomatis bila belum ada (mis. akun dibuat sebelum skema dijalankan). Pengguna pertama = admin.
create or replace function public.ensure_profile() returns jsonb language plpgsql security definer set search_path=public as $$
declare u auth.users; p profiles;
begin
 if auth.uid() is null then raise exception 'Silakan login'; end if;
 select * into p from profiles where id=auth.uid();
 if not found then
  select * into u from auth.users where id=auth.uid();
  insert into profiles(id,name,role) values(u.id, coalesce(nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1)), case when exists(select 1 from profiles) then 'viewer' else 'admin' end) returning * into p;
 end if;
 return jsonb_build_object('name',p.name,'role',p.role);
end $$;

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
-- Buatkan profil untuk akun yang sudah ada tapi belum punya profil (akun tertua = admin)
insert into profiles(id,name,role)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'name',''),split_part(u.email,'@',1)),
       case when not exists(select 1 from profiles) and u.id=(select id from auth.users order by created_at limit 1) then 'admin' else 'viewer' end
from auth.users u where not exists(select 1 from profiles p where p.id=u.id);
