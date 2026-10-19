"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { TextDiff } from "@/components/TextDiff";
import { useServerAction } from "@/hooks/useServerAction";
import type { DbEnv } from "@/db/index";
import type {
  IngestDecision,
  IngestItem,
  NewPageProposal,
  PageUpdateProposal,
} from "@/admin/ingestion/types";
import { approveProposal, getBatchVersion, rejectProposal } from "../actions";

const WikiLinkMDEditor = dynamic(
  () => import("@/components/MDEditor").then((m) => m.WikiLinkMDEditor),
  { ssr: false },
);

/** A review item plus its decision state, computed on the server. */
export type ReviewItemView = IngestItem & {
  decision: IngestDecision | null;
  /** tempIds of proposed new pages this item links to. */
  newPageLinks: string[];
  /** Linked new pages that were rejected (the links would be broken). */
  rejectedNewLinks: string[];
};

type IngestReviewListProps = {
  /** Batch directory name under `.ingest/`. */
  chapter: string;
  /** Serial slug, so previews resolve wiki links like the wiki does. */
  serialSlug: string;
  /** Chapter idx of the batch; caps the editor's ref picker. */
  chapterIdx: number;
  /** Every proposal of the batch. */
  items: ReviewItemView[];
  /** Validator failures for the whole batch. */
  validationErrors: string[];
  /** Pages offered by the editor's `[[` autocomplete. */
  wikiPages: { name: string; slug: string }[];
  /** Whether decisions are recorded without database writes. */
  dryRun: boolean;
  /** Database the page was rendered against; actions refuse if it changed. */
  env: DbEnv;
};

/** Edit buffer for one item: body and infobox drafts. */
type Draft = { body: string; infobox: string | null };

const POLL_MS = 2000;

/**
 * Client half of the ingest review page: per-proposal cards with diff /
 * rendered toggle, inline editing, and approve / reject. Polls the batch's
 * files so a proposals.json rewritten by the skill shows up live; open
 * edit drafts survive the refresh.
 */
