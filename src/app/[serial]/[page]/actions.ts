"use server";

import { db } from "@/db/index";
import {
  pages,
  chapters,
  volumes,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  pageRelationships,
  pageTitles,
  chapterSynopses,
} from "@/db/schema";
import { and, asc, desc, eq, gt, lt, max, min, ne, or, sql } from "drizzle-orm";
import {
  requireSerialAdminBySlug,
  requireSerialAdminByPageId,
} from "@/lib/auth-guard";
import { applyPageContentRevision, applyPageInfoboxRevision } from "./revisionHelpers";
import { getSerialBySlug } from "@/data/serials/queries";
import { getChapterIdxById } from "@/data/chapters/queries";
import {
  resolvePageTitlesAtIdx,
  fetchActiveParentPagesAtIdx,
  fetchSerialPagesAtIdx,
  pageContentMaxIdxSq as buildPageContentMaxIdxSq,
  pageInfoboxMaxIdxSq as buildPageInfoboxMaxIdxSq,
} from "@/data/pages/queries";

/**
 * Resolves the latest chapter (highest idx) for a given serial.
 * Edits always write at head so the new version is immediately visible
 * to readers who are fully caught up.
 */
async function getHeadChapterId(serialId: number): Promise<number> {
  const [row] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId))
    .orderBy(desc(chapters.idx))
    .limit(1);

  if (!row) throw new Error("Serial has no chapters - cannot save content.");
  return row.id;
}

/**
 * Resolves the database IDs for a given serial and page slug.
 *
 * @param serialSlug - The URL-friendly slug identifier for the serial
 * @param pageSlug - The slug of the page to find
 * @returns An object containing the serial ID and page record
 * @throws Error if the serial or page is not found in the database
 */
async function resolvePageIds(serialSlug: string, pageSlug: string) {
  const serial = await getSerialBySlug(serialSlug);
  if (!serial) throw new Error("Serial not found");

  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
    .limit(1);
  if (!page) throw new Error("Page not found");

  return { serialId: serial.id, pageId: page.id };
}

/**
 * Saves a page's body content and infobox content/image at the specified
 * chapter, or the head chapter when no target is given. Passing
 * `targetChapterId` lets editors backfill or overwrite content at any
 * chapter without touching newer revisions.
 *
 * Each field is an upsert keyed by (pageId, chapterId). Readers at an
 * earlier chapter cutoff see the previous version via the max-idx subquery
 * read path.
 *
 * @example
 * // Write at head (default behaviour - UI passes undefined)
 * await savePageContent(serialSlug, pageSlug, content, infoboxContent, imageUrl);
 *
 * @example
 * // Write at a specific chapter (used by the chapter selector in edit mode)
 * await savePageContent(serialSlug, pageSlug, content, infoboxContent, imageUrl, chapterId);
 */
export async function savePageContent(
  serialSlug: string,
  pageSlug: string,
  content: string,
  infoboxContent: string,
  floaterImageUrl: string | null,
  targetChapterId?: number,
): Promise<void> {
  await requireSerialAdminBySlug(serialSlug);
  const { serialId, pageId } = await resolvePageIds(serialSlug, pageSlug);
  const headChapterId = targetChapterId ?? (await getHeadChapterId(serialId));

  await db.transaction(async (tx) => {
    // Resolve the idx of the target chapter so we can find the previous
    // revision (highest idx strictly less than headIdx).
    const [targetChapterRow] = await tx
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, headChapterId))
      .limit(1);
    const headIdx = targetChapterRow?.idx ?? 0;

    await applyPageContentRevision(
      tx,
      pageId,
      headChapterId,
      headIdx,
      content,
      /* deleteIfEmpty */ true,
    );

    await applyPageInfoboxRevision(
      tx,
      pageId,
      headChapterId,
      headIdx,
      infoboxContent,
      floaterImageUrl,
      /* deleteIfEmpty */ true,
    );
  });
}

