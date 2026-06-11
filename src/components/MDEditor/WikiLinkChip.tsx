"use client";

import { useCallback, useContext, useRef } from "react";
import { WikiLinkContext } from "./WikiLinkContext";
import {
  WIKI_LINK_CHIP_BASE,
  WIKI_LINK_CHIP_DEAD,
  WIKI_LINK_CHIP_INTERACTIVE,
} from "./wikiLinkChipClasses";

type WikiLinkChipProps = {
  /** Wiki link token in `category:value` format, resolved to a display name via WikiLinkContext. */
  token: string;
  /** When provided, shown instead of the resolved page or chapter name. */
  alias?: string;
  /**
   * Lexical node key for this chip. When provided, clicking the chip opens the
   * edit popover via `WikiLinkContext.openEditMenu` so the token and alias can
   * be changed without deleting and re-inserting the chip.
   */
  nodeKey?: string;
};

/**
 * Inline chip rendered inside the WYSIWYG editor for a resolved wiki link.
 * Reads page names from WikiLinkContext so slugs show as human-readable titles.
 * When an explicit alias is provided it is displayed directly, bypassing the lookup.
 * Clicking the chip opens an edit popover (when `nodeKey` is supplied).
 *
 * @example
 * <WikiLinkChip token="page:luffy" nodeKey={node.__key} />
 * <WikiLinkChip token="Chapter:Chapter 5" alias="Ch. 5" nodeKey={node.__key} />
 */
export function WikiLinkChip(props: WikiLinkChipProps) {
  const { token, alias, nodeKey } = props;
  const { wikiPages, wikiChapters, chapterType, openEditMenu } =
    useContext(WikiLinkContext);
  const spanRef = useRef<HTMLSpanElement>(null);

  const colonIdx = token.indexOf(":");
  const category = colonIdx !== -1 ? token.slice(0, colonIdx) : "page";
  const value = colonIdx !== -1 ? token.slice(colonIdx + 1) : token;

  let actualName: string;
  let isDead = false;
  if (category === "page") {
    const page = wikiPages.find((p) => p.slug === value);
    if (page) {
      actualName = page.name;
    } else {
      isDead = true;
      actualName = value
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  } else {
    // Chapter links are identified by name (case-insensitive).
    const chapter = wikiChapters.find(
      (c) => c.name.toLowerCase() === value.toLowerCase(),
    );
    isDead = !chapter;
    actualName = value;
  }

  const label = alias ?? actualName;
  const showActualName = alias && alias !== actualName;
  const isChapter = !alias && chapterType && category === chapterType;

  const handleClick = useCallback(() => {
    if (!nodeKey || !spanRef.current) return;
    openEditMenu(nodeKey, spanRef.current);
  }, [nodeKey, openEditMenu]);

  const deadLabel =
    category === "page" ? "Page not found" : "Chapter not found";

  return (
    <span
      ref={spanRef}
      contentEditable={false}
      data-wiki-key={nodeKey}
      onClick={nodeKey ? handleClick : undefined}
      title={isDead ? deadLabel : undefined}
      className={`${WIKI_LINK_CHIP_BASE}${nodeKey ? ` ${WIKI_LINK_CHIP_INTERACTIVE}` : ""}${isDead ? ` ${WIKI_LINK_CHIP_DEAD}` : ""}`}
    >
      {label}
      {showActualName && (
        <span className="text-xs font-normal opacity-70">({actualName})</span>
      )}
      {isChapter && (
        <span className="ml-0.5 shrink-0 text-xs text-muted-foreground">
          {chapterType}
        </span>
      )}
    </span>
  );
}
