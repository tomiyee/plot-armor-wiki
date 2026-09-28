"use server";

import { db } from "@/db/index";
import { chapters, chapterSynopsisSuggestions, users, volumes } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  requireAuthenticated,
  isSerialAdmin,
} from "@/lib/auth-guard";
import type { SuggestionStatus } from "@/types";

// ── Internal helper ───────────────────────────────────────────────────────────

async function getSerialIdByChapterId(chapterId: number): Promise<number> {
  const [row] = await db
    .select({ serialId: volumes.serialId })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(chapters.id, chapterId))
    .limit(1);
  if (!row) throw new Error("Chapter not found.");
  return row.serialId;
}

// ── User-facing actions ───────────────────────────────────────────────────────

/**
 * Submits a suggestion to update the synopsis for a given chapter.
 * Authenticated non-admins only. Replaces any existing pending suggestion by
 * the same user for the same chapter.
 *
 * @example
 * await submitSynopsisSuggestion(7, "Quote from ch. 7", "Luffy arrives at...");
 */
export async function submitSynopsisSuggestion(
  chapterId: number,
  citation: string,
  proposedContent: string,
): Promise<{ error?: string }> {
  const userId = await requireAuthenticated();

  if (!citation.trim()) return { error: "Citation is required." };
  if (!proposedContent.trim()) return { error: "Proposed content cannot be empty." };

  const serialId = await getSerialIdByChapterId(chapterId);
  const isAdmin = await isSerialAdmin(serialId);
  if (isAdmin) return { error: "Admins can edit the synopsis directly." };

  // Replace any existing pending suggestion by this user for this chapter.
  await db
    .delete(chapterSynopsisSuggestions)
    .where(
      and(
        eq(chapterSynopsisSuggestions.chapterId, chapterId),
        eq(chapterSynopsisSuggestions.proposedByUserId, userId),
        eq(chapterSynopsisSuggestions.status, "pending"),
      ),
    );

  await db.insert(chapterSynopsisSuggestions).values({
    chapterId,
    serialId,
    proposedByUserId: userId,
    proposedContent: proposedContent.trim(),
    citation: citation.trim(),
    status: "pending",
  });

  return {};
}

/**
 * Returns the current user's most recent synopsis suggestion for a chapter, or null.
 *
 * @example
 * const suggestion = await getMySynopsisSuggestion(7);
 */
