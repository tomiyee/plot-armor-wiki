"use client";

import { useContext, useMemo, useRef, useEffect, useState, useCallback } from "react";
import { XIcon } from "lucide-react";
import { WikiLinkContext } from "./WikiLinkContext";
import { Select, type Option } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";

type WikiLinkEditPopoverProps = {
  /** Anchor element (button or chip) used to position the fixed popover. Re-queried on scroll/resize so the popover tracks the element on iOS when the virtual keyboard opens. */
  anchorEl: HTMLElement;
  /** Pre-fills the page/chapter selector, e.g. `"page:luffy"`. */
  initialToken?: string;
  /** Pre-fills the alias input. */
  initialAlias?: string;
  /**
   * When true, the alias input receives focus on mount and its text is fully selected.
   * Used in the post-autocomplete alias step.
   */
  autoFocusAlias?: boolean;
  /** Called when the user confirms the link selection. */
  onConfirm: (token: string, alias: string | undefined) => void;
  /** Called when the user dismisses the popover (Escape, backdrop click, or × button). */
  onClose: () => void;
};

/**
 * Shared popover for inserting or editing a wiki link.
 * Rendered at a fixed position derived from `anchorEl.getBoundingClientRect()` and
 * re-anchors on scroll, resize, and visualViewport changes (iOS keyboard open/close).
 *
 * Extracted from `InsertWikiLinkButton` so the same form is reused for:
 * - toolbar "Insert wiki link" button
 * - clicking an existing chip to edit it
 * - the alias input step that fires after autocomplete selection
 *
 * @example
 * <WikiLinkEditPopover
 *   anchorEl={chipEl}
 *   initialToken="page:luffy"
 *   initialAlias="Luffy"
 *   onConfirm={(token, alias) => updateNode(token, alias)}
 *   onClose={() => setEditing(false)}
 * />
 */
export function WikiLinkEditPopover(props: WikiLinkEditPopoverProps) {
  const {
    anchorEl,
    initialToken,
    initialAlias = "",
    autoFocusAlias = false,
    onConfirm,
    onClose,
  } = props;
  const { wikiPages, wikiChapters, chapterType } = useContext(WikiLinkContext);

  const [selectedToken, setSelectedToken] = useState<string | undefined>(initialToken);
  const [alias, setAlias] = useState(initialAlias);
  // Derived from selectedToken — shows the current page/chapter name as a hint.
  // We intentionally do NOT set `alias` on selection — an empty alias produces a live
  // link `[[page:slug]]` that follows page renames, while a non-empty alias freezes the
  // display text to whatever the user typed. See issue #202.
  const aliasPlaceholder = useMemo(() => {
    if (!selectedToken) return "Leave blank for live title";
    const pageMatch = wikiPages.find((p) => `page:${p.slug}` === selectedToken);
    const chapterMatch = wikiChapters.find(
      (c) => `${chapterType}:${c.name}` === selectedToken,
    );
    const name = pageMatch?.name ?? chapterMatch?.name;
    return name ? `${name} (leave blank for live title)` : "Leave blank for live title";
  }, [selectedToken, wikiPages, wikiChapters, chapterType]);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  const [pos, setPos] = useState(() => {
    const r = anchorEl.getBoundingClientRect();
    const vv = window.visualViewport;
    return { top: r.bottom + 4 + (vv?.offsetTop ?? 0), left: r.left + (vv?.offsetLeft ?? 0) };
  });

  const updatePos = useCallback(() => {
    if (!anchorEl.isConnected) return;
    const r = anchorEl.getBoundingClientRect();
    const vv = window.visualViewport;
    const nextTop = r.bottom + 4 + (vv?.offsetTop ?? 0);
    const nextLeft = r.left + (vv?.offsetLeft ?? 0);
    setPos((prev) =>
      prev.top === nextTop && prev.left === nextLeft
        ? prev
        : { top: nextTop, left: nextLeft },
    );
  }, [anchorEl]);

  // Reposition on scroll, resize, and iOS visualViewport changes (virtual keyboard open/close).
  useEffect(() => {
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    window.visualViewport?.addEventListener("resize", updatePos);
    window.visualViewport?.addEventListener("scroll", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
      window.visualViewport?.removeEventListener("resize", updatePos);
      window.visualViewport?.removeEventListener("scroll", updatePos);
    };
  }, [updatePos]);

  // Auto-focus alias input when requested (post-autocomplete alias step).
  useEffect(() => {
    if (autoFocusAlias) {
      aliasInputRef.current?.select();
    }
  }, [autoFocusAlias]);

  const selectOptions = useMemo((): Option<string>[] => {
    const hasChapters = wikiChapters.length > 0 && !!chapterType;
    if (hasChapters) {
      return [
        ...(wikiPages.length > 0
          ? [
              {
                label: "Pages",
                value: null as unknown as string,
                structural: true,
                children: wikiPages.map((p) => ({
                  label: p.name,
                  value: `page:${p.slug}`,
                })),
              },
            ]
          : []),
        {
          label: `${chapterType}s`,
          value: null as unknown as string,
          structural: true,
          children: wikiChapters.map((c) => ({
            label: c.name,
            value: `${chapterType}:${c.name}`,
          })),
        },
      ];
    }
    return wikiPages.map((p) => ({ label: p.name, value: `page:${p.slug}` }));
  }, [wikiPages, wikiChapters, chapterType]);

  function handleTokenChange(token: string) {
    setSelectedToken(token);
  }

  function handleConfirm() {
    if (!selectedToken) return;
    onConfirm(selectedToken, alias.trim() || undefined);
  }

  return (
    <>
      {/* Transparent backdrop — clicking outside the popover closes it. */}
      <div className="fixed inset-0 z-[49]" onMouseDown={onClose} />
      <div
        style={{
          top: pos.top,
          left: pos.left,
        }}
        className="fixed z-50 w-80 rounded-lg border border-border bg-popover p-3 shadow-md flex flex-col gap-3"
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <Text variant="label">{initialToken ? "Edit Wiki Link" : "Insert Wiki Link"}</Text>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-6 shrink-0"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <Select<string>
          options={selectOptions}
          value={selectedToken}
          onChange={handleTokenChange}
          placeholder="Select a page or chapter…"
          popupWidth="320px"
        />
        <Input
          ref={aliasInputRef}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder={aliasPlaceholder}
          autoFocus={autoFocusAlias}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              handleConfirm();
            }
          }}
        />
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedToken}
          className="w-full"
        >
          {initialToken ? "Update Wiki Link" : "Insert Wiki Link"}
        </Button>
      </div>
    </>
  );
}
