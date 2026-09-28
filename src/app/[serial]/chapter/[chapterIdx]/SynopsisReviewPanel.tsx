"use client";

import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { SuggestionCard } from "@/components/SuggestionCard";
import { approveSynopsisSuggestion, rejectSynopsisSuggestion } from "./synopsisSuggestionActions";

type SynopsisSuggestion = {
  id: number;
  proposerUsername: string | null;
  proposedContent: string;
  citation: string;
  createdAt: Date;
};

type SynopsisReviewPanelProps = {
  /** Pending suggestions to review, fetched server-side. */
  suggestions: SynopsisSuggestion[];
  /** Current synopsis content, shown as "current" in the diff. */
  currentContent: string;
  /** Serial slug for MarkdownRenderer wiki links. */
  serialSlug: string;
};

/**
 * Admin review panel for pending chapter synopsis suggestions.
 * Shows the current synopsis alongside each proposed version, with approve/reject controls.
 *
 * @example
 * <SynopsisReviewPanel suggestions={suggestions} currentContent={synopsisContent} serialSlug="one-piece" />
 */
export function SynopsisReviewPanel(props: SynopsisReviewPanelProps) {
  const { suggestions, currentContent, serialSlug } = props;

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Box col className="gap-4">
      <Text variant="h3">Pending synopsis suggestions ({suggestions.length})</Text>
      {suggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          proposerUsername={suggestion.proposerUsername}
          createdAt={suggestion.createdAt}
          onApprove={(note) => approveSynopsisSuggestion(suggestion.id, note)}
          onReject={(note) => rejectSynopsisSuggestion(suggestion.id, note)}
        >
          {/* Citation */}
          <Box col className="gap-1">
            <Text className="text-sm font-medium text-muted-foreground">Citation</Text>
            <Text className="text-sm italic">{suggestion.citation}</Text>
          </Box>

          {/* Before/after diff */}
          <Box className="gap-3 items-start flex-col sm:flex-row">
            <Box col className="flex-1 gap-1 min-w-0">
              <Text muted className="text-xs font-medium uppercase tracking-wide">Current</Text>
              <Box className="rounded-md border border-border bg-muted/30 p-3 text-sm min-h-80px overflow-auto">
                {currentContent ? (
                  <MarkdownRenderer serialSlug={serialSlug} sm>{currentContent}</MarkdownRenderer>
                ) : (
                  <Text muted className="text-sm">(empty)</Text>
                )}
              </Box>
            </Box>
            <Box col className="flex-1 gap-1 min-w-0">
              <Text className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
                Proposed
              </Text>
              <Box className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm min-h-80px overflow-auto">
                <MarkdownRenderer serialSlug={serialSlug} sm>
                  {suggestion.proposedContent}
                </MarkdownRenderer>
              </Box>
            </Box>
          </Box>
        </SuggestionCard>
      ))}
    </Box>
  );
}
