-- ============================================================
-- PATCH 010 — Peran "Pengelola Silsilah" (FamilyHub v3.6)
--
-- Peran ketiga di samping admin & viewer:
--   admin       : semua hak (keuangan, arisan, pengaturan, pengguna, anggota, silsilah …)
--   pengelola   : mengelola ANGGOTA & SILSILAH + semua hak lihat milik viewer
--   viewer      : hanya melihat
--
-- Yang boleh dilakukan pengelola:
--   tambah / ubah anggota, hubungan keluarga (orang tua, pasangan), foto profil, impor CSV anggota,
--   menetapkan leluhur garis keturunan, melengkapi jenis kelamin & status pernikahan.
-- Yang TIDAK boleh (tetap khusus admin):
--   iuran, kas, pengocokan, agenda, pengumuman, album, pengaturan, pengguna & peran.
-- Pengaman tambahan (dipaksakan di database, bukan sekadar disembunyikan di tampilan):
--   * Status arisan (members.active) hanya bisa diubah admin. Anggota baru dari pengelola otomatis
--     nonaktif arisan (tercatat untuk silsilah saja) sampai admin mengaktifkannya.
--   * Anggota yang punya catatan iuran / kas / pengocokan hanya bisa dihapus admin, agar data
--     keuangan tidak ikut terhapus (cascade).
--   * Foto Storage: pengelola hanya boleh mengunggah/menghapus foto profil (folder "profile/");
--     foto album tetap khusus admin.
-- Aman dijalankan berulang (idempotent). Tidak mengubah data yang ada.
-- ============================================================

-- 1) Daftar peran yang sah
do $$ declare c text; begin
 for c in select conname from pg_constraint where conrelid='public.profiles'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%role%' loop
  execute format('alter table public.profiles drop constraint %I',c);
 end loop;
 alter table public.profiles add constraint profiles_role_check check (role in('admin','pengelola','viewer'));
end $$;

-- 2) Helper hak akses
create or replace function public.is_member_editor() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select role in('admin','pengelola') from profiles where id=auth.uid()),false) $$;
create or replace function public.need_member_editor() returns void language plpgsql stable as $$
begin if not public.is_member_editor() then raise exception 'Hanya admin atau pengelola silsilah yang boleh mengubah data anggota'; end if; end $$;

-- 3) Ubah peran (admin saja). Minimal satu admin harus tersisa.
create or replace function public.set_role(p_id uuid,p_role text) returns void language plpgsql security definer set search_path=public as $$
declare nm text;
begin
 perform need_admin();
 if p_role is null or p_role not in('admin','pengelola','viewer') then raise exception 'Peran tidak valid'; end if;
 if p_role<>'admin' and not exists(select 1 from profiles where role='admin' and id<>p_id) then raise exception 'Harus ada minimal satu admin'; end if;
 update profiles set role=p_role where id=p_id returning name into nm;
 if not found then raise exception 'Pengguna tidak ditemukan'; end if;
 perform log_act('⚙','Peran pengguna diubah',coalesce(nm,'?')||' → '||case p_role when 'admin' then 'Admin' when 'pengelola' then 'Pengelola Silsilah' else 'Viewer' end);
end $$;

-- 4) Fungsi anggota/silsilah: izinkan pengelola. Definisi yang berlaku dibaca langsung dari database
--    lalu pemeriksaan need_admin() diganti need_member_editor() (tidak menyalin ulang isi fungsi).
do $$ declare f record; d text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname in('import_members','fill_marital_status','set_lineage_roots') loop
  d:=pg_get_functiondef(f.oid);
  if position('need_admin()' in d)>0 then execute replace(d,'need_admin()','need_member_editor()'); end if;
 end loop;
end $$;
-- (set_members_active — mengatur peserta arisan — tetap khusus admin.)

-- 5) Tabel members: pengelola boleh tambah / ubah / hapus (dibatasi trigger di bawah)
drop policy if exists "pengelola tambah" on public.members;
drop policy if exists "pengelola ubah"   on public.members;
drop policy if exists "pengelola hapus"  on public.members;
create policy "pengelola tambah" on public.members for insert to authenticated with check (public.is_member_editor());
create policy "pengelola ubah"   on public.members for update to authenticated using (public.is_member_editor()) with check (public.is_member_editor());
create policy "pengelola hapus"  on public.members for delete to authenticated using (public.is_member_editor());

-- 6) Pagar: yang bukan admin tidak boleh menyentuh status arisan maupun menghapus anggota ber-catatan keuangan.
--    Sesi server (tanpa pengguna login, mis. SQL Editor) tidak dibatasi.
create or replace function public.trg_members_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or public.is_admin() then return coalesce(new,old); end if;
 if tg_op='INSERT' then new.active:=0; return new;
 elsif tg_op='UPDATE' then new.active:=old.active; return new;
 else
  if exists(select 1 from payments where member_id=old.id) or exists(select 1 from draws where winner_id=old.id) or exists(select 1 from transactions where member_id=old.id) then
   raise exception 'Anggota "%" memiliki catatan iuran / kas / pengocokan. Hanya admin yang boleh menghapusnya.',old.name;
  end if;
  return old;
 end if;
end $$;
drop trigger if exists members_guard on public.members;
create trigger members_guard before insert or update or delete on public.members for each row execute function public.trg_members_guard();

-- 7) Foto profil di Storage: pengelola hanya untuk folder "profile/"
drop policy if exists "fh unggah foto profil" on storage.objects;
drop policy if exists "fh hapus foto profil"  on storage.objects;
create policy "fh unggah foto profil" on storage.objects for insert to authenticated with check (bucket_id='photos' and name like 'profile/%' and public.is_member_editor());
create policy "fh hapus foto profil"  on storage.objects for delete to authenticated using (bucket_id='photos' and name like 'profile/%' and public.is_member_editor());

-- 8) Hak eksekusi
revoke execute on function public.is_member_editor(), public.need_member_editor(), public.trg_members_guard() from public, anon;
grant  execute on function public.is_member_editor(), public.need_member_editor() to authenticated;
revoke execute on function public.trg_members_guard() from authenticated;
