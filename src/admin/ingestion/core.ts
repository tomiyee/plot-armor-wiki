/**
 * Pure ingest validation logic shared by the CLI validator
 * (`scripts/ingest/validate.ts`, run by the /ingest-chapter skill) and the
 * `/admin/ingestion` review UI, so both judge proposals the same way.
 * No database access: callers pass in `livePages` when they have them.
 */
import { createHash } from "node:crypto";
import { CELL_LIST_RE, encodeCellItem, parseCellListBody } from "@/lib/cell-lists";
import { encodeRefQuote, REF_RE } from "@/lib/refs";
import { titleToSlug } from "@/lib/slug";
import type {
  EditOp,
  IngestCitation,
  IngestContext,
  IngestItem,
  LinkTarget,
  LivePage,
  NewPageProposal,
  Proposals,
  VerifiedCitation,
} from "./types";

export { encodeRefQuote };

/** sha256 hex of a string or buffer. */
export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Collapses all whitespace runs to single spaces and normalizes curly quotes/dashes. */
export function normalizeWs(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercased title key used for link/title resolution. */
export function titleKey(s: string): string {
  return normalizeWs(s).toLowerCase();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * Applies edit operations to `base`. On any error the failing op is skipped
 * (the review UI marks the proposal "needs manual edit").
 *
 * - append:       adds `text` to the end, separated by a blank line.
 * - insert_after: `anchor` is an exact line (e.g. a `## Heading`) that must
 *                 occur exactly once; `text` goes after that line's paragraph
 *                 block (i.e. before the next heading), or directly after a
 *                 heading line.
 * - replace:      `find` must occur exactly once.
 */
export function applyEdits(base: string, edits: EditOp[]): { body: string; errors: string[] } {
  let body = base;
  const errors: string[] = [];
  edits.forEach((e, i) => {
    if (e.op === "append") {
      body = body.trim() ? `${body.replace(/\s+$/, "")}\n\n${e.text.trim()}` : e.text.trim();
    } else if (e.op === "insert_after") {
      const lines = body.split("\n");
      const matches = lines
        .map((l, idx) => (l.trim() === e.anchor.trim() ? idx : -1))
        .filter((idx) => idx !== -1);
      if (matches.length !== 1) {
        errors.push(`edit ${i} (insert_after): anchor ${JSON.stringify(e.anchor)} matched ${matches.length} lines (need exactly 1)`);
        return;
      }
      let at = matches[0];
      if (/^#{1,6}\s/.test(lines[at].trim())) {
        // Insert at the end of the section that the heading opens.
        let j = at + 1;
        while (j < lines.length && !/^#{1,6}\s/.test(lines[j].trim())) j++;
        while (j - 1 > at && lines[j - 1].trim() === "") j--;
        at = j - 1;
      }
      lines.splice(at + 1, 0, "", e.text.trim(), "");
      body = lines.join("\n").replace(/\n{3,}/g, "\n\n");
    } else if (e.op === "replace") {
      const n = countOccurrences(body, e.find);
      if (n !== 1) {
        errors.push(`edit ${i} (replace): find ${JSON.stringify(e.find.slice(0, 80))} occurs ${n} times (need exactly 1)`);
        return;
      }
      body = body.replace(e.find, () => e.with);
    } else {
      errors.push(`edit ${i}: unknown op ${JSON.stringify((e as { op: unknown }).op)}`);
    }
  });
  return { body, errors };
}

const decodePct = (s: string) => s.replace(/%([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/**
 * Decodes the table-cell syntax that hides links and refs from a plain scan: each
 * `{{list:a;b}}` becomes its decoded items, one per line, and `\|` becomes `|`.
 */
export function expandTableCells(md: string): string {
  return md
    .replace(CELL_LIST_RE, (_m, body: string) => parseCellListBody(body).join("\n"))
    .replace(/\\\|/g, "|");
}

/** Returns the target names of every `[[page:...]]` / `[[Name]]` link and `{{ref|page:...}}` citation (not chapter links). */
export function extractPageLinks(md: string): string[] {
  const out: string[] = [];
  md = expandTableCells(md);
  for (const m of md.matchAll(/\[\[([^\]]+?)\]\]/g)) {
    let inner = m[1];
    const pipe = inner.indexOf("|");
    if (pipe !== -1) inner = inner.slice(0, pipe);
    const colon = inner.indexOf(":");
    if (colon !== -1) {
      if (inner.slice(0, colon).trim().toLowerCase() !== "page") continue;
      inner = inner.slice(colon + 1);
    }
    out.push(inner.trim());
  }
  for (const m of md.matchAll(/\{\{ref\|\s*page:([^|}]+)/gi)) out.push(m[1].trim());
  return out;
}

/** A ref as stored (`raw`) with its token and quotes (`raw` as stored, `text` decoded). */
type RawRef = { raw: string; token: string; quotes: { raw: string; text: string }[] };

/** Every `{{ref|token|quote=…}}` in `md`, in order, keeping the stored encoding of each quote. */
export function extractRefs(md: string): RawRef[] {
  const out: RawRef[] = [];
  md = expandTableCells(md);
  for (const m of md.matchAll(REF_RE)) {
    const [token, ...params] = m[1].split("|");
    const quotes = params
      .map((p) => p.trim())
      .filter((p) => p.startsWith("quote="))
      .map((p) => {
        const raw = p.slice("quote=".length);
        return { raw, text: decodePct(raw).trim() };
      })
      .filter((q) => q.text);
    out.push({ raw: m[0], token: token.trim(), quotes });
  }
  return out;
}

/** Ref token that cites the target chapter, e.g. `Chapter:1.00` (older context files have no `chapter.refToken`). */
export function chapterRefToken(context: IngestContext): string {
  return context.chapter.refToken ?? `Chapter:${context.chapter.displayName}`;
}

/** Text written by the model: `md` with every ref removed (ref quotes are verbatim, so they may contain em dashes). */
export function proseOnly(md: string): string {
  return md.replace(REF_RE, "");
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isArr = Array.isArray;

function checkCitations(cits: unknown, where: string, errors: string[]) {
  if (!isArr(cits) || cits.length === 0) {
    errors.push(`${where}: citations must be a non-empty array`);
    return;
  }
  cits.forEach((c: IngestCitation, i) => {
    if (!c || !isStr(c.quote) || !c.quote.trim()) errors.push(`${where}.citations[${i}]: quote must be a non-empty string`);
    if (c && c.note !== undefined && !isStr(c.note)) errors.push(`${where}.citations[${i}]: note must be a string`);
  });
}

/** Structural check mirroring `.claude/skills/ingest-chapter/proposals.schema.json`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkShape(p: any, errors: string[]) {
  if (!p || typeof p !== "object") return errors.push("proposals must be an object");
  if (p.v !== 1) errors.push("v must be 1");
  if (typeof p.chapterId !== "number") errors.push("chapterId must be a number");
  if (!isStr(p.contextSha256)) errors.push("contextSha256 must be a string");
  if (!isStr(p.promptVersion)) errors.push("promptVersion must be a string");
  if (p.synopsis !== null) {
    if (!p.synopsis || !isStr(p.synopsis.content)) errors.push("synopsis must be null or { content, citations }");
    else checkCitations(p.synopsis.citations, "synopsis", errors);
  }
  if (!isArr(p.newPages)) errors.push("newPages must be an array");
  else
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.newPages.forEach((n: any, i: number) => {
      const w = `newPages[${i}]`;
      if (!isStr(n.tempId) || !n.tempId) errors.push(`${w}.tempId must be a non-empty string`);
      if (!isStr(n.title) || !n.title.trim()) errors.push(`${w}.title must be a non-empty string`);
      if (!isArr(n.aliases) || !n.aliases.every(isStr)) errors.push(`${w}.aliases must be a string array`);
      if (n.parentPageId !== undefined && n.parentPageId !== null && typeof n.parentPageId !== "number" && !isStr(n.parentPageId))
        errors.push(`${w}.parentPageId must be a page id, a tempId, or omitted`);
      if (!isStr(n.content) || !n.content.trim()) errors.push(`${w}.content must be non-empty`);
      if (n.infobox !== undefined && !isStr(n.infobox)) errors.push(`${w}.infobox must be a string or omitted`);
      if (!isStr(n.changeSummary)) errors.push(`${w}.changeSummary must be a string`);
      checkCitations(n.citations, w, errors);
    });
  if (!isArr(p.updates)) errors.push("updates must be an array");
  else
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.updates.forEach((u: any, i: number) => {
      const w = `updates[${i}]`;
      if (typeof u.pageId !== "number") errors.push(`${w}.pageId must be a number`);
      if (u.importance !== "major" && u.importance !== "minor") errors.push(`${w}.importance must be "major" or "minor"`);
      if (u.infobox !== undefined && !isStr(u.infobox)) errors.push(`${w}.infobox must be a string or omitted`);
      if (u.edits === undefined && u.infobox === undefined) errors.push(`${w}: needs edits, infobox, or both`);
      if (u.edits !== undefined && (!isArr(u.edits) || u.edits.length === 0)) errors.push(`${w}.edits must be a non-empty array when present`);
      else if (u.edits)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        u.edits.forEach((e: any, j: number) => {
          const ok =
            (e.op === "append" && isStr(e.text)) ||
            (e.op === "insert_after" && isStr(e.anchor) && isStr(e.text)) ||
            (e.op === "replace" && isStr(e.find) && isStr(e.with));
          if (!ok) errors.push(`${w}.edits[${j}] is not a valid EditOp`);
        });
      if (!isStr(u.changeSummary)) errors.push(`${w}.changeSummary must be a string`);
      checkCitations(u.citations, w, errors);
    });
}

/** Infobox fields for a character page, in display order (see the ingest-chapter skill). */
export const CHARACTER_INFOBOX_FIELDS = [
  "Aliases", "Class(es)", "Location", "Species", "Gender", "Status",
  "Affiliation", "Family", "Occupation", "Residence",
];

/**
 * Splits infobox markdown into `[{ field, value }]`. Reads the two-column grid
 * (`| **Field** | value |` rows under an empty `| | |` header) and the older
 * `**Field**` line + value form. Values are decoded with `expandTableCells`.
 */
export function parseInfobox(md: string | null | undefined): { field: string; value: string }[] {
  const lines = (md ?? "").split("\n");
  const rows = lines.filter((l) => l.trim().startsWith("|"));
  if (rows.length) {
    const out: { field: string; value: string }[] = [];
    for (const row of rows) {
      // Split on unescaped pipes; drop the empty edge cells.
      const cells = row.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
      if (cells.every((c) => /^:?-*:?$/.test(c))) continue; // empty header or separator row
      const field = cells[0].replace(/^\*\*(.*)\*\*$/, "$1").trim();
      if (field) out.push({ field, value: expandTableCells(cells.slice(1).join(" | ")).trim() });
    }
    return out;
  }
  const out: { field: string; value: string }[] = [];
  let cur: { field: string; value: string } | null = null;
  for (const line of lines) {
    const m = line.trim().match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      cur = { field: m[1].trim(), value: "" };
      out.push(cur);
    } else if (cur) cur.value += `${line}\n`;
  }
  for (const f of out) f.value = f.value.trim();
  return out;
}

/**
 * Format problems in infobox grid markdown: not a grid, a missing empty header,
 * rows without exactly two cells (usually an unescaped `|`), unbolded labels,
 * several links in one cell outside a cell list, and `{{list:…}}` items that are
 * not percent-encoded exactly as the app's editor writes them.
 */
export function infoboxFormatErrors(md: string | null | undefined): string[] {
  const errors: string[] = [];
  const rows = (md ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!rows.every((r) => r.startsWith("|"))) {
    errors.push('not a two-column grid - every line must be a "| **Field** | value |" row, under an empty "| | |" header and a "| --- | --- |" separator');
    return errors;
  }
  const cellsOf = (row: string) => row.replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
  const [head, sep, ...body] = rows;
  if (!head || cellsOf(head).some((c) => c)) errors.push('first row must be an empty header "| | |"');
  if (!sep || !cellsOf(sep).every((c) => /^:?-+:?$/.test(c))) errors.push('second row must be the separator "| --- | --- |"');
  for (const row of body) {
    const cells = cellsOf(row);
    const label = cells[0] ?? "";
    if (cells.length !== 2) {
      errors.push(`row ${JSON.stringify(row.slice(0, 80))} has ${cells.length} cells, not 2 - escape every | inside a value as \\|`);
      continue;
    }
    if (!/^\*\*[^*]+\*\*$/.test(label)) errors.push(`row ${JSON.stringify(row.slice(0, 80))}: the label must be bold, like **Field**`);
    const value = cells[1];
    if ((value.match(/\{\{list:/g) ?? []).length !== (value.match(CELL_LIST_RE) ?? []).length)
      errors.push(`${label}: malformed {{list:...}} - percent-encode { and } in items (%7B, %7D) and close it with }}`);
    const outside = value.replace(CELL_LIST_RE, "");
    if ((outside.match(/\[\[/g) ?? []).length > 1)
      errors.push(`${label}: several links in one cell - write them as a {{list:...}} cell list`);
    for (const m of value.matchAll(CELL_LIST_RE)) {
      const raws = m[1].split(";");
      if (!raws.some((r) => r.trim())) errors.push(`${label}: empty {{list:}}`);
      for (const raw of raws) {
        const text = decodePct(raw).trim();
        if (!text) continue;
        if (/\{\{ref\|/i.test(text)) errors.push(`${label}: a ref is inside a list item - put it after the {{list:...}}`);
        else if (raw.trim() !== encodeCellItem(text))
          errors.push(`${label}: list item is not percent-encoded - use ${encodeCellItem(text)}`);
      }
    }
  }
  return errors;
}

/** Values of `next` whose field is new or whose value changed from `base`. */
function changedInfoboxValues(base: string, next: string): string[] {
  const prev = new Map(parseInfobox(base).map((f) => [f.field.toLowerCase(), f.value]));
  return parseInfobox(next)
    .filter((f) => prev.get(f.field.toLowerCase()) !== f.value)
    .map((f) => f.value);
}

/**
 * Slug the app gives a page from its title (`titleToSlug`).
 * `[Basic Cleaning]` -> `basic-cleaning`, `An Abandoned Inn` -> `an-abandoned-inn`.
 */
export const pageSlug = titleToSlug;

/**
 * Builds the map of linkable slugs. The app resolves `[[page:x]]` by page slug (exact match), so a
 * link is valid only if `x` is the slug of an indexed page, or the slug that a proposed new page
 * will get from its title. Titles and aliases are not linkable (see `slugHints`): the app makes the
 * slug from the page's first name, so a renamed page ("Erin" -> "Erin Solstice") keeps its old slug.
 *
 * `livePages` are every non-deleted page of the serial, read from the database at review time.
 * They let a link point to a page that exists but is not in the spoiler-filtered index (e.g.
 * introduced in a later chapter). Such targets get `live: true`. The export never includes them,
 * so the agent writing proposals cannot see later-chapter slugs.
 */
export function buildTitleMap(
  context: IngestContext,
  proposals: Pick<Proposals, "newPages"> | null,
  livePages: LivePage[] = [],
): Map<string, LinkTarget> {
  const map = new Map<string, LinkTarget>();
  for (const p of context.pageIndex) map.set(p.slug, { pageId: p.id });
  for (const p of livePages) if (!map.has(p.slug)) map.set(p.slug, { pageId: p.id, live: true });
  for (const n of proposals?.newPages ?? []) {
    const slug = pageSlug(n.title);
    if (!map.has(slug)) map.set(slug, { tempId: n.tempId });
  }
  return map;
}

/** Maps title/alias keys to the slug that should be linked instead, for a helpful error message. */
function slugHints(context: IngestContext, proposals: Proposals): Map<string, string> {
  const hints = new Map<string, string>();
  for (const p of context.pageIndex)
    for (const t of [p.title, ...p.aliases]) if (!hints.has(titleKey(t))) hints.set(titleKey(t), p.slug);
  for (const n of proposals.newPages) if (!hints.has(titleKey(n.title))) hints.set(titleKey(n.title), pageSlug(n.title));
  return hints;
}

/**
 * tempIds of the other new pages that new page `n` needs to exist before it
 * can be approved: its parent (if a tempId) and every new page its body links to.
 */
export function newPageDeps(n: NewPageProposal, titleMap: Map<string, LinkTarget>): string[] {
  const deps = new Set<string>();
  if (isStr(n.parentPageId)) deps.add(n.parentPageId);
  for (const name of extractPageLinks(n.content ?? "")) {
    const t = titleMap.get(name);
    if (t && "tempId" in t) deps.add(t.tempId);
  }
  deps.delete(n.tempId);
  return [...deps];
}

/**
 * The review UI approves one proposal at a time and blocks a new page until
 * every new page it depends on exists. So new-page dependencies must be
 * acyclic, and `newPages` must list each page after its dependencies (the
 * review UI shows them in array order).
 */
function checkNewPageOrder(newPages: NewPageProposal[], titleMap: Map<string, LinkTarget>, errors: string[]) {
  const pos = new Map(newPages.map((n, i) => [n.tempId, i]));
  const depsOf = new Map(newPages.map((n) => [n.tempId, newPageDeps(n, titleMap)]));

  // Report each cycle once (DFS with a recursion stack).
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    stack.push(id);
    for (const d of depsOf.get(id) ?? []) {
      if (!pos.has(d)) continue;
      if (state.get(d) === 1) {
        const cycle = [...stack.slice(stack.indexOf(d)), d];
        const sig = [...new Set(cycle)].sort().join(",");
        if (!seen.has(sig)) {
          seen.add(sig);
          errors.push(
            `newPages: circular dependency ${cycle.join(" -> ")} - a new page may link to (or be the child of) another new page only in one direction; remove a link`,
          );
        }
      } else if (!state.has(d)) visit(d);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const n of newPages) if (!state.has(n.tempId)) visit(n.tempId);
  if (seen.size) return;

  for (const n of newPages) {
    const late = depsOf.get(n.tempId)!.filter((d) => pos.has(d) && pos.get(d)! > pos.get(n.tempId)!);
    if (late.length)
      errors.push(`newPages[${n.tempId}]: depends on ${late.join(", ")}, which come later - list new pages after the pages they link to or use as a parent`);
  }
}

/**
 * Runs every proposals.json check. `contextRaw` is the exact context.json
 * file content (its sha256 must equal `proposals.contextSha256`).
 * Returns `errors` plus per-proposal `items` used by the review UI (proposed
 * body, edit errors, unverified quotes, links). `livePages` extends link
 * resolution with pages that exist now (see `buildTitleMap`).
 *
 * @example
 * const { errors, items } = validateProposals(readFileSync(ctxPath, "utf8"), proposals, livePages);
 */
export function validateProposals(
  contextRaw: string,
  proposals: unknown,
  livePages: LivePage[] = [],
): { errors: string[]; items: IngestItem[] } {
  const errors: string[] = [];
  checkShape(proposals, errors);
  if (errors.length) return { errors, items: [] };
  const P = proposals as Proposals;

  const context = JSON.parse(contextRaw) as IngestContext;
  const noSlug = context.pageIndex.filter((p) => !p.slug);
  if (noSlug.length) {
    errors.push(
      `context.json has no slug for page(s) ${noSlug.map((p) => p.id).join(", ")} - re-export it with scripts/ingest/export-context.ts (slugs cannot be guessed from titles)`,
    );
    return { errors, items: [] };
  }
  if (P.contextSha256 !== sha256(contextRaw))
    errors.push("contextSha256 does not match context.json (re-export or regenerate proposals)");
  if (P.chapterId !== context.chapter.id)
    errors.push(`chapterId ${P.chapterId} does not match context chapter ${context.chapter.id}`);

  const chapterNorm = normalizeWs(context.chapterText);
  const titleMap = buildTitleMap(context, P, livePages);
  const hints = slugHints(context, P);
  const indexIds = new Set(context.pageIndex.map((p) => p.id));
  const pagesById = new Map(context.pages.map((p) => [p.id, p]));
  const tempIds = new Set<string>();
  const items: IngestItem[] = [];

  const verify = (cits: IngestCitation[], where: string): VerifiedCitation[] =>
    cits.map((c) => {
      const ok = chapterNorm.includes(normalizeWs(c.quote));
      if (!ok) errors.push(`${where}: quote not found in chapter text: ${JSON.stringify(c.quote.slice(0, 100))}`);
      return { ...c, verified: ok };
    });
  const refToken = chapterRefToken(context);
  const chapterType = refToken.slice(0, refToken.indexOf(":")).toLowerCase();
  const checkNoEmDash = (md: string, where: string) => {
    if (proseOnly(md).includes("—")) errors.push(`${where}: text has an em dash (—) - rewrite with a comma, colon, parentheses or two sentences`);
  };
  const checkQuotes = (r: RawRef, where: string) => {
    for (const q of r.quotes) {
      if (!chapterNorm.includes(normalizeWs(q.text)))
        errors.push(`${where}: ref quote is not verbatim from the chapter: ${JSON.stringify(q.text.slice(0, 100))}`);
      else if (q.raw !== encodeRefQuote(q.text))
        errors.push(`${where}: ref quote is not percent-encoded - use quote=${encodeRefQuote(q.text)}`);
    }
  };
  // Page text must cite the chapter with refs whose quotes are verbatim and encoded like the editor does.
  // `existing` is the page's current and previous text: a ref copied from it unchanged is kept as is,
  // even when it cites an earlier chapter.
  const checkPageCitations = (md: string, where: string, existing = "") => {
    const refs = extractRefs(md).filter((r) => !existing.includes(r.raw));
    // A plain `[[Chapter:X]]` link also cites the chapter (used for Class/Skill acquisitions).
    const linksChapter = md.toLowerCase().includes(`[[${refToken.toLowerCase()}`);
    if (!linksChapter && !refs.some((r) => r.token.toLowerCase() === refToken.toLowerCase()))
      errors.push(`${where}: text does not cite the chapter - add {{ref|${refToken}|quote=...}} after the new facts, or a [[${refToken}]] link for a Class/Skill acquisition`);
    for (const r of refs) {
      const cat = r.token.slice(0, r.token.indexOf(":")).toLowerCase();
      if (cat === chapterType && r.token.toLowerCase() !== refToken.toLowerCase())
        errors.push(`${where}: {{ref|${r.token}}} cites another chapter - cite only ${refToken}`);
      if (cat === chapterType && !r.quotes.length) errors.push(`${where}: {{ref|${r.token}}} has no quote - add |quote=<verbatim text>`);
      checkQuotes(r, where);
    }
    checkNoEmDash(md, where);
  };
  // Infobox values are short labels: refs are optional, but any ref must still be verbatim and cite this chapter.
  const checkInfobox = (md: string, where: string) => {
    for (const e of infoboxFormatErrors(md)) errors.push(`${where}: ${e}`);
    if (!parseInfobox(md).length) errors.push(`${where}: no fields - use a two-column grid of "| **Field** | value |" rows under an empty "| | |" header`);
    for (const r of extractRefs(md)) {
      if (r.token.toLowerCase() !== refToken.toLowerCase()) errors.push(`${where}: {{ref|${r.token}}} - cite only ${refToken}`);
      checkQuotes(r, where);
    }
    checkNoEmDash(md, where);
  };
  const links = (md: string, where: string) =>
    extractPageLinks(md).map((name) => {
      const target = titleMap.get(name) ?? null;
      if (!target) {
        const hint = hints.get(titleKey(name)) ?? hints.get(titleKey(name.replace(/[-_]+/g, " ")));
        errors.push(
          hint
            ? `${where}: link [[page:${name}]] is not a page slug - use [[page:${hint}]]`
            : `${where}: link [[page:${name}]] is not the slug of an indexed page or of a proposed new page (a new page's slug is its title lowercased with hyphens)`,
        );
      }
      return { name, target };
    });

  for (const n of P.newPages) {
    const w = `newPages[${n.tempId}]`;
    if (tempIds.has(n.tempId)) errors.push(`${w}: duplicate tempId`);
    tempIds.add(n.tempId);
    const clash = context.pageIndex.find((p) => [p.title, ...p.aliases].some((t) => titleKey(t) === titleKey(n.title)));
    if (clash) errors.push(`${w}: title "${n.title}" already exists as page ${clash.id} - propose an update instead`);
    const slug = pageSlug(n.title);
    const slugClash =
      context.pageIndex.find((p) => p.slug === slug) ??
      livePages.find((p) => p.slug === slug) ??
      P.newPages.find((o) => o !== n && pageSlug(o.title) === slug);
    if (slugClash && slugClash !== clash) errors.push(`${w}: title "${n.title}" gets slug "${slug}", which another page already uses - the link would not point here; choose a different title`);
  }
  checkNewPageOrder(P.newPages, titleMap, errors);
  for (const n of P.newPages) {
    const w = `newPages[${n.tempId}]`;
    if (typeof n.parentPageId === "number" && !indexIds.has(n.parentPageId)) errors.push(`${w}: parentPageId ${n.parentPageId} not in index`);
    if (isStr(n.parentPageId) && !tempIds.has(n.parentPageId)) errors.push(`${w}: parentPageId "${n.parentPageId}" is not a proposed tempId`);
    checkPageCitations(n.content, w);
    checkNoEmDash(n.changeSummary, `${w}.changeSummary`);
    const infobox = n.infobox?.trim() ? n.infobox : null;
    if (infobox) checkInfobox(infobox, `${w}.infobox`);
    items.push({
      kind: "new_page",
      key: `new:${n.tempId}`,
      proposal: n,
      body: n.content,
      infobox,
      infoboxBase: null,
      citations: verify(n.citations, w),
      links: links(infobox ? `${n.content}\n${infobox}` : n.content, w),
      editErrors: [],
    });
  }

  if (P.synopsis) {
    checkNoEmDash(P.synopsis.content, "synopsis");
    items.push({
      kind: "synopsis",
      key: "synopsis",
      proposal: P.synopsis,
      base: context.existingSynopsis ?? "",
      body: P.synopsis.content,
      infobox: null,
      infoboxBase: null,
      citations: verify(P.synopsis.citations, "synopsis"),
      links: links(P.synopsis.content, "synopsis"),
      editErrors: [],
    });
  }

  const seenPages = new Set<number>();
  for (const u of P.updates) {
    const w = `updates[page ${u.pageId}]`;
    if (seenPages.has(u.pageId)) errors.push(`${w}: more than one update for the same page - merge them`);
    seenPages.add(u.pageId);
    const page = pagesById.get(u.pageId);
    if (!indexIds.has(u.pageId) || !page) {
      errors.push(`${w}: pageId not in index`);
      continue;
    }
    const edits = u.edits ?? [];
    const { body, errors: editErrors } = applyEdits(page.content, edits);
    editErrors.forEach((e) => errors.push(`${w}: ${e}`));
    const added = edits.map((e) => ("text" in e ? e.text : "with" in e ? e.with : "")).join("\n");
    if (edits.length) checkPageCitations(added, w, `${page.content}\n${page.previous?.content ?? ""}`);
    const baseInfobox = page.infobox ?? "";
    const infobox = u.infobox === undefined ? null : u.infobox;
    let infoboxAdded = "";
    if (infobox !== null) {
      if (infobox === baseInfobox) errors.push(`${w}.infobox: unchanged - omit it`);
      checkInfobox(infobox, `${w}.infobox`);
      infoboxAdded = changedInfoboxValues(baseInfobox, infobox).join("\n");
    }
    checkNoEmDash(u.changeSummary, `${w}.changeSummary`);
    items.push({
      kind: "page_update",
      key: `update:${u.pageId}`,
      proposal: u,
      title: page.title,
      base: page.content,
      body,
      infobox,
      infoboxBase: baseInfobox,
      // The review diff compares against the revision before this chapter, since
      // a revision already at this chapter is replaced rather than built upon.
      diffBase: page.previous?.content ?? page.content,
      infoboxDiffBase: page.previous?.infobox ?? baseInfobox,
      bodyChanged: edits.length > 0,
      citations: verify(u.citations, w),
      // Existing infobox values may link by slug; only check links in changed values.
      links: links(infoboxAdded ? `${added}\n${infoboxAdded}` : added, w),
      editErrors,
    });
  }

  return { errors, items };
}
