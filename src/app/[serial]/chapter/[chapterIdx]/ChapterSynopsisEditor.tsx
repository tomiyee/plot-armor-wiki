"use client";

import { useCallback, useEffect, useState } from "react";
import { useServerAction } from "@/hooks/useServerAction";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { useEditMode } from "@/contexts/EditModeContext";
import { WikiLinkMDEditor } from "@/components/MDEditor/index";

type ChapterSynopsisEditorProps = {
  /** URL slug of the serial, used for markdown preview links. */
  serialSlug: string;
  /** Saved synopsis content loaded from the server. */
  initialContent: string;
  /** Wiki pages introduced at or before this chapter's idx, used for `[[` autocomplete. */
  wikiPages: { name: string; slug: string }[];
  /**
   * All chapters in the serial, used for `[[Chapter:Name]]` autocomplete and
   * chapter link routing in the markdown preview.
   */
  wikiChapters?: { name: string; idx: number }[];
  /**
   * The serial's chapter type label (e.g. `"Chapter"`, `"Episode"`).
   * Required alongside `wikiChapters` to enable chapter link autocomplete.
   */
  chapterType?: string;
  /**
   * Server action that persists the synopsis. Pre-bound with `serialSlug` and
   * `chapterIdx` by the parent server component - accepts only the markdown
   * content string.
   */
  saveAction: (content: string) => Promise<void>;
};

/**
 * Inline markdown editor for a chapter's synopsis. In read mode renders the
 * synopsis as styled markdown (or a placeholder when empty). In edit mode
 * (driven by the global `EditModeContext` / bottom-right FAB) shows a
 * `WikiLinkMDEditor` with `[[Page]]` autocomplete.
 *
 * Save and discard are handled by the global FAB via registered handlers,
 * keeping this component consistent with the rest of the edit-mode pattern.
 *
 * @example
 * // In the server component, pre-bind serialSlug + chapterIdx before passing:
 * const boundSave = saveChapterSynopsis.bind(null, serialSlug, chapterIdx);
 * <ChapterSynopsisEditor
 *   serialSlug="one-piece"
 *   initialContent=""
 *   wikiPages={wikiPages}
 *   saveAction={boundSave}
 * />
 */
export function ChapterSynopsisEditor(props: ChapterSynopsisEditorProps) {
  const {
    serialSlug,
    initialContent,
    wikiPages,
    wikiChapters,
    chapterType,
    saveAction,
  } = props;
  const { runAsync, isPending } = useServerAction();
  const { isEditing, registerHandlers } = useEditMode();

  const [committed, setCommitted] = useState(initialContent);
  const [draft, setDraft] = useState(initialContent);

  const handleSave = useCallback(() => {
    runAsync(
      () => saveAction(draft),
      () => setCommitted(draft),
    );
  }, [runAsync, saveAction, draft]);

  const handleDiscard = useCallback(() => {
    setDraft(committed);
  }, [committed]);

  useEffect(() => {
    return registerHandlers({ onSave: handleSave, onDiscard: handleDiscard });
  }, [registerHandlers, handleSave, handleDiscard]);

  if (isEditing) {
    return (
      <Box col className="gap-3">
        <WikiLinkMDEditor
          value={draft}
          onChange={(val) => setDraft(val ?? "")}
          height={300}
          preview="edit"
          wikiPages={wikiPages}
          serialSlug={serialSlug}
          wikiChapters={wikiChapters}
          chapterType={chapterType}
        />
        {isPending && (
          <Text muted className="text-sm">
            Saving…
          </Text>
        )}
      </Box>
    );
  }

  const pageTitleMap = Object.fromEntries(
    wikiPages.map((p) => [p.slug, p.name]),
  );

  return (
    <Box col className="gap-2">
      {committed ? (
        <MarkdownRenderer
          serialSlug={serialSlug}
          pageTitles={pageTitleMap}
          chapterType={chapterType}
          wikiChapters={
            wikiChapters
              ? Object.fromEntries(wikiChapters.map((c) => [c.name, c.idx]))
              : undefined
          }
        >
          {committed}
        </MarkdownRenderer>
      ) : (
        <Text muted>No synopsis written yet.</Text>
      )}
    </Box>
  );
}
