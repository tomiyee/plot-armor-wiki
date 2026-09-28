/**
 * One-off backfill for the multi-section -> single-content page collapse (#238).
 *
 * Migrates the wall-clock-versioned section/infobox-row structure plus their
 * chapter-versioned content revisions into the new single-content tables
 * added by `drizzle/0005_add_single_content_page_revisions.sql`:
 *
 *   - page_sections + page_section_revisions      -> page_content_revisions
 *   - page_infobox_sections + page_infobox_revisions
 *     + page_infobox_image_revisions               -> page_infobox_content_revisions
 *
 * The legacy tables above are queried with raw SQL (rather than through
 * `src/db/schema.ts`) because this script is meant to run in the window
 * between migration 0005 (additive) and migration 0006 (which drops those
 * tables) - by the time 0006 has landed, schema.ts no longer exports them.
 * Raw SQL keeps the script runnable against a database that still has the
 * legacy tables regardless of which schema.ts revision is checked out.
 *
 * For each page, every distinct chapter idx at which ANY section/infobox row
 * changed gets one merged snapshot: the first (lead) section's content is
 * used verbatim (no heading - this matches how it renders today with no
 * heading), and every subsequent section is prefixed with `## {name}`. This
 * mirrors the current reader-facing rendering in PageReadView so the merged
 * markdown reads identically to what a reader already sees. A section with
 * no content yet at a given idx is omitted entirely (rather than emitting a
 * placeholder), matching the fact that revisions are never written empty.
 *
 * Consecutive-duplicate revisions are collapsed (a merged snapshot equal to
 * the previously emitted one is skipped) to match the "revisions must
 * differ" invariant enforced elsewhere by `applyPageContentRevision`.
 *
 * Per the resolved design decisions, pending suggestions are DELETED (not
 * converted) - the app has no users yet, so there is nothing to preserve.
 *
 * Idempotent: clears both destination tables before writing, so it is safe
 * to re-run against the same database during testing.
 *
 * Run once, after migration 0005 is applied, and before migration 0006 (the
 * destructive migration that drops the legacy per-section tables):
 *
 *   npx tsx scripts/migrate-single-section.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import {
  pages,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  pageSuggestions,
} from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set - populate .env.local before running this script.",
  );
}

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

type LegacySection = { id: number; name: string; displayOrder: number };
type LegacyInfoboxRow = { id: number; label: string; displayOrder: number };
type SectionRevisionRow = {
  sectionId: number;
  chapterId: number;
  idx: number;
  content: string | null;
};
type InfoboxRevisionRow = {
  infoboxSectionId: number;
  chapterId: number;
  idx: number;
  content: string | null;
};
type ImageRevisionRow = { chapterId: number; idx: number; imageUrl: string | null };

/** Merges the lead section verbatim, then `## {name}` + content for the rest. Omits sections with no content yet. */
function mergeBody(
  sections: LegacySection[],
  contentBySectionId: Map<number, string>,
): string {
  const parts: string[] = [];
  sections.forEach((s, i) => {
    const content = contentBySectionId.get(s.id);
    if (!content) return;
    parts.push(i === 0 ? content : `## ${s.name}\n\n${content}`);
  });
  return parts.join("\n\n").trim();
}

/** Merges infobox rows as `**{label}**` on its own line above `{content}`, one block per non-empty row. */
function mergeInfobox(
  rows: LegacyInfoboxRow[],
  contentByRowId: Map<number, string>,
): string {
  return rows
    .map((r) => {
      const content = contentByRowId.get(r.id);
      return content ? `**${r.label}**\n\n${content}` : null;
    })
    .filter((x): x is string => x !== null)
    .join("\n\n");
}

async function migratePageBody(pageId: number): Promise<void> {
  const sectionsResult = await db.execute<LegacySection>(sql`
    SELECT id, name, display_order AS "displayOrder"
    FROM page_sections
    WHERE page_id = ${pageId} AND deleted_at IS NULL
    ORDER BY display_order ASC
  `);
  const sections = [...sectionsResult];
  if (sections.length === 0) return;
  // Non-deleted section ids, used below to ignore revisions belonging to a
  // deleted section (mergeBody only ever looks up ids present in `sections`).
  const liveSectionIds = new Set(sections.map((s) => s.id));

  // Scoped by page_id only (not section_id) - passing a JS array into a raw
  // `= ANY(${...})` clause does not bind correctly through postgres.js/drizzle,
  // and filtering client-side below is just as correct here since revisions
  // for deleted sections are simply never looked up during merge.
  const revisionsResult = await db.execute<SectionRevisionRow>(sql`
    SELECT r.section_id AS "sectionId", r.chapter_id AS "chapterId", c.idx, r.content
    FROM page_section_revisions r
    INNER JOIN chapters c ON r.chapter_id = c.id
    WHERE r.page_id = ${pageId}
    ORDER BY c.idx ASC
  `);
  const revisions = [...revisionsResult].filter((r) =>
    liveSectionIds.has(r.sectionId),
  );
  if (revisions.length === 0) return;

  // Distinct chapters touched by any section revision, in chronological order.
  const chapterIdxById = new Map<number, number>();
  for (const r of revisions) chapterIdxById.set(r.chapterId, r.idx);
  const orderedChapterIds = [...chapterIdxById.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([chapterId]) => chapterId);

  const contentBySectionId = new Map<number, string>();
  let lastEmitted: string | null = null;

  for (const chapterId of orderedChapterIds) {
    for (const r of revisions) {
      if (r.chapterId === chapterId) {
        contentBySectionId.set(r.sectionId, r.content ?? "");
      }
    }

    const merged = mergeBody(sections, contentBySectionId);
    if (!merged || merged === lastEmitted) continue;

    await db
      .insert(pageContentRevisions)
      .values({ pageId, chapterId, content: merged })
      .onConflictDoUpdate({
        target: [pageContentRevisions.pageId, pageContentRevisions.chapterId],
        set: { content: merged },
      });
    lastEmitted = merged;
  }
}

