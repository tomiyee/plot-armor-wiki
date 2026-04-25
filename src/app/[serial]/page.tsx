import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, volumes, chapters } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { addChapter, addVolume } from './actions';

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
      <div className="w-full max-w-2xl flex flex-col gap-4">
        {/* Serial header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">{serial.title}</h1>
          {authors.length > 0 && (
            <p className="text-sm text-gray-500">
              {authors.map((a) => a.name).join(', ')}
            </p>
          )}
          {serial.description && (
            <p className="text-base text-gray-700 mt-1">{serial.description}</p>
          )}
        </div>

        {/* Volume and chapter list */}
        <section className="flex flex-col gap-4 mt-4">
          <h2 className="text-xl font-semibold">Volumes &amp; Chapters</h2>
          {volumeList.length > 0 ? (
            <div className="flex flex-col gap-5">
              {volumeList.map((volume) => {
                const vChapters = chaptersByVolume.get(volume.id) ?? [];
                return (
                  <div key={volume.id} className="flex flex-col gap-2">
                    <h3 className="text-base font-semibold">{volume.displayName}</h3>
                    {vChapters.length > 0 ? (
                      <ol className="flex flex-col gap-1 pl-3 border-l-2 border-gray-100">
                        {vChapters.map((chapter) => (
                          <li
                            key={chapter.id}
                            className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                          >
                            <span>{chapter.displayName}</span>
                            <span className="text-gray-400">#{chapter.idx}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-gray-400 pl-3">No chapters yet.</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No volumes yet. Add a volume to get started.</p>
          )}
        </section>

        {/* Add volume form */}
        <section className="flex flex-col gap-3 mt-2">
          <h3 className="text-lg font-semibold">Add volume</h3>
          <form action={addVolumeForSerial} className="flex gap-3 items-end">
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="volumeDisplayName" className="text-sm font-medium">
                Display name <span className="text-red-500">*</span>
              </label>
              <input
                id="volumeDisplayName"
                name="displayName"
                type="text"
                required
                placeholder="e.g. Volume 1"
                className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add volume
            </button>
          </form>
        </section>

        {/* Add chapter form */}
        <section className="flex flex-col gap-3 mt-2">
          <h3 className="text-lg font-semibold">Add chapter</h3>
          {volumeList.length === 0 ? (
            <p className="text-sm text-gray-500">Add a volume before adding chapters.</p>
          ) : (
            <form action={addChapterForSerial} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="volumeId" className="text-sm font-medium">
                  Volume <span className="text-red-500">*</span>
                </label>
                <select
                  id="volumeId"
                  name="volumeId"
                  required
                  defaultValue={volumeList[volumeList.length - 1]?.id}
                  className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black bg-white"
                >
                  {volumeList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="chapterDisplayName" className="text-sm font-medium">
                  Display name <span className="text-red-500">*</span>
                </label>
                <input
                  id="chapterDisplayName"
                  name="displayName"
                  type="text"
                  required
                  placeholder="e.g. Chapter 1"
                  className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <button
                type="submit"
                className="self-start rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Add chapter
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
