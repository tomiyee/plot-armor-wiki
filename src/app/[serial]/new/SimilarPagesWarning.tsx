import Link from "next/link";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";

export interface PageOption {
  id: number;
  name: string;
  slug: string;
  introChapterId: number | null;
  /**
   * When present, this page is beyond the reader's cutoff.
   * The name is not displayed; the page is shown as "A page introduced in chapter {introChapterLabel}".
   */
  introChapterLabel?: string;
}

type SimilarPagesWarningProps = {
  /** The page name currently typed by the user. */
  name: string;
  /** URL slug of the serial — used to build links to similar pages. */
  serialSlug: string;
  /**
   * All non-deleted pages for the serial. Visible pages are matched by name;
   * future pages (those with `introChapterLabel` set) are shown without revealing their name.
   */
  existingPages: PageOption[];
};

const SIMILARITY_MIN_CHARS = 4;

/**
 * Warns against creating a duplicate page by listing existing visible pages whose names
 * overlap with what the user is typing.
 *
 * Returns null when there are no similar pages, so callers need no visibility guard.
 */
export function SimilarPagesWarning(props: SimilarPagesWarningProps) {
  const { name, serialSlug, existingPages } = props;

  const trimmedName = name.trim();
  const similarPages =
    trimmedName.length >= SIMILARITY_MIN_CHARS
      ? existingPages.filter((p) => {
          const lower = p.name.toLowerCase();
          const query = trimmedName.toLowerCase();
          if (lower.length < SIMILARITY_MIN_CHARS) return false;
          return lower.includes(query) || query.includes(lower);
        })
      : [];

  if (similarPages.length === 0) return null;

  return (
    <div className="mt-1 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 p-3">
      <Text
        variant="label"
        className="text-yellow-800 dark:text-yellow-300 text-xs mb-1"
      >
        Similar pages:
      </Text>
      <Box col className="gap-0.5">
        {similarPages.map((p) => (
          <Link
            key={p.id}
            href={`/${serialSlug}/${p.slug}`}
            className="text-sm text-yellow-700 dark:text-yellow-400 hover:underline"
          >
            {p.introChapterLabel
              ? `A page introduced in ${p.introChapterLabel}`
              : p.name}
          </Link>
        ))}
      </Box>
    </div>
  );
}
