import { db } from "@/db/index";
import {
  pages,
  chapters,
  pageSuggestions,
  pageContentRevisions,
  pageInfoboxContentRevisions,
  users,
} from "@/db/schema";
import { and, asc, count, desc, eq } from "drizzle-orm";
import {
  pageContentMaxIdxSq as buildPageContentMaxIdxSq,
  pageInfoboxMaxIdxSq as buildPageInfoboxMaxIdxSq,
} from "@/data/pages/queries";
import type { SuggestionStatus } from "@/types";

/**
 * Returns the serial id for a given page id. Used by suggestion auth guards
 * that need to check serial admin membership before a page-level read.
 *
 * @example
 * const serialId = await fetchSerialIdByPageId(42);
 */
export async function fetchSerialIdByPageId(pageId: number): Promise<number> {
  const [page] = await db
    .select({ serialId: pages.serialId })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) throw new Error("Page not found.");
  return page.serialId;
}

/**
 * Returns all suggestions submitted by a given user for a page, ordered
 * most-recent first. Used to render per-page suggestion status feedback.
 *
 * @example
 * const suggestions = await fetchMyPageSuggestions(pageId, userId);
 * // → [{ status: 'pending', reviewNote: null, proposedContent: '...' }, ...]
 */
export async function fetchMyPageSuggestions(
  pageId: number,
  userId: string,
): Promise<
  {
    id: number;
    status: SuggestionStatus;
    reviewNote: string | null;
    createdAt: Date;
    targetChapterName: string;
    proposedContent: string | null;
    proposedInfoboxContent: string | null;
  }[]
> {
  const rows = await db
    .select({
      id: pageSuggestions.id,
      status: pageSuggestions.status,
      reviewNote: pageSuggestions.reviewNote,
      createdAt: pageSuggestions.createdAt,
      targetChapterName: chapters.displayName,
      proposedContent: pageSuggestions.proposedContent,
      proposedInfoboxContent: pageSuggestions.proposedInfoboxContent,
    })
    .from(pageSuggestions)
    .innerJoin(chapters, eq(pageSuggestions.targetChapterId, chapters.id))
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.proposedByUserId, userId),
      ),
    )
    .orderBy(desc(pageSuggestions.createdAt));

  return rows;
}

/**
 * Returns the count of pending suggestions for a page. Used for the admin
 * badge shown on the page view. Returns 0 when there are no pending suggestions.
 *
 * @example
 * const count = await fetchPendingSuggestionCount(42);
 */
export async function fetchPendingSuggestionCount(
  pageId: number,
): Promise<number> {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSuggestions)
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.status, "pending"),
      ),
    );
  return Number(cnt);
}

/**
 * Returns all pending suggestions for a page with proposer username, the
 * proposed body/infobox content, and the current content at each
 * suggestion's target chapter for diff rendering.
 *
 * @example
 * const suggestions = await fetchPendingSuggestions(42);
 */
export async function fetchPendingSuggestions(pageId: number): Promise<
  {
    id: number;
    proposerUsername: string | null;
    targetChapterId: number;
    targetChapterName: string;
    citation: string;
    createdAt: Date;
    currentContent: string;
    proposedContent: string | null;
    currentInfoboxContent: string;
    proposedInfoboxContent: string | null;
  }[]
