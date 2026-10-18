import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { resolveDatabaseUrl } from './url';

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __pgClientsByEnv: Partial<Record<DbEnv, ReturnType<typeof postgres>>> | undefined;
}

/** Which database a connection targets; mirrors `DB_ENV`. */
export type DbEnv = 'dev' | 'prod';

// In dev, Next.js hot reloads re-execute module code but globalThis persists,
// so reuse the existing client instead of spawning a new pool each reload.
const client = globalThis.__pgClient ?? postgres(resolveDatabaseUrl());
if (process.env.NODE_ENV !== 'production') globalThis.__pgClient = client;

export const db = drizzle(client);

/** Drizzle client type, for helpers that take an explicit connection. */
export type Db = typeof db;

/**
 * Returns a client for an explicit database regardless of `DB_ENV`. Only the
 * local `/admin` tools need this, to switch between dev and prod at runtime;
 * everything else uses `db`.
 *
 * @example
 * const prod = getDbFor('prod'); // always DATABASE_URL
 */
export function getDbFor(env: DbEnv): Db {
  const cache = (globalThis.__pgClientsByEnv ??= {});
  const c = (cache[env] ??= postgres(resolveDatabaseUrl({ ...process.env, DB_ENV: env })));
  return drizzle(c);
}