/**
 * Fetches page content as it exists at a specific chapter cutoff, using the
 * same max-idx subquery join as the reader path in page.tsx. Intended for
 * pre-filling the edit form when an editor selects a target chapter so they
 * can see (and then overwrite) what readers at that chapter currently see.
 *
 * Returns empty strings / null when no content exists at or before the given
 * chapter - the caller should treat these as blank-slate values.
 *
 * @example
 * const data = await getPageContentAtChapter('my-serial', 'anya', 42);
 * // data.content: '...'
 * // data.floaterImageUrl: 'https://...' | null
 */
export async function getPageContentAtChapter(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
): Promise<{
  content: string;
  lastUpdatedChapterIdx: number | null;
  /** Content from the revision immediately before this chapter's revision. Empty when no prior revision exists. */
  previousContent: string;
  /** Chapter idx of the revision immediately before this chapter's revision, or null when no prior revision exists. */
  previousRevisionChapterIdx: number | null;
  /**
   * Chapter idx of the next revision strictly after this chapter, or null when
   * this is the most recent revision. Used by the remove-revision dialog to
   * compute the exact range of affected chapters.
   */
  nextRevisionChapterIdx: number | null;
  infoboxContent: string;
  infoboxLastUpdatedChapterIdx: number | null;
  previousInfoboxContent: string;
  previousInfoboxRevisionChapterIdx: number | null;
  nextInfoboxRevisionChapterIdx: number | null;
  floaterImageUrl: string | null;
}> {
  const [{ pageId }, cutoffIdxResult] = await Promise.all([
    resolvePageIds(serialSlug, pageSlug),
    getChapterIdxById(chapterId),
  ]);
  if (cutoffIdxResult === null) throw new Error("Chapter not found");

  const cutoffIdx = cutoffIdxResult;

  const contentMaxIdxSq = buildPageContentMaxIdxSq(pageId, cutoffIdx);

  // Previous revision: highest idx STRICTLY less than the actual revision's idx
  // (not the cutoff). This ensures the correct previous content is returned even
  // when the selected chapter is beyond the revision chapter (non-direct case).
  const contentPrevMaxIdxSq = db
    .select({ maxPrevIdx: max(chapters.idx).as("max_prev_idx") })
    .from(pageContentRevisions)
    .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
    .innerJoin(contentMaxIdxSq, lt(chapters.idx, contentMaxIdxSq.maxIdx))
    .where(eq(pageContentRevisions.pageId, pageId))
    .as("content_prev_max_idx_sq");

  // Next revision: lowest idx STRICTLY greater than the actual revision's idx.
  const contentNextMinIdxSq = db
    .select({ minNextIdx: min(chapters.idx).as("min_next_idx") })
    .from(pageContentRevisions)
    .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
    .innerJoin(contentMaxIdxSq, gt(chapters.idx, contentMaxIdxSq.maxIdx))
    .where(eq(pageContentRevisions.pageId, pageId))
    .as("content_next_min_idx_sq");

  const [[contentVersion], [contentPrevVersion], [contentNextVersion]] =
    await Promise.all([
      db
        .select({ content: pageContentRevisions.content, chapterIdx: chapters.idx })
        .from(pageContentRevisions)
        .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
        .innerJoin(contentMaxIdxSq, eq(chapters.idx, contentMaxIdxSq.maxIdx))
        .where(eq(pageContentRevisions.pageId, pageId)),
      db
        .select({ content: pageContentRevisions.content, chapterIdx: chapters.idx })
        .from(pageContentRevisions)
        .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
        .innerJoin(
          contentPrevMaxIdxSq,
          eq(chapters.idx, contentPrevMaxIdxSq.maxPrevIdx),
        )
        .where(eq(pageContentRevisions.pageId, pageId)),
      db
        .select({ chapterIdx: chapters.idx })
        .from(pageContentRevisions)
        .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
        .innerJoin(
          contentNextMinIdxSq,
          eq(chapters.idx, contentNextMinIdxSq.minNextIdx),
        )
        .where(eq(pageContentRevisions.pageId, pageId)),
    ]);

  // ── Infobox: identical previous/next resolution ─────────────────────────
  const ibMaxIdxSq = buildPageInfoboxMaxIdxSq(pageId, cutoffIdx);

  const ibPrevMaxIdxSq = db
    .select({ maxPrevIdx: max(chapters.idx).as("max_prev_idx") })
    .from(pageInfoboxContentRevisions)
    .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
    .innerJoin(ibMaxIdxSq, lt(chapters.idx, ibMaxIdxSq.maxIdx))
    .where(eq(pageInfoboxContentRevisions.pageId, pageId))
    .as("ib_prev_max_idx_sq");

  const ibNextMinIdxSq = db
    .select({ minNextIdx: min(chapters.idx).as("min_next_idx") })
    .from(pageInfoboxContentRevisions)
    .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
    .innerJoin(ibMaxIdxSq, gt(chapters.idx, ibMaxIdxSq.maxIdx))
    .where(eq(pageInfoboxContentRevisions.pageId, pageId))
    .as("ib_next_min_idx_sq");

  const [[ibVersion], [ibPrevVersion], [ibNextVersion]] = await Promise.all([
    db
      .select({
        content: pageInfoboxContentRevisions.content,
        imageUrl: pageInfoboxContentRevisions.imageUrl,
        chapterIdx: chapters.idx,
      })
      .from(pageInfoboxContentRevisions)
      .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
      .innerJoin(ibMaxIdxSq, eq(chapters.idx, ibMaxIdxSq.maxIdx))
      .where(eq(pageInfoboxContentRevisions.pageId, pageId)),
    db
      .select({ content: pageInfoboxContentRevisions.content, chapterIdx: chapters.idx })
      .from(pageInfoboxContentRevisions)
      .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
      .innerJoin(ibPrevMaxIdxSq, eq(chapters.idx, ibPrevMaxIdxSq.maxPrevIdx))
      .where(eq(pageInfoboxContentRevisions.pageId, pageId)),
    db
      .select({ chapterIdx: chapters.idx })
      .from(pageInfoboxContentRevisions)
      .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
      .innerJoin(ibNextMinIdxSq, eq(chapters.idx, ibNextMinIdxSq.minNextIdx))
      .where(eq(pageInfoboxContentRevisions.pageId, pageId)),
  ]);

  return {
    content: contentVersion?.content ?? "",
    lastUpdatedChapterIdx: contentVersion?.chapterIdx ?? null,
    previousContent: contentPrevVersion?.content ?? "",
    previousRevisionChapterIdx: contentPrevVersion?.chapterIdx ?? null,
    nextRevisionChapterIdx: contentNextVersion?.chapterIdx ?? null,
    infoboxContent: ibVersion?.content ?? "",
    infoboxLastUpdatedChapterIdx: ibVersion?.chapterIdx ?? null,
    previousInfoboxContent: ibPrevVersion?.content ?? "",
    previousInfoboxRevisionChapterIdx: ibPrevVersion?.chapterIdx ?? null,
    nextInfoboxRevisionChapterIdx: ibNextVersion?.chapterIdx ?? null,
    floaterImageUrl: ibVersion?.imageUrl ?? null,
  };
}