> {
  const suggestionRows = await db
    .select({
      id: pageSuggestions.id,
      proposerUsername: users.username,
      targetChapterId: pageSuggestions.targetChapterId,
      targetChapterName: chapters.displayName,
      targetChapterIdx: chapters.idx,
      citation: pageSuggestions.citation,
      createdAt: pageSuggestions.createdAt,
      proposedContent: pageSuggestions.proposedContent,
      proposedInfoboxContent: pageSuggestions.proposedInfoboxContent,
    })
    .from(pageSuggestions)
    .innerJoin(users, eq(pageSuggestions.proposedByUserId, users.id))
    .innerJoin(chapters, eq(pageSuggestions.targetChapterId, chapters.id))
    .where(
      and(
        eq(pageSuggestions.pageId, pageId),
        eq(pageSuggestions.status, "pending"),
      ),
    )
    .orderBy(asc(pageSuggestions.createdAt));

  if (suggestionRows.length === 0) return [];

  // Batch current-content lookups by target chapter idx - one pair of queries
  // per distinct cutoff instead of one pair per suggestion.
  const distinctCutoffs = [
    ...new Set(suggestionRows.map((s) => s.targetChapterIdx)),
  ];

  const contentByCutoff = await Promise.all(
    distinctCutoffs.map(async (cutoffIdx) => {
      const contentMaxIdxSq = buildPageContentMaxIdxSq(pageId, cutoffIdx);
      const ibMaxIdxSq = buildPageInfoboxMaxIdxSq(pageId, cutoffIdx);

      const [[contentRow], [ibRow]] = await Promise.all([
        db
          .select({ content: pageContentRevisions.content })
          .from(pageContentRevisions)
          .innerJoin(chapters, eq(pageContentRevisions.chapterId, chapters.id))
          .innerJoin(contentMaxIdxSq, eq(chapters.idx, contentMaxIdxSq.maxIdx))
          .where(eq(pageContentRevisions.pageId, pageId)),
        db
          .select({ content: pageInfoboxContentRevisions.content })
          .from(pageInfoboxContentRevisions)
          .innerJoin(
            chapters,
            eq(pageInfoboxContentRevisions.chapterId, chapters.id),
          )
          .innerJoin(ibMaxIdxSq, eq(chapters.idx, ibMaxIdxSq.maxIdx))
          .where(eq(pageInfoboxContentRevisions.pageId, pageId)),
      ]);

      return {
        cutoffIdx,
        currentContent: contentRow?.content ?? "",
        currentInfoboxContent: ibRow?.content ?? "",
      };
    }),
  );

  const contentMapByCutoff = new Map(
    contentByCutoff.map((entry) => [entry.cutoffIdx, entry]),
  );

  return suggestionRows.map((suggestion) => {
    const cutoffContent = contentMapByCutoff.get(suggestion.targetChapterIdx);

    return {
      id: suggestion.id,
      proposerUsername: suggestion.proposerUsername,
      targetChapterId: suggestion.targetChapterId,
      targetChapterName: suggestion.targetChapterName,
      citation: suggestion.citation,
      createdAt: suggestion.createdAt,
      currentContent: cutoffContent?.currentContent ?? "",
      proposedContent: suggestion.proposedContent,
      currentInfoboxContent: cutoffContent?.currentInfoboxContent ?? "",
      proposedInfoboxContent: suggestion.proposedInfoboxContent,
    };
  });
}

/**
 * Returns the total count of pending suggestions across all pages of a serial.
 * Used for the serial home badge summarising outstanding review work.
 *
 * @example
 * const total = await fetchTotalPendingSuggestions(serial.id);
 */
export async function fetchTotalPendingSuggestions(
  serialId: number,
): Promise<number> {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(pageSuggestions)
    .innerJoin(pages, eq(pageSuggestions.pageId, pages.id))
    .where(
      and(eq(pages.serialId, serialId), eq(pageSuggestions.status, "pending")),
    );
  return Number(cnt);
}

/**
 * Returns pending suggestion counts grouped by page for a serial, ordered by
 * count descending then page name ascending. Used by the admin panel to
 * surface pages with the most outstanding review work first.
 *
 * @example
 * const byPage = await fetchPendingSuggestionsByPage(serial.id);
 */
export async function fetchPendingSuggestionsByPage(
  serialId: number,
): Promise<
  { pageId: number; pageSlug: string; pageName: string; count: number }[]
> {
  const rows = await db
    .select({
      pageId: pages.id,
      pageSlug: pages.slug,
      pageName: pages.name,
      cnt: count(),
    })
    .from(pageSuggestions)
    .innerJoin(pages, eq(pageSuggestions.pageId, pages.id))
    .where(
      and(eq(pages.serialId, serialId), eq(pageSuggestions.status, "pending")),
    )
    .groupBy(pages.id, pages.slug, pages.name)
    .orderBy(desc(count()), asc(pages.name));

  return rows.map((r) => ({ ...r, count: Number(r.cnt) }));
}
