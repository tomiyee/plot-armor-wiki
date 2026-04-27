import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { db } from '@/db/index';
import {
  serials,
  pageSchemas,
  pages,
  chapters,
  schemaSections,
  pageSectionVersions,
  schemaFloaterRows,
  pageFloaterVersions,
  pageFloaterRowVersions,
} from '@/db/schema';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, eq, isNull, lte, or, gt } from 'drizzle-orm';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { PageEditor } from './PageEditor';

interface Props {
  params: Promise<{ serial: string; schema: string; page: string }>;
}

/**
 * Reads the user's chapter cutoff idx for a given serial from the
 * progress cookie set by <ChapterSelector>.  Returns the chapter idx
 * (a global, serial-level integer) so Server Components can apply the
 * SCD Type 2 range filter without an extra round-trip per query.
 *
 * Falls back to 0 when no cookie is present so that the range filter
 * still works — it simply returns only content that starts at chapter 0
 * or earlier, which in practice is nothing, rendering all sections empty.
 *
 * @example
 * const cutoffIdx = await getChapterCutoffIdx(serial.id);
 */
async function getChapterCutoffIdx(serialId: number): Promise<number> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(`plotarmor_chapter_${serialId}`)?.value;
  if (!raw) return 0;

  const chapterId = parseInt(raw, 10);
  if (isNaN(chapterId)) return 0;

  const [row] = await db
    .select({ idx: chapters.idx })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  return row?.idx ?? 0;
}

