"use server";

import type { DbEnv } from "@/db/index";
import { requireSiteAdmin } from "@/lib/auth-guard";
import { getAdminDb, getAdminDbEnv } from "@/lib/admin-db";
import {
  applyNewPage,
  applyPageUpdate,
  applySynopsis,
} from "@/admin/ingestion/apply";
import {
  appendDecision,
  batchVersion,
  effectiveDecision,
} from "@/admin/ingestion/batches";
import { linkedNewPages, loadIngestReview } from "@/admin/ingestion/review";
import type {
  IngestDecision,
  NewPageProposal,
  PageUpdateProposal,
} from "@/admin/ingestion/types";

/** Approve/reject request from the review UI. */
type DecideInput = {
  /** Batch directory name under `.ingest/`. */
  chapter: string;
  /** Item key (`synopsis`, `new:<tempId>`, `update:<pageId>`). */
  key: string;
  /** Admin-edited body; omitted to use the proposal as is. */
  finalText?: string;
  /** Admin-edited infobox; omitted to use the proposal as is. */
  finalInfobox?: string;
  /** Record the decision without writing to the database. */
  dryRun: boolean;
  /** Database the admin reviewed against; refuses if the target was switched since. */
  expectedEnv: DbEnv;
};

async function decide(
  input: DecideInput,
  action: "approve" | "reject",
): Promise<{ error?: string }> {
  await requireSiteAdmin();
  const { chapter, key, dryRun, expectedEnv } = input;
  const env = await getAdminDbEnv();
  if (env !== expectedEnv)
    return {
      error: `Target DB changed to ${env.toUpperCase()}; reload and review again.`,
    };
  const db = await getAdminDb();

  try {
    const review = await loadIngestReview(chapter, db);
    const { context, proposals, items, decisions } = review;
    if (context.dbEnv && context.dbEnv !== env)
      return {
        error: `context.json was exported from the ${context.dbEnv.toUpperCase()} database; switch the admin target to it.`,
      };
    const item = items.find((i) => i.key === key);
    if (!item || !proposals) return { error: `Unknown proposal ${key}` };
    if (effectiveDecision(decisions, key, dryRun)?.action === "approve")
      return { error: "Already approved." };

    const approve = action === "approve";
    const finalText = approve ? (input.finalText ?? item.body) : null;
    const finalInfobox = approve ? (input.finalInfobox ?? item.infobox) : null;
    // An infobox-only update leaves the body alone (unless the admin edited it).
    const writesBody =
      item.kind !== "page_update" ||
      item.bodyChanged ||
      input.finalText !== undefined;
    /** tempId -> page id of a new page approved in this mode. */
    const createdPageId = (tempId: string) =>
      effectiveDecision(decisions, `new:${tempId}`, dryRun)?.createdPageId;
    let newPageId: number | undefined;

    if (approve) {
      if (item.editErrors.length && input.finalText === undefined)
        return {
          error:
            "Edit operations did not apply cleanly - edit the text manually before approving.",
        };
      if (writesBody && !finalText!.trim()) return { error: "Content is empty." };

      // New pages must exist before anything that links to them or uses them as a parent.
      const deps = linkedNewPages(proposals, `${finalText!}\n${finalInfobox ?? ""}`);
      const own = item.kind === "new_page" ? (item.proposal as NewPageProposal) : null;
      if (own && typeof own.parentPageId === "string") deps.push(own.parentPageId);
      const missing = deps.filter(
        (t) => t !== own?.tempId && createdPageId(t) === undefined,
      );
      if (missing.length)
        return {
          error: `Approve these new pages first (or remove the links): ${missing.join(", ")}`,
        };

      const target = {
        db,
        serialId: context.serial.id,
        chapterId: context.chapter.id,
        chapterIdx: context.chapter.idx,
        dryRun,
      };
      if (item.kind === "synopsis") await applySynopsis(target, finalText!);
      else if (item.kind === "page_update")
        await applyPageUpdate(
          target,
          (item.proposal as PageUpdateProposal).pageId,
          { content: item.base!, infobox: item.infoboxBase ?? "" },
          { content: writesBody ? finalText! : null, infobox: finalInfobox },
        );
      else {
        const parentPageId =
          typeof own!.parentPageId === "number"
            ? own!.parentPageId
            : typeof own!.parentPageId === "string"
              ? createdPageId(own!.parentPageId)!
              : context.homePageId;
        if (!parentPageId)
          return { error: "No parent page (and the serial has no home page)." };
        newPageId = await applyNewPage(target, {
          title: own!.title,
          parentPageId,
          content: finalText!,
          infobox: finalInfobox,
        });
      }
    }

    const decision: IngestDecision = {
      key: item.key,
      kind: item.kind,
      action,
      proposal: item.proposal,
      finalText,
      finalInfobox,
      edited:
        (finalText !== null && finalText !== item.body) ||
        (finalInfobox !== null && finalInfobox !== item.infobox),
      createdPageId: newPageId,
      dryRun,
      dbEnv: env,
      promptVersion: proposals.promptVersion,
      decidedAt: new Date().toISOString(),
    };
    appendDecision(review.dir, decision);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Applies one proposal (optionally admin-edited) at the batch's chapter in
 * its own transaction and logs it to `decisions.json`. Errors starting with
 * "Stale (409)" mean the page changed since export.
 */
export async function approveProposal(
  input: DecideInput,
): Promise<{ error?: string }> {
  return decide(input, "approve");
}

/** Logs a rejection to `decisions.json`; a rejected proposal can still be approved later. */
export async function rejectProposal(
  input: DecideInput,
): Promise<{ error?: string }> {
  return decide(input, "reject");
}

/** Change marker of a batch's files; the review page polls it to hot-reload. */
export async function getBatchVersion(chapter: string): Promise<number> {
  await requireSiteAdmin();
  return batchVersion(chapter);
}
