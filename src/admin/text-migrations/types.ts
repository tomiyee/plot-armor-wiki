/** Which stored-markdown column a text migration rewrites. */
export type TextMigrationTarget =
  "sectionContent" | "infoboxValue" | "synopsis";

/**
 * A one-shot rewrite of stored markdown representation (not content).
 * `transform` must be pure; preview flags rows where it is not idempotent.
 */
export type TextMigration = {
  /** Stable, date-prefixed, e.g. "2026-10-18-ref-quote-encoding". Never rename once applied. */
  id: string;
  description: string;
  targets: TextMigrationTarget[];
  /** When set, only rows belonging to this serial (by slug) are migrated. Omit for all serials. */
  serialSlug?: string;
  transform: (old: string) => string;
};

/** Primary key of a migrated row, matching the target table's PK columns. */
export type TextMigrationRowPk =
  { pageId: number; chapterId: number } | { chapterId: number };

/** One row a migration would change, as returned by `previewMigration`. */
export type TextMigrationPreviewRow = {
  table: TextMigrationTarget;
  pk: TextMigrationRowPk;
  serialSlug: string;
  serialTitle: string;
  /** Page title as of the revision's chapter; `null` for synopses. */
  pageTitle: string | null;
  chapterName: string;
  before: string;
  after: string;
  /** True when transform(after) !== after. */
  nonIdempotent: boolean;
};
