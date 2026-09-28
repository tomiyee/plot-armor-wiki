# scripts/

This directory holds scripts for local development, database management, and one-time migrations.

## Dev server

### `dev.js`

This script loads `.env.local` and then runs `next dev --turbo`. Start it with `npm run dev`. It uses the `PORT` environment variable if you set one. The default port is `3000`.

## Local Postgres (Docker)

Each database script has a Bash version (`.sh`) and a PowerShell version (`.ps1`). Use the version that matches your shell. All versions read `DATABASE_URL` from `.env.local` in the repo root to get the credentials and database name. By default, all versions use a Docker container named `plotarmor-db`.

### `start-db.sh` / `start-db.ps1`

This script starts the local Postgres container. On the first run, it creates the container from the `postgres:16` image.

```bash
./scripts/start-db.sh [container-name] [postgres-image]
.\scripts\start-db.ps1 [-ContainerName <name>] [-PostgresImage <image>]
```

- If the container does not exist, the script creates it. If the container exists but is stopped, the script starts it. If the container already runs, the script does nothing.
- This script works for local Docker only. If `DATABASE_URL` does not point at `localhost` or `127.0.0.1`, the script shows a warning but continues.

### `save-db.sh` / `save-db.ps1`

This script dumps the database from the running container to a SQL file. It uses `pg_dump`.

```bash
./scripts/save-db.sh [output-file] [container-name]
.\scripts\save-db.ps1 [-OutputFile <path>] [-ContainerName <name>]
```

- By default, the script saves the file to `db-snapshots/YYYY-MM-DD_HH-MM-SS.sql` under the repo root.
- The container must already run. Start it with `start-db` first.

### `load-db.sh` / `load-db.ps1`

This script restores a SQL dump into the running container. Use a dump file that `save-db` produced.

```bash
./scripts/load-db.sh [input-file] [container-name] [--force]
.\scripts\load-db.ps1 -InputFile <path> [-ContainerName <name>] [-Force]
```

- In the Bash version, if you omit `input-file`, the script lists the `.sql` files in `db-snapshots/` and asks you to choose one.
- **Warning: this script is destructive.** It drops and recreates the target database before it loads the dump. The script asks for confirmation (type `yes` to continue) unless you pass `--force` or `-Force`.

### `clone-db.sh`

This script clones a source Postgres database into the local `DATABASE_URL` target. It dumps and restores the database in one step, with no intermediate file left on disk.

```bash
./scripts/clone-db.sh <source-db-url> [--force]
```

- The script refuses to run if the source and the target resolve to the same host, port, and database.
- **Warning: this script is destructive.** It drops and recreates the target database. The script asks for confirmation unless you pass `--force`.
- The script needs `pg_dump` and `psql` on `PATH`. It connects to the target directly, not through `docker exec`. This works for a local Docker container or any other Postgres server your machine can reach.
- No PowerShell version exists yet.

## Migrations

### `migrate-single-section.ts`

This is a one-time backfill script for the multi-section to single-content page collapse (see commit `9bf8a41`). It merges rows from the legacy tables `page_sections`, `page_section_revisions`, `page_infobox_sections`, `page_infobox_revisions`, and `page_infobox_image_revisions`. It writes the merged rows into the new tables `page_content_revisions` and `page_infobox_content_revisions`.

```bash
npx tsx scripts/migrate-single-section.ts
```

- Apply the additive migration `0005_add_single_content_page_revisions.sql` first. Run this script after that migration and before the destructive migration that drops the legacy tables.
- The script is idempotent. It clears both destination tables before it writes new rows, so you can run it again on the same database without risk.
- The script also deletes all pending and reviewed page suggestions. No users existed yet at the time of this migration, so this step did not remove any user data.
- This script already ran against production as part of #238. Keep it for reference, or for use on other environments such as a freshly cloned dev database still on the old schema. Do not run it as part of routine work.
- `run-single-content-migration.sh` (below) automates the full sequence, including the drizzle-kit pause this script needs.

### `run-single-content-migration.sh`

This script orchestrates the full multi-section-to-single-content migration end to end. `drizzle-kit migrate` has no flag to stop at a specific migration, so this script hides migration `0006_drop_legacy_per_section_tables.sql` from drizzle-kit, applies migrations `0000`-`0005`, runs `migrate-single-section.ts`, restores `0006`, then applies it.

```bash
./scripts/run-single-content-migration.sh [--force]
```

- Logs each of its 5 steps before running it.
- **Warning: this script is destructive.** The final step permanently drops the legacy per-section and template tables. The script asks for confirmation (type `yes` to continue) unless you pass `--force`.
- Safe to re-run. If a previous run was interrupted between steps 1 and 4, the script restores that partial state before starting over.
- Same applicability as `migrate-single-section.ts` above: this already ran against production as part of #238. Use it on other environments still on the old schema, not as part of routine work.

## Git hooks

### `install-hooks.sh`

This script installs `pre-commit.sh` as the repo's `pre-commit` git hook. It finds the correct shared hooks directory, even when you run it from a git worktree.

```bash
./scripts/install-hooks.sh
```

### `pre-commit.sh`

This is the hook itself. `install-hooks.sh` copies it into place. It runs `rtk npm run build` before it allows a commit.
