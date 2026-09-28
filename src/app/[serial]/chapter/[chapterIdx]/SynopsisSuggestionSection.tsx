"use client";

import { useState } from "react";
import Link from "next/link";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { SynopsisSuggestionForm } from "./SynopsisSuggestionForm";
import type { SuggestionStatus } from "@/types";

type MySuggestion = {
  id: number;
  status: SuggestionStatus;
  reviewNote: string | null;
  createdAt: Date;
} | null;

type SynopsisSuggestionSectionProps = {
  /** DB id of the chapter. */
  chapterId: number;
  /** Current synopsis text. */
  currentContent: string;
  /** The current user's most recent synopsis suggestion for this chapter, or null. */
  mySuggestion: MySuggestion;
  /** Wiki pages for editor autocomplete. */
  wikiPages: { name: string; slug: string }[];
  /** Slug of the parent serial. */
  serialSlug: string;
  /** All chapters for `[[Chapter:Name]]` autocomplete. */
  wikiChapters?: { name: string; idx: number }[];
  /** The serial's chapter type label. */
  chapterType?: string;
};

/**
 * Read-mode wrapper: shows a "Suggest an edit to the synopsis" button for
 * authenticated non-admins, plus a status banner if they have an existing suggestion.
 *
 * @example
 * <SynopsisSuggestionSection chapterId={7} currentContent="..." mySuggestion={null} />
 */
export function SynopsisSuggestionSection(props: SynopsisSuggestionSectionProps) {
  const { chapterId, currentContent, mySuggestion, wikiPages, serialSlug, wikiChapters, chapterType } = props;
  const [showForm, setShowForm] = useState(false);

  const statusBanner = (() => {
    if (!mySuggestion) return null;
    const { status, reviewNote } = mySuggestion;
    if (status === "pending") {
      return (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Your synopsis suggestion is pending admin review.
        </div>
      );
    }
    if (status === "approved") {
      return (
        <div className="rounded-md border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Your synopsis suggestion was approved and applied.
        </div>
      );
    }
    if (status === "rejected") {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Your synopsis suggestion was not accepted.
          {reviewNote && (
            <Text as="span" className="block mt-1 text-muted-foreground">
              Admin note: {reviewNote}
            </Text>
          )}
        </div>
      );
    }
    return null;
  })();

  return (
    <Box col className="gap-3 mt-2">
      {statusBanner}
      {!showForm && (
        <Box col className="gap-1.5">
          <div>
            <Button variant="outline" onClick={() => setShowForm(true)}>
              Suggest an edit to the synopsis
            </Button>
          </div>
          <Text className="text-xs text-muted-foreground">
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
        </Box>
      )}
      {showForm && (
        <SynopsisSuggestionForm
          chapterId={chapterId}
          currentContent={currentContent}
          onClose={() => setShowForm(false)}
          wikiPages={wikiPages}
          serialSlug={serialSlug}
          wikiChapters={wikiChapters}
          chapterType={chapterType}
        />
      )}
    </Box>
  );
}
