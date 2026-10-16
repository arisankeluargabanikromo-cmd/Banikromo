-- ============================================================
-- PATCH 019 — Perbaikan integritas & konsistensi arisan (FamilyHub v3.16.1)
--  Hasil audit modul arisan setelah perubahan ke "putaran" (v3.16.0):
--   1) reopen_draw: pemenang yang dananya SUDAH DICAIRKAN bisa dibatalkan -> uang keluar ke orang yang "tidak hadir",
--      pemenang pengganti tak bisa dicairkan (sisa dana = 0). Kini ditolak sampai pencairan dibatalkan.
--   2) cancel_disbursement tanpa kunci (disburse_arisan & void_payment memakai kunci 'fh_disburse') -> balapan. Kini sejajar.
--   3) Putaran yang ditutup TANPA pemenang (mis. arisan ditiadakan) dihitung sebagai TUNGGAKAN semua anggota
--      (iuran_arrears, my_status) dan sebagai 0% pada rekap & matriks kepatuhan. Kini hanya putaran yang benar-benar
--      berjalan (ada pemenang sah atau ada iuran masuk) yang ditagih / direkap.
--   4) create_round memakai max(seq)+1 dari tabel putaran saja. Setelah Reset "Pengocokan Arisan" (putaran dihapus,
--      keuangan dipertahankan) nomor mulai dari 1 lagi sehingga kunci 'P001' bentrok dengan iuran/pencairan lama:
--      iuran lama otomatis tampak "lunas" di putaran baru. Kini nomor berikutnya melewati kunci yang sudah dipakai.
--   5) Pesan & log arisan memakai kunci mentah ('P003') -> kini 'Putaran 3' (confirm/absent/reopen/recall/void_payment).
-- Aman dijalankan berulang. Prasyarat: patch-018.
-- ============================================================

-- Putaran yang benar-benar berjalan: ada pemenang sah, atau ada iuran putaran yang masuk.
create or replace function public.round_held(p text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from draws where period=p and status='sah')
     or exists(select 1 from payments y join fee_types f on f.id=y.fee_type_id where y.period=p and f.schedule='putaran') $$;
revoke execute on function public.round_held(text) from public, anon, authenticated;

-- Nomor putaran berikutnya: tidak boleh memakai kunci 'Pnnn' yang masih dipakai iuran, pencairan, atau kocokan.
create or replace function public._next_round_seq() returns int language sql stable security definer set search_path=public as $$
 select greatest(
   coalesce((select max(seq) from arisan_rounds),0),
   coalesce((select max(substr(period,2)::int) from payments where period ~ '^P\d{3,6}$'),0),
   coalesce((select max(substr(period,2)::int) from draws where period ~ '^P\d{3,6}$'),0),
   coalesce((select max(substr(period,2)::int) from transactions where period ~ '^P\d{3,6}$'),0))+1 $$;
revoke execute on function public._next_round_seq() from public, anon, authenticated;

-- ---------- create_round: nomor bebas bentrok ----------
create or replace function public.create_round(p_title text default null,p_held_on date default null,p_place text default null,p_requested_by bigint default null,p_note text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare t text:=nullif(trim(p_title),''); pl text:=nullif(trim(p_place),''); nt text:=nullif(trim(p_note),''); s int; k text; who text; rid bigint;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_run_draw'));
 perform _round_check(t,p_held_on,pl,nt,p_requested_by);
 select name into who from profiles where id=auth.uid();
 s:=_next_round_seq();
 k:='P'||lpad(s::text,3,'0');
 insert into arisan_rounds(seq,period,title,status,held_on,place,requested_by,note,created_by) values(s,k,t,'rencana',p_held_on,pl,p_requested_by,nt,coalesce(who,'admin')) returning id into rid;
 perform log_act('📅','Putaran arisan '||s||' dijadwalkan',coalesce(to_char(p_held_on,'DD-MM-YYYY'),'tanggal belum pasti')||coalesce(' • '||pl,'')||coalesce(' • '||t,''));
 return jsonb_build_object('id',rid,'seq',s,'period',k);
end $$;

-- ---------- Tunggakan hanya untuk putaran yang benar-benar berjalan ----------
create or replace function public.iuran_arrears(p_type smallint default null,p_include_current boolean default false) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform need_approved();
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.type_id) from (
  select m.id member_id,m.name,m.phone,f.id type_id,f.name type_name,f.amount,f.schedule,
         array_agg(g.period order by g.ord) periods,count(*)::int n,(count(*)*f.amount)::bigint total
  from fee_types f cross join members m
  cross join lateral (
    select to_char(d,'YYYY-MM') period,to_char(d,'YYYY-MM') ord,extract(year from d)::int yr
      from generate_series(to_date(f.start_period||'-01','YYYY-MM-DD'),
           to_date(calendar_period()||'-01','YYYY-MM-DD')-case when p_include_current then interval '0 month' else interval '1 month' end,interval '1 month') d
     where f.schedule='bulanan'
    union all
    select r.period,lpad(r.seq::text,8,'0'),extract(year from round_ref(r))::int
      from arisan_rounds r where f.schedule='putaran' and ((r.status='selesai' and round_held(r.period)) or (p_include_current and r.status='aktif')) and to_char(round_ref(r),'YYYY-MM')>=f.start_period) g
  where f.active and m.active=1 and (p_type is null or f.id=p_type) and g.yr>=coalesce(m.joined,0)
    and not exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=f.id and y.period=g.period)
  group by m.id,m.name,m.phone,f.id,f.name,f.amount,f.schedule) r),'[]'::jsonb);