/**
 * Inserts or replaces a page title revision at the given chapter. If a title
 * already exists for this (page, chapter) pair it is overwritten in-place.
 *
 * @example
 * await addPageTitle('my-serial', 'luffy', 42, 'Monkey D. Luffy');
 */
export async function addPageTitle(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
  title: string,
): Promise<void> {
  await requireSerialAdminBySlug(serialSlug);
  const { pageId } = await resolvePageIds(serialSlug, pageSlug);
  await db
    .insert(pageTitles)
    .values({ pageId, chapterId, title: title.trim() })
    .onConflictDoUpdate({
      target: [pageTitles.pageId, pageTitles.chapterId],
      set: { title: title.trim() },
    });
}

/**
 * Deletes the page title revision for a specific (page, chapter) pair.
 * Guards against deleting the last remaining title - a page must always
 * have at least one title revision.
 *
 * @example
 * await deletePageTitle('my-serial', 'luffy', 42);
 */
export async function deletePageTitle(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
): Promise<{ error?: string }> {
  await requireSerialAdminBySlug(serialSlug);
  const { pageId } = await resolvePageIds(serialSlug, pageSlug);

  // Count existing titles for this page to prevent deleting the last one.
  const existing = await db
    .select({ chapterId: pageTitles.chapterId })
    .from(pageTitles)
    .where(eq(pageTitles.pageId, pageId));

  if (existing.length <= 1) {
    return { error: "Cannot delete the last title revision." };
  }

  await db
    .delete(pageTitles)
    .where(
      and(eq(pageTitles.pageId, pageId), eq(pageTitles.chapterId, chapterId)),
    );

  return {};
}

