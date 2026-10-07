-- ============================================================
-- v2.3 Silsilah skala besar: jenis kelamin, pasangan, tahun lahir/wafat, generasi otomatis, impor massal.
-- Aman dijalankan berulang (idempotent).
-- ============================================================
alter table public.members add column if not exists gender text;
alter table public.members add column if not exists spouse_id bigint references public.members(id) on delete set null;
alter table public.members add column if not exists spouse_status text not null default 'menikah';
alter table public.members add column if not exists birth_year int;
alter table public.members add column if not exists death_year int;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='members_gender_chk') then alter table public.members add constraint members_gender_chk check (gender in ('L','P')); end if;
 if not exists(select 1 from pg_constraint where conname='members_spouse_status_chk') then alter table public.members add constraint members_spouse_status_chk check (spouse_status in ('menikah','cerai')); end if;
 if not exists(select 1 from pg_constraint where conname='members_years_chk') then alter table public.members add constraint members_years_chk check ((birth_year is null or birth_year between 1700 and 2200) and (death_year is null or death_year between 1700 and 2200) and (birth_year is null or death_year is null or death_year>=birth_year)); end if;
 if not exists(select 1 from pg_constraint where conname='members_self_chk') then alter table public.members add constraint members_self_chk check (parent_id is distinct from id and spouse_id is distinct from id); end if;
end $$;
create index if not exists members_parent_idx on public.members(parent_id);
create index if not exists members_spouse_idx on public.members(spouse_id);

-- Generasi dihitung otomatis dari hubungan: akar = 1, anak = orang tua + 1, pasangan yang masuk keluarga mengikuti generasi pasangannya.
create or replace function public.recalc_generations() returns void language plpgsql security definer set search_path=public as $$
begin
 with recursive t(id,g) as (
   select m.id,1 from members m where m.parent_id is null
     and not exists(select 1 from members y where y.parent_id is not null and (m.spouse_id=y.id or y.spouse_id=m.id))
   union
   select c.id, t.g+(case when c.parent_id=t.id then 1 else 0 end)
   from t join members c on c.parent_id=t.id
        or (c.parent_id is null and (c.spouse_id=t.id or exists(select 1 from members z where z.id=t.id and z.spouse_id=c.id)))
   where t.g<40)
 update members x set generation=s.g from (select id,min(g) g from t group by id) s where x.id=s.id and x.generation is distinct from s.g;
end $$;
create or replace function public.trg_recalc() returns trigger language plpgsql security definer set search_path=public as $$
begin if coalesce(current_setting('fh.skip_recalc',true),'')<>'1' then perform public.recalc_generations(); end if; return null; end $$;
drop trigger if exists members_recalc on public.members;
create trigger members_recalc after insert or delete or update of parent_id, spouse_id on public.members for each statement execute function public.trg_recalc();

-- Impor massal (khusus admin, atomik: gagal satu baris = batal semua). Tautan antar baris memakai kolom "kode".
create or replace function public.import_members(p jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r record; ids jsonb:='{}'::jsonb; arr bigint[]:='{}'; nid bigint; n int:=0; k text; o text; s text;
begin
 perform need_admin();
 if p is null or jsonb_typeof(p)<>'array' then raise exception 'Format data impor tidak valid'; end if;
 if jsonb_array_length(p)>2000 then raise exception 'Maksimal 2000 baris per impor'; end if;
 perform set_config('fh.skip_recalc','1',true);
 for r in select e.value v, e.ordinality i from jsonb_array_elements(p) with ordinality e loop
  begin
   if coalesce(trim(r.v->>'nama'),'')='' then raise exception 'nama kosong'; end if;
   k:=nullif(trim(r.v->>'kode'),'');
   if k is not null and ids ? k then raise exception 'kode "%" dipakai dua kali',k; end if;
   insert into members(name,gender,relation,birth_year,death_year,phone,spouse_status)
   values(trim(r.v->>'nama'),nullif(upper(trim(r.v->>'gender')),''),nullif(trim(r.v->>'hubungan'),''),nullif(trim(r.v->>'lahir'),'')::int,nullif(trim(r.v->>'wafat'),'')::int,nullif(trim(r.v->>'telepon'),''),coalesce(nullif(lower(trim(r.v->>'status_pasangan')),''),'menikah'))
   returning id into nid;
  exception when others then raise exception 'Baris %: %',r.i+1,sqlerrm; end;
  arr:=arr||nid; n:=n+1; if k is not null then ids:=ids||jsonb_build_object(k,nid); end if;
 end loop;
 for r in select e.value v, e.ordinality i from jsonb_array_elements(p) with ordinality e loop
  o:=nullif(trim(r.v->>'kode_ortu'),''); s:=nullif(trim(r.v->>'kode_pasangan'),'');
  if o is not null then
    if not ids ? o then raise exception 'Baris %: kode_ortu "%" tidak ditemukan',r.i+1,o; end if;
    if (ids->>o)::bigint=arr[r.i] then raise exception 'Baris %: orang tua tidak boleh diri sendiri',r.i+1; end if;
    update members set parent_id=(ids->>o)::bigint where id=arr[r.i];
  end if;
  if s is not null then
    if not ids ? s then raise exception 'Baris %: kode_pasangan "%" tidak ditemukan',r.i+1,s; end if;
    if (ids->>s)::bigint=arr[r.i] then raise exception 'Baris %: pasangan tidak boleh diri sendiri',r.i+1; end if;
    update members set spouse_id=(ids->>s)::bigint where id=arr[r.i];
  end if;
 end loop;
 perform set_config('fh.skip_recalc','0',true);
 perform public.recalc_generations();
 perform log_act('⬆','Impor anggota dari CSV',n||' orang');
 return n;
end $$;

revoke execute on function public.recalc_generations(), public.trg_recalc() from public, anon, authenticated;
revoke execute on function public.import_members(jsonb) from public, anon;
grant execute on function public.import_members(jsonb) to authenticated;
select public.recalc_generations();
