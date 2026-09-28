/** A page's single merged body content at the reader's current cutoff. */
export interface PageBodyData {
  content: string;
  /** The chapters.idx of the revision currently active at the reader's cutoff, or null if no content yet. */
  lastUpdatedChapterIdx: number | null;
}

/** A page's merged infobox content + image at the reader's current cutoff. */
export interface PageInfoboxData {
  content: string;
  imageUrl: string | null;
  /** The chapters.idx of the revision currently active at the reader's cutoff, or null if no content yet. */
  lastUpdatedChapterIdx: number | null;
}

export interface ChapterData {
  id: number;
  displayName: string;
  idx: number;
  volumeName: string;
}

export interface PageTitleEntry {
  chapterId: number;
  /** Human-readable label, e.g. "Volume 1 - Chapter 3". */
  chapterLabel: string;
  title: string;
}

/** A volume group option for the "Writing as of:" chapter selector. */
export type ChapterGroupOption = {
  label: string;
  value: number;
  children: { label: string; value: number; disabled: boolean }[];
};
