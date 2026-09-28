import { getSerialVolumesAndChapters } from "@/data/chapters/queries";
import { getSerialPages } from "@/data/pages/queries";
import type { NewPageFormData } from "@/types";

/**
 * Fetches all data needed to render the new-page creation form for a given serial.
 * Runs volume/chapter/page queries in parallel.
 *
 * `existingPages` includes `introChapterId` so the parent dropdown can filter
 * out pages the reader hasn't reached yet.
 */
export async function getNewPageFormData(serialId: number): Promise<NewPageFormData> {
  const [{ volumeList, chapterList }, existingPages] = await Promise.all([
    getSerialVolumesAndChapters(serialId),
    getSerialPages(serialId),
  ]);

  return { volumeList, chapterList, existingPages };
}
