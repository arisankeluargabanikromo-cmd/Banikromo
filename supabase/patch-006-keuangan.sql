-- ============================================================
-- PATCH 006 — Keuangan profesional (FamilyHub v2.6)
--   * Dua jenis iuran: Iuran Arisan & Iuran Wajib (tarif, dana, syarat kocok bisa diatur)
--   * Dua dana terpisah: Dana Arisan (titipan) & Kas Wajib (milik bersama)
--   * Kuitansi bernomor, metode bayar, pembatalan bertanda alasan
--   * Tunggakan per anggota/bulan, pelunasan beberapa bulan sekaligus
--   * Pencairan arisan ke pemenang (tercatat sebagai pengeluaran Dana Arisan)
--   * Fungsi laporan: posisi kas, rincian kategori, realisasi iuran, buku kas, kepatuhan
-- Jalankan SEKALI di SQL Editor Supabase (aman diulang). Data lama tetap utuh:
--   semua pembayaran lama otomatis menjadi "Iuran Arisan"; transaksi manual lama masuk "Kas Wajib"
--   (ubah dana/kategorinya lewat Keuangan → Buku Kas → Ubah bila perlu).
-- Prasyarat: schema.sql dan patch-005 sudah dijalankan.
-- ============================================================

-- ---------- 1. Jenis iuran ----------
create table if not exists public.fee_types(
  id smallint primary key,
  code text not null unique,
  name text not null,
  amount int not null check(amount>0),
  fund text not null check(fund in('arisan','kas')),
  required_for_draw boolean not null default false,
  active boolean not null default true,
  start_period text not null check(start_period ~ '^\d{4}-\d{2}$'),
  sort int not null default 0);

insert into public.fee_types(id,code,name,amount,fund,required_for_draw,active,start_period,sort)
 select 1,'arisan','Iuran Arisan',coalesce(nullif((select v from settings where k='iuran'),'')::int,350000),'arisan',true,true,
        coalesce((select min(period) from payments),public.cur_period()),1
 on conflict(id) do nothing;
insert into public.fee_types(id,code,name,amount,fund,required_for_draw,active,start_period,sort)
 values(2,'wajib','Iuran Wajib',50000,'kas',false,true,public.cur_period(),2)
 on conflict(id) do nothing;

-- pencairan arisan hanya dilacak mulai periode ini (periode lama dianggap sudah diselesaikan di luar sistem)
insert into public.settings(k,v) values('disburse_from',public.cur_period()) on conflict(k) do nothing;
insert into public.settings(k,v) values('org_name','Arisan Keluarga'),('treasurer_name',''),('chair_name','') on conflict(k) do nothing;

alter table public.fee_types enable row level security;
drop policy if exists "baca" on public.fee_types;        create policy "baca" on public.fee_types for select to authenticated using (true);
drop policy if exists "admin tulis" on public.fee_types; create policy "admin tulis" on public.fee_types for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- 2. Pembayaran: jenis iuran, metode, nomor kuitansi ----------
alter table public.payments add column if not exists fee_type_id smallint not null default 1 references public.fee_types(id);
alter table public.payments add column if not exists method text not null default 'Tunai';
alter table public.payments add column if not exists receipt_no text;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='payments_method_chk') then
  alter table public.payments add constraint payments_method_chk check(method in('Tunai','Transfer','Lainnya')); end if;
end $$;
alter table public.payments drop constraint if exists payments_member_id_period_key;      -- dulu: 1 iuran per anggota per periode
create unique index if not exists payments_uniq on public.payments(member_id,period,fee_type_id);
create index if not exists payments_period_idx on public.payments(period,fee_type_id);

create or replace function public.trg_payment_receipt() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.receipt_no is null then
  new.receipt_no:=upper((select code from fee_types where id=new.fee_type_id))||'-'||to_char(new.paid_at at time zone 'Asia/Jakarta','YYMM')||'-'||lpad(new.id::text,5,'0');
 end if; return new; end $$;
drop trigger if exists payment_receipt on public.payments;
create trigger payment_receipt before insert on public.payments for each row execute function public.trg_payment_receipt();
update public.payments p set receipt_no=upper(f.code)||'-'||to_char(p.paid_at at time zone 'Asia/Jakarta','YYMM')||'-'||lpad(p.id::text,5,'0') from public.fee_types f where f.id=p.fee_type_id and p.receipt_no is null;
create unique index if not exists payments_receipt_uniq on public.payments(receipt_no);

