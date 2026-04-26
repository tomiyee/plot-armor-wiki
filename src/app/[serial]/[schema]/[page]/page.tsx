import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db/index';
import { serials, pageSchemas, pages, chapters } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';

interface Props {
  params: Promise<{ serial: string; schema: string; page: string }>;
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

  const [introChapter] = await db
    .select({ displayName: chapters.displayName })
    .from(chapters)
    .where(eq(chapters.id, page.introChapterId))
    .limit(1);

  return (
    <main className="flex flex-col items-center px-6 py-16 gap-8">
      <Box col className="w-full max-w-2xl gap-6">
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
      </Box>
    </main>
  );
}
