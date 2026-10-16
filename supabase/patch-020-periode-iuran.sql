-- ============================================================
-- PATCH 020 — Input iuran saat periode berganti (FamilyHub v3.16.2)
--  1) ref_month(): bulan acuan Iuran Wajib untuk satu putaran sebelumnya = tanggal pelaksanaan, SELAIN ITU BULAN KALENDER SAAT INI.
--     Putaran tanpa tanggal yang melewati pergantian bulan (dibuka 28 Okt, dikocok 2 Nov) berpindah acuan ke November:
--     semua yang sudah bayar Iuran Wajib Oktober mendadak "belum bayar" dan tak lolos syarat kocok. Kini acuan TETAP:
--     tanggal pelaksanaan -> bulan kunci putaran lama ('YYYY-MM') -> bulan putaran dibuka -> (putaran tak dikenal) bulan kalender.
--  2) get_payments(): bila hanya putaran yang dipilih, bulan bawaan mengikuti putaran ITU (bukan putaran aktif).
--     Sebelumnya memilih putaran lain tetap menampilkan/mencatat Iuran Wajib untuk bulan putaran aktif.
-- Aman dijalankan berulang. Prasyarat: patch-019.
-- ============================================================

create or replace function public.ref_month(p text) returns text language sql stable set search_path=public as $$
 select coalesce((select coalesce(to_char(r.held_on,'YYYY-MM'),
                                  case when r.period ~ '^\d{4}-(0[1-9]|1[0-2])$' then r.period end,
                                  to_char(r.opened_at at time zone 'Asia/Jakarta','YYYY-MM'))
                    from arisan_rounds r where r.period=p),
                 calendar_period()) $$;

create or replace function public.get_payments(p_period text default null,p_month text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare rk text:=coalesce(nullif(trim(p_period),''),cur_period()); mk text:=coalesce(nullif(trim(p_month),''),ref_month(rk));
begin
 perform need_approved();
 if mk !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak valid'; end if;
 return jsonb_build_object('period',rk,'month',mk,'round',round_info(rk),'rounds',rounds_brief(),'iuran',(select amount from fee_types where id=1),
  'types',coalesce((select jsonb_agg(to_jsonb(f) order by f.sort,f.id) from fee_types f where f.active),'[]'::jsonb),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('member_id',m.id,'name',m.name,'relation',m.relation,'phone',m.phone,
     'paid',coalesce((select jsonb_object_agg(py.fee_type_id::text,jsonb_build_object('pid',py.id,'amount',py.amount,'paid_at',py.paid_at,'receipt_no',py.receipt_no,'method',py.method))
         from payments py join fee_types ft on ft.id=py.fee_type_id where py.member_id=m.id and py.period=case when ft.schedule='putaran' then rk else mk end),'{}'::jsonb),
     'can_draw',not exists(select 1 from fee_types f where f.active and f.required_for_draw and not exists(select 1 from payments y where y.member_id=m.id and y.fee_type_id=f.id and y.period=case when f.schedule='putaran' then rk else mk end))
    ) order by m.name) from members m where m.active=1),'[]'::jsonb));
end $$;

revoke execute on function public.get_payments(text,text) from public, anon;
grant execute on function public.get_payments(text,text) to authenticated;
