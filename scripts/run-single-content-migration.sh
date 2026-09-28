#!/usr/bin/env bash
# Orchestrate the multi-section -> single-content migration (see commit 9bf8a41,
# `scripts/migrate-single-section.ts`, and `scripts/README.md`).
#
# `drizzle-kit migrate` has no flag to stop at a specific migration - it applies
# every pending entry in drizzle/meta/_journal.json in one shot. This script
# pauses between migration 0005 (additive) and 0006 (destructive - drops the
# legacy per-section tables) so the backfill script can run in between:
#
#   1. Hide 0006 from drizzle-kit (move the .sql file aside, drop its journal entry)
#   2. Apply migrations 0000-0005
#   3. Run the backfill script (merges legacy sections into single-content rows)
#   4. Restore 0006 and its journal entry
#   5. Apply migration 0006 (destructive - drops the legacy tables)
#
# Usage:
#   ./scripts/run-single-content-migration.sh [--force]
#
# Arguments:
#   --force — skip the confirmation prompt before the destructive step 5
#
# Safe to re-run: if a previous run was interrupted between steps 1 and 4, this
# script restores that partial state before starting over.
#
# WARNING: Step 5 permanently drops the legacy per-section and template tables.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR/.."
cd "$REPO_ROOT"

MIGRATION_SQL="drizzle/0006_drop_legacy_per_section_tables.sql"
MIGRATION_BAK="$MIGRATION_SQL.bak"
JOURNAL="drizzle/meta/_journal.json"

FORCE=false
for arg in "$@"; do
    case "$arg" in
        --force) FORCE=true ;;
        *)
            echo "error: unknown argument '$arg'" >&2
            echo "Usage: ./scripts/run-single-content-migration.sh [--force]" >&2
            exit 1
            ;;
    esac
done

# ── Reset any partial state left by a previous interrupted run ────────────────

if [[ -f "$MIGRATION_BAK" ]]; then
    echo "Found leftover state from a previous run - restoring migration 0006 before starting over ..."
    mv "$MIGRATION_BAK" "$MIGRATION_SQL"
    git checkout -- "$JOURNAL"
fi

# ── Step 1: hide migration 0006 ────────────────────────────────────────────────

echo "Step 1/5: Hiding migration 0006 so drizzle-kit stops after 0005 ..."
mv "$MIGRATION_SQL" "$MIGRATION_BAK"
node -e "
const fs = require('fs');
const p = '$JOURNAL';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.entries.pop();
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
"

# ── Step 2: apply migrations 0000-0005 ─────────────────────────────────────────

echo "Step 2/5: Applying migrations 0000-0005 ..."
npx drizzle-kit migrate

# ── Step 3: run the backfill script ────────────────────────────────────────────

echo "Step 3/5: Running the single-content backfill script ..."
npx tsx scripts/migrate-single-section.ts

# ── Step 4: restore migration 0006 ─────────────────────────────────────────────

echo "Step 4/5: Restoring migration 0006 and its journal entry ..."
mv "$MIGRATION_BAK" "$MIGRATION_SQL"
git checkout -- "$JOURNAL"

# ── Step 5: apply the destructive migration ────────────────────────────────────

if [[ "$FORCE" == false ]]; then
    echo ""
    echo "WARNING: Step 5 permanently drops the legacy per-section and template tables."
    echo ""
    read -r -p "Type 'yes' to continue: " CONFIRM
    echo ""
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "Aborted before step 5. Migration 0006 and its journal entry are already restored, so you can re-run this script or 'npx drizzle-kit migrate' manually when ready."
        exit 0
    fi
fi

echo "Step 5/5: Applying migration 0006 (drops legacy per-section tables) ..."
npx drizzle-kit migrate

echo ""
echo "Done. Single-content migration complete."
