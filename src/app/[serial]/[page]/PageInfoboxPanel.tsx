"use client";

import type { Dispatch, SetStateAction } from "react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { PageContentEditor } from "./PageContentEditor";
import type { ChapterData } from "./types";

type PageInfoboxPanelProps = {
  /** The saved infobox content at the reader's current chapter cutoff, used as the diff baseline. */
  savedContent: string;
  /** Controlled draft value for the infobox markdown content, owned by `PageEditor`. */
  draftContent: string;
  /** Setter for `draftContent`, owned by `PageEditor`. */
  setDraftContent: Dispatch<SetStateAction<string>>;
  /** Chapter idx of the last saved infobox revision, or null if never saved. */
  lastUpdatedIdx: number | null;
  /** The currently selected chapter index for the "writing as of" context. */
  selectedChapterIdx: number | null;
  /** Controlled draft value for the floater image URL, owned by `PageEditor`. */
  draftFloaterImageUrl: string;
  /** Setter for `draftFloaterImageUrl`, owned by `PageEditor`. */
  setDraftFloaterImageUrl: Dispatch<SetStateAction<string>>;
  /** Content from the revision immediately before the selected chapter's revision. */
  previousRevisionContent: string;
  /** Chapter idx of the revision immediately before the selected chapter's revision, or null when no prior revision exists. */
  previousRevisionChapterIdx: number | null;
  /** Called when the user confirms removing the infobox revision in the dialog. */
  onConfirmRemove: () => void;
  /** All chapters in the serial, used by the remove-revision dialog's impact timeline. */
  allChapters: ChapterData[];
  /** Chapter idx of the next infobox revision strictly after the selected chapter, or null when this is the most recent one. */
  nextRevisionChapterIdx: number | null;
  /** Slug of the serial — forwarded to the MDEditor for wiki-link autocomplete. */
  serialSlug: string;
  /** All wiki pages for `[[Page]]` autocomplete in the MDEditor. */
  wikiPages: { name: string; slug: string }[];
  /** All chapters for `[[Chapter:Name]]` autocomplete in the MDEditor. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. `"Chapter"`). */
  chapterType?: string;
};

/**
 * Edit-mode panel for the page infobox: a single chapter-versioned content
 * field plus an image URL. Whether the infobox renders at all in read mode is
 * derived from whether either field is non-empty at the reader's cutoff -
 * there is no longer a separate "enabled" flag or row structure to manage.
 *
 * @example
 * <PageInfoboxPanel
 *   savedContent=""
 *   draftContent=""
 *   setDraftContent={setContent}
 *   lastUpdatedIdx={null}
 *   selectedChapterIdx={3}
 *   draftFloaterImageUrl=""
 *   setDraftFloaterImageUrl={setUrl}
 *   previousRevisionContent=""
 *   previousRevisionChapterIdx={null}
 *   onConfirmRemove={() => {}}
 *   allChapters={allChapters}
 *   nextRevisionChapterIdx={null}
 *   serialSlug="one-piece"
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 * />
 */
export function PageInfoboxPanel(props: PageInfoboxPanelProps) {
  const {
    savedContent,
    draftContent,
    setDraftContent,
    lastUpdatedIdx,
    selectedChapterIdx,
    draftFloaterImageUrl,
    setDraftFloaterImageUrl,
    previousRevisionContent,
    previousRevisionChapterIdx,
    onConfirmRemove,
    allChapters,
    nextRevisionChapterIdx,
    serialSlug,
    wikiPages,
    wikiChapters,
    chapterType,
  } = props;

  return (
    <Box col className="gap-4 rounded-lg border border-infobox-border bg-infobox-bg p-4">
      <Box className="items-center gap-2">
        <Text variant="h3">Infobox</Text>
        <InfoIcon contents="The infobox floats on the right side of the page showing an image and key facts about this subject. It's chapter-versioned, and only appears to readers when it has content or an image at their current chapter." />
      </Box>

      <Box col className="gap-1.5">
        <Label htmlFor="floater-image-url">Image URL</Label>
        <Input
          id="floater-image-url"
          value={draftFloaterImageUrl}
          onChange={(e) => setDraftFloaterImageUrl(e.target.value)}
          placeholder="https://…"
        />
      </Box>

      <PageContentEditor
        label="Infobox content"
        savedContent={savedContent}
        draftContent={draftContent}
        lastUpdatedIdx={lastUpdatedIdx}
        selectedChapterIdx={selectedChapterIdx}
        onChange={setDraftContent}
        serialSlug={serialSlug}
        wikiPages={wikiPages}
        wikiChapters={wikiChapters}
        chapterType={chapterType}
        previousRevisionContent={previousRevisionContent}
        previousRevisionChapterIdx={previousRevisionChapterIdx}
        onConfirmRemove={onConfirmRemove}
        allChapters={allChapters}
        nextRevisionChapterIdx={nextRevisionChapterIdx}
        height={160}
      />
    </Box>
  );
}
