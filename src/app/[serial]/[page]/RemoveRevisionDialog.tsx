"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import type { ChapterData } from "./types";

// ── Line diff ──────────────────────────────────────────────────────────────

type LineType = "equal" | "removed" | "added" | "empty";

type DiffRow = {
  left: { text: string; type: LineType };
  right: { text: string; type: LineType };
};

/**
 * LCS-based line diff. Returns aligned row pairs for a side-by-side view.
 * "removed" rows appear only on the left (lines deleted from current);
 * "added" rows appear only on the right (lines present in previous but not current).
 */
function computeLineDiff(current: string, previous: string): DiffRow[] {
  const a = current ? current.split("\n") : [];
  const b = previous ? previous.split("\n") : [];
  const m = a.length;
  const n = b.length;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rows.unshift({
        left: { text: a[i - 1], type: "equal" },
        right: { text: b[j - 1], type: "equal" },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rows.unshift({
        left: { text: "", type: "empty" },
        right: { text: b[j - 1], type: "added" },
      });
      j--;
    } else {
      rows.unshift({
        left: { text: a[i - 1], type: "removed" },
        right: { text: "", type: "empty" },
      });
      i--;
    }
  }
  return rows;
}

// ── DiffCell ───────────────────────────────────────────────────────────────

type DiffCellProps = {
  /** Which column this cell belongs to. */
  side: "left" | "right";
  /** The diff classification for this row. */
  type: LineType;
  /** The line of text to display. */
  text: string;
};

function DiffCell(props: DiffCellProps) {
  const { side, type, text } = props;
  const isLeft = side === "left";

  const bg =
    type === "removed"
      ? "bg-red-50 dark:bg-red-950/40"
      : type === "added"
        ? "bg-green-50 dark:bg-green-950/40"
        : type === "empty"
          ? isLeft
            ? "bg-red-50/40 dark:bg-red-950/20"
            : "bg-green-50/40 dark:bg-green-950/20"
          : "";

  const textColor =
    type === "removed"
      ? "text-red-800 dark:text-red-200"
      : type === "added"
        ? "text-green-800 dark:text-green-200"
        : "text-foreground";

  const prefix =
    type === "removed" && isLeft
      ? "− "
      : type === "added" && !isLeft
        ? "+ "
        : "  ";

  return (
    <Box
      flex={1}
      className={cn(
        "min-w-0 border-b px-2 py-0.5 font-mono text-xs leading-5 whitespace-pre-wrap break-all",
        isLeft && "border-r",
        bg,
        textColor,
      )}
    >
      <Text as="span" className="select-none opacity-50">
        {prefix}
      </Text>
      {text || " "}
    </Box>
  );
}

// ── RevisionTimeline ───────────────────────────────────────────────────────

// "ghost" reserves column space in the after-row without rendering a dot or label,
// keeping the prev/next nodes aligned with the current row above.
type DotVariant = "edge" | "revision" | "target" | "next-revision" | "ghost";

type TimelineSlot = {
  key: string;
  topLabel: string;
  afterTopLabel?: string;
  currentBottomLabel?: string;
  afterBottomLabel?: string;
  currentVariant: DotVariant;
  afterVariant: DotVariant;
};

type DotNodeProps = {
  variant: DotVariant;
};

function DotNode(props: DotNodeProps) {
  const { variant } = props;
  if (variant === "edge") {
    return (
      <div className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
    );
  }
  if (variant === "target") {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-destructive ring-2 ring-destructive/30 dark:ring-destructive/20 shrink-0" />
    );
  }
  if (variant === "next-revision") {
    return (
      <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/50 bg-background shrink-0" />
    );
  }
  if (variant === "ghost") {
    // Same size as target so the row height stays consistent.
    return <div className="w-3.5 h-3.5 shrink-0" />;
  }
  return (
    <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/60 shrink-0" />
  );
}

type SegmentState = "normal" | "affected" | "healed";

