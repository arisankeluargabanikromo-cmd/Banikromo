-- ============================================================
-- PATCH 013 — Portal anggota "Iuran Saya" (FamilyHub v3.12)
--  Admin menghubungkan sebuah akun ke satu anggota keluarga. Pemilik akun lalu melihat status iuran, tunggakan,
--  riwayat & nomor kuitansi, dan riwayat kemenangan arisan MILIKNYA SENDIRI lewat my_status().
--  Hubungan hanya bisa diubah admin (kolom profiles tidak bisa diubah pengguna biasa) dan tercatat di jejak audit.
-- Aman dijalankan berulang. Prasyarat: patch-011.
-- ============================================================

alter table public.profiles add column if not exists member_id bigint references public.members(id) on delete set null;
create unique index if not exists profiles_member_uidx on public.profiles(member_id) where member_id is not null;   -- satu anggota = satu akun

-- Jejak audit: perubahan hubungan akun↔anggota juga dicatat (selain peran & persetujuan)
create or replace function public.trg_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare o jsonb:=case when tg_op<>'INSERT' then to_jsonb(old) end; n jsonb:=case when tg_op<>'DELETE' then to_jsonb(new) end;
begin
 if coalesce(current_setting('fh.skip_recalc',true),'')='1' then return null; end if;
 if tg_table_name='profiles' and tg_op='UPDATE' and o->>'role'=n->>'role' and o->>'approved'=n->>'approved'
    and (o->>'member_id') is not distinct from (n->>'member_id') then return null; end if;
 insert into audit_log(actor,actor_name,tbl,op,row_id,old_row,new_row)
  values(auth.uid(),(select name from profiles where id=auth.uid()),tg_table_name,tg_op,coalesce(n->>'id',o->>'id'),o,n);
 return null; end $$;

create or replace function public.link_member(p_user uuid,p_member bigint) returns void language plpgsql security definer set search_path=public as $$
declare nm text; mn text;
begin
 perform need_admin();
 if not exists(select 1 from profiles where id=p_user) then raise exception 'Pengguna tidak ditemukan'; end if;
 if p_member is not null then
  select name into mn from members where id=p_member;
  if not found then raise exception 'Anggota tidak ditemukan'; end if;
  if exists(select 1 from profiles where member_id=p_member and id<>p_user) then raise exception 'Anggota ini sudah dihubungkan ke akun lain'; end if;
 end if;
 update profiles set member_id=p_member where id=p_user returning name into nm;
 perform log_act('🔗',case when p_member is null then 'Akun dilepas dari anggota' else 'Akun dihubungkan ke anggota' end,coalesce(nm,'?')||coalesce(' → '||mn,''));
end $$;

create or replace function public.list_users() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform need_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',u.email,'role',p.role,'approved',p.approved,'created_at',u.created_at,
          'member_id',p.member_id,'member_name',mm.name) order by p.approved,u.created_at desc)
        from profiles p join auth.users u on u.id=p.id left join members mm on mm.id=p.member_id),'[]'::jsonb); end $$;

-- Status iuran milik pemanggil. Hanya data anggota yang terhubung ke akunnya.
create or replace function public.my_status() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare pr profiles; m members; cur text:=cur_period();
begin
 perform need_approved();
 select * into pr from profiles where id=auth.uid();
 if pr.member_id is not null then select * into m from members where id=pr.member_id; end if;
 if m.id is null then return jsonb_build_object('linked',false,'name',pr.name); end if;
 return jsonb_build_object('linked',true,'period',cur,
  'member',jsonb_build_object('id',m.id,'name',m.name,'relation',m.relation,'active',m.active=1),
  'types',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'amount',f.amount,'fund',f.fund,'required_for_draw',f.required_for_draw,
        'paid_now',exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=f.id and y.period=cur),
        'arrears',a.n,'arrears_total',a.n::bigint*f.amount,'arrears_periods',to_jsonb(a.ps)) order by f.sort,f.id)
     from fee_types f
     cross join lateral (select count(*)::int n,coalesce(array_agg(g.period order by g.period),'{}'::text[]) ps
        from (select to_char(d,'YYYY-MM') period from generate_series(to_date(f.start_period||'-01','YYYY-MM-DD'),to_date(cur||'-01','YYYY-MM-DD')-interval '1 month',interval '1 month') d) g
        where m.active=1 and substr(g.period,1,4)::int>=coalesce(m.joined,0)
          and not exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=f.id and y.period=g.period)) a
     where f.active),'[]'::jsonb),
  'can_draw',m.active=1 and not exists(select 1 from fee_types f where f.active and f.required_for_draw
        and not exists(select 1 from payments y where y.member_id=m.id and y.period=cur and y.fee_type_id=f.id)),
  'recent',coalesce((select jsonb_agg(x.r order by x.ord desc) from (select y.paid_at ord,jsonb_build_object('period',y.period,'type',f.name,'amount',y.amount,'paid_at',y.paid_at,'method',y.method,'receipt_no',y.receipt_no) r
        from payments y join fee_types f on f.id=y.fee_type_id where y.member_id=m.id order by y.paid_at desc,y.id desc limit 12) x),'[]'::jsonb),
  'won',coalesce((select jsonb_agg(jsonb_build_object('period',d.period,'at',d.at) order by d.id desc) from draws d where d.winner_id=m.id and d.status='sah'),'[]'::jsonb));
end $$;

revoke execute on function public.link_member(uuid,bigint), public.my_status(), public.list_users() from public, anon;
grant execute on function public.link_member(uuid,bigint), public.my_status(), public.list_users() to authenticated;
