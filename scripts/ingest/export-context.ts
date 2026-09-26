/**
 * Exports a spoiler-safe context.json for the /ingest-chapter Claude Code skill.
 *
 *   npx tsx scripts/ingest/export-context.ts --serial wandering-inn <capture.json | --clipboard> [--chapter "9.12 E"]
 *
 * 1. Reads the bookmarklet capture (file or clipboard).
 * 2. Detects the matching chapter (title, then URL slug) and ALWAYS asks for
 *    confirmation. Never creates chapters.
 * 3. Reads the wiki at chapter idx N through the DAL (the same filters readers
 *    use, so nothing from later chapters leaks) and writes
 *    `.ingest/<chapter>/capture.json` + `context.json`.
 */
import "./lib/env";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { getSerialBySlug } from "@/data/serials/queries";
import {
  fetchChapterSynopsis,
  getSerialVolumesAndChapters,
} from "@/data/chapters/queries";
import {
  countPageContentRevisionsAtChapter,
  fetchActiveParentPagesAtIdx,
  fetchPageContentAtIdx,
  fetchPageInfoboxAtIdx,
  fetchSerialHomePage,
  fetchSerialPageTitlesAtIdx,
  fetchSerialPagesAtIdx,
} from "@/data/pages/queries";
import { sha256 } from "./lib/core.mjs";
import { chapterDirName, rankChapters } from "./lib/chapterMatch";

type Capture = {
  v: number;
  source: string;
  url: string;
  title: string;
  publishedAt: string | null;
  wordCount: number;
  text: string;
};

function parseArgs(argv: string[]) {
  const args: { serial?: string; chapter?: string; clipboard: boolean; file?: string } = {
    clipboard: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--serial") args.serial = argv[++i];
    else if (a === "--chapter") args.chapter = argv[++i];
    else if (a === "--clipboard") args.clipboard = true;
    else args.file = a;
  }
  return args;
}

