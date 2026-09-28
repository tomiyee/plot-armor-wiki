import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { getSerialBySlug } from "@/data/serials/queries";
import { getChapterCutoff, getSerialVolumesAndChapters, fetchChapterById } from "@/data/chapters/queries";
import {
  fetchPageAtSlug,
  resolvePageTitlesAtIdx,
  fetchActiveParentPagesAtIdx,
  fetchSerialPagesAtIdx,
  fetchPageContentAtIdx,
  fetchPageInfoboxAtIdx,
  fetchPageChildPagesAtIdx,
  fetchPageTitleEntriesAtIdx,
} from "@/data/pages/queries";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { PageContainer } from "@/components/ui/PageContainer";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { PageEditor } from "./PageEditor";
import { EditModeAdminSetter } from "@/contexts/EditModeContext";
import { isSerialAdmin, isAuthenticated } from "@/lib/auth-guard";
import {
  getPendingSuggestionCount,
  getPendingSuggestions,
  getMyPageSuggestions,
} from "./suggestionActions";
import { restorePage } from "./actions";

interface PageViewProps {
  /** Next.js dynamic route params: `serial` slug and `page` slug. */
  params: Promise<{ serial: string; page: string }>;
}

/** Server Component that renders a wiki page at the reader's chapter cutoff. */
export default async function PageView(props: PageViewProps) {
  const { params } = props;
  const { serial: serialSlug, page: pageParam } = await params;

  const decodedPageSlug = decodeURIComponent(pageParam);

  const serial = await getSerialBySlug(serialSlug);

  if (!serial) {
    notFound();
  }

  const [chapterCutoff, { volumeList, chapterList }, adminStatus, authUserId] =
    await Promise.all([
      getChapterCutoff(serial.id),
      getSerialVolumesAndChapters(serial.id),
      isSerialAdmin(serial.id),
      isAuthenticated(),
    ]);
  const isAdmin = adminStatus;
  const isUserAuthenticated = !!authUserId;
  const { cutoffIdx, readingChapterId } = chapterCutoff;

  // Build a structured chapter list for the chapter selector in edit mode.
  const volumeNameById = new Map(volumeList.map((v) => [v.id, v.displayName]));
  const allChapters = chapterList.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    idx: c.idx,
    volumeName: volumeNameById.get(c.volumeId) ?? "",
  }));

  // Head chapter is the one with the highest idx (last in the ordered list).
  const headChapterId = chapterList.at(-1)?.id ?? null;

  // Wiki pages visible at the reader's cutoff (deleted pages excluded) and the
  // target page are fetched in parallel since both are independent of each other.
  const [rawWikiPages, page] = await Promise.all([
    fetchSerialPagesAtIdx(serial.id, cutoffIdx),
    fetchPageAtSlug(serial.id, decodedPageSlug),
  ]);

  if (!page) {
    notFound();
  }

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

  // The home page is canonical at /{serial}; visiting /{serial}/home redirects there.
  if (page.isHomePage) {
    redirect(`/${serialSlug}`);
  }

  // Soft-deleted pages: admins see a restore banner; everyone else gets 404.
  if (page.deletedAt) {
    if (!isAdmin) {
      notFound();
    }
    return (
      <main>
        <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
            </Text>
            <Box col className="gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
              <Text variant="h1" className="text-destructive">
                {page.name}
              </Text>
              <Text variant="body" className="text-destructive/80">
                This page was deleted on{" "}
                {page.deletedAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                . All versioned content is preserved and will be visible once
                the page is restored.
              </Text>
              {page.deletionReason && (
                <div>
                  <Text variant="label" className="mb-1 block text-destructive/70">
                    Reason for deletion
                  </Text>
                  <MarkdownRenderer sm serialSlug={serialSlug} className="text-destructive/70">
                    {page.deletionReason}
                  </MarkdownRenderer>
                </div>
              )}
              <form
                action={async () => {
                  "use server";
                  await restorePage(serialSlug, decodedPageSlug);
                  redirect(`/${serialSlug}/${decodedPageSlug}`);
                }}
              >
                <Button type="submit" variant="outline">
                  Restore page
                </Button>
              </form>
            </Box>
          </Box>
        </PageContainer>
      </main>
    );
  }

  const introChapter = page.introChapterId
    ? await fetchChapterById(page.introChapterId)
    : null;

  if (introChapter && introChapter.idx > cutoffIdx) {
    return (
      <main>
        <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
            </Text>
            <Text variant="body">
              This page is introduced in {serial.chapterType}{" "}
              {introChapter.displayName}. This page is hidden to prevent
              spoilers.
            </Text>
          </Box>
        </PageContainer>
      </main>
    );
  }

  // ── All page data in one parallel batch ───────────────────────────────────
  const [
    pageContent,
    infobox,
    childPages,
    activeParentPagesRaw,
    pageTitlesData,
    pendingSuggestionCount,
    pendingSuggestions,
    myPageSuggestions,
  ] = await Promise.all([
    fetchPageContentAtIdx(page.id, cutoffIdx),
    fetchPageInfoboxAtIdx(page.id, cutoffIdx),
    fetchPageChildPagesAtIdx(page.id, cutoffIdx),
    fetchActiveParentPagesAtIdx(page.id, cutoffIdx),
    fetchPageTitleEntriesAtIdx(page.id, cutoffIdx),
    isAdmin ? getPendingSuggestionCount(page.id) : Promise.resolve(0),
    isAdmin ? getPendingSuggestions(page.id) : Promise.resolve([]),
    !isAdmin && isUserAuthenticated
      ? getMyPageSuggestions(page.id)
      : Promise.resolve([]),
  ]);

  const { entries: pageTitleEntries, resolvedTitle } = pageTitlesData;
  const displayTitle = resolvedTitle ?? page.name;

  // wikiTitleByPageId covers all serial pages, so it also serves as the title
  // map for the "Add parent" dropdown (parents are a subset of visible serial pages).
  const parentPages = activeParentPagesRaw.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    title: wikiTitleByPageId.get(r.id) ?? r.name,
  }));

  // All pages in the serial with chapter-versioned titles for the "Add parent" dropdown.
  const allSerialPages = rawWikiPages.map((r) => ({
    id: r.id,
    title: wikiTitleByPageId.get(r.id) ?? r.name,
  }));

  return (
    <main>
      <EditModeAdminSetter isAdmin={isAdmin} />
      <PageContainer>
          <Box col className="gap-6">
            <Text muted className="text-sm flex items-center gap-1 flex-wrap">
              <Link href={`/${serialSlug}`} className="hover:underline">
                {serial.title}
              </Link>
              {parentPages.length > 0 && (
                <>
                  <span>&gt;</span>
                  {parentPages.map((parent, i) => (
                    <span key={parent.id} className="flex items-center gap-1">
                      {i > 0 && <Text as="span">,</Text>}
                      <Link
                        href={`/${serialSlug}/${parent.slug}`}
                        className="hover:underline"
                      >
                        {parent.title}
                      </Link>
                    </span>
                  ))}
                </>
              )}
            </Text>

            <Box col className="gap-2">
              <Text variant="h1">{displayTitle}</Text>
              {introChapter && (
                <Text muted className="text-sm">
                  Introduced in {serial.chapterType} {introChapter.displayName}
                </Text>
              )}
            </Box>

            <PageEditor
              serialSlug={serialSlug}
              pageSlug={decodedPageSlug}
              pageId={page.id}
              pageTitleEntries={pageTitleEntries}
              content={pageContent.content}
              contentLastUpdatedChapterIdx={pageContent.lastUpdatedChapterIdx}
              infoboxContent={infobox.content}
              infoboxLastUpdatedChapterIdx={infobox.lastUpdatedChapterIdx}
              floaterImageUrl={infobox.imageUrl}
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
              introChapterId={page.introChapterId ?? null}
              introChapterIdx={introChapter?.idx ?? null}
              childPages={childPages}
              parentPages={parentPages}
              allSerialPages={allSerialPages}
              isAdmin={isAdmin}
              isAuthenticated={isUserAuthenticated}
              pendingSuggestionCount={pendingSuggestionCount}
              pendingSuggestions={pendingSuggestions}
              myPageSuggestions={myPageSuggestions}
            />
          </Box>
      </PageContainer>
    </main>
  );
}
