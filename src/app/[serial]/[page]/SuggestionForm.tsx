"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useServerAction } from "@/hooks/useServerAction";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Text } from "@/components/ui/Text";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { submitPageSuggestion } from "./suggestionActions";
import { getContentAtChapter } from "./actions";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { LastUpdatedTag } from "./LastUpdatedTag";
import type { ChapterData, ChapterGroupOption } from "./types";

const WikiLinkMDEditor = dynamic(
  () => import("@/components/MDEditor").then((m) => m.WikiLinkMDEditor),
  { ssr: false },
);

type SuggestionFormProps = {
  /** DB id of the page being suggested. */
  pageId: number;
  /** All chapters for this serial, used to build the "Writing as of:" selector. */
  allChapters: ChapterData[];
  /**
   * The chapter the user is currently reading up to - used as the default
   * for the "Writing as of:" selector and caps the available choices to prevent
   * exposing the suggester to content beyond their progress.
   */
  readingChapterId: number | null;
  /** Wiki pages for `[[Page]]` autocomplete in the editor. */
  wikiPages: { name: string; slug: string }[];
  /** Chapter name → idx map for `[[Chapter:Name]]` autocomplete. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
  /** Slug of the parent serial, used to resolve wiki links. */
  serialSlug: string;
  /** Pre-loaded body content at the reader's current cutoff (avoids an extra round-trip). */
  initialContent: string;
  /** Chapter idx the pre-loaded body content was last updated at. */
  initialContentLastUpdatedChapterIdx: number | null;
  /** Pre-loaded infobox content at the reader's current cutoff. Empty string when the page has no infobox content. */
  initialInfoboxContent: string;
  /** Chapter idx the pre-loaded infobox content was last updated at. */
  initialInfoboxLastUpdatedChapterIdx: number | null;
  /** Called when the user cancels or dismisses the post-submit confirmation dialog. */
  onClose: () => void;
};

/**
 * Inline suggestion form shown to authenticated non-admin users inside PageReadView.
 * Allows proposing a body and/or infobox content change with a single citation field.
 * Fetches content at the chosen target chapter when the chapter selector changes.
 * Only chapters up to the user's reading progress are shown to prevent spoilers.
 *
 * @example
 * <SuggestionForm
 *   pageId={42}
 *   allChapters={allChapters}
 *   readingChapterId={7}
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 *   serialSlug="one-piece"
 *   initialContent="..."
 *   initialContentLastUpdatedChapterIdx={1}
 *   initialInfoboxContent="**Age:** 19"
 *   initialInfoboxLastUpdatedChapterIdx={1}
 *   onClose={() => setShowForm(false)}
 * />
 */
