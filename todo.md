# PlotArmor — Implementation TODO

Each step is one commit. The app should be in a runnable state after each step.
See `spec.md` for full design context and `README.md` for a project overview.

Tech stack: Next.js 15 (App Router), TypeScript, Tailwind CSS, Drizzle ORM, Neon (serverless Postgres), Auth.js v5, `react-markdown`, `@uiw/react-md-editor`.

---

## Parallelization opportunities

Steps with no shared file or data dependency can be developed concurrently in separate git worktrees.

| After step | Can run in parallel |
|------------|-------------------|
| Step 1 | **Steps 2 + 3** — DB setup vs. UI shell |
| Steps 2 + 3 | **Steps 4 + 5** — serial CRUD vs. chapter management |
| Step 5b | **Steps 6 + 11** — schema management vs. chapter progress selector |
| Step 12 | **Steps 13, 14, 15** — editor, page blocking, spoiler-aware search |

Steps 8 → 9 → 10 → 12 are a strict sequential chain.
Auth (Step 16) and progress sync (Step 17) are intentionally deferred until all localStorage-based features are complete.

---

## ~~Step 1 — Project scaffold~~ ✓

- ~~Run `npx create-next-app@latest` with TypeScript, Tailwind, App Router, src/ directory, no `turbopack` (compatibility with Neon/Auth.js).~~
- ~~Delete all boilerplate content from `page.tsx`, `globals.css`, etc.~~
- ~~Verify `npm run dev` starts without errors and the page renders.~~
- Commit: `chore: scaffold Next.js project`

## ~~Step 2 — Database + Drizzle setup~~ ✓

- ~~Create a Neon project and copy the connection string to `.env.local` as `DATABASE_URL`.~~
- ~~Install: `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`, `dotenv`.~~
- ~~Create `src/db/schema.ts` with all tables defined using Drizzle's schema DSL. Define all tables from the spec in one file:~~
  - ~~`serials` — `id`, `title`, `description`, `splash_art_url`~~
  - ~~`serial_authors` — `serial_id`, `name`, `display_order`~~
  - ~~`chapters` — `id`, `serial_id`, `display_name`, `idx`~~
  - ~~`schemas` — `id`, `serial_id`, `name`, `has_floater`~~
  - ~~`schema_sections` — `id`, `schema_id`, `name`, `display_order`, `created_at`, `deleted_at`~~
  - ~~`schema_floater_rows` — `id`, `schema_id`, `label`, `display_order`, `created_at`, `deleted_at`~~
  - ~~`pages` — `id`, `schema_id`, `name`, `intro_chapter_id`~~
  - ~~`page_section_versions` — `page_id`, `section_id`, `from_chapter_id`, `to_chapter_id`, `content`; PK `(page_id, section_id, from_chapter_id)`~~
  - ~~`page_floater_versions` — `page_id`, `from_chapter_id`, `to_chapter_id`, `image_url`; PK `(page_id, from_chapter_id)`~~
  - ~~`page_floater_row_versions` — `page_id`, `floater_row_id`, `from_chapter_id`, `to_chapter_id`, `content`; PK `(page_id, floater_row_id, from_chapter_id)`~~
  - ~~`users` — `id`, `email`, `display_name`, `created_at`~~
  - ~~`user_progress` — `user_id`, `serial_id`, `chapter_id`, `updated_at`; PK `(user_id, serial_id)`~~
- ~~Create `drizzle.config.ts` pointing at `src/db/schema.ts` and Neon.~~
- ~~Create `src/db/index.ts` exporting a `db` client using `@neondatabase/serverless`.~~
- ~~Run `npx drizzle-kit generate` and `npx drizzle-kit migrate` to apply the schema to Neon.~~
- ~~Add `.env.local` to `.gitignore`.~~
- Commit: `feat: add Drizzle schema and initial Neon migration`

## ~~Step 3 — Home page static shell~~ ✓

- ~~Create a shared `<Navbar>` component rendered in the root `layout.tsx`. For now it just shows the site name "PlotArmor" and a placeholder for auth.~~
- ~~Build the home page (`app/page.tsx`):~~
  - ~~A search bar input (uncontrolled, no backend yet).~~
  - ~~A "Create wiki" button (links to `/new` — page does not need to exist yet).~~
- ~~No data fetching in this step.~~
- Commit: `feat: add home page shell with navbar and search bar`

## ~~Step 4 — Serial creation and listing~~ ✓

- ~~Create `app/new/page.tsx` — a form to create a serial:~~
  - ~~Fields: title (required), description (textarea), authors (repeatable text input), splash art URL (optional).~~
  - ~~Submit via a Server Action that inserts into `serials` and `serial_authors`, then redirects to `/{serial-slug}`.~~
  - ~~Use the serial title lowercased and hyphenated as the URL slug (store it or derive it — pick one approach and be consistent).~~
- ~~Update `app/page.tsx` to fetch and list all serials from the DB below the search bar.~~
- ~~Wire the search bar to filter the displayed list client-side (no FTS yet).~~
- Commit: `feat: serial creation form and listing on home page`

