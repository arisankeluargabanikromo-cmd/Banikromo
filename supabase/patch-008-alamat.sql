-- ============================================================
-- PATCH 008 — Alamat anggota (FamilyHub v2.9)
--   * Kolom members.address (alamat lengkap, teks bebas)
--   * Impor CSV menerima kolom "alamat"
-- Aman dijalankan berulang (idempotent). Tidak mengubah data yang ada.
-- ============================================================
alter table public.members add column if not exists address text;

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
   insert into members(name,gender,relation,birth_year,death_year,phone,spouse_status,marital_status,address)
   values(trim(r.v->>'nama'),nullif(upper(trim(r.v->>'gender')),''),nullif(trim(r.v->>'hubungan'),''),nullif(trim(r.v->>'lahir'),'')::int,nullif(trim(r.v->>'wafat'),'')::int,nullif(trim(r.v->>'telepon'),''),coalesce(nullif(lower(trim(r.v->>'status_pasangan')),''),'menikah'),nullif(lower(trim(r.v->>'marital_status')),''),nullif(trim(r.v->>'alamat'),''))
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
revoke execute on function public.import_members(jsonb) from public, anon;
grant execute on function public.import_members(jsonb) to authenticated;