/**
 * Updates the chapter in which a page was introduced. Only admins of the
 * serial that owns the page may call this. Intended for correcting a wrong
 * intro chapter set at page-creation time.
 *
 * The updated value immediately changes the spoiler-gate: readers whose
 * chapter cutoff is below the new intro chapter will no longer see the page.
 *
 * @example
 * await updatePageIntroChapter(42, 7);
 */
export async function updatePageIntroChapter(
  pageId: number,
  chapterId: number,
): Promise<void> {
  await requireSerialAdminByPageId(pageId);

  // Verify the chapter exists AND belongs to the same serial as the page.
  // chapters.idx is serial-scoped; a cross-serial intro chapter would corrupt
  // the spoiler gate (idx values are meaningless across serials).
  const [chapterRow] = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .innerJoin(pages, and(eq(volumes.serialId, pages.serialId), eq(pages.id, pageId)))
    .where(eq(chapters.id, chapterId))
    .limit(1);
  if (!chapterRow) throw new Error("Chapter not found");

  await db
    .update(pages)
    .set({ introChapterId: chapterId })
    .where(eq(pages.id, pageId));
}

/**
 * Resolves the body and infobox content at a given chapter cutoff, for
 * pre-filling the suggestion form and the editor. Co-located with
 * `getPageContentAtChapter` since both read the same tables.
 *
 * @example
 * const { content, infoboxContent } = await getContentAtChapter(42, chapterId);
 */
export async function getContentAtChapter(
  pageId: number,
  chapterId: number,
): Promise<{
  content: string;
  lastUpdatedChapterIdx: number | null;
  infoboxContent: string;
  infoboxLastUpdatedChapterIdx: number | null;
}> {
  const cutoffIdxResult = await getChapterIdxById(chapterId);
  if (cutoffIdxResult === null) throw new Error("Chapter not found");
  const cutoffIdx = cutoffIdxResult;

  const contentMaxIdxSq = buildPageContentMaxIdxSq(pageId, cutoffIdx);
  const ibMaxIdxSq = buildPageInfoboxMaxIdxSq(pageId, cutoffIdx);

  const [[contentVersion], [ibVersion]] = await Promise.all([
    db
      .select({ content: pageContentRevisions.content, chapterIdx: chapters.idx })
      .from(pageContentRevisions)
      .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
      .innerJoin(contentMaxIdxSq, eq(chapters.idx, contentMaxIdxSq.maxIdx))
      .where(eq(pageContentRevisions.pageId, pageId)),
    db
      .select({ content: pageInfoboxContentRevisions.content, chapterIdx: chapters.idx })
      .from(pageInfoboxContentRevisions)
      .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
      .innerJoin(ibMaxIdxSq, eq(chapters.idx, ibMaxIdxSq.maxIdx))
      .where(eq(pageInfoboxContentRevisions.pageId, pageId)),
  ]);

  return {
    content: contentVersion?.content ?? "",
    lastUpdatedChapterIdx: contentVersion?.chapterIdx ?? null,
    infoboxContent: ibVersion?.content ?? "",
    infoboxLastUpdatedChapterIdx: ibVersion?.chapterIdx ?? null,
  };
}

