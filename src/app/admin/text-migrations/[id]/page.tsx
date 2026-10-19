import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { getTextMigration } from "@/admin/text-migrations/registry";
import {
  fetchTextMigrationApplied,
  hasTextMigrationTables,
} from "@/data/admin/queries";
import { MissingTablesNotice } from "../MissingTablesNotice";
import { getAdminDb, getAdminDbEnv } from "@/lib/admin-db";
import { previewMigration } from "../actions";
import { MigrationPreview } from "./MigrationPreview";

const PAGE_SIZE = 20;

type TextMigrationDetailPageProps = {
  /** Route params. */
  params: Promise<{ id: string }>;
  /** `?page=N` (1-based) selects the preview page. */
  searchParams: Promise<{ page?: string }>;
};

/** Paginated before/after preview of one text migration, with apply control. */
export default async function TextMigrationDetailPage(
  props: TextMigrationDetailPageProps,
) {
  const { id } = await props.params;
  const { page: pageParam } = await props.searchParams;
  const migration = getTextMigration(id);
  if (!migration) notFound();

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const [env, db] = await Promise.all([getAdminDbEnv(), getAdminDb()]);
  if (!(await hasTextMigrationTables(db))) return <MissingTablesNotice />;
  const [applied, preview] = await Promise.all([
    fetchTextMigrationApplied(db, id),
    previewMigration(id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);
  if ("error" in preview) throw new Error(preview.error);
  const pageCount = Math.max(1, Math.ceil(preview.total / PAGE_SIZE));

  return (
    <PageContainer className="max-w-6xl py-12 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/admin/text-migrations"
          className="text-sm text-primary hover:underline"
        >
          ← All migrations
        </Link>
        <Text variant="h1" className="font-mono text-2xl">
          {migration.id}
        </Text>
        <Text muted>{migration.description}</Text>
        <Text variant="label" muted>
          Scope: {migration.serialSlug ?? "all serials"} · Target DB:{" "}
          {env.toUpperCase()}
        </Text>
        <Text variant="label">
          {applied
            ? `Applied ${applied.appliedAt.toISOString()} (${applied.rowsChanged} rows)`
            : `Not applied - ${preview.total} rows would change`}
          {preview.nonIdempotentCount > 0 &&
            ` - ⚠️ ${preview.nonIdempotentCount} non-idempotent rows`}
        </Text>
      </div>

      <MigrationPreview
        migrationId={migration.id}
        rows={preview.rows}
        applied={!!applied}
        total={preview.total}
        env={env}
      />

      {pageCount > 1 && (
        <nav className="flex gap-4 items-center">
          {page > 1 && (
            <Link
              href={`?page=${page - 1}`}
              className="text-primary hover:underline"
            >
              Previous
            </Link>
          )}
          <Text variant="label" muted>
            Page {page} of {pageCount}
          </Text>
          {page < pageCount && (
            <Link
              href={`?page=${page + 1}`}
              className="text-primary hover:underline"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </PageContainer>
  );
}
