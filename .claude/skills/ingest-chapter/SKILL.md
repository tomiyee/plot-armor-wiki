---
name: ingest-chapter
description: Read an exported chapter context (.ingest/<chapter>/context.json) and write spoiler-safe wiki proposals (synopsis, new pages, page updates) to proposals.json for admin review. Use when the user runs /ingest-chapter <path to context.json>.
---

# /ingest-chapter

Input: the path to a `context.json` made by `scripts/ingest/export-context.ts`.
Output: `proposals.json` in the same directory. Nothing is written to the database. The admin reviews every proposal in `scripts/ingest/review.ts`.

Do all work in this session. Do not use subagents.

## Context file

- `chapter`: the target chapter (`id`, `idx`, `displayName`, `refToken`). Every change is stamped at this chapter. `refToken` is the token that cites it in a reference, for example `Chapter:1.00` (rule 6).
- `chapterText`: the full chapter. This is your only source of new facts.
- `pageIndex`: the wiki pages that the chapter mentions, pages related to it (see `relatedBy`), every page introduced at this chapter (even if the text does not name it exactly), and their parents: `id`, `title`, `slug`, `aliases`, `parentId`, `introducedAtChapter`, `firstLine`.
  - `introducedAtChapter: true` means an admin already created the page at this chapter. Its content can be a stub or empty.
  - `relatedBy` lists why a page was included although the chapter does not name its title exactly: `synopsis:<chapter>` (linked from a recent chapter synopsis), `linkedFrom:<slug>` (linked from a page the chapter mentions), `titleWord:<word>` (the chapter uses a word of its title, such as "Dragon" for "Cave Dragon"). Check that the chapter is really about that page before you use it.
  - `includedByAdmin: true` means the admin asked for this page (`--include`). It can be a page that is introduced in a later chapter, so its content can be empty. Link to it and update it like any other indexed page, but use only facts from this chapter.
- `pages`: the current `content` (markdown body) and `infobox` (markdown, `""` when the page has none) of each indexed page, as of this chapter. When a page already has a revision at this chapter, it also has `previous`: the earlier `content` and/or `infobox` as of the chapter before. A field is there only when that field has a revision at this chapter. That revision replaced `previous`, so check `previous` for facts the current text dropped by mistake, and restore any that are still true, together with their refs (rule 6).
- `candidates`: related pages that were not exported in full, with `slug`, `title`, `firstLine` and `reasons` (same forms as `relatedBy`). They are weaker matches.
- `existingSynopsis`: a synopsis that already exists, or `null`.
- `homePageId`: the serial home page (the default parent for new pages).

## Rules

1. **Use only the chapter text and the context file.** Do not use what you know about the series from other sources. You may know later events; writing them is a spoiler.
2. **Every new fact has a verbatim citation** from `chapterText`. Copy the quote exactly (short, one or two sentences). The validator rejects quotes that are not in the chapter.
3. **Keep the structure and voice of each page.** Add to the section that fits. Write in past tense, in a neutral encyclopedic voice.
4. **Links use the page slug, never the title:** `[[page:an-abandoned-inn]]`, not `[[page:An Abandoned Inn]]`. The app finds a page by its slug (exact match) and shows the page's own title as the link text. So:
   - For a page in `pageIndex`, copy its `slug` exactly. Never make it from the title: a slug comes from the page's first name, so a renamed page keeps its old slug (the page "Erin Solstice" has the slug `erin`). Existing links in `pages` can be wrong; do not copy a link target from them. If `pageIndex` has no `slug` values, stop and ask the admin to re-export the context.
   - For a new page that you propose, the slug is made the same way from its `title`. Do not link to aliases; they are not stored.
   - Class and Skill pages have brackets in their title (`[Innkeeper]`). Brackets cannot be in a link target, and the slug drops them: `[[page:innkeeper]]`, `[[page:basic-cleaning]]`. **Do not add an alias** to these links; the page shows its title with the brackets as the link text.
   - Add `|shown text` only when the sentence needs different text, for example `[[page:erin-solstice|Erin]]`. Do not add it to repeat the title.
   - The validator checks every link (rule 5 applies). Run it with `--links` to see where each link goes.
