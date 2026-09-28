import { db } from "@/db/index";
import {
  chapters,
  pages,
  pageTitles,
  pageRelationships,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  volumes,
} from "@/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  or,
} from "drizzle-orm";
import type {
  PageStub,
  SerialPageStub,
  ParentPageStub,
  WikiPageRow,
  DeletedPageStub,
  PageContentAtIdx,
  PageInfoboxAtIdx,
  ChildPageStub,
  PageTitleEntry,
  PageTitlesAtIdx,
} from "@/types";

/** PostgreSQL INT4 max — use as cutoffIdx to mean "no chapter cutoff". */
export const PG_INT_MAX = 2_147_483_647;

/**
 * Resolves chapter-versioned display titles for a set of pages at a given reading position.
 *
 * Returns the pageTitles entry whose chapter has the highest idx ≤ cutoffIdx —
 * the name the reader should see at their current position. Pages with no
 * pageTitles row at or before the cutoff are omitted; callers fall back to
 * pages.name.
 */
export async function resolvePageTitlesAtIdx(
  pageIds: number[],
  cutoffIdx: number,
): Promise<Map<number, string>> {
  if (pageIds.length === 0) return new Map();

  const maxIdxSq = db
    .select({
      pageId: pageTitles.pageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(
      and(inArray(pageTitles.pageId, pageIds), lte(chapters.idx, cutoffIdx)),
    )
    .groupBy(pageTitles.pageId)
    .as("page_title_max_idx_sq");

  const rows = await db
    .select({ pageId: pageTitles.pageId, title: pageTitles.title })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .innerJoin(
      maxIdxSq,
      and(
        eq(pageTitles.pageId, maxIdxSq.pageId),
        eq(chapters.idx, maxIdxSq.maxIdx),
      ),
    );

  return new Map(rows.map((r) => [r.pageId, r.title]));
}

/**
 * Returns the set of page IDs (from `pageIds`) that have at least one active
 * child relationship at `cutoffIdx` — i.e. pages that should render a folder
 * icon rather than a document icon in the sub-pages list.
 *
 * Uses the max-idx pattern: the latest `pageRelationships` revision per
 * (parent, child) pair at or before `cutoffIdx` must have `isActive = true`.
 */
export async function resolveHasChildrenSet(
  pageIds: number[],
  cutoffIdx: number,
): Promise<Set<number>> {
  if (pageIds.length === 0) return new Set();

  const grandchildRelMaxIdxSq = db
    .select({
      parentPageId: pageRelationships.parentPageId,
      childPageId: pageRelationships.childPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        inArray(pageRelationships.parentPageId, pageIds),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.parentPageId, pageRelationships.childPageId)
    .as("grandchild_rel_max_idx_sq");

  const rows = await db
    .select({ parentPageId: pageRelationships.parentPageId })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      grandchildRelMaxIdxSq,
      and(
        eq(pageRelationships.parentPageId, grandchildRelMaxIdxSq.parentPageId),
        eq(pageRelationships.childPageId, grandchildRelMaxIdxSq.childPageId),
        eq(chapters.idx, grandchildRelMaxIdxSq.maxIdx),
      ),
    )
    .where(
      and(
        inArray(pageRelationships.parentPageId, pageIds),
        eq(pageRelationships.isActive, true),
      ),
    );

  return new Set(rows.map((r) => r.parentPageId));
}

/**
 * Returns the Drizzle subquery for the highest `chapters.idx` ≤ `cutoffIdx`
 * at which a body-content revision exists for `pageId`. Callers join this to
 * `pageContentRevisions` + `chapters` to obtain the chapter-versioned body at
 * the reader's cutoff. Since a page now has a single body field, this
 * resolves to at most one row (unlike the old per-section grouped subquery).
 *
 * Returns a subquery object — callers must await their own `db.select(…).from(…)
 * .innerJoin(sq, …)` call. This keeps the helper composable with different
 * outer SELECT projections.
 *
 * @example
 * const sq = pageContentMaxIdxSq(pageId, cutoffIdx);
 * const [row] = await db
 *   .select({ content: pageContentRevisions.content })
 *   .from(pageContentRevisions)
 *   .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
 *   .innerJoin(sq, eq(chapters.idx, sq.maxIdx))
 *   .where(eq(pageContentRevisions.pageId, pageId));
 */
export function pageContentMaxIdxSq(pageId: number, cutoffIdx: number) {
  return db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageContentRevisions)
    .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
    .where(
      and(eq(pageContentRevisions.pageId, pageId), lte(chapters.idx, cutoffIdx)),
    )
    .as("page_content_max_idx_sq");
}

/**
 * Returns the Drizzle subquery for the highest `chapters.idx` ≤ `cutoffIdx`
 * at which an infobox revision exists for `pageId`. Callers join this to
 * `pageInfoboxContentRevisions` + `chapters` to get chapter-versioned infobox
 * content + image at the reader's cutoff.
 *
 * Returns a subquery object — callers must await their own query.
 *
 * @example
 * const sq = pageInfoboxMaxIdxSq(pageId, cutoffIdx);
 * const [row] = await db
 *   .select({ content: pageInfoboxContentRevisions.content })
 *   .from(pageInfoboxContentRevisions)
 *   .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
 *   .innerJoin(sq, eq(chapters.idx, sq.maxIdx))
 *   .where(eq(pageInfoboxContentRevisions.pageId, pageId));
 */
export function pageInfoboxMaxIdxSq(pageId: number, cutoffIdx: number) {
  return db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageInfoboxContentRevisions)
    .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageInfoboxContentRevisions.pageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .as("page_infobox_max_idx_sq");
}

