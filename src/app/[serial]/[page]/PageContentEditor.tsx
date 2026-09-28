import { useState } from "react";
import { Eraser } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { WikiLinkMDEditor } from "@/components/MDEditor/index";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { LastUpdatedTag } from "./LastUpdatedTag";
import { RemoveRevisionDialog } from "./RemoveRevisionDialog";
import type { ChapterData } from "./types";

type PageContentEditorProps = {
  /** Heading shown above the editor and in the remove-revision dialog title. */
  label: string;
  /** When true, hides the heading and shows a preview-tooltip info icon instead (used for the page body). */
  isBody?: boolean;
  /** The currently saved content, used as the "current" side of the remove-revision diff. */
  savedContent: string;
  /** The current unsaved draft content for this field. */
  draftContent: string;
  /** Chapter index of the last saved revision, or null if never saved. */
  lastUpdatedIdx: number | null;
  /** The currently selected chapter index for the "writing as of" context. */
  selectedChapterIdx: number | null;
  /** Called with the new markdown string whenever the draft changes. */
  onChange: (val: string) => void;
  /** Slug of the parent serial, used to resolve wiki links. */
  serialSlug: string;
  /** All wiki pages in this serial for `[[Page]]` autocomplete. */
  wikiPages: { name: string; slug: string }[];
  /** Chapters for `[[Chapter:Name]]` autocomplete in the editor. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. `"Chapter"`). */
  chapterType?: string;
  /**
   * Content from the revision immediately before the selected chapter's revision.
   * Empty string when no prior revision exists. Clicking "Remove revision" loads
   * this value into the draft; saving it triggers the same-as-previous invariant
   * which deletes the current chapter's revision.
   */
  previousRevisionContent: string;
  /** Chapter idx of the revision immediately before the selected chapter's revision, or null when no prior revision exists. */
  previousRevisionChapterIdx: number | null;
  /**
   * Called when the user confirms removing the revision in the dialog. The parent
   * (PageEditor) handles the draft update and any necessary chapter switch.
   */
  onConfirmRemove: () => void;
  /** All chapters in the serial. Used to compute impact range in the remove-revision dialog. */
  allChapters: ChapterData[];
  /**
   * Chapter idx of the next revision strictly after the selected chapter, or null when
   * this is the most recent revision. Forwarded to the remove-revision dialog to show
   * the exact range of chapters that would be affected.
   */
  nextRevisionChapterIdx: number | null;
  /** Editor height in pixels. Defaults to 300 (body); pass a smaller value for the infobox. */
  height?: number;
};

/**
 * Editor for a single chapter-versioned page content field (the page body or
 * the infobox content), with a "Remove revision" action that opens a
 * confirmation dialog showing a side-by-side diff and chapter impact
 * timeline before loading the previous revision into the draft.
 *
 * @example
 * <PageContentEditor
 *   label="Body"
 *   isBody
 *   savedContent="..."
 *   draftContent="..."
 *   lastUpdatedIdx={1}
 *   selectedChapterIdx={3}
 *   onChange={(val) => setDraft(val)}
 *   serialSlug="one-piece"
 *   wikiPages={[{ name: "Luffy", slug: "luffy" }]}
 *   previousRevisionContent="Earlier content"
 *   onConfirmRemove={() => {}}
 *   allChapters={allChapters}
 * />
 */
export function PageContentEditor(props: PageContentEditorProps) {
  const {
    label,
    isBody = false,
    savedContent,
    draftContent,
    lastUpdatedIdx,
    selectedChapterIdx,
    onChange,
    serialSlug,
    wikiPages,
    wikiChapters,
    chapterType,
    previousRevisionContent,
    previousRevisionChapterIdx,
    onConfirmRemove,
    allChapters,
    nextRevisionChapterIdx,
    height = 300,
  } = props;

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  function handleConfirmRemove() {
    onConfirmRemove();
    setIsDialogOpen(false);
  }

  return (
    <Box col className="gap-2">
      <Box className="items-center gap-2 flex-wrap">
        {!isBody && <Text variant="h2">{label}</Text>}
        {isBody && (
          <InfoIcon contents="This content will appear in preview tooltips when this page is mentioned elsewhere." />
        )}
        <LastUpdatedTag
          lastUpdatedIdx={lastUpdatedIdx}
          selectedChapterIdx={selectedChapterIdx}
        />
        <Box className="ml-auto">
          {lastUpdatedIdx !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDialogOpen(true)}
              aria-label={`Remove this ${label.toLowerCase()}'s revision`}
              className="text-muted-foreground hover:text-foreground gap-1.5"
            >
              <Eraser size={14} />
              Remove revision
            </Button>
          ) : (
            <Tooltip content="No revision exists yet">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled
                aria-label={`Remove this ${label.toLowerCase()}'s revision`}
                className="gap-1.5"
              >
                <Eraser size={14} />
                Remove revision
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      <WikiLinkMDEditor
        value={draftContent}
        onChange={(val) => onChange(val ?? "")}
        height={height}
        preview="edit"
        wikiPages={wikiPages}
        serialSlug={serialSlug}
        wikiChapters={wikiChapters}
        chapterType={chapterType}
      />

      <RemoveRevisionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={handleConfirmRemove}
        sectionName={label}
        currentContent={savedContent}
        previousContent={previousRevisionContent}
        previousRevisionChapterIdx={previousRevisionChapterIdx}
        allChapters={allChapters}
        selectedChapterIdx={lastUpdatedIdx}
        nextRevisionChapterIdx={nextRevisionChapterIdx}
      />
    </Box>
  );
}