export function SuggestionForm(props: SuggestionFormProps) {
  const {
    pageId,
    allChapters,
    readingChapterId,
    wikiPages,
    wikiChapters,
    chapterType,
    serialSlug,
    initialContent,
    initialContentLastUpdatedChapterIdx,
    initialInfoboxContent,
    initialInfoboxLastUpdatedChapterIdx,
    onClose,
  } = props;

  const { runAsync, isPending: isSubmitPending } = useServerAction();
  const [isFetchPending, startTransition] = useTransition();
  const isPending = isFetchPending || isSubmitPending;

  // Restrict available chapters to those at or before the user's reading cutoff.
  const readingChapterIdx =
    readingChapterId !== null
      ? (allChapters.find((c) => c.id === readingChapterId)?.idx ?? null)
      : null;
  const availableChapters =
    readingChapterIdx !== null
      ? allChapters.filter((c) => c.idx <= readingChapterIdx)
      : allChapters;

  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    readingChapterId ?? availableChapters.at(-1)?.id ?? null,
  );
  const selectedChapterIdx =
    availableChapters.find((c) => c.id === selectedChapterId)?.idx ?? null;

  const [content, setContent] = useState(initialContent);
  const [contentLastUpdatedIdx, setContentLastUpdatedIdx] = useState(
    initialContentLastUpdatedChapterIdx,
  );
  const [infoboxContent, setInfoboxContent] = useState(initialInfoboxContent);
  const [infoboxLastUpdatedIdx, setInfoboxLastUpdatedIdx] = useState(
    initialInfoboxLastUpdatedChapterIdx,
  );
  const [draftContent, setDraftContent] = useState(initialContent);
  const [draftInfoboxContent, setDraftInfoboxContent] = useState(
    initialInfoboxContent,
  );
  const [citation, setCitation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  // Tracks which chapter's content is actually loaded in the editors - lags behind
  // selectedChapterId during async fetches. Used as editor key so MDXEditor remounts
  // with the correct diffMarkdown baseline whenever the displayed chapter changes.
  // (diffSourcePlugin captures diffMarkdown once at init; remount is the only reset path.)
  const [contentChapterId, setContentChapterId] = useState(selectedChapterId);

  // Dirty state: true when any draft differs from the saved content or citation is non-empty.
  const isDirty =
    citation.trim().length > 0 ||
    draftContent !== content ||
    draftInfoboxContent !== infoboxContent;

  // Warn before navigating away with a started draft.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleChapterChange = useCallback(
    (chapterId: number) => {
      setSelectedChapterId(chapterId);
      startTransition(async () => {
        const data = await getContentAtChapter(pageId, chapterId);
        setContent(data.content);
        setContentLastUpdatedIdx(data.lastUpdatedChapterIdx);
        setDraftContent(data.content);
        setInfoboxContent(data.infoboxContent);
        setInfoboxLastUpdatedIdx(data.infoboxLastUpdatedChapterIdx);
        setDraftInfoboxContent(data.infoboxContent);
        setContentChapterId(chapterId);
      });
    },
    [pageId],
  );

  const handleSubmit = useCallback(() => {
    if (!selectedChapterId) {
      setSubmitError("Please select a target chapter.");
      return;
    }
    if (!citation.trim()) {
      setSubmitError("Citation is required.");
      return;
    }
    const proposedContent =
      draftContent !== content && draftContent.trim() ? draftContent : null;
    const proposedInfoboxContent =
      draftInfoboxContent !== infoboxContent && draftInfoboxContent.trim()
        ? draftInfoboxContent
        : null;
    if (proposedContent === null && proposedInfoboxContent === null) {
      setSubmitError("Make at least one change before submitting.");
      return;
    }
    setSubmitError(null);
    runAsync(
      () =>
        submitPageSuggestion(
          pageId,
          selectedChapterId,
          citation,
          proposedContent,
          proposedInfoboxContent,
        ),
      () => setShowSuccessDialog(true),
      (err) => setSubmitError(err),
    );
  }, [
    runAsync,
    selectedChapterId,
    citation,
    content,
    infoboxContent,
    draftContent,
    draftInfoboxContent,
    pageId,
  ]);

  // Build chapter selector options from filtered available chapters only.
  const chapterSelectOptions: ChapterGroupOption[] = (() => {
    const volumeMap = new Map<string, { label: string; value: number }[]>();
    for (const ch of availableChapters) {
      const arr = volumeMap.get(ch.volumeName) ?? [];
      arr.push({ label: ch.displayName, value: ch.id });
      volumeMap.set(ch.volumeName, arr);
    }
    return Array.from(volumeMap.entries()).map(([volumeName, chaps]) => ({
      label: volumeName,
      value: -1 as number,
      children: chaps.map((c) => ({
        label: c.label,
        value: c.value,
        disabled: false,
      })),
    }));
  })();

  const selectedChapterName = availableChapters.find(
    (c) => c.id === selectedChapterId,
  )?.displayName;
  const chapterLabel = chapterType ?? "Chapter";

  return (
    <>
      <Dialog isOpen={showSuccessDialog} onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Suggestion submitted</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text>
            A wiki admin will review your suggestion. In the meantime, you can
            check the status on this page.
          </Text>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </Dialog>

      <Box
        col
        className="gap-6 rounded-lg border border-border bg-muted/30 p-6"
      >
        <Box className="items-center justify-between">
          <Text variant="h3">Suggest an edit</Text>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </Box>

        <Text className="text-sm text-muted-foreground">
          Suggestions are reviewed by a wiki admin before going live.{" "}
          <Link
            href="/help#suggesting-edits"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            How does this work?
          </Link>
        </Text>

        {/* Chapter selector */}
        {availableChapters.length > 0 && (
          <Box col className="gap-2">
            <Label htmlFor="suggestion-target-chapter">
              Writing as of {chapterLabel}:
            </Label>
            <Select<number>
              id="suggestion-target-chapter"
              options={chapterSelectOptions}
              value={selectedChapterId ?? undefined}
              onChange={handleChapterChange}
              disabled={isPending}
              className="w-52"
            />
            {selectedChapterName && (
              <Text className="text-sm text-amber-600 dark:text-amber-400">
                Write for readers up to {chapterLabel} {selectedChapterName}.
                Avoid referencing later events - an admin will review your
                suggestion.
              </Text>
            )}
          </Box>
        )}

        {/* Body editor */}
        <Box col className="gap-2">
          <Box className="items-center gap-2">
            <InfoIcon contents="This content will appear in preview tooltips when this page is mentioned elsewhere." />
            <LastUpdatedTag
              lastUpdatedIdx={contentLastUpdatedIdx}
              selectedChapterIdx={selectedChapterIdx}
            />
          </Box>
          <WikiLinkMDEditor
            key={`${contentChapterId}-body`}
            value={draftContent}
            onChange={(val) => setDraftContent(val ?? "")}
            height={260}
            preview="edit"
            wikiPages={wikiPages}
            serialSlug={serialSlug}
            wikiChapters={wikiChapters}
            chapterType={chapterType}
          />
        </Box>

        {/* Infobox editor */}
        <Box col className="gap-2">
          <Box className="items-center gap-2">
            <Text variant="h3">Infobox</Text>
            <LastUpdatedTag
              lastUpdatedIdx={infoboxLastUpdatedIdx}
              selectedChapterIdx={selectedChapterIdx}
            />
          </Box>
          <WikiLinkMDEditor
            key={`${contentChapterId}-infobox`}
            value={draftInfoboxContent}
            onChange={(val) => setDraftInfoboxContent(val ?? "")}
            height={120}
            preview="edit"
            wikiPages={wikiPages}
            serialSlug={serialSlug}
            wikiChapters={wikiChapters}
            chapterType={chapterType}
          />
        </Box>

        {/* Citation */}
        <Box col className="gap-2">
          <Label htmlFor="suggestion-citation">
            Citation <span className="text-red-500">*</span>
          </Label>
          <Text className="text-sm text-muted-foreground">
            Provide a quote, page number, or episode timestamp supporting your
            changes.
          </Text>
          <Textarea
            id="suggestion-citation"
            placeholder="e.g. Chapter 12, page 4 - 'Luffy said…'"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            disabled={isPending}
            rows={3}
          />
        </Box>

        {submitError && (
          <Text className="text-sm text-destructive">{submitError}</Text>
        )}

        <Button onClick={handleSubmit} disabled={isPending || !isDirty}>
          {isPending ? "Submitting…" : "Submit suggestion"}
        </Button>
      </Box>
    </>
  );
}
