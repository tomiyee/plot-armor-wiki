import { notFound } from "next/navigation";
import Link from "next/link";
import { getSerialBySlug } from "@/data/serials/queries";
import {
  getChapterCutoff,
  getSerialVolumesAndChapters,
  getChapterBySerialAndIdx,
  fetchChapterSynopsis,
} from "@/data/chapters/queries";
import {
  resolvePageTitlesAtIdx,
  fetchSerialPagesAtIdx,
  fetchPagesIntroducedInChapter,
} from "@/data/pages/queries";
import type { ChapterRow } from "@/types";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { SerialTOCSidebar } from "@/components/SerialTOCSidebar";
import { ChapterSynopsisEditor } from "./ChapterSynopsisEditor";
import { saveChapterSynopsis } from "./actions";
import { EditModeAdminSetter } from "@/contexts/EditModeContext";
import { isSerialAdmin, isAuthenticated } from "@/lib/auth-guard";
import { SynopsisSuggestionSection } from "./SynopsisSuggestionSection";
import { SynopsisReviewPanel } from "./SynopsisReviewPanel";
import {
  getMySynopsisSuggestion,
  getPendingSynopsisSuggestions,
} from "./synopsisSuggestionActions";
import type { SuggestionStatus } from "@/types";
import {
  addChapter,
  addVolume,
  deleteChapter,
  deleteVolume,
  renameChapter,
  renameVolume,
  reorderVolumes,
  reorderAllChapters,
  updateSerialTypes,
  bulkApplyToc,
} from "../../actions";

interface ChapterPageProps {
  /** Next.js dynamic route params: `serial` slug and `chapterIdx` string. */
  params: Promise<{ serial: string; chapterIdx: string }>;
}