// ── Page deletion / restore ───────────────────────────────────────────────────

/**
 * Returns every page whose live body or infobox content contains a wiki link
 * referencing the given page by name. Used as a pre-delete guard: the admin
 * must remove all outgoing wiki links before the page can be deleted.
 *
 * The check is a case-insensitive `ILIKE` scan on `page_content_revisions.content`
 * and `page_infobox_content_revisions.content`. This is a full-table scan over
 * the revisions for the serial — acceptable for typical wiki sizes and
 * intentionally simple to ship.
 *
 * @example
 * const refs = await getPageWikiLinkReferences('my-serial', 'luffy');
 * if (refs.length > 0) { // show blocking dialog }
 */
export async function getPageWikiLinkReferences(
  serialSlug: string,
  pageSlug: string,
): Promise<
  {
    /** Slug of the page that contains the reference. */
    pageSlug: string;
    /** Display name of the page that contains the reference. */
    pageName: string;
  }[]
> {
  await requireSerialAdminBySlug(serialSlug);

  const serial = await getSerialBySlug(serialSlug);
  if (!serial) throw new Error("Serial not found");

  // Look up the target page to get its name for the ILIKE pattern.
  const [targetPage] = await db
    .select({ id: pages.id, name: pages.name })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
    .limit(1);
  if (!targetPage) throw new Error("Page not found");

  // The editor stores links as `[[page:slug]]`; bare `[[Name]]` is also valid syntax.
  const slugPattern = `%[[page:${pageSlug}%`;
  const namePattern = `%[[${targetPage.name}%`;

  const [bodyRows, infoboxRows] = await Promise.all([
    db
      .select({ pageSlug: pages.slug, pageName: pages.name })
      .from(pageContentRevisions)
      .innerJoin(pages, eq(pageContentRevisions.pageId, pages.id))
      .where(
        and(
          eq(pages.serialId, serial.id),
          or(
            sql`${pageContentRevisions.content} ILIKE ${slugPattern}`,
            sql`${pageContentRevisions.content} ILIKE ${namePattern}`,
          ),
        ),
      ),
    db
      .select({ pageSlug: pages.slug, pageName: pages.name })
      .from(pageInfoboxContentRevisions)
      .innerJoin(pages, eq(pageInfoboxContentRevisions.pageId, pages.id))
      .where(
        and(
          eq(pages.serialId, serial.id),
          or(
            sql`${pageInfoboxContentRevisions.content} ILIKE ${slugPattern}`,
            sql`${pageInfoboxContentRevisions.content} ILIKE ${namePattern}`,
          ),
        ),
      ),
  ]);

  // Deduplicate: one row per referencing page is enough for display.
  const seen = new Set<string>();
  return [...bodyRows, ...infoboxRows]
    .sort((a, b) => a.pageName.localeCompare(b.pageName))
    .filter((r) => {
      if (seen.has(r.pageSlug)) return false;
      seen.add(r.pageSlug);
      return true;
    });
}

/**
 * Finds chapter synopsis pages that contain a wiki link to the given page.
 * Used to warn admins before deletion about chapter synopses that will have broken links.
 *
 * @example
 * const refs = await getPageChapterSynopsisReferences('my-serial', 'luffy');
 */
export async function getPageChapterSynopsisReferences(
  serialSlug: string,
  pageSlug: string,
): Promise<
  {
    /** The chapter's sort index, used to build the chapter page URL. */
    chapterIdx: number;
    /** Human-readable chapter display name. */
    chapterDisplayName: string;
    /** Human-readable volume display name. */
    volumeName: string;
  }[]
