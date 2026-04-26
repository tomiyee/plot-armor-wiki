# PlotArmor

A wiki platform for serial entertainment (books, TV shows, etc.) that protects readers from spoilers by only surfacing information up to a chapter they choose.

Standard wikis always show the latest state of any character, location, or other entry — a problem for readers mid-series. PlotArmor solves this by treating every piece of wiki content as a time series tied to specific chapters, so the wiki renders a snapshot of the world as of any point in the story.

## How it works

Users set a **progress cutoff** — the chapter they are currently on. All wiki content, search results, and links are then filtered to that point:

- Pages whose subject hasn't been introduced yet are hidden entirely (title included).
- Search results exclude pages beyond the user's current chapter.
- Every attribute on a page reflects only the state as of the user's cutoff.

Progress is stored in `localStorage` for anonymous users and synced to their account for logged-in users.

## Key concepts

| Term | Definition |
|------|------------|
| **Serial** | The story a wiki covers (a book series, TV show, etc.) |
| **Chapter** | A single installment — episode, book chapter, volume, etc. |
| **Schema** | A page type within a serial (e.g. Characters, Locations) |
| **Page** | A single wiki entry belonging to a schema |

### Pages

Every page belongs to a schema. Schemas define two layout components:

- **Body** — an ordered list of named sections, each storing Markdown text.
- **Floater** *(optional)* — a sidebar panel with a header, image, and labeled rows.

Every page also records the chapter it was first introduced in, which determines its visibility to a given user.

### URL structure

```
/{serial}/{schema}/{page-name}
```

## Data model

Content versioning uses **SCD Type 2 (closed-interval)**: every content row carries a `from_chapter_id` and `to_chapter_id` (nullable = current). To read a value at chapter N:

```sql
WHERE from_chapter_idx <= N AND (to_chapter_idx IS NULL OR to_chapter_idx > N)
```

Schema structure (sections, floater rows) is versioned by wall-clock time. Page content is versioned by chapter index. These two axes are independent.

### Tables

```
serials          id, title, slug, description, splash_art_url, chapter_type, volume_type
serial_authors   serial_id, name, display_order
chapters         id, serial_id, display_name, idx

schemas              id, serial_id, name, has_floater
schema_sections      id, schema_id, name, display_order, created_at, deleted_at
schema_floater_rows  id, schema_id, label, display_order, created_at, deleted_at

pages                    id, schema_id, name, intro_chapter_id
page_section_versions    page_id, section_id, from_chapter_id, to_chapter_id, content
page_floater_versions    page_id, from_chapter_id, to_chapter_id, image_url
page_floater_row_versions  page_id, floater_row_id, from_chapter_id, to_chapter_id, content

users            id, email, display_name, created_at
user_progress    user_id, serial_id, chapter_id, updated_at
```

For the full design spec, see [spec.md](spec.md).

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via Neon |
| ORM | Drizzle ORM |
| Auth | Auth.js (NextAuth v5) |
| Search | PostgreSQL full-text search |
| Styling | Tailwind CSS v4 |
| UI components | Shadcn UI |
| Hosting | Vercel |

Rationale for each decision is in [spec.md § Tech Stack](spec.md#tech-stack).

## Getting started

```bash
pnpm install
```

Create `.env.local` with your database connection string.

**Neon (production/staging):**
```
DATABASE_URL=postgres://<user>:<password>@<host>/neondb?sslmode=require
```

**Local Docker (development):**
```
DATABASE_URL=postgres://postgres:secret@localhost:5432/plotarmor
```

Then start the database. For local Docker, run the helper script (PowerShell):

```powershell
.\scripts\start-db.ps1
```

The script reads `DATABASE_URL` from `.env.local` and uses those values when creating the container, so credentials are defined in one place. To stop the container: `docker stop plotarmor-db`.

Apply the database migration:

```bash
npx drizzle-kit migrate
```

Start the dev server:

```bash
pnpm dev         # http://localhost:3000
pnpm build       # production build
pnpm lint        # ESLint
```

To regenerate migrations after schema changes:

```bash
pnpm drizzle-kit generate
```