/** Server Component for the chapter detail page: synopsis, introduced pages, and suggestion workflow. */
export default async function ChapterPage(props: ChapterPageProps) {
  const { params } = props;
  const { serial: serialSlug, chapterIdx: chapterIdxRaw } = await params;

  const chapterIdx = parseInt(chapterIdxRaw, 10);
  if (isNaN(chapterIdx)) {
    notFound();
  }

  const serial = await getSerialBySlug(serialSlug);

  if (!serial) {
    notFound();
  }

  const [isAdmin, authenticatedUserId, { volumeList, chapterList }] =
    await Promise.all([
      isSerialAdmin(serial.id),
      isAuthenticated(),
      getSerialVolumesAndChapters(serial.id),
    ]);

  const chaptersByVolume: Record<number, ChapterRow[]> = {};
  volumeList.forEach((v) => {
    chaptersByVolume[v.id] = [];
  });
  chapterList.forEach((c) => {
    chaptersByVolume[c.volumeId]?.push(c);
  });

  const chapter = await getChapterBySerialAndIdx(serial.id, chapterIdx);

  if (!chapter) {
    notFound();
  }

  // Derive the volume name from the already-fetched volumeList - no extra query needed.
  const volume = volumeList.find((v) => v.id === chapter.volumeId);

  // Check the user's reading progress cookie against this chapter's idx.
  const { cutoffIdx } = await getChapterCutoff(serial.id);

  const spoilered = chapter.idx > cutoffIdx;

  const addChapterForSerial = addChapter.bind(null, serial.id);
  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const deleteChapterForSerial = deleteChapter.bind(null, serial.id);
  const deleteVolumeForSerial = deleteVolume.bind(null, serial.id);
  const renameChapterForSerial = renameChapter.bind(null, serial.id);
  const renameVolumeForSerial = renameVolume.bind(null, serial.id);
  const reorderVolumesForSerial = reorderVolumes.bind(null, serial.id);
  const reorderAllChaptersForSerial = reorderAllChapters.bind(null, serial.id);
  const updateSerialTypesForSerial = updateSerialTypes.bind(null, serial.id);
  const bulkApplyTocForSerial = bulkApplyToc.bind(null, serial.id);

  let synopsisContent = "";
  let wikiPages: { name: string; slug: string }[] = [];
  let groupedIntroductions: {
    categoryName: string;
    pages: { id: number; name: string; slug: string }[];
  }[] = [];
  let boundSaveAction: ((content: string) => Promise<void>) | null = null;
  let mySynopsisSuggestion: {
    id: number;
    status: SuggestionStatus;
    reviewNote: string | null;
    createdAt: Date;
  } | null = null;
  let pendingSynopsisSuggestions: {
    id: number;
    proposerUsername: string | null;
    proposedContent: string;
    citation: string;
    createdAt: Date;
  }[] = [];

  if (!spoilered) {
    const [
      synopsis,
      rawWikiPages,
      introducedPages,
      mySuggestion,
      pendingSuggestions,
    ] = await Promise.all([
      fetchChapterSynopsis(chapter.id),
      fetchSerialPagesAtIdx(serial.id, chapter.idx),
      fetchPagesIntroducedInChapter(serial.id, chapter.id),
      getMySynopsisSuggestion(chapter.id),
      getPendingSynopsisSuggestions(chapter.id),
    ]);

    synopsisContent = synopsis ?? "";

    // Resolve chapter-versioned titles for wiki pages (for the MDEditor autocomplete).
    const wikiTitleByPageId = await resolvePageTitlesAtIdx(
      rawWikiPages.map((p) => p.id),
      chapter.idx,
    );
    wikiPages = rawWikiPages.map((p) => ({
      name: wikiTitleByPageId.get(p.id) ?? p.name,
      slug: p.slug,
    }));

    if (introducedPages.length > 0) {
      const introTitleByPageId = await resolvePageTitlesAtIdx(
        introducedPages.map((p) => p.id),
        cutoffIdx,
      );
      const resolvedPages = introducedPages
        .map((p) => ({
          id: p.id,
          name: introTitleByPageId.get(p.id) ?? p.name,
          slug: p.slug,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      groupedIntroductions = [{ categoryName: "", pages: resolvedPages }];
    }

    boundSaveAction = saveChapterSynopsis.bind(null, serialSlug, chapterIdx);
    mySynopsisSuggestion = mySuggestion;
    pendingSynopsisSuggestions = pendingSuggestions;
  }

  const wikiChapters = chapterList.map((c) => ({
    name: c.displayName,
    idx: c.idx,
  }));

  return (
    <main>
      <EditModeAdminSetter isAdmin={isAdmin} />
      <div className="max-w-(--content-width) mx-auto w-full px-4 py-6 flex gap-6">
        {/* Left sidebar - sticky, independent scroll, desktop only */}
        <aside className="hidden md:block w-56 shrink-0">
          <div className="sticky top-6 overflow-y-auto max-h-[calc(var(--scroll-area-h)-1.5rem)] pr-1">
            <SerialTOCSidebar
              serialId={serial.id}
              serialSlug={serialSlug}
              volumes={volumeList}
              chaptersByVolume={chaptersByVolume}
              chapterType={serial.chapterType}
              volumeType={serial.volumeType}
              addChapterAction={addChapterForSerial}
              addVolumeAction={addVolumeForSerial}
              deleteChapterAction={deleteChapterForSerial}
              deleteVolumeAction={deleteVolumeForSerial}
              renameChapterAction={renameChapterForSerial}
              renameVolumeAction={renameVolumeForSerial}
              reorderVolumesAction={reorderVolumesForSerial}
              reorderAllChaptersAction={reorderAllChaptersForSerial}
              updateSerialTypesAction={updateSerialTypesForSerial}
              bulkApplyTocAction={bulkApplyTocForSerial}
              isAdmin={isAdmin}
            />
          </div>
        </aside>

        {/* Main content */}
        <PageContainer className="flex-1 min-w-0 mx-0 px-0 py-0">
          <Box col className="gap-6">
            {/* Breadcrumb */}
            <Text muted className="text-sm">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
            </Text>

            {/* Chapter heading */}
            <Box col className="gap-1">
              {volume && (
                <Text
                  variant="label"
                  muted
                  className="text-xs uppercase tracking-wider"
                >
                  {volume.displayName}
                </Text>
              )}
              <Text variant="h1">{chapter.displayName}</Text>
            </Box>

            {spoilered ? (
              <Box
                col
                className="gap-2 rounded-md border border-dashed border-border px-6 py-8 items-center text-center"
              >
                <Text variant="h3" muted>
                  Spoilers ahead
                </Text>
                <Text muted>
                  You haven&apos;t reached this{" "}
                  {serial.chapterType.toLowerCase()} yet. The synopsis and
                  introduced content will be available once you&apos;ve read it.
                </Text>
              </Box>
            ) : (
              <>
                {/* Synopsis */}
                <Box col className="gap-2">
                  <ChapterSynopsisEditor
                    serialSlug={serialSlug}
                    initialContent={synopsisContent}
                    wikiPages={wikiPages}
                    wikiChapters={wikiChapters}
                    chapterType={serial.chapterType}
                    saveAction={boundSaveAction!}
                  />

                  {/* Admin: pending synopsis suggestions */}
                  {isAdmin && (
                    <SynopsisReviewPanel
                      suggestions={pendingSynopsisSuggestions}
                      currentContent={synopsisContent}
                      serialSlug={serialSlug}
                    />
                  )}

                  {/* Non-admin authenticated users: suggestion form */}
                  {authenticatedUserId && !isAdmin && (
                    <SynopsisSuggestionSection
                      chapterId={chapter.id}
                      currentContent={synopsisContent}
                      mySuggestion={mySynopsisSuggestion}
                      wikiPages={wikiPages}
                      serialSlug={serialSlug}
                      wikiChapters={wikiChapters}
                      chapterType={serial.chapterType}
                    />
                  )}
                </Box>

                {/* Introduced content */}
                <Box col className="gap-4">
                  <div>
                    <Text variant="h2" className="mb-1">
                      Introduced in this {serial.chapterType.toLowerCase()}
                    </Text>
                    <hr className="border-border" />
                  </div>
                  {groupedIntroductions.length > 0 ? (
                    <Box col className="gap-4">
                      {groupedIntroductions.map(
                        ({ categoryName, pages: categoryPages }) => (
                          <Box col key={categoryName} className="gap-1.5">
                            <Text variant="h4">{categoryName}</Text>
                            <ul className="flex flex-col gap-1">
                              {categoryPages.map((page) => (
                                <li key={page.id}>
                                  <Link
                                    href={`/${serialSlug}/${encodeURIComponent(page.slug)}`}
                                    className="text-primary hover:underline"
                                  >
                                    {page.name}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </Box>
                        ),
                      )}
                    </Box>
                  ) : (
                    <Text muted>
                      No pages were introduced in this{" "}
                      {serial.chapterType.toLowerCase()}.
                    </Text>
                  )}
                </Box>
              </>
            )}
          </Box>
        </PageContainer>
      </div>
    </main>
  );
}
