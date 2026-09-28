"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/index";
import {
  serials,
  serialAuthors,
  volumes,
  chapters,
  pages,
  pageTitles,
  serialAdmins,
  users,
  userProgress,
} from "@/db/schema";
import {
  and,
  asc,
  count,
  eq,
  gte,
  gt,
  ilike,
  inArray,
  isNotNull,
  lte,
  max,
  not,
  sql,
} from "drizzle-orm";
import { parseChapterType, parseVolumeType } from "@/lib/serial-types";
import { titleToSlug } from "@/lib/slug";
import { requireSerialAdmin } from "@/lib/auth-guard";
import { auth } from "@/auth";

export async function deleteChapter(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const chapterIdRaw = formData.get("chapterId");
  if (!chapterIdRaw || typeof chapterIdRaw !== "string")
    throw new Error("Chapter ID is required");

  const chapterId = parseInt(chapterIdRaw, 10);
  if (isNaN(chapterId)) throw new Error("Invalid chapter ID");

  const [target] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId));

  await db.delete(chapters).where(eq(chapters.id, chapterId));

  const toShift = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), gt(chapters.idx, target.idx)));

  if (toShift.length > 0) {
    await db
      .update(chapters)
      .set({ idx: sql`${chapters.idx} - 1` })
      .where(
        inArray(
          chapters.id,
          toShift.map((c) => c.id),
        ),
      );
  }
}

export async function deleteVolume(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const volumeIdRaw = formData.get("volumeId");
  if (!volumeIdRaw || typeof volumeIdRaw !== "string")
    throw new Error("Volume ID is required");

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error("Invalid volume ID");

  const volumeChapters = await db
    .select({ id: chapters.id, idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.volumeId, volumeId));

  const count = volumeChapters.length;
  const minIdx =
    count > 0 ? Math.min(...volumeChapters.map((c) => c.idx)) : null;

  await db.delete(chapters).where(eq(chapters.volumeId, volumeId));
  await db.delete(volumes).where(eq(volumes.id, volumeId));

  if (count > 0 && minIdx !== null) {
    const toShift = await db
      .select({ id: chapters.id })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(volumes.serialId, serialId), gte(chapters.idx, minIdx)));

    if (toShift.length > 0) {
      await db
        .update(chapters)
        .set({ idx: sql`${chapters.idx} - ${count}` })
        .where(
          inArray(
            chapters.id,
            toShift.map((c) => c.id),
          ),
        );
    }
  }
}

export async function addVolume(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const displayName = formData.get("displayName");
  if (
    !displayName ||
    typeof displayName !== "string" ||
    displayName.trim() === ""
  ) {
    throw new Error("Volume display name is required");
  }

  const [{ maxIdx }] = await db
    .select({ maxIdx: max(volumes.idx) })
    .from(volumes)
    .where(eq(volumes.serialId, serialId));

  await db.insert(volumes).values({
    serialId,
    displayName: displayName.trim(),
    idx: (maxIdx ?? 0) + 1,
  });
}

export async function renameVolume(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const volumeIdRaw = formData.get("volumeId");
  const displayName = formData.get("displayName");

  if (!volumeIdRaw || typeof volumeIdRaw !== "string")
    throw new Error("Volume ID is required");
  if (
    !displayName ||
    typeof displayName !== "string" ||
    displayName.trim() === ""
  )
    throw new Error("Display name is required");

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error("Invalid volume ID");

  await db
    .update(volumes)
    .set({ displayName: displayName.trim() })
    .where(eq(volumes.id, volumeId));
}

export async function renameChapter(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const chapterIdRaw = formData.get("chapterId");
  const displayName = formData.get("displayName");

  if (!chapterIdRaw || typeof chapterIdRaw !== "string")
    throw new Error("Chapter ID is required");
  if (
    !displayName ||
    typeof displayName !== "string" ||
    displayName.trim() === ""
  )
    throw new Error("Display name is required");

  const chapterId = parseInt(chapterIdRaw, 10);
  if (isNaN(chapterId)) throw new Error("Invalid chapter ID");

  await db
    .update(chapters)
    .set({ displayName: displayName.trim() })
    .where(eq(chapters.id, chapterId));
}

export async function updateSerialTypes(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const chapterType = parseChapterType(formData.get("chapterType"));
  const volumeType = parseVolumeType(formData.get("volumeType"));
  await db
    .update(serials)
    .set({ chapterType, volumeType })
    .where(eq(serials.id, serialId));
}

