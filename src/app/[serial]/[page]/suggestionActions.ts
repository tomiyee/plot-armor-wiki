"use server";

import { db } from "@/db/index";
import { chapters, pageInfoboxContentRevisions, pageSuggestions } from "@/db/schema";
import { and, eq, lte, max } from "drizzle-orm";
import {
  requireAuthenticated,
  requireSerialAdminByPageId,
  isSerialAdmin,
} from "@/lib/auth-guard";
import { applyPageContentRevision, applyPageInfoboxRevision } from "./revisionHelpers";
import {
  fetchSerialIdByPageId,
  fetchMyPageSuggestions,
  fetchPendingSuggestionCount,
  fetchPendingSuggestions,
  fetchTotalPendingSuggestions,
  fetchPendingSuggestionsByPage,
} from "@/data/suggestions/queries";
import type { SuggestionStatus } from "@/types";

/** Drizzle transaction type inferred from the db client. */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/**
 * Resolves the infobox image URL active at or before `cutoffIdx`, so
 * approving a suggestion that only proposes infobox text doesn't clobber an
 * existing image.
 */
async function resolveCurrentInfoboxImageUrl(
  tx: Tx,
  pageId: number,
  cutoffIdx: number,
): Promise<string | null> {
  const maxIdxSq = tx
    .select({ maxIdx: max(chapters.idx).as("max_idx") })
    .from(pageInfoboxContentRevisions)
    .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
    .where(
      and(
        eq(pageInfoboxContentRevisions.pageId, pageId),
        lte(chapters.idx, cutoffIdx),
      ),
    )
    .as("current_ib_image_max_idx_sq");

  const [row] = await tx
    .select({ imageUrl: pageInfoboxContentRevisions.imageUrl })
    .from(pageInfoboxContentRevisions)
    .innerJoin(chapters, eq(pageInfoboxContentRevisions.chapterId, chapters.id))
    .innerJoin(maxIdxSq, eq(chapters.idx, maxIdxSq.maxIdx))
    .where(eq(pageInfoboxContentRevisions.pageId, pageId));

  return row?.imageUrl ?? null;
}

// ── User-facing actions ───────────────────────────────────────────────────────

/**
 * Submits a suggestion to change a wiki page's body and/or infobox content.
 * Requires the caller to be authenticated but NOT an admin - admins use
 * `savePageContent` directly.
 *
 * @example
 * await submitPageSuggestion(42, 7, "Quote from ch. 5", "New body...", "**Age:** 20");
 */
export async function submitPageSuggestion(
  pageId: number,
  targetChapterId: number,
  citation: string,
  proposedContent: string | null,
  proposedInfoboxContent: string | null = null,
): Promise<{ error?: string }> {
  const userId = await requireAuthenticated();

  if (!citation.trim()) return { error: "Citation is required." };
  if (!proposedContent?.trim() && !proposedInfoboxContent?.trim()) {
    return { error: "At least one change is required." };
  }

  // Admins should use savePageContent directly.
  const serialId = await fetchSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (isAdmin)
    return {
      error: "Admins should use the edit mode to save content directly.",
    };

  await db.insert(pageSuggestions).values({
    pageId,
    proposedByUserId: userId,
    targetChapterId,
    citation: citation.trim(),
    status: "pending",
    proposedContent: proposedContent?.trim() ? proposedContent : null,
    proposedInfoboxContent: proposedInfoboxContent?.trim()
      ? proposedInfoboxContent
      : null,
  });

  return {};
}

/**
 * Returns all suggestions submitted by the current user for a given page,
 * ordered most-recent first. Used to show per-page status feedback.
 *
 * @example
 * const suggestions = await getMyPageSuggestions(42);
 * // → [{ status: 'pending', reviewNote: null }, ...]
 */
export async function getMyPageSuggestions(pageId: number): Promise<
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
  const userId = await requireAuthenticated().catch(() => null);
  if (!userId) return [];
  return fetchMyPageSuggestions(pageId, userId);
}

// ── Admin-facing actions ──────────────────────────────────────────────────────

/**
 * Returns a count of pending suggestions for a given page.
 * Returns 0 when the caller is not an admin, so callers can pass it safely.
 *
 * @example
 * const count = await getPendingSuggestionCount(42);
 */
export async function getPendingSuggestionCount(
  pageId: number,
): Promise<number> {
  const serialId = await fetchSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return 0;
  return fetchPendingSuggestionCount(pageId);
}

/**
 * Returns all pending suggestions for a page, with proposer username and the
 * proposed vs. current body/infobox content. Admin-only - returns empty
 * array otherwise.
 *
 * @example
 * const suggestions = await getPendingSuggestions(42);
 */