export async function getMySynopsisSuggestion(chapterId: number): Promise<{
  id: number;
  status: SuggestionStatus;
  reviewNote: string | null;
  createdAt: Date;
} | null> {
  const userId = await requireAuthenticated().catch(() => null);
  if (!userId) return null;

  const [row] = await db
    .select({
      id: chapterSynopsisSuggestions.id,
      status: chapterSynopsisSuggestions.status,
      reviewNote: chapterSynopsisSuggestions.reviewNote,
      createdAt: chapterSynopsisSuggestions.createdAt,
    })
    .from(chapterSynopsisSuggestions)
    .where(
      and(
        eq(chapterSynopsisSuggestions.chapterId, chapterId),
        eq(chapterSynopsisSuggestions.proposedByUserId, userId),
      ),
    )
    .orderBy(chapterSynopsisSuggestions.createdAt)
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

// ── Admin-facing actions ──────────────────────────────────────────────────────

/**
 * Returns all pending synopsis suggestions for a chapter. Admin-only.
 *
 * @example
 * const suggestions = await getPendingSynopsisSuggestions(7);
 */
export async function getPendingSynopsisSuggestions(chapterId: number): Promise<
  {
    id: number;
    proposerUsername: string | null;
    proposedContent: string;
    citation: string;
    createdAt: Date;
  }[]
> {
  const serialId = await getSerialIdByChapterId(chapterId);
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return [];

  const rows = await db
    .select({
      id: chapterSynopsisSuggestions.id,
      proposerUsername: users.username,
      proposedContent: chapterSynopsisSuggestions.proposedContent,
      citation: chapterSynopsisSuggestions.citation,
      createdAt: chapterSynopsisSuggestions.createdAt,
    })
    .from(chapterSynopsisSuggestions)
    .innerJoin(users, eq(chapterSynopsisSuggestions.proposedByUserId, users.id))
    .where(
      and(
        eq(chapterSynopsisSuggestions.chapterId, chapterId),
        eq(chapterSynopsisSuggestions.status, "pending"),
      ),
    )
    .orderBy(asc(chapterSynopsisSuggestions.createdAt));

  return rows;
}

/**
 * Approves a synopsis suggestion: writes the proposed content to `chapterSynopses`
 * and marks the suggestion as approved.
 *
 * @example
 * await approveSynopsisSuggestion(3);
 */
export async function approveSynopsisSuggestion(
  suggestionId: number,
  reviewNote?: string,
): Promise<{ error?: string }> {
  const [suggestion] = await db
    .select({
      id: chapterSynopsisSuggestions.id,
      chapterId: chapterSynopsisSuggestions.chapterId,
      serialId: chapterSynopsisSuggestions.serialId,
      proposedContent: chapterSynopsisSuggestions.proposedContent,
      status: chapterSynopsisSuggestions.status,
    })
    .from(chapterSynopsisSuggestions)
    .where(eq(chapterSynopsisSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion) return { error: "Suggestion not found." };
  if (suggestion.status !== "pending") return { error: "Suggestion is not pending." };

  const isAdmin = await isSerialAdmin(suggestion.serialId);
  if (!isAdmin) return { error: "Not authorized." };
  const userId = await requireAuthenticated();

  await db.transaction(async (tx) => {
    const { chapterSynopses } = await import("@/db/schema");
    await tx
      .insert(chapterSynopses)
      .values({ chapterId: suggestion.chapterId, content: suggestion.proposedContent })
      .onConflictDoUpdate({
        target: chapterSynopses.chapterId,
        set: { content: suggestion.proposedContent, updatedAt: new Date() },
      });

    await tx
      .update(chapterSynopsisSuggestions)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedByUserId: userId,
        reviewNote: reviewNote?.trim() ?? null,
      })
      .where(eq(chapterSynopsisSuggestions.id, suggestionId));
  });

  return {};
}

/**
 * Rejects a pending synopsis suggestion with an optional review note.
 *
 * @example
 * await rejectSynopsisSuggestion(3, "Content doesn't match the source.");
 */
export async function rejectSynopsisSuggestion(
  suggestionId: number,
  reviewNote?: string,
): Promise<{ error?: string }> {
  const [suggestion] = await db
    .select({
      id: chapterSynopsisSuggestions.id,
      serialId: chapterSynopsisSuggestions.serialId,
      status: chapterSynopsisSuggestions.status,
    })
    .from(chapterSynopsisSuggestions)
    .where(eq(chapterSynopsisSuggestions.id, suggestionId))
    .limit(1);

  if (!suggestion) return { error: "Suggestion not found." };
  if (suggestion.status !== "pending") return { error: "Suggestion is not pending." };

  const isAdmin = await isSerialAdmin(suggestion.serialId);
  if (!isAdmin) return { error: "Not authorized." };
  const userId = await requireAuthenticated();

  await db
    .update(chapterSynopsisSuggestions)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: userId,
      reviewNote: reviewNote?.trim() ?? null,
    })
    .where(eq(chapterSynopsisSuggestions.id, suggestionId));

  return {};
}

/**
 * Returns the count of pending synopsis suggestions for a serial.
 * Returns 0 when the caller is not an admin.
 *
 * @example
 * const count = await getTotalPendingSynopsisSuggestions(serial.id);
 */
export async function getTotalPendingSynopsisSuggestions(serialId: number): Promise<number> {
  const isAdmin = await isSerialAdmin(serialId);
  if (!isAdmin) return 0;

  const { count } = await import("drizzle-orm");
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(chapterSynopsisSuggestions)
    .where(
      and(
        eq(chapterSynopsisSuggestions.serialId, serialId),
        eq(chapterSynopsisSuggestions.status, "pending"),
      ),
    );

  return Number(cnt);
}