/**
 * Returns the Drizzle subquery that, for each child of `parentPageId`, finds
 * the highest `chapters.idx` ≤ `cutoffIdx` at which a relationship revision
 * exists. Callers join this to `pageRelationships` + `chapters` to obtain the
 * latest active/inactive state per child at the reader's cutoff.
 *
 * Pass `PG_INT_MAX` as `cutoffIdx` to get the latest state across all chapters
 * (no cutoff), as used in the navbar where spoiler filtering is not applied.
 *
 * @example
 * const sq = childRelMaxIdxSq(homePage.id, cutoffIdx);
 * const rows = await db
 *   .select({ id: pages.id, isActive: pageRelationships.isActive })
 *   .from(pageRelationships)
 *   .innerJoin(pages, eq(pageRelationships.childPageId, pages.id))
 *   .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
 *   .innerJoin(sq, and(eq(pageRelationships.childPageId, sq.childPageId), eq(chapters.idx, sq.maxIdx)))
 *   .where(eq(pageRelationships.parentPageId, homePage.id));
 */
export function childRelMaxIdxSq(parentPageId: number, cutoffIdx: number) {
  return db
    .select({
      childPageId: pageRelationships.childPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        eq(pageRelationships.parentPageId, parentPageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.childPageId)
    .as("rel_max_idx_sq");
}

/**
 * Returns all live (non-deleted) pages in the serial visible at `cutoffIdx`: pages
 * with no intro chapter (home page) are always included; others must have been
 * introduced at or before `cutoffIdx`.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx`
 * on the returned IDs and fall back to `name` when no title row exists.
 */
export async function fetchSerialPagesAtIdx(
  serialId: number,
  cutoffIdx: number,
): Promise<PageStub[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        isNull(pages.deletedAt),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));
}

/**
 * Returns the active parent pages for `pageId` at `cutoffIdx`: finds the
 * latest `pageRelationships` revision per parent at or before `cutoffIdx`
 * and keeps only those with `isActive = true`.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx`
 * on the returned IDs and fall back to `name` when no title row exists.
 */
export async function fetchActiveParentPagesAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<ParentPageStub[]> {
  const parentRelMaxIdxSq = db
    .select({
      parentPageId: pageRelationships.parentPageId,
      maxIdx: max(chapters.idx).as("max_idx"),
    })
    .from(pageRelationships)
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .where(
      and(
        eq(pageRelationships.childPageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .groupBy(pageRelationships.parentPageId)
    .as("parent_rel_max_idx_sq");

  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pageRelationships)
    .innerJoin(pages, eq(pageRelationships.parentPageId, pages.id))
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      parentRelMaxIdxSq,
      and(
        eq(pageRelationships.parentPageId, parentRelMaxIdxSq.parentPageId),
        eq(chapters.idx, parentRelMaxIdxSq.maxIdx),
      ),
    )
    .where(
      and(
        eq(pageRelationships.childPageId, pageId),
        eq(pageRelationships.isActive, true),
      ),
    );
}

/**
 * Fetches a wiki page by serial id + slug. Returns `undefined` when no page
 * matches, so callers can call `notFound()` immediately.
 */
export async function fetchPageAtSlug(
  serialId: number,
  slug: string,
): Promise<WikiPageRow | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.serialId, serialId), eq(pages.slug, slug)))
    .limit(1);
  return row;
}

