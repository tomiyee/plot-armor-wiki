/**
 * Builds the review state of one ingest batch: proposals validated against
 * the context and the live pages of the admin-selected database.
 */
import type { Db } from "@/db/index";
import { getSerialPages } from "@/data/pages/queries";
import { readIngestBatch } from "./batches";
import type { IngestBatchFiles } from "./batches";
import { extractPageLinks, pageSlug, validateProposals } from "./core";
import type { IngestItem, LivePage, Proposals } from "./types";

/** A batch with its validated review items. */
export type IngestReview = IngestBatchFiles & {
  /** Parsed proposals.json (not shape-checked: see `validationErrors`); null when missing or unparsable. */
  proposals: Proposals | null;
  validationErrors: string[];
  items: IngestItem[];
  livePages: (LivePage & { name: string })[];
};

/** Reads a batch from disk and validates it against `db`. */
export async function loadIngestReview(chapter: string, db: Db): Promise<IngestReview> {
  const files = readIngestBatch(chapter);
  const livePages = await getSerialPages(files.context.serial.id, db);
  if (files.proposals === null)
    return { ...files, proposals: null, validationErrors: files.proposalsError ? [files.proposalsError] : [], items: [], livePages };
  const { errors, items } = validateProposals(files.contextRaw, files.proposals, livePages);
  return {
    ...files,
    proposals: files.proposals as Proposals,
    validationErrors: errors,
    items,
    livePages,
  };
}

/** tempIds of the proposed new pages that `text` links to (by the slug their title will get). */
export function linkedNewPages(proposals: Proposals, text: string): string[] {
  const byKey = new Map<string, string>();
  for (const n of proposals.newPages ?? []) byKey.set(pageSlug(n.title), n.tempId);
  return [...new Set(extractPageLinks(text).map((l) => byKey.get(l)).filter((t): t is string => !!t))];
}
