const { config } = require("dotenv");
const { spawnSync } = require("child_process");
const path = require("path");

// `npm run dev -- --db=prod|dev` (or the dev:prod / dev:dev shortcuts) overrides
// DB_ENV from .env.local. Set before dotenv so the flag wins (dotenv never overrides).
const dbFlag = process.argv.slice(2).find((a) => a.startsWith("--db="));
if (dbFlag) process.env.DB_ENV = dbFlag.slice("--db=".length);

config({ path: path.resolve(__dirname, "../.env.local") });

const dbEnv = (process.env.DB_ENV ?? "prod").trim().toLowerCase();
if (dbEnv !== "prod" && dbEnv !== "dev") {
  console.error(`error: DB_ENV must be "prod" or "dev" (got "${process.env.DB_ENV}")`);
  process.exit(1);
}
const urlKey = dbEnv === "dev" ? "DEV_DATABASE_URL" : "DATABASE_URL";
if (!process.env[urlKey]) {
  console.error(`error: DB_ENV=${dbEnv} but ${urlKey} is not set in .env.local`);
  process.exit(1);
}
process.env.DB_ENV = dbEnv;
console.log(`> Using ${dbEnv.toUpperCase()} database (${urlKey})`);

const port = process.env.PORT ?? "3000";

const { status } = spawnSync("next", ["dev", "--turbo", "-p", port], { stdio: "inherit", shell: true });
process.exit(status ?? 1);
