// Harness uji SQL FamilyHub: meniru lingkungan Supabase (auth, storage, peran anon/authenticated) di PGlite.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

export const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant select on auth.users to authenticated;           -- (di Supabase tidak diberikan; sengaja dicabut di bawah)
revoke select on auth.users from authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;   -- perilaku bawaan Supabase
grant select, insert, delete on storage.objects to authenticated;
`;

export async function freshDb(files = ['schema.sql']) {
  const db = new PGlite();
  await db.exec(STUB);
  for (const f of files) {
    const sql = fs.readFileSync(f, 'utf8');
    try { await db.exec(sql); } catch (e) { throw new Error(`Gagal menjalankan ${f}: ${e.message}`); }
  }
  return db;
}

// Menjalankan blok sebagai pengguna tertentu (authenticated/anon) lalu kembali ke superuser.
export async function as(db, uid, fn) {
  await db.exec(uid ? `set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);` : `set role anon; select set_config('request.jwt.claim.sub','',false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`); }
}

export async function signup(db, email, name) {
  const r = await db.query(`insert into auth.users(email,raw_user_meta_data) values($1,jsonb_build_object('name',$2::text)) returning id`, [email, name || email.split('@')[0]]);
  return r.rows[0].id;
}

// Mengembalikan {ok, rows} atau {ok:false, err}
export async function tryQ(db, sql, params) {
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message }; }
}

let pass = 0, fail = 0;
export function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ GAGAL: ' + name + (extra ? '  → ' + extra : '')); }
}
export const summary = () => { console.log(`\nHasil: ${pass} lulus, ${fail} gagal`); return fail === 0; };
