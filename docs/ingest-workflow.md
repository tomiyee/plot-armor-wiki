# Chapter ingest workflow

How to fill in the wiki from a chapter's text with the LLM-assisted ingest tools in `scripts/ingest/`. Working files go in `.ingest/<chapter>/`, which is gitignored.

## One-time setup

1. **Make a local copy of the database.** Set `DEV_DATABASE_URL` in `.env.local` to a local Postgres. Then copy production into it with `scripts/clone-db.sh`.
2. **Set the admin variables.** In `.env.local`, set `ADMIN_TOOLS_ENABLED=true` and add your email to `SITE_ADMIN_EMAILS`.

The scripts and the review page read `.env.local`. They use `DB_ENV` to select the database, as the app does. To override `DB_ENV` for one script run, add `--db=dev` or `--db=prod`.

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
8. **Start the app:** `npm run dev:dev` (or `npm run dev:prod`). Sign in.
9. **Open** `/admin/ingestion` and select the chapter.
10. **Set the target database** with the toggle at the top of the page. It must be the database that the context came from. If it is not, the page refuses all approvals.
11. **Turn on dry run** to examine the proposals first. A dry run logs decisions but writes nothing. A dry-run approval does not block the real approval.
12. **Approve the new pages first.** A proposal that links to a new page stays blocked until you approve that page.
13. **Approve, edit, or reject** each proposal. Each card shows a word diff, a rendered preview, and ✅/⚠️ marks on the quotes. **Edit** opens the wiki editor.
14. **Check the result** in the app. Do this for the first few chapters before you write to production.

Notes about the review:
- Each approval writes immediately, at the chapter, in one transaction.
- If an edit operation does not apply, fix the text in the editor.
- A "Stale (409)" error means that the page changed after the export. Run `add-context.ts` for the page and make the proposal again.
- The page checks links against all pages in the database. `validate.ts` works offline, so it can report links that the page accepts.
- The page reloads in 2 seconds when `proposals.json` changes. Your open edits stay.
- The page logs each decision in `.ingest/<chapter>/decisions.json`.

## Limits

- Aliases for new pages are not saved. Links to a new page must use its exact title.
- The review page keeps one update per page for each chapter. After you approve an update, make more changes in the wiki editor.
