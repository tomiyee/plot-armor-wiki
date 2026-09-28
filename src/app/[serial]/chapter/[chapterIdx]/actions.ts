"use server";

import { db } from "@/db/index";
import { chapterSynopses } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { requireSerialAdminBySlug } from "@/lib/auth-guard";
import { getSerialBySlug } from "@/data/serials/queries";
import { getChapterBySerialAndIdx } from "@/data/chapters/queries";

/**
 * Upserts the synopsis content for a chapter identified by serial slug + chapter idx.
 *
 * @example
 * await saveChapterSynopsis("one-piece", 42, "A brief recap…");
 */
export async function saveChapterSynopsis(
  serialSlug: string,
  chapterIdx: number,
  content: string,
): Promise<void> {
  await requireSerialAdminBySlug(serialSlug);

  const serial = await getSerialBySlug(serialSlug);
  if (!serial) throw new Error("Serial not found");

  const chapter = await getChapterBySerialAndIdx(serial.id, chapterIdx);
  if (!chapter) throw new Error("Chapter not found");

  await db
    .insert(chapterSynopses)
    .values({ chapterId: chapter.id, content })
    .onConflictDoUpdate({
      target: chapterSynopses.chapterId,
      set: { content, updatedAt: new Date() },
    });

  revalidatePath(`/${serialSlug}/chapter/${chapterIdx}`);
}
