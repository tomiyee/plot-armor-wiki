# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start Next.js dev server
pnpm build        # production build
pnpm lint         # run ESLint
pnpm drizzle-kit generate   # generate migration after schema changes
pnpm drizzle-kit migrate    # apply pending migrations to Neon
```

### Schema change workflow

This project uses a **single squashed migration** strategy — there is always exactly one file in `drizzle/` (index `0000`). Whenever `src/db/schema.ts` changes:

1. Delete the existing `drizzle/0000_*.sql` file.
2. Run `npx drizzle-kit generate` to regenerate it from scratch.
3. Commit the new migration file together with the schema change and the updated `drizzle/meta/` files in one commit.

Never stack a second migration on top of the existing one. The squash approach keeps the migration history clean while the project is pre-launch and the DB can be wiped and rebuilt at any time.

For local development with Docker instead of Neon, set `DATABASE_URL` in `.env.local` to a `localhost` connection string, then:

```powershell
.\scripts\start-db.ps1   # create or start the local Postgres container
```

The script reads `DATABASE_URL` from `.env.local` and uses those values when creating the Docker container, so credentials are defined in one place.

No test runner is configured yet.

## Architecture

PlotArmor is a spoiler-safe wiki platform. Users set a **chapter cutoff** per serial and see only content introduced at or before that chapter.

### URL structure

```
/                           # home — search serials, create new wiki
/{serial}/{schema}          # schema index page (name, body description, page list)
/{serial}/{schema}/{page}   # wiki page
```

### Tech stack

Database, ORM, and home page UI layers are implemented. Auth, Search, and Markdown are not yet.

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, SSR) |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Drizzle ORM |
| Auth | Auth.js (NextAuth v5) |
| Search | PostgreSQL full-text search (tsvector) |
| Markdown | `@uiw/react-md-editor` (edit) + `react-markdown` (render) |
| Styling | Tailwind CSS v4 |
| UI components | Shadcn UI (Button, Input, Select, Dialog) + custom Text |
| Hosting | Vercel |

### Core data pattern: SCD Type 2 versioning

All wiki page content is chapter-versioned using closed-interval rows (`from_chapter_id`, `to_chapter_id` where `NULL` = current). To read content at chapter index N:

```sql
WHERE from_chapter_idx <= N AND (to_chapter_idx IS NULL OR to_chapter_idx > N)
```

**Schema structure** (sections, floater rows) is wall-clock versioned (`created_at`/`deleted_at`).  
**Page content** is chapter-versioned. These are separate axes.

Stable IDs on `schema_sections` and `schema_floater_rows` decouple content rows from renames/reorders.

### Server/Client Component boundary

The chapter selector in the navbar must be a **Client Component** (reactive to user input). Everything else — page body, floater, search results — should be **Server Components** rendering with the user's chapter cutoff fetched server-side. Getting this boundary wrong causes stale renders or unnecessary client JS.

### Progress state

- **Anonymous users** — chapter progress stored in `localStorage` per serial, no server row.
- **Logged-in users** — stored in `user_progress` table (`user_id`, `serial_id`, `chapter_id`). Auth.js session exposes `user_id` in Server Components.

First-time visitors on any serial default to chapter 1 and see a callout prompting them to update.

### Spoiler filtering rules

- **Pages** whose `intro_chapter_id` exceeds the user's cutoff are fully hidden — title withheld, placeholder message shown.
- **Search** excludes those pages entirely (server-side SQL filter, same query as the chapter range check).

### Key design files

- `spec.md` — canonical product and data model spec; consult before changing data model or spoiler logic.
- `src/db/schema.ts` — Drizzle ORM table definitions; source of truth for the data model.
- `src/db/index.ts` — Drizzle client (postgres.js driver); exports `db` for use in Server Components and API routes.
- `drizzle.config.ts` — Drizzle Kit config; reads `DATABASE_URL` from `.env.local`.
- `src/app/layout.tsx` — root layout with Geist fonts, Tailwind base, `<Navbar>`, and a full-height `overflow-y-auto` wrapper that prevents scrollbar layout shift when dialogs open.
- `src/components/ui/input.tsx` — Shadcn-style `<Input>` wrapping `<input>`; defaults `type` to `"text"`. Use this instead of bare `<input>`.
- `src/components/ui/select.tsx` — generic `<Select<T>>` backed by native `<select>`; accepts `options: Option<T>[]` with optional grouping via `children` and per-option `disabled`. Client Component. Use this instead of bare `<select>`.
- `src/components/ui/text.tsx` — `<Text>` typography component; accepts a `variant` prop (`h1`–`h4`, `body`, `muted`, `faint`, `label`) and an optional `as` prop to override the rendered element. Use this instead of bare heading/paragraph/label elements.
- `src/components/ui/dialog.tsx` — controlled Dialog component (`isOpen`/`onClose` props) with `DialogHeader`, `DialogBody`, `DialogFooter`, `DialogTitle`, `DialogDescription`, and `DialogClose`.
- `src/app/page.tsx` — home page; async Server Component that fetches all serials and passes them to `<SerialList>`.
- `src/app/new/page.tsx` — serial creation form (title, description, authors, splash art URL, volume type, chapter type).
- `src/app/new/actions.ts` — `createSerial` Server Action; inserts into `serials` and `serial_authors` (storing the computed slug, chapter type, and volume type), redirects to `/{slug}`.
- `src/app/[serial]/page.tsx` — serial detail page; resolves serial via `WHERE slug = ?`, lists chapters grouped by volume, delegates editing to `<SerialEditor>` and schema management to `<SchemaManager>`.
- `src/app/[serial]/actions.ts` — Server Actions for volume/chapter CRUD (`addVolume`, `addChapter`, `deleteVolume`, `deleteChapter`, `renameVolume`, `renameChapter`, `updateSerialTypes`, `reorderVolumes`, `reorderAllChapters`) and schema/section/floater-row CRUD (`addSchema`, `deleteSchema`, `renameSchema`, `updateSchema`, `addSection`, `deleteSection`, `renameSection`, `reorderSections`, `addFloaterRow`, `deleteFloaterRow`, `renameFloaterRow`, `reorderFloaterRows`).
- `src/app/[serial]/[schema]/page.tsx` — schema index page; resolves serial via slug and schema via `WHERE serial_id = ? AND name = ?`, renders `<SchemaIndexEditor>` and a list of pages linking to `/{serial}/{schema}/{page}`.
- `src/app/[serial]/[schema]/SchemaIndexEditor.tsx` — Client Component for inline editing of a schema's name and markdown body; toggles between rendered view and edit form, navigates to the new URL when the name changes.
- `src/components/SerialEditor.tsx` — Client Component managing edit mode for the serial's volumes and chapters; in edit mode shows volume/chapter type dropdowns (persisted immediately on change), inline rename forms, add-volume/chapter forms, delete confirmations, and drag-and-drop reordering via `@dnd-kit`.
- `src/components/SchemaManager.tsx` — Client Component for managing page schemas; accepts `serialSlug` to render a "View" link to each schema's index page, expand/collapse per-schema detail with section and floater-row add/rename/reorder/delete.
- `src/components/RenameForm.tsx` — shared generic inline rename form (hidden ID field + text input + Save/Cancel); used by `SchemaManager`.
- `src/components/Navbar.tsx` — shared navbar with site logo and auth placeholder.
- `src/components/SerialList.tsx` — Client Component owning the search input; filters serial list client-side by title.
- `src/hooks/useServerAction.ts` — `useServerAction()` hook; wraps a server action in `useTransition` + `router.refresh()`. Returns `{ run, isPending }`. Use in all Client Components that call Server Actions.
- `src/lib/serial-types.ts` — shared `ChapterType`/`VolumeType` types, `CHAPTER_TYPES`/`VOLUME_TYPES` arrays, `parseChapterType`/`parseVolumeType` helpers, and `CHAPTER_TYPE_OPTIONS`/`VOLUME_TYPE_OPTIONS` for `<Select>` components. Single source of truth — import from here instead of duplicating in action files or components.
- `src/lib/slug.ts` — `titleToSlug` utility; slug is computed at creation time and stored in `serials.slug`.
- `src/lib/utils.ts` — `cn()` utility for Tailwind class merging (Shadcn UI helper).
- `src/hooks/usePersistedStore.ts` — `useState`-compatible hook backed by `localStorage`; built on `useSyncExternalStore` for SSR safety and cross-tab sync via the native `storage` event.

### UI component conventions

Always use the design-system components in `src/components/ui/` instead of bare HTML elements:

| Instead of | Use |
|---|---|
| `<input>` | `<Input>` from `@/components/ui/input` |
| `<select>` | `<Select>` from `@/components/ui/select` |
| `<button>` | `<Button>` from `@/components/ui/button` |
| `<h1>`–`<h4>`, `<p>`, `<label>`, `<span>` (text) | `<Text variant="…">` from `@/components/ui/text` |

`<Text>` variants and their default elements: `h1` → `<h1>`, `h2` → `<h2>`, `h3` → `<h3>`, `h4` → `<h4>`, `body` → `<p>` (gray-700), `faint` → `<p>` (gray-400), `label` → `<span>`. Pass `muted` (boolean) to override any variant's text color to gray-500. Override the rendered element with `as` (e.g. `<Text as="label" variant="label" htmlFor="…">`). One-off spacing or layout tweaks go in `className`.

### JSDoc conventions

All exported components, hooks, and helper functions must have a JSDoc block with at least one `@example`. Keep the description concise — explain the non-obvious WHY (constraints, invariants, gotchas), not what the name already says. Omit `@param`/`@returns` for simple cases where TypeScript types are self-documenting; include them when the semantics aren't obvious from the type alone.

**Exception:** Skip the JSDoc block if the function or hook is bespoke to a single file/page (not exported for reuse elsewhere) and its name and signature are self-documenting.

```ts
/**
 * One-line summary of purpose or key constraint.
 *
 * @example
 * const [val, setVal] = usePersistedStore("key", defaultValue);
 */
```