/**
 * Reorders volumes for a serial by reassigning `idx` values in a single transaction.
 * `orderedVolumeIds` must contain every volume ID for the serial - no partial reorders.
 *
 * @example
 * await reorderVolumes(serialId, [3, 1, 2]);
 */
export async function reorderVolumes(
  serialId: number,
  orderedVolumeIds: number[],
) {
  await requireSerialAdmin(serialId);
  if (orderedVolumeIds.length === 0) return;

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedVolumeIds.length; i++) {
      await tx
        .update(volumes)
        .set({ idx: i + 1 })
        .where(
          and(
            eq(volumes.id, orderedVolumeIds[i]),
            eq(volumes.serialId, serialId),
          ),
        );
    }

    // Re-sequence chapter idx to match the new volume order, preserving within-volume order.
    let chapterIdx = 0;
    for (const volumeId of orderedVolumeIds) {
      const volumeChapters = await tx
        .select({ id: chapters.id })
        .from(chapters)
        .where(eq(chapters.volumeId, volumeId))
        .orderBy(asc(chapters.idx));

      for (const chapter of volumeChapters) {
        chapterIdx++;
        await tx
          .update(chapters)
          .set({ idx: chapterIdx })
          .where(eq(chapters.id, chapter.id));
      }
    }
  });
}

/**
 * Reorders chapters within a volume, reassigning global `chapters.idx` values so the
 * serial-level linear order stays strictly increasing (chapters in earlier volumes always
 * precede those in later volumes). All affected rows are updated in a single transaction.
 *
 * `orderedChapterIds` must contain every chapter ID for the target volume - no partial reorders.
 *
 * @example
 * await reorderChapters(serialId, volumeId, [5, 3, 4]);
 */
export async function reorderChapters(
  serialId: number,
  volumeId: number,
  orderedChapterIds: number[],
) {
  await requireSerialAdmin(serialId);
  if (orderedChapterIds.length === 0) return;

  await db.transaction(async (tx) => {
    const [targetVolume] = await tx
      .select({ idx: volumes.idx })
      .from(volumes)
      .where(and(eq(volumes.id, volumeId), eq(volumes.serialId, serialId)));

    if (!targetVolume) throw new Error("Volume not found");

    // baseIdx is the highest global idx among all chapters that precede this volume,
    // so we can start numbering this volume's chapters immediately after.
    const precedingResult = await tx
      .select({ maxIdx: max(chapters.idx) })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(
        and(
          eq(volumes.serialId, serialId),
          sql`${volumes.idx} < ${targetVolume.idx}`,
        ),
      );

    const baseIdx = precedingResult[0]?.maxIdx ?? 0;

    for (let i = 0; i < orderedChapterIds.length; i++) {
      await tx
        .update(chapters)
        .set({ idx: baseIdx + i + 1 })
        .where(eq(chapters.id, orderedChapterIds[i]));
    }

    // Re-sequence later volumes so the global idx remains strictly increasing.
    // Fetch ordered by idx to preserve their relative order.
    const followingChapters = await tx
      .select({ id: chapters.id })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(
        and(
          eq(volumes.serialId, serialId),
          sql`${volumes.idx} > ${targetVolume.idx}`,
        ),
      )
      .orderBy(asc(chapters.idx));

    for (let i = 0; i < followingChapters.length; i++) {
      await tx
        .update(chapters)
        .set({ idx: baseIdx + orderedChapterIds.length + i + 1 })
        .where(eq(chapters.id, followingChapters[i].id));
    }
  });
}

/**
 * Reassigns every chapter's `idx` and `volumeId` for a serial in one transaction.
 * Covers both within-volume reordering and cross-volume chapter moves.
 *
 * `volumeOrder` defines the global chapter sequence (earlier volumes → lower idx).
 * `chaptersByVolumeId` must include every chapter in the serial - no partial updates.
 *
 * @example
 * await reorderAllChapters(serialId, [1, 2], { 1: [10, 11], 2: [12] });
 */
export async function reorderAllChapters(
  serialId: number,
  volumeOrder: number[],
  chaptersByVolumeId: Record<number, number[]>,
) {
  await requireSerialAdmin(serialId);
  if (volumeOrder.length === 0) return;

  const serialVolumes = await db
    .select({ id: volumes.id })
    .from(volumes)
    .where(eq(volumes.serialId, serialId));
  const validVolumeIds = new Set(serialVolumes.map((v) => v.id));

  await db.transaction(async (tx) => {
    let idx = 0;
    for (const volumeId of volumeOrder) {
      if (!validVolumeIds.has(volumeId)) continue;
      for (const chapterId of chaptersByVolumeId[volumeId] ?? []) {
        idx++;
        await tx
          .update(chapters)
          .set({ idx, volumeId })
          .where(eq(chapters.id, chapterId));
      }
    }
  });
}

