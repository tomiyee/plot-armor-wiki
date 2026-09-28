"use client";

import {
  useContext,
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
} from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Textarea } from "@/components/ui/Textarea";
import { WikiLinkContext } from "./WikiLinkContext";
import { Select, type Option } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";

type RefEditPopoverProps = {
  /** Anchor element (button or chip) used to position the fixed popover. */
  anchorEl: HTMLElement;
  /** Pre-fills the page/chapter selector, e.g. `"page:luffy"`. */
  initialToken?: string;
  /** Pre-fills the optional quote fields. */
  initialQuotes?: string[];
  /** Called when the user confirms the ref target and quotes (empty quotes already dropped). */
  onConfirm: (token: string, quotes: string[]) => void;
  /** Called when the user dismisses the popover (Escape, backdrop click, or × button). */
  onClose: () => void;
};

/**
 * Popover for inserting or editing a `{{ref|token}}` inline citation.
 *
 * Like `WikiLinkEditPopover` but without the alias input row, since refs always
 * display as `[N]` superscripts. Instead it offers optional exact quotes; each
 * quote shows in this citation's hover card and in the page's reference list.
 * Rendered at a fixed position derived from `anchorEl.getBoundingClientRect()`.
 *
 * @example
 * <RefEditPopover
 *   anchorEl={chipEl}
 *   initialToken="page:luffy"
 *   onConfirm={(token) => updateNode(token)}
 *   onClose={() => setEditing(false)}
 * />
 */
export function RefEditPopover(props: RefEditPopoverProps) {
  const { anchorEl, initialToken, initialQuotes = [], onConfirm, onClose } =
    props;
  const { wikiPages, wikiChapters, chapterType } = useContext(WikiLinkContext);

  const [selectedToken, setSelectedToken] = useState<string | undefined>(
    initialToken,
  );

  const [quotes, setQuotes] = useState<string[]>(initialQuotes);

  const popoverRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState(() => {
    const r = anchorEl.getBoundingClientRect();
    return { top: r.bottom + 4, left: r.left };
  });

  const updatePos = useCallback(() => {
    if (!anchorEl.isConnected) return;
    const r = anchorEl.getBoundingClientRect();
    const nextTop = r.bottom + 4;
    const nextLeft = r.left;
    setPos((prev) =>
      prev.top === nextTop && prev.left === nextLeft
        ? prev
        : { top: nextTop, left: nextLeft },
    );
  }, [anchorEl]);

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

  function handleConfirm() {
    if (!selectedToken) return;
    onConfirm(
      selectedToken,
      quotes.map((q) => q.trim()).filter(Boolean),
    );
  }

  return (
    <>
      {/* Transparent backdrop — clicking outside closes the popover. */}
      <div className="fixed inset-0 z-[49]" onMouseDown={onClose} />
      <div
        ref={popoverRef}
        style={{ top: pos.top, left: pos.left }}
        className="fixed z-50 w-80 rounded-lg border border-border bg-popover p-3 shadow-md flex flex-col gap-3"
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-center justify-between">
          <Text variant="label">
            {initialToken ? "Edit Reference" : "Insert Reference"}
          </Text>
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
          onChange={setSelectedToken}
          placeholder="Select a page or chapter…"
          popupWidth="320px"
        />
        {quotes.map((q, i) => (
          <div key={i} className="flex items-start gap-1">
            <Textarea
              value={q}
              rows={2}
              placeholder="Exact quote…"
              autoFocus={i === quotes.length - 1 && q === ""}
              onChange={(e) =>
                setQuotes((prev) =>
                  prev.map((p, j) => (j === i ? e.target.value : p)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setQuotes((prev) => prev.filter((_, j) => j !== i))}
              className="size-6 shrink-0"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Remove quote</span>
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setQuotes((prev) => [...prev, ""])}
          className="self-start"
        >
          <PlusIcon className="size-4" />
          Add quote (optional)
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedToken}
          className="w-full"
        >
          {initialToken ? "Update Reference" : "Insert Reference"}
        </Button>
      </div>
    </>
  );
}
