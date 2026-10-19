#!/usr/bin/env bash
# Restore the local Docker Postgres database from a SQL dump file.
#
# Usage:
#   ./scripts/load-db.sh [input-file] [container-name] [--force]
#
# Arguments:
#   input-file     — path to a .sql dump produced by save-db.sh
#                    (omit to pick interactively from db-snapshots/)
#   container-name — Docker container name (default: plotarmor-db)
#   --force        — skip the confirmation prompt
#
# WARNING: This drops and recreates the target database.  All existing data
#          will be permanently deleted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
ENV_PATH="$REPO_ROOT/.env.local"

INPUT_FILE=""
CONTAINER_NAME="plotarmor-db"
FORCE=false

for arg in "$@"; do
    case "$arg" in
        --force) FORCE=true ;;
        -*) echo "error: unknown flag '$arg'" >&2; exit 1 ;;
        *)
            if [[ -z "$INPUT_FILE" ]]; then
                INPUT_FILE="$arg"
            else
                CONTAINER_NAME="$arg"
            fi
            ;;
    esac
done

if [[ -z "$INPUT_FILE" ]]; then
    SNAPSHOTS_DIR="$REPO_ROOT/db-snapshots"
    mapfile -t SNAPSHOT_FILES < <(ls -t "$SNAPSHOTS_DIR"/*.sql 2>/dev/null)
    if [[ ${#SNAPSHOT_FILES[@]} -eq 0 ]]; then
        echo "error: no .sql files found in $SNAPSHOTS_DIR" >&2
        exit 1
    fi
    echo "Select a snapshot to restore:"
    for i in "${!SNAPSHOT_FILES[@]}"; do
        printf "  %d) %s\n" "$((i+1))" "$(basename "${SNAPSHOT_FILES[$i]}")"
    done
    echo ""
    read -r -p "Enter number [1-${#SNAPSHOT_FILES[@]}]: " CHOICE
    if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || (( CHOICE < 1 || CHOICE > ${#SNAPSHOT_FILES[@]} )); then
        echo "aborted." >&2
        exit 1
    fi
    INPUT_FILE="${SNAPSHOT_FILES[$((CHOICE-1))]}"
    echo ""
fi

if [[ ! -f "$INPUT_FILE" ]]; then
    echo "error: file not found: $INPUT_FILE" >&2
    exit 1
fi

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

# ── Confirmation ──────────────────────────────────────────────────────────────

if [[ "$FORCE" == false ]]; then
    echo "WARNING: This will drop and recreate '$DB_NAME' in container '$CONTAINER_NAME'."
    echo "         All existing data will be permanently deleted."
    echo ""
    read -r -p "Type 'yes' to continue: " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "aborted."
        exit 0
    fi
fi

# ── Restore ───────────────────────────────────────────────────────────────────

echo "[$CONTAINER_NAME] dropping and recreating database '$DB_NAME' ..."

docker exec \
    -e PGPASSWORD="$DB_PASSWORD" \
    "$CONTAINER_NAME" \
    psql \
        --username="$DB_USER" \
        --dbname="postgres" \
        -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
        -c "CREATE DATABASE \"$DB_NAME\";" \
    > /dev/null

echo "[$CONTAINER_NAME] loading $INPUT_FILE ..."

docker exec -i \
    -e PGPASSWORD="$DB_PASSWORD" \
    "$CONTAINER_NAME" \
    psql \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
    < "$INPUT_FILE"

echo "[$CONTAINER_NAME] database '$DB_NAME' restored from $INPUT_FILE"