> {
  await requireSerialAdminBySlug(serialSlug);

  const serial = await getSerialBySlug(serialSlug);
  if (!serial) throw new Error("Serial not found");

  const [targetPage] = await db
    .select({ name: pages.name })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
    .limit(1);
  if (!targetPage) throw new Error("Page not found");

  // The editor stores links as `[[page:slug]]`; bare `[[Name]]` is also valid syntax.
  const slugPattern = `%[[page:${pageSlug}%`;
  const namePattern = `%[[${targetPage.name}%`;

  return db
    .select({
      chapterIdx: chapters.idx,
      chapterDisplayName: chapters.displayName,
      volumeName: volumes.displayName,
    })
    .from(chapterSynopses)
    .innerJoin(chapters, eq(chapterSynopses.chapterId, chapters.id))
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(
      and(
        eq(volumes.serialId, serial.id),
        or(
          sql`${chapterSynopses.content} ILIKE ${slugPattern}`,
          sql`${chapterSynopses.content} ILIKE ${namePattern}`,
        ),
      ),
    )
    .orderBy(asc(chapters.idx));
}

/**
 * Soft-deletes a wiki page by setting `pages.deleted_at = NOW()`.
 * Blocked only for the home page and already-deleted pages.
 * The caller is responsible for warning the admin about incoming wiki links
 * via `getPageWikiLinkReferences` and `getPageChapterSynopsisReferences`.
 *
 * @example
 * const result = await deletePage('my-serial', 'luffy');
 * if (result.error) { alert(result.error); }
 */
export async function deletePage(
  serialSlug: string,
  pageSlug: string,
  reason?: string,
): Promise<{ error?: string }> {
  await requireSerialAdminBySlug(serialSlug);
  const { pageId } = await resolvePageIds(serialSlug, pageSlug);

  const [pageRow] = await db
    .select({ isHomePage: pages.isHomePage, deletedAt: pages.deletedAt })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  if (pageRow?.isHomePage) {
    return { error: "The home page cannot be deleted." };
  }
  if (pageRow?.deletedAt) {
    return { error: "Page is already deleted." };
  }

  await db
    .update(pages)
    .set({ deletedAt: new Date(), deletionReason: reason?.trim() || null })
    .where(eq(pages.id, pageId));

  return {};
}

/**
 * Restores a soft-deleted wiki page by clearing `pages.deleted_at`.
 *
 * @example
 * const result = await restorePage('my-serial', 'luffy');
 * if (result.error) { alert(result.error); }
 */
export async function restorePage(
  serialSlug: string,
  pageSlug: string,
): Promise<{ error?: string }> {
  await requireSerialAdminBySlug(serialSlug);

  const serial = await getSerialBySlug(serialSlug);
  if (!serial) throw new Error("Serial not found");

  // Resolve page WITHOUT the isNull(deletedAt) guard — we need to find deleted pages.
  const [page] = await db
    .select({ id: pages.id, deletedAt: pages.deletedAt })
    .from(pages)
    .where(and(eq(pages.serialId, serial.id), eq(pages.slug, pageSlug)))
    .limit(1);

  if (!page) return { error: "Page not found." };
  if (!page.deletedAt) return { error: "Page is not deleted." };

  await db
    .update(pages)
    .set({ deletedAt: null })
    .where(eq(pages.id, page.id));

  return {};
}

// ── Page relationship management ──────────────────────────────────────────────
// Relationships are temporal: each add/remove inserts a new row instead of
// mutating existing rows (same SCD Type 2 pattern as section content).

/**
 * Performs a DFS from `startId` following currently-active parent edges in
 * `page_relationships` (using all rows in the DB - not chapter-filtered - so
 * the cycle check is conservative). Returns true if `targetId` is reachable.
 *
 * This is called before inserting an `is_active = true` edge to ensure the
 * resulting graph remains a DAG.
 */
