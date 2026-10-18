import { notFound } from "next/navigation";
import {
  getSerialBySlug,
  fetchSerialAuthors,
  fetchSerialAdmins,
} from "@/data/serials/queries";
import {
  getChapterCutoff,
  getSerialVolumesAndChapters,
} from "@/data/chapters/queries";
import {
  resolvePageTitlesAtIdx,
  fetchSerialPagesAtIdx,
  fetchSerialHomePage,
  fetchDeletedPages,
  fetchPageSectionsAtIdx,
  fetchPageInfoboxAtIdx,
  fetchPageChildPagesAtIdx,
  fetchPageTitleEntries,
} from "@/data/pages/queries";
import { fetchSerialTemplates } from "@/data/templates/queries";
import type {
  ChapterRow,
  PageSectionAtIdx,
  InfoboxSectionStructure,
  InfoboxRowAtIdx,
  ChildPageStub,
  PageTitleEntry,
} from "@/types";
import {
  updateSerialMetadata,
  createTemplate,
  deleteTemplate,
  renameTemplate,
  toggleTemplateInfobox,
  addTemplateSection,
  deleteTemplateSection,
  reorderTemplateSections,
  addTemplateInfoboxSection,
  deleteTemplateInfoboxSection,
  reorderTemplateInfoboxSections,
  addSerialAdmin,
  removeSerialAdmin,
  searchUsersForSerial,
} from "./actions";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { SerialMetadataEditor } from "@/components/SerialMetadataEditor";
import { PageEditor } from "./[page]/PageEditor";
import { TemplateManager } from "@/components/TemplateManager";
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

/** Serial home page: metadata editor, home wiki page content, template manager, and admin controls. */
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
    serialTemplates,
    isAdmin,
    serialAdminList,
    session,
    pendingSuggestionsByPage,
  ] = await Promise.all([
    getChapterCutoff(serial.id),
    fetchSerialAuthors(serial.id),
    getSerialVolumesAndChapters(serial.id),
    fetchSerialHomePage(serial.id),
    fetchSerialTemplates(serial.id),
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

  // Admin actions bound to this serial.
  const addAdminForSerial = addSerialAdmin.bind(null, serial.id);
  const removeAdminForSerial = removeSerialAdmin.bind(null, serial.id);
  const searchUsersForThisSerial = searchUsersForSerial.bind(null, serial.id);

  // Template actions bound to this serial.
  const createTemplateForSerial = createTemplate.bind(null, serial.id);
  const deleteTemplateForSerial = deleteTemplate.bind(null, serial.id);
  const renameTemplateForSerial = renameTemplate.bind(null, serial.id);
  const toggleTemplateInfoboxForSerial = toggleTemplateInfobox.bind(
    null,
    serial.id,
  );
  const addTemplateSectionForSerial = addTemplateSection.bind(null, serial.id);
  const deleteTemplateSectionForSerial = deleteTemplateSection.bind(
    null,
    serial.id,
  );
  const reorderTemplateSectionsForSerial = reorderTemplateSections.bind(
    null,
    serial.id,
  );
  const addTemplateInfoboxSectionForSerial = addTemplateInfoboxSection.bind(
    null,
    serial.id,
  );
  const deleteTemplateInfoboxSectionForSerial =
    deleteTemplateInfoboxSection.bind(null, serial.id);
  const reorderTemplateInfoboxSectionsForSerial =
    reorderTemplateInfoboxSections.bind(null, serial.id);

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
  let pageSectionStructure: PageSectionAtIdx[] = [];
  let sections: PageSectionAtIdx[] = [];
  let infoboxSectionStructure: InfoboxSectionStructure[] = [];
  let floaterImageUrl: string | null | undefined = undefined;
  let floaterRows: InfoboxRowAtIdx[] = [];
  let childPages: ChildPageStub[] = [];
  let homePageTitleEntries: PageTitleEntry[] = [];

  if (homePage) {
    const [rawSections, infobox, fetchedChildPages, titleEntries] =
      await Promise.all([
        fetchPageSectionsAtIdx(homePage.id, cutoffIdx),
        fetchPageInfoboxAtIdx(homePage.id, cutoffIdx),
        fetchPageChildPagesAtIdx(homePage.id, cutoffIdx),
        fetchPageTitleEntries(homePage.id),
      ]);

    pageSectionStructure = rawSections;
    sections = rawSections;
    infoboxSectionStructure = infobox.structure;
    floaterImageUrl = infobox.floaterImageUrl;
    floaterRows = infobox.rows;
    childPages = fetchedChildPages;
    homePageTitleEntries = titleEntries;
  }

  return (
    <main className="size-full relative max-w-(--content-width)">
      <EditModeAdminSetter isAdmin={isAdmin} />
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
              pageSectionStructure={pageSectionStructure}
              sections={sections}
              infoboxSectionStructure={infoboxSectionStructure}
              floaterImageUrl={floaterImageUrl}
              floaterRows={floaterRows}
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
                <>
                  <AdminManager
                    serialId={serial.id}
                    currentUserId={session?.user?.id ?? ""}
                    admins={serialAdminList}
                    addAdminAction={addAdminForSerial}
                    removeAdminAction={removeAdminForSerial}
                    searchUsersAction={searchUsersForThisSerial}
                  />
                  <TemplateManager
                    templates={serialTemplates}
                    createTemplateAction={createTemplateForSerial}
                    deleteTemplateAction={deleteTemplateForSerial}
                    renameTemplateAction={renameTemplateForSerial}
                    toggleTemplateInfoboxAction={toggleTemplateInfoboxForSerial}
                    addTemplateSectionAction={addTemplateSectionForSerial}
                    deleteTemplateSectionAction={deleteTemplateSectionForSerial}
                    reorderTemplateSectionAction={
                      reorderTemplateSectionsForSerial
                    }
                    addTemplateInfoboxSectionAction={
                      addTemplateInfoboxSectionForSerial
                    }
                    deleteTemplateInfoboxSectionAction={
                      deleteTemplateInfoboxSectionForSerial
                    }
                    reorderTemplateInfoboxSectionAction={
                      reorderTemplateInfoboxSectionsForSerial
                    }
                  />
                </>
              }
            />
          ) : (
            <Text muted>Home page not found.</Text>
          )}
        </Box>
      </PageContainer>
    </main>
  );
}
