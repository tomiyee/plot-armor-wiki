/**
 * Local review UI for /ingest-chapter proposals.
 *
 *   npx tsx scripts/ingest/review.ts .ingest/<chapter>/ [--dry-run] [--port 4777]
 *
 * Serves one page on 127.0.0.1 (no auth - localhost only). Every approval is
 * applied immediately (one transaction each, via apply.ts) and every decision
 * is appended to `<dir>/decisions.json`.
 */
import { dbTarget } from "./lib/env";
import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { extractPageLinks, titleKey, validateProposals, wordDiff } from "./lib/core.mjs";
import { applyNewPage, applyPageUpdate, applySynopsis, StaleError, type ApplyTarget } from "./apply";

type Item = {
  kind: "synopsis" | "new_page" | "page_update";
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proposal: any;
  title?: string;
  base?: string;
  body: string;
  citations: { quote: string; note?: string; verified: boolean }[];
  links: { name: string; target: { pageId?: number; tempId?: string } | null }[];
  editErrors: string[];
};

type Decision = {
  key: string;
  kind: Item["kind"];
  action: "approve" | "reject";
  proposal: unknown;
  finalText: string | null;
  edited: boolean;
  createdPageId?: number;
  dryRun: boolean;
  promptVersion: string;
  decidedAt: string;
};

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--port");
const dryRun = argv.includes("--dry-run");
const port = Number(argv[argv.indexOf("--port") + 1]) || 4777;
if (!dir) {
  console.error("usage: npx tsx scripts/ingest/review.ts <.ingest/chapter dir> [--dry-run] [--port 4777]");
  process.exit(2);
}

const contextRaw = readFileSync(path.join(dir, "context.json"), "utf8");
const context = JSON.parse(contextRaw);
const proposals = JSON.parse(readFileSync(path.join(dir, "proposals.json"), "utf8"));
const { errors: validationErrors, items } = validateProposals(contextRaw, proposals) as {
  errors: string[];
  items: Item[];
};
const decisionsPath = path.join(dir, "decisions.json");
const decisions: Decision[] = existsSync(decisionsPath) ? JSON.parse(readFileSync(decisionsPath, "utf8")) : [];

const target: ApplyTarget = {
  serialId: context.serial.id,
  chapterId: context.chapter.id,
  chapterIdx: context.chapter.idx,
  dryRun,
};

/** Latest decision per key (a rejected item may be re-decided; an approved one is final). */
function latest(key: string) {
  return decisions.filter((d) => d.key === key).at(-1);
}

/** tempId → page id of an applied new page. */
function createdPageId(tempId: string) {
  return latest(`new:${tempId}`)?.createdPageId;
}

/** Proposed new pages that `text` links to (by title/alias). */
function linkedNewPages(text: string) {
  const byKey = new Map<string, string>();
  for (const n of proposals.newPages ?? []) byKey.set(titleKey(n.title), n.tempId);
  return [...new Set(extractPageLinks(text).map((l: string) => byKey.get(titleKey(l))).filter(Boolean))] as string[];
}

async function decide(body: { key: string; action: "approve" | "reject"; finalText?: string }) {
  const item = items.find((i) => i.key === body.key);
  if (!item) throw new Error(`Unknown proposal ${body.key}`);
  const prev = latest(item.key);
  if (prev?.action === "approve") throw new Error("Already approved.");

  const finalText = body.action === "approve" ? (body.finalText ?? item.body) : null;
  let newPageId: number | undefined;

  if (body.action === "approve") {
    if (item.editErrors.length && body.finalText === undefined)
      throw new Error("Edit operations did not apply cleanly - edit the text manually before approving.");
    if (!finalText!.trim()) throw new Error("Content is empty.");

    // New pages must exist before anything that links to them or uses them as a parent.
    const deps = linkedNewPages(finalText!);
    if (item.kind === "new_page" && typeof item.proposal.parentPageId === "string")
      deps.push(item.proposal.parentPageId);
    const missing = deps.filter((t) => t !== item.proposal.tempId && createdPageId(t) === undefined);
    if (missing.length)
      throw new Error(`Approve these new pages first (or remove the links): ${missing.join(", ")}`);

    if (item.kind === "synopsis") await applySynopsis(target, finalText!);
    else if (item.kind === "page_update")
      await applyPageUpdate(target, item.proposal.pageId, item.base!, finalText!);
    else {
      const p = item.proposal;
      const parentPageId =
        typeof p.parentPageId === "number"
          ? p.parentPageId
          : typeof p.parentPageId === "string"
            ? createdPageId(p.parentPageId)!
            : context.homePageId;
      if (!parentPageId) throw new Error("No parent page (and the serial has no home page).");
      newPageId = await applyNewPage(target, { title: p.title, parentPageId, content: finalText! });
    }
  }

  const decision: Decision = {
    key: item.key,
    kind: item.kind,
    action: body.action,
    proposal: item.proposal,
    finalText,
    edited: finalText !== null && finalText !== item.body,
    createdPageId: newPageId,
    dryRun,
    promptVersion: proposals.promptVersion,
    decidedAt: new Date().toISOString(),
  };
  decisions.push(decision);
  writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
  return decision;
}

