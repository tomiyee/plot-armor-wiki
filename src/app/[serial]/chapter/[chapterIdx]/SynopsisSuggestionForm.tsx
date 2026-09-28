"use client";

import { useState, useCallback } from "react";
import { useServerAction } from "@/hooks/useServerAction";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { WikiLinkMDEditor } from "@/components/MDEditor/index";
import { submitSynopsisSuggestion } from "./synopsisSuggestionActions";

type SynopsisSuggestionFormProps = {
  /** DB id of the chapter being suggested. */
  chapterId: number;
  /** Current synopsis content, used to pre-fill the draft. */
  currentContent: string;
  /** Called when the user cancels or successfully submits. */
  onClose: () => void;
  /** Wiki pages for `[[Page]]` autocomplete in the editor. */
  wikiPages: { name: string; slug: string }[];
  /** Slug of the parent serial, used to resolve wiki links in preview. */
  serialSlug: string;
  /** All chapters for `[[Chapter:Name]]` autocomplete. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
};

/**
 * Inline form for authenticated non-admins to propose a synopsis edit for a chapter.
 * Pre-fills the draft with the current synopsis so the user can edit from there.
 *
 * @example
 * <SynopsisSuggestionForm
 *   chapterId={7}
 *   currentContent="Luffy arrives at..."
 *   onClose={() => setShowForm(false)}
 * />
 */
export function SynopsisSuggestionForm(props: SynopsisSuggestionFormProps) {
  const {
    chapterId,
    currentContent,
    onClose,
    wikiPages,
    serialSlug,
    wikiChapters,
    chapterType,
  } = props;

  const { runAsync, isPending } = useServerAction();
  const [draft, setDraft] = useState(currentContent);
  const [citation, setCitation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const isDirty = draft !== currentContent || citation.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (!citation.trim()) {
      setSubmitError("Citation is required.");
      return;
    }
    if (!draft.trim()) {
      setSubmitError("Synopsis cannot be empty.");
      return;
    }
    if (draft === currentContent) {
      setSubmitError("Make at least one change before submitting.");
      return;
    }
    setSubmitError(null);
    runAsync(
      () => submitSynopsisSuggestion(chapterId, citation, draft),
      () => setSubmitted(true),
      (err) => setSubmitError(err),
    );
  }, [runAsync, chapterId, citation, draft, currentContent]);

  if (submitted) {
    return (
      <Box
        col
        className="gap-4 rounded-lg border border-border bg-muted/30 p-6"
      >
        <Text variant="h3">Suggestion submitted</Text>
        <Text variant="body">
          Your synopsis suggestion has been submitted for admin review.
        </Text>
        <Button variant="outline" onClick={onClose}>
          Back
        </Button>
      </Box>
    );
  }

  return (
    <Box col className="gap-6 rounded-lg border border-border bg-muted/30 p-6">
      <Box className="items-center justify-between">
        <Text variant="h3">Suggest a synopsis edit</Text>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
      </Box>

      <Box col className="gap-2">
        <Label>Proposed synopsis</Label>
        <WikiLinkMDEditor
          value={draft}
          onChange={(val) => setDraft(val ?? "")}
          height={260}
          preview="edit"
          wikiPages={wikiPages}
          serialSlug={serialSlug}
          wikiChapters={wikiChapters}
          chapterType={chapterType}
        />
      </Box>

      <Box col className="gap-2">
        <Label htmlFor="synopsis-citation">Citation (required)</Label>
        <Input
          id="synopsis-citation"
          placeholder="e.g. Chapter 12, page 4 - 'Luffy said…'"
          value={citation}
          onChange={(e) => setCitation(e.target.value)}
          disabled={isPending}
        />
        <Text className="text-sm text-muted-foreground">
          Provide a quote, page number, or timestamp supporting your changes.
        </Text>
      </Box>

      {submitError && (
        <Text className="text-sm text-destructive">{submitError}</Text>
      )}

      <Button onClick={handleSubmit} disabled={isPending || !isDirty}>
        {isPending ? "Submitting…" : "Submit suggestion"}
      </Button>
    </Box>
  );
}
