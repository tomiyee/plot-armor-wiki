#!/usr/bin/env node
/**
 * Validates an ingest proposals.json against its context.json.
 * Run by the /ingest-chapter skill; exits 1 and lists every failure.
 *
 *   node scripts/ingest/validate.mjs .ingest/<chapter>/context.json .ingest/<chapter>/proposals.json [--links]
 *
 * Every `[[page:slug]]` must be the slug of an indexed page, or the slug a proposed new page will get.
 * `--links` prints each distinct link with the page it resolves to.
 * Offline: links to pages outside the spoiler-filtered index fail here, but the review tool
 * resolves them against the pages that exist in the database.
 */
import { readFileSync } from "node:fs";
import { validateProposals } from "./lib/core.mjs";

const showLinks = process.argv.includes("--links");
const [contextPath, proposalsPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!contextPath || !proposalsPath) {
  console.error("usage: node scripts/ingest/validate.mjs <context.json> <proposals.json> [--links]");
  process.exit(2);
}

let proposals;
try {
  proposals = JSON.parse(readFileSync(proposalsPath, "utf8"));
} catch (err) {
  console.error(`FAIL proposals.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

const { errors, items } = validateProposals(readFileSync(contextPath, "utf8"), proposals);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  console.error(`\n${errors.length} failure(s).`);
  process.exit(1);
}
const count = (k) => items.filter((i) => i.kind === k).length;
console.log(`OK synopsis=${count("synopsis")} newPages=${count("new_page")} updates=${count("page_update")}`);
if (showLinks) {
  const seen = new Map();
  for (const it of items) for (const l of it.links ?? []) if (!seen.has(l.name)) seen.set(l.name, l.target);
  for (const [name, t] of seen) console.log(`  [[page:${name}]] -> ${t.tempId ? `new page ${t.tempId}` : `page #${t.pageId}`}`);
}