-- ---------- 3. Transaksi: dana, kategori, periode ----------
alter table public.transactions add column if not exists fund text not null default 'kas';
alter table public.transactions add column if not exists category text;
alter table public.transactions add column if not exists period text;
alter table public.transactions add column if not exists member_id bigint references public.members(id) on delete set null;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='transactions_fund_chk') then
  alter table public.transactions add constraint transactions_fund_chk check(fund in('arisan','kas')); end if;
end $$;
create index if not exists tx_date_idx on public.transactions(date,id);
create index if not exists tx_fund_idx on public.transactions(fund,date);

create or replace function public.trg_tx_fill() returns trigger language plpgsql security definer set search_path=public as $$
declare p record;
begin
 if new.payment_id is not null then      -- transaksi dari pembayaran iuran: dana/kategori mengikuti jenis iurannya
  select y.member_id,y.period,f.fund,f.name into p from payments y join fee_types f on f.id=y.fee_type_id where y.id=new.payment_id;
  if found then new.fund:=p.fund; new.category:=coalesce(new.category,p.name); new.period:=p.period; new.member_id:=p.member_id; end if;
 end if;
 if new.category is null then new.category:=case when new.type='masuk' and new.description ilike 'saldo%awal%' then 'Saldo Awal' when new.type='masuk' then 'Penerimaan Lain' else 'Pengeluaran Lain' end; end if;
 return new; end $$;
drop trigger if exists tx_fill on public.transactions;
create trigger tx_fill before insert on public.transactions for each row execute function public.trg_tx_fill();

-- isi ulang data lama (hanya baris yang belum berkategori)
update public.transactions t set fund=f.fund,category=f.name,period=y.period,member_id=y.member_id
  from public.payments y join public.fee_types f on f.id=y.fee_type_id where t.payment_id=y.id and t.category is null;
update public.transactions set category=case when description ilike 'saldo%awal%' then 'Saldo Awal' when type='masuk' then 'Penerimaan Lain' else 'Pengeluaran Lain' end where category is null;

-- ---------- 4. Konfigurasi ----------
create or replace function public.fee_config() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('period',cur_period(),
  'types',coalesce((select jsonb_agg(to_jsonb(f) order by f.sort,f.id) from fee_types f),'[]'::jsonb),
  'meta',jsonb_build_object('org',coalesce(cfg('org_name'),'Arisan Keluarga'),'treasurer',coalesce(cfg('treasurer_name'),''),'chair',coalesce(cfg('chair_name'),''))) $$;

create or replace function public.set_fee_type(p_id smallint,p_name text,p_amount int,p_required boolean,p_active boolean,p_start text) returns void language plpgsql security definer set search_path=public as $$
declare f fee_types;
begin
 perform need_admin();
 select * into f from fee_types where id=p_id; if not found then raise exception 'Jenis iuran tidak ditemukan'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Nominal iuran tidak valid'; end if;
 if coalesce(trim(p_name),'')='' then raise exception 'Nama iuran wajib diisi'; end if;
 if p_start !~ '^\d{4}-\d{2}$' then raise exception 'Periode mulai tidak valid'; end if;
 update fee_types set name=trim(p_name),amount=p_amount,required_for_draw=coalesce(p_required,false),active=coalesce(p_active,true),start_period=p_start where id=p_id;
 if p_id=1 then update settings set v=p_amount::text where k='iuran'; end if;
 perform log_act('⚙','Pengaturan '||lower(trim(p_name))||' diubah','Rp '||to_char(p_amount,'FM999G999G999')||'/bulan');
end $$;

create or replace function public.set_iuran(p int) returns void language plpgsql security definer set search_path=public as $$
begin perform need_admin(); if p is null or p<=0 then raise exception 'Nominal iuran tidak valid'; end if;
 update fee_types set amount=p where id=1; update settings set v=p::text where k='iuran'; end $$;

