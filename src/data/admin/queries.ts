import type { Db } from "@/db/index";
import {
  chapterSynopses,
  chapters,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  pageTitles,
  pages,
  serials,
  textMigrationBackups,
  textMigrationsApplied,
  volumes,
} from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type {
  TextMigrationRowPk,
  TextMigrationTarget,
} from "@/admin/text-migrations/types";

/** A stored markdown value that a text migration may rewrite. */
export type TextMigrationCandidate = {
  table: TextMigrationTarget;
  pk: TextMigrationRowPk;
  serialSlug: string;
  serialTitle: string;
  /** Page title as of the revision's chapter; `null` for synopses. */
  pageTitle: string | null;
  chapterName: string;
  value: string;
};

/**
 * Page title in effect at the revision's chapter (latest `page_titles` row
 * with `idx <=` that chapter), falling back to the legacy `pages.name`.
 */
function pageTitleAt(pageId: AnyColumn, chapterIdx: AnyColumn) {
  return sql<string>`coalesce((
    select ${pageTitles.title} from ${pageTitles}
    inner join ${chapters} as tc on tc.id = ${pageTitles.chapterId}
    where ${pageTitles.pageId} = ${pageId} and tc.idx <= ${chapterIdx}
    order by tc.idx desc limit 1
  ), ${pages.name})`;
}

/**
 * Fetches every non-null stored markdown value in the given target columns,
 * across all serials or only `serialSlug`. Takes an explicit `db` because the
 * admin tools switch between dev and prod at runtime. Unbounded by design: migrations must see every row, and
 * the admin tool only runs locally.
 *
 * @example
 * const rows = await fetchTextMigrationCandidates(await getAdminDb(), ["synopsis"], "the-wandering-inn");
 */
export async function fetchTextMigrationCandidates(
  db: Db,
  targets: TextMigrationTarget[],
  serialSlug?: string,
): Promise<TextMigrationCandidate[]> {
  const out: TextMigrationCandidate[] = [];
  const inSerial = serialSlug ? eq(serials.slug, serialSlug) : undefined;

  if (targets.includes("sectionContent")) {
    const rows = await db
      .select({
        pageId: pageContentRevisions.pageId,
        chapterId: pageContentRevisions.chapterId,
        value: pageContentRevisions.content,
        serialSlug: serials.slug,
        serialTitle: serials.title,
        pageTitle: pageTitleAt(pageContentRevisions.pageId, chapters.idx),
        chapterName: chapters.displayName,
      })
      .from(pageContentRevisions)
      .innerJoin(pages, eq(pages.id, pageContentRevisions.pageId))
      .innerJoin(serials, eq(serials.id, pages.serialId))
      .innerJoin(chapters, eq(chapters.id, pageContentRevisions.chapterId))
      .where(and(isNotNull(pageContentRevisions.content), inSerial))
      .orderBy(pageContentRevisions.pageId, pageContentRevisions.chapterId);
    for (const r of rows)
      out.push({
        table: "sectionContent",
        pk: { pageId: r.pageId, chapterId: r.chapterId },
        serialSlug: r.serialSlug,
        serialTitle: r.serialTitle,
        pageTitle: r.pageTitle,
        chapterName: r.chapterName,
        value: r.value ?? "",
      });
  }

  if (targets.includes("infoboxValue")) {
    const rows = await db
      .select({
        pageId: pageInfoboxContentRevisions.pageId,
        chapterId: pageInfoboxContentRevisions.chapterId,
        value: pageInfoboxContentRevisions.content,
        serialSlug: serials.slug,
        serialTitle: serials.title,
        pageTitle: pageTitleAt(
          pageInfoboxContentRevisions.pageId,
          chapters.idx,
        ),
        chapterName: chapters.displayName,
      })
      .from(pageInfoboxContentRevisions)
      .innerJoin(pages, eq(pages.id, pageInfoboxContentRevisions.pageId))
      .innerJoin(serials, eq(serials.id, pages.serialId))
      .innerJoin(
        chapters,
        eq(chapters.id, pageInfoboxContentRevisions.chapterId),
      )
      .where(and(isNotNull(pageInfoboxContentRevisions.content), inSerial))
      .orderBy(
        pageInfoboxContentRevisions.pageId,
        pageInfoboxContentRevisions.chapterId,
      );
    for (const r of rows)
      out.push({
        table: "infoboxValue",
        pk: { pageId: r.pageId, chapterId: r.chapterId },
        serialSlug: r.serialSlug,
        serialTitle: r.serialTitle,
        pageTitle: r.pageTitle,
        chapterName: r.chapterName,
        value: r.value ?? "",
      });
  }

  if (targets.includes("synopsis")) {
    const rows = await db
      .select({
        chapterId: chapterSynopses.chapterId,
        value: chapterSynopses.content,
        serialSlug: serials.slug,
        serialTitle: serials.title,
        chapterName: chapters.displayName,
      })
      .from(chapterSynopses)
      .innerJoin(chapters, eq(chapters.id, chapterSynopses.chapterId))
      .innerJoin(volumes, eq(volumes.id, chapters.volumeId))
      .innerJoin(serials, eq(serials.id, volumes.serialId))
      .where(inSerial)
      .orderBy(chapterSynopses.chapterId);
    for (const r of rows)
      out.push({
        table: "synopsis",
        pk: { chapterId: r.chapterId },
        serialSlug: r.serialSlug,
        serialTitle: r.serialTitle,
        pageTitle: null,
        chapterName: r.chapterName,
        value: r.value,
      });
  }

  return out;
}

/**
 * Returns the applied-ledger row for a text migration, or `undefined` if it
 * has not been applied to the current database.
 */
export async function fetchTextMigrationApplied(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(textMigrationsApplied)
    .where(eq(textMigrationsApplied.id, id));
  return row;
}

/**
 * All applied text-migration ledger rows, for the index page status column.
 * Returns `null` when the ledger table doesn't exist on this DB yet (drizzle
 * migration `0007` not applied), so the UI can say so instead of crashing.
 */
export async function fetchAllTextMigrationsApplied(db: Db) {
  if (!(await hasTextMigrationTables(db))) return null;
  return db.select().from(textMigrationsApplied);
}

/** Whether this DB has the text-migration ledger tables (drizzle migration `0007`). */
export async function hasTextMigrationTables(db: Db): Promise<boolean> {
  const [row] = await db.execute<{ ok: boolean }>(
    sql`select to_regclass('public.text_migrations_applied') is not null as ok`,
  );
  return !!row?.ok;
}

/**
 * Every pre-migration backup row recorded when `migrationId` was applied.
 * Accepts a transaction too, so undo reads and restores atomically.
 */
export async function fetchTextMigrationBackups(
  db: Pick<Db, "select">,
  migrationId: string,
) {
  return db
    .select()
    .from(textMigrationBackups)
    .where(eq(textMigrationBackups.migrationId, migrationId))
    .orderBy(textMigrationBackups.id);
}