export async function updateSerialMetadata(
  serialId: number,
  formData: FormData,
) {
  await requireSerialAdmin(serialId);
  const title = formData.get("title");
  if (!title || typeof title !== "string" || title.trim() === "") {
    throw new Error("Title is required");
  }

  const splashArtUrl = formData.get("splashArtUrl");

  const authorValues = formData.getAll("authors") as string[];
  const filteredAuthors = authorValues
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  const newSlug = titleToSlug(title.trim());

  await db
    .update(serials)
    .set({
      title: title.trim(),
      slug: newSlug,
      splashArtUrl:
        splashArtUrl && typeof splashArtUrl === "string" && splashArtUrl.trim()
          ? splashArtUrl.trim()
          : null,
    })
    .where(eq(serials.id, serialId));

  // Replace all authors: delete existing rows and insert fresh ones.
  await db.delete(serialAuthors).where(eq(serialAuthors.serialId, serialId));
  if (filteredAuthors.length > 0) {
    await db.insert(serialAuthors).values(
      filteredAuthors.map((name, i) => ({
        serialId,
        name,
        displayOrder: i + 1,
      })),
    );
  }

  redirect(`/${newSlug}`);
}

export async function addChapter(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);
  const displayName = formData.get("displayName");
  const volumeIdRaw = formData.get("volumeId");

  if (
    !displayName ||
    typeof displayName !== "string" ||
    displayName.trim() === ""
  ) {
    throw new Error("Chapter display name is required");
  }
  if (!volumeIdRaw || typeof volumeIdRaw !== "string")
    throw new Error("Volume is required");

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error("Invalid volume");

  const [targetVolume] = await db
    .select({ idx: volumes.idx })
    .from(volumes)
    .where(eq(volumes.id, volumeId));

  const [{ insertAfterIdx }] = await db
    .select({ insertAfterIdx: max(chapters.idx) })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(
      and(eq(volumes.serialId, serialId), lte(volumes.idx, targetVolume.idx)),
    );

  const newIdx = (insertAfterIdx ?? 0) + 1;

  const toShift = await db
    .select({ id: chapters.id })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), gte(chapters.idx, newIdx)));

  if (toShift.length > 0) {
    await db
      .update(chapters)
      .set({ idx: sql`${chapters.idx} + 1` })
      .where(
        inArray(
          chapters.id,
          toShift.map((c) => c.id),
        ),
      );
  }

  // Check whether this is the first chapter for the serial before inserting.
  const [{ existingCount }] = await db
    .select({ existingCount: count(chapters.id) })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId));

  const isFirstChapter = existingCount === 0;

  const [newChapter] = await db
    .insert(chapters)
    .values({
      volumeId,
      displayName: displayName.trim(),
      idx: newIdx,
    })
    .returning({ id: chapters.id });

  // When the first chapter is added, create a pageTitles entry for the home
  // page so it participates in temporal name tracking from this chapter onward.
  if (isFirstChapter) {
    const [homePage] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.serialId, serialId), eq(pages.isHomePage, true)));

    if (homePage) {
      await db
        .insert(pageTitles)
        .values({
          pageId: homePage.id,
          chapterId: newChapter.id,
          title: "Home",
        })
        .onConflictDoNothing();
    }
  }
}

// ── Bulk TOC apply ────────────────────────────────────────────────────────────

/** A chapter entry in the bulk-TOC JSON payload. */
export interface TocChapterEntry {
  /** Existing chapter DB id, or null for new inserts. */
  id: number | null;
  /** New display name (may differ from the current name to trigger a rename). */
  displayName: string;
}

/** A volume entry in the bulk-TOC JSON payload. */
export interface TocVolumeEntry {
  /** Existing volume DB id, or null for new inserts. */
  id: number | null;
  /** New display name (may differ from the current name to trigger a rename). */
  displayName: string;
  /** Ordered list of chapters belonging to this volume. */
  chapters: TocChapterEntry[];
}

/** The full payload shape accepted by `bulkApplyToc`. */
export interface BulkTocPayload {
  volumes: TocVolumeEntry[];
}