/**
 * Fetches the home page row for a serial. Returns `null` when the serial has no
 * home page yet (edge case during serial initialisation).
 */
export async function fetchSerialHomePage(
  serialId: number,
): Promise<WikiPageRow | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.serialId, serialId), eq(pages.isHomePage, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Returns the active, immediate child pages of `homePageId` with no chapter
 * cutoff applied. Used exclusively by the navbar dropdown, which should show
 * all current top-level categories regardless of the reader's reading position.
 *
 * Applies `PG_INT_MAX` as the cutoff so the max-idx subquery finds the latest
 * relationship revision across all chapters, then filters to `isActive = true`.
 */
export async function getHomePageChildren(
  homePageId: number,
): Promise<PageStub[]> {
  const relMaxIdxSq = childRelMaxIdxSq(homePageId, PG_INT_MAX);

  return db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
    })
    .from(pageRelationships)
    .innerJoin(pages, eq(pageRelationships.childPageId, pages.id))
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      relMaxIdxSq,
      and(
        eq(pageRelationships.childPageId, relMaxIdxSq.childPageId),
        eq(chapters.idx, relMaxIdxSq.maxIdx),
      ),
    )
    .where(
      and(
        eq(pageRelationships.parentPageId, homePageId),
        eq(pageRelationships.isActive, true),
        isNull(pages.deletedAt),
      ),
    )
    .orderBy(asc(pages.name));
}

/**
 * Returns all soft-deleted pages for a serial, ordered newest deletion first.
 * Only call this after confirming the caller is an admin — this function has no
 * auth check itself.
 */
export async function fetchDeletedPages(
  serialId: number,
): Promise<DeletedPageStub[]> {
  const rows = await db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
      deletedAt: pages.deletedAt,
      deletionReason: pages.deletionReason,
    })
    .from(pages)
    .where(and(eq(pages.serialId, serialId), isNotNull(pages.deletedAt)))
    .orderBy(desc(pages.deletedAt));
  return rows.map((r) => ({ ...r, deletedAt: r.deletedAt! }));
}

/**
 * Fetches a page's merged body content at `cutoffIdx` - the highest-idx
 * revision at or before the reader's cutoff, or an empty result when no
 * revision exists yet.
 */
export async function fetchPageContentAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<PageContentAtIdx> {
  const maxIdxSq = pageContentMaxIdxSq(pageId, cutoffIdx);

  const [row] = await db
    .select({ content: pageContentRevisions.content, chapterIdx: chapters.idx })
    .from(pageContentRevisions)
    .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
    .innerJoin(maxIdxSq, eq(chapters.idx, maxIdxSq.maxIdx))
    .where(eq(pageContentRevisions.pageId, pageId))
    .limit(1);

  return {
    content: row?.content ?? "",
    lastUpdatedChapterIdx: row?.chapterIdx ?? null,
  };
}

/**
 * Fetches a page's merged infobox content + image at `cutoffIdx`. "Has an
 * infobox" is derived, not stored: callers should check
 * `lastUpdatedChapterIdx !== null` rather than any structural flag - a
 * revision only exists when the page had non-empty infobox content or an
 * image at some point at or before the cutoff.
 */
export async function fetchPageInfoboxAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<PageInfoboxAtIdx> {
  const maxIdxSq = pageInfoboxMaxIdxSq(pageId, cutoffIdx);

  const [row] = await db
    .select({
      content: pageInfoboxContentRevisions.content,
      imageUrl: pageInfoboxContentRevisions.imageUrl,
      chapterIdx: chapters.idx,
    })
    .from(pageInfoboxContentRevisions)
    .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
    .innerJoin(maxIdxSq, eq(chapters.idx, maxIdxSq.maxIdx))
    .where(eq(pageInfoboxContentRevisions.pageId, pageId))
    .limit(1);

  return {
    content: row?.content ?? "",
    imageUrl: row?.imageUrl ?? null,
    lastUpdatedChapterIdx: row?.chapterIdx ?? null,
  };
}

