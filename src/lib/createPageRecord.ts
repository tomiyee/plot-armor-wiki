import { and, eq, like } from "drizzle-orm";
import { db } from "@/db/index";
import { pages, pageTitles, pageRelationships } from "@/db/schema";
import { titleToSlug } from "@/lib/slug";

/** Drizzle transaction type inferred from the db client. */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** Input for `createPageRecord`. */
export type CreatePageRecordInput = {
  /** Serial the page belongs to. */
  serialId: number;
  /** Trimmed page name; seeds `pages.name`, the slug, and the first `page_titles` row. */
  name: string;
  /** Chapter at which the page (and its title + parent link) becomes visible. */
  introChapterId: number;
  /** Required parent page; linked via a `page_relationships` row at `introChapterId`. */
  parentPageId: number;
  /** Optional form idempotency key; unique-constrained on `pages`. */
  idempotencyKey?: string | null;
};

/**
 * Generates a slug unique within the serial. If `titleToSlug(name)` already
 * exists, appends `-2`, `-3`, … until a free slot is found.
 *
 * @example
 * const slug = await generateUniqueSlug(42, 'Monkey D. Luffy');
 * // → 'monkey-d-luffy' (or 'monkey-d-luffy-2' on collision)
 */
export async function generateUniqueSlug(
  serialId: number,
  name: string,
  executor: Tx | typeof db = db,
): Promise<string> {
  const base = titleToSlug(name);

  // Fetch all existing slugs that start with base to check for collisions.
  const existing = await executor
    .select({ slug: pages.slug })
    .from(pages)
    .where(and(eq(pages.serialId, serialId), like(pages.slug, `${base}%`)));

  const existingSet = new Set(existing.map((r) => r.slug));
  if (!existingSet.has(base)) return base;

  let suffix = 2;
  while (existingSet.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/**
 * Inserts a new wiki page plus its initial `page_titles` row and the
 * `page_relationships` row to its parent, all stamped at `introChapterId`.
 *
 * Framework-free (no auth, redirect, or revalidation) so it can be shared by
 * the `createPage` Server Action and the local ingest scripts. Pass `tx` to
 * run inside a caller-owned transaction; otherwise a new one is opened.
 * No content revision is seeded — the first edit creates it.
 *
 * @example
 * const { id, slug } = await createPageRecord({ serialId, name, introChapterId, parentPageId });
 * // or inside an existing transaction:
 * await db.transaction((tx) => createPageRecord(input, tx));
 */
export async function createPageRecord(
  input: CreatePageRecordInput,
  tx?: Tx,
): Promise<{ id: number; slug: string }> {
  if (!tx) return db.transaction((t) => createPageRecord(input, t));

  const { serialId, name, introChapterId, parentPageId } = input;
  const slug = await generateUniqueSlug(serialId, name, tx);

  const [newPage] = await tx
    .insert(pages)
    .values({
      serialId,
      name,
      slug,
      introChapterId,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning({ id: pages.id });
  if (!newPage) throw new Error("Failed to insert page");

  await tx
    .insert(pageTitles)
    .values({ pageId: newPage.id, chapterId: introChapterId, title: name });

  await tx.insert(pageRelationships).values({
    parentPageId,
    childPageId: newPage.id,
    chapterId: introChapterId,
    isActive: true,
  });

  return { id: newPage.id, slug };
}
