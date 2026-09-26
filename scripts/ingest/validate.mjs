#!/usr/bin/env node
/**
 * Validates an ingest proposals.json against its context.json.
 * Run by the /ingest-chapter skill; exits 1 and lists every failure.
 *
 *   node scripts/ingest/validate.mjs .ingest/<chapter>/context.json .ingest/<chapter>/proposals.json
 */
import { readFileSync } from "node:fs";
import { validateProposals } from "./lib/core.mjs";

const [contextPath, proposalsPath] = process.argv.slice(2);
if (!contextPath || !proposalsPath) {
  console.error("usage: node scripts/ingest/validate.mjs <context.json> <proposals.json>");
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