export async function getPendingSuggestions(pageId: number): Promise<
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
  const serialId = await fetchSerialIdByPageId(pageId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];
  return fetchPendingSuggestions(pageId);
}

/**
 * Approves a pending suggestion: writes the proposed body/infobox content
 * into page_content_revisions / page_infobox_content_revisions at the
 * suggestion's target chapter (same upsert path as savePageContent), then
 * marks the suggestion as approved. Requires admin access to the page's serial.
 *
 * @example
 * await approveSuggestion(5, "Looks accurate - verified against ch. 5 text.");
 */
export async function approveSuggestion(
  suggestionId: number,
  reviewNote?: string,
): Promise<{ error?: string }> {
  const [suggestion] = await db
    .select({
      id: pageSuggestions.id,
      pageId: pageSuggestions.pageId,
      targetChapterId: pageSuggestions.targetChapterId,
      status: pageSuggestions.status,
      proposedContent: pageSuggestions.proposedContent,
      proposedInfoboxContent: pageSuggestions.proposedInfoboxContent,
    })
    .from(pageSuggestions)
    .where(eq(pageSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion) return { error: "Suggestion not found." };
  if (suggestion.status !== "pending")
    return { error: "Suggestion is not pending." };

  const adminUserId = await requireSerialAdminByPageId(suggestion.pageId);

  await db.transaction(async (tx) => {
    const [targetChapterRow] = await tx
      .select({ idx: chapters.idx })
      .from(chapters)
      .where(eq(chapters.id, suggestion.targetChapterId))
      .limit(1);
    const targetIdx = targetChapterRow?.idx ?? 0;

    if (suggestion.proposedContent !== null) {
      await applyPageContentRevision(
        tx,
        suggestion.pageId,
        suggestion.targetChapterId,
        targetIdx,
        suggestion.proposedContent,
      );
    }

    if (suggestion.proposedInfoboxContent !== null) {
      // A suggestion never proposes an image change - resolve whatever image
      // URL is currently active at the target chapter and carry it forward
      // unchanged alongside the suggested infobox text.
      const currentImageUrl = await resolveCurrentInfoboxImageUrl(
        tx,
        suggestion.pageId,
        targetIdx,
      );
      await applyPageInfoboxRevision(
        tx,
        suggestion.pageId,
        suggestion.targetChapterId,
        targetIdx,
        suggestion.proposedInfoboxContent,
        currentImageUrl,
      );
    }

    await tx
      .update(pageSuggestions)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
        reviewNote: reviewNote?.trim() ?? null,
      })
      .where(eq(pageSuggestions.id, suggestionId));
  });

  return {};
}

/**
 * Rejects a pending suggestion, optionally with a review note explaining why.
 * Requires admin access to the page's serial.
 *
 * @example
 * await rejectSuggestion(5, "Content doesn't appear in the source material.");
 */
export async function rejectSuggestion(
  suggestionId: number,
  reviewNote?: string,
): Promise<{ error?: string }> {
  const [suggestion] = await db
    .select({
      id: pageSuggestions.id,
      pageId: pageSuggestions.pageId,
      status: pageSuggestions.status,
    })
    .from(pageSuggestions)
    .where(eq(pageSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion) return { error: "Suggestion not found." };
  if (suggestion.status !== "pending")
    return { error: "Suggestion is not pending." };

  const adminUserId = await requireSerialAdminByPageId(suggestion.pageId);

  await db
    .update(pageSuggestions)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: adminUserId,
      reviewNote: reviewNote?.trim() ?? null,
    })
    .where(eq(pageSuggestions.id, suggestionId));

  return {};
}

/**
 * Returns the total count of pending suggestions across all pages of a serial.
 * Returns 0 when the caller is not an admin for that serial. Used for the
 * serial home badge summarising outstanding review work.
 *
 * @example
 * const total = await getTotalPendingSuggestions(serial.id);
 */
export async function getTotalPendingSuggestions(
  serialId: number,
): Promise<number> {
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return 0;
  return fetchTotalPendingSuggestions(serialId);
}

/**
 * Returns pending suggestion counts grouped by page for a serial.
 * Returns empty array when the caller is not an admin.
 *
 * @example
 * const pages = await getPendingSuggestionsByPage(serial.id);
 */
export async function getPendingSuggestionsByPage(
  serialId: number,
): Promise<
  { pageId: number; pageSlug: string; pageName: string; count: number }[]
> {
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];
  return fetchPendingSuggestionsByPage(serialId);
}