async function isReachable(
  startId: number,
  targetId: number,
): Promise<boolean> {
  // Build the full parent map for the serial in a single query.
  // We only care about the *most recent* row per (parent, child) pair and
  // whether that row is active. To keep the query simple we fetch all rows
  // and compute the latest-per-pair in JS.
  const allRows = await db
    .select({
      parentPageId: pageRelationships.parentPageId,
      childPageId: pageRelationships.childPageId,
      chapterId: pageRelationships.chapterId,
      isActive: pageRelationships.isActive,
    })
    .from(pageRelationships);

  // Latest row per (parent, child) keyed by `${parent}:${child}`.
  const latestByEdge = new Map<
    string,
    { chapterId: number; isActive: boolean }
  >();
  for (const row of allRows) {
    const key = `${row.parentPageId}:${row.childPageId}`;
    const existing = latestByEdge.get(key);
    if (!existing || row.chapterId > existing.chapterId) {
      latestByEdge.set(key, {
        chapterId: row.chapterId,
        isActive: row.isActive,
      });
    }
  }

  // Build adjacency: childId → set of parentIds that are currently active.
  const parentOf = new Map<number, Set<number>>();
  for (const [key, val] of latestByEdge.entries()) {
    if (!val.isActive) continue;
    const [parentStr, childStr] = key.split(":");
    const parent = parseInt(parentStr, 10);
    const child = parseInt(childStr, 10);
    const parents = parentOf.get(child) ?? new Set();
    parents.add(parent);
    parentOf.set(child, parents);
  }

  // DFS upward from startId to see if targetId is an ancestor.
  const visited = new Set<number>();
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const parents = parentOf.get(current);
    if (parents) {
      for (const p of parents) stack.push(p);
    }
  }
  return false;
}

/**
 * Returns the active parent pages for a given page at a specific chapter,
 * including temporal titles resolved at that chapter's cutoff. Used by the
 * edit-mode Relationships panel to keep the parent list in sync with the
 * "Writing as of:" chapter selector.
 *
 * @example
 * const parents = await getParentPagesAtChapter('one-piece', 'luffy', 7);
 */
export async function getParentPagesAtChapter(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
): Promise<{ id: number; name: string; slug: string; title: string }[]> {
  const [{ pageId }, cutoffIdx] = await Promise.all([
    resolvePageIds(serialSlug, pageSlug),
    getChapterIdxById(chapterId),
  ]);
  if (cutoffIdx === null) throw new Error("Chapter not found");

  const activeParents = await fetchActiveParentPagesAtIdx(pageId, cutoffIdx);
  const titleMap = await resolvePageTitlesAtIdx(
    activeParents.map((r) => r.id),
    cutoffIdx,
  );

  return activeParents.map((r) => ({
    ...r,
    title: titleMap.get(r.id) ?? r.name,
  }));
}

/**
 * Returns all pages in the serial with their titles resolved at the given
 * chapter's cutoff, excluding the current page. Used to keep the "Add parent"
 * dropdown in sync with the "Writing as of Chapter" selector — the same
 * temporal title resolution applied to `getParentPagesAtChapter`.
 *
 * @example
 * const allPages = await getAllSerialPagesAtChapter('one-piece', 'luffy', 7);
 * // allPages: [{ id: 1, title: 'Nami' }, ...]
 */
export async function getAllSerialPagesAtChapter(
  serialSlug: string,
  pageSlug: string,
  chapterId: number,
): Promise<{ id: number; title: string }[]> {
  const [{ serialId, pageId }, cutoffIdx] = await Promise.all([
    resolvePageIds(serialSlug, pageSlug),
    getChapterIdxById(chapterId),
  ]);
  if (cutoffIdx === null) throw new Error("Chapter not found");

  const allPages = await fetchSerialPagesAtIdx(serialId, cutoffIdx);
  const titleMap = await resolvePageTitlesAtIdx(
    allPages.map((p) => p.id),
    cutoffIdx,
  );

  return allPages
    .filter((p) => p.id !== pageId)
    .map((p) => ({ id: p.id, title: titleMap.get(p.id) ?? p.name }));
}

