---
name: ingest-chapter
description: Read an exported chapter context (.ingest/<chapter>/context.json) and write spoiler-safe wiki proposals (synopsis, new pages, page updates) to proposals.json for admin review. Use when the user runs /ingest-chapter <path to context.json>.
---

# /ingest-chapter

Input: the path to a `context.json` made by `scripts/ingest/export-context.ts`.
Output: `proposals.json` in the same directory. Nothing is written to the database. The admin reviews every proposal in `scripts/ingest/review.ts`.

Do all work in this session. Do not use subagents.

## Context file

- `chapter`: the target chapter (`id`, `idx`, `displayName`). Every change is stamped at this chapter.
- `chapterText`: the full chapter. This is your only source of new facts.
- `pageIndex`: the wiki pages that the chapter mentions (plus their parents): `id`, `title`, `aliases`, `parentId`, `firstLine`.
- `pages`: the current `content` (markdown body) and `infobox` of each indexed page, as of this chapter.
- `existingSynopsis`: a synopsis that already exists, or `null`.
- `homePageId`: the serial home page (the default parent for new pages).

## Rules

1. **Use only the chapter text and the context file.** Do not use what you know about the series from other sources. You may know later events; writing them is a spoiler.
2. **Every new fact has a verbatim citation** from `chapterText`. Copy the quote exactly (short, one or two sentences). The validator rejects quotes that are not in the chapter.
3. **Keep the structure and voice of each page.** Add to the section that fits. Write in past tense, in a neutral encyclopedic voice.
4. **Links:** use `[[page:Title]]` only for a title or alias in `pageIndex`, or the exact `title` of a new page that you propose (not its aliases; they are not stored). Use `[[page:Title|shown text]]` to change the text shown.
5. Only propose infobox changes as body text if they are needed; the review tool applies body edits only.
6. Do not duplicate facts that are already on a page.
7. Prefer fewer, correct proposals over many weak ones. Skip trivial mentions.

## Workflow

1. **Plan.** Read the chapter and `pageIndex`. Make a list of:
   - the main events, for the synopsis,
   - existing pages to update, each marked **major** (a significant development) or **minor** (one or two sentences, for example "appeared at the inn"),
   - new pages for named entities (characters, places, Skills, Classes, groups, items) that appear for the first time and matter to the story. Do not create a page for a title or alias that is already in `pageIndex`.
2. **Write.**
   - **Synopsis:** markdown, a few paragraphs, with `[[page:Title]]` links. Set `synopsis` to `null` if `existingSynopsis` is already complete.
   - **Minor updates:** usually one `append` or `insert_after` edit with the one or two sentences.
   - **Major updates:** edit operations, never the full body:
     - `{ "op": "append", "text": "..." }` adds to the end of the body.
     - `{ "op": "insert_after", "anchor": "## History", "text": "..." }` — `anchor` is an exact existing line that occurs once. After a heading, the text goes at the end of that section.
     - `{ "op": "replace", "find": "...", "with": "..." }` — `find` must occur exactly once in the current content.
   - **New pages:** full body (a lead sentence, then sections if useful), `aliases` (other names used in the chapter; for the admin's reference only), `parentPageId` (an indexed category page id such as "Characters", another new page's `tempId`, or omit for the home page), and a unique `tempId` such as `"new-1"`.
   - Every proposal has `citations` (`{ "quote", "note" }`) and a one or two sentence `changeSummary`. Give each updated page one entry in `updates` (put all its edits together).
3. **Header fields.**
   - `chapterId`: `context.chapter.id`.
   - `contextSha256`: run `sha256sum <context.json>` and use the hex value.
   - `promptVersion`: run `git log -1 --format=%h -- .claude/skills/ingest-chapter`.
4. **Write** `proposals.json` next to `context.json`. The format is in `proposals.schema.json` in this skill directory.
5. **Validate.** Run `node scripts/ingest/validate.mjs <context.json> <proposals.json>`. Fix every `FAIL` line and run it again until it prints `OK`.
6. Tell the admin the counts and the next step:
   `npx tsx scripts/ingest/review.ts <chapter dir>`
