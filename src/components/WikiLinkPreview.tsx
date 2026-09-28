"use client";

import { useState } from "react";
import { HoverCard } from "@/components/ui/HoverCard";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { getWikiLinkPreview } from "@/lib/wiki-link-preview-action";
import type { WikiLinkPreviewData } from "@/lib/wiki-link-preview-action";
import {
  WIKI_LINK_CHIP_BASE,
  WIKI_LINK_CHIP_LINK,
} from "@/components/MDEditor/wikiLinkChipClasses";

interface WikiLinkPreviewProps {
  /** The URL the link points to. */
  href: string;
  /** Link label text. */
  children: React.ReactNode;
  /** Serial slug - used to fetch the preview. */
  serialSlug: string;
  /** Page name (slug) of the linked page. */
  pageName: string;
}

/** Maximum characters of first-section content shown in the preview. */
const PREVIEW_CHARS = 200;

/**
 * Wraps a wiki link anchor with a hover card that lazily fetches and displays
 * a compact page preview. The fetch fires once on first hover and the result
 * is cached in component state for subsequent hovers.
 *
 * Respects the user's chapter cutoff - hidden pages show a spoiler-safe
 * placeholder rather than content. Non-existent pages show a "not yet created"
 * message.
 *
 * @example
 * <WikiLinkPreview
 *   href="/my-serial/luffy"
 *   serialSlug="my-serial"
 *   pageName="Luffy"
 * >
 *   Luffy
 * </WikiLinkPreview>
 */
export function WikiLinkPreview(props: WikiLinkPreviewProps) {
  const { href, children, serialSlug, pageName } = props;
  const [preview, setPreview] = useState<
    WikiLinkPreviewData | "loading" | "missing"
  >("loading");

  async function handleMouseEnter() {
    // Only fetch once
    if (preview !== "loading") return;
    const data = await getWikiLinkPreview(serialSlug, pageName);
    setPreview(data ?? "missing");
  }

  const anchor = (
    <a
      href={href}
      className={`${WIKI_LINK_CHIP_BASE} ${WIKI_LINK_CHIP_LINK}`}
      onMouseEnter={handleMouseEnter}
    >
      {children}
    </a>
  );

  return (
    <HoverCard trigger={anchor}>
      <PreviewContent
        preview={preview}
        pageName={pageName}
        serialSlug={serialSlug}
      />
    </HoverCard>
  );
}

interface PreviewContentProps {
  /** Fetched preview data, or `"loading"` / `"missing"` sentinel values. */
  preview: WikiLinkPreviewData | "loading" | "missing";
  /** Display name of the linked page, shown while loading or when missing. */
  pageName: string;
  /** Serial slug forwarded to `MarkdownRenderer` for nested wiki link resolution. */
  serialSlug: string;
}

function PreviewContent(props: PreviewContentProps) {
  const { preview, pageName, serialSlug } = props;
  if (preview === "loading") {
    return (
      <Text muted className="text-sm">
        Loading…
      </Text>
    );
  }

  if (preview === "missing") {
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

  if (preview.hidden) {
    return (
      <div className="flex flex-col gap-1">
        <Text variant="label" className="font-semibold text-foreground">
          {preview.pageName}
        </Text>
        <Text muted className="text-sm mt-1">
          Introduced in {preview.introChapterName ?? "a future chapter"}. Hidden
          to prevent spoilers.
        </Text>
      </div>
    );
  }

  const truncatedContent =
    preview.bodyContent.length > PREVIEW_CHARS
      ? preview.bodyContent.slice(0, PREVIEW_CHARS).trimEnd() + "…"
      : preview.bodyContent;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div>
        <Text variant="label" className="font-semibold text-foreground text-sm">
          {preview.pageName}
        </Text>
        {preview.introChapterName && (
          <Text muted as="span" className="text-xs block">
            <span className="text-muted-foreground">
              {preview.introChapterName}
            </span>
          </Text>
        )}
      </div>

      {/* Infobox content */}
      {preview.infoboxContent && (
        <div className="text-xs border-t border-border pt-2">
          <MarkdownRenderer sm serialSlug={serialSlug} pageTitles={preview.pageTitles}>
            {preview.infoboxContent}
          </MarkdownRenderer>
        </div>
      )}

      {/* Body excerpt */}
      {truncatedContent && (
        <div className="border-t border-border pt-2">
          <MarkdownRenderer
            sm
            serialSlug={serialSlug}
            pageTitles={preview.pageTitles}
            className="[&_p]:mb-1 [&_p:last-child]:mb-0"
          >
            {truncatedContent}
          </MarkdownRenderer>
        </div>
      )}

      {!truncatedContent && !preview.infoboxContent && (
        <Text muted className="text-xs">
          No content yet.
        </Text>
      )}
    </div>
  );
}
