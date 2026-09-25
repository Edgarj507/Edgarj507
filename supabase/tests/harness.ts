import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Minimal stand-in for what Supabase provisions: auth schema, auth.users, auth.uid(), and the
 * anon / authenticated / service_role roles. Policies are exercised exactly as in production:
 * `SET ROLE authenticated` + the JWT sub claim that auth.uid() reads.
 */
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const MIGRATIONS = join(__dirname, '..', 'migrations');

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const f of readdirSync(MIGRATIONS).filter((f: string) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  // Supabase grants service_role broad table access; mirror that.
  await db.exec(`grant all on all tables in schema public to service_role;
                 grant usage on all sequences in schema public to service_role;`);
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

/** Run `fn` as a given Postgres role and (optionally) JWT subject, then reset. */
export async function as<T>(db: Db, role: 'anon' | 'authenticated' | 'service_role', sub: string | null, fn: () => Promise<T>) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function signUp(db: Db, id: string, handle: string, name = handle) {
  await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [id, JSON.stringify({ handle, display_name: name })]);
}