type SegmentLineProps = {
  /** Visual state: normal = gray, affected = amber dashed, healed = solid green. */
  state: SegmentState;
};

function SegmentLine(props: SegmentLineProps) {
  const { state } = props;
  if (state === "affected") {
    return (
      <div className="flex-1 self-center min-w-4 border-t-2 border-dashed border-amber-400/80 dark:border-amber-500/60" />
    );
  }
  if (state === "healed") {
    return (
      <div className="flex-1 self-center min-w-4 border-t-2 border-green-500 dark:border-green-400" />
    );
  }
  return (
    <div className="flex-1 self-center min-w-4 h-px bg-muted-foreground/30" />
  );
}

function VerticalSegmentLine(props: SegmentLineProps) {
  const { state } = props;
  if (state === "affected") {
    return (
      <div className="w-0.5 h-4 border-l-2 border-dashed border-amber-400/80 dark:border-amber-500/60" />
    );
  }
  if (state === "healed") {
    return (
      <div className="w-0.5 h-4 border-l-2 border-green-500 dark:border-green-400" />
    );
  }
  return <div className="w-px h-4 bg-muted-foreground/30" />;
}

type RevisionTimelineProps = {
  allChapters: ChapterData[];
  selectedChapterIdx: number | null;
  previousRevisionChapterIdx: number | null;
  nextRevisionChapterIdx: number | null;
};

function buildTimelineSlots(
  allChapters: ChapterData[],
  selectedChapterIdx: number | null,
  previousRevisionChapterIdx: number | null,
  nextRevisionChapterIdx: number | null,
): TimelineSlot[] {
  const toLabel = (idx: number): string => {
    const ch = allChapters.find((c) => c.idx === idx);
    return ch ? `${ch.volumeName} · ${ch.displayName}` : `Chapter ${idx}`;
  };

  const slots: TimelineSlot[] = [];
  slots.push({
    key: "start",
    topLabel: "Start",
    currentVariant: "edge",
    afterVariant: "edge",
  });

  if (previousRevisionChapterIdx !== null) {
    slots.push({
      key: "prev",
      topLabel: toLabel(previousRevisionChapterIdx),
      currentBottomLabel: "Previous revision",
      afterBottomLabel: "Previous revision",
      currentVariant: "revision",
      afterVariant: "revision",
    });
  }

  if (selectedChapterIdx !== null) {
    slots.push({
      key: "current",
      topLabel: toLabel(selectedChapterIdx),
      afterTopLabel: "",
      currentBottomLabel: "Removing",
      currentVariant: "target",
      afterVariant: "ghost",
    });
  }

  if (nextRevisionChapterIdx !== null) {
    slots.push({
      key: "next",
      topLabel: toLabel(nextRevisionChapterIdx),
      currentBottomLabel: "Next revision",
      afterBottomLabel: "Next revision",
      currentVariant: "next-revision",
      afterVariant: "next-revision",
    });
  }

  slots.push({
    key: "end",
    topLabel: "End",
    currentVariant: "edge",
    afterVariant: "edge",
  });
  return slots;
}