export function IngestReviewList(props: IngestReviewListProps) {
  const { chapter, items, validationErrors, dryRun, env } = props;
  const router = useRouter();
  const { runAsync, isPending } = useServerAction();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rendered, setRendered] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const version = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const v = await getBatchVersion(chapter);
        if (version.current !== null && v !== version.current) router.refresh();
        version.current = v;
      } catch {
        // Batch removed or session expired; keep showing the last state.
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [chapter, router]);

  function decide(it: ReviewItemView, action: "approve" | "reject") {
    const draft = drafts[it.key];
    const input = {
      chapter,
      key: it.key,
      dryRun,
      expectedEnv: env,
      ...(draft && {
        ...((draft.body !== it.body || it.editErrors.length > 0) && {
          finalText: draft.body,
        }),
        ...(draft.infobox !== null && { finalInfobox: draft.infobox }),
      }),
    };
    setErrors(({ [it.key]: _, ...rest }) => rest);
    return new Promise<boolean>((resolve) =>
      runAsync(
        () => (action === "approve" ? approveProposal(input) : rejectProposal(input)),
        () => {
          setDrafts(({ [it.key]: _, ...rest }) => rest);
          resolve(true);
        },
        (error) => {
          setErrors((e) => ({ ...e, [it.key]: error }));
          resolve(false);
        },
      ),
    );
  }

  async function approveMinor() {
    const ks = items.filter(
      (i) =>
        i.kind === "page_update" &&
        (i.proposal as PageUpdateProposal).importance === "minor" &&
        i.decision?.action !== "approve" &&
        !i.editErrors.length &&
        i.citations.every((c) => c.verified),
    );
    if (!window.confirm(`Approve ${ks.length} verified minor update(s)?`)) return;
    for (const it of ks) if (!(await decide(it, "approve"))) break;
  }

  const by = (k: IngestItem["kind"]) => items.filter((i) => i.kind === k);
  const card = (it: ReviewItemView) => (
    <ReviewCard
      key={it.key}
      {...props}
      item={it}
      draft={drafts[it.key]}
      onDraft={(d) =>
        setDrafts(({ [it.key]: _, ...rest }) => (d ? { ...rest, [it.key]: d } : rest))
      }
      rendered={!!rendered[it.key]}
      onToggleRendered={() => setRendered((r) => ({ ...r, [it.key]: !r[it.key] }))}
      error={errors[it.key]}
      pending={isPending}
      onDecide={(a) => void decide(it, a)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3 items-center">
        <Link
          href={dryRun ? "?" : "?dryRun=1"}
          className="text-sm text-primary hover:underline"
        >
          {dryRun ? "Turn off dry run" : "Turn on dry run"}
        </Link>
        <Text variant="label" className={dryRun ? "font-bold" : undefined}>
          {dryRun
            ? "DRY RUN - decisions are logged, nothing is written."
            : `Approvals write to the ${env.toUpperCase()} database.`}
        </Text>
      </div>

      {validationErrors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          {validationErrors.map((e, i) => (
            <Text key={i} className="text-sm">
              {e}
            </Text>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <Text variant="h2">New pages</Text>
        <Text muted className="text-sm">
          Approve new pages first, top to bottom (each is listed after the new
          pages it needs). Anything that links to one is blocked until it exists.
        </Text>
        {by("new_page").map(card)}
        {by("new_page").length === 0 && <Text muted>None</Text>}
      </section>

      <section className="flex flex-col gap-3">
        <Text variant="h2">Synopsis</Text>
        {by("synopsis").map(card)}
        {by("synopsis").length === 0 && <Text muted>None</Text>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex gap-3 items-center">
          <Text variant="h2">Page updates</Text>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void approveMinor()}
          >
            Approve all verified minor updates
          </Button>
        </div>
        {by("page_update").map(card)}
        {by("page_update").length === 0 && <Text muted>None</Text>}
      </section>
    </div>
  );
}

type ReviewCardProps = IngestReviewListProps & {
  /** Proposal shown in this card. */
  item: ReviewItemView;
  /** Open edit draft, if the admin is editing. */
  draft: Draft | undefined;
  /** Opens (draft) or discards (undefined) the edit draft. */
  onDraft: (draft: Draft | undefined) => void;
  /** Show rendered markdown instead of the raw diff. */
  rendered: boolean;
  /** Flips `rendered`. */
  onToggleRendered: () => void;
  /** Last action error for this item. */
  error: string | undefined;
  /** A Server Action is running. */
  pending: boolean;
  /** Approves or rejects this item. */
  onDecide: (action: "approve" | "reject") => void;
};

function ReviewCard(props: ReviewCardProps) {
  const {
    item: it,
    draft,
    onDraft,
    rendered,
    onToggleRendered,
    error,
    pending,
    onDecide,
    serialSlug,
    chapterIdx,
    wikiPages,
  } = props;
  const d = it.decision;
  const editing = draft !== undefined;
  const showBody = !(it.kind === "page_update" && !it.bodyChanged && !editing);
  const diffBase = it.kind === "new_page" ? null : (it.diffBase ?? it.base ?? "");
  const infoboxDiffBase = it.infoboxDiffBase ?? it.infoboxBase;

  let head: string;
  let meta: string | null = null;
  if (it.kind === "synopsis") head = "Synopsis";
  else if (it.kind === "new_page") {
    const p = it.proposal as NewPageProposal;
    head = `New page: ${p.title}`;
    meta = `tempId ${p.tempId} · aliases: ${p.aliases.join(", ") || "none"} · parent: ${p.parentPageId ?? "home page"}`;
  } else {
    const p = it.proposal as PageUpdateProposal;
    head = `${it.title} (#${p.pageId}, ${p.importance})`;
  }
  const changeSummary = "changeSummary" in it.proposal ? it.proposal.changeSummary : null;

  const editor = (value: string, onChange: (v: string) => void, height: number) => (
    <WikiLinkMDEditor
      value={value}
      onChange={(v) => onChange(v ?? "")}
      height={height}
      wikiPages={wikiPages}
      serialSlug={serialSlug}
      maxChapterIdx={chapterIdx}
    />
  );
  const preview = (md: string, sm = false) => (
    <div className="border rounded-md p-3 min-w-0 max-h-[32rem] overflow-auto">
      <MarkdownRenderer serialSlug={serialSlug} sm={sm}>
        {md}
      </MarkdownRenderer>
    </div>
  );

  const border =
    d?.action === "approve"
      ? "border-l-4 border-l-green-600"
      : d?.action === "reject"
        ? "border-l-4 border-l-red-600 opacity-60"
        : "";

  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-2 ${border}`}>
      <Text variant="h4">{head}</Text>
      {meta && (
        <Text muted className="text-xs font-mono">
          {meta}
        </Text>
      )}
      {changeSummary && <Text muted className="text-sm">{changeSummary}</Text>}

      {it.editErrors.map((e) => (
        <Text key={e} className="text-sm text-amber-700 dark:text-amber-400">
          Needs manual edit: {e}
        </Text>
      ))}
      {it.links
        .filter((l) => !l.target)
        .map((l) => (
          <Text key={l.name} className="text-sm text-amber-700 dark:text-amber-400">
            Unresolved link [[page:{l.name}]]
          </Text>
        ))}
      {it.rejectedNewLinks.length > 0 && (
        <Text className="text-sm text-amber-700 dark:text-amber-400">
          Links to rejected new page(s): {it.rejectedNewLinks.join(", ")}
        </Text>
      )}

      {!editing && (diffBase !== null || it.infobox !== null) && (
        <div>
          <Button size="sm" variant="outline" onClick={onToggleRendered}>
            {rendered ? "Show diff" : "Show rendered"}
          </Button>
        </div>
      )}

      {showBody &&
        (editing
          ? editor(draft.body, (body) => onDraft({ ...draft, body }), 400)
          : diffBase !== null && !rendered
            ? <TextDiff before={diffBase} after={it.body} />
            : diffBase !== null
              ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {preview(diffBase)}
                    {preview(it.body)}
                  </div>
                )
              : preview(it.body))}

      {it.infobox !== null && (
        <div className="flex flex-col gap-1">
          <Text variant="label" muted>
            Infobox {infoboxDiffBase ? "(changed)" : "(new)"}
          </Text>
          {editing
            ? editor(draft.infobox ?? it.infobox, (infobox) => onDraft({ ...draft, infobox }), 240)
            : infoboxDiffBase && !rendered
              ? <TextDiff before={infoboxDiffBase} after={it.infobox} />
              : (
                  <div className="max-w-sm">{preview(it.infobox, true)}</div>
                )}
        </div>
      )}

      <ul className="flex flex-col gap-1 text-sm">
        {it.citations.map((c, i) => (
          <li key={i}>
            {c.verified ? "✅" : "⚠️"} “{c.quote}”
            {c.note && <Text as="span" muted> - {c.note}</Text>}
          </li>
        ))}
      </ul>

      {d?.action === "approve" ? (
        <Text variant="label" muted>
          Approved{d.edited && " (edited)"}
          {d.dryRun && " [dry-run]"}
          {d.createdPageId !== undefined && d.createdPageId > 0 && ` as page #${d.createdPageId}`}
        </Text>
      ) : (
        <div className="flex gap-2 items-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onDraft(editing ? undefined : { body: it.body, infobox: it.infobox })
            }
          >
            {editing ? "Cancel edit" : "Edit"}
          </Button>
          <Button size="sm" disabled={pending} onClick={() => onDecide("approve")}>
            Approve
          </Button>
          {d?.action === "reject" ? (
            <Text variant="label" muted>
              Rejected{d.dryRun && " [dry-run]"}
            </Text>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => onDecide("reject")}
            >
              Reject
            </Button>
          )}
        </div>
      )}
      {error && <Text className="text-destructive text-sm">{error}</Text>}
    </div>
  );
}
