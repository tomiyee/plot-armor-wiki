# CLAUDE.md

## Commands

```bash
npm run dev                          # start Next.js dev server
rtk npm run build                    # production build
rtk npm run lint                     # run ESLint
rtk npx drizzle-kit generate         # generate migration after schema changes
rtk npx drizzle-kit migrate          # apply pending migrations
```

### RTK command prefixes (token savings)

Always prefix these shell commands with `rtk` to compress output:

```bash
rtk git <args>        # instead of: git <args>
rtk grep <args>       # instead of: grep <args>
rtk find <args>       # instead of: find <args>  (simple paths/names only — no -not, -exec, or other compound predicates; use plain `find` for those)
rtk ls <args>         # instead of: ls <args>
rtk gh <args>         # instead of: gh <args>
rtk read <file>       # instead of: cat <file>
```

### Schema change workflow

Whenever `src/db/schema.ts` changes: generate migration → apply → commit schema + migration + `drizzle/meta/` together.

Local dev: set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_URL` in `.env.local`, then `.\scripts\start-db.ps1` to create/start the Postgres container.

No test runner configured.

## Architecture

PlotArmor is a spoiler-safe wiki platform. Users set a **chapter cutoff** per serial and see only content introduced at or before that chapter.

### URL structure

```
/                    # home
/help                # static help & documentation page
/{serial}            # serial home (metadata + home wiki page)
/{serial}/new        # new wiki page form
/{serial}/{slug}     # wiki page
```

### Tech stack

| Layer         | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| Framework     | Next.js 16 (App Router, SSR)                                 |
| Database      | PostgreSQL (serverless)                                      |
| ORM           | Drizzle ORM                                                  |
| Auth          | Auth.js (NextAuth v5) — Google OAuth, Drizzle adapter        |
| Search        | PostgreSQL full-text search (tsvector) — not yet implemented |
| Markdown      | `@mdxeditor/editor` (WYSIWYG edit) + `react-markdown` (render) |
| Styling       | Tailwind CSS v4                                              |
| UI components | Shadcn UI (Button, Input, Select, Dialog) + custom Text      |
| Hosting       | Vercel                                                       |

### Core data pattern: single-timestamp versioning

All wiki page content is chapter-versioned. Each revision carries a `chapter_id`. At most one revision per `(page, section, chapter)` (enforced by PK). Read content at index N = highest `chapter.idx ≤ N`:

```sql
SELECT ... GROUP BY section_id HAVING chapters.idx = MAX(chapters.idx)
WHERE page_id = ? AND chapters.idx <= N
```

**Page structure** (sections, infobox sections) is wall-clock versioned (`created_at`/`deleted_at`).
**Page content** is chapter-versioned. Stable IDs on `page_sections`/`page_infobox_sections` decouple content from renames/reorders.

### Server/Client Component boundary

Chapter selector = Client Component (reactive). Everything else (page body, floater, search) = Server Components using cookie-read cutoff. Wrong boundary → stale renders or unnecessary client JS.

### Progress state

- **Anonymous** — `localStorage` per serial.
- **Logged-in** — `user_progress` table (`user_id`, `serial_id`, `chapter_id`).

First-time visitors default to chapter 1 with a callout to update.

### Spoiler filtering

- Pages with `intro_chapter_id` > cutoff: fully hidden, title withheld.
- Search: excludes those pages server-side (same SQL filter).

### Data Access Layer (DAL)

All DB read queries live in `src/data/`, organized by domain. **Never write a raw `db.select()` directly in a page or layout component — always go through a DAL function.** Before adding a new query, check whether a DAL function already covers the need.

Each domain lives in `src/data/<domain>/queries.ts`:

- **`serials/`** — serial lookup by slug, listing all serials, fetching author/admin membership lists.
- **`chapters/`** — chapter and volume lookups by id/idx, full volume+chapter tree for a serial, progress cutoff resolution.
- **`pages/`** — page lookups by slug or id (live and at-chapter-idx variants), page listings (all, searchable, deleted, parent, home), chapter-filtered content (sections, infobox rows, child pages, title entries), and shared subquery builder helpers used across page queries.
- **`templates/`** — template listings per serial.

**Adding a new query:** place it in the file whose domain it belongs to (e.g. a new page lookup goes in `src/data/pages/queries.ts`). Add a JSDoc block with `@example`. Import types from `@/types`, not from the DAL files themselves.

Write mutations (inserts/updates/deletes) directly in the Server Action that owns the operation — they are not centralized in the DAL.

### Key files

| File | Purpose / non-obvious notes |
| ---- | --------------------------- |
| `spec.md` | Canonical product + data model spec. Consult before changing data model or spoiler logic. |
| `src/db/schema.ts` | Drizzle table definitions; source of truth. |
| `src/app/[serial]/layout.tsx` | Fetches serial/volumes/chapters/home-page children; injects `<ChapterSelector>` + `<SerialTOCDrawer>` via `<SerialNavInjector>`. |
| `src/app/[serial]/actions.ts` | Volume/chapter CRUD + reorder. Reorder reassigns `chapters.idx`; no version repair needed (revisions keyed by `chapter_id`). |
| `src/app/[serial]/[page]/PageEditor.tsx` | Client Component owning page body. Edit mode: `<WikiLinkMDEditor>` per section, "Writing as of:" chapter selector, calls `getPageContentAtChapter` on chapter change. |
| `src/app/[serial]/[page]/actions.ts` | `savePageContent` (upserts at target chapter) + `getPageContentAtChapter` (pre-fills edit drafts). |
| `src/app/[serial]/[page]/suggestionActions.ts` | Page suggestion workflow (submit/approve/reject/query). Also contains `getSectionsAtChapter` which pre-fills the suggestion form when the target chapter changes. |
| `src/app/[serial]/chapter/[chapterIdx]/synopsisSuggestionActions.ts` | Synopsis suggestion workflow; approve writes to `chapterSynopses`. |
| `src/lib/auth-guard.ts` | `isSerialAdmin`/`isAuthenticated` for Server Components; `requireSerialAdmin`/`requireAuthenticated` (throw on failure) for Server Actions. |
| `src/components/ChapterSelector.tsx` | Reads/writes progress via `usePersistedStore` + mirrors to cookie for SSR. On first visit shows a spoiler callout `<Popover>`. |
| `src/components/WikiLinkMDEditor.tsx` | MDXEditor WYSIWYG + `[[page:Name]]`/`[[chapter:Name]]` autocomplete. Custom Lexical node handles wiki-link syntax end-to-end. |
| `src/components/SerialEditor.tsx` | Volume/chapter edit UI with drag-and-drop reorder (`@dnd-kit`). Uses the serial's type names (e.g. "Episode"/"Season"). |
| `src/components/ui/MarkdownRenderer.tsx` | Single source of truth for markdown styling. No `@tailwindcss/typography` — explicit Tailwind classes. Accepts `serialSlug` for wiki links, `sm` for compact mode. |
| `src/hooks/useServerAction.ts` | Wraps a Server Action in `useTransition` + `router.refresh()`. Use in all Client Components calling Server Actions. |
| `src/hooks/usePersistedStore.ts` | `useState`-compatible, backed by `localStorage`. SSR-safe via `useSyncExternalStore`, cross-tab via `storage` event. |
| `src/lib/serial-types.ts` | `ChapterType`/`VolumeType` types, arrays, parsers, Select options. Single source of truth — don't duplicate. |

### React import conventions

Always import React APIs as named imports — never use the `import * as React` namespace:

```ts
// ✅ correct
import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