function RevisionTimeline(props: RevisionTimelineProps) {
  const {
    allChapters,
    selectedChapterIdx,
    previousRevisionChapterIdx,
    nextRevisionChapterIdx,
  } = props;

  const slots = buildTimelineSlots(
    allChapters,
    selectedChapterIdx,
    previousRevisionChapterIdx,
    nextRevisionChapterIdx,
  );

  const currentSlotIdx = slots.findIndex((s) => s.key === "current");
  const prevSlotIdx = slots.findIndex((s) => s.key === "prev");
  const nextSlotIdx = slots.findIndex((s) => s.key === "next");
  const endSlotIdx = slots.findIndex((s) => s.key === "end");

  // Current row: amber from target up to (not including) next revision or end.
  const affectedTo = nextSlotIdx !== -1 ? nextSlotIdx : endSlotIdx;

  // After row: green spans prev→ghost and ghost→next, making the line look
  // continuous from prev to next. No green when there is no prior revision.
  const healedFrom = prevSlotIdx;

  function getSegmentState(i: number, mode: "current" | "after"): SegmentState {
    if (mode === "current") {
      if (currentSlotIdx !== -1 && i >= currentSlotIdx && i < affectedTo)
        return "affected";
    } else {
      if (healedFrom !== -1 && i >= healedFrom && i < affectedTo)
        return "healed";
    }
    return "normal";
  }

  function renderVerticalColumn(mode: "current" | "after") {
    return (
      <Box col className="items-stretch flex-1">
        {slots.map((slot, i) => {
          const variant =
            mode === "current" ? slot.currentVariant : slot.afterVariant;
          const topLabel =
            mode === "current"
              ? slot.topLabel
              : (slot.afterTopLabel ?? slot.topLabel);
          const bottomLabel =
            mode === "current"
              ? slot.currentBottomLabel
              : slot.afterBottomLabel;
          const isHealedGhost = variant === "ghost" && healedFrom !== -1;
          return (
            <Fragment key={slot.key}>
              {!isHealedGhost && (
                <Box className="items-center gap-1.5">
                  <div className="w-16 shrink-0 flex flex-col items-end justify-center">
                    {topLabel.includes(" · ") ? (
                      <>
                        <Text className="text-10px leading-none text-right text-muted-foreground truncate w-full">
                          {topLabel.slice(0, topLabel.indexOf(" · "))}
                        </Text>
                        <Text className="text-10px leading-tight text-right truncate w-full">
                          {topLabel.slice(topLabel.indexOf(" · ") + 3)}
                        </Text>
                      </>
                    ) : (
                      <Text className="text-10px leading-tight text-right truncate w-full">
                        {topLabel}
                      </Text>
                    )}
                  </div>
                  <div className="w-5 flex justify-center shrink-0">
                    <DotNode variant={variant} />
                  </div>
                  <Text className="text-10px leading-tight text-muted-foreground flex-1">
                    {bottomLabel ?? ""}
                  </Text>
                </Box>
              )}
              {i < slots.length - 1 && (
                <Box className="items-start h-4">
                  <div className="w-16 shrink-0" />
                  <div className="w-5 flex justify-center shrink-0 h-full">
                    <VerticalSegmentLine state={getSegmentState(i, mode)} />
                  </div>
                </Box>
              )}
            </Fragment>
          );
        })}
      </Box>
    );
  }

  function renderRow(mode: "current" | "after") {
    return (
      <Box className="w-full items-center">
        {slots.map((slot, i) => {
          const variant =
            mode === "current" ? slot.currentVariant : slot.afterVariant;
          const topLabel =
            mode === "current"
              ? slot.topLabel
              : (slot.afterTopLabel ?? slot.topLabel);
          const bottomLabel =
            mode === "current"
              ? slot.currentBottomLabel
              : slot.afterBottomLabel;
          const isHealedGhost = variant === "ghost" && healedFrom !== -1;
          return (
            <Fragment key={slot.key}>
              <Box
                col
                className={cn(
                  "items-center shrink-0 gap-1 w-20",
                  isHealedGhost && "relative",
                )}
              >
                <Text className="text-xs text-center leading-tight">
                  {topLabel}
                </Text>
                {isHealedGhost ? (
                  <>
                    {/* Absolutely-positioned so top-1/2 lands at the col's vertical
                        midpoint, which equals the row midpoint (col is always the
                        tallest element). Matches the self-center segment lines. */}
                    <div className="absolute inset-x-0 top-[calc(50%-1px)] border-t-2 border-green-500 dark:border-green-400" />
                    <div className="w-3.5 h-3.5 shrink-0" />
                  </>
                ) : (
                  <DotNode variant={variant} />
                )}
                <Text className="text-xs text-center leading-tight text-muted-foreground min-h-8">
                  {bottomLabel ?? ""}
                </Text>
              </Box>
              {i < slots.length - 1 && (
                <SegmentLine state={getSegmentState(i, mode)} />
              )}
            </Fragment>
          );
        })}
      </Box>
    );
  }

  return (
    <Box col className="w-full gap-4">
      {/* Large screens: two horizontal rows stacked */}
      <Box col className="gap-4 hidden sm:flex">
        <Box col className="gap-0.5">
          <Text className="text-xs font-medium text-muted-foreground">
            Current
          </Text>
          {renderRow("current")}
        </Box>
        <div className="border-t border-muted-foreground/20" />
        <Box col className="gap-0.5">
          <Text className="text-xs font-medium text-muted-foreground">
            After removing
          </Text>
          {renderRow("after")}
        </Box>
      </Box>

      {/* Small screens: two vertical columns side by side */}
      <Box className="gap-3 sm:hidden">
        <Box col className="flex-1 gap-1">
          <Text className="text-xs font-medium text-muted-foreground">
            Current
          </Text>
          {renderVerticalColumn("current")}
        </Box>
        <div className="border-l border-muted-foreground/20 self-stretch" />
        <Box col className="flex-1 gap-1">
          <Text className="text-xs font-medium text-muted-foreground">
            After removing
          </Text>
          {renderVerticalColumn("after")}
        </Box>
      </Box>
    </Box>
  );
}

