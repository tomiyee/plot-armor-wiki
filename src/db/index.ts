import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { resolveDatabaseUrl } from './url';

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

// In dev, Next.js hot reloads re-execute module code but globalThis persists,
// so reuse the existing client instead of spawning a new pool each reload.
const client = globalThis.__pgClient ?? postgres(resolveDatabaseUrl());
if (process.env.NODE_ENV !== 'production') globalThis.__pgClient = client;

export const db = drizzle(client);
