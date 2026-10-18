import { diffWordsWithSpace } from "diff";
import { cn } from "@/lib/utils";

type TextDiffProps = {
  /** Original text. */
  before: string;
  /** Rewritten text. */
  after: string;
  /** Extra classes for the wrapper. */
  className?: string;
};

/**
 * Side-by-side word diff of two raw markdown strings. Shared by admin tools
 * (text migrations, ingest review) so every before/after view looks the same.
 * Whitespace is diffed too, so line-ending or spacing rewrites stay visible.
 */
export function TextDiff(props: TextDiffProps) {
  const { before, after, className } = props;
  const parts = diffWordsWithSpace(before, after);
  const pre =
    "whitespace-pre-wrap break-words font-mono text-xs p-3 rounded-md border bg-muted/30 min-w-0";
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-2", className)}>
      <pre className={pre}>
        {parts.map((p, i) =>
          p.added ? null : (
            <span
              key={i}
              className={p.removed ? "bg-red-500/25 line-through" : undefined}
            >
              {p.value}
            </span>
          ),
        )}
      </pre>
      <pre className={pre}>
        {parts.map((p, i) =>
          p.removed ? null : (
            <span key={i} className={p.added ? "bg-green-500/25" : undefined}>
              {p.value}
            </span>
          ),
        )}
      </pre>
    </div>
  );
}
