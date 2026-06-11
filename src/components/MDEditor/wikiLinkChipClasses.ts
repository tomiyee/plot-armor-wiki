/**
 * Shared Tailwind class strings for the wiki-link chip appearance.
 *
 * Centralised here so the WYSIWYG editor chip (`WikiLinkChip`) and the
 * read-mode hover-card triggers (`WikiLinkPreview`, `ChapterLinkPreview`)
 * stay visually identical without duplicating the class list.
 *
 * @example
 * // Editor chip (clickable, non-navigable)
 * className={`${WIKI_LINK_CHIP_BASE} ${WIKI_LINK_CHIP_INTERACTIVE}`}
 *
 * // Read-mode anchor (navigable link)
 * className={`${WIKI_LINK_CHIP_BASE} ${WIKI_LINK_CHIP_LINK}`}
 */

/** Base visual treatment shared by all wiki-link chip surfaces. */
export const WIKI_LINK_CHIP_BASE =
  "inline-flex select-none items-baseline gap-1 rounded bg-muted px-1.5 py-0.5 text-sm font-medium text-foreground";

/**
 * Interactive hover style for editor chips (pointer cursor, accent background).
 * Use when the chip opens an edit popover rather than navigating.
 */
export const WIKI_LINK_CHIP_INTERACTIVE =
  "cursor-pointer hover:bg-accent hover:text-accent-foreground";

/**
 * Interactive hover style for read-mode anchor chips (pointer cursor, accent
 * background). Overrides `select-none` from the base — navigable `<a>`
 * elements must allow text selection so users can copy the link label.
 */
export const WIKI_LINK_CHIP_LINK =
  "cursor-pointer hover:bg-accent hover:text-accent-foreground select-text";

/**
 * Visual overlay applied on top of `WIKI_LINK_CHIP_BASE` (and optionally
 * `WIKI_LINK_CHIP_INTERACTIVE`) when the target page or chapter cannot be
 * resolved — i.e. the link is "dead". The dashed underline and destructive
 * text colour give authors an immediate in-editor signal without blocking the
 * editing workflow.
 */
export const WIKI_LINK_CHIP_DEAD =
  "text-destructive underline decoration-dashed";
