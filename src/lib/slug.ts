/**
 * Convert a serial title to a URL-safe slug.
 * e.g. "One Piece!" => "one-piece"
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