end $$;

create or replace function public.my_status() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare pr profiles; m members; cur text:=cur_period(); cal text:=calendar_period();
begin
 perform need_approved();
 select * into pr from profiles where id=auth.uid();
 if pr.member_id is not null then select * into m from members where id=pr.member_id; end if;
 if m.id is null then return jsonb_build_object('linked',false,'name',pr.name); end if;
 return jsonb_build_object('linked',true,'period',cur,'round',round_info(cur),'rounds',rounds_brief(),
  'member',jsonb_build_object('id',m.id,'name',m.name,'relation',m.relation,'active',m.active=1),
  'types',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'amount',f.amount,'fund',f.fund,'schedule',f.schedule,'required_for_draw',f.required_for_draw,
        'paid_now',exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=f.id and y.period=fee_key(f.id,cur)),
        'arrears',a.n,'arrears_total',a.n::bigint*f.amount,'arrears_periods',to_jsonb(a.ps)) order by f.sort,f.id)
     from fee_types f
     cross join lateral (select count(*)::int n,coalesce(array_agg(g.period order by g.ord),'{}'::text[]) ps from (
          select to_char(d,'YYYY-MM') period,to_char(d,'YYYY-MM') ord,extract(year from d)::int yr
            from generate_series(to_date(f.start_period||'-01','YYYY-MM-DD'),to_date(cal||'-01','YYYY-MM-DD')-interval '1 month',interval '1 month') d where f.schedule='bulanan'
          union all
          select r.period,lpad(r.seq::text,8,'0'),extract(year from round_ref(r))::int from arisan_rounds r
           where f.schedule='putaran' and r.status='selesai' and round_held(r.period) and to_char(round_ref(r),'YYYY-MM')>=f.start_period) g
        where m.active=1 and g.yr>=coalesce(m.joined,0)
          and not exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=f.id and y.period=g.period)) a
     where f.active),'[]'::jsonb),
  'can_draw',m.active=1 and cur is not null and not exists(select 1 from fee_types f where f.active and f.required_for_draw
        and not exists(select 1 from payments y where y.member_id=m.id and y.period=fee_key(f.id,cur) and y.fee_type_id=f.id)),
  'recent',coalesce((select jsonb_agg(x.r order by x.ord desc) from (select y.paid_at ord,jsonb_build_object('period',y.period,'type',f.name,'schedule',f.schedule,'amount',y.amount,'paid_at',y.paid_at,'method',y.method,'receipt_no',y.receipt_no) r
        from payments y join fee_types f on f.id=y.fee_type_id where y.member_id=m.id order by y.paid_at desc,y.id desc limit 12) x),'[]'::jsonb),
  'won',coalesce((select jsonb_agg(jsonb_build_object('period',d.period,'at',d.at) order by d.id desc) from draws d where d.winner_id=m.id and d.status='sah'),'[]'::jsonb));
end $$;

