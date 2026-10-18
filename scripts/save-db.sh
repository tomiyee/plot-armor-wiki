#!/usr/bin/env bash
# Save the local Docker Postgres database to a SQL dump file.
#
# Usage:
#   ./scripts/save-db.sh [output-file] [container-name]
#
# Defaults:
#   output-file    — db-snapshots/YYYY-MM-DD_HH-MM-SS.sql  (created under repo root)
#   container-name — plotarmor-db
#
# The script reads DEV_DATABASE_URL (or DATABASE_URL) from .env.local to determine the database name
# and credentials, then runs pg_dump inside the running Docker container.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
ENV_PATH="$REPO_ROOT/.env.local"
CONTAINER_NAME="${2:-plotarmor-db}"

SNAPSHOT_DIR="$REPO_ROOT/db-snapshots"
DEFAULT_OUTPUT="$SNAPSHOT_DIR/$(date '+%Y-%m-%d_%H-%M-%S').sql"
OUTPUT_FILE="${1:-$DEFAULT_OUTPUT}"

# ── Read .env.local ──────────────────────────────────────────────────────────

if [[ ! -f "$ENV_PATH" ]]; then
    echo "error: .env.local not found at $ENV_PATH. Create it with DATABASE_URL=postgres://user:password@localhost:5432/dbname" >&2
    exit 1
fi

DATABASE_URL=""
# Local scripts target the dev database: prefer DEV_DATABASE_URL, fall back to DATABASE_URL.
for KEY in DEV_DATABASE_URL DATABASE_URL; do
    while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$line" =~ ^$KEY=(.+)$ ]]; then
            DATABASE_URL="${BASH_REMATCH[1]}"
            DATABASE_URL="${DATABASE_URL#\'}" ; DATABASE_URL="${DATABASE_URL%\'}"
            DATABASE_URL="${DATABASE_URL#\"}" ; DATABASE_URL="${DATABASE_URL%\"}"
            break
        fi
    done < "$ENV_PATH"
    [[ -n "$DATABASE_URL" ]] && break
done

if [[ -z "$DATABASE_URL" ]]; then
    echo "error: neither DEV_DATABASE_URL nor DATABASE_URL found in .env.local" >&2
    exit 1
fi

# ── Parse connection string ───────────────────────────────────────────────────

if [[ "$DATABASE_URL" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?/([^?]+) ]]; then
    DB_USER="${BASH_REMATCH[2]}"
    DB_PASSWORD="${BASH_REMATCH[3]}"
    DB_NAME="${BASH_REMATCH[7]}"
else
    echo "error: could not parse DATABASE_URL. Expected format: postgres://user:password@localhost:5432/dbname" >&2
    exit 1
fi

# ── Check Docker ──────────────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
    echo "error: docker not found in PATH." >&2
    exit 1
fi

RUNNING=$(docker ps --filter "name=^${CONTAINER_NAME}$" --format "{{.Names}}")
if [[ "$RUNNING" != "$CONTAINER_NAME" ]]; then
    echo "error: container '$CONTAINER_NAME' is not running. Start it first with ./scripts/start-db.sh" >&2
    exit 1
fi

# ── Dump ──────────────────────────────────────────────────────────────────────

mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "[$CONTAINER_NAME] dumping database '$DB_NAME' → $OUTPUT_FILE ..."

docker exec \
    -e PGPASSWORD="$DB_PASSWORD" \
    "$CONTAINER_NAME" \
    pg_dump \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --no-owner \
        --no-acl \
        --format=plain \
    > "$OUTPUT_FILE"

SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo "[$CONTAINER_NAME] saved ($SIZE) → $OUTPUT_FILE"
