/**
 * Loads `.env.ingest` (and ONLY that file) before anything imports `@/db`.
 * Must be the first import of every ingest entrypoint: `@/db` reads
 * `DATABASE_URL` at module-evaluation time.
 */
import * as dotenv from "dotenv";

const result = dotenv.config({ path: ".env.ingest", quiet: true, override: true });
if (result.error || !process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL missing - copy .env.ingest.example to .env.ingest (ingest scripts never read .env.local).",
  );
  process.exit(1);
}

/** Host[:port]/db of the target database, printed before any write. */
export const dbTarget = (() => {
  try {
    const u = new URL(process.env.DATABASE_URL!);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
})();
