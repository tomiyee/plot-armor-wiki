"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db/index";
import { pages } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresError } from "postgres";
import { createPageRecord } from "@/lib/createPageRecord";
import { requireSerialAdminBySlug } from "@/lib/auth-guard";
import { getSerialBySlug } from "@/data/serials/queries";

/**
 * Creates a new wiki page under the given serial, then redirects to the
 * page's URL. Also inserts an initial `page_titles` entry and, when a parent
 * page is provided, a `page_relationships` row linking parent → new page.
 *
 * @example
 * // In a Server Component:
 * const createPageForSerial = createPage.bind(null, serialSlug);
 * <form action={createPageForSerial}>…</form>
 */
export async function createPage(serialSlug: string, formData: FormData) {
  await requireSerialAdminBySlug(serialSlug);
  const name = formData.get("name");
  const introChapterIdRaw = formData.get("introChapterId");
  const parentPageIdRaw = formData.get("parentPageId");
  const idempotencyKeyRaw = formData.get("idempotencyKey");

  if (!name || typeof name !== "string" || name.trim() === "") {
    throw new Error("Page name is required");
  }
  if (!introChapterIdRaw || typeof introChapterIdRaw !== "string") {
    throw new Error("Intro chapter is required");
  }

  const introChapterId = parseInt(introChapterIdRaw, 10);
  if (isNaN(introChapterId) || introChapterId <= 0)
    throw new Error("Intro chapter is required");

  if (
    !parentPageIdRaw ||
    typeof parentPageIdRaw !== "string" ||
    parentPageIdRaw === ""
  ) {
    throw new Error("Parent page is required");
  }
  const parentPageId = parseInt(parentPageIdRaw, 10);
  if (isNaN(parentPageId) || parentPageId <= 0)
    throw new Error("Invalid parent page ID");

  // Idempotency key: a UUID generated on form mount to deduplicate retries.
  // Present only when the form sends it; absent for programmatic / legacy calls.
  const idempotencyKey =
    idempotencyKeyRaw && typeof idempotencyKeyRaw === "string"
      ? idempotencyKeyRaw
      : null;

  const serial = await getSerialBySlug(serialSlug);
  if (!serial) throw new Error("Serial not found");

  const trimmedName = name.trim();

  // --- Idempotency check (Layer 2) ---
  // If a page was already created with the same key (e.g. the previous response
  // was lost and the user retried), redirect to that page instead of creating a
  // duplicate.
  if (idempotencyKey) {
    const [existing] = await db
      .select({ slug: pages.slug })
      .from(pages)
      .where(eq(pages.idempotencyKey, idempotencyKey));

    if (existing) {
      revalidatePath(`/${serialSlug}`, "layout");
      redirect(`/${serialSlug}/${encodeURIComponent(existing.slug)}`);
    }
  }

  let slug: string;
  try {
    ({ slug } = await createPageRecord({
      serialId: serial.id,
      name: trimmedName,
      introChapterId,
      parentPageId,
      idempotencyKey,
    }));
  } catch (err) {
    // Unique-constraint violation on idempotency_key means a concurrent request
    // already committed the same page. Look it up and redirect rather than crash.
    const pgErr = err as PostgresError;
    if (
      idempotencyKey &&
      pgErr.code === "23505" &&
      pgErr.constraint_name === "pages_idempotency_key_unique"
    ) {
      const [race] = await db
        .select({ slug: pages.slug })
        .from(pages)
        .where(eq(pages.idempotencyKey, idempotencyKey));
      if (race) {
        revalidatePath(`/${serialSlug}`, "layout");
        redirect(`/${serialSlug}/${encodeURIComponent(race.slug)}`);
      }
    }
    throw err;
  }

  revalidatePath(`/${serialSlug}`, "layout");
  redirect(`/${serialSlug}/${encodeURIComponent(slug)}`);
}
