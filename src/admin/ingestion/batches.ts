/**
 * Reads and writes the `.ingest/<chapter>/` working files for the
 * `/admin/ingestion` review UI. The admin routes only run locally
 * (`ADMIN_TOOLS_ENABLED`), so the batches live on the dev machine's disk.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IngestContext, IngestDecision } from "./types";

/** Root of the ingest working files, relative to the repo (gitignored). */
export const INGEST_ROOT = path.resolve(process.cwd(), ".ingest");

/**
 * Absolute directory of a batch. Throws on anything that is not a plain
 * child of `.ingest/`, so a crafted route param cannot read other files.
 */
export function batchDir(chapter: string): string {
  const dir = path.resolve(INGEST_ROOT, chapter);
  if (path.dirname(dir) !== INGEST_ROOT || !existsSync(path.join(dir, "context.json")))
    throw new Error(`No ingest batch "${chapter}" (expected .ingest/${chapter}/context.json)`);
  return dir;
}

/** Summary of one batch for the index page. */
export type IngestBatchSummary = {
  chapter: string;
  serialName: string;
  chapterName: string;
  dbEnv: IngestContext["dbEnv"];
  hasProposals: boolean;
  decisionCount: number;
  updatedAt: Date;
};

/** Every batch under `.ingest/` that has a context.json, most recently changed first. */
export function listIngestBatches(): IngestBatchSummary[] {
  if (!existsSync(INGEST_ROOT)) return [];
  const out: IngestBatchSummary[] = [];
  for (const entry of readdirSync(INGEST_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(INGEST_ROOT, entry.name);
    const ctxPath = path.join(dir, "context.json");
    if (!existsSync(ctxPath)) continue;
    try {
      const ctx = JSON.parse(readFileSync(ctxPath, "utf8")) as IngestContext;
      const propPath = path.join(dir, "proposals.json");
      const hasProposals = existsSync(propPath);
      out.push({
        chapter: entry.name,
        serialName: ctx.serial.name,
        chapterName: ctx.chapter.displayName,
        dbEnv: ctx.dbEnv,
        hasProposals,
        decisionCount: readDecisions(dir).length,
        updatedAt: statSync(hasProposals ? propPath : ctxPath).mtime,
      });
    } catch {
      // Skip half-written or malformed batches.
    }
  }
  return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** Raw files of one batch. `proposals` is null when the skill has not written them yet. */
export type IngestBatchFiles = {
  dir: string;
  contextRaw: string;
  context: IngestContext;
  proposals: unknown | null;
  /** Parse error of proposals.json (e.g. half-written), shown instead of the proposals. */
  proposalsError: string | null;
  decisions: IngestDecision[];
};

/** Loads context.json, proposals.json and decisions.json of a batch. */
export function readIngestBatch(chapter: string): IngestBatchFiles {
  const dir = batchDir(chapter);
  const contextRaw = readFileSync(path.join(dir, "context.json"), "utf8");
  const propPath = path.join(dir, "proposals.json");
  let proposals: unknown | null = null;
  let proposalsError: string | null = null;
  if (existsSync(propPath)) {
    try {
      proposals = JSON.parse(readFileSync(propPath, "utf8"));
    } catch (err) {
      proposalsError = `proposals.json is not valid JSON: ${err instanceof Error ? err.message : err}`;
    }
  }
  return {
    dir,
    contextRaw,
    context: JSON.parse(contextRaw) as IngestContext,
    proposals,
    proposalsError,
    decisions: readDecisions(dir),
  };
}

function readDecisions(dir: string): IngestDecision[] {
  const p = path.join(dir, "decisions.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as IngestDecision[]) : [];
}

/** Appends one decision to the batch's `decisions.json` audit log. */
export function appendDecision(dir: string, decision: IngestDecision): void {
  const decisions = readDecisions(dir);
  decisions.push(decision);
  writeFileSync(path.join(dir, "decisions.json"), JSON.stringify(decisions, null, 2));
}

/**
 * Change marker of a batch (latest mtime of its files). The review page polls
 * it so edits to proposals.json by the skill show up without a manual reload.
 */
export function batchVersion(chapter: string): number {
  const dir = batchDir(chapter);
  return Math.max(
    ...["context.json", "proposals.json", "decisions.json"].map((f) => {
      const p = path.join(dir, f);
      return existsSync(p) ? statSync(p).mtimeMs : 0;
    }),
  );
}

/**
 * Latest decision per key that is in effect. Real decisions are final once
 * approved; a dry-run decision only counts while dry-run mode is on, so a
 * rehearsal never blocks the real approval.
 */
export function effectiveDecision(
  decisions: IngestDecision[],
  key: string,
  dryRun: boolean,
): IngestDecision | undefined {
  return decisions.filter((d) => d.key === key && (dryRun || !d.dryRun)).at(-1);
}
