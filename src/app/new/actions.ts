"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/db/index";
import {
  serials,
  serialAuthors,
  pages,
  pageContentRevisions,
  volumes,
  chapters,
  serialAdmins,
} from "@/db/schema";
import { titleToSlug } from "@/lib/slug";
import { parseChapterType, parseVolumeType } from "@/lib/serial-types";
import { auth } from "@/auth";

/**
 * Creates a new serial and its home page. If the user provides description
 * text, a first volume + chapter are auto-created (e.g. "Volume 1" /
 * "Chapter 1") so the initial body content revision can be stored
 * immediately - content revisions require a chapter_id.
 *
 * @example
 * <form action={createSerial}>…</form>
 */
export async function createSerial(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id)
    throw new Error("Unauthorized: sign in to create a serial.");

  const title = formData.get("title");
  if (!title || typeof title !== "string" || title.trim() === "") {
    throw new Error("Title is required");
  }

  const splashArtUrl = formData.get("splashArtUrl");
  const chapterType = parseChapterType(formData.get("chapterType"));
  const volumeType = parseVolumeType(formData.get("volumeType"));

  const descriptionRaw = formData.get("description");
  const description =
    descriptionRaw && typeof descriptionRaw === "string"
      ? descriptionRaw.trim()
      : "";

  // authors is a multi-value field - filter out blank entries
  const authorValues = formData.getAll("authors") as string[];
  const filteredAuthors = authorValues
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  const slug = titleToSlug(title.trim());

  const [inserted] = await db
    .insert(serials)
    .values({
      title: title.trim(),
      slug,
      splashArtUrl:
        splashArtUrl && typeof splashArtUrl === "string" && splashArtUrl.trim()
          ? splashArtUrl.trim()
          : null,
      chapterType,
      volumeType,
    })
    .returning({ id: serials.id });

  // Grant the creator admin rights over the new serial.
  await db.insert(serialAdmins).values({
    userId: session.user.id,
    serialId: inserted.id,
  });

  if (filteredAuthors.length > 0) {
    await db.insert(serialAuthors).values(
      filteredAuthors.map((name, i) => ({
        serialId: inserted.id,
        name,
        displayOrder: i + 1,
      })),
    );
  }

  // Automatically create the serial's home page. introChapterId is null because
  // no chapters exist yet; the home page is always visible regardless of cutoff.
  const [homePage] = await db
    .insert(pages)
    .values({
      serialId: inserted.id,
      name: "Home",
      slug: "home",
      introChapterId: null,
      isHomePage: true,
    })
    .returning({ id: pages.id });

  // If description text was provided, auto-create the first volume + chapter
  // so the content revision can be stored immediately.
  if (description) {
    const [vol1] = await db
      .insert(volumes)
      .values({ serialId: inserted.id, displayName: `${volumeType} 1`, idx: 1 })
      .returning({ id: volumes.id });

    const [ch1] = await db
      .insert(chapters)
      .values({ volumeId: vol1.id, displayName: `${chapterType} 1`, idx: 1 })
      .returning({ id: chapters.id });

    await db.insert(pageContentRevisions).values({
      pageId: homePage.id,
      chapterId: ch1.id,
      content: description,
    });

    // Pre-set the progress cookie so the SSR render after redirect uses cutoffIdx=1
    // and shows the description immediately - without this, no cookie exists on first
    // visit and cutoffIdx defaults to 0, which is below ch1.idx=1.
    const cookieStore = await cookies();
    cookieStore.set(`plotarmor_chapter_${inserted.id}`, String(ch1.id), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect(`/${slug}`);
}
