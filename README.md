# PlotArmor

A wiki platform for serial entertainment (books, TV shows, etc.) that protects readers from spoilers by only surfacing information up to a chapter they choose.

Standard wikis always show the latest state of any character, location, or other entry - a problem for readers mid-series. PlotArmor solves this by treating every piece of wiki content as a time series tied to specific chapters, so the wiki renders a snapshot of the world as of any point in the story.

## How it works

Users set a **progress cutoff** - the chapter they are currently on. All wiki content, search results, and links are then filtered to that point:

- Pages whose subject hasn't been introduced yet are hidden entirely (title included).
- Search results exclude pages beyond the user's current chapter.
- Every attribute on a page reflects only the state as of the user's cutoff.

Progress is stored in `localStorage` for anonymous users and synced to their account for logged-in users.

## Key concepts

| Term        | Definition                                                 |
| ----------- | ---------------------------------------------------------- |
| **Serial**  | The story a wiki covers (a book series, TV show, etc.)     |
| **Chapter** | A single installment - episode, book chapter, volume, etc. |
| **Page**    | A single wiki entry within a serial                        |

### Pages

Each serial has a home page (the root of the wiki DAG) and any number of child pages. Every page records the chapter it was first introduced in, which determines its visibility to a given user.

Pages contain two optional layout components:

- **Sections** - an ordered list of named sections, each storing Markdown text.
- **Infobox** _(optional)_ - a sidebar panel with an image and labeled rows.

### URL structure

```
/                    # home
/help                # static help & documentation page
/{serial}            # serial home (metadata + home wiki page)
/{serial}/new        # new wiki page form
/{serial}/{slug}     # wiki page
```

## Data model

Content versioning uses **single-timestamp versioning**: every content row carries a single `chapter_id` - the chapter when that value was introduced or last changed. At most one revision per `(page, section, chapter)` tuple (enforced by PK). To read a value at chapter N, find the revision with the highest `chapter.idx` ≤ N:

```sql
SELECT ... GROUP BY section_id HAVING chapters.idx = MAX(chapters.idx)
WHERE page_id = ? AND chapters.idx <= N
```

Category structure (sections, floater rows) is versioned by wall-clock time. Page content is versioned by chapter index. These two axes are independent.

### Tables

```
serials                       id, title, slug, splash_art_url, chapter_type, volume_type
serial_authors                serial_id, name, display_order
volumes                       id, serial_id, display_name, idx
chapters                      id, volume_id, display_name, idx
chapter_synopses              chapter_id, content, updated_at

pages                         id, serial_id, name, slug, intro_chapter_id, is_home_page
page_titles                   page_id, chapter_id, title
page_sections                 id, page_id, name, display_order, created_at, deleted_at
page_section_revisions        page_id, section_id, chapter_id, content
page_infobox_sections         id, page_id, label, display_order, created_at, deleted_at
page_infobox_revisions        page_id, infobox_section_id, chapter_id, content
page_infobox_image_revisions  page_id, chapter_id, image_url
page_relationships            parent_page_id, child_page_id, chapter_id, is_active

templates                     id, serial_id, name, has_infobox
template_sections             id, template_id, name, display_order
template_infobox_sections     id, template_id, label, display_order

page_suggestions                 id, page_id, proposed_by_user_id, target_chapter_id, status, citation, ...review fields
page_suggestion_section_changes  id, suggestion_id, section_id, proposed_content
page_suggestion_infobox_changes  id, suggestion_id, infobox_section_id, proposed_content
chapter_synopsis_suggestions     id, chapter_id, serial_id, proposed_by_user_id, proposed_content, citation, status, ...review fields

users                   id, name, username, email, email_verified, image, created_at
accounts                user_id, type, provider, provider_account_id, ...
sessions                session_token, user_id, expires
verification_tokens     identifier, token, expires
user_progress           user_id, serial_id, chapter_id, updated_at
serial_admins           user_id, serial_id, granted_at
```

