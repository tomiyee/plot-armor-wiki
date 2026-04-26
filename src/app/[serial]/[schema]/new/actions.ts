'use server';

import { redirect } from 'next/navigation';
import { db } from '@/db/index';
import { serials, pageSchemas, pages } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Creates a new wiki page within the given schema, then redirects to the page's
 * URL. Validates that the serial and schema exist before inserting.
 *
 * @example
 * // In a Server Component:
 * const createPageForSchema = createPage.bind(null, serialSlug, schemaName);
 * <form action={createPageForSchema}>…</form>
 */
export async function createPage(
  serialSlug: string,
  schemaName: string,
  formData: FormData,
) {
  const name = formData.get('name');
  const introChapterIdRaw = formData.get('introChapterId');

  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Page name is required');
  }
  if (!introChapterIdRaw || typeof introChapterIdRaw !== 'string') {
    throw new Error('Intro chapter is required');
  }

  const introChapterId = parseInt(introChapterIdRaw, 10);
  if (isNaN(introChapterId)) throw new Error('Invalid chapter ID');

  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error('Serial not found');

  const [schema] = await db
    .select({ id: pageSchemas.id })
    .from(pageSchemas)
    .where(and(eq(pageSchemas.serialId, serial.id), eq(pageSchemas.name, schemaName)))
    .limit(1);
  if (!schema) throw new Error('Schema not found');

  await db.insert(pages).values({
    schemaId: schema.id,
    name: name.trim(),
    introChapterId,
  });

  redirect(
    `/${serialSlug}/${encodeURIComponent(schemaName)}/${encodeURIComponent(name.trim())}`,
  );
}
