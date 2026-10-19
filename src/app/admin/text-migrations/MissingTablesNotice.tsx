import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { getAdminDbEnv } from "@/lib/admin-db";

/**
 * Shown instead of the text-migration pages when the selected DB lacks the
 * ledger/backup tables, typically PROD before drizzle migration `0007` is
 * applied there.
 */
export async function MissingTablesNotice() {
  const env = await getAdminDbEnv();
  return (
    <PageContainer className="max-w-3xl py-12 flex flex-col gap-3">
      <Text variant="h1">Text migrations unavailable</Text>
      <Text>
        The {env.toUpperCase()} database has no{" "}
        <code>text_migrations_applied</code> table yet. Apply the pending
        drizzle migrations to it first:
      </Text>
      <pre className="rounded-md bg-muted p-3 text-sm">
        DB_ENV={env} npx drizzle-kit migrate
      </pre>
    </PageContainer>
  );
}
