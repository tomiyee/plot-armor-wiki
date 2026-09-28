"use client";

import { useCallback, useContext, useRef } from "react";
import { Quote } from "lucide-react";
import { RefContext } from "./RefContext";
import {
  WIKI_LINK_CHIP_BASE,
  WIKI_LINK_CHIP_INTERACTIVE,
} from "./wikiLinkChipClasses";

type RefChipProps = {
  /** Ref token in `category:value` format, e.g. `page:luffy`. */
  token: string;
  /** Number of quotes attached; shows a quote badge when > 0. */
  quoteCount?: number;
  /**
   * Lexical node key for this chip. When provided, clicking the chip opens
   * the edit popover via `RefContext.openRefEditMenu`.
   */
  nodeKey?: string;
};

/**
 * Inline chip rendered inside the WYSIWYG editor for a `{{ref|token}}` node.
 *
 * Displays a "ref" badge and the target name so authors can see at a glance
 * which page or chapter is being cited. Clicking opens an edit popover.
 *
 * @example
 * <RefChip token="page:luffy" nodeKey={node.__key} />
 * <RefChip token="Chapter:Chapter 5" nodeKey={node.__key} />
 */
export function RefChip(props: RefChipProps) {
  const { token, quoteCount = 0, nodeKey } = props;
  const { openRefEditMenu } = useContext(RefContext);
  const spanRef = useRef<HTMLSpanElement>(null);

  const colonIdx = token.indexOf(":");
  const displayValue = colonIdx !== -1 ? token.slice(colonIdx + 1) : token;

  const handleClick = useCallback(() => {
    if (!nodeKey || !spanRef.current) return;
    openRefEditMenu(nodeKey, spanRef.current);
  }, [nodeKey, openRefEditMenu]);

  return (
    <span
      ref={spanRef}
      contentEditable={false}
      data-ref-key={nodeKey}
      onClick={nodeKey ? handleClick : undefined}
      className={`${WIKI_LINK_CHIP_BASE}${nodeKey ? ` ${WIKI_LINK_CHIP_INTERACTIVE}` : ""}`}
    >
      <span className="text-xs text-muted-foreground mr-0.5">ref</span>
      {displayValue}
      {quoteCount > 0 && (
        <span
          className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground"
          title={`${quoteCount} quote${quoteCount === 1 ? "" : "s"}`}
        >
          <Quote className="size-3" />
          {quoteCount > 1 && quoteCount}
        </span>
      )}
    </span>
  );
}
