"use client";

import { useCallback, useContext, useRef } from "react";
import { ButtonWithTooltip } from "@mdxeditor/editor";
import { Link2 } from "lucide-react";
import { WikiLinkContext } from "./WikiLinkContext";

/**
 * Toolbar button that opens a wiki-link insert popover.
 * Delegates popover rendering to WikiLinkMDEditor via `openInsertMenu` so the
 * popover is mounted outside the MDXEditor toolbar DOM subtree — keeping its
 * appearance consistent with the chip-click edit popover.
 *
 * @example
 * toolbarContents: () => (
 *   <DiffSourceToggleWrapper>
 *     <InsertWikiLinkButton />
 *   </DiffSourceToggleWrapper>
 * )
 */
export function InsertWikiLinkButton() {
  const { openInsertMenu } = useContext(WikiLinkContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Capture the selection text on mousedown, before the button takes focus and
  // the browser clears the contenteditable's DOM selection.
  const savedAliasRef = useRef("");

  const handleMouseDown = useCallback(() => {
    const sel = window.getSelection();
    savedAliasRef.current =
      sel && !sel.isCollapsed ? sel.toString().trim() : "";
  }, []);

  const handleButtonClick = useCallback(() => {
    if (buttonRef.current) openInsertMenu(buttonRef.current, savedAliasRef.current);
  }, [openInsertMenu]);

  return (
    <ButtonWithTooltip
      title="Insert wiki link"
      ref={buttonRef}
      onMouseDown={handleMouseDown}
      onClick={handleButtonClick}
      aria-haspopup="dialog"
    >
      <Link2 className="size-4" />
    </ButtonWithTooltip>
  );
}
