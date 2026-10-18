import { db } from "@/db/index";
import {
  chapterSynopses,
  chapters,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  pages,
  serials,
  textMigrationsApplied,
  volumes,
} from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import type {
  TextMigrationRowPk,
  TextMigrationTarget,
} from "@/admin/text-migrations/types";

/** A stored markdown value that a text migration may rewrite. */
export type TextMigrationCandidate = {
  table: TextMigrationTarget;
  pk: TextMigrationRowPk;
  serialSlug: string;
  value: string;
};

/**
 * Fetches every non-null stored markdown value in the given target columns,
 * across all serials. Unbounded by design: migrations must see every row, and
 * the admin tool only runs locally.
 *
 * @example
 * const rows = await fetchTextMigrationCandidates(["synopsis"]);
 */
export async function fetchTextMigrationCandidates(
  targets: TextMigrationTarget[],
): Promise<TextMigrationCandidate[]> {
  const out: TextMigrationCandidate[] = [];

  if (targets.includes("sectionContent")) {
    const rows = await db
      .select({
        pageId: pageContentRevisions.pageId,
        chapterId: pageContentRevisions.chapterId,
        value: pageContentRevisions.content,
        serialSlug: serials.slug,
      })
      .from(pageContentRevisions)
      .innerJoin(pages, eq(pages.id, pageContentRevisions.pageId))
      .innerJoin(serials, eq(serials.id, pages.serialId))
      .where(isNotNull(pageContentRevisions.content))
      .orderBy(pageContentRevisions.pageId, pageContentRevisions.chapterId);
    for (const r of rows)
      out.push({
        table: "sectionContent",
        pk: { pageId: r.pageId, chapterId: r.chapterId },
        serialSlug: r.serialSlug,
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
      })
      .from(pageInfoboxContentRevisions)
      .innerJoin(pages, eq(pages.id, pageInfoboxContentRevisions.pageId))
      .innerJoin(serials, eq(serials.id, pages.serialId))
      .where(isNotNull(pageInfoboxContentRevisions.content))
      .orderBy(
        pageInfoboxContentRevisions.pageId,
        pageInfoboxContentRevisions.chapterId,
      );
    for (const r of rows)
      out.push({
        table: "infoboxValue",
        pk: { pageId: r.pageId, chapterId: r.chapterId },
        serialSlug: r.serialSlug,
        value: r.value ?? "",
      });
  }

  if (targets.includes("synopsis")) {
    const rows = await db
      .select({
        chapterId: chapterSynopses.chapterId,
        value: chapterSynopses.content,
        serialSlug: serials.slug,
      })
      .from(chapterSynopses)
      .innerJoin(chapters, eq(chapters.id, chapterSynopses.chapterId))
      .innerJoin(volumes, eq(volumes.id, chapters.volumeId))
      .innerJoin(serials, eq(serials.id, volumes.serialId))
      .orderBy(chapterSynopses.chapterId);
    for (const r of rows)
      out.push({
        table: "synopsis",
        pk: { chapterId: r.chapterId },
        serialSlug: r.serialSlug,
        value: r.value,
      });
  }

  return out;
}

/**
 * Returns the applied-ledger row for a text migration, or `undefined` if it
 * has not been applied to the current database.
 */
export async function fetchTextMigrationApplied(id: string) {
  const [row] = await db
    .select()
    .from(textMigrationsApplied)
    .where(eq(textMigrationsApplied.id, id));
  return row;
}

/** All applied text-migration ledger rows, for the index page status column. */
export async function fetchAllTextMigrationsApplied() {
  return db.select().from(textMigrationsApplied);
}