/**
 * Atomically applies a bulk TOC edit: renames existing volumes/chapters,
 * inserts new ones, and reorders everything according to the supplied payload.
 *
 * **Safety invariant**: every volume and chapter ID that currently exists in the
 * DB for this serial must appear in the payload. If any existing ID is absent the
 * action throws a validation error rather than silently deleting data.
 *
 * @example
 * await bulkApplyToc(serialId, {
 *   volumes: [
 *     { id: 1, displayName: "Volume 1", chapters: [{ id: 10, displayName: "Chapter 1" }] },
 *     { id: null, displayName: "Volume 2", chapters: [{ id: null, displayName: "Chapter 1" }] },
 *   ],
 * });
 */
export async function bulkApplyToc(
  serialId: number,
  payload: BulkTocPayload,
): Promise<void> {
  await requireSerialAdmin(serialId);

  // ── 1. Load current state ──────────────────────────────────────────────────
  const [existingVolumes, existingChapters] = await Promise.all([
    db
      .select({ id: volumes.id })
      .from(volumes)
      .where(eq(volumes.serialId, serialId)),
    db
      .select({ id: chapters.id })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(eq(volumes.serialId, serialId)),
  ]);

  const existingVolumeIds = new Set(existingVolumes.map((v) => v.id));
  const existingChapterIds = new Set(existingChapters.map((c) => c.id));

  // ── 2. Validate - no implicit deletes ────────────────────────────────────
  const payloadVolumeIds = new Set<number>();
  const payloadChapterIds = new Set<number>();

  for (const vol of payload.volumes) {
    if (vol.id !== null) payloadVolumeIds.add(vol.id);
    for (const ch of vol.chapters) {
      if (ch.id !== null) payloadChapterIds.add(ch.id);
    }
  }

  const missingVolumeIds = [...existingVolumeIds].filter(
    (id) => !payloadVolumeIds.has(id),
  );
  const missingChapterIds = [...existingChapterIds].filter(
    (id) => !payloadChapterIds.has(id),
  );

  if (missingVolumeIds.length > 0 || missingChapterIds.length > 0) {
    const parts: string[] = [];
    if (missingVolumeIds.length > 0)
      parts.push(`volume IDs: ${missingVolumeIds.join(", ")}`);
    if (missingChapterIds.length > 0)
      parts.push(`chapter IDs: ${missingChapterIds.join(", ")}`);
    throw new Error(
      `Bulk TOC import rejected: the following existing IDs are absent from the payload (use the per-entry delete UI to remove them): ${parts.join("; ")}`,
    );
  }

  // ── 3. Apply in a single transaction ────────────────────────────────────
  await db.transaction(async (tx) => {
    // Track newly-inserted volume ids in payload order.
    const resolvedVolumeIds: number[] = [];
    // Track newly-inserted chapter ids grouped by resolved volume id.
    const resolvedChaptersByVolume: Record<number, number[]> = {};

    // 3a. Ensure all volumes exist and are renamed if needed.
    for (const vol of payload.volumes) {
      let volumeId: number;

      if (vol.id === null) {
        // Insert new volume with a temporary idx; final reorder happens below.
        const [{ maxIdx }] = await tx
          .select({ maxIdx: max(volumes.idx) })
          .from(volumes)
          .where(eq(volumes.serialId, serialId));

        const [newVol] = await tx
          .insert(volumes)
          .values({
            serialId,
            displayName: vol.displayName.trim(),
            idx: (maxIdx ?? 0) + 1,
          })
          .returning({ id: volumes.id });
        volumeId = newVol.id;
      } else {
        volumeId = vol.id;
        // Rename if necessary.
        await tx
          .update(volumes)
          .set({ displayName: vol.displayName.trim() })
          .where(and(eq(volumes.id, volumeId), eq(volumes.serialId, serialId)));
      }

      resolvedVolumeIds.push(volumeId);
      resolvedChaptersByVolume[volumeId] = [];
    }

    // 3b. Ensure all chapters exist and are renamed / moved if needed.
    for (let vi = 0; vi < payload.volumes.length; vi++) {
      const vol = payload.volumes[vi];
      const volumeId = resolvedVolumeIds[vi];

      for (const ch of vol.chapters) {
        let chapterId: number;

        if (ch.id === null) {
          // Insert new chapter with a temporary idx.
          const [{ maxIdx }] = await tx
            .select({ maxIdx: max(chapters.idx) })
            .from(chapters)
            .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
            .where(eq(volumes.serialId, serialId));

          const [newCh] = await tx
            .insert(chapters)
            .values({
              volumeId,
              displayName: ch.displayName.trim(),
              idx: (maxIdx ?? 0) + 1,
            })
            .returning({ id: chapters.id });
          chapterId = newCh.id;
        } else {
          chapterId = ch.id;
          // Rename if necessary and update volumeId for cross-volume moves.
          await tx
            .update(chapters)
            .set({ displayName: ch.displayName.trim(), volumeId })
            .where(eq(chapters.id, chapterId));
        }

        resolvedChaptersByVolume[volumeId].push(chapterId);
      }
    }

    // 3c. Re-sequence all idx values so they are strictly increasing in the
    //     new volume order, reusing the same logic as reorderAllChapters.
    let volIdx = 0;
    let chIdx = 0;
    for (const volumeId of resolvedVolumeIds) {
      volIdx++;
      await tx
        .update(volumes)
        .set({ idx: volIdx })
        .where(eq(volumes.id, volumeId));

      for (const chapterId of resolvedChaptersByVolume[volumeId] ?? []) {
        chIdx++;
        await tx
          .update(chapters)
          .set({ idx: chIdx, volumeId })
          .where(eq(chapters.id, chapterId));
      }
    }
  });
}