## ~~Step 5 — Chapter management~~ ✓

- ~~Create `app/[serial]/page.tsx` — the serial detail page. For now it shows:~~
  - ~~The serial title, description, and authors.~~
  - ~~A list of existing chapters in index order.~~
  - ~~A form to add a new chapter (display name only; index auto-assigned as max existing index + 1). Submit via Server Action inserting into `chapters`.~~
- Commit: `feat: serial detail page with chapter list and add-chapter form`

## ~~Step 5b — Volume and chapter reordering (drag and drop)~~ ✓

- ~~On the serial detail page, make both the volume list and each volume's chapter list reorderable via drag and drop.~~
- ~~Use `@dnd-kit/core` and `@dnd-kit/sortable` (or equivalent) — no native HTML5 drag API, which lacks touch support.~~
- ~~**Volume reordering:** dragging a volume to a new position updates `volumes.idx` for all volumes in the serial via a Server Action; chapters are not renumbered.~~
- ~~**Chapter reordering within a volume:** dragging a chapter to a new position within its volume reassigns `chapters.idx` globally so the serial-level linear order remains strictly increasing (all chapters of earlier volumes precede later ones).~~
- ~~Both Server Actions must update all affected rows in a single transaction to avoid partial reorder states.~~
- ~~No optimistic UI required for now — revalidate the page after each action completes.~~
- Commit: `feat: drag-and-drop reordering for volumes and chapters`

## ~~Step 6 — Schema management~~ ✓

- ~~On the serial detail page, add a second section below chapters for managing schemas.~~
- ~~"Add schema" form: schema name, toggle for whether it has a floater. Creates a `schemas` row.~~
- ~~Clicking a schema expands or navigates to a schema detail view where editors can:~~
  - ~~Add/remove sections (inserts/soft-deletes `schema_sections` rows via `deleted_at`).~~
  - ~~If `has_floater`, add/remove floater rows (`schema_floater_rows`).~~
  - ~~Reorder sections and floater rows (updates `display_order`).~~
- ~~No chapter versioning in this step — schema structure changes are wall-clock only.~~
- Commit: `feat: schema management with sections and floater row config`

## ~~Step 7 — Page schema index page~~ ✓

- ~~Create `app/[serial]/[schema]/page.tsx` — the schema index page. It shows:~~
  - ~~The schema name as a heading.~~
  - ~~The schema `body` rendered as markdown (using `react-markdown`) if set — this is the editor-provided description of the category (e.g. what "Characters" means for this wiki).~~
  - ~~A list of all pages belonging to this schema, each linking to `/{serial}/{schema}/{page-name}`.~~
- ~~Resolve the serial via `WHERE slug = ?` and the schema via `WHERE serial_id = ? AND name = ?`.~~
- ~~Link to this index page from the serial detail page next to each schema name.~~
- Commit: `feat: page schema index page with body description and page list`

## ~~Step 8 — Page creation~~ ✓

- ~~Create `app/[serial]/[schema]/new/page.tsx` — a form to create a wiki page:~~
  - ~~Fields: page name, intro chapter (select from existing chapters for this serial).~~
  - ~~Submit via Server Action inserting into `pages`, then redirects to `/{serial}/{schema}/{page-name}`.~~
- ~~Create `app/[serial]/[schema]/[page]/page.tsx` — renders a bare shell: just the page name as a heading and the intro chapter. No content yet.~~
- ~~Add a "New page" link on the schema index page for each schema.~~
- Commit: `feat: page creation form and bare page shell`

## ~~Step 9 — Page rendering with current content~~ ✓

- ~~Install `react-markdown`.~~
- ~~Update the page route (`app/[serial]/[schema]/[page]/page.tsx`) to fetch and render body content:~~
  - ~~For each active section in the schema (where `deleted_at IS NULL`), fetch the latest `page_section_versions` row (`to_chapter_id IS NULL`).~~
  - ~~Render each section heading and its content using `<ReactMarkdown>`.~~
- ~~No chapter filter yet — this always shows the latest version.~~
- Commit: `feat: render page body sections as markdown (latest content)`

## ~~Step 10 — Floater sidebar~~ ✓

- ~~Update the page route to also fetch and render the floater if `schema.has_floater`:~~
  - ~~Latest `page_floater_versions` row for the image URL.~~
  - ~~Latest `page_floater_row_versions` rows for each active floater row.~~
- ~~Render as a sidebar panel floating top-right: page name as header, image, then labeled rows.~~
- ~~Layout: use CSS Grid or Flexbox — body on the left, floater on the right.~~
- Commit: `feat: render floater sidebar with image and labeled rows`

## ~~Step 11 — Chapter progress selector (anonymous, localStorage only)~~ ✓