create or replace function public.compliance_matrix(p_year int,p_type smallint) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare f fee_types; cal text:=calendar_period(); cols jsonb; keys text[];
begin
 perform need_approved();
 select * into f from fee_types where id=p_type; if not found then raise exception 'Jenis iuran tidak ditemukan'; end if;
 if f.schedule='putaran' then
  select coalesce(jsonb_agg(jsonb_build_object('key',x.period,'seq',x.seq,'title',x.title,'held_on',x.held_on,'ref',x.ref,'status',x.status) order by x.ref,x.seq),'[]'::jsonb),
         coalesce(array_agg(x.period order by x.ref,x.seq),'{}'::text[]) into cols,keys
  from (select r.period,r.seq,r.title,r.held_on,r.status,round_ref(r) ref from arisan_rounds r
        where (r.status='aktif' or (r.status='selesai' and round_held(r.period))) and extract(year from round_ref(r))::int=p_year and to_char(round_ref(r),'YYYY-MM')>=f.start_period) x;
  return jsonb_build_object('schedule','putaran','cols',cols,'rows',coalesce((select jsonb_agg(jsonb_build_object('member_id',m.id,'name',m.name,'m',(
     select coalesce(string_agg(case when p_year<coalesce(m.joined,0) then '-'
         when exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=p_type and y.period=u.k) then '1' else '0' end,'' order by u.o),'')
     from unnest(keys) with ordinality u(k,o))) order by m.name) from members m where m.active=1),'[]'::jsonb));
 end if;
 return jsonb_build_object('schedule','bulanan',
  'cols',(select jsonb_agg(jsonb_build_object('key',p_year::text||'-'||lpad(g::text,2,'0')) order by g) from generate_series(1,12) g),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('member_id',m.id,'name',m.name,'m',(
     select string_agg(case when per<f.start_period or per>cal or substr(per,1,4)::int<coalesce(m.joined,0) then '-'
                            when exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=p_type and y.period=per) then '1' else '0' end,'' order by g)
     from generate_series(1,12) g cross join lateral (select p_year::text||'-'||lpad(g::text,2,'0') per) q)) order by m.name) from members m where m.active=1),'[]'::jsonb));
end $$;

create or replace function public.iuran_recap(p_from text,p_to text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform need_approved();
 if p_from !~ '^\d{4}-\d{2}$' or p_to !~ '^\d{4}-\d{2}$' then raise exception 'Periode tidak valid'; end if;
 if to_date(p_to||'-01','YYYY-MM-DD')-to_date(p_from||'-01','YYYY-MM-DD')>1100 then raise exception 'Rentang maksimal 36 bulan'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.d,r.seq nulls first,r.type_id) from (
  select g.period,f.id type_id,f.code,f.name,f.amount,f.schedule,null::int seq,null::text title,null::date held_on,to_date(g.period||'-01','YYYY-MM-DD') d,
    (select count(*) from members m where m.active=1 and substr(g.period,1,4)::int>=coalesce(m.joined,0))::int members,
    (select count(*) from payments y join members m on m.id=y.member_id and m.active=1 where y.fee_type_id=f.id and y.period=g.period)::int paid,
    coalesce((select sum(y.amount) from payments y where y.fee_type_id=f.id and y.period=g.period),0)::bigint realized
  from fee_types f
  cross join lateral (select to_char(x,'YYYY-MM') period from generate_series(to_date(p_from||'-01','YYYY-MM-DD'),to_date(p_to||'-01','YYYY-MM-DD'),interval '1 month') x) g
  where f.active and f.schedule='bulanan' and g.period>=f.start_period
  union all
  select r.period,f.id,f.code,f.name,f.amount,f.schedule,r.seq,r.title,r.held_on,round_ref(r),
    (select count(*) from members m where m.active=1 and extract(year from round_ref(r))::int>=coalesce(m.joined,0))::int,
    (select count(*) from payments y join members m on m.id=y.member_id and m.active=1 where y.fee_type_id=f.id and y.period=r.period)::int,
    coalesce((select sum(y.amount) from payments y where y.fee_type_id=f.id and y.period=r.period),0)::bigint
  from fee_types f cross join arisan_rounds r
  where f.active and f.schedule='putaran' and (r.status='aktif' or (r.status='selesai' and round_held(r.period)))
    and to_char(round_ref(r),'YYYY-MM') between p_from and p_to and to_char(round_ref(r),'YYYY-MM')>=f.start_period) r),'[]'::jsonb);
end $$;

