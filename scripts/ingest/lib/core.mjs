/**
 * Pure, dependency-free ingest logic shared by `validate.mjs` (run by the
 * Claude Code skill with plain `node`) and `review.ts` (run with tsx).
 * Keep this file plain JS with no imports beyond node builtins.
 */
import { createHash } from "node:crypto";

/** sha256 hex of a string or buffer. */
export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** Collapses all whitespace runs to single spaces and normalizes curly quotes/dashes. */
export function normalizeWs(s) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercased title key used for link/title resolution. */
export function titleKey(s) {
  return normalizeWs(s).toLowerCase();
}

function countOccurrences(haystack, needle) {
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
 * Applies edit operations to `base`. Returns `{ body, errors }`; on any error
 * the failing op is skipped (the review UI marks the proposal "needs manual edit").
 *
 * - append:       adds `text` to the end, separated by a blank line.
 * - insert_after: `anchor` is an exact line (e.g. a `## Heading`) that must
 *                 occur exactly once; `text` goes after that line's paragraph
 *                 block (i.e. before the next heading), or directly after a
 *                 heading line.
 * - replace:      `find` must occur exactly once.
 */
export function applyEdits(base, edits) {
  let body = base;
  const errors = [];
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
      const isHeading = /^#{1,6}\s/.test(lines[at].trim());
      if (isHeading) {
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
      errors.push(`edit ${i}: unknown op ${JSON.stringify(e.op)}`);
    }
  });
  return { body, errors };
}

/** Returns the target names of every `[[page:...]]` / `[[Name]]` link (not `[[chapter:...]]`). */
export function extractPageLinks(md) {
  const out = [];
  for (const m of md.matchAll(/\[\[([^\]]+?)\]\]/g)) {
    let inner = m[1];
    const pipe = inner.indexOf("|");
    if (pipe !== -1) inner = inner.slice(0, pipe);
    const colon = inner.indexOf(":");
    if (colon !== -1) {
      const cat = inner.slice(0, colon).trim().toLowerCase();
      if (cat !== "page") continue;
      inner = inner.slice(colon + 1);
    }
    out.push(inner.trim());
  }
  return out;
}

/**
 * Word-level diff of `a` → `b` as `[{ t: "=" | "-" | "+", s }]`. Trims the
 * common prefix/suffix first (edits are localized), then runs an LCS on the
 * remaining middle.
 */