// ❌ wrong
import * as React from "react";
// React.useState, React.useEffect, React.useCallback, etc.
```

### UI component conventions

Always use design-system components instead of bare HTML:

| Instead of                                | Use                                              |
| ----------------------------------------- | ------------------------------------------------ |
| `<input>`                                 | `<Input>` from `@/components/ui/input`           |
| `<select>`                                | `<Select>` from `@/components/ui/Select`         |
| `<button>`                                | `<Button>` from `@/components/ui/button`         |
| `<h1>`–`<h4>`, `<p>`, `<label>`, `<span>` | `<Text variant="…">` from `@/components/ui/Text` |

### JSDoc conventions

All exported components, hooks, and helpers must have a JSDoc block. Explain the non-obvious WHY — not what the name already says. Omit `@param`/`@returns` when types are self-documenting.

Add `@example` only when the behavior is non-obvious or the usage has tricky patterns (e.g. two-mode APIs, required call order, SSR caveats). Skip it when the signature makes usage self-evident.

**Exception:** Skip JSDoc entirely for functions bespoke to a single file (not exported for reuse) when name + signature are self-documenting.

```ts
/**
 * One-line summary of purpose or key constraint.
 *
 * @example
 * const [val, setVal] = usePersistedStore("key", defaultValue);
 */
```

### New component conventions

Every new component must:

1. **Declare an explicit named props type** — `type FooProps = { ... }` or `interface FooProps { ... }`. Never inline the type in the function signature.
2. **Add a one-line JSDoc comment to each explicitly-declared prop** — document only props that are unique to this component (not ones inherited via `& ComponentProps<"div">`).
3. **Use the `props` destructuring pattern** in the function body:
   ```ts
   export function Foo(props: FooProps) {
     const { bar, baz = "default", ...rest } = props;
   ```

See `src/components/ui/Box.tsx` for the canonical reference.
