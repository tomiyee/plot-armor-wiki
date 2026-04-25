import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, volumes, chapters } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { addChapter, addVolume } from './actions';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{ serial: string }>;
}

export default async function SerialPage({ params }: Props) {
  const { serial: serialSlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
    notFound();
  }

  const [authors, volumeList, chapterList] = await Promise.all([
    db
      .select()
      .from(serialAuthors)
      .where(eq(serialAuthors.serialId, serial.id))
      .orderBy(serialAuthors.displayOrder),
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

  const chaptersByVolume = new Map<number, { id: number; displayName: string; idx: number }[]>();
  volumeList.forEach((v) => chaptersByVolume.set(v.id, []));
  chapterList.forEach((c) => chaptersByVolume.get(c.volumeId)?.push(c));

  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const addChapterForSerial = addChapter.bind(null, serial.id);

  return (
    <main className="flex flex-col items-center px-6 py-16 gap-8">
      <Box col className="w-full max-w-2xl gap-4">
        {/* Serial header */}
        <Box col className="gap-2">
          <Text variant="h1">{serial.title}</Text>
          {authors.length > 0 && (
            <Text muted>{authors.map((a) => a.name).join(', ')}</Text>
          )}
          {serial.description && (
            <Text className="mt-1">{serial.description}</Text>
          )}
        </Box>

        {/* Volume and chapter list */}
        <section className="flex flex-col gap-4 mt-4">
          <Text variant="h2">Volumes &amp; Chapters</Text>
          {volumeList.length > 0 ? (
            <Box col className="gap-5">
              {volumeList.map((volume) => {
                const vChapters = chaptersByVolume.get(volume.id) ?? [];
                return (
                  <Box col key={volume.id} className="gap-2">
                    <Text variant="h4">{volume.displayName}</Text>
                    {vChapters.length > 0 ? (
                      <ol className="flex flex-col gap-1 pl-3 border-l-2 border-gray-100">
                        {vChapters.map((chapter) => (
                          <li
                            key={chapter.id}
                            className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                          >
                            <span>{chapter.displayName}</span>
                            <Text as="span" muted>#{chapter.idx}</Text>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <Text muted className="pl-3">No chapters yet.</Text>
                    )}
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Text muted>No volumes yet. Add a volume to get started.</Text>
          )}
        </section>

        {/* Add volume form */}
        <section className="flex flex-col gap-3 mt-2">
          <Text variant="h3">Add volume</Text>
          <form action={addVolumeForSerial} className="flex gap-3 items-end">
            <Box col flex={1} className="gap-1">
              <Label htmlFor="volumeDisplayName">
                Display name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="volumeDisplayName"
                name="displayName"
                required
                placeholder="e.g. Volume 1"
              />
            </Box>
            <Button type="submit">
              Add volume
            </Button>
          </form>
        </section>

        {/* Add chapter form */}
        <section className="flex flex-col gap-3 mt-2">
          <Text variant="h3">Add chapter</Text>
          {volumeList.length === 0 ? (
            <Text muted>Add a volume before adding chapters.</Text>
          ) : (
            <form action={addChapterForSerial} className="flex flex-col gap-4">
              <Box col className="gap-1">
                <Label htmlFor="volumeId">
                  Volume <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="volumeId"
                  name="volumeId"
                  required
                  defaultValue={volumeList[volumeList.length - 1]?.id}
                  options={volumeList.map((v) => ({
                    label: v.displayName,
                    value: v.id,
                  }))}
                />
              </Box>
              <Box col className="gap-1">
                <Label htmlFor="chapterDisplayName">
                  Display name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="chapterDisplayName"
                  name="displayName"
                  required
                  placeholder="e.g. Chapter 1"
                />
              </Box>
              <Button type="submit" className="self-start">
                Add chapter
              </Button>
            </form>
          )}
        </section>
      </Box>
    </main>
  );
}
