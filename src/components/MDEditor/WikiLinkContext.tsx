"use client";

import { createContext } from "react";

/**
 * Context that feeds wiki page and chapter data into WikiLinkChip decorators
 * and the InsertWikiLinkButton toolbar component.
 *
 * Wrapped around MDXEditorClient so decorator elements and toolbar buttons
 * rendered inside Lexical can look up data without closure staleness - the
 * Provider re-renders on every wikiPages/wikiChapters change, so consumers
 * always see fresh data regardless of the plugins useMemo deps.
 */
export const WikiLinkContext = createContext<{
  wikiPages: { name: string; slug: string }[];
  wikiChapters: { name: string; idx: number }[];
  chapterType?: string;
  /** Inserts a WikiLinkNode at the current Lexical cursor position, with an optional alias. */
  insertWikiLink: (token: string, alias?: string) => void;
  /** Focuses the editor's contenteditable after a toolbar interaction. */
  focusEditor: () => void;
  /**
   * Opens the edit popover anchored to `el` for the WikiLinkNode identified by `nodeKey`.
   * Called from WikiLinkChip onClick so the chip can request an edit without owning Lexical state.
   */
  openEditMenu: (nodeKey: string, el: HTMLElement) => void;
  /**
   * Opens the insert-wiki-link popover anchored to `el`.
   * Called from InsertWikiLinkButton so the popover is rendered outside the
   * MDXEditor toolbar DOM subtree, avoiding inherited toolbar CSS.
   */
  openInsertMenu: (el: HTMLElement, selectedText?: string) => void;
}>({
  wikiPages: [],
  wikiChapters: [],
  insertWikiLink: () => {},
  focusEditor: () => {},
  openEditMenu: () => {},
  openInsertMenu: () => {},
});
