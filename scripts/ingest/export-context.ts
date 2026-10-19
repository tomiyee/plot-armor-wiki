/**
 * Exports a spoiler-safe context.json for the /ingest-chapter Claude Code skill.
 *
 *   npx tsx scripts/ingest/export-context.ts --serial wandering-inn <capture.json | --clipboard> [--chapter "9.12 E"]
 *     [--include cave-dragon,an-abandoned-inn]
 *
 * 1. Reads the bookmarklet capture (file or clipboard).
 * 2. Detects the matching chapter (title, then URL slug) and ALWAYS asks for
 *    confirmation. Never creates chapters.
 * 3. Reads the wiki at chapter idx N through the DAL (the same filters readers
 *    use, so nothing from later chapters leaks) and writes
 *    `.ingest/<chapter>/capture.json` + `context.json`.
 *
 * `--include <slug,...>` (repeatable) adds pages the automatic mention match
 * missed. A page not yet introduced at chapter N is still read at idx N, so
 * only its title and any revisions at or before N are exported.
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
import { countPageContentRevisionsAtChapter, fetchSerialHomePage } from "@/data/pages/queries";
import { buildContextPages, findRelatedPages, loadPageNames, mentions, withParents } from "./lib/contextPages";
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
  const args: { serial?: string; chapter?: string; clipboard: boolean; file?: string; include: string[] } = {
    clipboard: false,
    include: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--serial") args.serial = argv[++i];
    else if (a === "--chapter") args.chapter = argv[++i];
    else if (a === "--clipboard") args.clipboard = true;
    else if (a === "--include") args.include.push(...argv[++i].split(",").map((x) => x.trim()).filter(Boolean));
    else args.file = a;
  }
  return args;
}

function readClipboard(): string {
  const cmds = [
    // Force UTF-8 output: the default console code page best-fit maps curly
    // quotes (“ ”) to a straight `"`, which breaks the capture's JSON strings.
    // The absolute path covers WSL setups without the Windows PATH appended.
    ...["powershell.exe", "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"].map(
      (exe) =>
        `${exe} -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw"`,
    ),
    "pbpaste",
    "wl-paste",
    "xclip -selection clipboard -o",
  ];
  const failures: string[] = [];
  for (const cmd of cmds) {
    try {
      return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const err = e as { status?: number; stderr?: string; message: string };
      const detail = err.stderr?.trim() || err.message.split("\n")[0];
      failures.push(`  ${cmd.split(" ")[0]} (exit ${err.status ?? "?"}): ${detail}`);
    }
  }
  throw new Error(
    `Could not read the clipboard - save the capture to a file instead.\n${failures.join("\n")}`,
  );
}

/** Best-effort clipboard write; returns false when no clipboard tool works. */
function writeClipboard(text: string): boolean {
  const cmds = [
    "clip.exe",
    "/mnt/c/Windows/System32/clip.exe",
    "pbcopy",
    "wl-copy",
    "xclip -selection clipboard",
  ];
  for (const cmd of cmds) {
    try {
      execSync(cmd, { input: text, stdio: ["pipe", "ignore", "ignore"], timeout: 5000 });
      return true;
    } catch {
      // try the next tool
    }
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serial || (!args.file && !args.clipboard)) {
    console.error(
      'usage: npx tsx scripts/ingest/export-context.ts --serial <slug> <capture.json | --clipboard> [--chapter "<display name>"] [--include <slug,...>]',
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
  const [{ visible, names, include }, home] = await Promise.all([
    loadPageNames(serial.id, N),
    fetchSerialHomePage(serial.id),
  ]);
  const textLower = capture.text.toLowerCase();

  // Pages introduced at this chapter are always indexed, even when the text
  // never names them verbatim: an admin may have created them already, and
  // the skill must update them instead of proposing duplicates.
  const introducedHere = new Set(visible.filter((p) => p.introChapterId === chapter.id).map((p) => p.id));
  const matched = new Set<number>();
  for (const [id, n] of names) {
    if (id === home?.id) continue;
    if (introducedHere.has(id) || [n.title, ...n.aliases].some((t) => mentions(textLower, t))) matched.add(id);
  }
  // Admin-requested pages the mention match missed.
  const forced = await include(args.include);
  for (const id of forced) matched.add(id);

  // Pages named differently in the text ("the Dragon" for Cave Dragon).
  const related = await findRelatedPages({
    names,
    matched,
    homeId: home?.id ?? null,
    textLower,
    N,
    previousChapters: chapterList.filter((c) => c.idx < N).sort((a, b) => a.idx - b.idx),
  });
  for (const id of related.include) matched.add(id);

  const parentOf = await withParents(matched, names, N);
  const { pageIndex, pages: pagesOut } = await buildContextPages(parentOf, names, N, { introducedHere, forced, related: related.reasons });

  const context = {
    v: 1,
    serial: { id: serial.id, slug: serial.slug, name: serial.title },
    chapter: {
      id: chapter.id,
      idx: N,
      displayName: chapter.displayName,
      // `{{ref|…}}` token that cites this chapter; the category must be the serial's chapter type.
      refToken: `${serial.chapterType}:${chapter.displayName}`,
    },
    homePageId: home?.id ?? null,
    source: { url: capture.url, title: capture.title, textSha256: sha256(capture.text) },
    chapterText: capture.text,
    pageIndex,
    pages: pagesOut,
    // Related pages not exported in full; add one with add-context.ts.
    candidates: related.candidates,
    existingSynopsis: existingSynopsis?.trim() ? existingSynopsis : null,
    exportedAt: new Date().toISOString(),
  };

  const dir = path.join(".ingest", chapterDirName(chapter.displayName));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "capture.json"), JSON.stringify(capture, null, 2));
  const contextRaw = JSON.stringify(context, null, 2);
  writeFileSync(path.join(dir, "context.json"), contextRaw);

  console.log(
    `\nWrote ${dir}/context.json - ${pageIndex.length} indexed pages (${matched.size} mentioned, related, introduced here or --include'd + parents; ${introducedHere.size} introduced here; ${related.include.size} related), ${related.candidates.length} candidates, ~${Math.round(contextRaw.length / 4 / 1000)}k tokens.`,
  );
  const command = `/ingest-chapter ${dir}/context.json`;
  const copied = writeClipboard(command);
  console.log(`Next, in a fresh Claude Code session: ${command}${copied ? " (copied to clipboard)" : ""}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
