import ReactMarkdown, { Components } from "react-markdown";
import type { PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/Text";
import { remarkWikiLinks } from "@/lib/remark-wiki-links";
import { remarkRefs } from "@/lib/remark-refs";
import { WikiLinkPreview } from "@/components/WikiLinkPreview";
import { ChapterLinkPreview } from "@/components/ChapterLinkPreview";
import { RefCitationSup } from "@/components/RefCitationSup";

type MarkdownRendererProps = {
  /** Raw markdown string to render. */
  children: string;
  /** Extra classes to merge onto the wrapper. */
  className?: string;
  /** Use smaller text sizing (e.g. inside reference panels). Defaults to false. */
  sm?: boolean;
  /**
   * When provided, `[[Category:Page]]` wiki link syntax is converted to
   * clickable links scoped to this serial slug. Omit when rendering content
   * that is not within a serial context (e.g. the home page).
   */
  serialSlug?: string;
  /**
   * Map of page slug → display title at the current chapter cutoff.
   * When a `[[slug]]` link has no explicit `|text` alias, the renderer looks
   * up the slug here to show the chapter-accurate title instead of the raw slug.
   * Only used when `serialSlug` is also provided.
   */
  pageTitles?: Record<string, string>;
  /**
   * The serial's chapter type (e.g. `"Chapter"`, `"Episode"`).
   * Required alongside `wikiChapters` to enable `[[Chapter:Name]]` link routing.
   */
  chapterType?: string;
  /**
   * Map of chapter display name → chapter idx.
   * When provided, `[[Chapter:Name]]` links are resolved to
   * `/{serialSlug}/chapter/{idx}` URLs with hover card previews.
   * Only used when `serialSlug` and `chapterType` are also provided.
   */
  wikiChapters?: Record<string, number>;
  /**
   * When provided, overrides local `{{ref|token}}` ordinal computation with
   * globally consistent ordinals from `WikiPageRefsProvider`. Enables correct
   * cross-section reference numbering on wiki pages.
   * Obtain this from `useWikiPageRefs` in read mode.
   */
  refOrdinalMap?: Map<string, number>;
};

const COMPONENTS: Components = {
  // Headings are intentionally downscaled so all in-content heading levels
  // remain strictly smaller than the `text-xl` section headers rendered by
  // PageReadView, preserving a clear structural hierarchy.
  h1: ({ children }) => (
    <Text variant="h1" className="mt-6 mb-4 text-lg">
      {children}
    </Text>
  ),
  h2: ({ children }) => (
    <Text variant="h2" className="mt-5 mb-3 text-base">
      {children}
    </Text>
  ),
  h3: ({ children }) => (
    <Text variant="h3" className="mt-4 mb-2 text-sm">
      {children}
    </Text>
  ),
  h4: ({ children }) => (
    <Text variant="h4" className="mt-3 mb-2 text-sm font-normal">
      {children}
    </Text>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-semibold mt-3 mb-1 text-foreground">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-semibold mt-2 mb-1 text-foreground">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <Text variant="body" className="mb-4 leading-relaxed">
      {children}
    </Text>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-6 mb-4 space-y-1 text-foreground/80">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-6 mb-4 space-y-1 text-foreground/80">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-border pl-4 italic text-muted-foreground my-4">
      {children}
    </blockquote>
  ),
  // In react-markdown v10, block code is always inside <pre>; bare <code> is inline only.
  code: ({ children }) => (
    <code className="bg-muted text-foreground rounded px-1 py-0.5 text-sm font-mono">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-muted rounded-md p-4 overflow-x-auto mb-4 text-sm font-mono text-foreground [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-border my-6" />,
  a: ({ href, children }) => (
    <a href={href} className="text-wiki-link underline hover:text-wiki-link-hover visited:text-wiki-visited">
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border border-border text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-foreground/80 border-b border-border">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-foreground/80">{children}</td>
  ),
};

const SM_COMPONENTS: Components = {
  ...COMPONENTS,
  // One step down from the already-downscaled COMPONENTS headings so sm mode
  // stays subordinate to any surrounding structural headers.
  h1: ({ children }) => (
    <Text as="h1" variant="h2" className="mt-4 mb-3 text-base">
      {children}
    </Text>
  ),
  h2: ({ children }) => (
    <Text as="h2" variant="h3" className="mt-3 mb-2 text-sm">
      {children}
    </Text>
  ),
  h3: ({ children }) => (
    <Text as="h3" variant="h4" className="mt-3 mb-1 text-sm font-normal">
      {children}
    </Text>
  ),
  h4: ({ children }) => (
    <h4 className="text-xs mt-2 mb-1 text-foreground">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-foreground/80">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-5 mb-3 space-y-0.5 text-sm text-foreground/80">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-5 mb-3 space-y-0.5 text-sm text-foreground/80">
      {children}
    </ol>
  ),
  pre: ({ children }) => (
    <pre className="bg-muted rounded-md p-3 overflow-x-auto mb-3 text-xs font-mono text-foreground [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none">
      {children}
    </pre>
  ),
};

/**
 * Builds an `a` component override for react-markdown that wraps wiki links
 * (those generated by `remarkWikiLinks`) with hover card previews.
 *
 * Two URL shapes are recognised:
 * - `/{serialSlug}/{encodedPage}` (2-level, no further slash) → `WikiLinkPreview`
 * - `/{serialSlug}/chapter/{idx}` (3-level chapter URL) → `ChapterLinkPreview`
 *
 * All other links render as plain anchors.
 */
function makeAnchorComponent(serialSlug: string): Components["a"] {
  const prefix = `/${serialSlug}/`;
  const chapterPrefix = `/${serialSlug}/chapter/`;

  return function WikiAnchor({ href, children }) {
    if (!href?.startsWith(prefix)) {
      return (
        <a href={href} className="text-wiki-link underline hover:text-wiki-link-hover visited:text-wiki-visited">
          {children}
        </a>
      );
    }

    // Chapter link: /{serial}/chapter/{idx}
    if (href.startsWith(chapterPrefix)) {
      const idxRaw = href.slice(chapterPrefix.length);
      const chapterIdx = parseInt(idxRaw, 10);
      if (!isNaN(chapterIdx) && !idxRaw.includes("/")) {
        return (
          <ChapterLinkPreview
            href={href}
            serialSlug={serialSlug}
            chapterIdx={chapterIdx}
          >
            {children}
          </ChapterLinkPreview>
        );
      }
    }

    // Page link: /{serial}/{encodedPage} - no further slash
    const rest = href.slice(prefix.length);
    if (rest && !rest.includes("/")) {
      const pageName = decodeURIComponent(rest);
      return (
        <WikiLinkPreview
          href={href}
          serialSlug={serialSlug}
          pageName={pageName}
        >
          {children}
        </WikiLinkPreview>
      );
    }

    return (
      <a href={href} className="text-wiki-link underline hover:text-wiki-link-hover visited:text-wiki-visited">
        {children}
      </a>
    );
  };
}

/**
 * Returns a `sup` component override that renders ref citation superscripts
 * (those with `data-ref-token` from `remarkRefs`) as hover-card previews.
 * Non-ref `<sup>` elements fall through as plain superscripts.
 */
function makeSupComponent(
  serialSlug: string,
  pageTitles?: Record<string, string>,
  chapterType?: string,
  wikiChapters?: Record<string, number>,
): Components["sup"] {
  return function RefSup(props) {
    const { id, children } = props;
    const rawToken = (props as Record<string, unknown>)["data-ref-token"];
    if (typeof rawToken !== "string" || !id) {
      return <sup id={id}>{children}</sup>;
    }
    const token = decodeURIComponent(rawToken);
    const rawQuotes = (props as Record<string, unknown>)["data-ref-quotes"];
    const quotes: string[] =
      typeof rawQuotes === "string"
        ? JSON.parse(decodeURIComponent(rawQuotes))
        : [];
    const match = /^ref-cite-(\d+)$/.exec(id);
    if (!match) {
      return <sup id={id}>{children}</sup>;
    }
    return (
      <RefCitationSup
        n={parseInt(match[1], 10)}
        id={id}
        token={token}
        quotes={quotes}
        serialSlug={serialSlug}
        pageTitles={pageTitles}
        chapterType={chapterType}
        wikiChapters={wikiChapters}
      />
    );
  };
}

/**
 * Renders a markdown string as styled HTML using explicit Tailwind utility
 * classes on each element - does not depend on @tailwindcss/typography so
 * heading sizes and weights are always correct.
 *
 * When `serialSlug` is provided, wiki link syntax is converted to clickable
 * links with hover card previews:
 * - `[[PageName]]` / `[[page:PageName]]` → page links
 * - `[[Chapter:Name]]` (category matches `chapterType`) → chapter links
 *
 * Links inside backticks are left as-is.
 *
 * @example
 * <MarkdownRenderer>{section.content}</MarkdownRenderer>
 * <MarkdownRenderer sm className="mt-2">{schema.body}</MarkdownRenderer>
 * <MarkdownRenderer serialSlug="one-piece" chapterType="Chapter" wikiChapters={{ "Chapter 5": 5 }}>
 *   {section.content}
 * </MarkdownRenderer>
 */
export function MarkdownRenderer(props: MarkdownRendererProps) {
  const {
    children,
    className,
    sm = false,
    serialSlug,
    pageTitles,
    chapterType,
    wikiChapters,
    refOrdinalMap,
  } = props;

  const remarkPlugins: PluggableList = [remarkGfm];
  if (serialSlug) {
    remarkPlugins.push(
      remarkWikiLinks(serialSlug, pageTitles, {
        chapterType,
        chapters: wikiChapters,
      }),
    );
  }
  remarkPlugins.push(remarkRefs({ externalOrdinalMap: refOrdinalMap }));

  const baseComponents = sm ? SM_COMPONENTS : COMPONENTS;
  const components: Components = serialSlug
    ? {
        ...baseComponents,
        a: makeAnchorComponent(serialSlug),
        sup: makeSupComponent(serialSlug, pageTitles, chapterType, wikiChapters),
      }
    : baseComponents;

  return (
    <div className={cn("max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
