/**
 * Adds pages to an existing context.json, without re-capturing the chapter.
 *
 *   npx tsx scripts/ingest/add-context.ts .ingest/<chapter>/ <slug> [<slug> ...]
 *
 * Use it when the export missed a page (see `candidates` and lookup.ts), or
 * when a page was created after the export. The /ingest-chapter skill runs it
 * too, before it writes proposals. Each page (and
 * any missing parent) is read at the context's chapter idx, like the export.
 * Pages already in the context are refreshed. If proposals.json exists, its
 * `contextSha256` is updated so the proposals stay valid.
 */
import "./lib/env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256 } from "@/admin/ingestion/core";
import { buildContextPages, loadPageNames, withParents } from "./lib/contextPages";

type IndexEntry = { id: number; introducedAtChapter: boolean; includedByAdmin?: boolean };

async function main() {
  const [dir, ...rest] = process.argv.slice(2);
  const slugs = rest.flatMap((a) => a.split(",")).map((s) => s.trim()).filter(Boolean);
  if (!dir || !slugs.length) {
    console.error("usage: npx tsx scripts/ingest/add-context.ts <.ingest/chapter dir> <slug> [<slug> ...]");
    process.exit(2);
  }
  const contextPath = path.join(dir, "context.json");
  const context = JSON.parse(readFileSync(contextPath, "utf8"));
  const N: number = context.chapter.idx;

  const { visible, names, include } = await loadPageNames(context.serial.id, N);
  const forced = await include(slugs);
  const introducedHere = new Set(visible.filter((p) => p.introChapterId === context.chapter.id).map((p) => p.id));

  const existing = new Map<number, IndexEntry>(context.pageIndex.map((p: IndexEntry) => [p.id, p]));
  for (const p of existing.values()) if (p.includedByAdmin) forced.add(p.id);
  // Only read the new pages and their parents; keep existing entries unless re-requested.
  const seed = [...forced].filter((id) => !existing.has(id) || slugs.includes(names.get(id)!.slug));
  const parentOf = await withParents(seed, names, N);
  const skipParents = [...parentOf.keys()].filter((id) => existing.has(id) && !seed.includes(id));
  for (const id of skipParents) parentOf.delete(id);
  const built = await buildContextPages(parentOf, names, N, { introducedHere, forced });

  const replace = <T extends { id: number }>(list: T[], add: T[]) => {
    const byId = new Map(list.map((p) => [p.id, p]));
    for (const p of add) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => a.id - b.id);
  };
  context.pageIndex = replace(context.pageIndex, built.pageIndex);
  context.pages = replace(context.pages, built.pages);
  const nowIn = new Set(context.pageIndex.map((p: { id: number }) => p.id));
  if (context.candidates) context.candidates = context.candidates.filter((c: { id: number }) => !nowIn.has(c.id));
  const contextRaw = JSON.stringify(context, null, 2);
  writeFileSync(contextPath, contextRaw);

  const added = built.pageIndex.filter((p) => !existing.has(p.id)).map((p) => p.slug);
  const refreshed = built.pageIndex.filter((p) => existing.has(p.id)).map((p) => p.slug);
  console.log(`Added: ${added.join(", ") || "none"}${refreshed.length ? `; refreshed: ${refreshed.join(", ")}` : ""}`);

  const proposalsPath = path.join(dir, "proposals.json");
  if (existsSync(proposalsPath)) {
    const proposals = JSON.parse(readFileSync(proposalsPath, "utf8"));
    proposals.contextSha256 = sha256(contextRaw);
    writeFileSync(proposalsPath, `${JSON.stringify(proposals, null, 2)}\n`);
    console.log("Updated contextSha256 in proposals.json.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
