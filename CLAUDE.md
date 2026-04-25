# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Next.js dev server
npm run build     # production build
npm run lint      # run ESLint
npx drizzle-kit generate   # generate migration after schema changes
npx drizzle-kit migrate    # apply pending migrations to Neon
```

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
| UI components | Shadcn UI (Button, Input, Dialog) |
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
- `src/components/ui/dialog.tsx` — controlled Dialog component (`isOpen`/`onClose` props) with `DialogHeader`, `DialogBody`, `DialogFooter`, `DialogTitle`, `DialogDescription`, and `DialogClose`.
- `src/app/page.tsx` — home page; async Server Component that fetches all serials and passes them to `<SerialList>`.
- `src/app/new/page.tsx` — serial creation form (title, description, authors, splash art URL).
- `src/app/new/actions.ts` — `createSerial` Server Action; inserts into `serials` and `serial_authors`, redirects to `/{slug}`.
- `src/components/Navbar.tsx` — shared navbar with site logo and auth placeholder.
- `src/components/SerialList.tsx` — Client Component owning the search input; filters serial list client-side by title.
- `src/lib/slug.ts` — `titleToSlug` utility; slug is derived at runtime from the title, not stored.
- `src/lib/utils.ts` — `cn()` utility for Tailwind class merging (Shadcn UI helper).
