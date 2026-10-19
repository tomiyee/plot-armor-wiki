import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { listIngestBatches } from "@/admin/ingestion/batches";

/** Lists the chapter batches found under `.ingest/` on this machine. */
export default function IngestionPage() {
  const batches = listIngestBatches();
  return (
    <PageContainer className="max-w-3xl py-12 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Text variant="h1">Chapter ingestion</Text>
        <Text muted>
          Batches from <code>.ingest/&lt;chapter&gt;/</code>. Create one with{" "}
          <code>scripts/ingest/export-context.ts</code>, then run{" "}
          <code>/ingest-chapter</code> in Claude Code.
        </Text>
      </div>
      {batches.length === 0 && <Text muted>No batches found.</Text>}
      <ul className="flex flex-col gap-4">
        {batches.map((b) => (
          <li key={b.chapter} className="flex flex-col gap-1">
            <Link
              href={`/admin/ingestion/${encodeURIComponent(b.chapter)}`}
              className="text-primary hover:underline"
            >
              <Text variant="h3" as="span">
                {b.serialName} - {b.chapterName}
              </Text>
            </Link>
            <Text variant="label" muted>
              {b.hasProposals ? "Proposals ready" : "No proposals yet"} ·{" "}
              {b.decisionCount} decision(s) · exported from{" "}
              {b.dbEnv?.toUpperCase() ?? "unknown DB"} · updated{" "}
              {b.updatedAt.toISOString()}
            </Text>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