create or replace function public.set_report_meta(p_org text,p_treasurer text,p_chair text) returns void language plpgsql security definer set search_path=public as $$
begin perform need_admin();
 insert into settings(k,v) values('org_name',coalesce(nullif(trim(p_org),''),'Arisan Keluarga')),('treasurer_name',coalesce(trim(p_treasurer),'')),('chair_name',coalesce(trim(p_chair),''))
 on conflict(k) do update set v=excluded.v; end $$;

-- ---------- 5. Daftar iuran per periode (semua jenis aktif) ----------
create or replace function public.get_payments(p_period text default null) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('period',x.p,'iuran',(select amount from fee_types where id=1),
  'types',coalesce((select jsonb_agg(to_jsonb(f) order by f.sort,f.id) from fee_types f where f.active),'[]'::jsonb),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('member_id',m.id,'name',m.name,'relation',m.relation,'phone',m.phone,
     'paid',coalesce((select jsonb_object_agg(py.fee_type_id::text,jsonb_build_object('pid',py.id,'amount',py.amount,'paid_at',py.paid_at,'receipt_no',py.receipt_no,'method',py.method)) from payments py where py.member_id=m.id and py.period=x.p),'{}'::jsonb),
     'can_draw',not exists(select 1 from fee_types f where f.active and f.required_for_draw and not exists(select 1 from payments y where y.member_id=m.id and y.period=x.p and y.fee_type_id=f.id))
    ) order by m.name) from members m where m.active=1),'[]'::jsonb))
 from (select coalesce(p_period,cur_period()) p) x $$;

-- ---------- 6. Mencatat & membatalkan pembayaran ----------
drop function if exists public.record_payment(bigint,text);
create or replace function public.record_payment(p_member bigint,p_period text,p_type smallint default 1,p_method text default 'Tunai') returns jsonb language plpgsql security definer set search_path=public as $$
declare m members; f fee_types; pid bigint; rn text;
begin
 perform need_admin();
 select * into m from members where id=p_member and active=1; if not found then raise exception 'Anggota tidak ditemukan atau nonaktif'; end if;
 select * into f from fee_types where id=p_type and active; if not found then raise exception 'Jenis iuran tidak ditemukan atau tidak aktif'; end if;
 if p_period is null or p_period !~ '^\d{4}-\d{2}$' then raise exception 'Periode tidak valid'; end if;
 if p_period<f.start_period then raise exception '% baru berlaku mulai %',f.name,f.start_period; end if;
 if p_period>to_char((now() at time zone 'Asia/Jakarta')+interval '12 months','YYYY-MM') then raise exception 'Periode terlalu jauh ke depan (maksimal 12 bulan)'; end if;
 if p_method not in('Tunai','Transfer','Lainnya') then raise exception 'Metode pembayaran tidak valid'; end if;
 if exists(select 1 from payments where member_id=p_member and period=p_period and fee_type_id=p_type) then raise exception '% periode % untuk % sudah tercatat',f.name,p_period,m.name; end if;
 insert into payments(member_id,period,amount,fee_type_id,method) values(p_member,p_period,f.amount,p_type,p_method) returning id,receipt_no into pid,rn;
 insert into transactions(date,description,type,amount,payment_id) values((now() at time zone 'Asia/Jakarta')::date,f.name||' '||p_period||' - '||m.name,'masuk',f.amount,pid);
 perform log_act('✓',m.name||' membayar '||lower(f.name),'Rp '||to_char(f.amount,'FM999G999G999')||' • '||p_period||' • '||rn);
 return jsonb_build_object('id',pid,'receipt_no',rn,'amount',f.amount,'period',p_period);
end $$;

create or replace function public.record_payments(p_member bigint,p_type smallint,p_periods text[],p_method text default 'Tunai') returns jsonb language plpgsql security definer set search_path=public as $$
declare per text; out jsonb:='[]'::jsonb;
begin
 perform need_admin();
 if p_periods is null or array_length(p_periods,1) is null then raise exception 'Pilih minimal satu periode'; end if;
 if array_length(p_periods,1)>36 then raise exception 'Maksimal 36 periode sekali catat'; end if;
 foreach per in array p_periods loop out:=out||jsonb_build_array(public.record_payment(p_member,per,p_type,p_method)); end loop;
 return out;
end $$;