// ── Admin management ─────────────────────────────────────────────────────────

/**
 * Looks up a user by `username` and grants them admin access to the serial.
 * Silently no-ops if the user is already an admin (ON CONFLICT DO NOTHING).
 *
 * @example
 * await addSerialAdmin(42, new FormData()); // formData has "username" field
 */
export async function addSerialAdmin(serialId: number, formData: FormData) {
  await requireSerialAdmin(serialId);

  const username = formData.get("username");
  if (!username || typeof username !== "string" || username.trim() === "") {
    throw new Error("Username is required");
  }

  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.trim()))
    .limit(1);

  if (!targetUser)
    throw new Error(`No user with username "${username.trim()}" found.`);

  await db
    .insert(serialAdmins)
    .values({ userId: targetUser.id, serialId })
    .onConflictDoNothing();
}

/**
 * Removes a user from the admin list for a serial. Prevents removal when the
 * target user is the sole remaining admin.
 *
 * @example
 * await removeSerialAdmin(42, new FormData()); // formData has "userId" field
 */
export async function removeSerialAdmin(serialId: number, formData: FormData) {
  const callerId = await requireSerialAdmin(serialId);

  const targetUserId = formData.get("userId");
  if (!targetUserId || typeof targetUserId !== "string") {
    throw new Error("User ID is required");
  }

  // Count current admins to prevent removing the last one.
  const [{ adminCount }] = await db
    .select({ adminCount: count(serialAdmins.userId) })
    .from(serialAdmins)
    .where(eq(serialAdmins.serialId, serialId));

  if (adminCount <= 1) {
    throw new Error("Cannot remove the sole admin of a serial.");
  }

  // Extra guard: prevent a caller from removing themselves if they are the sole admin
  // (already covered above, but kept for clarity).
  void callerId;

  await db
    .delete(serialAdmins)
    .where(
      and(
        eq(serialAdmins.userId, targetUserId),
        eq(serialAdmins.serialId, serialId),
      ),
    );
}

/**
 * Returns up to 10 users whose username contains `query` and who are not
 * already admins of the given serial. Requires the caller to be an admin.
 *
 * @example
 * const users = await searchUsersForSerial(42, "ali");
 */
export async function searchUsersForSerial(
  serialId: number,
  query: string,
): Promise<{ userId: string; username: string }[]> {
  await requireSerialAdmin(serialId);

  const q = query.trim();

  const currentAdmins = await db
    .select({ userId: serialAdmins.userId })
    .from(serialAdmins)
    .where(eq(serialAdmins.serialId, serialId));
  const excludeIds = currentAdmins.map((a) => a.userId);

  const results = await db
    .select({ userId: users.id, username: users.username })
    .from(users)
    .where(
      and(
        isNotNull(users.username),
        q ? ilike(users.username, `%${q}%`) : undefined,
        excludeIds.length > 0 ? not(inArray(users.id, excludeIds)) : undefined,
      ),
    )
    .limit(10);

  return results.map((r) => ({ userId: r.userId, username: r.username! }));
}

/**
 * Upserts a `user_progress` row for the authenticated user so that their
 * chapter progress is persisted in the database across devices and sessions.
 *
 * Silently no-ops when the caller is not authenticated (anonymous users rely
 * on cookie/localStorage only). Does NOT require serial admin privileges - any
 * logged-in user can save their own reading progress.
 *
 * @example
 * await syncUserProgress(serialId, chapterId);
 */
export async function syncUserProgress(
  serialId: number,
  chapterId: number,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  await db
    .insert(userProgress)
    .values({
      userId: session.user.id,
      serialId,
      chapterId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userProgress.userId, userProgress.serialId],
      set: {
        chapterId,
        updatedAt: new Date(),
      },
    });
}
