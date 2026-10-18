import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { TEXT_MIGRATIONS } from "@/admin/text-migrations/registry";
import { fetchAllTextMigrationsApplied } from "@/data/admin/queries";
import { getAdminDb } from "@/lib/admin-db";
import { MissingTablesNotice } from "./MissingTablesNotice";

/** Lists registered text migrations with their applied status on this DB. */
export default async function TextMigrationsPage() {
  const rows = await fetchAllTextMigrationsApplied(await getAdminDb());
  if (!rows) return <MissingTablesNotice />;
  const applied = new Map(rows.map((r) => [r.id, r]));
  return (
    <PageContainer className="max-w-3xl py-12 flex flex-col gap-6">
      <Text variant="h1">Text migrations</Text>
      <ul className="flex flex-col gap-4">
        {TEXT_MIGRATIONS.map((m) => {
          const a = applied.get(m.id);
          return (
            <li key={m.id} className="flex flex-col gap-1">
              <Link
                href={`/admin/text-migrations/${m.id}`}
                className="text-primary hover:underline font-mono text-sm"
              >
                {m.id}
              </Link>
              <Text muted>{m.description}</Text>
              <Text variant="label" muted>
                Scope: {m.serialSlug ?? "all serials"}
              </Text>
              <Text variant="label" muted>
                {a
                  ? `Applied ${a.appliedAt.toISOString()} (${a.rowsChanged} rows)`
                  : "Not applied"}
              </Text>
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
