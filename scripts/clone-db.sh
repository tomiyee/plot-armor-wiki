#!/usr/bin/env bash
# Clone a source Postgres database into the target database from .env.local.
#
# Usage:
#   ./scripts/clone-db.sh <source-db-url> [--force]
#
# Arguments:
#   source-db-url — full connection string, e.g. postgres://user:pass@host:5432/dbname
#   --force       — skip the confirmation prompt
#
# The target DEV_DATABASE_URL (falling back to DATABASE_URL) is read from .env.local in the repo root.
#
# WARNING: This drops and recreates the target database. All existing data
#          will be permanently deleted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
ENV_PATH="$REPO_ROOT/.env.local"

SOURCE_URL=""
FORCE=false

for arg in "$@"; do
    case "$arg" in
        --force) FORCE=true ;;
        -*)
            echo "error: unknown flag '$arg'" >&2
            exit 1
            ;;
        *)
            if [[ -z "$SOURCE_URL" ]]; then
                SOURCE_URL="$arg"
            else
                echo "error: unexpected argument '$arg'" >&2
                exit 1
            fi
            ;;
    esac
done

if [[ -z "$SOURCE_URL" ]]; then
    echo "Usage: ./scripts/clone-db.sh <source-db-url> [--force]" >&2
    exit 1
fi

# ── Read target from .env.local ───────────────────────────────────────────────

if [[ ! -f "$ENV_PATH" ]]; then
    echo "error: .env.local not found at $ENV_PATH" >&2
    exit 1
fi

TARGET_URL=""
# Local scripts target the dev database: prefer DEV_DATABASE_URL, fall back to DATABASE_URL.
for KEY in DEV_DATABASE_URL DATABASE_URL; do
    while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$line" =~ ^$KEY=(.+)$ ]]; then
            TARGET_URL="${BASH_REMATCH[1]}"
            TARGET_URL="${TARGET_URL#\'}" ; TARGET_URL="${TARGET_URL%\'}"
            TARGET_URL="${TARGET_URL#\"}" ; TARGET_URL="${TARGET_URL%\"}"
            break
        fi
    done < "$ENV_PATH"
    [[ -n "$TARGET_URL" ]] && break
done

if [[ -z "$TARGET_URL" ]]; then
    echo "error: neither DEV_DATABASE_URL nor DATABASE_URL found in .env.local" >&2
    exit 1
fi

# ── Parse URL ─────────────────────────────────────────────────────────────────

parse_url() {
    local url="$1"
    if [[ "$url" =~ ^postgres(ql)?://([^:@]+):([^@]*)@([^:/]+)(:([0-9]+))?/([^?]+) ]]; then
        PARSED_USER="${BASH_REMATCH[2]}"
        PARSED_PASSWORD="${BASH_REMATCH[3]}"
        PARSED_HOST="${BASH_REMATCH[4]}"
        PARSED_PORT="${BASH_REMATCH[6]:-5432}"
        PARSED_NAME="${BASH_REMATCH[7]}"
    else
        echo "error: could not parse URL (expected postgres://user:pass@host:port/dbname): $url" >&2
        exit 1
    fi
}

parse_url "$SOURCE_URL"
SRC_USER="$PARSED_USER" SRC_PASSWORD="$PARSED_PASSWORD"
SRC_HOST="$PARSED_HOST" SRC_PORT="$PARSED_PORT" SRC_NAME="$PARSED_NAME"

parse_url "$TARGET_URL"
TGT_USER="$PARSED_USER" TGT_PASSWORD="$PARSED_PASSWORD"
TGT_HOST="$PARSED_HOST" TGT_PORT="$PARSED_PORT" TGT_NAME="$PARSED_NAME"

# ── Guard: refuse to clone a DB onto itself ───────────────────────────────────

if [[ "$SRC_HOST" == "$TGT_HOST" && "$SRC_PORT" == "$TGT_PORT" && "$SRC_NAME" == "$TGT_NAME" ]]; then
    echo "error: source and target are the same database — aborting." >&2
    exit 1
fi

# ── Check tools ───────────────────────────────────────────────────────────────

for tool in pg_dump psql; do
    if ! command -v "$tool" &>/dev/null; then
        echo "error: '$tool' not found in PATH. Install PostgreSQL client tools." >&2
        exit 1
    fi
done

# ── Confirmation ──────────────────────────────────────────────────────────────

echo ""
echo "  Source : postgres://${SRC_USER}@${SRC_HOST}:${SRC_PORT}/${SRC_NAME}"
echo "  Target : postgres://${TGT_USER}@${TGT_HOST}:${TGT_PORT}/${TGT_NAME}"
echo ""

if [[ "$FORCE" == false ]]; then
    echo "WARNING: All data in the target database will be permanently replaced."
    echo ""
    read -r -p "Type 'yes' to continue: " CONFIRM
    echo ""
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "aborted."
        exit 0
    fi
fi

# ── Dump source ───────────────────────────────────────────────────────────────

TMPFILE="$(mktemp /tmp/clone-db-XXXXXX.sql)"
trap 'rm -f "$TMPFILE"' EXIT

echo "Dumping source '${SRC_NAME}' ..."
PGPASSWORD="$SRC_PASSWORD" pg_dump \
    --host="$SRC_HOST" \
    --port="$SRC_PORT" \
    --username="$SRC_USER" \
    --dbname="$SRC_NAME" \
    --no-owner \
    --no-acl \
    --format=plain \
    > "$TMPFILE"

DUMP_SIZE=$(du -sh "$TMPFILE" | cut -f1)
echo "Dump complete (${DUMP_SIZE})."
echo ""

# ── Drop and recreate target ──────────────────────────────────────────────────

echo "Dropping and recreating target '${TGT_NAME}' ..."
PGPASSWORD="$TGT_PASSWORD" psql \
    --host="$TGT_HOST" \
    --port="$TGT_PORT" \
    --username="$TGT_USER" \
    --dbname="postgres" \
    -c "DROP DATABASE IF EXISTS \"${TGT_NAME}\";" \
    -c "CREATE DATABASE \"${TGT_NAME}\";" \
    > /dev/null

# ── Restore ───────────────────────────────────────────────────────────────────

echo "Restoring into '${TGT_NAME}' ..."
PGPASSWORD="$TGT_PASSWORD" psql \
    --host="$TGT_HOST" \
    --port="$TGT_PORT" \
    --username="$TGT_USER" \
    --dbname="$TGT_NAME" \
    --quiet \
    < "$TMPFILE"

echo ""
echo "Done. '${TGT_NAME}' now mirrors '${SRC_NAME}'."
