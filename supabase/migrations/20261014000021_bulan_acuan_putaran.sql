-- ============================================================
-- PATCH 021 — Iuran Wajib tidak lagi "terbawa" dari putaran lama ke putaran baru
--  Masalah: Iuran Wajib bersifat bulanan, dan bulannya dihitung dari putaran yang sedang dilihat (ref_month).
--  Putaran baru TANPA tanggal jatuh ke bulan kalender (atau bulan dibukanya), dan putaran bertanggal di bulan yang sama
--  dengan putaran sebelumnya memakai bulan yang sama -> pembayaran Iuran Wajib putaran lama langsung tampil "Lunas"
--  di putaran baru, ikut dihitung lolos syarat kocok, dan tidak pernah ditagih untuk periode barunya.
--  Perbaikan:
--   1) Kolom arisan_rounds.ref_month: bulan acuan Iuran Wajib DISIMPAN per putaran (tidak berubah-ubah mengikuti kalender).
--   2) Putaran baru / tanpa tanggal otomatis mendapat bulan SESUDAH bulan acuan putaran sebelumnya (tidak pernah mundur
--      dari bulan kalender). Putaran bertanggal memakai bulan tanggalnya.
--   3) Putaran yang sudah ada DIBEKUKAN pada bulan yang berlaku sekarang (tampilan & syarat kocok lama tidak bergeser);
--      putaran 'rencana' dihitung berurutan dengan aturan baru.
--   4) update_round: tanggal diisi -> bulan mengikuti tanggal; tanggal tetap kosong -> bulan yang sudah tersimpan dipertahankan.
-- Aman dijalankan berulang. Prasyarat: patch-020.
-- ============================================================

alter table public.arisan_rounds add column if not exists ref_month text;
alter table public.arisan_rounds drop constraint if exists arisan_rounds_ref_month_check;
alter table public.arisan_rounds add constraint arisan_rounds_ref_month_check check(ref_month is null or ref_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- Bulan acuan untuk putaran yang belum punya tanggal: sesudah bulan acuan putaran lain yang belum dibatalkan, minimal bulan kalender.
create or replace function public._next_ref_month(p_exclude bigint default null) returns text language sql stable security definer set search_path=public as $$
 select to_char(greatest(date_trunc('month',(now() at time zone 'Asia/Jakarta'))::date,
   coalesce((select (to_date(max(ref_month)||'-01','YYYY-MM-DD')+interval '1 month')::date from arisan_rounds where status<>'batal' and ref_month is not null and id is distinct from p_exclude),date '2000-01-01')),'YYYY-MM') $$;
revoke execute on function public._next_ref_month(bigint) from public, anon, authenticated;

-- Bulan acuan putaran: nilai tersimpan; (data lama / hasil Restore) tanggal pelaksanaan -> kunci lama 'YYYY-MM' -> bulan dibuka -> bulan kalender.
create or replace function public.ref_month(p text) returns text language sql stable set search_path=public as $$
 select coalesce((select coalesce(r.ref_month,to_char(r.held_on,'YYYY-MM'),
                                  case when r.period ~ '^\d{4}-(0[1-9]|1[0-2])$' then r.period end,
                                  to_char(r.opened_at at time zone 'Asia/Jakarta','YYYY-MM'))
                    from arisan_rounds r where r.period=p),
                 calendar_period()) $$;

-- Bekukan putaran yang sudah ada (nilai sama dengan yang tampil sebelum patch ini).
update public.arisan_rounds r set ref_month=ref_month(r.period) where r.ref_month is null and r.status<>'rencana';
-- Putaran 'rencana' (belum ada iuran terikat): dihitung berurutan dengan aturan baru.
do $$ declare x record; begin
 for x in select id,held_on from arisan_rounds where ref_month is null and status='rencana' order by seq loop
  update arisan_rounds set ref_month=coalesce(to_char(x.held_on,'YYYY-MM'),_next_ref_month(x.id)) where id=x.id;
 end loop; end $$;

create or replace function public.rounds_brief() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('period',r.period,'seq',r.seq,'title',r.title,'status',r.status,'held_on',r.held_on,'ref',round_ref(r),'ref_month',ref_month(r.period)) order by r.seq desc),'[]'::jsonb) from arisan_rounds r $$;

create or replace function public.round_info(p text) returns jsonb language sql stable security definer set search_path=public as $$
 select (select to_jsonb(r)||jsonb_build_object('requester',(select name from members where id=r.requested_by),'ref',round_ref(r),'ref_month',ref_month(r.period)) from arisan_rounds r where r.period=p) $$;

create or replace function public.create_round(p_title text default null,p_held_on date default null,p_place text default null,p_requested_by bigint default null,p_note text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare t text:=nullif(trim(p_title),''); pl text:=nullif(trim(p_place),''); nt text:=nullif(trim(p_note),''); s int; k text; who text; rid bigint; rm text;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_run_draw'));
 perform _round_check(t,p_held_on,pl,nt,p_requested_by);
 select name into who from profiles where id=auth.uid();
 s:=_next_round_seq();
 k:='P'||lpad(s::text,3,'0');
 rm:=coalesce(to_char(p_held_on,'YYYY-MM'),_next_ref_month());
 insert into arisan_rounds(seq,period,title,status,held_on,place,requested_by,note,created_by,ref_month) values(s,k,t,'rencana',p_held_on,pl,p_requested_by,nt,coalesce(who,'admin'),rm) returning id into rid;
 perform log_act('📅','Putaran arisan '||s||' dijadwalkan',coalesce(to_char(p_held_on,'DD-MM-YYYY'),'tanggal belum pasti')||coalesce(' • '||pl,'')||coalesce(' • '||t,''));
 return jsonb_build_object('id',rid,'seq',s,'period',k,'ref_month',rm);
end $$;

create or replace function public.update_round(p_id bigint,p_title text default null,p_held_on date default null,p_place text default null,p_requested_by bigint default null,p_note text default null) returns void language plpgsql security definer set search_path=public as $$
declare t text:=nullif(trim(p_title),''); pl text:=nullif(trim(p_place),''); nt text:=nullif(trim(p_note),''); r arisan_rounds; rm text;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_run_draw'));
 select * into r from arisan_rounds where id=p_id for update; if not found then raise exception 'Putaran tidak ditemukan'; end if;
 if r.status='batal' then raise exception 'Putaran % sudah dibatalkan dan tidak bisa diubah',r.seq; end if;
 perform _round_check(t,p_held_on,pl,nt,p_requested_by);
 rm:=case when p_held_on is not null then to_char(p_held_on,'YYYY-MM')
          when r.held_on is null and r.ref_month is not null then r.ref_month      -- tetap tanpa tanggal: pertahankan bulan yang sudah tersimpan
          else _next_ref_month(p_id) end;
 update arisan_rounds set title=t,held_on=p_held_on,place=pl,requested_by=p_requested_by,note=nt,ref_month=rm where id=p_id;
 perform log_act('✎','Putaran arisan '||r.seq||' diubah',coalesce(to_char(p_held_on,'DD-MM-YYYY'),'tanggal belum pasti')||coalesce(' • '||pl,''));
end $$;
