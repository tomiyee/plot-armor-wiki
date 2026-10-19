/**
 * Database writes for approved ingest proposals, called by the
 * `/admin/ingestion` Server Actions. Each function is one transaction and
 * every write is stamped at chapter N. Reuses the app's write helpers so
 * revision invariants stay identical to the in-app editor and suggestion
 * approval paths. `db` is the admin-selected database (see `getAdminDb`).
 */
import type { Db } from "@/db/index";
import { chapterSynopses } from "@/db/schema";
import { fetchPageContentAtIdx, fetchPageInfoboxAtIdx } from "@/data/pages/queries";
import { applyPageContentRevision, applyPageInfoboxRevision } from "@/app/[serial]/[page]/revisionHelpers";
import { createPageRecord } from "@/lib/createPageRecord";
import { titleToSlug } from "@/lib/slug";

/** Target chapter for all writes. */
export type ApplyTarget = { db: Db; serialId: number; chapterId: number; chapterIdx: number; dryRun: boolean };

/** Thrown when the live page no longer matches the base the proposal was made against. */
export class StaleError extends Error {}

/** Upserts the chapter synopsis (same write as `approveSynopsisSuggestion`). */
export async function applySynopsis(t: ApplyTarget, content: string): Promise<void> {
  if (t.dryRun) return;
  await t.db
    .insert(chapterSynopses)
    .values({ chapterId: t.chapterId, content })
    .onConflictDoUpdate({ target: chapterSynopses.chapterId, set: { content, updatedAt: new Date() } });
}

/**
 * Creates a page introduced at chapter N under `parentPageId`, with its body
 * as the first content revision. Returns the new page id (-1 in dry-run).
 */
export async function applyNewPage(
  t: ApplyTarget,
  page: { title: string; parentPageId: number; content: string; infobox?: string | null },
): Promise<number> {
  if (t.dryRun) return -1;
  return t.db.transaction(async (tx) => {
    const name = page.title.trim();
    const { id, slug } = await createPageRecord(
      { serialId: t.serialId, name, introChapterId: t.chapterId, parentPageId: page.parentPageId },
      tx,
    );
    // Proposals link to a new page by the slug its title produces. A clash with a page the context
    // could not see (introduced later) gets a `-2` suffix and breaks those links, so roll back.
    if (slug !== titleToSlug(name))
      throw new Error(`slug for "${name}" would be "${slug}", not "${titleToSlug(name)}" - a hidden page already uses it; rename the proposed page`);
    await applyPageContentRevision(tx, id, t.chapterId, t.chapterIdx, page.content);
    if (page.infobox?.trim())
      await applyPageInfoboxRevision(tx, id, t.chapterId, t.chapterIdx, page.infobox, null, true);
    return id;
  });
}

/**
 * Writes an approved page update at chapter N: the body (when `content` is
 * set) and/or the infobox (when `infobox` is set). Stale check first: the
 * live body and infobox at N must still equal the bases from context.json.
 * The infobox image is kept as it is.
 */
export async function applyPageUpdate(
  t: ApplyTarget,
  pageId: number,
  base: { content: string; infobox: string },
  next: { content: string | null; infobox: string | null },
): Promise<void> {
  const [live, liveInfobox] = await Promise.all([
    fetchPageContentAtIdx(pageId, t.chapterIdx, t.db),
    fetchPageInfoboxAtIdx(pageId, t.chapterIdx, t.db),
  ]);
  if (
    (next.content !== null && live.content !== base.content) ||
    (next.infobox !== null && liveInfobox.content !== base.infobox)
  ) {
    throw new StaleError(
      `Stale (409): page ${pageId} changed since export - run add-context.ts for it and regenerate the proposal.`,
    );
  }
  if (t.dryRun) return;
  await t.db.transaction(async (tx) => {
    if (next.content !== null) await applyPageContentRevision(tx, pageId, t.chapterId, t.chapterIdx, next.content);
    if (next.infobox !== null)
      await applyPageInfoboxRevision(tx, pageId, t.chapterId, t.chapterIdx, next.infobox, liveInfobox.imageUrl, true);
  });
}
