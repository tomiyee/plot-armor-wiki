'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, volumes, chapters } from '@/db/schema';
import { eq, max } from 'drizzle-orm';

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

  const [serial] = await db
    .select({ slug: serials.slug })
    .from(serials)
    .where(eq(serials.id, serialId));

  redirect(`/${serial.slug}`);
}

export async function addChapter(serialId: number, formData: FormData) {
  const displayName = formData.get('displayName');
  const volumeIdRaw = formData.get('volumeId');

  if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
    throw new Error('Chapter display name is required');
  }

  if (!volumeIdRaw || typeof volumeIdRaw !== 'string') {
    throw new Error('Volume is required');
  }

  const volumeId = parseInt(volumeIdRaw, 10);
  if (isNaN(volumeId)) {
    throw new Error('Invalid volume');
  }

  const [{ maxIdx }] = await db
    .select({ maxIdx: max(chapters.idx) })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId));

  await db.insert(chapters).values({
    volumeId,
    displayName: displayName.trim(),
    idx: (maxIdx ?? 0) + 1,
  });

  const [serial] = await db
    .select({ slug: serials.slug })
    .from(serials)
    .where(eq(serials.id, serialId));

  redirect(`/${serial.slug}`);
}