/**
 * Fetches the active child pages for `parentPageId` at `cutoffIdx`, including
 * chapter-versioned titles and the `hasChildren` flag for folder-icon rendering.
 *
 * Uses the max-idx pattern: the latest relationship revision per child at or
 * before `cutoffIdx` must be `isActive = true` to appear in the result.
 * Soft-deleted child pages are always excluded.
 */
export async function fetchPageChildPagesAtIdx(
  parentPageId: number,
  cutoffIdx: number,
): Promise<ChildPageStub[]> {
  const relMaxIdxSq = childRelMaxIdxSq(parentPageId, cutoffIdx);

  const childPagesRaw = await db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
      isActive: pageRelationships.isActive,
    })
    .from(pageRelationships)
    .innerJoin(pages, eq(pageRelationships.childPageId, pages.id))
    .innerJoin(chapters, eq(pageRelationships.chapterId, chapters.id))
    .innerJoin(
      relMaxIdxSq,
      and(
        eq(pageRelationships.childPageId, relMaxIdxSq.childPageId),
        eq(chapters.idx, relMaxIdxSq.maxIdx),
      ),
    )
    .where(
      and(
        eq(pageRelationships.parentPageId, parentPageId),
        isNull(pages.deletedAt),
      ),
    );

  const activeChildPages = childPagesRaw.filter((r) => r.isActive);
  if (activeChildPages.length === 0) return [];

  const childPageIds = activeChildPages.map((r) => r.id);
  const [childTitleMap, hasChildrenSet] = await Promise.all([
    resolvePageTitlesAtIdx(childPageIds, cutoffIdx),
    resolveHasChildrenSet(childPageIds, cutoffIdx),
  ]);

  return activeChildPages.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: childTitleMap.get(r.id) ?? r.name,
    hasChildren: hasChildrenSet.has(r.id),
  }));
}

/**
 * Returns all temporal title entries for a page (no cutoff), ordered by chapter idx.
 * Used by the edit-mode titles panel where admins can see and manage every title revision.
 */
export async function fetchPageTitleEntries(
  pageId: number,
): Promise<PageTitleEntry[]> {
  const rows = await db
    .select({
      chapterId: pageTitles.chapterId,
      title: pageTitles.title,
      chapterDisplayName: chapters.displayName,
      volumeName: volumes.displayName,
    })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(pageTitles.pageId, pageId))
    .orderBy(asc(chapters.idx));

  return rows.map((r) => ({
    chapterId: r.chapterId,
    chapterLabel: `${r.volumeName} - ${r.chapterDisplayName}`,
    title: r.title,
  }));
}

/**
 * Returns the temporal title entries for a page up to `cutoffIdx` AND the resolved
 * display title (the entry with the highest chapter idx ≤ cutoffIdx).
 *
 * `resolvedTitle` is `null` when no title entry exists at or before `cutoffIdx`;
 * callers fall back to `page.name` in that case.
 */
export async function fetchPageTitleEntriesAtIdx(
  pageId: number,
  cutoffIdx: number,
): Promise<PageTitlesAtIdx> {
  const titleMaxIdxSq = db
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageTitles)
    .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
    .where(and(eq(pageTitles.pageId, pageId), lte(chapters.idx, cutoffIdx)))
    .as("title_max_idx_sq");

  const [allPageTitleRows, [resolvedTitleRow]] = await Promise.all([
    db
      .select({
        chapterId: pageTitles.chapterId,
        title: pageTitles.title,
        chapterDisplayName: chapters.displayName,
        volumeName: volumes.displayName,
      })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(pageTitles.pageId, pageId), lte(chapters.idx, cutoffIdx)))
      .orderBy(asc(chapters.idx)),
    db
      .select({ title: pageTitles.title })
      .from(pageTitles)
      .innerJoin(chapters, eq(pageTitles.chapterId, chapters.id))
      .innerJoin(titleMaxIdxSq, eq(chapters.idx, titleMaxIdxSq.maxIdx))
      .where(eq(pageTitles.pageId, pageId))
      .limit(1),
  ]);

  return {
    entries: allPageTitleRows.map((r) => ({
      chapterId: r.chapterId,
      chapterLabel: `${r.volumeName} - ${r.chapterDisplayName}`,
      title: r.title,
    })),
    resolvedTitle: resolvedTitleRow?.title ?? null,
  };
}

