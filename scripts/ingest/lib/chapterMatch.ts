/**
 * Chapter detection for captured chapter pages. Pure functions, no DB.
 *
 * Multi-part chapters are separate chapters: the part suffix ("Pt. 2") is kept
 * in the normalized key, so "Pt. 2" never matches "Pt. 1".
 */

type ChapterLike = { id: number; displayName: string; idx: number };

/**
 * Normalizes a chapter title to a comparison key: lowercase, dashes unified,
 * punctuation dropped, "Chapter" prefix removed, "Part"/"Pt" unified.
 *
 * @example
 * normalizeChapterTitle("Chapter 9.12 E")      // → "9 12 e"
 * normalizeChapterTitle("Interlude – Pt. 2")   // → "interlude pt 2"
 */
export function normalizeChapterTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bpart\b/g, "pt")
    .replace(/^\s*chapter\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts the last non-empty path segment of a URL (e.g. `/2024/05/12/9-12-e/` → `9-12-e`). */
export function urlSlug(url: string): string | null {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    return seg ? decodeURIComponent(seg) : null;
  } catch {
    return null;
  }
}

/** Filesystem-safe directory name for `.ingest/<chapter>/`. */
export function chapterDirName(displayName: string): string {
  return displayName.replace(/[^\p{L}\p{N}.]+/gu, "-").replace(/-?\.-?/g, ".").replace(/^-+|-+$/g, "") || "chapter";
}

function tokenScore(a: string, b: string) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

/**
 * Ranks chapters against a capture: exact normalized title match first, then
 * exact URL-slug match, then token-overlap similarity (for the "closest
 * matches" prompt).
 */
export function rankChapters<C extends ChapterLike>(
  chapters: C[],
  capture: { title?: string; url?: string },
): { chapter: C; exact: boolean; score: number }[] {
  const titleKey = capture.title ? normalizeChapterTitle(capture.title) : "";
  const slug = capture.url ? urlSlug(capture.url) : null;
  const slugKey = slug ? normalizeChapterTitle(slug) : "";

  const byTitle = chapters.filter((c) => titleKey && normalizeChapterTitle(c.displayName) === titleKey);
  const exactSet = new Set(
    (byTitle.length ? byTitle : chapters.filter((c) => slugKey && normalizeChapterTitle(c.displayName) === slugKey)).map(
      (c) => c.id,
    ),
  );

  return chapters
    .map((c) => {
      const key = normalizeChapterTitle(c.displayName);
      const score = Math.max(tokenScore(key, titleKey), tokenScore(key, slugKey));
      return { chapter: c, exact: exactSet.has(c.id), score: exactSet.has(c.id) ? 2 : score };
    })
    .sort((a, b) => b.score - a.score || a.chapter.idx - b.chapter.idx);
}
