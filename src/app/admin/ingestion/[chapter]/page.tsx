import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { getAdminDb, getAdminDbEnv } from "@/lib/admin-db";
import { effectiveDecision } from "@/admin/ingestion/batches";
import { pageSlug } from "@/admin/ingestion/core";
import { linkedNewPages, loadIngestReview } from "@/admin/ingestion/review";
import type { IngestReview } from "@/admin/ingestion/review";
import { IngestReviewList } from "./IngestReviewList";
import type { ReviewItemView } from "./IngestReviewList";

type IngestBatchPageProps = {
  /** Route params: the batch directory name under `.ingest/`. */
  params: Promise<{ chapter: string }>;
  /** `?dryRun=1` records decisions without writing to the database. */
  searchParams: Promise<{ dryRun?: string }>;
};

/** Review page for one ingest batch: every proposal with diff, preview and approve/reject. */
export default async function IngestBatchPage(props: IngestBatchPageProps) {
  const { chapter: rawChapter } = await props.params;
  const { dryRun: dryRunParam } = await props.searchParams;
  const chapter = decodeURIComponent(rawChapter);
  const dryRun = dryRunParam === "1";
  const [env, db] = await Promise.all([getAdminDbEnv(), getAdminDb()]);

  let review: IngestReview;
  try {
    review = await loadIngestReview(chapter, db);
  } catch {
    notFound();
  }
  const { context, proposals, items, decisions, validationErrors, livePages } =
    review;

  const views: ReviewItemView[] = items.map((it) => {
    const newPageLinks = proposals
      ? linkedNewPages(proposals, `${it.body}\n${it.infobox ?? ""}`)
      : [];
    return {
      ...it,
      decision: effectiveDecision(decisions, it.key, dryRun) ?? null,
      newPageLinks,
      rejectedNewLinks: newPageLinks.filter(
        (t) =>
          effectiveDecision(decisions, `new:${t}`, dryRun)?.action === "reject",
      ),
    };
  });
  // The editor's [[ autocomplete offers existing pages plus the proposed ones.
  const wikiPages = [
    ...livePages.map((p) => ({ name: p.name, slug: p.slug })),
    ...(proposals?.newPages ?? []).map((n) => ({
      name: n.title,
      slug: pageSlug(n.title),
    })),
  ];
  const envMismatch = !!context.dbEnv && context.dbEnv !== env;

  return (
    <PageContainer className="max-w-6xl py-12 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/admin/ingestion"
          className="text-sm text-primary hover:underline"
        >
          ← All batches
        </Link>
        <Text variant="h1">
          {context.serial.name} - {context.chapter.displayName}
        </Text>
        <Text variant="label" muted>
          <a
            href={context.source.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {context.source.title}
          </a>
          {proposals && <> · prompt {proposals.promptVersion}</>} · Target DB:{" "}
          {env.toUpperCase()}
        </Text>
        {envMismatch && (
          <Text className="text-destructive">
            context.json was exported from the{" "}
            {context.dbEnv!.toUpperCase()} database. Switch the target DB to it
            before approving.
          </Text>
        )}
      </div>

      {!proposals && validationErrors.length === 0 ? (
        <Text muted>
          No proposals.json yet. Run{" "}
          <code>/ingest-chapter .ingest/{chapter}/context.json</code> in Claude
          Code; this page reloads when the file appears.
        </Text>
      ) : null}

      <IngestReviewList
        chapter={chapter}
        serialSlug={context.serial.slug}
        chapterIdx={context.chapter.idx}
        items={views}
        validationErrors={validationErrors}
        wikiPages={wikiPages}
        dryRun={dryRun}
        env={env}
      />
    </PageContainer>
  );
}
