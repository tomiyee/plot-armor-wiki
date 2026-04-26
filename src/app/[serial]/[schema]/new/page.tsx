import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db/index';
import { serials, pageSchemas, volumes, chapters } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { createPage } from './actions';

interface Props {
  params: Promise<{ serial: string; schema: string }>;
}

export default async function NewPagePage({ params }: Props) {
  const { serial: serialSlug, schema: schemaSlug } = await params;

  const schemaName = decodeURIComponent(schemaSlug);

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

  const [volumeList, chapterList] = await Promise.all([
    db
      .select()
      .from(volumes)
      .where(eq(volumes.serialId, serial.id))
      .orderBy(volumes.idx),
    db
      .select({
        id: chapters.id,
        displayName: chapters.displayName,
        idx: chapters.idx,
        volumeId: chapters.volumeId,
      })
      .from(chapters)
      .innerJoin(volumes, eq(chapters.volumeId, volumes.id))
      .where(eq(volumes.serialId, serial.id))
      .orderBy(chapters.idx),
  ]);

  // Build grouped options: one optgroup per volume
  const chaptersByVolume: Record<
    number,
    { id: number; displayName: string; idx: number }[]
  > = {};
  volumeList.forEach((v) => { chaptersByVolume[v.id] = []; });
  chapterList.forEach((c) => { chaptersByVolume[c.volumeId]?.push(c); });

  const chapterOptions = volumeList
    .filter((v) => (chaptersByVolume[v.id]?.length ?? 0) > 0)
    .map((v) => ({
      label: v.displayName,
      value: -v.id, // placeholder — groups are non-selectable
      children: (chaptersByVolume[v.id] ?? []).map((c) => ({
        label: c.displayName,
        value: c.id,
      })),
    }));

  const firstChapterId = chapterList[0]?.id;

  const createPageAction = createPage.bind(null, serialSlug, schemaName);

  return (
    <main className="flex flex-col items-center px-6 py-16">
      <Box col className="w-full max-w-lg gap-8">
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

        <Text variant="h1" className="text-2xl">
          New {schemaName} page
        </Text>

        <form action={createPageAction} className="flex flex-col gap-5">
          {/* Page name */}
          <Box col className="gap-1">
            <Label htmlFor="name">
              Page name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              placeholder={`e.g. Monkey D. Luffy`}
              autoFocus
            />
          </Box>

          {/* Intro chapter */}
          <Box col className="gap-1">
            <Label htmlFor="introChapterId">
              Intro {serial.chapterType.toLowerCase()}{' '}
              <span className="text-red-500">*</span>
            </Label>
            {chapterOptions.length > 0 ? (
              <Select
                id="introChapterId"
                name="introChapterId"
                options={chapterOptions}
                defaultValue={firstChapterId}
              />
            ) : (
              <Text muted className="text-sm">
                No chapters yet.{' '}
                <Link href={`/${serialSlug}`} className="text-blue-600 hover:underline">
                  Add a chapter first.
                </Link>
              </Text>
            )}
          </Box>

          <Button
            type="submit"
            className="mt-2"
            disabled={chapterOptions.length === 0}
          >
            Create page
          </Button>
        </form>
      </Box>
    </main>
  );
}