// ── RemoveRevisionDialog ───────────────────────────────────────────────────

type RemoveRevisionDialogProps = {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the dialog requests closure without confirming. */
  onClose: () => void;
  /** Called when the user confirms the removal. */
  onConfirm: () => void;
  /** Name of the section whose revision is being removed. */
  sectionName: string;
  /**
   * Saved content of the revision at the selected chapter (what is being removed).
   * Shown on the left side of the diff.
   */
  currentContent: string;
  /**
   * Content from the revision immediately prior to the selected chapter (what readers
   * will see after the removal). Shown on the right side of the diff.
   */
  previousContent: string;
  /** Chapter idx of the revision immediately before the selected chapter's revision, or null when no prior revision exists. */
  previousRevisionChapterIdx: number | null;
  /** All chapters in the serial, used to compute impact range and chapter labels. */
  allChapters: ChapterData[];
  /** The idx of the chapter whose revision is being removed. */
  selectedChapterIdx: number | null;
  /**
   * Chapter idx of the next revision strictly after the selected chapter, or null when
   * this is the most recent revision. Used to compute the exact upper bound of the
   * affected chapter range (chapters between selectedChapterIdx and nextRevisionChapterIdx - 1).
   */
  nextRevisionChapterIdx: number | null;
};

/**
 * Confirmation dialog for removing a single chapter revision from a wiki section.
 * Shows a side-by-side line diff of the current revision vs the previous revision,
 * a before/after timeline, and a summary of which chapters are affected.
 *
 * Confirming loads the previous content into the draft; the actual DB deletion
 * happens when the editor saves (the save action deletes consecutive-duplicate revisions).
 *
 * @example
 * <RemoveRevisionDialog
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={() => { onChange(previousContent); setIsOpen(false); }}
 *   sectionName="Summary"
 *   currentContent={section.content}
 *   previousContent={previousRevisionContent}
 *   allChapters={allChapters}
 *   selectedChapterIdx={5}
 * />
 */
