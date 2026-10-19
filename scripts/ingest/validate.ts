/**
 * Validates an ingest proposals.json against its context.json.
 * Run by the /ingest-chapter skill; exits 1 and lists every failure.
 *
 *   npx tsx scripts/ingest/validate.ts .ingest/<chapter>/context.json .ingest/<chapter>/proposals.json [--links]
 *
 * Every `[[page:slug]]` must be the slug of an indexed page, or the slug a proposed new page will get.
 * `--links` prints each distinct link with the page it resolves to.
 * Offline (no database): links to pages outside the spoiler-filtered index fail here, but
 * /admin/ingestion resolves them against the pages that exist in the database. Uses the same
 * checks as /admin/ingestion (`src/admin/ingestion/core.ts`).
 */
import { readFileSync } from "node:fs";
import { validateProposals } from "@/admin/ingestion/core";
import type { IngestItem, LinkTarget } from "@/admin/ingestion/types";

const showLinks = process.argv.includes("--links");
const [contextPath, proposalsPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!contextPath || !proposalsPath) {
  console.error("usage: npx tsx scripts/ingest/validate.ts <context.json> <proposals.json> [--links]");
  process.exit(2);
}

let proposals: unknown;
try {
  proposals = JSON.parse(readFileSync(proposalsPath, "utf8"));
} catch (err) {
  console.error(`FAIL proposals.json is not valid JSON: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const { errors, items } = validateProposals(readFileSync(contextPath, "utf8"), proposals);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  console.error(`\n${errors.length} failure(s).`);
  process.exit(1);
}
const count = (k: IngestItem["kind"]) => items.filter((i) => i.kind === k).length;
console.log(`OK synopsis=${count("synopsis")} newPages=${count("new_page")} updates=${count("page_update")}`);
if (showLinks) {
  const seen = new Map<string, LinkTarget | null>();
  for (const it of items) for (const l of it.links) if (!seen.has(l.name)) seen.set(l.name, l.target);
  for (const [name, t] of seen) console.log(`  [[page:${name}]] -> ${!t ? "unresolved" : "tempId" in t ? `new page ${t.tempId}` : `page #${t.pageId}`}`);
}