/** Maximum number of rows returned by `searchPagesByNameAtIdx`. */
export const SEARCH_RESULT_LIMIT = 20;

/**
 * Returns up to 20 visible, non-home pages whose canonical name matches `query`
 * (case-insensitive substring) at `cutoffIdx`. Returns an empty array when `query`
 * is blank so callers can skip the network round-trip entirely.
 *
 * Spoiler rule: pages with an intro chapter index beyond `cutoffIdx` are excluded
 * (same filter as `fetchSearchablePagesAtIdx`).
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx` on the
 * returned IDs and fall back to `name` when no title row exists.
 */
export async function searchPagesByNameAtIdx(
  serialId: number,
  cutoffIdx: number,
  query: string,
): Promise<PageStub[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        eq(pages.isHomePage, false),
        isNull(pages.deletedAt),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
        ilike(pages.name, `%${trimmed}%`),
      ),
    )
    .orderBy(asc(pages.name))
    .limit(SEARCH_RESULT_LIMIT);
}

/**
 * Returns all pages introduced in a specific chapter, ordered by name.
 * Used by the chapter detail page to render the "Introduced in this chapter" list.
 *
 * Title resolution is NOT performed here — call `resolvePageTitlesAtIdx` on the
 * returned IDs to apply chapter-versioned display names.
 */
export async function fetchPagesIntroducedInChapter(
  serialId: number,
  chapterId: number,
): Promise<PageStub[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .where(
      and(eq(pages.serialId, serialId), eq(pages.introChapterId, chapterId)),
    )
    .orderBy(pages.name);
}

/**
 * Like `fetchPageAtSlug` but excludes soft-deleted pages. Use this where a
 * deleted page should be treated as non-existent (e.g. wiki-link hover previews).
 * For page rendering, use `fetchPageAtSlug` so the caller can show a "deleted"
 * notice instead of a 404.
 */
export async function fetchLivePageAtSlug(
  serialId: number,
  slug: string,
): Promise<WikiPageRow | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.serialId, serialId),
        eq(pages.slug, slug),
        isNull(pages.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Returns all page stubs (id, name, slug) for a serial without any chapter cutoff
 * filter. Used to build the complete slug→title map that `resolvePageTitlesAtIdx`
 * needs when rendering wiki-link hover previews.
 */
export async function fetchAllSerialPageStubs(
  serialId: number,
): Promise<PageStub[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .where(eq(pages.serialId, serialId));
}

/**
 * Returns all non-deleted pages for a serial ordered by name, including their
 * `introChapterId` so callers can apply a chapter cutoff filter client-side or
 * in a subsequent query.
 *
 * Used by the new-page form to populate the parent-page dropdown and the
 * similar-pages warning. Soft-deleted pages are excluded — they are not valid
 * targets for parent assignment or name-collision checks.
 *
 */
export async function getSerialPages(
  serialId: number,
): Promise<SerialPageStub[]> {
  return db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
      introChapterId: pages.introChapterId,
    })
    .from(pages)
    .where(and(eq(pages.serialId, serialId), isNull(pages.deletedAt)))
    .orderBy(asc(pages.name));
}

/**
 * Fetches the `serialId` for a page by its primary key. Returns `null` when the
 * page does not exist. Used by auth guards that receive only a `pageId`.
 */
export async function fetchPageSerialId(
  pageId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ serialId: pages.serialId })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  return row?.serialId ?? null;
}

/**
 * Returns visible, non-home pages in a serial at `cutoffIdx`, ordered by name.
 * Excludes the home page and soft-deleted pages. Used by the wiki-link search
 * autocomplete, which lists pages a user can navigate to.
 *
 * Does NOT resolve chapter-versioned titles — call `resolvePageTitlesAtIdx` on
 * the returned IDs and fall back to `name` when no title row exists.
 */
export async function fetchSearchablePagesAtIdx(
  serialId: number,
  cutoffIdx: number,
): Promise<PageStub[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .leftJoin(chapters, eq(pages.introChapterId, chapters.id))
    .where(
      and(
        eq(pages.serialId, serialId),
        eq(pages.isHomePage, false),
        isNull(pages.deletedAt),
        or(isNull(pages.introChapterId), lte(chapters.idx, cutoffIdx)),
      ),
    )
    .orderBy(asc(pages.name));
}
