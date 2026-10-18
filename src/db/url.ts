/**
 * Picks the Postgres connection string based on `DB_ENV`.
 *
 * `DATABASE_URL` stays the production URL so existing deployments need no
 * changes; `DEV_DATABASE_URL` is only read when `DB_ENV=dev`. Unset or
 * `DB_ENV=prod` falls back to `DATABASE_URL`.
 *
 * @example
 * // .env.local: DB_ENV=dev, DEV_DATABASE_URL=postgres://...localhost...
 * postgres(resolveDatabaseUrl());
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const dbEnv = (env.DB_ENV ?? 'prod').trim().toLowerCase();
  if (dbEnv !== 'prod' && dbEnv !== 'dev') {
    throw new Error(`DB_ENV must be "prod" or "dev" (got "${env.DB_ENV}").`);
  }
  const key = dbEnv === 'dev' ? 'DEV_DATABASE_URL' : 'DATABASE_URL';
  const url = env[key];
  if (!url) {
    throw new Error(`${key} is not set (DB_ENV=${dbEnv}) - populate .env.local.`);
  }
  return url;
}
