-- ============================================================
-- PATCH 012 — Restore tahan versi & kunci pembatalan (FamilyHub v3.11)
--  1) restore_backup hanya mengisi kolom yang ADA di berkas backup; kolom yang belum ada di backup lama
--     (mis. gender, spouse_status, lineage_root, fee_type_id) memakai nilai default. Sebelumnya backup lama
--     gagal dengan "null value ... violates not-null constraint".
--  2) void_payment memakai kunci yang sama dengan disburse_arisan (mencegah balapan).
-- Aman dijalankan berulang. Prasyarat: patch-011 (atau schema.sql v3.10).
-- ============================================================

-- Pembantu internal: isi satu tabel dari array JSON, hanya kolom yang muncul di data.
create or replace function public._restore_rows(p_table text,p_rows jsonb) returns void language plpgsql security definer set search_path=public as $$
declare cols text;
begin
 if p_table is null or p_table not in('fee_types','members','payments','transactions','events','announcements','albums','photos','draws','activity') then raise exception 'Tabel tidak dikenal: %',p_table; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then return; end if;
 select string_agg(format('%I',c.column_name),',' order by c.ordinal_position) into cols
  from information_schema.columns c
  where c.table_schema='public' and c.table_name=p_table
    and c.column_name in(select distinct k from jsonb_array_elements(p_rows) e, jsonb_object_keys(e) k);
 if cols is null then raise exception 'Data % tidak memuat kolom yang dikenal',p_table; end if;
 execute format('insert into public.%I(%s) select %s from jsonb_populate_recordset(null::public.%I,$1)',p_table,cols,cols,p_table) using p_rows;
end $$;
revoke execute on function public._restore_rows(text,jsonb) from public, anon, authenticated;

create or replace function public.restore_backup(p jsonb) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='300s' as $$
declare d jsonb; t text; n jsonb:='{}'::jsonb;
 need text[]:=array['settings','fee_types','members','payments','transactions','events','announcements','albums','photos','draws','activity'];
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_restore'));
 if p is null or jsonb_typeof(p)<>'object' or p->>'app' is distinct from 'FamilyHub' then raise exception 'Berkas ini bukan backup FamilyHub'; end if;
 if coalesce(nullif(p->>'format','')::int,0)<>1 then raise exception 'Versi format backup tidak didukung'; end if;
 d:=p->'data';
 if d is null or jsonb_typeof(d)<>'object' then raise exception 'Isi backup tidak ditemukan'; end if;
 foreach t in array need loop
  if jsonb_typeof(d->t) is distinct from 'array' then raise exception 'Backup tidak lengkap: bagian "%" tidak ada',t; end if;
 end loop;
 if jsonb_array_length(d->'fee_types')=0 then raise exception 'Backup tidak memuat jenis iuran — berkas diduga rusak'; end if;

 perform set_config('fh.skip_recalc','1',true);
 -- 1) kosongkan (urutan mengikuti ketergantungan kunci asing)
 delete from draws where id is not null;
 delete from photos where id is not null;
 delete from albums where id is not null;
 delete from transactions where id is not null;
 delete from payments where id is not null;
 delete from members where id is not null;
 delete from events where id is not null;
 delete from announcements where id is not null;
 delete from activity where id is not null;
 delete from fee_types where id is not null;
 -- 2) isi ulang. ID asli dipertahankan sehingga semua relasi tetap utuh
 insert into settings(k,v) select e->>'k',e->>'v' from jsonb_array_elements(d->'settings') e
  where e->>'k' is not null and e->>'v' is not null and e->>'k'<>'last_backup_at'
  on conflict(k) do update set v=excluded.v;
 foreach t in array array['fee_types','members','payments','transactions','events','announcements','albums','photos','draws'] loop
  perform public._restore_rows(t,d->t);
 end loop;
 -- log aktivitas: buang noise dari trigger, lalu pakai log asli dari backup
 delete from activity where id is not null;
 perform public._restore_rows('activity',d->'activity');
 -- 3) sinkronkan penghitung ID agar data baru tidak bentrok
 foreach t in array array['members','payments','transactions','events','announcements','albums','photos','draws','activity'] loop
  execute format('select setval(pg_get_serial_sequence(%L,%L),greatest(coalesce((select max(id) from public.%I),0),1),coalesce((select max(id) from public.%I),0)>0)','public.'||t,'id',t,t);
 end loop;
 perform set_config('fh.skip_recalc','0',true);
 perform public.recalc_generations();
 foreach t in array need loop n:=n||jsonb_build_object(t,jsonb_array_length(d->t)); end loop;
 perform log_act('♻','Data dipulihkan dari backup','dibuat '||coalesce(p->>'created_at','?'));
 return n;
end $$;

create or replace function public.void_payment(p_id bigint,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare y payments; f fee_types; m members; coll bigint; disb bigint;
begin
 perform need_admin();
 perform pg_advisory_xact_lock(hashtext('fh_disburse'));   -- sejajar dengan disburse_arisan: cegah balapan pembatalan vs pencairan
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

revoke execute on function public.restore_backup(jsonb), public.void_payment(bigint,text) from public, anon;
grant execute on function public.restore_backup(jsonb), public.void_payment(bigint,text) to authenticated;