export default async function PageView({ params }: Props) {
  const { serial: serialSlug, schema: schemaSlug, page: pageSlug } = await params;

  const schemaName = decodeURIComponent(schemaSlug);
  const pageName = decodeURIComponent(pageSlug);

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [schema] = await db
    .select()
    .from(pageSchemas)
    .where(and(eq(pageSchemas.serialId, serial.id), eq(pageSchemas.name, schemaName)))
    .limit(1);

  if (!schema) {
    notFound();
  }

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.schemaId, schema.id), eq(pages.name, pageName)))
    .limit(1);

  if (!page) {
    notFound();
  }

  // Resolve the user's progress cutoff for this serial (SCD Type 2 filter).
  const cutoffIdx = await getChapterCutoffIdx(serial.id);

  // Aliased chapter joins for the SCD Type 2 range filter.
  // We need two aliases because each versioned table has both a from_chapter_id
  // and a to_chapter_id that must be compared against chapters.idx independently.
  const fromChapter = alias(chapters, 'from_chapter');
  const toChapter = alias(chapters, 'to_chapter');

  // SCD Type 2 range filter: from_chapter_idx <= cutoff AND (to_chapter_idx IS NULL OR to_chapter_idx > cutoff)
  // Achieved by LEFT JOINing chapters twice (aliased) so we can compare .idx without subqueries.
  const [[introChapter], activeSections, sectionVersions] = await Promise.all([
    db
      .select({ displayName: chapters.displayName })
      .from(chapters)
      .where(eq(chapters.id, page.introChapterId))
      .limit(1),
    db
      .select({ id: schemaSections.id, name: schemaSections.name })
      .from(schemaSections)
      .where(and(eq(schemaSections.schemaId, schema.id), isNull(schemaSections.deletedAt)))
      .orderBy(asc(schemaSections.displayOrder)),
    db
      .select({
        sectionId: pageSectionVersions.sectionId,
        content: pageSectionVersions.content,
      })
      .from(pageSectionVersions)
      .innerJoin(fromChapter, eq(pageSectionVersions.fromChapterId, fromChapter.id))
      .leftJoin(toChapter, eq(pageSectionVersions.toChapterId, toChapter.id))
      .where(
        and(
          eq(pageSectionVersions.pageId, page.id),
          lte(fromChapter.idx, cutoffIdx),
          or(
            isNull(pageSectionVersions.toChapterId),
            gt(toChapter.idx, cutoffIdx),
          ),
        ),
      ),
  ]);

  const contentBySectionId = new Map(
    sectionVersions.map((v) => [v.sectionId, v.content]),
  );

  const sections = activeSections.map((s) => ({
    id: s.id,
    name: s.name,
    content: contentBySectionId.get(s.id) ?? '',
  }));

  // ── Floater data (only when schema.hasFloater) ────────────────────────────
  let floaterImageUrl: string | null | undefined = undefined;
  let floaterRows: { id: number; label: string; content: string }[] = [];

  if (schema.hasFloater) {
    const fromChapterF = alias(chapters, 'from_chapter_f');
    const toChapterF = alias(chapters, 'to_chapter_f');
    const fromChapterFR = alias(chapters, 'from_chapter_fr');
    const toChapterFR = alias(chapters, 'to_chapter_fr');

    const [[floaterVersion], fetchedRows, floaterRowVersions] = await Promise.all([
      db
        .select({ imageUrl: pageFloaterVersions.imageUrl })
        .from(pageFloaterVersions)
        .innerJoin(fromChapterF, eq(pageFloaterVersions.fromChapterId, fromChapterF.id))
        .leftJoin(toChapterF, eq(pageFloaterVersions.toChapterId, toChapterF.id))
        .where(
          and(
            eq(pageFloaterVersions.pageId, page.id),
            lte(fromChapterF.idx, cutoffIdx),
            or(
              isNull(pageFloaterVersions.toChapterId),
              gt(toChapterF.idx, cutoffIdx),
            ),
          ),
        )
        .limit(1),
      db
        .select({ id: schemaFloaterRows.id, label: schemaFloaterRows.label })
        .from(schemaFloaterRows)
        .where(
          and(
            eq(schemaFloaterRows.schemaId, schema.id),
            isNull(schemaFloaterRows.deletedAt),
          ),
        )
        .orderBy(asc(schemaFloaterRows.displayOrder)),
      db
        .select({
          floaterRowId: pageFloaterRowVersions.floaterRowId,
          content: pageFloaterRowVersions.content,
        })
        .from(pageFloaterRowVersions)
        .innerJoin(fromChapterFR, eq(pageFloaterRowVersions.fromChapterId, fromChapterFR.id))
        .leftJoin(toChapterFR, eq(pageFloaterRowVersions.toChapterId, toChapterFR.id))
        .where(
          and(
            eq(pageFloaterRowVersions.pageId, page.id),
            lte(fromChapterFR.idx, cutoffIdx),
            or(
              isNull(pageFloaterRowVersions.toChapterId),
              gt(toChapterFR.idx, cutoffIdx),
            ),
          ),
        ),
    ]);

    const rowContentMap = new Map(floaterRowVersions.map((v) => [v.floaterRowId, v.content]));

    floaterImageUrl = floaterVersion?.imageUrl ?? null;
    floaterRows = fetchedRows.map((r) => ({
      id: r.id,
      label: r.label,
      content: rowContentMap.get(r.id) ?? '',
    }));
  }

  return (
    <main className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <Box col className="gap-6">
          {/* Breadcrumb */}
          <Text muted className="text-sm">
            <Link href={`/${serialSlug}`} className="hover:underline">
              {serial.title}
            </Link>
            {' / '}
            <Link
              href={`/${serialSlug}/${encodeURIComponent(schemaName)}`}
              className="hover:underline"
            >
              {schemaName}
            </Link>
          </Text>

          <Box col className="gap-2">
            <Text variant="h1">{page.name}</Text>
            {introChapter && (
              <Text muted className="text-sm">
                Introduced in {serial.chapterType} {introChapter.displayName}
              </Text>
            )}
          </Box>

          <PageEditor
            serialSlug={serialSlug}
            schemaName={schemaName}
            pageName={pageName}
            sections={sections}
            floaterImageUrl={floaterImageUrl}
            floaterRows={floaterRows}
          />
        </Box>
      </div>
    </main>
  );
}
