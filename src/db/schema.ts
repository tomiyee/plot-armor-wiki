import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const chapterTypeEnum = pgEnum('chapter_type', [
  'Chapter',
  'Episode',
  'Issue',
  'Part',
]);

export const volumeTypeEnum = pgEnum('volume_type', [
  'Volume',
  'Season',
  'Arc',
  'Book',
]);

export const serials = pgTable('serials', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  splashArtUrl: text('splash_art_url'),
  chapterType: chapterTypeEnum('chapter_type').notNull().default('Chapter'),
  volumeType: volumeTypeEnum('volume_type').notNull().default('Volume'),
});

export const serialAuthors = pgTable(
  'serial_authors',
  {
    serialId: integer('serial_id')
      .notNull()
      .references(() => serials.id),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull(),
  },
  (t) => [primaryKey({ columns: [t.serialId, t.displayOrder] })],
);

export const volumes = pgTable('volumes', {
  id: serial('id').primaryKey(),
  serialId: integer('serial_id')
    .notNull()
    .references(() => serials.id),
  displayName: text('display_name').notNull(),
  idx: integer('idx').notNull(),
});

export const chapters = pgTable('chapters', {
  id: serial('id').primaryKey(),
  volumeId: integer('volume_id')
    .notNull()
    .references(() => volumes.id),
  displayName: text('display_name').notNull(),
  idx: integer('idx').notNull(),
});

export const pageSchemas = pgTable('page_schemas', {
  id: serial('id').primaryKey(),
  serialId: integer('serial_id')
    .notNull()
    .references(() => serials.id),
  name: text('name').notNull(),
  body: text('body'),
  hasFloater: boolean('has_floater').notNull().default(false),
});

export const schemaSections = pgTable('schema_sections', {
  id: serial('id').primaryKey(),
  schemaId: integer('schema_id')
    .notNull()
    .references(() => pageSchemas.id),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const schemaFloaterRows = pgTable('schema_floater_rows', {
  id: serial('id').primaryKey(),
  schemaId: integer('schema_id')
    .notNull()
    .references(() => pageSchemas.id),
  label: text('label').notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  schemaId: integer('schema_id')
    .notNull()
    .references(() => pageSchemas.id),
  name: text('name').notNull(),
  introChapterId: integer('intro_chapter_id')
    .notNull()
    .references(() => chapters.id),
});

export const pageSectionVersions = pgTable(
  'page_section_versions',
  {
    pageId: integer('page_id')
      .notNull()
      .references(() => pages.id),
    sectionId: integer('section_id')
      .notNull()
      .references(() => schemaSections.id),
    fromChapterId: integer('from_chapter_id')
      .notNull()
      .references(() => chapters.id),
    toChapterId: integer('to_chapter_id').references(() => chapters.id),
    content: text('content').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.sectionId, t.fromChapterId] })],
);

export const pageFloaterVersions = pgTable(
  'page_floater_versions',
  {
    pageId: integer('page_id')
      .notNull()
      .references(() => pages.id),
    fromChapterId: integer('from_chapter_id')
      .notNull()
      .references(() => chapters.id),
    toChapterId: integer('to_chapter_id').references(() => chapters.id),
    imageUrl: text('image_url'),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.fromChapterId] })],
);

export const pageFloaterRowVersions = pgTable(
  'page_floater_row_versions',
  {
    pageId: integer('page_id')
      .notNull()
      .references(() => pages.id),
    floaterRowId: integer('floater_row_id')
      .notNull()
      .references(() => schemaFloaterRows.id),
    fromChapterId: integer('from_chapter_id')
      .notNull()
      .references(() => chapters.id),
    toChapterId: integer('to_chapter_id').references(() => chapters.id),
    content: text('content').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.floaterRowId, t.fromChapterId] })],
);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userProgress = pgTable(
  'user_progress',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    serialId: integer('serial_id')
      .notNull()
      .references(() => serials.id),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => chapters.id),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serialId] })],
);