async function migratePageInfobox(pageId: number): Promise<void> {
  const rowsResult = await db.execute<LegacyInfoboxRow>(sql`
    SELECT id, label, display_order AS "displayOrder"
    FROM page_infobox_sections
    WHERE page_id = ${pageId} AND deleted_at IS NULL
    ORDER BY display_order ASC
  `);
  const rows = [...rowsResult];
  // Non-deleted row ids, used to ignore revisions belonging to a deleted row
  // (same rationale as liveSectionIds in migratePageBody above).
  const liveRowIds = new Set(rows.map((r) => r.id));

  const [contentRevisionsResult, imageRevisionsResult] = await Promise.all([
    db.execute<InfoboxRevisionRow>(sql`
      SELECT r.infobox_section_id AS "infoboxSectionId", r.chapter_id AS "chapterId", c.idx, r.content
      FROM page_infobox_revisions r
      INNER JOIN chapters c ON r.chapter_id = c.id
      WHERE r.page_id = ${pageId}
      ORDER BY c.idx ASC
    `),
    db.execute<ImageRevisionRow>(sql`
      SELECT r.chapter_id AS "chapterId", c.idx, r.image_url AS "imageUrl"
      FROM page_infobox_image_revisions r
      INNER JOIN chapters c ON r.chapter_id = c.id
      WHERE r.page_id = ${pageId}
      ORDER BY c.idx ASC
    `),
  ]);
  const contentRevisions = [...contentRevisionsResult].filter((r) =>
    liveRowIds.has(r.infoboxSectionId),
  );
  const imageRevisions = [...imageRevisionsResult];

  if (contentRevisions.length === 0 && imageRevisions.length === 0) return;

  const chapterIdxById = new Map<number, number>();
  for (const r of contentRevisions) chapterIdxById.set(r.chapterId, r.idx);
  for (const r of imageRevisions) chapterIdxById.set(r.chapterId, r.idx);
  const orderedChapterIds = [...chapterIdxById.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([chapterId]) => chapterId);

  const contentByRowId = new Map<number, string>();
  let currentImageUrl: string | null = null;
  let lastEmittedContent: string | null = null;
  let lastEmittedImage: string | null = null;
  let hasEmittedAny = false;

  for (const chapterId of orderedChapterIds) {
    for (const r of contentRevisions) {
      if (r.chapterId === chapterId) {
        contentByRowId.set(r.infoboxSectionId, r.content ?? "");
      }
    }
    const imgRev = imageRevisions.find((r) => r.chapterId === chapterId);
    if (imgRev) currentImageUrl = imgRev.imageUrl;

    const mergedContent = mergeInfobox(rows, contentByRowId) || null;

    const isEmpty = mergedContent === null && currentImageUrl === null;
    const isUnchanged =
      hasEmittedAny &&
      mergedContent === lastEmittedContent &&
      currentImageUrl === lastEmittedImage;
    if (isEmpty || isUnchanged) continue;

    await db
      .insert(pageInfoboxContentRevisions)
      .values({ pageId, chapterId, content: mergedContent, imageUrl: currentImageUrl })
      .onConflictDoUpdate({
        target: [
          pageInfoboxContentRevisions.pageId,
          pageInfoboxContentRevisions.chapterId,
        ],
        set: { content: mergedContent, imageUrl: currentImageUrl },
      });
    lastEmittedContent = mergedContent;
    lastEmittedImage = currentImageUrl;
    hasEmittedAny = true;
  }
}

async function main() {
  console.log("Clearing page_content_revisions / page_infobox_content_revisions for idempotency...");
  await db.delete(pageContentRevisions);
  await db.delete(pageInfoboxContentRevisions);

  const allPages = await db.select({ id: pages.id, name: pages.name }).from(pages);
  console.log(`Backfilling ${allPages.length} page(s)...`);

  for (const page of allPages) {
    await migratePageBody(page.id);
    await migratePageInfobox(page.id);
  }

  console.log(
    "Deleting all pending/reviewed page suggestions (no users yet - see decision #4 in the design doc)...",
  );
  const deleted = await db.delete(pageSuggestions).returning({ id: pageSuggestions.id });
  console.log(
    `Deleted ${deleted.length} suggestion(s) (child change rows cascade automatically).`,
  );

  console.log("Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
