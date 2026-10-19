# Chapter ingest workflow

How to fill in the wiki from a chapter's text with the LLM-assisted ingest tools in `scripts/ingest/`. Working files go in `.ingest/<chapter>/`, which is gitignored.

## One-time setup

1. **Create a local copy of the database.** Set `DEV_DATABASE_URL` in `.env.local` to a local Postgres (start one with `scripts/start-db.ps1`), then copy production into it with `scripts/clone-db.sh` (see `scripts/README.md`).
2. **Set up `.env.local` for the ingest tools.** The scripts and the review page pick the database the same way the app does: `DB_ENV=dev` uses `DEV_DATABASE_URL`, `DB_ENV=prod` uses `DATABASE_URL`. Pass `--db=dev` or `--db=prod` to a script to override `DB_ENV` for one run. The review page also needs `ADMIN_TOOLS_ENABLED=true` and your email in `SITE_ADMIN_EMAILS` (see `.env.local.example`). The old `.env.ingest` file is no longer read.
3. **Install the bookmarklet.** Make a new browser bookmark. For its URL, paste the code in `scripts/ingest/bookmarklet.js` starting at `javascript:`. If your browser needs it on one line, minify it first. Paste it again each time the file changes.

## For each chapter

4. **Create the chapter in the wiki** if it is not there yet (in the serial editor). The export needs the chapter to exist already.
5. **Capture:** open the chapter on wanderinginn.com, either the normal page or the browser's reader view, and click the bookmarklet. The chapter capture (JSON) is copied to your clipboard.
6. **Export the context:**
   ```bash
   npx tsx scripts/ingest/export-context.ts --serial wandering-inn --clipboard
   ```
   If it prints `Could not read the clipboard`, none of the clipboard commands worked (`powershell.exe`, `pbpaste`, `wl-paste`, `xclip`). On WSL, make sure `powershell.exe` is on your `PATH`. On Linux, install `wl-clipboard` or `xclip`. Or skip the clipboard: paste the capture into a file and give the file path in place of `--clipboard`:
   ```bash
   npx tsx scripts/ingest/export-context.ts --serial wandering-inn .ingest/capture.json
   ```
   If the bookmarklet did not show the `PlotArmor: copied ...` alert, the copy did not happen. Click on the page to give it focus, then click the bookmarklet again.

   Confirm the chapter it matched. If it finds no match (for example, a reader-view capture with an unusual title), add `--chapter <name>`. This writes `.ingest/<chapter>/context.json` (for example `.ingest/9.12-E/`), which holds the wiki as a reader sees it at that chapter.

   **Which pages go into the context.** All pages are read at that chapter, so nothing from a later chapter is included.
   - Pages whose title or alias appears in the chapter text, pages introduced at the chapter, and the parents of both.
   - **Related pages**, which catch pages that the chapter names differently (for example "the Dragon" for `cave-dragon`):
     - Pages linked from the synopses of the last 3 chapters are always included.
     - A page is also included when two of these signals agree: a synopsis link, a link from a page that the chapter mentions, or a word of its title that the chapter uses (such as "inn" in "An Abandoned Inn").
     - Each included page lists its signals in `relatedBy`.
   - Weaker matches (one signal only) are not exported in full. They are listed in `candidates` in `context.json`.

   To add pages yourself:
   - **At export time:** add `--include cave-dragon,an-abandoned-inn`.
   - **To an existing context,** for example a page you created after the export:
     ```bash
     npx tsx scripts/ingest/add-context.ts .ingest/<chapter>/ cave-dragon an-abandoned-inn
     ```
     If `proposals.json` exists, the script also updates its `contextSha256`.
   - **To search for a page** as a reader sees it at that chapter:
     ```bash
     npx tsx scripts/ingest/lookup.ts .ingest/<chapter>/ dragon inn
     ```
     Each hit shows `inContext`, which tells you whether the page is already in the context.
7. **Generate proposals:** start a **new** Claude Code session and run:
   ```
   /ingest-chapter .ingest/<chapter>/context.json
   ```
   Before it writes anything, the skill looks for entities and `candidates` that are not in the context. It runs `lookup.ts` and adds real matches with `add-context.ts`, so an existing page gets an update, not a duplicate new page. It then writes `proposals.json` and runs the validator on it. To run the validator again yourself: `npx tsx scripts/ingest/validate.ts <context.json> <proposals.json>`.
8. **Review:** run `npm run dev:dev` (or `npm run dev:prod`), sign in, and open `/admin/ingestion`. Pick the chapter batch. Set the target database with the toggle at the top of the admin pages. It must be the database that the context was exported from, or approvals are refused.

   Each proposal shows a word diff (or the rendered page, through the same renderer as the wiki), ✅/⚠️ badges for its quotes, and any validation problems. For each proposal, choose approve, edit, or reject:
   - **Turn on dry run first** to look without writing. Dry-run decisions are logged but do not block the real approval later.
   - **Approve new pages first.** A synopsis or update that links to a new page stays blocked until that page is approved.
   - Each approval is written right away, at that chapter, in its own transaction.
   - **Edit** opens the wiki editor on the body and infobox. If an edit operation cannot be applied, the proposal stays blocked until you fix the text by hand.
   - If a page changed after the export, you get a "Stale (409)" error. Refresh the page with `add-context.ts` and regenerate the proposal.
   - Links are checked against every page that exists in the database now. So a link to a page that is not in the context can still resolve. `validate.ts` works offline and reports such links as failures.
   - The page reloads by itself when `proposals.json` changes. Open edits are kept.
   - Every decision is logged in `.ingest/<chapter>/decisions.json`.
9. **Check the result** in the app against the same database. Do this for the first few chapters before you ingest into production.

## Limits

- Aliases for new pages are not saved. Links to a new page must use its exact title.
- The review page keeps one update per page for each chapter. After an update is approved, make more changes to that page in the wiki editor.