drop function if exists public.void_payment(bigint);
create or replace function public.void_payment(p_id bigint,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare y payments; f fee_types; m members; coll bigint; disb bigint;
begin
 perform need_admin();
 select * into y from payments where id=p_id; if not found then raise exception 'Pembayaran tidak ditemukan'; end if;
 select * into f from fee_types where id=y.fee_type_id; select * into m from members where id=y.member_id;
 if f.fund='arisan' then      -- jangan biarkan dana yang sudah dicairkan "hilang" dari pembukuan
  select coalesce(sum(p.amount),0) into coll from payments p join fee_types t on t.id=p.fee_type_id where p.period=y.period and t.fund='arisan';
  select coalesce(sum(amount),0) into disb from transactions where category='Pencairan Arisan' and period=y.period;
  if coll-y.amount<disb then raise exception 'Dana arisan periode % sudah dicairkan. Batalkan pencairannya terlebih dahulu.',y.period; end if;
 end if;
 delete from payments where id=p_id;      -- transaksi terkait ikut terhapus (cascade)
 perform log_act('✗','Pembayaran dibatalkan: '||y.receipt_no||' • '||m.name,coalesce(nullif(trim(p_reason),''),'tanpa keterangan')||' • Rp '||to_char(y.amount,'FM999G999G999'));
end $$;

-- ---------- 7. Pencairan arisan ke pemenang ----------
create or replace function public.disburse_arisan(p_period text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare p text:=coalesce(p_period,cur_period()); d draws; coll bigint; disb bigint; amt bigint; tid bigint;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_disburse'));
 select * into d from draws where period=p and status='sah'; if not found then raise exception 'Belum ada pemenang yang disahkan untuk periode %',p; end if;
 select coalesce(sum(y.amount),0) into coll from payments y join fee_types f on f.id=y.fee_type_id where y.period=p and f.fund='arisan';
 select coalesce(sum(amount),0) into disb from transactions where category='Pencairan Arisan' and period=p;
 amt:=coll-disb;
 if amt<=0 then raise exception 'Tidak ada dana arisan yang tersisa untuk dicairkan pada periode %',p; end if;
 insert into transactions(date,description,type,amount,fund,category,period,member_id)
  values((now() at time zone 'Asia/Jakarta')::date,case when disb>0 then 'Pencairan susulan arisan ' else 'Pencairan arisan ' end||p||' - '||d.winner_name,'keluar',amt,'arisan','Pencairan Arisan',p,d.winner_id) returning id into tid;
 perform log_act('💸','Dana arisan '||p||' dicairkan ke '||d.winner_name,'Rp '||to_char(amt,'FM999G999G999'));
 return jsonb_build_object('id',tid,'amount',amt,'winner',d.winner_name,'period',p);
end $$;

create or replace function public.cancel_disbursement(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare t transactions;
begin
 perform need_admin();
 delete from transactions where id=p_id and category='Pencairan Arisan' returning * into t;
 if not found then raise exception 'Pencairan tidak ditemukan'; end if;
 perform log_act('↩','Pencairan arisan dibatalkan: '||t.description,'Rp '||to_char(t.amount,'FM999G999G999'));
end $$;

-- ---------- 8. Tunggakan ----------
-- Tunggakan = periode (mulai berlakunya iuran s.d. bulan lalu) yang belum dibayar. p_include_current=true ikut menghitung bulan berjalan.
create or replace function public.iuran_arrears(p_type smallint default null,p_include_current boolean default false) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.name,r.type_id),'[]'::jsonb) from (
  select m.id member_id,m.name,m.phone,f.id type_id,f.name type_name,f.amount,
         array_agg(g.period order by g.period) periods,count(*)::int n,(count(*)*f.amount)::bigint total
  from fee_types f cross join members m
  cross join lateral (select to_char(d,'YYYY-MM') period from generate_series(
        to_date(f.start_period||'-01','YYYY-MM-DD'),
        to_date(cur_period()||'-01','YYYY-MM-DD')-case when p_include_current then interval '0 month' else interval '1 month' end,
        interval '1 month') d) g
  where f.active and m.active=1 and (p_type is null or f.id=p_type)
    and substr(g.period,1,4)::int>=coalesce(m.joined,0)
    and not exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=f.id and y.period=g.period)
  group by m.id,m.name,m.phone,f.id,f.name,f.amount) r $$;