- ~~Create a `<ChapterSelector>` Client Component. It:~~
  - ~~Receives the list of chapters for the current serial as props.~~
  - ~~Reads/writes progress from `localStorage` keyed by serial ID using `usePersistedStore`: `plotarmor:progress:{serial_id}`.~~
  - ~~Defaults to the first chapter if no value is stored.~~
  - ~~Shows a temporary callout banner on first visit prompting the user to set their chapter.~~
- ~~Mount `<ChapterSelector>` in the navbar when on a serial page. The selected chapter ID must be accessible to Server Components — pass it as a cookie (set on selection, read server-side) rather than relying on localStorage alone.~~
- ~~**No auth dependency**: this step works entirely with localStorage for anonymous users.~~
- Commit: `feat: chapter progress selector with localStorage persistence`

## ~~Step 12 — SCD Type 2 versioned read path~~ ✓

**This is the core spoiler-protection query — prototype it in raw SQL against Neon before wiring it into Drizzle.**

- ~~Read the user's progress chapter index (`chapters.idx`) from the cookie set in step 11.~~
- ~~Replace the "latest only" queries in the page route with the versioned range filter:~~
  ```sql
  WHERE from_chapter_idx <= :cutoff AND (to_chapter_idx IS NULL OR to_chapter_idx > :cutoff)
  ```
- ~~Apply this filter to `page_section_versions`, `page_floater_versions`, and `page_floater_row_versions`.~~
- ~~A section with no content row in range renders as empty (not an error).~~
- ~~Verify by inserting test versioned rows in Neon and toggling the progress cookie.~~
- Commit: `feat: apply SCD Type 2 chapter filter to page content queries`

## ~~Step 13 — Content editing (no auth gate yet)~~ ✓

- ~~Install `@uiw/react-md-editor`.~~
- ~~Add an "Edit" mode to the page view (visible to all users initially — add auth gate in Step 16):~~
  - ~~Each section gets an `<MDEditor>` replacing the read-only `<ReactMarkdown>`.~~
  - ~~The floater image URL and each floater row get text inputs.~~
  - ~~A single "Save" button submits all changes via a Server Action.~~
- ~~The Server Action implements the SCD Type 2 write path:~~
  1. ~~For each changed section: find the open row (`to_chapter_id IS NULL`), set its `to_chapter_id` to the current chapter, insert a new row with `from_chapter_id = current chapter, to_chapter_id = NULL, content = new content`.~~
  2. ~~Same pattern for `page_floater_versions` and `page_floater_row_versions`.~~
  3. ~~`current chapter` here means the latest chapter in the serial (the edit always writes at head).~~
- Commit: `feat: markdown content editor with SCD Type 2 write path`

## Step 14 — Spoiler-aware page blocking

- At the top of the page Server Component, after resolving the page and user's progress cutoff:
  - If `pages.intro_chapter_id` maps to a chapter whose `idx` > the user's cutoff `idx`, do not render any page content.
  - Instead render: *"This [schema name] is introduced in [intro chapter display name]. This page is hidden to prevent spoilers."*
  - Do not display the page name anywhere on the blocked view.
- Commit: `feat: block page content for pages beyond user progress`

## Step 15 — Spoiler-aware search

- Replace the client-side list filter on the home page with a server-side search endpoint.
- Implement using PostgreSQL full-text search on `pages.name` and `serials.title`:
  - Add a `tsvector` index to `pages.name` or use `to_tsvector` inline.
  - The query must also filter out pages whose `intro_chapter_id` resolves to an `idx` beyond the user's current progress for that serial.
- Wire the home page search bar to call this endpoint (can use a Server Action or a route handler).
- Commit: `feat: server-side spoiler-aware search with PG full-text search`

## Step 16 — Auth.js setup

Auth is intentionally deferred until all anonymous/localStorage-based features are complete and working.

- Install: `next-auth@beta`, and a provider package (e.g. GitHub OAuth).
- Create `src/auth.ts` configuring Auth.js with the chosen provider. Adapter: use the Drizzle adapter or a custom one writing to the `users` table.
- Add `app/api/auth/[...nextauth]/route.ts`.
- Add `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and provider credentials to `.env.local`.
- Update `<Navbar>` to show a sign-in button (unauthenticated) or the user's display name + sign-out (authenticated), using `auth()` from `src/auth.ts` in a Server Component.
- Verify sign-in and sign-out work end-to-end.
- Commit: `feat: Auth.js setup with GitHub provider and session in navbar`

## Step 17 — Progress sync for logged-in users

- When the user selects a chapter in `<ChapterSelector>`:
  - If authenticated: call a Server Action that upserts `user_progress (user_id, serial_id, chapter_id)`.
  - If anonymous: write to `localStorage` only (existing behavior from Step 11).
- On page load, the Server Component reads progress in priority order:
  1. `user_progress` table (if session exists).
  2. Cookie set in step 11 (fallback for anonymous).
- When an anonymous user signs in, optionally merge their `localStorage` progress into the DB (nice-to-have, not required for initial ship).
- Add auth gate to content editor (Step 13): only show Edit mode to authenticated users.
- Commit: `feat: sync chapter progress to DB for authenticated users`
