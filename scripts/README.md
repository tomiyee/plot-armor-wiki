# scripts/

This directory holds scripts for local development, database management, and one-time migrations.

## Dev server

### `dev.js`

This script loads `.env.local` and then runs `next dev --turbo`. Start it with `npm run dev`. It uses the `PORT` environment variable if you set one. The default port is `3000`.

It picks the database from `DB_ENV` (`prod` → `DATABASE_URL`, `dev` → `DEV_DATABASE_URL`; unset means `prod`) and prints which one it uses. Pass `--db=prod` or `--db=dev` to override `.env.local` for one run, or use the shortcuts `npm run dev:prod` and `npm run dev:dev`. The script exits with an error if the selected URL is not set.

## Local Postgres (Docker)

Each database script has a Bash version (`.sh`) and a PowerShell version (`.ps1`). Use the version that matches your shell. All versions read `DEV_DATABASE_URL` (falling back to `DATABASE_URL`) from `.env.local` in the repo root to get the credentials and database name. By default, all versions use a Docker container named `plotarmor-db`.

### `start-db.sh` / `start-db.ps1`

This script starts the local Postgres container. On the first run, it creates the container from the `postgres:16` image.

```bash
./scripts/start-db.sh [container-name] [postgres-image]
.\scripts\start-db.ps1 [-ContainerName <name>] [-PostgresImage <image>]
```

- If the container does not exist, the script creates it. If the container exists but is stopped, the script starts it. If the container already runs, the script does nothing.
- This script works for local Docker only. If the URL does not point at `localhost` or `127.0.0.1`, the script shows a warning but continues.

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

This script clones one database from `.env.local` over the other. By default it overwrites `DEV_DATABASE_URL` with `DATABASE_URL` (prod) data; `--dev-to-prod` reverses the direction. It dumps and restores the database in one step, with no intermediate file left on disk.

```bash
./scripts/clone-db.sh [--prod-to-dev | --dev-to-prod] [--force]
```

- The script refuses to run if the source and the target resolve to the same host, port, and database.
- **Warning: this script is destructive.** It drops and recreates the target database. The script asks for confirmation unless you pass `--force`. Overwriting prod (`--dev-to-prod`) shows a danger warning and always requires typing `overwrite prod`, even with `--force`.
- The script needs `pg_dump` and `psql` on `PATH`. It connects to the target directly, not through `docker exec`. This works for a local Docker container or any other Postgres server your machine can reach.
- No PowerShell version exists yet.

## Git hooks

### `install-hooks.sh`

This script installs `pre-commit.sh` as the repo's `pre-commit` git hook. It finds the correct shared hooks directory, even when you run it from a git worktree.

```bash
./scripts/install-hooks.sh
```

### `pre-commit.sh`

This is the hook itself. `install-hooks.sh` copies it into place. It runs `rtk npm run build` before it allows a commit.
