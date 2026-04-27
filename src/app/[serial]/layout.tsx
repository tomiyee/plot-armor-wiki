import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/index";
import { serials, volumes, chapters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Box } from "@/components/ui/box";
import { ChapterSelector } from "@/components/ChapterSelector";

interface Props {
  children: React.ReactNode;
  params: Promise<{ serial: string }>;
}

/**
 * Layout for all pages under /{serial}/…. Renders a serial-scoped sub-bar
 * below the global navbar containing the <ChapterSelector> for this serial.
 *
 * @example
 * // Automatically applied to /[serial], /[serial]/[schema], /[serial]/[schema]/[page], etc.
 */
export default async function SerialLayout({ children, params }: Props) {
  const { serial: serialSlug } = await params;

  const [serial] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);

  if (!serial) {
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

  const chaptersByVolume: Record<
    number,
    { id: number; displayName: string; idx: number; volumeId: number }[]
  > = {};
  volumeList.forEach((v) => {
    chaptersByVolume[v.id] = [];
  });
  chapterList.forEach((c) => {
    chaptersByVolume[c.volumeId]?.push(c);
  });

  return (
    <>
      {/* Serial-scoped chapter-progress sub-bar */}
      <div className="flex-none border-b bg-gray-800 px-6 py-2">
        <Box className="mx-auto max-w-5xl items-center justify-between gap-4">
          <Link
            href={`/${serialSlug}`}
            className="truncate text-sm font-medium text-gray-200 hover:text-white"
          >
            {serial.title}
          </Link>
          <ChapterSelector
            serialId={serial.id}
            chapterType={serial.chapterType}
            volumes={volumeList}
            chaptersByVolume={chaptersByVolume}
          />
        </Box>
      </div>
      <div className="flex-1 min-h-0 overflow-y-scroll">{children}</div>
    </>
  );
}
