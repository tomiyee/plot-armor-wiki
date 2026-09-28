"use server";

import { getSerialBySlug } from "@/data/serials/queries";
import {
  getChapterBySerialAndIdx,
  getChapterCutoff,
  fetchChapterById,
  fetchChapterSynopsis,
  fetchVolumeById,
} from "@/data/chapters/queries";
import {
  fetchLivePageAtSlug,
  fetchAllSerialPageStubs,
  fetchPageContentAtIdx,
  fetchPageInfoboxAtIdx,
  resolvePageTitlesAtIdx,
} from "@/data/pages/queries";

export interface WikiLinkPreviewData {
  pageName: string;
  introChapterName: string | null;
  /** Whether the page is hidden due to the user's chapter cutoff. */
  hidden: boolean;
  /** Page body content. Empty string if none. */
  bodyContent: string;
  /** Floater image URL, or null. */
  floaterImageUrl: string | null;
  /** Merged infobox content, or empty string when absent. */
  infoboxContent: string;
  /** slug → chapter-versioned title at the user's cutoff, for resolving [[slug]] wiki links. */
  pageTitles: Record<string, string>;
}

/**
 * Fetches a compact preview of a wiki page for use in hover cards.
 * Respects the user's chapter cutoff cookie - hidden pages return `hidden: true`
 * so the UI can display a spoiler-safe placeholder instead.
 *
 * Returns `null` when the serial/page cannot be resolved (e.g. a wiki link
 * that points to a page that doesn't exist yet).
 *
 * @example
 * const preview = await getWikiLinkPreview("one-piece", "luffy");
 * if (preview?.hidden) { ... }
 */
export async function getWikiLinkPreview(
  serialSlug: string,
  pageSlug: string,
): Promise<WikiLinkPreviewData | null> {
  const serial = await getSerialBySlug(serialSlug);
  if (!serial) return null;

  const { cutoffIdx } = await getChapterCutoff(serial.id);

  // Deleted pages return null so wiki links pointing to them render as plain text.
  const page = await fetchLivePageAtSlug(serial.id, pageSlug);
  if (!page) return null;

  // Resolve intro chapter name (introChapterId is null for the home page).
  const introChapterRow = page.introChapterId
    ? await fetchChapterById(page.introChapterId)
    : null;

  const introChapterName = introChapterRow
    ? `${serial.chapterType} ${introChapterRow.displayName}`
    : null;

  // Build slug → title map for all pages (used by MarkdownRenderer to resolve
  // [[slug]] display text inside the preview content and floater rows).
  const allPageStubs = await fetchAllSerialPageStubs(serial.id);
  let resolvedPageTitles: Record<string, string> = {};
  if (allPageStubs.length > 0) {
    const pageIds = allPageStubs.map((p) => p.id);
    const titleByPageId = await resolvePageTitlesAtIdx(pageIds, cutoffIdx);
    resolvedPageTitles = Object.fromEntries(
      allPageStubs.map((p) => [p.slug, titleByPageId.get(p.id) ?? p.name]),
    );
  }

  // Check spoiler visibility.
  if (introChapterRow && introChapterRow.idx > cutoffIdx) {
    return {
      pageName: page.name,
      introChapterName,
      hidden: true,
      bodyContent: "",
      floaterImageUrl: null,
      infoboxContent: "",
      pageTitles: resolvedPageTitles,
    };
  }

  const [pageContent, infobox] = await Promise.all([
    fetchPageContentAtIdx(page.id, cutoffIdx),
    fetchPageInfoboxAtIdx(page.id, cutoffIdx),
  ]);

  return {
    pageName: page.name,
    introChapterName,
    hidden: false,
    bodyContent: pageContent.content,
    floaterImageUrl: infobox.imageUrl,
    infoboxContent: infobox.content,
    pageTitles: resolvedPageTitles,
  };
}

export interface ChapterLinkPreviewData {
  /** Full display name of the chapter (e.g. "Chapter 5"). */
  displayName: string;
  /** Volume this chapter belongs to (e.g. "Volume 1"). */
  volumeName: string;
  /** The chapter type label from the serial (e.g. "Chapter", "Episode"). */
  chapterType: string;
  /** First 200 characters of the chapter synopsis, or empty string. */
  synopsisSnippet: string;
  /** Whether the chapter is beyond the user's reading cutoff. */
  hidden: boolean;
}

/**
 * Fetches a compact preview for a chapter link (`/{serial}/chapter/{idx}`).
 * Respects the user's chapter cutoff - chapters beyond the cutoff return
 * `hidden: true` so the UI can show a spoiler-safe placeholder.
 *
 * Returns `null` when the serial or chapter cannot be resolved.
 *
 * @example
 * const preview = await getChapterLinkPreview("one-piece", 5);
 * if (preview?.hidden) { ... }
 */
export async function getChapterLinkPreview(
  serialSlug: string,
  chapterIdx: number,
): Promise<ChapterLinkPreviewData | null> {
  const serial = await getSerialBySlug(serialSlug);
  if (!serial) return null;

  const { cutoffIdx } = await getChapterCutoff(serial.id);

  const chapter = await getChapterBySerialAndIdx(serial.id, chapterIdx);
  if (!chapter) return null;

  const volume = await fetchVolumeById(chapter.volumeId);
  const hidden = chapter.idx > cutoffIdx;

  if (hidden) {
    return {
      displayName: chapter.displayName,
      volumeName: volume?.displayName ?? "",
      chapterType: serial.chapterType,
      synopsisSnippet: "",
      hidden: true,
    };
  }

  const synopsis = (await fetchChapterSynopsis(chapter.id)) ?? "";
  const synopsisSnippet =
    synopsis.length > 200 ? synopsis.slice(0, 200).trimEnd() + "…" : synopsis;

  return {
    displayName: chapter.displayName,
    volumeName: volume?.displayName ?? "",
    chapterType: serial.chapterType,
    synopsisSnippet,
    hidden: false,
  };
}
