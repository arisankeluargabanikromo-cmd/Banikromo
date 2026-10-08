-- ============================================================
-- PATCH 005 — Pengocokan: konfirmasi kehadiran & kocok ulang (FamilyHub v2.5)
-- Jalankan SEKALI di SQL Editor Supabase untuk instalasi yang SUDAH berjalan.
-- (Instalasi baru cukup menjalankan schema.sql terbaru; patch ini tidak perlu.)
-- Data undian lama aman: semua baris lama otomatis berstatus 'sah'.
-- ============================================================
alter table public.draws add column if not exists status text not null default 'sah';
alter table public.draws add column if not exists attempt int not null default 1;
alter table public.draws drop constraint if exists draws_status_chk;
alter table public.draws add constraint draws_status_chk check (status in('menunggu','sah','tidak_hadir','dipanggil'));
alter table public.draws drop constraint if exists draws_period_key;   -- dulu: 1 baris per periode
create unique index if not exists draws_period_aktif on public.draws(period) where status in('menunggu','sah');

-- Alur: run_draw() -> status 'menunggu' -> confirm_draw() = 'sah'  ATAU  absent_draw() = 'tidak_hadir' lalu kocok ulang.
-- Setiap kocokan (termasuk yang tidak hadir) tercatat sebagai bukti. Yang tidak hadir hanya dilewati di periode itu
-- dan TIDAK dianggap sudah menang, sehingga masih bisa menang di periode berikutnya.
create or replace function public.eligible_members(p text) returns table(id bigint,name text) language sql stable security definer set search_path=public as $$
 select m.id,m.name from members m where m.active=1 and exists(select 1 from payments y where y.member_id=m.id and y.period=p)
 and not exists(select 1 from draws d where d.winner_id=m.id and (
       (d.status='sah' and d.cycle=cfg('cycle')::int)
    or (d.status in('menunggu','tidak_hadir') and d.period=p)))
 order by m.id $$;

create or replace function public.draw_state() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('period',cur_period(),'cycle',cfg('cycle')::int,
  'eligible',coalesce((select jsonb_agg(to_jsonb(e)) from eligible_members(cur_period()) e),'[]'::jsonb),
  'unpaid',(select count(*) from members m where m.active=1 and not exists(select 1 from payments y where y.member_id=m.id and y.period=cur_period())),
  'winner',(select to_jsonb(d) from draws d where d.period=cur_period() and d.status='sah'),
  'pending',(select to_jsonb(d) from draws d where d.period=cur_period() and d.status='menunggu'),
  'absent',coalesce((select jsonb_agg(jsonb_build_object('id',d.winner_id,'name',d.winner_name,'attempt',d.attempt) order by d.id) from draws d where d.period=cur_period() and d.status='tidak_hadir'),'[]'::jsonb),
  'attempts',(select count(*) from draws d where d.period=cur_period()),
  'history',coalesce((select jsonb_agg(to_jsonb(d) order by d.id desc) from draws d),'[]'::jsonb)) $$;

create or replace function public.run_draw() returns jsonb language plpgsql security definer set search_path=public as $$
declare p text:=cur_period(); w record; ids text; n int; proof text; at_ timestamptz:=now(); att int; did bigint;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_run_draw'));   -- cegah dua pengocokan bersamaan
 if exists(select 1 from draws where period=p and status='sah') then raise exception 'Pengundian periode % sudah disahkan',p; end if;
 if exists(select 1 from draws where period=p and status='menunggu') then raise exception 'Masih ada pemenang yang menunggu konfirmasi kehadiran'; end if;
 select count(*),(to_jsonb(array_agg(e.id order by e.id)))::text into n,ids from eligible_members(p) e;
 if n=0 then raise exception 'Tidak ada peserta eligible (belum bayar, sudah menang di siklus ini, atau semua dilewati karena tidak hadir)'; end if;
 select e.id,e.name into w from eligible_members(p) e order by gen_random_uuid() limit 1;  -- acak kriptografis (UUID v4)
 select count(*)+1 into att from draws where period=p;
 proof:=encode(sha256(convert_to(p||'|'||at_::text||'|'||ids||'|'||w.id||'|'||gen_random_uuid()::text,'UTF8')),'hex');
 insert into draws(cycle,period,at,participants,winner_id,winner_name,proof,status,attempt)
  values(cfg('cycle')::int,p,at_,ids,w.id,w.name,proof,'menunggu',att) returning id into did;
 return jsonb_build_object('id',did,'attempt',att,'pool',n,'winner',jsonb_build_object('id',w.id,'name',w.name),'at',at_,'proof',proof);
end $$;

create or replace function public.confirm_draw(p_id bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare d draws;
begin
 perform need_admin();
 update draws set status='sah' where id=p_id and status='menunggu' returning * into d;
 if not found then raise exception 'Pemenang ini sudah tidak menunggu konfirmasi'; end if;
 perform log_act('⚡','Pemenang arisan '||d.period||': '||d.winner_name, case when d.attempt>1 then 'kocokan ke-'||d.attempt else 'kocokan pertama' end);
 return to_jsonb(d);
end $$;

create or replace function public.absent_draw(p_id bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare d draws;
begin
 perform need_admin();
 update draws set status='tidak_hadir' where id=p_id and status='menunggu' returning * into d;
 if not found then raise exception 'Pemenang ini sudah tidak menunggu konfirmasi'; end if;
 perform log_act('✗',d.winner_name||' tidak hadir, pengocokan diulang','arisan '||d.period);
 return jsonb_build_object('remaining',(select count(*) from eligible_members(d.period)));
end $$;

create or replace function public.reopen_draw() returns jsonb language plpgsql security definer set search_path=public as $$
declare d draws;
begin
 perform need_admin();
 -- pemenang yang sudah disahkan ternyata tidak hadir: tandai tidak hadir (jejak tetap ada) lalu buka kocok ulang
 update draws set status='tidak_hadir' where period=cur_period() and status='sah' returning * into d;
 if not found then raise exception 'Belum ada pemenang sah pada periode ini'; end if;
 perform log_act('↩',d.winner_name||' dibatalkan sebagai pemenang (tidak hadir), pengocokan dibuka lagi','arisan '||d.period);
 return jsonb_build_object('remaining',(select count(*) from eligible_members(d.period)));
end $$;

create or replace function public.recall_absent() returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
 perform need_admin();
 update draws set status='dipanggil' where period=cur_period() and status='tidak_hadir';
 get diagnostics n=row_count;
 if n=0 then raise exception 'Tidak ada peserta tidak hadir yang bisa dipanggil ulang'; end if;
 perform log_act('↺',n||' peserta tidak hadir dipanggil ulang','arisan '||cur_period());
 return n;
end $$;

create or replace function public.new_cycle() returns void language plpgsql security definer set search_path=public as $$
begin perform need_admin();
 if exists(select 1 from draws where status='menunggu') then raise exception 'Selesaikan dulu konfirmasi pemenang yang sedang menunggu'; end if;
 update settings set v=(v::int+1)::text where k='cycle'; perform log_act('↻','Siklus arisan baru dimulai'); end $$;

-- Hak akses: hanya pengguna login (admin dicek di dalam fungsi).
revoke execute on function public.eligible_members(text), public.draw_state(), public.run_draw(), public.confirm_draw(bigint),
  public.absent_draw(bigint), public.reopen_draw(), public.recall_absent(), public.new_cycle() from public, anon;
grant execute on function public.eligible_members(text), public.draw_state(), public.run_draw(), public.confirm_draw(bigint),
  public.absent_draw(bigint), public.reopen_draw(), public.recall_absent(), public.new_cycle() to authenticated;
