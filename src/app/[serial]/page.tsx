import { notFound } from "next/navigation";
import { getSerialBySlug, fetchSerialAuthors, fetchSerialAdmins } from "@/data/serials/queries";
import { getChapterCutoff, getSerialVolumesAndChapters } from "@/data/chapters/queries";
import {
  resolvePageTitlesAtIdx,
  fetchSerialPagesAtIdx,
  fetchSerialHomePage,
  fetchDeletedPages,
  fetchPageContentAtIdx,
  fetchPageInfoboxAtIdx,
  fetchPageChildPagesAtIdx,
  fetchPageTitleEntries,
} from "@/data/pages/queries";
import type { ChapterRow, ChildPageStub, PageTitleEntry } from "@/types";
import {
  addChapter,
  addVolume,
  deleteChapter,
  deleteVolume,
  renameChapter,
  renameVolume,
  updateSerialTypes,
  reorderVolumes,
  reorderAllChapters,
  updateSerialMetadata,
  bulkApplyToc,
  addSerialAdmin,
  removeSerialAdmin,
  searchUsersForSerial,
} from "./actions";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { SerialMetadataEditor } from "@/components/SerialMetadataEditor";
import { SerialTOCSidebar } from "@/components/SerialTOCSidebar";
import { PageEditor } from "./[page]/PageEditor";
import { AdminManager } from "@/components/AdminManager";
import { EditModeAdminSetter } from "@/contexts/EditModeContext";
import { isSerialAdmin } from "@/lib/auth-guard";
import { auth } from "@/auth";
import { getPendingSuggestionsByPage } from "./[page]/suggestionActions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { DeletedPagesButton } from "@/components/DeletedPagesButton";

interface SerialPageProps {
  /** Next.js dynamic route params containing the `serial` slug. */
  params: Promise<{ serial: string }>;
}

