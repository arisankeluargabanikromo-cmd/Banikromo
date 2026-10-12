-- ============================================================
-- PATCH 009 — Halaman Pengaturan (FamilyHub v3.2)
--   * Logo & identitas aplikasi (nama, tagline, bentuk logo)
--   * Pemulihan (restore) dari berkas backup — atomik: gagal = tidak ada yang berubah
--   * Impor massal transaksi kas / agenda / pengumuman — atomik
--   * Reset data per kelompok atau seluruhnya — atomik
-- Aman dijalankan berulang (idempotent). Tidak mengubah data yang ada.
-- Semua fungsi hanya bisa dijalankan admin (dicek lewat need_admin()).
--
-- Catatan teknis:
--   * DELETE selalu memakai klausa WHERE ("where id is not null") karena Supabase
--     mengaktifkan pg_safeupdate yang menolak DELETE/UPDATE tanpa WHERE lewat API.
--   * Akun pengguna (auth.users / profiles) TIDAK pernah disentuh oleh reset maupun restore.
-- ============================================================

-- Penanda bahwa patch sudah terpasang (dipakai halaman Pengaturan)
create or replace function public.pengaturan_ready() returns boolean language sql stable as $$ select true $$;

-- ---------- 1. Logo & identitas ----------
-- p_logo: NULL = tidak diubah, '' = hapus logo, selain itu = data-URL gambar (png/jpeg/webp, maks ±300 KB)
create or replace function public.set_branding(p_logo text,p_shape text,p_name text,p_tagline text) returns void language plpgsql security definer set search_path=public as $$
declare nm text:=left(coalesce(nullif(trim(p_name),''),'FamilyHub'),40);
begin
 perform need_admin();
 if p_shape is null or p_shape not in('rounded','circle','original') then raise exception 'Bentuk logo tidak valid'; end if;
 if p_logo is not null and p_logo<>'' then
  if p_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Format logo tidak didukung (gunakan PNG, JPG, atau WebP)'; end if;
  if length(p_logo)>400000 then raise exception 'Ukuran logo terlalu besar (maksimal ±300 KB)'; end if;
  insert into settings(k,v) values('logo',p_logo) on conflict(k) do update set v=excluded.v;
 elsif p_logo='' then
  delete from settings where k='logo';
 end if;
 insert into settings(k,v) values('logo_shape',p_shape),('app_name',nm),('app_tagline',left(coalesce(trim(p_tagline),''),60))
  on conflict(k) do update set v=excluded.v;
 perform log_act('🎨','Identitas aplikasi diperbarui',nm);
end $$;