/**
 * Inserts an `is_active = true` row for (childPageId, parentPageId) at the
 * given chapter. Rejects if the edge would create a cycle in the page DAG.
 *
 * @example
 * await addPageRelationship(childPageId, parentPageId, chapterId);
 */
export async function addPageRelationship(
  childPageId: number,
  parentPageId: number,
  chapterId: number,
): Promise<{ error?: string }> {
  await requireSerialAdminByPageId(childPageId);

  if (childPageId === parentPageId) {
    return { error: "A page cannot be its own parent." };
  }

  // Cycle check: if parentPageId can already reach childPageId through active
  // edges, adding childPageId → parentPageId would create a cycle.
  const wouldCycle = await isReachable(parentPageId, childPageId);
  if (wouldCycle) {
    return {
      error: "Adding this parent would create a cycle in the page graph.",
    };
  }

  await db
    .insert(pageRelationships)
    .values({ parentPageId, childPageId, chapterId, isActive: true })
    .onConflictDoUpdate({
      target: [
        pageRelationships.parentPageId,
        pageRelationships.childPageId,
        pageRelationships.chapterId,
      ],
      set: { isActive: true },
    });

  return {};
}

/**
 * Inserts an `is_active = false` tombstone for (childPageId, parentPageId) at
 * the given chapter. Guards against leaving a non-home-page with zero parents
 * at any chapter snapshot by checking whether the page has other active parents.
 *
 * The "other active parent" check is intentionally conservative: it uses the
 * latest-per-pair rows across all chapters, not a chapter-filtered view, so
 * we never accidentally leave a page orphaned.
 *
 * @example
 * await removePageRelationship(childPageId, parentPageId, chapterId);
 */
export async function removePageRelationship(
  childPageId: number,
  parentPageId: number,
  chapterId: number,
): Promise<{ error?: string }> {
  await requireSerialAdminByPageId(childPageId);

  // Count OTHER active parents for this child (conservative - unfiltered).
  const allRows = await db
    .select({
      parentPageId: pageRelationships.parentPageId,
      chapterId: pageRelationships.chapterId,
      isActive: pageRelationships.isActive,
    })
    .from(pageRelationships)
    .where(
      and(
        eq(pageRelationships.childPageId, childPageId),
        ne(pageRelationships.parentPageId, parentPageId),
      ),
    );

  // Compute latest row per other parent.
  const latestByParent = new Map<
    number,
    { chapterId: number; isActive: boolean }
  >();
  for (const row of allRows) {
    const existing = latestByParent.get(row.parentPageId);
    if (!existing || row.chapterId > existing.chapterId) {
      latestByParent.set(row.parentPageId, {
        chapterId: row.chapterId,
        isActive: row.isActive,
      });
    }
  }

  const activeOtherParents = [...latestByParent.values()].filter(
    (v) => v.isActive,
  );

  if (activeOtherParents.length === 0) {
    // Check if the page is a home page (home pages are root nodes - no parent needed).
    const [pageRow] = await db
      .select({ isHomePage: pages.isHomePage })
      .from(pages)
      .where(eq(pages.id, childPageId))
      .limit(1);

    if (!pageRow?.isHomePage) {
      return {
        error:
          "Cannot remove this parent: the page must have at least one parent. Add another parent first.",
      };
    }
  }

  await db
    .insert(pageRelationships)
    .values({ parentPageId, childPageId, chapterId, isActive: false })
    .onConflictDoUpdate({
      target: [
        pageRelationships.parentPageId,
        pageRelationships.childPageId,
        pageRelationships.chapterId,
      ],
      set: { isActive: false },
    });

  return {};
}
