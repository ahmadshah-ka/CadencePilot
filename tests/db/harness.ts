import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Local stand-in for the parts of Supabase the migrations depend on (auth schema, auth.uid(),
 * the anon/authenticated/service_role roles and Supabase's permissive default grants). Passing
 * these tests proves the SQL logic and RLS locally; it is NOT verification of the hosted project.
 */
const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'sub', '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant select on auth.users to service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Actor = { sub: string } | "anon" | "service" | "postgres";

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

/** Runs `fn` with the database role and JWT claims of the given actor, then resets. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const role =
    actor === "postgres"
      ? "postgres"
      : actor === "service"
        ? "service_role"
        : actor === "anon"
          ? "anon"
          : "authenticated";
  const claims = typeof actor === "object" ? JSON.stringify({ sub: actor.sub, role }) : "";
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false);`);
  if (role !== "postgres") await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

export async function createUser(db: PGlite, email: string, verified = true): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at) values ($1, ${verified ? "now()" : "null"}) returning id`,
    [email],
  );
  return result.rows[0]!.id;
}

/** Returns the SQLSTATE-or-message of a failing statement, or null if it succeeded. */
export async function failure(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return (error as { message?: string }).message ?? "error";
  }
}
