export const CHAPTER_TYPES = ['Chapter', 'Episode', 'Issue', 'Part'] as const;
export const VOLUME_TYPES = ['Volume', 'Season', 'Arc', 'Book'] as const;

export type ChapterType = (typeof CHAPTER_TYPES)[number];
export type VolumeType = (typeof VOLUME_TYPES)[number];

export function parseChapterType(value: unknown): ChapterType {
  if (typeof value === 'string' && (CHAPTER_TYPES as readonly string[]).includes(value)) {
    return value as ChapterType;
  }
  return 'Chapter';
}

export function parseVolumeType(value: unknown): VolumeType {
  if (typeof value === 'string' && (VOLUME_TYPES as readonly string[]).includes(value)) {
    return value as VolumeType;
  }
  return 'Volume';
}

export const CHAPTER_TYPE_OPTIONS = CHAPTER_TYPES.map((v) => ({ label: v, value: v }));
export const VOLUME_TYPE_OPTIONS = VOLUME_TYPES.map((v) => ({ label: v, value: v }));
