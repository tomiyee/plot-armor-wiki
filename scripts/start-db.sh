#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${1:-plotarmor-db}"
POSTGRES_IMAGE="${2:-postgres:16}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_PATH="$SCRIPT_DIR/../.env.local"

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

# Parse postgres://user:password@host:port/dbname
if [[ "$DATABASE_URL" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?/(.+)$ ]]; then
    DB_USER="${BASH_REMATCH[2]}"
    DB_PASSWORD="${BASH_REMATCH[3]}"
    DB_HOST="${BASH_REMATCH[4]}"
    DB_PORT="${BASH_REMATCH[6]:-5432}"
    DB_NAME="${BASH_REMATCH[7]}"
else
    echo "error: could not parse DATABASE_URL. Expected format: postgres://user:password@localhost:5432/dbname" >&2
    exit 1
fi

if [[ "$DB_HOST" != "localhost" && "$DB_HOST" != "127.0.0.1" ]]; then
    echo "warning: DATABASE_URL points to '$DB_HOST' — this script is for local Docker only. Continuing anyway."
fi

if ! command -v docker &>/dev/null; then
    echo "error: docker not found in PATH. Install Docker and make sure the daemon is running, then try again." >&2
    exit 1
fi

EXISTING=$(docker ps -a --filter "name=^${CONTAINER_NAME}$" --format "{{.Names}}")
RUNNING=$(docker ps    --filter "name=^${CONTAINER_NAME}$" --format "{{.Names}}")

if [[ "$RUNNING" == "$CONTAINER_NAME" ]]; then
    echo "[$CONTAINER_NAME] already running on port $DB_PORT."
elif [[ "$EXISTING" == "$CONTAINER_NAME" ]]; then
    echo "[$CONTAINER_NAME] starting existing container..."
    docker start "$CONTAINER_NAME" > /dev/null
    echo "[$CONTAINER_NAME] started — postgres://$DB_USER@${DB_HOST}:${DB_PORT}/$DB_NAME"
else
    echo "[$CONTAINER_NAME] creating new container from $POSTGRES_IMAGE..."
    docker run \
        --name "$CONTAINER_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_DB="$DB_NAME" \
        -p "${DB_PORT}:5432" \
        -d "$POSTGRES_IMAGE" > /dev/null
    echo "[$CONTAINER_NAME] created and started — postgres://$DB_USER@${DB_HOST}:${DB_PORT}/$DB_NAME"
fi
