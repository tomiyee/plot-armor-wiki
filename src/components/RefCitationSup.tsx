"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HoverCard } from "@/components/ui/HoverCard";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { parseWikiLink, isChapterCategory } from "@/lib/wiki-links";
import {
  getWikiLinkPreview,
  getChapterLinkPreview,
} from "@/lib/wiki-link-preview-action";
import type {
  WikiLinkPreviewData,
  ChapterLinkPreviewData,
} from "@/lib/wiki-link-preview-action";

type RefPreviewState =
  | "idle"
  | "loading"
  | { kind: "page"; data: WikiLinkPreviewData | "missing" }
  | { kind: "chapter"; data: ChapterLinkPreviewData | "missing" };

type RefCitationSupProps = {
  /** 1-based ordinal displayed as [n]. */
  n: number;
  /** HTML id for the back-link anchor (e.g. "ref-cite-1"). */
  id: string;
  /** Inner content of the [[…]] wiki link token (e.g. "page:Luffy"). */
  token: string;
  /** Exact quotes attached to this specific citation; shown above the target preview. */
  quotes?: string[];
  /** Serial slug used to scope the preview fetch. */
  serialSlug: string;
  /** slug → title map forwarded to nested MarkdownRenderer instances. */
  pageTitles?: Record<string, string>;
  /** Serial chapter type label (e.g. "Chapter") used to detect chapter tokens. */
  chapterType?: string;
  /** Chapter name → idx map needed to resolve chapter token indices. */
  wikiChapters?: Record<string, number>;
};

/**
 * Inline reference citation rendered as a superscript with a hover preview card.
 * Produced by `remarkRefs` when the page contains `{{ref|token}}` syntax.
 * Hovering shows the referenced page or chapter summary without navigating away.
 *
 * @example
 * <RefCitationSup n={1} id="ref-cite-1" token="page:Luffy" serialSlug="one-piece" />
 */
export function RefCitationSup(props: RefCitationSupProps) {
  const {
    n,
    id,
    token,
    quotes = [],
    serialSlug,
    pageTitles,
    chapterType,
    wikiChapters,
  } = props;
  const [preview, setPreview] = useState<RefPreviewState>("idle");

  const parts = parseWikiLink(token);
  const isChapter =
    !!parts && !!chapterType && isChapterCategory(parts.category, chapterType);

  async function handleMouseEnter() {
    if (preview !== "idle") return;
    setPreview("loading");

    if (!parts) {
      setPreview({ kind: "page", data: "missing" });
      return;
    }

    if (isChapter) {
      const idx = wikiChapters?.[parts.page];
      if (idx == null) {
        setPreview({ kind: "chapter", data: "missing" });
        return;
      }
      const data = await getChapterLinkPreview(serialSlug, idx);
      setPreview({ kind: "chapter", data: data ?? "missing" });
    } else {
      const data = await getWikiLinkPreview(serialSlug, parts.page);
      setPreview({ kind: "page", data: data ?? "missing" });
    }
  }

  const trigger = (
    <sup
      id={id}
      className="cursor-help font-medium text-muted-foreground hover:text-foreground transition-colors"
      onMouseEnter={handleMouseEnter}
    >
      [{n}]
    </sup>
  );

  return (
    <HoverCard trigger={trigger}>
      <RefQuotes quotes={quotes} className="mb-2" />
      <RefPreviewContent
        state={preview}
        pageName={parts?.alias ?? parts?.page ?? token}
        serialSlug={serialSlug}
        pageTitles={pageTitles}
      />
    </HoverCard>
  );
}

type RefQuotesProps = {
  /** Quotes to display, rendered as plain text (never markdown). */
  quotes: string[];
  className?: string;
};

/**
 * Displays citation quotes as plain-text blockquotes. Shared by the hover card
 * and the reference list so quotes look the same everywhere.
 *
 * @example
 * <RefQuotes quotes={["I'm gonna be King of the Pirates!"]} />
 */
export function RefQuotes(props: RefQuotesProps) {
  const { quotes, className } = props;
  if (quotes.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {quotes.map((q, i) => (
        <blockquote
          key={i}
          className="border-l-2 border-border pl-2 text-sm italic text-foreground"
        >
          &ldquo;{q}&rdquo;
        </blockquote>
      ))}
    </div>
  );
}