export function RemoveRevisionDialog(props: RemoveRevisionDialogProps) {
  const {
    isOpen,
    onClose,
    onConfirm,
    sectionName,
    currentContent,
    previousContent,
    previousRevisionChapterIdx,
    allChapters,
    selectedChapterIdx,
    nextRevisionChapterIdx,
  } = props;

  const selectedChapter = allChapters.find((c) => c.idx === selectedChapterIdx);
  const chapterLabel = selectedChapter
    ? `${selectedChapter.volumeName} · ${selectedChapter.displayName}`
    : selectedChapterIdx !== null
      ? `Chapter ${selectedChapterIdx}`
      : "the selected chapter";

  // Affected chapters: from selectedChapterIdx up to (but not including) the next revision.
  // When no next revision exists, all chapters from selectedChapterIdx onwards are affected.
  const affectedChapters =
    selectedChapterIdx !== null
      ? allChapters.filter(
          (c) =>
            c.idx >= selectedChapterIdx &&
            (nextRevisionChapterIdx === null || c.idx < nextRevisionChapterIdx),
        )
      : [];
  const affectedCount = affectedChapters.length;

  const nextChapter =
    nextRevisionChapterIdx !== null
      ? allChapters.find((c) => c.idx === nextRevisionChapterIdx)
      : null;
  const nextChapterLabel = nextChapter
    ? `${nextChapter.volumeName} · ${nextChapter.displayName}`
    : null;

  const diffRows = computeLineDiff(currentContent, previousContent);
  const hasChanges = diffRows.some((r) => r.left.type !== "equal");

  return (
    <Dialog isOpen={isOpen} onClose={onClose} popupClassName="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>
          Remove revision for &ldquo;{sectionName}&rdquo;?
        </DialogTitle>
      </DialogHeader>

      <DialogBody>
        <Box col className="gap-6">
          {/* Explanation */}
          <Text className="text-sm text-muted-foreground">
            Removing the{" "}
            <Text as="span" className="font-medium text-foreground">
              {chapterLabel}
            </Text>{" "}
            revision.{" "}
            {affectedCount === 1 ? (
              <>Readers at this chapter</>
            ) : (
              <>
                Readers at this chapter and{" "}
                <Text as="span" className="font-medium text-foreground">
                  {affectedCount - 1} subsequent{" "}
                  {affectedCount - 1 === 1 ? "chapter" : "chapters"}
                </Text>
              </>
            )}{" "}
            will instead see the previous revision (shown on the right).{" "}
            {nextChapterLabel ? (
              <>
                The revision at{" "}
                <Text as="span" className="font-medium text-foreground">
                  {nextChapterLabel}
                </Text>{" "}
                is unaffected.
              </>
            ) : (
              <>No later revision exists for this section.</>
            )}
          </Text>

          {/* Timeline */}
          <Box col className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Impact timeline
            </Text>
            <Box className="rounded-md border bg-muted/30 px-4 py-5">
              <RevisionTimeline
                allChapters={allChapters}
                selectedChapterIdx={selectedChapterIdx}
                previousRevisionChapterIdx={previousRevisionChapterIdx}
                nextRevisionChapterIdx={nextRevisionChapterIdx}
              />
            </Box>
          </Box>

          {/* Diff */}
          <Box col className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Content changes
            </Text>
            {!hasChanges ? (
              <Text className="text-sm text-muted-foreground italic">
                The previous revision has identical content - no visible change
                to readers.
              </Text>
            ) : (
              <Box col className="overflow-hidden rounded-md border">
                {/* Column headers */}
                <Box className="border-b bg-muted/50 shrink-0">
                  <Box
                    flex={1}
                    className="border-r px-3 py-1.5 gap-1.5 items-center"
                  >
                    <Text
                      as="span"
                      className="font-mono text-xs select-none text-red-500"
                    >
                      −
                    </Text>
                    <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                      Current revision (being removed)
                    </Text>
                  </Box>
                  <Box flex={1} className="px-3 py-1.5 gap-1.5 items-center">
                    <Text
                      as="span"
                      className="font-mono text-xs select-none text-green-500"
                    >
                      +
                    </Text>
                    <Text className="text-xs font-semibold text-green-700 dark:text-green-400">
                      After removing (previous revision)
                    </Text>
                  </Box>
                </Box>
                {/* Diff rows */}
                <Box col className="max-h-72 overflow-y-auto">
                  {diffRows.map((row, idx) => (
                    <Box key={idx}>
                      <DiffCell
                        side="left"
                        type={row.left.type}
                        text={row.left.text}
                      />
                      <DiffCell
                        side="right"
                        type={row.right.type}
                        text={row.right.text}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </DialogBody>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button variant="destructive" onClick={onConfirm}>
          Remove revision
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
