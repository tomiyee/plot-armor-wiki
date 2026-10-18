"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { TextDiff } from "@/components/TextDiff";
import { useServerAction } from "@/hooks/useServerAction";
import type { DbEnv } from "@/db/index";
import type { TextMigrationPreviewRow } from "@/admin/text-migrations/types";
import { applyMigration, undoMigration } from "../actions";

type MigrationPreviewProps = {
  /** Registry id of the migration being previewed. */
  migrationId: string;
  /** Current page of changed rows. */
  rows: TextMigrationPreviewRow[];
  /** Whether the migration is already recorded as applied. */
  applied: boolean;
  /** Total changed rows across all pages (shown in the apply confirmation). */
  total: number;
  /** Database the preview was computed against; apply refuses if it changed. */
  env: DbEnv;
};

type LazyRowProps = {
  /** Heavy content, mounted once the row nears the viewport. */
  children: ReactNode;
};

// Diffs and MarkdownRenderer are expensive; mount each row only when it comes
// within ~1 screen of the viewport, and keep it mounted afterwards so
// scrolling back doesn't re-render.
function LazyRow(props: LazyRowProps) {
  const { children } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <div
      ref={ref}
      className={
        visible ? undefined : "min-h-32 rounded-md border border-dashed"
      }
    >
      {visible && children}
    </div>
  );
}

/**
 * Client half of the migration detail page: raw-diff / rendered toggle and
 * the apply / undo buttons.
 */
export function MigrationPreview(props: MigrationPreviewProps) {
  const { migrationId, rows, applied, total, env } = props;
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { runAsync, isPending } = useServerAction();

  function onApply() {
    if (
      !window.confirm(
        `Rewrite ${total} rows in place on the ${env.toUpperCase()} database? Backups are stored.`,
      )
    )
      return;
    setError(null);
    runAsync(() => applyMigration(migrationId, env), undefined, setError);
  }

  function onUndo() {
    if (
      !window.confirm(
        `Restore the pre-migration text from backups on the ${env.toUpperCase()} database?`,
      )
    )
      return;
    setError(null);
    runAsync(() => undoMigration(migrationId, env), undefined, setError);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRendered((r) => !r)}
        >
          {rendered ? "Show raw diff" : "Show rendered"}
        </Button>
        {!applied && (
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending || total === 0}
            onClick={onApply}
          >
            {isPending ? "Applying…" : "Apply migration"}
          </Button>
        )}
        {applied && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onUndo}
          >
            {isPending ? "Undoing…" : "Undo migration"}
          </Button>
        )}
        {error && <Text className="text-destructive text-sm">{error}</Text>}
      </div>

      {rows.length === 0 && <Text muted>No rows would change.</Text>}

      {rows.map((row) => (
        <div
          key={`${row.table}:${JSON.stringify(row.pk)}`}
          className="flex flex-col gap-1"
        >
          <Text variant="label">
            {row.serialTitle}
            {row.pageTitle !== null && <> / {row.pageTitle}</>} /{" "}
            {row.chapterName}
            {row.nonIdempotent && " ⚠️ non-idempotent"}
          </Text>
          <Text muted className="font-mono text-xs">
            {row.table} · {"pageId" in row.pk && <>page {row.pk.pageId} · </>}
            chapter {row.pk.chapterId}
          </Text>
          <LazyRow>
            {rendered ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="border rounded-md p-3 min-w-0">
                  <MarkdownRenderer serialSlug={row.serialSlug} sm>
                    {row.before}
                  </MarkdownRenderer>
                </div>
                <div className="border rounded-md p-3 min-w-0">
                  <MarkdownRenderer serialSlug={row.serialSlug} sm>
                    {row.after}
                  </MarkdownRenderer>
                </div>
              </div>
            ) : (
              <TextDiff before={row.before} after={row.after} />
            )}
          </LazyRow>
        </div>
      ))}
    </div>
  );
}