/** Serial home page: metadata editor, home wiki page content, and admin controls. */
export default async function SerialPage(props: SerialPageProps) {
  const { params } = props;
  const { serial: serialSlug } = await params;

  const serial = await getSerialBySlug(serialSlug);
  if (!serial) {
    notFound();
  }

  const [
    chapterCutoff,
    authors,
    { volumeList, chapterList },
    homePage,
    isAdmin,
    serialAdminList,
    session,
    pendingSuggestionsByPage,
  ] = await Promise.all([
    getChapterCutoff(serial.id),
    fetchSerialAuthors(serial.id),
    getSerialVolumesAndChapters(serial.id),
    fetchSerialHomePage(serial.id),
    isSerialAdmin(serial.id),
    fetchSerialAdmins(serial.id),
    auth(),
    getPendingSuggestionsByPage(serial.id),
  ]);

  const { cutoffIdx, readingChapterId } = chapterCutoff;
  const isUserAuthenticated = !!session?.user?.id;

  const deletedPages = isAdmin ? await fetchDeletedPages(serial.id) : [];

  const chaptersByVolume: Record<number, ChapterRow[]> = {};
  volumeList.forEach((v) => {
    chaptersByVolume[v.id] = [];
  });
  chapterList.forEach((c) => {
    chaptersByVolume[c.volumeId]?.push(c);
  });

  const updateMetadataForSerial = updateSerialMetadata.bind(null, serial.id);
  const addVolumeForSerial = addVolume.bind(null, serial.id);
  const addChapterForSerial = addChapter.bind(null, serial.id);
  const deleteChapterForSerial = deleteChapter.bind(null, serial.id);
  const deleteVolumeForSerial = deleteVolume.bind(null, serial.id);
  const renameChapterForSerial = renameChapter.bind(null, serial.id);
  const renameVolumeForSerial = renameVolume.bind(null, serial.id);
  const reorderVolumesForSerial = reorderVolumes.bind(null, serial.id);
  const reorderAllChaptersForSerial = reorderAllChapters.bind(null, serial.id);
  const updateSerialTypesForSerial = updateSerialTypes.bind(null, serial.id);
  const bulkApplyTocForSerial = bulkApplyToc.bind(null, serial.id);

  // Admin actions bound to this serial.
  const addAdminForSerial = addSerialAdmin.bind(null, serial.id);
  const removeAdminForSerial = removeSerialAdmin.bind(null, serial.id);
  const searchUsersForThisSerial = searchUsersForSerial.bind(null, serial.id);

  const headChapterId = chapterList.at(-1)?.id ?? null;
  const volumeNameById = new Map(volumeList.map((v) => [v.id, v.displayName]));
  const allChapters = chapterList.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    idx: c.idx,
    volumeName: volumeNameById.get(c.volumeId) ?? "",
  }));

  // Wiki pages visible at the reader's cutoff. Pages with null introChapterId
  // (the home page) are always included since they predate any chapters.
  const rawWikiPages = await fetchSerialPagesAtIdx(serial.id, cutoffIdx);

  // Resolve chapter-versioned titles for all wiki pages at the reader's cutoff.
  const wikiTitleByPageId = await resolvePageTitlesAtIdx(
    rawWikiPages.map((p) => p.id),
    cutoffIdx,
  );

  // slug → chapter-versioned title (falls back to pages.name for pages without title entries).
  const wikiPageTitles: Record<string, string> = Object.fromEntries(
    rawWikiPages.map((p) => [p.slug, wikiTitleByPageId.get(p.id) ?? p.name]),
  );
  const wikiPages = rawWikiPages.map((p) => ({
    name: wikiTitleByPageId.get(p.id) ?? p.name,
    slug: p.slug,
  }));

  // ── Home page content ─────────────────────────────────────────────────────
  let content = "";
  let contentLastUpdatedChapterIdx: number | null = null;
  let infoboxContent = "";
  let infoboxLastUpdatedChapterIdx: number | null = null;
  let floaterImageUrl: string | null = null;
  let childPages: ChildPageStub[] = [];
  let homePageTitleEntries: PageTitleEntry[] = [];

  if (homePage) {
    const [pageContent, infobox, fetchedChildPages, titleEntries] = await Promise.all([
      fetchPageContentAtIdx(homePage.id, cutoffIdx),
      fetchPageInfoboxAtIdx(homePage.id, cutoffIdx),
      fetchPageChildPagesAtIdx(homePage.id, cutoffIdx),
      fetchPageTitleEntries(homePage.id),
    ]);

    content = pageContent.content;
    contentLastUpdatedChapterIdx = pageContent.lastUpdatedChapterIdx;
    infoboxContent = infobox.content;
    infoboxLastUpdatedChapterIdx = infobox.lastUpdatedChapterIdx;
    floaterImageUrl = infobox.imageUrl;
    childPages = fetchedChildPages;
    homePageTitleEntries = titleEntries;
  }

  return (
    <main className="size-full">
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
              readingChapterId={readingChapterId}
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
            <SerialMetadataEditor
              title={serial.title}
              splashArtUrl={serial.splashArtUrl}
              authors={authors}
              updateMetadataAction={updateMetadataForSerial}
              isAdmin={isAdmin}
            />

            {isAdmin &&
              pendingSuggestionsByPage.length > 0 &&
              (() => {
                const total = pendingSuggestionsByPage.reduce(
                  (s, p) => s + p.count,
                  0,
                );
                return (
                  <Accordion className="rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-3 text-amber-700 dark:text-amber-400">
                    <AccordionItem
                      value="pending-suggestions"
                      className="border-none"
                    >
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">
                        <span>
                          <span className="font-semibold">{total}</span> pending{" "}
                          {total === 1 ? "suggestion" : "suggestions"} across{" "}
                          <span className="font-semibold">
                            {pendingSuggestionsByPage.length}
                          </span>{" "}
                          {pendingSuggestionsByPage.length === 1
                            ? "page"
                            : "pages"}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="flex flex-col gap-1 pt-1">
                          {pendingSuggestionsByPage.map((p) => (
                            <li
                              key={p.pageId}
                              className="flex items-center justify-between text-sm"
                            >
                              <a
                                href={`/${serialSlug}/${p.pageSlug}`}
                                className="hover:underline font-medium"
                              >
                                {p.pageName}
                              </a>
                              <span className="text-xs text-amber-600 dark:text-amber-500">
                                {p.count}{" "}
                                {p.count === 1 ? "suggestion" : "suggestions"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                );
              })()}

            {homePage ? (
              <PageEditor
                serialSlug={serialSlug}
                pageSlug={homePage.slug}
                pageId={homePage.id}
                pageTitleEntries={homePageTitleEntries}
                content={content}
                contentLastUpdatedChapterIdx={contentLastUpdatedChapterIdx}
                infoboxContent={infoboxContent}
                infoboxLastUpdatedChapterIdx={infoboxLastUpdatedChapterIdx}
                floaterImageUrl={floaterImageUrl}
                allChapters={allChapters}
                headChapterId={headChapterId}
                readingChapterId={readingChapterId}
                wikiPages={wikiPages}
                pageTitles={wikiPageTitles}
                wikiChapters={allChapters.map((c) => ({
                  name: c.displayName,
                  idx: c.idx,
                }))}
                chapterType={serial.chapterType}
                introChapterId={null}
                introChapterIdx={null}
                childPages={childPages}
                parentPages={[]}
                allSerialPages={[]}
                isHomePage
                isAdmin={isAdmin}
                isAuthenticated={isUserAuthenticated}
                subPagesAdornment={
                  isAdmin && deletedPages.length > 0 ? (
                    <DeletedPagesButton
                      serialSlug={serialSlug}
                      deletedPages={deletedPages.map((p) => ({
                        id: p.id,
                        name: p.name,
                        slug: p.slug,
                        deletedAt: p.deletedAt,
                        deletionReason: p.deletionReason,
                      }))}
                    />
                  ) : undefined
                }
                editModeHeader={
                  <AdminManager
                    serialId={serial.id}
                    currentUserId={session?.user?.id ?? ""}
                    admins={serialAdminList}
                    addAdminAction={addAdminForSerial}
                    removeAdminAction={removeAdminForSerial}
                    searchUsersAction={searchUsersForThisSerial}
                  />
                }
              />
            ) : (
              <Text muted>Home page not found.</Text>
            )}
          </Box>
        </PageContainer>
      </div>
    </main>
  );
}
