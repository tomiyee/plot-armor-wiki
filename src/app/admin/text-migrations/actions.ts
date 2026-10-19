"use server";

import { and, eq } from "drizzle-orm";
import type { TextMigrationRowPk } from "@/admin/text-migrations/types";
import type { Db, DbEnv } from "@/db/index";
import { getAdminDb, getAdminDbEnv } from "@/lib/admin-db";
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
  fetchTextMigrationBackups,
  fetchTextMigrationCandidates,
} from "@/data/admin/queries";

const TABLE_NAMES = {
  sectionContent: "page_content_revisions",
  infoboxValue: "page_infobox_content_revisions",
  synopsis: "chapter_synopses",
} as const;

async function computeChangedRows(
  db: Db,
  migration: TextMigration,
): Promise<TextMigrationPreviewRow[]> {
  const candidates = await fetchTextMigrationCandidates(
    db,
    migration.targets,
    migration.serialSlug,
  );
  const changed: TextMigrationPreviewRow[] = [];
  for (const c of candidates) {
    const after = migration.transform(c.value);
    if (after === c.value) continue;
    changed.push({
      table: c.table,
      pk: c.pk,
      serialSlug: c.serialSlug,
      serialTitle: c.serialTitle,
      pageTitle: c.pageTitle,
      chapterName: c.chapterName,
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
  const changed = await computeChangedRows(await getAdminDb(), migration);
  return {
    rows: changed.slice(opts.offset, opts.offset + opts.limit),
    total: changed.length,
    nonIdempotentCount: changed.filter((r) => r.nonIdempotent).length,
  };
}

/**
 * Applies a text migration to the admin-selected DB in one transaction, rewriting revisions in place
 * (no new chapter revisions: representation changed, not content). Backs up
 * every rewritten value and records the migration as applied; refuses to run
 * twice.
 */
export async function applyMigration(
  id: string,
  expectedEnv: DbEnv,
): Promise<{ error?: string; rowsChanged?: number }> {
  await requireSiteAdmin();
  const migration = getTextMigration(id);
  if (!migration) return { error: `Unknown migration: ${id}` };
  // Guards against the target being switched (e.g. in another tab) after the
  // admin reviewed the preview for a different database.
  const env = await getAdminDbEnv();
  if (env !== expectedEnv)
    return {
      error: `Target DB changed to ${env.toUpperCase()}; reload and review the preview.`,
    };
  const db = await getAdminDb();
  if (await fetchTextMigrationApplied(db, id))
    return { error: "Migration has already been applied." };

  const changed = await computeChangedRows(db, migration);

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

const TABLES_BY_NAME = {
  page_content_revisions: pageContentRevisions,
  page_infobox_content_revisions: pageInfoboxContentRevisions,
} as const;

/**
 * Reverts an applied text migration on the admin-selected DB: restores every
 * backed-up value, then deletes the backups and the applied-ledger row so the
 * migration can be re-applied later. Refuses (changing nothing) if any row
 * no longer holds the value the migration wrote, i.e. it was edited since,
 * because restoring would silently discard that edit.
 */
export async function undoMigration(
  id: string,
  expectedEnv: DbEnv,
): Promise<{ error?: string; rowsRestored?: number }> {
  await requireSiteAdmin();
  const migration = getTextMigration(id);
  if (!migration) return { error: `Unknown migration: ${id}` };
  const env = await getAdminDbEnv();
  if (env !== expectedEnv)
    return {
      error: `Target DB changed to ${env.toUpperCase()}; reload and try again.`,
    };
  const db = await getAdminDb();
  if (!(await fetchTextMigrationApplied(db, id)))
    return { error: "Migration is not applied." };

  try {
    const restored = await db.transaction(async (tx) => {
      const backups = await fetchTextMigrationBackups(tx, id);
      const conflicts: string[] = [];

      for (const b of backups) {
        const pk = b.rowPk as TextMigrationRowPk;
        const before = b.before ?? "";
        const written = migration.transform(before);

        if (b.tableName === "chapter_synopses") {
          const [cur] = await tx
            .select({ content: chapterSynopses.content })
            .from(chapterSynopses)
            .where(eq(chapterSynopses.chapterId, pk.chapterId));
          if (cur?.content !== written) {
            conflicts.push(`synopsis chapter ${pk.chapterId}`);
            continue;
          }
          await tx
            .update(chapterSynopses)
            .set({ content: before })
            .where(eq(chapterSynopses.chapterId, pk.chapterId));
        } else if (b.tableName in TABLES_BY_NAME && "pageId" in pk) {
          const t = TABLES_BY_NAME[b.tableName as keyof typeof TABLES_BY_NAME];
          const where = and(
            eq(t.pageId, pk.pageId),
            eq(t.chapterId, pk.chapterId),
          );
          const [cur] = await tx
            .select({ content: t.content })
            .from(t)
            .where(where);
          if (cur?.content !== written) {
            conflicts.push(
              `${b.tableName} page ${pk.pageId} chapter ${pk.chapterId}`,
            );
            continue;
          }
          await tx.update(t).set({ content: b.before }).where(where);
        } else {
          conflicts.push(`unknown backup target ${b.tableName}`);
        }
      }

      if (conflicts.length > 0)
        throw new Error(
          `${conflicts.length} row(s) were edited after the migration; nothing was undone. First: ${conflicts.slice(0, 5).join("; ")}`,
        );

      await tx
        .delete(textMigrationBackups)
        .where(eq(textMigrationBackups.migrationId, id));
      await tx
        .delete(textMigrationsApplied)
        .where(eq(textMigrationsApplied.id, id));
      return backups.length;
    });
    return { rowsRestored: restored };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