5. **No circular dependencies between new pages.** The admin approves one proposal at a time, and a new page can only be approved after every new page it links to or uses as its parent exists. So links between new pages go in one direction only: from the more specific page to the more general one (a Skill page links to its Class page, a child links to its parent; not back). List `newPages` so that each page comes after every new page it depends on. Existing pages, the synopsis and updates may link to any new page.
6. **Cite the chapter with references in the page text.** The `citations` field is for the admin only; readers see the page body. The app renders `{{ref|token|quote=...}}` as a superscript `[1]` that shows the quote on hover, and it adds the reference list at the end of the page by itself. In every new page and every page update:
   - **Use refs only for concrete, significant facts:** what an entity is, where it is, key history, important events, abilities, relationships. Do not use a ref to confirm a minor detail (for example, that Erin used a dustrag and a bucket to clean the common room). If a detail is too minor for a ref, it is usually too minor for the page too (rule 11).
   - **Class and Skill acquisitions need no ref.** Link to the chapter instead: "Erin obtained the [[page:innkeeper]] Class in [[Chapter:1.00]]." (use `[[<refToken>]]`). Use a ref with a quote only when the sentence states what the Class or Skill does, or how it was used or had an effect after the acquisition.
   - **Class levels get a ref.** When you state a character's Class level, put a ref after it with the quote that shows or supports that level (for example the level-up message), not a `[[Chapter:...]]` link: `* [[page:innkeeper]] Level 4{{ref|Chapter:1.02|quote=%5BInnkeeper Level 4!%5D}}`. If the chapter does not state the level, give the level as an estimate only if a quote supports it, and cite that quote.
   - Put a ref directly after each sentence or list item that has a significant new fact, with no space before it: `...burned her right side.{{ref|Chapter:1.00|quote=The jet of violet flame had shot wide of her by a mile, but it had still broiled her right side.}}`
   - The token is `chapter.refToken` (if it is missing, use `Chapter:<displayName>`). New refs cite only this chapter.
   - **Keep existing refs.** When an edit touches a sentence that already has a ref (in the current text or in `previous`), keep that ref exactly as it is, also when it cites an earlier chapter. Replace it only if you change what the sentence states, or if a quote from this chapter supports the statement better. The validator accepts an earlier-chapter ref only when it is copied unchanged from the page's current or `previous` text.
   - Every ref has at least one `quote=` that supports the fact, copied exactly from `chapterText` (one or two sentences). To attach more quotes, repeat the parameter: `|quote=...|quote=...`.
   - Percent-encode these characters in a quote: `%`, `|`, `{`, `}`, `*`, `_`, `[`, `]`, the backtick, `<`, `>`, `&`, `~` and `\` (for example `[` is `%5B`, `]` is `%5D`, `*` is `%2A`, `_` is `%5F`). The validator prints the correct encoded form if a quote is wrong.
   - Do not add a references section or a `## Quotes` section. Use `[[Chapter:...]]` links only for Class and Skill acquisitions, as described above.
   - `{{ref|page:Title}}` counts as a link to that page (rule 4 and rule 5 apply).
