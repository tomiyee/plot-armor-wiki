"use client";

import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { SuggestionCard } from "@/components/SuggestionCard";
import { approveSuggestion, rejectSuggestion } from "./suggestionActions";

type DiffRowProps = {
  /** Heading shown above the two-column diff ("Body" or "Infobox"). */
  label: string;
  /** Current stored markdown at the target chapter. */
  currentContent: string;
  /** Proposed replacement markdown. */
  proposedContent: string;
  /** Tailwind min-height class for the content boxes. */
  minH: string;
  /** Serial slug forwarded to MarkdownRenderer for wiki-link resolution. */
  serialSlug: string;
};

function DiffRow(props: DiffRowProps) {
  const { label, currentContent, proposedContent, minH, serialSlug } = props;
  return (
    <Box col className="gap-2">
      <Text variant="h4">{label}</Text>
      <Box className="gap-3 items-stretch flex-col sm:flex-row">
        <Box col className="flex-1 gap-1 min-w-0">
          <Text muted className="text-xs font-medium uppercase tracking-wide">
            Current
          </Text>
          <Box
            className={`flex-1 rounded-md border border-border bg-muted/30 p-3 text-sm ${minH} overflow-auto`}
          >
            {currentContent ? (
              <MarkdownRenderer serialSlug={serialSlug} sm>
                {currentContent}
              </MarkdownRenderer>
            ) : (
              <Text muted className="text-sm">
                (empty)
              </Text>
            )}
          </Box>
        </Box>
        <Box col className="flex-1 gap-1 min-w-0">
          <Text
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--color-primary)" }}
          >
            Proposed
          </Text>
          <Box
            className={`flex-1 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm ${minH} overflow-auto`}
          >
            <MarkdownRenderer serialSlug={serialSlug} sm>
              {proposedContent}
            </MarkdownRenderer>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * A reader-submitted edit suggestion awaiting moderator review.
 * Carries at most one body diff and one infobox diff (either may be absent).
 */
type PendingSuggestion = {
  /** Database ID of the suggestion row. */
  id: number;
  /** Username of the reader who submitted the suggestion, or null if anonymous. */
  proposerUsername: string | null;
  /** ID of the chapter the suggestion targets for content versioning. */
  targetChapterId: number;
  /** Display name of the target chapter shown in the review UI. */
  targetChapterName: string;
  /** Source quote or reference the suggester provided to justify the change. */
  citation: string;
  /** Wall-clock timestamp of submission. */
  createdAt: Date;
  /** Markdown currently stored for the page body at the target chapter. */
  currentContent: string;
  /** Proposed replacement body markdown, or null when this suggestion doesn't touch the body. */
  proposedContent: string | null;
  /** Markdown currently stored for the infobox at the target chapter. */
  currentInfoboxContent: string;
  /** Proposed replacement infobox markdown, or null when this suggestion doesn't touch the infobox. */
  proposedInfoboxContent: string | null;
};

type SuggestionReviewPanelProps = {
  /** Pending suggestions to review, fetched server-side. */
  suggestions: PendingSuggestion[];
  /** Slug of the serial, used for MarkdownRenderer wiki links. */
  serialSlug: string;
};

/**
 * Admin review panel listing pending suggestions for a wiki page.
 * Shows a before/after diff per changed field, citation, and approve/reject controls.
 * Reject opens an optional review note textarea before confirming.
 *
 * @example
 * <SuggestionReviewPanel suggestions={pendingSuggestions} serialSlug="one-piece" />
 */
export function SuggestionReviewPanel(props: SuggestionReviewPanelProps) {
  const { suggestions, serialSlug } = props;

  if (suggestions.length === 0) {
    return (
      <Box
        col
        className="gap-2 rounded-lg border border-border bg-muted/20 p-4"
      >
        <Text variant="h3">Pending suggestions</Text>
        <Text muted className="text-sm">
          No pending suggestions for this page.
        </Text>
      </Box>
    );
  }

  return (
    <Box col className="gap-4">
      <Text variant="h3">Pending suggestions ({suggestions.length})</Text>
      {suggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          proposerUsername={suggestion.proposerUsername}
          createdAt={suggestion.createdAt}
          targetChapterName={suggestion.targetChapterName}
          onApprove={(note) => approveSuggestion(suggestion.id, note)}
          onReject={(note) => rejectSuggestion(suggestion.id, note)}
        >
          {/* Citation */}
          <Box col className="gap-1">
            <Text className="text-sm font-medium text-muted-foreground">
              Citation
            </Text>
            <Text className="text-sm italic">{suggestion.citation}</Text>
          </Box>

          {suggestion.proposedContent !== null && (
            <DiffRow
              label="Body"
              currentContent={suggestion.currentContent}
              proposedContent={suggestion.proposedContent}
              minH="min-h-60px"
              serialSlug={serialSlug}
            />
          )}

          {suggestion.proposedInfoboxContent !== null && (
            <DiffRow
              label="Infobox"
              currentContent={suggestion.currentInfoboxContent}
              proposedContent={suggestion.proposedInfoboxContent}
              minH="min-h-40px"
              serialSlug={serialSlug}
            />
          )}
        </SuggestionCard>
      ))}
    </Box>
  );
}
