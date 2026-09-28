import { notFound } from "next/navigation";
import { getSerialBySlug } from "@/data/serials/queries";
import { getSerialVolumesAndChapters, getUserProgress } from "@/data/chapters/queries";
import { isSerialAdmin } from "@/lib/auth-guard";
import { fetchSerialHomePage, getHomePageChildren } from "@/data/pages/queries";
import { ChapterSelector } from "@/components/ChapterSelector";
import { SerialNavInjector } from "@/components/SerialNavInjector";
import { SerialTOC } from "@/components/SerialTOC";
import { SerialTOCDrawer } from "@/components/SerialTOCDrawer";
import { ChapterRow, NavbarSerialData } from "@/types";
import { auth } from "@/auth";

interface SerialLayoutProps {
  /** Route segment children rendered inside the layout. */
  children: React.ReactNode;
  /** Next.js dynamic route params containing the `serial` slug. */
  params: Promise<{ serial: string }>;
}

/**
 * Layout for all pages under /{serial}/…. Injects typed serial data and a
 * pre-rendered ChapterSelector into the global navbar via SerialNavInjector.
 *
 * @example
 * // Automatically applied to /[serial], /[serial]/[schema], /[serial]/[schema]/[page], etc.
 */
export default async function SerialLayout(props: SerialLayoutProps) {
  const { children, params } = props;
  const { serial: serialSlug } = await params;

  const serial = await getSerialBySlug(serialSlug);

  if (!serial) {
    notFound();
  }

  // Read authenticated session to determine whether to load DB progress.
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [{ volumeList, chapterList }, adminStatus] = await Promise.all([
    getSerialVolumesAndChapters(serial.id),
    isSerialAdmin(serial.id),
  ]);

  const chaptersByVolume: Partial<Record<number, ChapterRow[]>> = {
    ...Object.groupBy(chapterList, (c) => c.volumeId),
  };

  // Priority (1): authenticated user's DB progress for this serial.
  // Priority (2): cookie/localStorage handled client-side by ChapterSelector.
  // Navbar "Pages" dropdown: immediate children of the Home page.
  // Uses the max-idx pattern to get each child's latest relationship state
  // with no chapter cutoff applied - navigation shows all current children.
  const [dbChapterId, homePage] = await Promise.all([
    userId ? getUserProgress(userId, serial.id) : null,
    fetchSerialHomePage(serial.id),
  ]);
  const navPages = homePage ? await getHomePageChildren(homePage.id) : [];

  const serialNavData: NavbarSerialData = {
    serialSlug,
    serialTitle: serial.title,
    categories: navPages,
    isAdmin: adminStatus,
  };

  const tocContent = (
    <SerialTOC
      key="serial-toc"
      serialId={serial.id}
      serialSlug={serialSlug}
      volumes={volumeList}
      chaptersByVolume={chaptersByVolume}
      chapterType={serial.chapterType}
    />
  );

  return (
    <>
      <SerialNavInjector
        data={serialNavData}
        chapterSelectorSlot={
          <ChapterSelector
            key="chapter-selector"
            serialId={serial.id}
            serialSlug={serialSlug}
            chapterType={serial.chapterType}
            volumes={volumeList}
            chaptersByVolume={chaptersByVolume}
            initialChapterId={dbChapterId}
            isAuthenticated={!!userId}
          />
        }
        tocSlot={<SerialTOCDrawer key="toc-drawer" tocContent={tocContent} />}
        tocContent={tocContent}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </>
  );
}
