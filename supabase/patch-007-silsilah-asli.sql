-- ============================================================
-- PATCH 007 — Silsilah: garis keturunan asli vs keluarga besan (FamilyHub v2.7)
--   * Penanda "leluhur / akar garis keturunan asli" (opsional). Tanpa penanda, aplikasi mendeteksi otomatis.
--   * Menantu & keluarga asalnya (besan) TIDAK menjadi leluhur pohon utama.
-- Jalankan SEKALI di SQL Editor Supabase (aman diulang). Data lama tidak berubah.
-- ============================================================
alter table public.members add column if not exists lineage_root boolean not null default false;

-- Menetapkan leluhur utama (akar garis keturunan asli). Daftar kosong / NULL = kembali ke deteksi otomatis.
create or replace function public.set_lineage_roots(p_ids bigint[]) returns int language plpgsql security definer set search_path=public as $$
declare n int:=0;
begin
 perform need_admin();
 if p_ids is not null and exists(select 1 from unnest(p_ids) i where not exists(select 1 from members m where m.id=i)) then raise exception 'Ada anggota yang tidak ditemukan'; end if;
 update members set lineage_root=false where lineage_root;
 if p_ids is not null and array_length(p_ids,1) is not null then
  update members set lineage_root=true where id=any(p_ids); get diagnostics n=row_count;
 end if;
 perform log_act('🧬',case when n=0 then 'Garis keturunan asli dikembalikan ke deteksi otomatis' else 'Garis keturunan asli ditetapkan ('||n||' leluhur)' end,'silsilah');
 return n;
end $$;

revoke execute on function public.set_lineage_roots(bigint[]) from public, anon;
grant execute on function public.set_lineage_roots(bigint[]) to authenticated;

-- Menonaktifkan/mengaktifkan banyak anggota sekaligus dari arisan (mis. keluarga besan yang dicatat hanya untuk silsilah).
create or replace function public.set_members_active(p_ids bigint[],p_active int) returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
 perform need_admin();
 if p_active not in(0,1) then raise exception 'Status tidak valid'; end if;
 if p_ids is null or array_length(p_ids,1) is null then return 0; end if;
 update members set active=p_active where id=any(p_ids) and active<>p_active; get diagnostics n=row_count;
 if n>0 then perform log_act('👥',n||' anggota '||case when p_active=1 then 'diaktifkan' else 'dinonaktifkan' end||' dari arisan','silsilah'); end if;
 return n;
end $$;
revoke execute on function public.set_members_active(bigint[],int) from public, anon;
grant execute on function public.set_members_active(bigint[],int) to authenticated;
