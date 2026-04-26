'use server';

import { db } from '@/db/index';
import { serials, volumes, chapters, pageSchemas, schemaSections, schemaFloaterRows } from '@/db/schema';
import { and, eq, gte, gt, inArray, isNull, lte, max, sql } from 'drizzle-orm';

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

const CHAPTER_TYPES = ['Chapter', 'Episode', 'Issue', 'Part'] as const;
const VOLUME_TYPES = ['Volume', 'Season', 'Arc', 'Book'] as const;
type ChapterType = (typeof CHAPTER_TYPES)[number];
type VolumeType = (typeof VOLUME_TYPES)[number];

export async function updateSerialTypes(serialId: number, formData: FormData) {
  const chapterTypeRaw = formData.get('chapterType');
  const volumeTypeRaw = formData.get('volumeType');

  const chapterType: ChapterType = CHAPTER_TYPES.includes(chapterTypeRaw as ChapterType)
    ? (chapterTypeRaw as ChapterType)
    : 'Chapter';
  const volumeType: VolumeType = VOLUME_TYPES.includes(volumeTypeRaw as VolumeType)
    ? (volumeTypeRaw as VolumeType)
    : 'Volume';

  await db.update(serials).set({ chapterType, volumeType }).where(eq(serials.id, serialId));
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

// ─── Schema management ────────────────────────────────────────────────────────

export async function addSchema(serialId: number, formData: FormData) {
  const name = formData.get('name');
  const hasFloaterRaw = formData.get('hasFloater');

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Schema name is required');
  }

  await db.insert(pageSchemas).values({
    serialId,
    name: name.trim(),
    hasFloater: hasFloaterRaw === 'true',
  });
}

export async function deleteSchema(_serialId: number, formData: FormData) {
  const schemaIdRaw = formData.get('schemaId');
  if (!schemaIdRaw || typeof schemaIdRaw !== 'string') throw new Error('Schema ID is required');

  const schemaId = parseInt(schemaIdRaw, 10);
  if (isNaN(schemaId)) throw new Error('Invalid schema ID');

  await db.delete(pageSchemas).where(eq(pageSchemas.id, schemaId));
}

export async function renameSchema(_serialId: number, formData: FormData) {
  const schemaIdRaw = formData.get('schemaId');
  const name = formData.get('name');

  if (!schemaIdRaw || typeof schemaIdRaw !== 'string') throw new Error('Schema ID is required');
  if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('Name is required');

  const schemaId = parseInt(schemaIdRaw, 10);
  if (isNaN(schemaId)) throw new Error('Invalid schema ID');

  await db.update(pageSchemas).set({ name: name.trim() }).where(eq(pageSchemas.id, schemaId));
}

// ─── Section management ───────────────────────────────────────────────────────

export async function addSection(_serialId: number, formData: FormData) {
  const schemaIdRaw = formData.get('schemaId');
  const name = formData.get('name');

  if (!schemaIdRaw || typeof schemaIdRaw !== 'string') throw new Error('Schema ID is required');
  if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('Section name is required');

  const schemaId = parseInt(schemaIdRaw, 10);
  if (isNaN(schemaId)) throw new Error('Invalid schema ID');

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(schemaSections.displayOrder) })
    .from(schemaSections)
    .where(and(eq(schemaSections.schemaId, schemaId), isNull(schemaSections.deletedAt)));

  await db.insert(schemaSections).values({
    schemaId,
    name: name.trim(),
    displayOrder: (maxOrder ?? 0) + 1,
  });
}

export async function deleteSection(_serialId: number, formData: FormData) {
  const sectionIdRaw = formData.get('sectionId');
  if (!sectionIdRaw || typeof sectionIdRaw !== 'string') throw new Error('Section ID is required');

  const sectionId = parseInt(sectionIdRaw, 10);
  if (isNaN(sectionId)) throw new Error('Invalid section ID');

  await db
    .update(schemaSections)
    .set({ deletedAt: new Date() })
    .where(eq(schemaSections.id, sectionId));
}

export async function renameSection(_serialId: number, formData: FormData) {
  const sectionIdRaw = formData.get('sectionId');
  const name = formData.get('name');

  if (!sectionIdRaw || typeof sectionIdRaw !== 'string') throw new Error('Section ID is required');
  if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('Name is required');

  const sectionId = parseInt(sectionIdRaw, 10);
  if (isNaN(sectionId)) throw new Error('Invalid section ID');

  await db.update(schemaSections).set({ name: name.trim() }).where(eq(schemaSections.id, sectionId));
}

export async function reorderSections(_serialId: number, formData: FormData) {
  const orderedIdsRaw = formData.get('orderedIds');
  if (!orderedIdsRaw || typeof orderedIdsRaw !== 'string') throw new Error('Ordered IDs are required');

  const orderedIds: number[] = JSON.parse(orderedIdsRaw);

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(schemaSections)
        .set({ displayOrder: index + 1 })
        .where(eq(schemaSections.id, id))
    )
  );
}

// ─── Floater row management ───────────────────────────────────────────────────

export async function addFloaterRow(_serialId: number, formData: FormData) {
  const schemaIdRaw = formData.get('schemaId');
  const label = formData.get('label');

  if (!schemaIdRaw || typeof schemaIdRaw !== 'string') throw new Error('Schema ID is required');
  if (!label || typeof label !== 'string' || label.trim() === '') throw new Error('Label is required');

  const schemaId = parseInt(schemaIdRaw, 10);
  if (isNaN(schemaId)) throw new Error('Invalid schema ID');

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(schemaFloaterRows.displayOrder) })
    .from(schemaFloaterRows)
    .where(and(eq(schemaFloaterRows.schemaId, schemaId), isNull(schemaFloaterRows.deletedAt)));

  await db.insert(schemaFloaterRows).values({
    schemaId,
    label: label.trim(),
    displayOrder: (maxOrder ?? 0) + 1,
  });
}

export async function deleteFloaterRow(_serialId: number, formData: FormData) {
  const rowIdRaw = formData.get('rowId');
  if (!rowIdRaw || typeof rowIdRaw !== 'string') throw new Error('Row ID is required');

  const rowId = parseInt(rowIdRaw, 10);
  if (isNaN(rowId)) throw new Error('Invalid row ID');

  await db
    .update(schemaFloaterRows)
    .set({ deletedAt: new Date() })
    .where(eq(schemaFloaterRows.id, rowId));
}

export async function renameFloaterRow(_serialId: number, formData: FormData) {
  const rowIdRaw = formData.get('rowId');
  const label = formData.get('label');

  if (!rowIdRaw || typeof rowIdRaw !== 'string') throw new Error('Row ID is required');
  if (!label || typeof label !== 'string' || label.trim() === '') throw new Error('Label is required');

  const rowId = parseInt(rowIdRaw, 10);
  if (isNaN(rowId)) throw new Error('Invalid row ID');

  await db.update(schemaFloaterRows).set({ label: label.trim() }).where(eq(schemaFloaterRows.id, rowId));
}

export async function reorderFloaterRows(_serialId: number, formData: FormData) {
  const orderedIdsRaw = formData.get('orderedIds');
  if (!orderedIdsRaw || typeof orderedIdsRaw !== 'string') throw new Error('Ordered IDs are required');

  const orderedIds: number[] = JSON.parse(orderedIdsRaw);

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(schemaFloaterRows)
        .set({ displayOrder: index + 1 })
        .where(eq(schemaFloaterRows.id, id))
    )
  );
}