-- ---------- 9. Laporan ----------
create or replace function public.finance_summary(p_from date,p_to date) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('from',p_from,'to',p_to,
  'funds',(select jsonb_agg(to_jsonb(r) order by r.ord) from (
     select v.fund,v.ord,
      coalesce(sum(case when t.date<p_from then (case when t.type='masuk' then t.amount else -t.amount end) end),0)::bigint opening,
      coalesce(sum(case when t.date between p_from and p_to and t.type='masuk' then t.amount end),0)::bigint masuk,
      coalesce(sum(case when t.date between p_from and p_to and t.type='keluar' then t.amount end),0)::bigint keluar,
      coalesce(sum(case when t.date<=p_to then (case when t.type='masuk' then t.amount else -t.amount end) end),0)::bigint closing
     from (values('arisan',1),('kas',2)) v(fund,ord) left join transactions t on t.fund=v.fund group by v.fund,v.ord) r),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.fund,c.type desc,c.total desc) from (
     select fund,type,category,sum(amount)::bigint total,count(*)::int n from transactions where date between p_from and p_to group by 1,2,3) c),'[]'::jsonb)) $$;

create or replace function public.finance_ledger(p_from date,p_to date,p_fund text default null,p_category text default null,p_limit int default 1000) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare opening bigint; tot int; rows_ jsonb;
begin
 select coalesce(sum(case when type='masuk' then amount else -amount end),0) into opening from transactions where date<p_from and (p_fund is null or fund=p_fund);
 select count(*) into tot from transactions where date between p_from and p_to and (p_fund is null or fund=p_fund) and (p_category is null or category=p_category);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.date,x.id),'[]'::jsonb) into rows_ from (
   select t.id,t.date,t.description,t.type,t.amount,t.fund,t.category,t.period,t.member_id,t.payment_id,y.receipt_no,
          (opening+sum(case when t.type='masuk' then t.amount else -t.amount end) over (order by t.date,t.id))::bigint bal
   from transactions t left join payments y on y.id=t.payment_id
   where t.date between p_from and p_to and (p_fund is null or t.fund=p_fund) and (p_category is null or t.category=p_category)
   order by t.date,t.id limit least(greatest(p_limit,1),20000)) x;
 return jsonb_build_object('opening',opening,'total',tot,'rows',rows_,'truncated',tot>least(greatest(p_limit,1),20000));
end $$;
-- catatan: saldo berjalan (bal) dihitung dari saldo awal rentang yang dipilih; bila difilter kategori, saldo awal tetap per dana/semua.

create or replace function public.iuran_recap(p_from text,p_to text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if p_from !~ '^\d{4}-\d{2}$' or p_to !~ '^\d{4}-\d{2}$' then raise exception 'Periode tidak valid'; end if;
 if to_date(p_to||'-01','YYYY-MM-DD')-to_date(p_from||'-01','YYYY-MM-DD')>1100 then raise exception 'Rentang maksimal 36 bulan'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.period,r.type_id) from (
  select g.period,f.id type_id,f.code,f.name,f.amount,
    (select count(*) from members m where m.active=1 and substr(g.period,1,4)::int>=coalesce(m.joined,0))::int members,
    (select count(*) from payments y join members m on m.id=y.member_id and m.active=1 where y.fee_type_id=f.id and y.period=g.period)::int paid,
    coalesce((select sum(y.amount) from payments y where y.fee_type_id=f.id and y.period=g.period),0)::bigint realized
  from fee_types f
  cross join lateral (select to_char(d,'YYYY-MM') period from generate_series(to_date(p_from||'-01','YYYY-MM-DD'),to_date(p_to||'-01','YYYY-MM-DD'),interval '1 month') d) g
  where f.active and g.period>=f.start_period) r),'[]'::jsonb);
end $$;

-- Matriks kepatuhan: per anggota 12 karakter  1=lunas  0=belum  -=belum berlaku/belum jatuh tempo
create or replace function public.compliance_matrix(p_year int,p_type smallint) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('member_id',m.id,'name',m.name,'m',(
   select string_agg(case when per<f.start_period or per>cur_period() or substr(per,1,4)::int<coalesce(m.joined,0) then '-'
                          when exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=p_type and y.period=per) then '1' else '0' end,'' order by g)
   from generate_series(1,12) g cross join lateral (select p_year::text||'-'||lpad(g::text,2,'0') per) q)) order by m.name),'[]'::jsonb)
 from members m cross join fee_types f where m.active=1 and f.id=p_type $$;

