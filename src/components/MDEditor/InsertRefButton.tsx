"use client";

import { useCallback, useContext, useRef } from "react";
import { ButtonWithTooltip } from "@mdxeditor/editor";
import { BookMarked } from "lucide-react";
import { RefContext } from "./RefContext";

/**
 * Toolbar button that opens a ref insert popover.
 *
 * Delegates popover rendering to WikiLinkMDEditor via `openRefInsertMenu` so
 * the popover is mounted outside the MDXEditor toolbar DOM subtree, keeping
 * appearance consistent with the chip-click edit popover.
 *
 * @example
 * toolbarContents: () => (
 *   <DiffSourceToggleWrapper>
 *     <InsertRefButton />
 *   </DiffSourceToggleWrapper>
 * )
 */
export function InsertRefButton() {
  const { openRefInsertMenu } = useContext(RefContext);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleButtonClick = useCallback(() => {
    if (buttonRef.current) openRefInsertMenu(buttonRef.current);
  }, [openRefInsertMenu]);

  return (
    <ButtonWithTooltip
      title="Insert reference"
      ref={buttonRef}
      onClick={handleButtonClick}
      aria-haspopup="dialog"
    >
      <BookMarked className="size-4" />
    </ButtonWithTooltip>
  );
}
