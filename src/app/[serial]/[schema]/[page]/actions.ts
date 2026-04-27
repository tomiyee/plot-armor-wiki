'use server';

import { db } from '@/db/index';
import {
  serials,
  pageSchemas,
  pages,
  chapters,
  volumes,
  pageSectionVersions,
  pageFloaterVersions,
  pageFloaterRowVersions,
} from '@/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';

/**
 * Resolves the latest chapter (highest idx) for a given serial.
 * Edits always write at head so the new version is immediately visible
 * to readers who are fully caught up.
 */
async function getHeadChapterId(serialId: number): Promise<number> {
  const [row] = await db
    .select({ id: chapters.id, idx: chapters.idx })
    .from(chapters)
    .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
    .where(eq(volumes.serialId, serialId))
    .orderBy(desc(chapters.idx))
    .limit(1);

  if (!row) throw new Error('Serial has no chapters — cannot save content.');
  return row.id;
}

/**
 * Saves all page content via the SCD Type 2 write path.
 *
 * For each changed section / floater field:
 *   1. Close the currently-open row by setting `to_chapter_id = headChapterId`.
 *   2. Insert a new open row with `from_chapter_id = headChapterId`, `to_chapter_id = NULL`.
 * If no open row exists for a field, just insert a new one.
 *
 * `sectionContent` maps section ID → new markdown string.
 * `floaterImageUrl` is null when the schema has no floater.
 * `floaterRowContent` maps floater-row ID → new content string.
 *
 * @example
 * await savePageContent(serialSlug, schemaName, pageName, sectionContent, floaterImageUrl, floaterRowContent);
 */
export async function savePageContent(
  serialSlug: string,
  schemaName: string,
  pageName: string,
  sectionContent: Record<number, string>,
  floaterImageUrl: string | null,
  floaterRowContent: Record<number, string>,
): Promise<void> {
  const [serial] = await db
    .select({ id: serials.id })
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  if (!serial) throw new Error('Serial not found');

  const [schema] = await db
    .select({ id: pageSchemas.id, hasFloater: pageSchemas.hasFloater })
    .from(pageSchemas)
    .where(and(eq(pageSchemas.serialId, serial.id), eq(pageSchemas.name, schemaName)))
    .limit(1);
  if (!schema) throw new Error('Schema not found');

  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.schemaId, schema.id), eq(pages.name, pageName)))
    .limit(1);
  if (!page) throw new Error('Page not found');

  const headChapterId = await getHeadChapterId(serial.id);

  await db.transaction(async (tx) => {
    // ── Section content ────────────────────────────────────────────────────────
    for (const [sectionIdStr, content] of Object.entries(sectionContent)) {
      const sectionId = parseInt(sectionIdStr, 10);

      // Find the currently-open row (to_chapter_id IS NULL)
      const [openRow] = await tx
        .select({ fromChapterId: pageSectionVersions.fromChapterId })
        .from(pageSectionVersions)
        .where(
          and(
            eq(pageSectionVersions.pageId, page.id),
            eq(pageSectionVersions.sectionId, sectionId),
            isNull(pageSectionVersions.toChapterId),
          ),
        )
        .limit(1);

      if (openRow) {
        if (openRow.fromChapterId === headChapterId) {
          // The open row already starts at head — update it in-place (no new version needed).
          await tx
            .update(pageSectionVersions)
            .set({ content })
            .where(
              and(
                eq(pageSectionVersions.pageId, page.id),
                eq(pageSectionVersions.sectionId, sectionId),
                eq(pageSectionVersions.fromChapterId, headChapterId),
              ),
            );
        } else {
          // Close the open row and open a new one at head.
          await tx
            .update(pageSectionVersions)
            .set({ toChapterId: headChapterId })
            .where(
              and(
                eq(pageSectionVersions.pageId, page.id),
                eq(pageSectionVersions.sectionId, sectionId),
                eq(pageSectionVersions.fromChapterId, openRow.fromChapterId),
              ),
            );
          await tx.insert(pageSectionVersions).values({
            pageId: page.id,
            sectionId,
            fromChapterId: headChapterId,
            toChapterId: null,
            content,
          });
        }
      } else {
        // No open row yet — insert a fresh one at head.
        await tx.insert(pageSectionVersions).values({
          pageId: page.id,
          sectionId,
          fromChapterId: headChapterId,
          toChapterId: null,
          content,
        });
      }
    }

    // ── Floater image URL ──────────────────────────────────────────────────────
    if (schema.hasFloater) {
      const [openRow] = await tx
        .select({ fromChapterId: pageFloaterVersions.fromChapterId })
        .from(pageFloaterVersions)
        .where(
          and(
            eq(pageFloaterVersions.pageId, page.id),
            isNull(pageFloaterVersions.toChapterId),
          ),
        )
        .limit(1);

      if (openRow) {
        if (openRow.fromChapterId === headChapterId) {
          await tx
            .update(pageFloaterVersions)
            .set({ imageUrl: floaterImageUrl })
            .where(
              and(
                eq(pageFloaterVersions.pageId, page.id),
                eq(pageFloaterVersions.fromChapterId, headChapterId),
              ),
            );
        } else {
          await tx
            .update(pageFloaterVersions)
            .set({ toChapterId: headChapterId })
            .where(
              and(
                eq(pageFloaterVersions.pageId, page.id),
                eq(pageFloaterVersions.fromChapterId, openRow.fromChapterId),
              ),
            );
          await tx.insert(pageFloaterVersions).values({
            pageId: page.id,
            fromChapterId: headChapterId,
            toChapterId: null,
            imageUrl: floaterImageUrl,
          });
        }
      } else {
        await tx.insert(pageFloaterVersions).values({
          pageId: page.id,
          fromChapterId: headChapterId,
          toChapterId: null,
          imageUrl: floaterImageUrl,
        });
      }
    }

    // ── Floater row content ────────────────────────────────────────────────────
    for (const [floaterRowIdStr, content] of Object.entries(floaterRowContent)) {
      const floaterRowId = parseInt(floaterRowIdStr, 10);

      const [openRow] = await tx
        .select({ fromChapterId: pageFloaterRowVersions.fromChapterId })
        .from(pageFloaterRowVersions)
        .where(
          and(
            eq(pageFloaterRowVersions.pageId, page.id),
            eq(pageFloaterRowVersions.floaterRowId, floaterRowId),
            isNull(pageFloaterRowVersions.toChapterId),
          ),
        )
        .limit(1);

      if (openRow) {
        if (openRow.fromChapterId === headChapterId) {
          await tx
            .update(pageFloaterRowVersions)
            .set({ content })
            .where(
              and(
                eq(pageFloaterRowVersions.pageId, page.id),
                eq(pageFloaterRowVersions.floaterRowId, floaterRowId),
                eq(pageFloaterRowVersions.fromChapterId, headChapterId),
              ),
            );
        } else {
          await tx
            .update(pageFloaterRowVersions)
            .set({ toChapterId: headChapterId })
            .where(
              and(
                eq(pageFloaterRowVersions.pageId, page.id),
                eq(pageFloaterRowVersions.floaterRowId, floaterRowId),
                eq(pageFloaterRowVersions.fromChapterId, openRow.fromChapterId),
              ),
            );
          await tx.insert(pageFloaterRowVersions).values({
            pageId: page.id,
            floaterRowId,
            fromChapterId: headChapterId,
            toChapterId: null,
            content,
          });
        }
      } else {
        await tx.insert(pageFloaterRowVersions).values({
          pageId: page.id,
          floaterRowId,
          fromChapterId: headChapterId,
          toChapterId: null,
          content,
        });
      }
    }
  });
}