-- ---------- 10. Ringkasan keuangan (halaman Keuangan) ----------
create or replace function public.finance_dashboard() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cp text:=cur_period(); r jsonb;
begin
 r:=jsonb_build_object('period',cp,
  'funds',(select jsonb_agg(jsonb_build_object('fund',v.fund,'saldo',coalesce((select sum(case when type='masuk' then amount else -amount end) from transactions t where t.fund=v.fund),0)::bigint) order by v.ord) from (values('arisan',1),('kas',2)) v(fund,ord)),
  'month',(select jsonb_build_object('masuk',coalesce(sum(amount) filter(where type='masuk'),0)::bigint,'keluar',coalesce(sum(amount) filter(where type='keluar'),0)::bigint) from transactions where to_char(date,'YYYY-MM')=cp),
  'types',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'code',f.code,'name',f.name,'amount',f.amount,'fund',f.fund,'required',f.required_for_draw,
      'paid',(select count(*) from payments y join members m on m.id=y.member_id and m.active=1 where y.fee_type_id=f.id and y.period=cp),
      'realized',(select coalesce(sum(amount),0) from payments where fee_type_id=f.id and period=cp)::bigint,
      'members',(select count(*) from members where active=1)) order by f.sort,f.id) from fee_types f where f.active),'[]'::jsonb),
  'arrears',(select jsonb_build_object('members',count(distinct a.member_id),'amount',coalesce(sum(a.total),0)) from jsonb_to_recordset(public.iuran_arrears(null,false)) as a(member_id bigint,total bigint)),
  'pending',coalesce((select jsonb_agg(jsonb_build_object('period',d.period,'winner',d.winner_name,'winner_id',d.winner_id,
      'collected',c.coll,'disbursed',c.disb,'amount',c.coll-c.disb) order by d.period desc)
     from draws d cross join lateral (select
        coalesce((select sum(y.amount) from payments y join fee_types f on f.id=y.fee_type_id where y.period=d.period and f.fund='arisan'),0)::bigint coll,
        coalesce((select sum(amount) from transactions where category='Pencairan Arisan' and period=d.period),0)::bigint disb) c
     where d.status='sah' and d.period>=coalesce(cfg('disburse_from'),'0000-00') and c.coll-c.disb>0),'[]'::jsonb),
  'monthly',coalesce((select jsonb_agg(to_jsonb(x) order by x.m) from (
      select to_char(date,'YYYY-MM') m,
       coalesce(sum(amount) filter(where type='masuk' and fund='arisan'),0)::bigint masuk_arisan,coalesce(sum(amount) filter(where type='masuk' and fund='kas'),0)::bigint masuk_kas,
       coalesce(sum(amount) filter(where type='keluar'),0)::bigint keluar
      from transactions where date>=(date_trunc('month',now() at time zone 'Asia/Jakarta')-interval '5 months')::date group by 1 order by 1) x),'[]'::jsonb));
 return r;
end $$;

-- ---------- 11. Syarat kocok mengikuti iuran yang ditandai "wajib untuk kocok" ----------
create or replace function public.eligible_members(p text) returns table(id bigint,name text) language sql stable security definer set search_path=public as $$
 select m.id,m.name from members m where m.active=1
 and not exists(select 1 from fee_types f where f.active and f.required_for_draw and not exists(select 1 from payments y where y.member_id=m.id and y.period=p and y.fee_type_id=f.id))
 and not exists(select 1 from draws d where d.winner_id=m.id and (
       (d.status='sah' and d.cycle=cfg('cycle')::int)
    or (d.status in('menunggu','tidak_hadir') and d.period=p)))
 order by m.id $$;

