import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, volumes, chapters } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { addChapter, addVolume, deleteChapter, deleteVolume, renameChapter, renameVolume } from './actions';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { SerialEditor } from '@/components/SerialEditor';

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

  const chaptersByVolume: Record<number, { id: number; displayName: string; idx: number; volumeId: number }[]> = {};
  volumeList.forEach((v) => { chaptersByVolume[v.id] = []; });
  chapterList.forEach((c) => { chaptersByVolume[c.volumeId]?.push(c); });

  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const addChapterForSerial = addChapter.bind(null, serial.id);
  const deleteChapterForSerial = deleteChapter.bind(null, serial.id);
  const deleteVolumeForSerial = deleteVolume.bind(null, serial.id);
  const renameChapterForSerial = renameChapter.bind(null, serial.id);
  const renameVolumeForSerial = renameVolume.bind(null, serial.id);

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

        {/* Volume and chapter list with edit mode */}
        <SerialEditor
          volumes={volumeList}
          chaptersByVolume={chaptersByVolume}
          addChapterAction={addChapterForSerial}
          addVolumeAction={addVolumeForSerial}
          deleteChapterAction={deleteChapterForSerial}
          deleteVolumeAction={deleteVolumeForSerial}
          renameChapterAction={renameChapterForSerial}
          renameVolumeAction={renameVolumeForSerial}
        />
      </Box>
    </main>
  );
}