-- Mencatat waktu backup terakhir (dipakai untuk pengingat di halaman Pengaturan)
create or replace function public.mark_backup(p_detail text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 perform need_admin();
 insert into settings(k,v) values('last_backup_at',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  on conflict(k) do update set v=excluded.v;
 perform log_act('💾','Backup data diunduh',coalesce(left(p_detail,200),''));
end $$;

-- ---------- 2. Impor massal (transaksi | agenda | pengumuman) ----------
-- Impor anggota tetap memakai import_members(). Setiap elemen boleh memuat "_row" (nomor baris di berkas)
-- agar pesan galat menunjuk baris yang tepat. Gagal satu baris = batal seluruhnya.
create or replace function public.import_data(p_kind text,p jsonb) returns int language plpgsql security definer set search_path=public set statement_timeout='120s' as $$
declare r record; n int:=0; mx bigint; rw text;
begin
 perform need_admin();
 if p_kind is null or p_kind not in('transaksi','agenda','pengumuman') then raise exception 'Jenis impor tidak dikenal'; end if;
 if p is null or jsonb_typeof(p)<>'array' then raise exception 'Format data impor tidak valid'; end if;
 if jsonb_array_length(p)=0 then raise exception 'Tidak ada baris untuk diimpor'; end if;
 if jsonb_array_length(p)>2000 then raise exception 'Maksimal 2000 baris per impor'; end if;
 select coalesce(max(id),0) into mx from activity;
 for r in select e.value v, e.ordinality i from jsonb_array_elements(p) with ordinality e loop
  rw:=coalesce(nullif(r.v->>'_row',''),(r.i+1)::text);
  begin
   if p_kind='transaksi' then
    insert into transactions(date,description,type,amount,fund,category)
    values((r.v->>'tanggal')::date,trim(r.v->>'keterangan'),lower(trim(r.v->>'jenis')),(r.v->>'jumlah')::bigint,
           coalesce(nullif(lower(trim(r.v->>'dana')),''),'kas'),nullif(trim(r.v->>'kategori'),''));
   elsif p_kind='agenda' then
    insert into events(date,time,title,location,status)
    values((r.v->>'tanggal')::date,nullif(trim(r.v->>'jam'),''),trim(r.v->>'kegiatan'),nullif(trim(r.v->>'lokasi'),''),
           coalesce(nullif(trim(r.v->>'status'),''),'Terjadwal'));
   else
    if coalesce(trim(r.v->>'judul'),'')='' then raise exception 'judul kosong'; end if;
    insert into announcements(title,body,date,author)
    values(trim(r.v->>'judul'),nullif(trim(r.v->>'isi'),''),coalesce(nullif(trim(r.v->>'tanggal'),'')::date,current_date),
           coalesce(nullif(trim(r.v->>'penulis'),''),'Impor'));
   end if;
  exception when others then raise exception 'Baris %: %',rw,sqlerrm; end;
  n:=n+1;
 end loop;
 delete from activity where id>mx;       -- buang log per-baris yang dibuat trigger; diganti satu ringkasan
 perform log_act('⬆','Impor '||p_kind||' dari berkas',n||' baris');
 return n;
end $$;

-- ---------- 3. Pemulihan dari backup ----------
-- p = isi berkas backup {app,format,data:{settings,fee_types,members,payments,transactions,events,
--     announcements,albums,photos,draws,activity}}. Seluruh data aplikasi DIGANTI, akun pengguna tidak disentuh.
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
 insert into fee_types      select * from jsonb_populate_recordset(null::fee_types,d->'fee_types');
 insert into members        select * from jsonb_populate_recordset(null::members,d->'members');
 insert into payments       select * from jsonb_populate_recordset(null::payments,d->'payments');
 insert into transactions   select * from jsonb_populate_recordset(null::transactions,d->'transactions');
 insert into events         select * from jsonb_populate_recordset(null::events,d->'events');
 insert into announcements  select * from jsonb_populate_recordset(null::announcements,d->'announcements');
 insert into albums         select * from jsonb_populate_recordset(null::albums,d->'albums');
 insert into photos         select * from jsonb_populate_recordset(null::photos,d->'photos');
 insert into draws          select * from jsonb_populate_recordset(null::draws,d->'draws');
 -- log aktivitas: buang noise dari trigger, lalu pakai log asli dari backup
 delete from activity where id is not null;
 insert into activity       select * from jsonb_populate_recordset(null::activity,d->'activity');
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

-- ---------- 4. Reset data ----------
-- p_scope: keuangan | arisan | agenda | pengumuman | galeri | aktivitas | anggota | semua
-- p_keep_settings (hanya untuk "semua"): false = identitas, logo, dan tarif iuran dikembalikan ke bawaan.
-- Berkas foto di Storage dibersihkan oleh aplikasi (browser) setelah fungsi ini berhasil.
create or replace function public.reset_data(p_scope text,p_keep_settings boolean default true) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='300s' as $$
declare n jsonb:='{}'::jsonb; c bigint; t text; lbl text;
begin
 perform need_admin();
 if p_scope is null or p_scope not in('keuangan','arisan','agenda','pengumuman','galeri','aktivitas','anggota','semua') then raise exception 'Jenis reset tidak dikenal'; end if;
 perform pg_advisory_xact_lock(hashtext('fh_reset'));
 perform set_config('fh.skip_recalc','1',true);

 if p_scope in('arisan','anggota','semua') then
  select count(*) into c from draws; n:=n||jsonb_build_object('draws',c);
  delete from draws where id is not null;
  update settings set v='1' where k='cycle';
 end if;

 if p_scope in('keuangan','anggota','semua') then
  select count(*) into c from payments; n:=n||jsonb_build_object('payments',c);
  if p_scope='anggota' then       -- catatan kas manual tetap ada; yang terkait anggota ikut dibersihkan
   select count(*) into c from transactions where category='Pencairan Arisan' or payment_id is not null;
   n:=n||jsonb_build_object('transactions',c);
   delete from payments where id is not null;                       -- transaksi iuran ikut terhapus (cascade)
   delete from transactions where category='Pencairan Arisan';
  else
   select count(*) into c from transactions; n:=n||jsonb_build_object('transactions',c);
   delete from payments where id is not null;
   delete from transactions where id is not null;
  end if;
 end if;

 if p_scope in('anggota','semua') then
  select count(*) into c from members; n:=n||jsonb_build_object('members',c);
  delete from members where id is not null;
 end if;
 if p_scope in('agenda','semua') then
  select count(*) into c from events; n:=n||jsonb_build_object('events',c);
  delete from events where id is not null;
 end if;
 if p_scope in('pengumuman','semua') then
  select count(*) into c from announcements; n:=n||jsonb_build_object('announcements',c);
  delete from announcements where id is not null;
 end if;
 if p_scope in('galeri','semua') then
  select count(*) into c from photos; n:=n||jsonb_build_object('photos',c);
  select count(*) into c from albums; n:=n||jsonb_build_object('albums',c);
  delete from photos where id is not null;
  delete from albums where id is not null;
 end if;
 if p_scope in('aktivitas','semua') then
  select count(*) into c from activity; n:=n||jsonb_build_object('activity',c);
  delete from activity where id is not null;
 end if;

 if p_scope='semua' and not coalesce(p_keep_settings,true) then
  delete from settings where k in('logo','logo_shape','app_name','app_tagline','last_backup_at');
  insert into settings(k,v) values('org_name','Arisan Keluarga'),('treasurer_name',''),('chair_name',''),('iuran','350000'),('disburse_from',cur_period())
   on conflict(k) do update set v=excluded.v;
  update fee_types set name='Iuran Arisan',amount=350000,required_for_draw=true,active=true,start_period=cur_period() where id=1;
  update fee_types set name='Iuran Wajib',amount=50000,required_for_draw=false,active=true,start_period=cur_period() where id=2;
 end if;

 -- Tabel yang kosong: nomor urut kembali ke 1
 foreach t in array array['members','payments','transactions','events','announcements','albums','photos','draws','activity'] loop
  execute format('select case when not exists(select 1 from public.%I) then setval(pg_get_serial_sequence(%L,%L),1,false) end',t,'public.'||t,'id');
 end loop;
 perform set_config('fh.skip_recalc','0',true);

 lbl:=case p_scope when 'keuangan' then 'Keuangan' when 'arisan' then 'Pengocokan arisan' when 'agenda' then 'Agenda'
  when 'pengumuman' then 'Pengumuman' when 'galeri' then 'Dokumentasi' when 'aktivitas' then 'Log aktivitas'
  when 'anggota' then 'Anggota & silsilah' else 'Seluruh data' end;
 perform log_act('⚠','Reset data: '||lbl,'dilakukan oleh admin');
 return n;
end $$;

-- ---------- Hak akses ----------
revoke execute on function public.pengaturan_ready(), public.set_branding(text,text,text,text), public.mark_backup(text),
  public.import_data(text,jsonb), public.restore_backup(jsonb), public.reset_data(text,boolean) from public, anon;
grant execute on function public.pengaturan_ready(), public.set_branding(text,text,text,text), public.mark_backup(text),
  public.import_data(text,jsonb), public.restore_backup(jsonb), public.reset_data(text,boolean) to authenticated;
