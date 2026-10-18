#!/usr/bin/env bash
# Clone one database from .env.local over the other (prod -> dev by default).
#
# Usage:
#   ./scripts/clone-db.sh [--prod-to-dev | --dev-to-prod] [--force]
#
# Arguments:
#   --prod-to-dev — (default) overwrite DEV_DATABASE_URL with DATABASE_URL data
#   --dev-to-prod — overwrite DATABASE_URL (production!) with DEV_DATABASE_URL data
#   --force       — skip the confirmation prompt (prod -> dev only; overwriting
#                   prod always requires typed confirmation)
#
# Both DATABASE_URL and DEV_DATABASE_URL are read from .env.local in the repo root.
#
# WARNING: This drops and recreates the target database. All existing data
#          will be permanently deleted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
ENV_PATH="$REPO_ROOT/.env.local"

DIRECTION="prod-to-dev"
FORCE=false

for arg in "$@"; do
    case "$arg" in
        --prod-to-dev) DIRECTION="prod-to-dev" ;;
        --dev-to-prod) DIRECTION="dev-to-prod" ;;
        --force) FORCE=true ;;
        *)
            echo "error: unknown argument '$arg'" >&2
            echo "Usage: ./scripts/clone-db.sh [--prod-to-dev | --dev-to-prod] [--force]" >&2
            exit 1
            ;;
    esac
done

# ── Read URLs from .env.local ─────────────────────────────────────────────────

if [[ ! -f "$ENV_PATH" ]]; then
    echo "error: .env.local not found at $ENV_PATH" >&2
    exit 1
fi

read_env() {
    local key="$1" value=""
    while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$line" =~ ^$key=(.+)$ ]]; then
            value="${BASH_REMATCH[1]}"
            value="${value#\'}" ; value="${value%\'}"
            value="${value#\"}" ; value="${value%\"}"
            break
        fi
    done < "$ENV_PATH"
    if [[ -z "$value" ]]; then
        echo "error: $key not found in .env.local" >&2
        exit 1
    fi
    printf '%s' "$value"
}

PROD_URL="$(read_env DATABASE_URL)"
DEV_URL="$(read_env DEV_DATABASE_URL)"

if [[ "$DIRECTION" == "prod-to-dev" ]]; then
    SOURCE_URL="$PROD_URL" TARGET_URL="$DEV_URL"
    SRC_LABEL="prod" TGT_LABEL="dev"
else
    SOURCE_URL="$DEV_URL" TARGET_URL="$PROD_URL"
    SRC_LABEL="dev" TGT_LABEL="prod"
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
echo "  Source (${SRC_LABEL}) : postgres://${SRC_USER}@${SRC_HOST}:${SRC_PORT}/${SRC_NAME}"
echo "  Target (${TGT_LABEL}) : postgres://${TGT_USER}@${TGT_HOST}:${TGT_PORT}/${TGT_NAME}"
echo ""

if [[ "$TGT_LABEL" == "prod" ]]; then
    echo "!!! DANGER: you are about to OVERWRITE PRODUCTION with dev data. !!!"
    echo "!!! All live production data will be permanently deleted.        !!!"
    echo ""
    read -r -p "Type 'overwrite prod' to continue: " CONFIRM
    echo ""
    if [[ "$CONFIRM" != "overwrite prod" ]]; then
        echo "aborted."
        exit 0
    fi
elif [[ "$FORCE" == false ]]; then
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
