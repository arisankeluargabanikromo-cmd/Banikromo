-- OPSIONAL: data contoh (jalankan setelah schema.sql). Lewati jika ingin mulai dari kosong.
insert into members(name,relation,gender,birth_year,death_year,joined) values
 ('H. Santoso','Kakek','L',1935,null,2020),('Hj. Aminah','Nenek','P',1940,null,2020),
 ('Budi Santoso','Anak','L',1962,null,2020),('Sri Wahyuni','Menantu','P',1965,null,2020),
 ('Rina Novitasari','Anak','P',1966,null,2020),('Agus Wibowo','Menantu','L',1964,null,2020),
 ('Andi Pratama','Cucu','L',1990,null,2024),('Maya Sari','Cucu','P',1993,null,2024),
 ('Dimas Santoso','Cucu','L',1992,null,2024),('Nadia Santoso','Cucu','P',1995,null,2024);
update members set marital_status='belum_menikah' where name in ('Andi Pratama','Maya Sari','Dimas Santoso','Nadia Santoso');
-- hubungan keluarga (generasi dihitung otomatis oleh database)
update members c set parent_id=(select id from members p where p.name=v.par) from (values ('Budi Santoso','H. Santoso'),('Rina Novitasari','H. Santoso'),('Andi Pratama','Budi Santoso'),('Maya Sari','Budi Santoso'),('Dimas Santoso','Rina Novitasari'),('Nadia Santoso','Rina Novitasari')) v(child,par) where c.name=v.child;
update members c set spouse_id=(select id from members p where p.name=v.sp) from (values ('Hj. Aminah','H. Santoso'),('Sri Wahyuni','Budi Santoso'),('Agus Wibowo','Rina Novitasari')) v(child,sp) where c.name=v.child;
with p as (insert into payments(member_id,period,amount,paid_at) select id,public.cur_period(),350000,now()-random()*interval '5 days' from members where name<>'Dimas Santoso' returning id,member_id)
insert into transactions(date,description,type,amount,payment_id) select current_date,'Iuran '||public.cur_period()||' - '||m.name,'masuk',350000,p.id from p join members m on m.id=p.member_id;
insert into transactions(date,description,type,amount) values (current_date-120,'Saldo kas awal','masuk',6000000),(current_date-40,'Konsumsi arisan','keluar',1500000),(current_date-20,'Iuran bulan lalu (rekap)','masuk',2100000),(current_date-12,'Dekorasi & konsumsi','keluar',2050000),(current_date-4,'Sewa tempat acara','keluar',1200000);
insert into events(date,time,title,location) values (current_date+6,'16:00','Arisan Keluarga Besar Santoso','Rumah Bu Rina'),(current_date+18,'18:00','Ulang Tahun Pak Budi','Surabaya');
insert into announcements(title,body,author) values ('Arisan akan dilaksanakan pekan depan','Mohon hadir tepat waktu pukul 16:00 WIB.','Admin'),('Rekap iuran bulan lalu telah ditutup','','Admin');
insert into albums(emoji,title) values ('📸','Arisan Bulan Lalu'),('🎉','Lebaran Keluarga'),('👨‍👩‍👧‍👦','Family Gathering'),('🌿','Liburan Keluarga');
insert into draws(cycle,period,at,participants,winner_id,winner_name,proof) select 1,to_char(now() at time zone 'Asia/Jakarta' - interval '1 month','YYYY-MM'),now()-interval '30 days','[1,2,3,4,5,6,7]',id,name,'seed' from members where name='Rina Novitasari';

-- v2.6: contoh Iuran Wajib bulan berjalan (sebagian anggota). Dana/kategori transaksi diisi otomatis oleh trigger.
with ins as (
  insert into payments(member_id,period,amount,fee_type_id,method)
  select id,public.cur_period(),(select amount from fee_types where id=2),2,case when id%2=0 then 'Transfer' else 'Tunai' end from members where active=1 and id%3<>0 returning id,member_id,amount)
insert into transactions(date,description,type,amount,payment_id)
  select (now() at time zone 'Asia/Jakarta')::date,'Iuran Wajib '||public.cur_period()||' - '||m.name,'masuk',ins.amount,ins.id from ins join members m on m.id=ins.member_id;