export function wordDiff(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean);
  const B = b.split(/(\s+)/).filter(Boolean);
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const a2 = A.slice(p, A.length - s);
  const b2 = B.slice(p, B.length - s);
  const ops = [];
  if (p) ops.push({ t: "=", s: A.slice(0, p).join("") });
  if (a2.length * b2.length > 4_000_000) {
    ops.push({ t: "-", s: a2.join("") }, { t: "+", s: b2.join("") });
  } else {
    const n = a2.length;
    const m = b2.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    const push = (t, str) => {
      const last = ops[ops.length - 1];
      if (last && last.t === t) last.s += str;
      else ops.push({ t, s: str });
    };
    while (i < n && j < m) {
      if (a2[i] === b2[j]) { push("=", a2[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) push("-", a2[i++]);
      else push("+", b2[j++]);
    }
    while (i < n) push("-", a2[i++]);
    while (j < m) push("+", b2[j++]);
  }
  if (s) ops.push({ t: "=", s: A.slice(A.length - s).join("") });
  return ops;
}

const isStr = (v) => typeof v === "string";
const isArr = Array.isArray;

function checkCitations(cits, where, errors) {
  if (!isArr(cits) || cits.length === 0) {
    errors.push(`${where}: citations must be a non-empty array`);
    return;
  }
  cits.forEach((c, i) => {
    if (!c || !isStr(c.quote) || !c.quote.trim()) errors.push(`${where}.citations[${i}]: quote must be a non-empty string`);
    if (c && c.note !== undefined && !isStr(c.note)) errors.push(`${where}.citations[${i}]: note must be a string`);
  });
}

/** Structural check mirroring `.claude/skills/ingest-chapter/proposals.schema.json`. */
function checkShape(p, errors) {
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
    p.newPages.forEach((n, i) => {
      const w = `newPages[${i}]`;
      if (!isStr(n.tempId) || !n.tempId) errors.push(`${w}.tempId must be a non-empty string`);
      if (!isStr(n.title) || !n.title.trim()) errors.push(`${w}.title must be a non-empty string`);
      if (!isArr(n.aliases) || !n.aliases.every(isStr)) errors.push(`${w}.aliases must be a string array`);
      if (n.parentPageId !== undefined && n.parentPageId !== null && typeof n.parentPageId !== "number" && !isStr(n.parentPageId))
        errors.push(`${w}.parentPageId must be a page id, a tempId, or omitted`);
      if (!isStr(n.content) || !n.content.trim()) errors.push(`${w}.content must be non-empty`);
      if (!isStr(n.changeSummary)) errors.push(`${w}.changeSummary must be a string`);
      checkCitations(n.citations, w, errors);
    });
  if (!isArr(p.updates)) errors.push("updates must be an array");
  else
    p.updates.forEach((u, i) => {
      const w = `updates[${i}]`;
      if (typeof u.pageId !== "number") errors.push(`${w}.pageId must be a number`);
      if (u.importance !== "major" && u.importance !== "minor") errors.push(`${w}.importance must be "major" or "minor"`);
      if (!isArr(u.edits) || u.edits.length === 0) errors.push(`${w}.edits must be a non-empty array`);
      else
        u.edits.forEach((e, j) => {
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

/**
 * Builds the set of linkable title keys: index titles + aliases + proposed
 * new-page titles. Maps key → { pageId } | { tempId }. New-page aliases are
 * NOT linkable: `page_titles` holds one title per (page, chapter), so aliases
 * of a page created at chapter N cannot be stored and would not resolve.
 */
export function buildTitleMap(context, proposals) {
  const map = new Map();
  for (const p of context.pageIndex) {
    for (const t of [p.title, ...p.aliases]) if (!map.has(titleKey(t))) map.set(titleKey(t), { pageId: p.id });
  }
  for (const n of proposals?.newPages ?? []) {
    if (!map.has(titleKey(n.title))) map.set(titleKey(n.title), { tempId: n.tempId });
  }
  return map;
}

/**
 * Runs every proposals.json check. `contextRaw` is the exact context.json
 * file content (its sha256 must equal `proposals.contextSha256`).
 * Returns `{ errors, items }` where `items` holds per-proposal results used
 * by the review UI (proposed body, edit errors, unverified quotes, links).
 */
export function validateProposals(contextRaw, proposals) {
  const errors = [];
  checkShape(proposals, errors);
  if (errors.length) return { errors, items: [] };

  const context = JSON.parse(contextRaw);
  if (proposals.contextSha256 !== sha256(contextRaw))
    errors.push("contextSha256 does not match context.json (re-export or regenerate proposals)");
  if (proposals.chapterId !== context.chapter.id)
    errors.push(`chapterId ${proposals.chapterId} does not match context chapter ${context.chapter.id}`);

  const chapterNorm = normalizeWs(context.chapterText);
  const titleMap = buildTitleMap(context, proposals);
  const indexIds = new Set(context.pageIndex.map((p) => p.id));
  const pagesById = new Map(context.pages.map((p) => [p.id, p]));
  const tempIds = new Set();
  const items = [];

  const verify = (cits, where) =>
    cits.map((c) => {
      const ok = chapterNorm.includes(normalizeWs(c.quote));
      if (!ok) errors.push(`${where}: quote not found in chapter text: ${JSON.stringify(c.quote.slice(0, 100))}`);
      return { ...c, verified: ok };
    });
  const links = (md, where) =>
    extractPageLinks(md).map((name) => {
      const target = titleMap.get(titleKey(name)) ?? null;
      if (!target) errors.push(`${where}: link [[page:${name}]] does not match an indexed title/alias or a proposed new page`);
      return { name, target };
    });

  for (const n of proposals.newPages) {
    const w = `newPages[${n.tempId}]`;
    if (tempIds.has(n.tempId)) errors.push(`${w}: duplicate tempId`);
    tempIds.add(n.tempId);
    const clash = context.pageIndex.find((p) => [p.title, ...p.aliases].some((t) => titleKey(t) === titleKey(n.title)));
    if (clash) errors.push(`${w}: title "${n.title}" already exists as page ${clash.id} - propose an update instead`);
  }
  for (const n of proposals.newPages) {
    const w = `newPages[${n.tempId}]`;
    if (typeof n.parentPageId === "number" && !indexIds.has(n.parentPageId)) errors.push(`${w}: parentPageId ${n.parentPageId} not in index`);
    if (isStr(n.parentPageId) && !tempIds.has(n.parentPageId)) errors.push(`${w}: parentPageId "${n.parentPageId}" is not a proposed tempId`);
    items.push({
      kind: "new_page",
      key: `new:${n.tempId}`,
      proposal: n,
      body: n.content,
      citations: verify(n.citations, w),
      links: links(n.content, w),
      editErrors: [],
    });
  }

  if (proposals.synopsis) {
    items.push({
      kind: "synopsis",
      key: "synopsis",
      proposal: proposals.synopsis,
      base: context.existingSynopsis ?? "",
      body: proposals.synopsis.content,
      citations: verify(proposals.synopsis.citations, "synopsis"),
      links: links(proposals.synopsis.content, "synopsis"),
      editErrors: [],
    });
  }

  const seenPages = new Set();
  for (const u of proposals.updates) {
    const w = `updates[page ${u.pageId}]`;
    if (seenPages.has(u.pageId)) errors.push(`${w}: more than one update for the same page - merge them`);
    seenPages.add(u.pageId);
    const page = pagesById.get(u.pageId);
    if (!indexIds.has(u.pageId) || !page) {
      errors.push(`${w}: pageId not in index`);
      continue;
    }
    const { body, errors: editErrors } = applyEdits(page.content, u.edits);
    editErrors.forEach((e) => errors.push(`${w}: ${e}`));
    const added = u.edits.map((e) => e.text ?? e.with ?? "").join("\n");
    items.push({
      kind: "page_update",
      key: `update:${u.pageId}`,
      proposal: u,
      title: page.title,
      base: page.content,
      body,
      citations: verify(u.citations, w),
      links: links(added, w),
      editErrors,
    });
  }

  return { errors, items };
}