function readClipboard(): string {
  const cmds = [
    "powershell.exe -NoProfile -Command Get-Clipboard -Raw",
    "pbpaste",
    "wl-paste",
    "xclip -selection clipboard -o",
  ];
  for (const cmd of cmds) {
    try {
      return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      // try next
    }
  }
  throw new Error("Could not read the clipboard - save the capture to a file instead.");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, word-boundary (Unicode-aware) mention test. */
function mentions(textLower: string, term: string) {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return false;
  if (!textLower.includes(t)) return false; // cheap pre-filter
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(t)}(?![\\p{L}\\p{N}])`, "u").test(textLower);
}

function firstLine(md: string) {
  const line = md.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serial || (!args.file && !args.clipboard)) {
    console.error(
      'usage: npx tsx scripts/ingest/export-context.ts --serial <slug> <capture.json | --clipboard> [--chapter "<display name>"]',
    );
    process.exit(2);
  }

  const raw = args.clipboard ? readClipboard() : readFileSync(args.file!, "utf8");
  const capture = JSON.parse(raw.trim()) as Capture;
  if (capture.v !== 1 || typeof capture.text !== "string" || !capture.text.trim())
    throw new Error("Not a PlotArmor capture (expected { v: 1, text, title, url, ... }).");

  const serial = await getSerialBySlug(args.serial);
  if (!serial) throw new Error(`Serial "${args.serial}" not found.`);
  const { chapterList } = await getSerialVolumesAndChapters(serial.id);

  // --- Chapter detection -----------------------------------------------------
  const ranked = rankChapters(chapterList, {
    title: args.chapter ?? capture.title,
    url: args.chapter ? undefined : capture.url,
  });
  const exact = ranked.filter((r) => r.exact);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`Capture: "${capture.title}" (${capture.wordCount} words)\n  ${capture.url}`);
  let chapter: (typeof chapterList)[number] | undefined;
  if (exact.length === 1) {
    const c = exact[0].chapter;
    const ans = await rl.question(`Matched chapter "${c.displayName}" (idx ${c.idx}). Use it? [Y/n] `);
    if (!/^n/i.test(ans.trim())) chapter = c;
  }
  if (!chapter) {
    const options = ranked.slice(0, 8);
    if (options.length === 0 || options[0].score === 0) {
      console.error(
        `No chapter resembles "${capture.title}". Create it in the serial editor first, then re-run.`,
      );
      process.exit(1);
    }
    console.log("Closest chapters:");
    options.forEach((o, i) => console.log(`  ${i + 1}. ${o.chapter.displayName} (idx ${o.chapter.idx})`));
    const ans = await rl.question("Pick a number (anything else aborts - create the chapter first if missing): ");
    const n = Number(ans.trim());
    if (!Number.isInteger(n) || n < 1 || n > options.length) {
      console.error("Aborted.");
      process.exit(1);
    }
    chapter = options[n - 1].chapter;
  }
  const N = chapter.idx;

  // --- Existing-work warnings -----------------------------------------------
  const [existingSynopsis, revisionsAtN] = await Promise.all([
    fetchChapterSynopsis(chapter.id),
    countPageContentRevisionsAtChapter(chapter.id),
  ]);
  if (existingSynopsis?.trim()) console.warn(`WARN chapter already has a synopsis (${existingSynopsis.length} chars).`);
  if (revisionsAtN > 0) console.warn(`WARN ${revisionsAtN} page revision(s) already exist at this chapter.`);
  if (existingSynopsis?.trim() || revisionsAtN > 0) {
    const ans = await rl.question("Continue anyway? [y/N] ");
    if (!/^y/i.test(ans.trim())) process.exit(1);
  }
  rl.close();

  // --- Page index (spoiler-safe at idx N) -----------------------------------
  const [visible, titleRows, home] = await Promise.all([
    fetchSerialPagesAtIdx(serial.id, N),
    fetchSerialPageTitlesAtIdx(serial.id, N),
    fetchSerialHomePage(serial.id),
  ]);
  const titlesByPage = new Map<number, string[]>();
  for (const r of titleRows) {
    const list = titlesByPage.get(r.pageId) ?? [];
    list.push(r.title);
    titlesByPage.set(r.pageId, list);
  }
  const textLower = capture.text.toLowerCase();
  const allNames = new Map<number, { title: string; aliases: string[] }>();
  for (const p of visible) {
    const history = titlesByPage.get(p.id) ?? [];
    const title = history.at(-1) ?? p.name;
    const aliases = [...new Set([p.name, ...history].filter((t) => t !== title))];
    allNames.set(p.id, { title, aliases });
  }

  const matched = new Set<number>();
  for (const [id, n] of allNames) {
    if (id === home?.id) continue;
    if ([n.title, ...n.aliases].some((t) => mentions(textLower, t))) matched.add(id);
  }
  const parentOf = new Map<number, number | null>();
  const queue = [...matched];
  const included = new Set(matched);
  while (queue.length) {
    const id = queue.pop()!;
    const parents = await fetchActiveParentPagesAtIdx(id, N);
    parentOf.set(id, parents[0]?.id ?? null);
    for (const par of parents) {
      if (!included.has(par.id) && allNames.has(par.id)) {
        included.add(par.id);
        queue.push(par.id);
      }
    }
  }

  const ids = [...included].sort((a, b) => a - b);
  const bodies = await Promise.all(
    ids.map(async (id) => {
      const [content, infobox] = await Promise.all([
        fetchPageContentAtIdx(id, N),
        fetchPageInfoboxAtIdx(id, N),
      ]);
      return { id, content: content.content, infobox: infobox.content };
    }),
  );
  const pagesOut = bodies.map((b) => ({ id: b.id, title: allNames.get(b.id)!.title, content: b.content, infobox: b.infobox }));
  const pageIndex = bodies.map((b) => ({
    id: b.id,
    title: allNames.get(b.id)!.title,
    aliases: allNames.get(b.id)!.aliases,
    parentId: parentOf.get(b.id) ?? null,
    firstLine: firstLine(b.content),
  }));

  const context = {
    v: 1,
    serial: { id: serial.id, slug: serial.slug, name: serial.title },
    chapter: { id: chapter.id, idx: N, displayName: chapter.displayName },
    homePageId: home?.id ?? null,
    source: { url: capture.url, title: capture.title, textSha256: sha256(capture.text) },
    chapterText: capture.text,
    pageIndex,
    pages: pagesOut,
    existingSynopsis: existingSynopsis?.trim() ? existingSynopsis : null,
    exportedAt: new Date().toISOString(),
  };

  const dir = path.join(".ingest", chapterDirName(chapter.displayName));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "capture.json"), JSON.stringify(capture, null, 2));
  const contextRaw = JSON.stringify(context, null, 2);
  writeFileSync(path.join(dir, "context.json"), contextRaw);

  console.log(
    `\nWrote ${dir}/context.json - ${pageIndex.length} indexed pages (${matched.size} mentioned + parents), ~${Math.round(contextRaw.length / 4 / 1000)}k tokens.`,
  );
  console.log(`Next, in a fresh Claude Code session: /ingest-chapter ${dir}/context.json`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