For the full design spec, see [spec.md](spec.md).

## Tech stack

| Layer         | Choice                                                |
| ------------- | ----------------------------------------------------- |
| Framework     | Next.js 16 (App Router)                               |
| Database      | PostgreSQL                                            |
| ORM           | Drizzle ORM                                           |
| Auth          | Auth.js (NextAuth v5)                                 |
| Search        | PostgreSQL full-text search                           |
| Styling       | Tailwind CSS v4                                       |
| UI components | Base UI + custom design system (`src/components/ui/`) |
| Hosting       | Vercel                                                |

Rationale for each decision is in [spec.md § Tech Stack](spec.md#tech-stack).

## Getting started

```bash
npm install
```

Create `.env.local` (see `.env.local.example`) with your database connection strings and Auth.js secrets.

```
DB_ENV=dev                 # "prod" -> DATABASE_URL, "dev" -> DEV_DATABASE_URL (unset = prod)
DATABASE_URL=postgres://<user>:<password>@<host>/<db>?sslmode=require
DEV_DATABASE_URL=postgres://postgres:secret@localhost:5432/plotarmor
AUTH_SECRET=<random-secret>
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
AUTH_URL=http://localhost:3000
```

`DATABASE_URL` is the production database and is the only one deployments need — `DB_ENV` defaults to `prod`, so existing deployments keep working unchanged. `DEV_DATABASE_URL` and `DB_ENV` are local-only. Override `DB_ENV` per run:

```bash
npm run dev        # uses DB_ENV from .env.local
npm run dev:dev    # force DEV_DATABASE_URL
npm run dev:prod   # force DATABASE_URL (careful: live data)
```

`drizzle-kit` commands honor `DB_ENV` too (e.g. `DB_ENV=prod npx drizzle-kit migrate`).

Then start the database. For local Docker, run the helper script (PowerShell):

```powershell
.\scripts\start-db.ps1
```

The script reads `DEV_DATABASE_URL` (falling back to `DATABASE_URL`) from `.env.local` and uses those values when creating the container, so credentials are defined in one place. To stop the container: `docker stop plotarmor-db`.

Apply the database migration:

```bash
npx drizzle-kit migrate
```

Start the dev server:

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # ESLint
```

To regenerate migrations after schema changes:

```bash
npx drizzle-kit generate
```

## Saving and loading the database state

Two pairs of scripts let you snapshot and restore the local Docker database for quick testing or sharing a known-good seed.

### Save a snapshot

Dumps the running container's database to a plain-SQL file under `db-snapshots/` (the directory is git-ignored).

**Linux / macOS / WSL (bash):**

```bash
./scripts/save-db.sh                          # auto-named: db-snapshots/2024-01-15_14-30-00.sql
./scripts/save-db.sh db-snapshots/my-seed.sql # custom path
```

**Windows (PowerShell):**

```powershell
.\scripts\save-db.ps1                                      # auto-named
.\scripts\save-db.ps1 -OutputFile db-snapshots\my-seed.sql  # custom path
```

### Load a snapshot

Drops and recreates the database, then loads the specified dump. Prompts for confirmation unless `--force` / `-Force` is passed.

**Linux / macOS / WSL (bash):**

```bash
./scripts/load-db.sh                                   # interactive picker from db-snapshots/
./scripts/load-db.sh db-snapshots/my-seed.sql          # load a specific file
./scripts/load-db.sh db-snapshots/my-seed.sql --force  # skip confirmation prompt
```

**Windows (PowerShell):**

```powershell
.\scripts\load-db.ps1                                              # interactive picker from db-snapshots\
.\scripts\load-db.ps1 -InputFile db-snapshots\my-seed.sql          # load a specific file
.\scripts\load-db.ps1 -InputFile db-snapshots\my-seed.sql -Force   # skip confirmation prompt
```

> **Warning:** Loading a snapshot permanently deletes all current data in the local database. Make sure you save first if you need it.
