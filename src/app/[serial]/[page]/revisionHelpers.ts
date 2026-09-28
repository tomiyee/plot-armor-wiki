import { chapters, pageContentRevisions, pageInfoboxContentRevisions } from "@/db/schema";
import { and, eq, lt, max } from "drizzle-orm";
import { db } from "@/db/index";

/** Drizzle transaction type inferred from the db client. */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/**
 * Applies the page body content revision inside an existing transaction,
 * enforcing the invariant that consecutive revisions must differ.
 *
 * 1. Fetches the previous revision (highest `chapters.idx` strictly less than
 *    `targetIdx`) to determine baseline content.
 * 2. If the proposed content matches the previous content — or is empty when
 *    `deleteIfEmpty` is true — **deletes** any existing revision at
 *    `targetChapterId` so the reader falls through to the prior revision.
 * 3. Otherwise **upserts** the revision at `targetChapterId`.
 *
 * This is the canonical write-invariant path shared by `savePageContent` and
 * `approveSuggestion`. Any future change to the write invariant should be
 * made here.
 *
 * @example
 * await db.transaction(async (tx) => {
 *   await applyPageContentRevision(tx, pageId, chapterId, chapterIdx, "New body text");
 * });
 */
export async function applyPageContentRevision(
  tx: Tx,
  pageId: number,
  targetChapterId: number,
  targetIdx: number,
  content: string,
  /**
   * When true, an empty (blank/whitespace) `content` is treated the same as
   * a match with the previous revision and causes the revision at
   * `targetChapterId` to be deleted. `savePageContent` passes true;
   * `approveSuggestion` passes false because suggestions should never arrive
   * with empty content.
   */
  deleteIfEmpty = false,
): Promise<void> {
  let prevContent = "";
  if (targetIdx > 0) {
    const prevMaxSq = tx
      .select({ maxPrevIdx: max(chapters.idx).as("max_prev_idx") })
      .from(pageContentRevisions)
      .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
      .where(and(eq(pageContentRevisions.pageId, pageId), lt(chapters.idx, targetIdx)))
      .as("prev_max_sq");

    const [prevRevision] = await tx
      .select({ content: pageContentRevisions.content })
      .from(pageContentRevisions)
      .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
      .innerJoin(prevMaxSq, eq(chapters.idx, prevMaxSq.maxPrevIdx))
      .where(eq(pageContentRevisions.pageId, pageId));

    prevContent = prevRevision?.content ?? "";
  }

  if ((deleteIfEmpty && !content.trim()) || content === prevContent) {
    // Uphold the invariant: consecutive revisions must differ.
    // Also never write empty revisions (when deleteIfEmpty is requested).
    await tx
      .delete(pageContentRevisions)
      .where(
        and(
          eq(pageContentRevisions.pageId, pageId),
          eq(pageContentRevisions.chapterId, targetChapterId),
        ),
      );
    return;
  }

  await tx
    .insert(pageContentRevisions)
    .values({ pageId, chapterId: targetChapterId, content })
    .onConflictDoUpdate({
      target: [pageContentRevisions.pageId, pageContentRevisions.chapterId],
      set: { content },
    });
}

/**
 * Applies the page infobox content + image revision inside an existing
 * transaction, following the same write invariant as `applyPageContentRevision`.
 * The row is deleted when both `content` is empty (or unchanged, per
 * `deleteIfEmpty`) AND `imageUrl` is null/unchanged from the previous
 * revision — a partial change (e.g. only the image changed) still writes.
 *
 * @example
 * await db.transaction(async (tx) => {
 *   await applyPageInfoboxRevision(tx, pageId, chapterId, chapterIdx, "**Age:** 19", "https://…");
 * });
 */
export async function applyPageInfoboxRevision(
  tx: Tx,
  pageId: number,
  targetChapterId: number,
  targetIdx: number,
  content: string,
  imageUrl: string | null,
  deleteIfEmpty = false,
): Promise<void> {
  let prevContent = "";
  let prevImageUrl: string | null = null;
  if (targetIdx > 0) {
    const prevMaxSq = tx
      .select({ maxPrevIdx: max(chapters.idx).as("max_prev_idx") })
      .from(pageInfoboxContentRevisions)
      .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
      .where(
        and(
          eq(pageInfoboxContentRevisions.pageId, pageId),
          lt(chapters.idx, targetIdx),
        ),
      )
      .as("ib_prev_max_sq");

    const [prevRevision] = await tx
      .select({
        content: pageInfoboxContentRevisions.content,
        imageUrl: pageInfoboxContentRevisions.imageUrl,
      })
      .from(pageInfoboxContentRevisions)
      .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
      .innerJoin(prevMaxSq, eq(chapters.idx, prevMaxSq.maxPrevIdx))
      .where(eq(pageInfoboxContentRevisions.pageId, pageId));

    prevContent = prevRevision?.content ?? "";
    prevImageUrl = prevRevision?.imageUrl ?? null;
  }

  const contentUnchanged = (deleteIfEmpty && !content.trim()) || content === prevContent;
  const imageUnchanged = imageUrl === prevImageUrl;
  const isEmpty = (deleteIfEmpty ? !content.trim() : content === "") && imageUrl === null;

  if ((contentUnchanged && imageUnchanged) || isEmpty) {
    await tx
      .delete(pageInfoboxContentRevisions)
      .where(
        and(
          eq(pageInfoboxContentRevisions.pageId, pageId),
          eq(pageInfoboxContentRevisions.chapterId, targetChapterId),
        ),
      );
    return;
  }

  await tx
    .insert(pageInfoboxContentRevisions)
    .values({ pageId, chapterId: targetChapterId, content, imageUrl })
    .onConflictDoUpdate({
      target: [
        pageInfoboxContentRevisions.pageId,
        pageInfoboxContentRevisions.chapterId,
      ],
      set: { content, imageUrl },
    });
}