create or replace function public.draw_state() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('period',cur_period(),'cycle',cfg('cycle')::int,
  'eligible',coalesce((select jsonb_agg(to_jsonb(e)) from eligible_members(cur_period()) e),'[]'::jsonb),
  'unpaid',(select count(*) from members m where m.active=1 and exists(select 1 from fee_types f where f.active and f.required_for_draw and not exists(select 1 from payments y where y.member_id=m.id and y.period=cur_period() and y.fee_type_id=f.id))),
  'winner',(select to_jsonb(d) from draws d where d.period=cur_period() and d.status='sah'),
  'pending',(select to_jsonb(d) from draws d where d.period=cur_period() and d.status='menunggu'),
  'absent',coalesce((select jsonb_agg(jsonb_build_object('id',d.winner_id,'name',d.winner_name,'attempt',d.attempt) order by d.id) from draws d where d.period=cur_period() and d.status='tidak_hadir'),'[]'::jsonb),
  'attempts',(select count(*) from draws d where d.period=cur_period()),
  'history',coalesce((select jsonb_agg(to_jsonb(d) order by d.id desc) from draws d),'[]'::jsonb)) $$;

-- ---------- 12. Dashboard utama: saldo per dana & status kedua iuran ----------
create or replace function public.dashboard() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'saldo',coalesce((select sum(case when type='masuk' then amount else -amount end) from transactions),0),
  'masuk',coalesce((select sum(amount) from transactions where type='masuk'),0),
  'keluar',coalesce((select sum(amount) from transactions where type='keluar'),0),
  'n',(select count(*) from transactions),
  'members',(select count(*) from members where active=1),
  'paid',(select count(*) from payments y join members m on m.id=y.member_id join fee_types f on f.id=y.fee_type_id where y.period=cur_period() and m.active=1 and f.code='arisan'),
  'period',cur_period(),'iuran',(select amount from fee_types where id=1),
  'funds',(select jsonb_object_agg(v.fund,coalesce((select sum(case when type='masuk' then amount else -amount end) from transactions t where t.fund=v.fund),0)) from (values('arisan'),('kas')) v(fund)),
  'types',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'code',f.code,'name',f.name,
      'paid',(select count(*) from payments y join members m on m.id=y.member_id and m.active=1 where y.fee_type_id=f.id and y.period=cur_period())) order by f.sort,f.id) from fee_types f where f.active),'[]'::jsonb),
  'cashflow',coalesce((select jsonb_agg(c order by c.m) from (select to_char(date,'YYYY-MM') m,sum(case when type='masuk' then amount else 0 end) masuk,sum(case when type='keluar' then amount else 0 end) keluar from transactions group by 1 order by 1 desc limit 6) c),'[]'::jsonb),
  'next',(select to_jsonb(e) from events e where e.date>=(now() at time zone 'Asia/Jakarta')::date order by e.date limit 1),
  'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (select * from activity order by id desc limit 5) a),'[]'::jsonb),
  'recent',coalesce((select jsonb_agg(to_jsonb(r) order by r.id desc) from (select id,name,relation,generation from members where active=1 order by id desc limit 4) r),'[]'::jsonb)) $$;

-- ---------- 13. Hak akses ----------
revoke execute on function public.trg_payment_receipt(), public.trg_tx_fill() from public, anon, authenticated;
revoke execute on function
  public.fee_config(), public.set_fee_type(smallint,text,int,boolean,boolean,text), public.set_iuran(int), public.set_report_meta(text,text,text),
  public.get_payments(text), public.record_payment(bigint,text,smallint,text), public.record_payments(bigint,smallint,text[],text), public.void_payment(bigint,text),
  public.disburse_arisan(text), public.cancel_disbursement(bigint), public.iuran_arrears(smallint,boolean), public.finance_summary(date,date),
  public.finance_ledger(date,date,text,text,int), public.iuran_recap(text,text), public.compliance_matrix(int,smallint), public.finance_dashboard(),
  public.eligible_members(text), public.draw_state(), public.dashboard() from public, anon;
grant execute on function
  public.fee_config(), public.set_fee_type(smallint,text,int,boolean,boolean,text), public.set_iuran(int), public.set_report_meta(text,text,text),
  public.get_payments(text), public.record_payment(bigint,text,smallint,text), public.record_payments(bigint,smallint,text[],text), public.void_payment(bigint,text),
  public.disburse_arisan(text), public.cancel_disbursement(bigint), public.iuran_arrears(smallint,boolean), public.finance_summary(date,date),
  public.finance_ledger(date,date,text,text,int), public.iuran_recap(text,text), public.compliance_matrix(int,smallint), public.finance_dashboard(),
  public.eligible_members(text), public.draw_state(), public.dashboard() to authenticated;
