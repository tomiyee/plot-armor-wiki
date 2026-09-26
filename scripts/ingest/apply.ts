/**
 * Database writes for approved ingest proposals. Imported by `review.ts`;
 * each function is one transaction and every write is stamped at chapter N.
 * Reuses the app's write helpers so revision invariants stay identical to
 * the in-app editor and suggestion approval paths.
 */
import { db } from "@/db/index";
import { chapterSynopses } from "@/db/schema";
import { fetchPageContentAtIdx } from "@/data/pages/queries";
import { applyPageContentRevision } from "@/app/[serial]/[page]/revisionHelpers";
import { createPageRecord } from "@/lib/createPageRecord";

/** Target chapter for all writes. */
export type ApplyTarget = { serialId: number; chapterId: number; chapterIdx: number; dryRun: boolean };

/** Thrown when the live page no longer matches the base the proposal was made against. */
export class StaleError extends Error {}

/** Upserts the chapter synopsis (same write as `approveSynopsisSuggestion`). */
export async function applySynopsis(t: ApplyTarget, content: string): Promise<void> {
  if (t.dryRun) {
    console.log(`[dry-run] upsert chapter_synopses chapter=${t.chapterId} (${content.length} chars)`);
    return;
  }
  await db
    .insert(chapterSynopses)
    .values({ chapterId: t.chapterId, content })
    .onConflictDoUpdate({ target: chapterSynopses.chapterId, set: { content, updatedAt: new Date() } });
}

/**
 * Creates a page introduced at chapter N under `parentPageId`, with its body
 * as the first content revision. Returns the new page id (-1 in dry-run).
 */
export async function applyNewPage(
  t: ApplyTarget,
  page: { title: string; parentPageId: number; content: string },
): Promise<number> {
  if (t.dryRun) {
    console.log(
      `[dry-run] create page "${page.title}" intro=${t.chapterId} parent=${page.parentPageId} (${page.content.length} chars)`,
    );
    return -1;
  }
  return db.transaction(async (tx) => {
    const { id } = await createPageRecord(
      { serialId: t.serialId, name: page.title.trim(), introChapterId: t.chapterId, parentPageId: page.parentPageId },
      tx,
    );
    await applyPageContentRevision(tx, id, t.chapterId, t.chapterIdx, page.content);
    return id;
  });
}

/**
 * Writes `content` as the page body at chapter N after a stale check: the
 * page's live content at N must still equal `baseContent` from context.json.
 */
export async function applyPageUpdate(
  t: ApplyTarget,
  pageId: number,
  baseContent: string,
  content: string,
): Promise<void> {
  const live = await fetchPageContentAtIdx(pageId, t.chapterIdx);
  if (live.content !== baseContent) {
    throw new StaleError(
      `Page ${pageId} changed since export - re-run export-context.ts and regenerate proposals.`,
    );
  }
  if (t.dryRun) {
    console.log(`[dry-run] page ${pageId} content revision at chapter ${t.chapterId} (${content.length} chars)`);
    return;
  }
  await db.transaction((tx) => applyPageContentRevision(tx, pageId, t.chapterId, t.chapterIdx, content));
}
