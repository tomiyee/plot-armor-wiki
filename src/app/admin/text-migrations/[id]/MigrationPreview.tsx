"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { TextDiff } from "@/components/TextDiff";
import { useServerAction } from "@/hooks/useServerAction";
import type { TextMigrationPreviewRow } from "@/admin/text-migrations/types";
import { applyMigration } from "../actions";

type MigrationPreviewProps = {
  /** Registry id of the migration being previewed. */
  migrationId: string;
  /** Current page of changed rows. */
  rows: TextMigrationPreviewRow[];
  /** Whether the migration is already recorded as applied. */
  applied: boolean;
  /** Total changed rows across all pages (shown in the apply confirmation). */
  total: number;
};

/**
 * Client half of the migration detail page: raw-diff / rendered toggle and
 * the apply button.
 */
export function MigrationPreview(props: MigrationPreviewProps) {
  const { migrationId, rows, applied, total } = props;
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { runAsync, isPending } = useServerAction();

  function onApply() {
    if (!window.confirm(`Rewrite ${total} rows in place? Backups are stored.`))
      return;
    setError(null);
    runAsync(() => applyMigration(migrationId), undefined, setError);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center">
        <Button variant="outline" size="sm" onClick={() => setRendered((r) => !r)}>
          {rendered ? "Show raw diff" : "Show rendered"}
        </Button>
        {!applied && (
          <Button size="sm" variant="destructive" disabled={isPending || total === 0} onClick={onApply}>
            {isPending ? "Applying…" : "Apply migration"}
          </Button>
        )}
        {error && <Text className="text-destructive text-sm">{error}</Text>}
      </div>

      {rows.length === 0 && <Text muted>No rows would change.</Text>}

      {rows.map((row) => (
        <div key={`${row.table}:${JSON.stringify(row.pk)}`} className="flex flex-col gap-1">
          <Text variant="label" className="font-mono text-xs">
            {row.serialSlug} / {row.table} {JSON.stringify(row.pk)}
            {row.nonIdempotent && " ⚠️ non-idempotent"}
          </Text>
          {rendered ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="border rounded-md p-3 min-w-0">
                <MarkdownRenderer serialSlug={row.serialSlug} sm>{row.before}</MarkdownRenderer>
              </div>
              <div className="border rounded-md p-3 min-w-0">
                <MarkdownRenderer serialSlug={row.serialSlug} sm>{row.after}</MarkdownRenderer>
              </div>
            </div>
          ) : (
            <TextDiff before={row.before} after={row.after} />
          )}
        </div>
      ))}
    </div>
  );
}
