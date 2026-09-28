import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { RefQuotes } from "@/components/RefCitationSup";

type RefListProps = {
  /** Token → ordinal, in display order. */
  ordinalMap: Map<string, number>;
  /** Token → distinct quotes cited for that token. */
  quotesMap: Map<string, string[]>;
  /** Serial slug; when set, each target renders as a hover-card wiki link. */
  serialSlug?: string;
  /** Slug → title map for page link display text. */
  pageTitles?: Record<string, string>;
  /** Serial's chapter type label, for chapter link routing. */
  chapterType?: string;
  /** Chapter name → idx map for chapter link routing. */
  wikiChapters?: Record<string, number>;
};

/**
 * The expanded `{{refbox}}`: one entry per cited target with a back-link to its
 * first citation, the target as a wiki link, and every quote cited for it.
 * Rendered by `MarkdownRenderer` in place of each `{{refbox}}` line.
 *
 * @example
 * <RefList ordinalMap={ordinalMap} quotesMap={quotesMap} serialSlug="one-piece" />
 */
export function RefList(props: RefListProps) {
  const { ordinalMap, quotesMap, ...markdownProps } = props;
  if (ordinalMap.size === 0) return null;
  return (
    <ol className="mb-4 flex flex-col gap-2 text-sm">
      {[...ordinalMap.entries()].map(([token, n]) => (
        <li key={token} id={`ref-${n}`} className="flex gap-2">
          <a
            href={`#ref-cite-${n}`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            [{n}]
          </a>
          <div className="flex min-w-0 flex-col gap-1">
            <MarkdownRenderer sm {...markdownProps} className="[&_p]:mb-0">
              {`[[${token}]]`}
            </MarkdownRenderer>
            <RefQuotes quotes={quotesMap.get(token) ?? []} />
          </div>
        </li>
      ))}
    </ol>
  );
}