-- ---------- Pengocokan & pencairan: pagar integritas + label putaran ----------
create or replace function public.confirm_draw(p_id bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare d draws;
begin
 perform need_admin();
 update draws set status='sah' where id=p_id and status='menunggu' returning * into d;
 if not found then raise exception 'Pemenang ini sudah tidak menunggu konfirmasi'; end if;
 perform log_act('⚡','Pemenang arisan '||period_label(d.period)||': '||d.winner_name, case when d.attempt>1 then 'kocokan ke-'||d.attempt else 'kocokan pertama' end);
 return to_jsonb(d);
end $$;

create or replace function public.absent_draw(p_id bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare d draws;
begin
 perform need_admin();
 update draws set status='tidak_hadir' where id=p_id and status='menunggu' returning * into d;
 if not found then raise exception 'Pemenang ini sudah tidak menunggu konfirmasi'; end if;
 perform log_act('✗',d.winner_name||' tidak hadir, pengocokan diulang',period_label(d.period));
 return jsonb_build_object('remaining',(select count(*) from eligible_members(d.period)));
end $$;

create or replace function public.reopen_draw() returns jsonb language plpgsql security definer set search_path=public as $$
declare d draws; p text:=cur_period();
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_disburse'));      -- sejajar dengan disburse_arisan / cancel_disbursement
 if p is null then raise exception 'Belum ada putaran arisan aktif'; end if;
 if exists(select 1 from transactions where category='Pencairan Arisan' and period=p) then
  raise exception 'Dana % sudah dicairkan ke pemenang. Batalkan pencairannya dulu (menu Keuangan) sebelum mengganti pemenang.',period_label(p); end if;
 update draws set status='tidak_hadir' where period=p and status='sah' returning * into d;
 if not found then raise exception 'Belum ada pemenang sah pada putaran ini'; end if;
 perform log_act('↩',d.winner_name||' dibatalkan sebagai pemenang (tidak hadir), pengocokan dibuka lagi',period_label(p));
 return jsonb_build_object('remaining',(select count(*) from eligible_members(d.period)));
end $$;

create or replace function public.recall_absent() returns int language plpgsql security definer set search_path=public as $$
declare n int; p text:=cur_period();
begin
 perform need_admin();
 if p is null then raise exception 'Belum ada putaran arisan aktif'; end if;
 update draws set status='dipanggil' where period=p and status='tidak_hadir';
 get diagnostics n=row_count;
 if n=0 then raise exception 'Tidak ada peserta tidak hadir yang bisa dipanggil ulang'; end if;
 perform log_act('↺',n||' peserta tidak hadir dipanggil ulang',period_label(p));
 return n;
end $$;

create or replace function public.cancel_disbursement(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare t transactions;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_disburse'));
 delete from transactions where id=p_id and category='Pencairan Arisan' returning * into t;
 if not found then raise exception 'Pencairan tidak ditemukan'; end if;
 perform log_act('↩','Pencairan arisan dibatalkan: '||t.description,'Rp '||to_char(t.amount,'FM999G999G999'));
end $$;

create or replace function public.void_payment(p_id bigint,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare y payments; f fee_types; m members; coll bigint; disb bigint;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_disburse'));
 select * into y from payments where id=p_id; if not found then raise exception 'Pembayaran tidak ditemukan'; end if;
 select * into f from fee_types where id=y.fee_type_id; select * into m from members where id=y.member_id;
 if f.fund='arisan' then
  select coalesce(sum(p.amount),0) into coll from payments p join fee_types t on t.id=p.fee_type_id where p.period=y.period and t.fund='arisan';
  select coalesce(sum(amount),0) into disb from transactions where category='Pencairan Arisan' and period=y.period;
  if coll-y.amount<disb then raise exception 'Dana arisan % sudah dicairkan. Batalkan pencairannya terlebih dahulu.',period_label(y.period); end if;
 end if;
 delete from payments where id=p_id;
 perform log_act('✗','Pembayaran dibatalkan: '||y.receipt_no||' • '||m.name,coalesce(nullif(trim(p_reason),''),'tanpa keterangan')||' • Rp '||to_char(y.amount,'FM999G999G999'));
end $$;

revoke execute on function public.confirm_draw(bigint), public.absent_draw(bigint), public.reopen_draw(), public.recall_absent(),
  public.cancel_disbursement(bigint), public.void_payment(bigint,text), public.create_round(text,date,text,bigint,text),
  public.iuran_arrears(smallint,boolean), public.my_status(), public.compliance_matrix(int,smallint), public.iuran_recap(text,text) from public, anon;
grant execute on function public.confirm_draw(bigint), public.absent_draw(bigint), public.reopen_draw(), public.recall_absent(),
  public.cancel_disbursement(bigint), public.void_payment(bigint,text), public.create_round(text,date,text,bigint,text),
  public.iuran_arrears(smallint,boolean), public.my_status(), public.compliance_matrix(int,smallint), public.iuran_recap(text,text) to authenticated;
