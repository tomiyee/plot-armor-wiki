'use server';

import { db } from '@/db/index';
import { serials, volumes, chapters } from '@/db/schema';
import { and, asc, eq, gte, gt, inArray, lte, max, sql } from 'drizzle-orm';
import { parseChapterType, parseVolumeType } from '@/lib/serial-types';

export async function deleteChapter(serialId: number, formData: FormData) {
  const chapterIdRaw = formData.get('chapterId');
  if (!chapterIdRaw || typeof chapterIdRaw !== 'string') throw new Error('Chapter ID is required');

  const chapterId = parseInt(chapterIdRaw, 10);
  if (isNaN(chapterId)) throw new Error('Invalid chapter ID');

  const [target] = await db.select({ idx: chapters.idx }).from(chapters).where(eq(chapters.id, chapterId));

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
      .where(inArray(chapters.id, toShift.map((c) => c.id)));
  }
}

export async function deleteVolume(serialId: number, formData: FormData) {
  const volumeIdRaw = formData.get('volumeId');
  if (!volumeIdRaw || typeof volumeIdRaw !== 'string') throw new Error('Volume ID is required');

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error('Invalid volume ID');

  const volumeChapters = await db
    .select({ id: chapters.id, idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.volumeId, volumeId));

  const count = volumeChapters.length;
  const minIdx = count > 0 ? Math.min(...volumeChapters.map((c) => c.idx)) : null;

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
        .where(inArray(chapters.id, toShift.map((c) => c.id)));
    }
  }
}

export async function addVolume(serialId: number, formData: FormData) {
  const displayName = formData.get('displayName');
  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
    throw new Error('Volume display name is required');
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

export async function renameVolume(_serialId: number, formData: FormData) {
  const volumeIdRaw = formData.get('volumeId');
  const displayName = formData.get('displayName');

  if (!volumeIdRaw || typeof volumeIdRaw !== 'string') throw new Error('Volume ID is required');
  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') throw new Error('Display name is required');

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error('Invalid volume ID');

  await db.update(volumes).set({ displayName: displayName.trim() }).where(eq(volumes.id, volumeId));
}

export async function renameChapter(_serialId: number, formData: FormData) {
  const chapterIdRaw = formData.get('chapterId');
  const displayName = formData.get('displayName');

  if (!chapterIdRaw || typeof chapterIdRaw !== 'string') throw new Error('Chapter ID is required');
  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') throw new Error('Display name is required');

  const chapterId = parseInt(chapterIdRaw, 10);
  if (isNaN(chapterId)) throw new Error('Invalid chapter ID');

  await db.update(chapters).set({ displayName: displayName.trim() }).where(eq(chapters.id, chapterId));
}

export async function updateSerialTypes(serialId: number, formData: FormData) {
  const chapterType = parseChapterType(formData.get('chapterType'));
  const volumeType = parseVolumeType(formData.get('volumeType'));
  await db.update(serials).set({ chapterType, volumeType }).where(eq(serials.id, serialId));
}

/**
 * Reorders volumes for a serial by reassigning `idx` values in a single transaction.
 * `orderedVolumeIds` must contain every volume ID for the serial — no partial reorders.
 *
 * @example
 * await reorderVolumes(serialId, [3, 1, 2]);
 */
export async function reorderVolumes(serialId: number, orderedVolumeIds: number[]) {
  if (orderedVolumeIds.length === 0) return;

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedVolumeIds.length; i++) {
      await tx
        .update(volumes)
        .set({ idx: i + 1 })
        .where(and(eq(volumes.id, orderedVolumeIds[i]), eq(volumes.serialId, serialId)));
    }
  });
}

/**
 * Reorders chapters within a volume, reassigning global `chapters.idx` values so the
 * serial-level linear order stays strictly increasing (chapters in earlier volumes always
 * precede those in later volumes). All affected rows are updated in a single transaction.
 *
 * `orderedChapterIds` must contain every chapter ID for the target volume — no partial reorders.
 *
 * @example
 * await reorderChapters(serialId, volumeId, [5, 3, 4]);
 */
export async function reorderChapters(
  serialId: number,
  volumeId: number,
  orderedChapterIds: number[],
) {
  if (orderedChapterIds.length === 0) return;

  await db.transaction(async (tx) => {
    const [targetVolume] = await tx
      .select({ idx: volumes.idx })
      .from(volumes)
      .where(and(eq(volumes.id, volumeId), eq(volumes.serialId, serialId)));

    if (!targetVolume) throw new Error('Volume not found');

    // baseIdx is the highest global idx among all chapters that precede this volume,
    // so we can start numbering this volume's chapters immediately after.
    const precedingResult = await tx
      .select({ maxIdx: max(chapters.idx) })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(and(eq(volumes.serialId, serialId), sql`${volumes.idx} < ${targetVolume.idx}`));

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
      .where(and(eq(volumes.serialId, serialId), sql`${volumes.idx} > ${targetVolume.idx}`))
      .orderBy(asc(chapters.idx));

    for (let i = 0; i < followingChapters.length; i++) {
      await tx
        .update(chapters)
        .set({ idx: baseIdx + orderedChapterIds.length + i + 1 })
        .where(eq(chapters.id, followingChapters[i].id));
    }
  });
}

export async function addChapter(serialId: number, formData: FormData) {
  const displayName = formData.get('displayName');
  const volumeIdRaw = formData.get('volumeId');

  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
    throw new Error('Chapter display name is required');
  }
  if (!volumeIdRaw || typeof volumeIdRaw !== 'string') throw new Error('Volume is required');

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) throw new Error('Invalid volume');

  const [targetVolume] = await db
    .select({ idx: volumes.idx })
    .from(volumes)
    .where(eq(volumes.id, volumeId));

  const [{ insertAfterIdx }] = await db
    .select({ insertAfterIdx: max(chapters.idx) })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(and(eq(volumes.serialId, serialId), lte(volumes.idx, targetVolume.idx)));

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
      .where(inArray(chapters.id, toShift.map((c) => c.id)));
  }

  await db.insert(chapters).values({
    volumeId,
    displayName: displayName.trim(),
    idx: newIdx,
  });
}