type RefPreviewContentProps = {
  state: RefPreviewState;
  /** Fallback display name shown while loading or if the target is missing. */
  pageName: string;
  serialSlug: string;
  pageTitles?: Record<string, string>;
};

function RefPreviewContent(props: RefPreviewContentProps) {
  const { state, pageName, serialSlug, pageTitles } = props;

  if (state === "idle" || state === "loading") {
    return (
      <Text muted className="text-sm">
        Loading…
      </Text>
    );
  }

  if (state.kind === "page") {
    return (
      <PagePreview
        data={state.data}
        pageName={pageName}
        serialSlug={serialSlug}
        pageTitles={pageTitles}
      />
    );
  }

  return <ChapterPreview data={state.data} />;
}

const PREVIEW_CHARS = 200;

type PagePreviewProps = {
  data: WikiLinkPreviewData | "missing";
  pageName: string;
  serialSlug: string;
  pageTitles?: Record<string, string>;
};

function PagePreview(props: PagePreviewProps) {
  const { data, pageName, serialSlug, pageTitles } = props;

  if (data === "missing") {
    return (
      <div className="flex flex-col gap-1">
        <Text variant="label" className="font-semibold text-foreground">
          {pageName}
        </Text>
        <Text muted className="text-sm mt-1">
          This page has not been created yet.
        </Text>
      </div>
    );
  }

  if (data.hidden) {
    return (
      <div className="flex flex-col gap-1">
        <Text variant="label" className="font-semibold text-foreground">
          {data.pageName}
        </Text>
        <Text muted className="text-sm mt-1">
          Introduced in {data.introChapterName ?? "a future chapter"}. Hidden
          to prevent spoilers.
        </Text>
      </div>
    );
  }

  const truncated =
    data.bodyContent.length > PREVIEW_CHARS
      ? data.bodyContent.slice(0, PREVIEW_CHARS).trimEnd() + "…"
      : data.bodyContent;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Text variant="label" className="font-semibold text-foreground text-sm">
          {data.pageName}
        </Text>
        {data.introChapterName && (
          <Text muted as="span" className="text-xs block">
            {data.introChapterName}
          </Text>
        )}
      </div>

      {data.infoboxContent && (
        <div className="text-xs border-t border-border pt-2">
          <MarkdownRenderer
            sm
            serialSlug={serialSlug}
            pageTitles={pageTitles ?? data.pageTitles}
          >
            {data.infoboxContent}
          </MarkdownRenderer>
        </div>
      )}

      {truncated && (
        <div className="border-t border-border pt-2">
          <MarkdownRenderer
            sm
            serialSlug={serialSlug}
            pageTitles={pageTitles ?? data.pageTitles}
            className="[&_p]:mb-1 [&_p:last-child]:mb-0"
          >
            {truncated}
          </MarkdownRenderer>
        </div>
      )}

      {!truncated && !data.infoboxContent && (
        <Text muted className="text-xs">
          No content yet.
        </Text>
      )}
    </div>
  );
}

type ChapterPreviewProps = {
  data: ChapterLinkPreviewData | "missing";
};

function ChapterPreview(props: ChapterPreviewProps) {
  const { data } = props;

  if (data === "missing") {
    return (
      <Text muted className="text-sm">
        Chapter not found.
      </Text>
    );
  }

  if (data.hidden) {
    return (
      <div className="flex flex-col gap-1">
        <Text variant="label" className="font-semibold text-foreground">
          {data.chapterType} {data.displayName}
        </Text>
        <Text muted className="text-sm mt-1">
          You haven&apos;t reached this {data.chapterType.toLowerCase()} yet.
          Hidden to prevent spoilers.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Text variant="label" className="font-semibold text-foreground text-sm">
          {data.chapterType} {data.displayName}
        </Text>
        {data.volumeName && (
          <Text muted as="span" className="text-xs block">
            {data.volumeName}
          </Text>
        )}
      </div>

      {data.synopsisSnippet ? (
        <div className="border-t border-border pt-2">
          <MarkdownRenderer
            sm
            className="[&_p]:mb-1 [&_p:last-child]:mb-0"
          >
            {data.synopsisSnippet}
          </MarkdownRenderer>
        </div>
      ) : (
        <Text muted className="text-xs">
          No synopsis yet.
        </Text>
      )}
    </div>
  );
}