function state() {
  return {
    dryRun,
    dbTarget,
    chapter: context.chapter,
    serial: context.serial,
    source: context.source,
    promptVersion: proposals.promptVersion,
    validationErrors,
    items: items.map((i) => ({
      ...i,
      diff: i.kind === "new_page" ? null : wordDiff(i.base ?? "", i.body),
      newPageLinks: linkedNewPages(i.body),
      decision: latest(i.key) ?? null,
    })),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "content-type": `${type}; charset=utf-8` });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") return send(res, 200, PAGE, "text/html");
    if (req.method === "GET" && req.url === "/api/state") return send(res, 200, state());
    if (req.method === "POST" && req.url === "/api/decide") {
      await decide(JSON.parse(await readBody(req)));
      return send(res, 200, state());
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    const status = err instanceof StaleError ? 409 : 400;
    send(res, status, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Chapter: ${context.chapter.displayName} (id ${context.chapter.id}, idx ${context.chapter.idx})`);
  console.log(dryRun ? "DRY RUN - nothing will be written." : `Writes go to: ${dbTarget}`);
  if (validationErrors.length) console.warn(`WARN ${validationErrors.length} validation failure(s) - shown in the UI.`);
  console.log(`Review at ${url}  (Ctrl+C to stop)`);
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : existsSync("/proc/sys/fs/binfmt_misc/WSLInterop") ? "explorer.exe" : "xdg-open";
  exec(`${opener} ${url}`, () => {});
});

const PAGE = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><title>PlotArmor ingest review</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
<style>
:root{--bg:#fff;--fg:#1c1c1c;--mut:#666;--line:#ddd;--card:#fafafa;--add:#d7f5dd;--del:#fbd9d9;--warn:#fff3cd}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#e8e8e8;--mut:#999;--line:#333;--card:#1f1f1f;--add:#1f4d2b;--del:#5a2323;--warn:#4a3d10}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin:12px 0}
.card.approve{border-left:4px solid #2e9d4f}.card.reject{opacity:.55;border-left:4px solid #b33}
.meta{color:var(--mut);font-size:13px}.err{background:var(--warn);padding:8px 10px;border-radius:6px;margin:6px 0;font-size:13px}
.diff{white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;border:1px solid var(--line);padding:8px;border-radius:6px;max-height:420px;overflow:auto}
ins{background:var(--add);text-decoration:none}del{background:var(--del)}
.md{border:1px solid var(--line);padding:4px 12px;border-radius:6px;max-height:420px;overflow:auto}
textarea{width:100%;box-sizing:border-box;min-height:220px;font:13px/1.5 ui-monospace,monospace;background:var(--bg);color:var(--fg)}
button{margin:6px 6px 0 0;padding:5px 12px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);cursor:pointer}
button.ok{background:#2e9d4f;color:#fff;border:0}button.no{background:#b33;color:#fff;border:0}
ul.cit{margin:6px 0;padding-left:18px;font-size:13px}
</style></head><body>
<div id="app">Loading…</div>
<script>
let S = null; const editing = {};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const md = (s) => window.marked ? marked.parse(s ?? "") : "<pre>" + esc(s) + "</pre>";
async function load(){ S = await (await fetch("/api/state")).json(); render(); }
async function decide(key, action){
  const body = { key, action };
  if (editing[key] !== undefined) body.finalText = document.getElementById("ta-" + key).value;
  const r = await fetch("/api/decide", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { alert(j.error); return false; }
  S = j; delete editing[key]; render(); return true;
}
function toggleEdit(key){
  const it = S.items.find((i) => i.key === key);
  if (editing[key] === undefined) editing[key] = it.body; else delete editing[key];
  render();
}
async function approveMinor(){
  const ks = S.items.filter((i) => i.kind === "page_update" && i.proposal.importance === "minor" && !i.decision
    && !i.editErrors.length && i.citations.every((c) => c.verified)).map((i) => i.key);
  if (!confirm("Approve " + ks.length + " verified minor update(s)?")) return;
  for (const k of ks) if (!(await decide(k, "approve"))) break;
}
function card(it){
  const d = it.decision, st = d ? d.action : "";
  const rejectedNew = it.newPageLinks.filter((t) => S.items.find((x) => x.key === "new:" + t)?.decision?.action === "reject");
  const p = it.proposal;
  let head = it.kind === "synopsis" ? "Synopsis"
    : it.kind === "new_page" ? "New page: " + esc(p.title)
    : esc(it.title) + " <span class=meta>(#" + p.pageId + ", " + p.importance + ")</span>";
  let meta = "";
  if (it.kind === "new_page") meta = "<div class=meta>tempId " + esc(p.tempId) + " · aliases: " + esc((p.aliases||[]).join(", ") || "none") + " · parent: " + esc(p.parentPageId ?? "home page") + "</div>";
  const body = editing[it.key] !== undefined
    ? "<textarea id='ta-" + it.key + "'>" + esc(editing[it.key]) + "</textarea>"
    : it.diff ? "<div class=diff>" + it.diff.map((o) => o.t === "=" ? esc(o.s) : o.t === "+" ? "<ins>" + esc(o.s) + "</ins>" : "<del>" + esc(o.s) + "</del>").join("") + "</div>"
    : "<div class=md>" + md(it.body) + "</div>";
  const cits = "<ul class=cit>" + it.citations.map((c) => "<li>" + (c.verified ? "✅" : "⚠️") + " “" + esc(c.quote) + "”" + (c.note ? " <span class=meta>— " + esc(c.note) + "</span>" : "") + "</li>").join("") + "</ul>";
  const errs = it.editErrors.map((e) => "<div class=err>Needs manual edit: " + esc(e) + "</div>").join("")
    + it.links.filter((l) => !l.target).map((l) => "<div class=err>Unresolved link [[page:" + esc(l.name) + "]]</div>").join("")
    + (rejectedNew.length ? "<div class=err>Links to rejected new page(s): " + esc(rejectedNew.join(", ")) + "</div>" : "");
  const actions = st === "approve" ? "<div class=meta>Approved" + (d.edited ? " (edited)" : "") + (d.dryRun ? " [dry-run]" : "") + "</div>"
    : "<button onclick=\"toggleEdit('" + it.key + "')\">" + (editing[it.key] !== undefined ? "Cancel edit" : "Edit") + "</button>"
      + "<button class=ok onclick=\"decide('" + it.key + "','approve')\">Approve</button>"
      + (st === "reject" ? "<span class=meta>Rejected</span>" : "<button class=no onclick=\"decide('" + it.key + "','reject')\">Reject</button>");
  return "<div class='card " + st + "'><b>" + head + "</b>" + meta
    + (p.changeSummary ? "<div class=meta>" + esc(p.changeSummary) + "</div>" : "")
    + errs + body + cits + actions + "</div>";
}
function render(){
  const by = (k) => S.items.filter((i) => i.kind === k);
  document.getElementById("app").innerHTML =
    "<h1>" + esc(S.serial.name) + " — " + esc(S.chapter.displayName) + "</h1>"
    + "<div class=meta><a href='" + esc(S.source.url) + "' target=_blank>" + esc(S.source.title) + "</a> · prompt " + esc(S.promptVersion)
    + " · " + by("page_update").length + " updates, " + by("new_page").length + " new pages · "
    + (S.dryRun ? "<b>DRY RUN</b>" : "writes to " + esc(S.dbTarget)) + "</div>"
    + S.validationErrors.map((e) => "<div class=err>" + esc(e) + "</div>").join("")
    + "<h2>New pages</h2><div class=meta>Approve new pages first; anything that links to one is blocked until it exists.</div>" + (by("new_page").map(card).join("") || "<div class=meta>None</div>")
    + "<h2>Synopsis</h2>" + (by("synopsis").map(card).join("") || "<div class=meta>None</div>")
    + "<h2>Page updates</h2><button onclick='approveMinor()'>Approve all verified minor updates</button>"
    + (by("page_update").map(card).join("") || "<div class=meta>None</div>");
}
load();
</script></body></html>`;
