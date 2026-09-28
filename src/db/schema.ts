import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const chapterTypeEnum = pgEnum("chapter_type", [
  "Chapter",
  "Episode",
  "Issue",
  "Part",
]);

export const volumeTypeEnum = pgEnum("volume_type", [
  "Volume",
  "Season",
  "Arc",
  "Book",
]);

export const serials = pgTable("serials", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  splashArtUrl: text("splash_art_url"),
  chapterType: chapterTypeEnum("chapter_type").notNull().default("Chapter"),
  volumeType: volumeTypeEnum("volume_type").notNull().default("Volume"),
});

export const serialAuthors = pgTable(
  "serial_authors",
  {
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
  },
  (t) => [primaryKey({ columns: [t.serialId, t.displayOrder] })],
);

export const volumes = pgTable("volumes", {
  id: serial("id").primaryKey(),
  serialId: integer("serial_id")
    .notNull()
    .references(() => serials.id),
  displayName: text("display_name").notNull(),
  idx: integer("idx").notNull(),
});

export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  volumeId: integer("volume_id")
    .notNull()
    .references(() => volumes.id),
  displayName: text("display_name").notNull(),
  idx: integer("idx").notNull(),
});

/**
 * Wiki pages belonging directly to a serial.
 *
 * `name` is kept temporarily to seed `page_titles` entries; it will be
 * dropped in a later migration once data is migrated.
 *
 * `slug` is unique per serial and is used in URL routing.
 *
 * `introChapterId` is nullable for the serial's home page, which is created
 * before any chapters exist and is always visible regardless of cutoff.
 *
 * `isHomePage` marks the single automatically-created root page for a serial.
 * Every serial has exactly one home page.
 *
 * `deletedAt` supports soft-delete so that deleted pages can be restored. A
 * non-null value hides the page from readers and excludes it from search and
 * wiki-link resolution, but the row (and all its versioned content) is preserved.
 */
export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    /** Kept temporarily; will be replaced by `page_titles` entries. */
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Null for the home page, which predates any chapters and is always visible. */
    introChapterId: integer("intro_chapter_id").references(() => chapters.id),
    /** True for the single automatically-created root page per serial. */
    isHomePage: boolean("is_home_page").notNull().default(false),
    /** Non-null when the page has been soft-deleted. Null for live pages. */
    deletedAt: timestamp("deleted_at"),
    /** Admin-supplied markdown reason for the deletion. Null when no reason was given. */
    deletionReason: text("deletion_reason"),
    /**
     * UUID generated on the new-page form mount and submitted with the creation
     * request. Uniqueness is enforced so that a network retry carrying the same
     * key hits the constraint, is caught server-side, and redirects to the
     * already-created page rather than inserting a duplicate.
     *
     * Null for the home page (created programmatically without a form) and for
     * pages created before this column was added.
     */
    idempotencyKey: text("idempotency_key").unique(),
  },
  (t) => [uniqueIndex("pages_serial_id_slug_idx").on(t.serialId, t.slug)],
);

/**
 * Temporal page titles - a page's display name can change over story
 * progression. Follows the same max-idx read pattern as section content.
 */
export const pageTitles = pgTable(
  "page_titles",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    title: text("title").notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.chapterId] })],
);

/**
 * Chapter-versioned page body content — one merged markdown blob per page
 * per chapter. Read pattern: max `chapters.idx` ≤ cutoff per `page_id`.
 *
 * A page has no section structure; it has exactly one body field.
 */
export const pageContentRevisions = pgTable(
  "page_content_revisions",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    content: text("content"),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.chapterId] })],
);

/**
 * Chapter-versioned infobox content + image for a page, merged into a single
 * row (one row covers both the text content and the floater image URL).
 *
 * "Has infobox" is derived, not stored: a page has an infobox iff this table
 * has any row with non-null `content` or `image_url` at or before the
 * reader's cutoff.
 */
export const pageInfoboxContentRevisions = pgTable(
  "page_infobox_content_revisions",
  {
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    content: text("content"),
    imageUrl: text("image_url"),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.chapterId] })],
);

/**
 * DAG edges between wiki pages.
 *
 * Each row is a snapshot; read the latest row per `(parent_page_id, child_page_id)`
 * where `chapter_idx <= cutoff` to determine whether the relationship is
 * currently active. `is_active = false` rows act as tombstones.
 */
export const pageRelationships = pgTable(
  "page_relationships",
  {
    parentPageId: integer("parent_page_id")
      .notNull()
      .references(() => pages.id),
    childPageId: integer("child_page_id")
      .notNull()
      .references(() => pages.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    isActive: boolean("is_active").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.parentPageId, t.childPageId, t.chapterId] }),
  ],
);

export const chapterSynopses = pgTable("chapter_synopses", {
  chapterId: integer("chapter_id")
    .primaryKey()
    .references(() => chapters.id),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  username: text("username").unique(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * OAuth account rows managed by @auth/drizzle-adapter.
 *
 * Column property names use snake_case to match the names expected by the
 * DrizzleAdapter type contract (refresh_token, access_token, etc.). The
 * underlying DB column names are identical.
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const userProgress = pgTable(
  "user_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serialId] })],
);

export const serialAdmins = pgTable(
  "serial_admins",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serialId] })],
);

/**
 * A user-submitted suggestion to change the body content and/or infobox
 * content of a wiki page. `proposedContent` / `proposedInfoboxContent` hold
 * the single merged proposed values directly on the row - there is no longer
 * a child table of per-section changes, since a page has one body field.
 * Admin review is the only spoiler gate - no server-side content filtering.
 */
export const pageSuggestions = pgTable("page_suggestions", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id")
    .notNull()
    .references(() => pages.id),
  proposedByUserId: text("proposed_by_user_id")
    .notNull()
    .references(() => users.id),
  targetChapterId: integer("target_chapter_id")
    .notNull()
    .references(() => chapters.id),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  /** A quote, timestamp, or chapter reference supporting all proposed changes in this suggestion. */
  citation: text("citation").notNull(),
  /** Proposed replacement for the page body. Null when this suggestion only changes infobox content. */
  proposedContent: text("proposed_content"),
  /** Proposed replacement for the infobox content. Null when this suggestion only changes the body. */
  proposedInfoboxContent: text("proposed_infobox_content"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
  reviewNote: text("review_note"),
});

/**
 * A user-submitted suggestion to update a chapter's synopsis text.
 * One pending suggestion per (user, chapter) - submitting again replaces the previous pending one.
 */
export const chapterSynopsisSuggestions = pgTable(
  "chapter_synopsis_suggestions",
  {
    id: serial("id").primaryKey(),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id),
    serialId: integer("serial_id")
      .notNull()
      .references(() => serials.id),
    proposedByUserId: text("proposed_by_user_id")
      .notNull()
      .references(() => users.id),
    proposedContent: text("proposed_content").notNull(),
    citation: text("citation").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewNote: text("review_note"),
  },
);
