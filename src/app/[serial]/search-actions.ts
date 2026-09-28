"use server";

import { getSerialBySlug } from "@/data/serials/queries";
import { getChapterCutoff } from "@/data/chapters/queries";
import { searchPagesByNameAtIdx, resolvePageTitlesAtIdx } from "@/data/pages/queries";

export interface PageSearchResult {
  /** DB primary key. */
  id: number;
  /** Display name used as the search label. */
  name: string;
  /** URL slug for navigation to /{serial}/{slug}. */
  slug: string;
}

/**
 * Returns up to 20 wiki pages in the given serial whose canonical name matches
 * `query` (case-insensitive substring) at the user's current chapter cutoff.
 *
 * Returns an empty array when `query` is blank so the caller can skip the
 * round-trip entirely on an empty search box.
 *
 * Pages whose intro chapter is beyond the cutoff are excluded — same spoiler
 * rule used by page rendering.
 *
 * @example
 * const results = await searchPages("my-serial", "luf");
 */
export async function searchPages(
  serialSlug: string,
  query: string,
): Promise<PageSearchResult[]> {
  if (!query.trim()) return [];

  const serial = await getSerialBySlug(serialSlug);
  if (!serial) return [];

  const { cutoffIdx } = await getChapterCutoff(serial.id);

  const rawPages = await searchPagesByNameAtIdx(serial.id, cutoffIdx, query);
  if (rawPages.length === 0) return [];

  const pageIds = rawPages.map((p) => p.id);
  const titleByPageId = await resolvePageTitlesAtIdx(pageIds, cutoffIdx);

  return rawPages.map((p) => ({
    id: p.id,
    // Fall back to pages.name for pages without any pageTitles entry yet.
    name: titleByPageId.get(p.id) ?? p.name,
    slug: p.slug,
  }));
}
