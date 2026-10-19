/**
 * Searches the wiki as a reader sees it at a context's chapter.
 *
 *   npx tsx scripts/ingest/lookup.ts .ingest/<chapter>/ <query> [<query> ...]
 *
 * Matches each query (case-insensitive substring) against the title, older
 * titles and slug of every page visible at the context's chapter idx, so a
 * page from a later chapter is never listed. Prints one JSON line per hit;
 * `inContext` says whether context.json already has it. Add a hit with
 * add-context.ts.
 */
import "./lib/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchPageContentAtIdx } from "@/data/pages/queries";
import { firstLine, loadPageNames } from "./lib/contextPages";

const MAX_HITS = 20;

async function main() {
  const [dir, ...queries] = process.argv.slice(2);
  if (!dir || !queries.length) {
    console.error("usage: npx tsx scripts/ingest/lookup.ts <.ingest/chapter dir> <query> [<query> ...]");
    process.exit(2);
  }
  const context = JSON.parse(readFileSync(path.join(dir, "context.json"), "utf8"));
  const N: number = context.chapter.idx;
  const inContext = new Set<number>(context.pageIndex.map((p: { id: number }) => p.id));
  const { names } = await loadPageNames(context.serial.id, N);

  for (const q of queries) {
    const needle = q.toLowerCase();
    const hits = [...names]
      .filter(([, n]) => [n.title, n.slug, ...n.aliases].some((t) => t.toLowerCase().includes(needle)))
      .slice(0, MAX_HITS);
    console.log(`# ${q}: ${hits.length ? `${hits.length} hit(s)` : "no pages"}`);
    for (const [id, n] of hits) {
      const line = inContext.has(id) ? undefined : firstLine((await fetchPageContentAtIdx(id, N)).content);
      console.log(JSON.stringify({ id, slug: n.slug, title: n.title, aliases: n.aliases, inContext: inContext.has(id), ...(line !== undefined && { firstLine: line }) }));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
