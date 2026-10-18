"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/index";
import {
  chapterSynopses,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  textMigrationBackups,
  textMigrationsApplied,
} from "@/db/schema";
import { requireSiteAdmin } from "@/lib/auth-guard";
import { getTextMigration } from "@/admin/text-migrations/registry";
import type {
  TextMigration,
  TextMigrationPreviewRow,
} from "@/admin/text-migrations/types";
import {
  fetchTextMigrationApplied,
  fetchTextMigrationCandidates,
} from "@/data/admin/queries";

const TABLE_NAMES = {
  sectionContent: "page_content_revisions",
  infoboxValue: "page_infobox_content_revisions",
  synopsis: "chapter_synopses",
} as const;

async function computeChangedRows(
  migration: TextMigration,
): Promise<TextMigrationPreviewRow[]> {
  const candidates = await fetchTextMigrationCandidates(migration.targets);
  const changed: TextMigrationPreviewRow[] = [];
  for (const c of candidates) {
    const after = migration.transform(c.value);
    if (after === c.value) continue;
    changed.push({
      table: c.table,
      pk: c.pk,
      serialSlug: c.serialSlug,
      before: c.value,
      after,
      nonIdempotent: migration.transform(after) !== after,
    });
  }
  return changed;
}

/**
 * Dry-runs a text migration and returns one page of rows it would change,
 * plus totals so the UI can paginate and warn about non-idempotent rows.
 */
export async function previewMigration(
  id: string,
  opts: { limit: number; offset: number },
): Promise<
  | {
      rows: TextMigrationPreviewRow[];
      total: number;
      nonIdempotentCount: number;
    }
  | { error: string }
> {
  await requireSiteAdmin();
  const migration = getTextMigration(id);
  if (!migration) return { error: `Unknown migration: ${id}` };
  const changed = await computeChangedRows(migration);
  return {
    rows: changed.slice(opts.offset, opts.offset + opts.limit),
    total: changed.length,
    nonIdempotentCount: changed.filter((r) => r.nonIdempotent).length,
  };
}

/**
 * Applies a text migration in one transaction, rewriting revisions in place
 * (no new chapter revisions: representation changed, not content). Backs up
 * every rewritten value and records the migration as applied; refuses to run
 * twice.
 */
export async function applyMigration(
  id: string,
): Promise<{ error?: string; rowsChanged?: number }> {
  await requireSiteAdmin();
  const migration = getTextMigration(id);
  if (!migration) return { error: `Unknown migration: ${id}` };
  if (await fetchTextMigrationApplied(id))
    return { error: "Migration has already been applied." };

  const changed = await computeChangedRows(migration);

  try {
    await db.transaction(async (tx) => {
      // Ledger row first: backups FK to it, and its PK makes a concurrent
      // second apply fail instead of double-applying.
      await tx
        .insert(textMigrationsApplied)
        .values({ id, rowsChanged: changed.length });

      for (const row of changed) {
        await tx.insert(textMigrationBackups).values({
          migrationId: id,
          tableName: TABLE_NAMES[row.table],
          rowPk: row.pk,
          before: row.before,
        });

        if (row.table === "synopsis") {
          await tx
            .update(chapterSynopses)
            .set({ content: row.after })
            .where(eq(chapterSynopses.chapterId, row.pk.chapterId));
        } else if ("pageId" in row.pk) {
          const t =
            row.table === "sectionContent"
              ? pageContentRevisions
              : pageInfoboxContentRevisions;
          await tx
            .update(t)
            .set({ content: row.after })
            .where(
              and(
                eq(t.pageId, row.pk.pageId),
                eq(t.chapterId, row.pk.chapterId),
              ),
            );
        }
      }
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  return { rowsChanged: changed.length };
}