7. **Infoboxes are optional.** Not every page has one. Give an infobox to a character page. Give one to another page (a place, a group, an item) only if it already has one or if a short list of facts is clearly useful. Never add an infobox only to fill it with "Unknown".
   - **Format:** a two-column markdown grid with no header row. GFM needs a header row, so write an empty one (`| | |`) followed by the separator; the app hides an empty header and shows only the body rows. Each body row is one field: the bold label in the left cell, the value in the right cell. Use `N/A` or `Unknown` for a field that has no value yet:
     ```
     | | |
     | --- | --- |
     | **Aliases** | {{list:The Innkeeper;The Human}} |
     | **Species** | [[page:human]] |
     | **Status** | Alive |
     ```
   - **Lists in a cell:** a table cell cannot hold a real markdown list or a line break. When a field has more than one value, or a value that could later grow into several (`Aliases`, `Class(es)`, `Affiliation`, `Family`, `Occupation`, and any similar field), write it as a bulleted cell list: `{{list:item one;item two}}`. The app shows each item as a bullet on its own line. Use a cell list for such a field even when it has only one item now.
     - Separate items with `;`. In each item, percent-encode these characters: `%`, `|`, `;`, `{`, `}`, `*`, `_`, `[`, `]`, the backtick, `<`, `>`, `&`, `~`, `\`, `:` and `@` (for example `[` is `%5B`, `]` is `%5D`, `:` is `%3A`, `;` is `%3B`). So a link item `[[page:erin-solstice]]` is written `%5B%5Bpage%3Aerin-solstice%5D%5D`, and `Innkeeper (Lv. 12)` stays as it is.
     - Example: `| **Class(es)** | {{list:%5B%5Bpage%3Ainnkeeper%5D%5D (Lv. 12);%5B%5Bpage%3Amagician%5D%5D (Lv. 2)}} |`
     - Do not put a ref inside a cell list item; put it after the list in the same cell.
   - **Pipes in a cell:** a bare `|` ends the cell. Outside a cell list, escape every `|` in a value as `\|`, for example `[[page:erin-solstice\|Erin]]` and `{{ref\|token\|quote=...}}`.
   - **Character fields, in this order:** `Aliases`, `Class(es)`, `Location`, `Species`, `Gender`, `Status`, `Affiliation`, `Family`, `Occupation`, `Residence`.
     - `Status`: Alive, Dead, or another state (for example Undead).
     - `Location`: where the character is at the end of this chapter.
     - `Residence`: the place the character calls home, or where they sleep regularly (for example an inn). It can be the same as `Location`, but it is not always.
     - Use `[[page:slug]]` links for values that have a page (rule 4 and rule 5 apply). Put more than one value in a cell list, never in one cell separated by commas or line breaks.
   - For an existing infobox, keep its field names and order. If it still uses the older format (a `**Field**` line, a blank line, then the value), convert it to the grid, and turn any field with several values into a cell list. If an existing character infobox is missing one of the fields above, add it in the correct position.
   - Put the infobox in the `infobox` field, never in the body. On a new page, `infobox` is the full infobox. On an update, `infobox` is the **full replacement** of the current infobox: copy every unchanged field and value exactly (keep existing link forms such as `[[page:innkeeper]]`) and change only what this chapter changes. Omit `infobox` when nothing changes.
   - Refs in the infobox are optional. A changed value must be supported by a quote in `citations`.
   - An update can change only the infobox (omit `edits`), only the body, or both.
8. Do not duplicate facts that are already on a page.
9. Prefer fewer, correct proposals over many weak ones. Skip trivial mentions, but a named character is not a trivial mention (see the Plan step).
10. **Do not use em dashes (—)** in text that you write: page content, synopsis, and `changeSummary`. Use a comma, a colon, parentheses, or two sentences. Quotes inside a `{{ref|...}}` are exempt, because they must be verbatim. The validator rejects em dashes in all other text.
11. **Pages grow over many chapters; keep them to key facts.** A page records what is important and lasting about its subject: what it is, key traits, major events, and relationships. Put minor, chapter-specific details (what a character did step by step, the tools they used) in the chapter synopsis, not on the page. For example, "Erin cleaned the inn with a rag" belongs in the synopsis, not on the page for the inn. Before you add a sentence to a page, ask: will a reader of this page still need it after 100 more chapters?

## Workflow

1. **Plan.** Read the chapter and `pageIndex`. First, examine each page with `introducedAtChapter: true`. Find the entity in the chapter that it describes, also when the title is different from the name in the text (a full name, a nickname or a different spelling). Use that page for the entity: update it, and do not propose a new page for it. Then make a list of:
   - the main events, for the synopsis,
   - existing pages to update, each marked **major** (a significant development) or **minor** (one or two sentences, for example "appeared at the inn"),
   - new pages for named entities (characters, places, Skills, Classes, groups, items) that appear for the first time and matter to the story. Do not create a page for a title or alias that is already in `pageIndex`, or for an entity that an existing page (especially an `introducedAtChapter` page) already covers under a different name.
   - a new page for each character that is only named (not seen) in the chapter and has no page yet, for example a figure that another character mentions, such as "the Necromancer". Write a short page with only what the chapter says about the character (who mentions them and in what context), with a ref. Use the name that the chapter uses as the title. Give it an infobox only with fields the chapter supports; leave out the others.
   Before you write, find the missing pages. For each entity in your list that is not in `pageIndex`, and for each `candidates` entry that the chapter could be about, check whether a page exists:
   ```bash
   npx tsx scripts/ingest/lookup.ts <context dir> "<name>" ["<other name>" ...]
   ```
   It searches only pages visible at this chapter. If a hit is the entity, add it (it prints the page with `inContext: false`):
   ```bash
   npx tsx scripts/ingest/add-context.ts <context dir> <slug> [<slug> ...]
   ```
   Then read `context.json` again: the page is now in `pageIndex` and `pages`. Update that page instead of proposing a new one. Do all lookups before you write `proposals.json` (`add-context.ts` changes the file's hash). Do not add pages that the chapter is not about.
2. **Write.**
   - **Synopsis:** markdown with `[[page:slug]]` links. This is the place for the chapter's minor details (rule 11). Set `synopsis` to `null` if `existingSynopsis` is already complete. Use these `#` sections, in this order, and leave out a section that has nothing relevant:
     - `# tl;dr`: bullet points, one for each main event.
     - `# Synopsis`: a few paragraphs that tell the chapter.
     - `# Characters`: bullet points, one for each character that appears, with a `[[page:slug]]` link (every named character has a page or a proposed new page). Add "(named)" after a character that is only named and does not appear or act in the chapter, for example `* [[page:slug]] (named)`. A short note after the link is optional.
     - `# Locations`: bullet points, one for each place that appears or is named.
     - `# Classes`: bullet points, one for each Class that is mentioned or used in the chapter, with a `[[page:slug]]` link (no alias).
     - `# Skills`: bullet points, one for each Skill that is mentioned or used in the chapter, with a `[[page:slug]]` link (no alias).
     - `# Items`: bullet points, one for each notable item that appears or is named. Classes and Skills have their own sections above.
   - **Minor updates:** usually one `append` or `insert_after` edit with the one or two sentences.
   - **Major updates:** edit operations, never the full body:
     - `{ "op": "append", "text": "..." }` adds to the end of the body.
     - `{ "op": "insert_after", "anchor": "## History", "text": "..." }` — `anchor` is an exact existing line that occurs once. After a heading, the text goes at the end of that section.
     - `{ "op": "replace", "find": "...", "with": "..." }` — `find` must occur exactly once in the current content.
   - **Infobox changes:** for each character that appears, check `Location`, `Status`, `Class(es)`, `Occupation`, `Residence`, `Affiliation` and `Family` against the chapter, and propose `infobox` when one changes (rule 7).
   - **New pages:** full body (a lead sentence, then sections if useful; see the section lists below), an `infobox` if rule 7 calls for one, `aliases` (other names used in the chapter; for the admin's reference only), `parentPageId` (an indexed category page id such as "Characters", another new page's `tempId`, or omit for the home page), and a unique `tempId` such as `"new-1"`. Order them by dependency (rule 5).
   - **Sections for new pages and additions to existing pages.** Use `##` headings, in this order, and leave out a section that has nothing to say yet (rule 11). Add to a matching section that already exists instead of making a second one.
     - **Character pages:** `## Appearance`, `## Personality`, `## Background`, `## Abilities` (with `### Classes` and `### Skills` subsections), `## Equipment`, `## Chronology`, `## Trivia`.
     - **Chronology** (character and creature pages): keep it brief and only for core events that change the subject's story (arrival, a major fight, a new home, a death). Add at most one short sentence per chapter, and add nothing when the chapter is minor for that subject. For example, in a chapter where Erin only looks for food and escapes a monster, add one sentence at most, or nothing. Put the details in the synopsis.
     - **Species pages** (a race, species or kind of creature, such as Dragons, Goblins or Humans):
       - `## Physiology`, with `### Appearance`, `### Physical Qualities` (size, speed, diet, lifespan, reproduction and similar), `### Magical Qualities`, `### Special Abilities` and `### Weaknesses` subsections.
       - `## Subraces`, only if the species has subraces or variants.
       - `## Behavior and Culture`, with subsections only as notable, such as `### Personality`, `### Society`, `### Sexuality`, `### Warfare` or `### Religion`.
       - `## History`.
       - `## Relations`: how the species relates to other species, with a `[[page:slug]]` link to each one.
       - `## Trivia`.
       - Leave out a section or subsection that has nothing to say yet. Put what one individual did on that individual's page or in the synopsis, and keep only what it shows about the species. State the general fact in the body and let the ref quote carry the specific example: write `Dragons can breathe fire.{{ref|Chapter:1.00|quote=The jet of violet flame...}}`, not `Dragons can breathe fire. A sleeping Dragon's flame burned Erin.{{ref|...}}`.
     - **Creature pages** (one individual monster or animal): `## Appearance`, `## Abilities`, `## Chronology`, `## Trivia`.
     - **Class pages** (such as Innkeeper): `## Background` (what the class is and how it is gained), `## Powers and Abilities` (known subclasses or consolidations, and Skills associated with the class, grouped under `###` subsections as needed, such as `### Inn Skills` for Innkeeper Skills that affect the inn itself; link each Skill with `[[page:slug]]`), `## Notable Characters` (characters with the class, with a `[[page:slug]]` link to each one), `## Trivia`.
     - **Skill pages** (such as Basic Cleaning): `## Skill Effects and Capabilities` (what the Skill does), `## Notable Known Users` (characters with the Skill, with a `[[page:slug]]` link to each one), `## Skill Usage` (one bullet per chapter where the Skill is used, with the chapter and the effect of that use). Getting a Skill is not a use of it.
     - **Location pages** (one building or site, such as an inn, shop, cave or ruin): start with a brief summary of the place (one to three sentences) with no heading above it. Then `## Overview` (setting, surroundings, layout, and history), `## Staff` (only if the place is an establishment such as an inn, shop or guild hall: owners and workers, with a `[[page:slug]]` link to each one), `## Trivia`.
     - **Settlement pages** (a city, town or village): start with a brief summary with no heading above it. Then `## Geography` (where it is in relation to other known cities, towns or landmarks), `## Demographics`, `## History`, `## Layout` (notable known locations as relevant: businesses, public buildings, guilds, inns, taverns, streets), `## Government` (its form of government), `## Laws`, `## Military`, `## Notable Residents`, `## Trivia`.
     - Other pages (groups, items) have no fixed list. Use sections that fit, and keep the style of the existing pages.
   - Every proposal has `citations` (`{ "quote", "note" }`) and a one or two sentence `changeSummary`. Give each updated page one entry in `updates` (put all its edits together).
3. **Header fields.**
   - `chapterId`: `context.chapter.id`.
   - `contextSha256`: run `sha256sum <context.json>` and use the hex value.
   - `promptVersion`: run `git log -1 --format=%h -- .claude/skills/ingest-chapter`.
4. **Write** `proposals.json` next to `context.json`. The format is in `proposals.schema.json` in this skill directory.
5. **Validate.** Run `node scripts/ingest/validate.mjs <context.json> <proposals.json>`. Fix every `FAIL` line and run it again until it prints `OK`. Then run it with `--links` and check that each link goes to the page you mean (a link that resolves to the wrong page still passes).
6. Tell the admin the counts and the next step:
   `npx tsx scripts/ingest/review.ts <chapter dir>`
