import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import { chapters, volumes, chapterSynopses, userProgress } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type {
  ChapterRow,
  ChapterDisplayInfo,
  VolumeDisplayInfo,
  SerialVolumesAndChapters,
  ChapterCutoff,
} from "@/types";

/**
 * Fetches the `idx` for a chapter by its primary key. Returns `null` when the
 * chapter does not exist, so callers can fall back to a default cutoff of 0.
 *
 * Wrapped in `React.cache()` so repeated calls within a single request (e.g.
 * from `getChapterCutoff` and from an action) share one DB hit.
 */
export const getChapterIdxById = cache(async function getChapterIdxById(
  chapterId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return row?.idx ?? null;
});

/**
 * Fetches the full chapter row for a given serial + chapter idx combination.
 * Returns `undefined` when no matching chapter exists.
 *
 * Uses an inner join through `volumes` to scope the lookup to the correct serial
 * (chapter idx values are unique within a serial but not globally).
 */
export async function getChapterBySerialAndIdx(
  serialId: number,
  chapterIdx: number,
): Promise<ChapterRow | undefined> {
  const [row] = await db
    .select({
      id: chapters.id,
      displayName: chapters.displayName,
      idx: chapters.idx,
      volumeId: chapters.volumeId,
    })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), eq(chapters.idx, chapterIdx)))
    .limit(1);
  return row;
}

/**
 * Fetches the display name and idx for a chapter by its primary key.
 * Returns `null` when the chapter does not exist.
 * Used to resolve the intro chapter for a wiki page for spoiler-gate rendering.
 */
export async function fetchChapterById(
  chapterId: number,
): Promise<ChapterDisplayInfo | null> {
  const [row] = await db
    .select({ displayName: chapters.displayName, idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return row ?? null;
}

/**
 * Fetches the synopsis content for a chapter. Returns `null` when no synopsis
 * has been written yet, so callers can fall back to an empty editor state.
 */
export async function fetchChapterSynopsis(
  chapterId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ content: chapterSynopses.content })
    .from(chapterSynopses)
    .where(eq(chapterSynopses.chapterId, chapterId))
    .limit(1);
  return row?.content ?? null;
}

/**
 * Fetches the display name for a volume by its primary key. Returns `null` when
 * the volume does not exist. Used by chapter link previews which already have
 * `volumeId` from the chapter row.
 */
export async function fetchVolumeById(
  volumeId: number,
): Promise<VolumeDisplayInfo | null> {
  const [row] = await db
    .select({ displayName: volumes.displayName })
    .from(volumes)
    .where(eq(volumes.id, volumeId))
    .limit(1);
  return row ?? null;
}

/**
 * Fetches all volumes and chapters for a serial in a single parallel query pair,
 * ordered for display in the chapter selector and TOC sidebar.
 *
 * Wrapped in `React.cache()` so the serial layout (which renders the chapter
 * selector) and the nested wiki page (which renders the edit-mode chapter
 * selector) share one DB round-trip per request.
 */
export const getSerialVolumesAndChapters = cache(
  async function getSerialVolumesAndChapters(
    serialId: number,
  ): Promise<SerialVolumesAndChapters> {
    const [volumeList, chapterList] = await Promise.all([
      db
        .select({
          id: volumes.id,
          displayName: volumes.displayName,
          idx: volumes.idx,
          serialId: volumes.serialId,
        })
        .from(volumes)
        .where(eq(volumes.serialId, serialId))
        .orderBy(asc(volumes.idx)),
      db
        .select({
          id: chapters.id,
          displayName: chapters.displayName,
          idx: chapters.idx,
          volumeId: chapters.volumeId,
        })
        .from(chapters)
        .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
        .where(eq(volumes.serialId, serialId))
        .orderBy(asc(chapters.idx)),
    ]);
    return { volumeList, chapterList };
  },
);

/**
 * Returns the chapter id stored in the user_progress table for a given
 * authenticated user + serial pair, or `null` when no progress row exists.
 *
 * Intentionally avoids any auth check — callers must ensure `userId` is from a
 * verified session before passing it in.
 */
export async function getUserProgress(
  userId: string,
  serialId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ chapterId: userProgress.chapterId })
    .from(userProgress)
    .where(
      and(eq(userProgress.userId, userId), eq(userProgress.serialId, serialId)),
    )
    .limit(1);
  return row?.chapterId ?? null;
}

/**
 * Reads the user's chapter cutoff for a given serial from the progress cookie
 * set by `<ChapterSelector>`. Returns both the chapter id (DB PK) and idx
 * (global ordering integer).
 *
 * Falls back to `{ cutoffIdx: 0, readingChapterId: null }` when no cookie is
 * present — the subquery finds no revision with idx ≤ 0, so all sections
 * render empty (pre-chapter-1 state).
 *
 * This is the single source of truth for cookie-based cutoff resolution;
 * previously duplicated between `[page]/page.tsx` and
 * `chapter/[chapterIdx]/page.tsx`.
 */
const CUTOFF_FALLBACK: ChapterCutoff = { cutoffIdx: 0, readingChapterId: null };

export async function getChapterCutoff(
  serialId: number,
): Promise<ChapterCutoff> {
  const raw = (await cookies()).get(`plotarmor_chapter_${serialId}`)?.value;
  const chapterId = raw ? parseInt(raw, 10) : NaN;
  if (isNaN(chapterId)) return CUTOFF_FALLBACK;

  const idx = await getChapterIdxById(chapterId);
  return idx === null
    ? CUTOFF_FALLBACK
    : { cutoffIdx: idx, readingChapterId: chapterId };
}
