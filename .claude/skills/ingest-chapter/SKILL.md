---
name: ingest-chapter
description: Read an exported chapter context (.ingest/<chapter>/context.json) and write spoiler-safe wiki proposals (synopsis, new pages, page updates) to proposals.json for admin review. Use when the user runs /ingest-chapter <path to context.json>.
---

# /ingest-chapter

Input: the path to a `context.json` made by `scripts/ingest/export-context.ts`.
Output: `proposals.json` in the same directory. Nothing is written to the database. The admin reviews every proposal in `scripts/ingest/review.ts`.

Do all work in this session. Do not use subagents.

## Context file

- `chapter`: the target chapter (`id`, `idx`, `displayName`, `link`). Every change is stamped at this chapter. `link` is the wiki link that cites it, for example `[[Chapter:1.00]]`. If `link` is missing, use `[[Chapter:<displayName>]]`.
- `chapterText`: the full chapter. This is your only source of new facts.
- `pageIndex`: the wiki pages that the chapter mentions, every page introduced at this chapter (even if the text does not name it exactly), and their parents: `id`, `title`, `aliases`, `parentId`, `introducedAtChapter`, `firstLine`.
  - `introducedAtChapter: true` means an admin already created the page at this chapter. Its content can be a stub or empty.
- `pages`: the current `content` (markdown body) and `infobox` of each indexed page, as of this chapter.
- `existingSynopsis`: a synopsis that already exists, or `null`.
- `homePageId`: the serial home page (the default parent for new pages).

## Rules

1. **Use only the chapter text and the context file.** Do not use what you know about the series from other sources. You may know later events; writing them is a spoiler.
2. **Every new fact has a verbatim citation** from `chapterText`. Copy the quote exactly (short, one or two sentences). The validator rejects quotes that are not in the chapter.
3. **Keep the structure and voice of each page.** Add to the section that fits. Write in past tense, in a neutral encyclopedic voice.
4. **Links:** use `[[page:Title]]` only for a title or alias in `pageIndex`, or the exact `title` of a new page that you propose (not its aliases; they are not stored). Use `[[page:Title|shown text]]` to change the text shown.
5. **No circular dependencies between new pages.** The admin approves one proposal at a time, and a new page can only be approved after every new page it links to or uses as its parent exists. So links between new pages go in one direction only: from the more specific page to the more general one (a Skill page links to its Class page, a child links to its parent; not back). List `newPages` so that each page comes after every new page it depends on. Existing pages, the synopsis and updates may link to any new page.
6. **Cite the chapter in the page text.** The `citations` field is for the admin only; readers see the page body. In every new page and every page update:
   - Put the chapter link (`chapter.link`) at the end of each paragraph or list item that has a new fact: `... escaped the cave. ([[Chapter:1.00]])`.
   - Add one to three short, memorable quotes as markdown blockquotes, each copied exactly from `chapterText`, with an attribution line:
     ```
     > "It's not fair. Ever since I came to this world, everything's been going wrong."
     > — Erin Solstice, [[Chapter:1.00]]
     ```
     Put them in a `## Quotes` section (make it if the page has none). For narration, attribute to the chapter only (`> — [[Chapter:1.00]]`). A minor update can skip the quote but not the chapter link.
   - Do not cite other chapters. The validator checks that the chapter link is present and that every blockquote line is in the chapter.
7. Only propose infobox changes as body text if they are needed; the review tool applies body edits only.
8. Do not duplicate facts that are already on a page.
9. Prefer fewer, correct proposals over many weak ones. Skip trivial mentions.

## Workflow

1. **Plan.** Read the chapter and `pageIndex`. First, examine each page with `introducedAtChapter: true`. Find the entity in the chapter that it describes, also when the title is different from the name in the text (a full name, a nickname or a different spelling). Use that page for the entity: update it, and do not propose a new page for it. Then make a list of:
   - the main events, for the synopsis,
   - existing pages to update, each marked **major** (a significant development) or **minor** (one or two sentences, for example "appeared at the inn"),
   - new pages for named entities (characters, places, Skills, Classes, groups, items) that appear for the first time and matter to the story. Do not create a page for a title or alias that is already in `pageIndex`, or for an entity that an existing page (especially an `introducedAtChapter` page) already covers under a different name.
2. **Write.**
   - **Synopsis:** markdown, a few paragraphs, with `[[page:Title]]` links. Set `synopsis` to `null` if `existingSynopsis` is already complete.
   - **Minor updates:** usually one `append` or `insert_after` edit with the one or two sentences.
   - **Major updates:** edit operations, never the full body:
     - `{ "op": "append", "text": "..." }` adds to the end of the body.
     - `{ "op": "insert_after", "anchor": "## History", "text": "..." }` — `anchor` is an exact existing line that occurs once. After a heading, the text goes at the end of that section.
     - `{ "op": "replace", "find": "...", "with": "..." }` — `find` must occur exactly once in the current content.
   - **New pages:** full body (a lead sentence, then sections if useful), `aliases` (other names used in the chapter; for the admin's reference only), `parentPageId` (an indexed category page id such as "Characters", another new page's `tempId`, or omit for the home page), and a unique `tempId` such as `"new-1"`. Order them by dependency (rule 5).
   - Every proposal has `citations` (`{ "quote", "note" }`) and a one or two sentence `changeSummary`. Give each updated page one entry in `updates` (put all its edits together).
3. **Header fields.**
   - `chapterId`: `context.chapter.id`.
   - `contextSha256`: run `sha256sum <context.json>` and use the hex value.
   - `promptVersion`: run `git log -1 --format=%h -- .claude/skills/ingest-chapter`.
4. **Write** `proposals.json` next to `context.json`. The format is in `proposals.schema.json` in this skill directory.
5. **Validate.** Run `node scripts/ingest/validate.mjs <context.json> <proposals.json>`. Fix every `FAIL` line and run it again until it prints `OK`.
6. Tell the admin the counts and the next step:
   `npx tsx scripts/ingest/review.ts <chapter dir>`
