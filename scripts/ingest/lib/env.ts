/**
 * Loads `.env.local` and picks the database the same way the app does
 * (`DB_ENV` via `resolveDatabaseUrl`), so the CLI scripts and the
 * `/admin/ingestion` review UI target the same database. `--db=dev|prod`
 * overrides `DB_ENV` for one run, like `npm run dev -- --db=…`.
 *
 * Must be the first import of every ingest entrypoint: `@/db` reads the URL
 * at module-evaluation time.
 */
import * as dotenv from "dotenv";
import { resolveDatabaseUrl } from "@/db/url";

const flag = process.argv.find((a) => a.startsWith("--db="));
if (flag) process.env.DB_ENV = flag.slice("--db=".length);
// Hide the flag from each script's own argument parsing.
process.argv = process.argv.filter((a) => !a.startsWith("--db="));
dotenv.config({ path: ".env.local", quiet: true });

/** Database the script reads (`DB_ENV`, default prod). Recorded in context.json. */
export const dbEnv: "dev" | "prod" = (process.env.DB_ENV ?? "prod").trim().toLowerCase() === "dev" ? "dev" : "prod";

try {
  resolveDatabaseUrl();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
console.error(`> Using ${dbEnv.toUpperCase()} database`);
