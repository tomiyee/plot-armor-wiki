"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildRefMaps, extractRefCitations, type RefCitation } from "@/lib/refs";

type WikiPageRefsContextValue = {
  /** Global token→ordinal map, computed across all registered sections in page order. */
  ordinalMap: Map<string, number>;
  /** Token → distinct quotes across all citations of that token, for the reference list. */
  quotesMap: Map<string, string[]>;
  /** Adds or replaces a section's citations. Pass an empty array to clear. */
  registerSection: (key: string, citations: RefCitation[]) => void;
  /** Removes a section's registration entirely (call on unmount). */
  unregisterSection: (key: string) => void;
};

const WikiPageRefsContext = createContext<WikiPageRefsContextValue>({
  ordinalMap: new Map(),
  quotesMap: new Map(),
  registerSection: () => {},
  unregisterSection: () => {},
});

type OrderedSection = {
  /** Stable identifier (e.g. `"infobox-1"`, `"section-42"`). */
  key: string;
  /** Raw markdown content; scanned for `{{ref|…}}` citations. */
  markdown: string;
};

type WikiPageRefsProviderProps = {
  /**
   * Ordered section keys defining the global ref numbering sequence.
   * Infobox row keys must appear before page section keys so infobox refs
   * are numbered first. Both groups should be sorted by `displayOrder`.
   */
  orderedSectionKeys: string[];
  /**
   * Pre-seeded section data for synchronous initial ordinal computation,
   * so the first render already shows globally correct reference numbers.
   */
  initialSections: OrderedSection[];
  children: ReactNode;
};

/**
 * Provides globally consistent reference ordinals across all sections of a wiki
 * page. Infobox row refs are numbered before page section refs; within each
 * group, refs are numbered by section order then first-appearance order within
 * each section's markdown.
 *
 * Wrap the read-mode page content with this provider, then call
 * `useWikiPageRefs` in each rendered section to receive the global ordinal
 * map and pass it to `MarkdownRenderer` as `refOrdinalMap`.
 *
 * @example
 * <WikiPageRefsProvider
 *   orderedSectionKeys={["infobox-1", "section-10", "section-11"]}
 *   initialSections={[{ key: "infobox-1", markdown: row.content }, ...]}
 * >
 *   {children}
 * </WikiPageRefsProvider>
 */
export function WikiPageRefsProvider(props: WikiPageRefsProviderProps) {
  const { orderedSectionKeys, initialSections, children } = props;

  // Pre-seed the registry from initialSections so the first render is correct.
  const [registry, setRegistry] = useState<Map<string, RefCitation[]>>(() => {
    const map = new Map<string, RefCitation[]>();
    for (const { key, markdown } of initialSections) {
      const citations = extractRefCitations(markdown);
      if (citations.length > 0) map.set(key, citations);
    }
    return map;
  });

  const { ordinalMap, quotesMap } = useMemo(
    () =>
      buildRefMaps(orderedSectionKeys.flatMap((key) => registry.get(key) ?? [])),
    [orderedSectionKeys, registry],
  );

  const registerSection = useCallback((key: string, citations: RefCitation[]) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      if (citations.length === 0) next.delete(key);
      else next.set(key, citations);
      return next;
    });
  }, []);

  const unregisterSection = useCallback((key: string) => {
    setRegistry((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ ordinalMap, quotesMap, registerSection, unregisterSection }),
    [ordinalMap, quotesMap, registerSection, unregisterSection],
  );

  return (
    <WikiPageRefsContext.Provider value={value}>
      {children}
    </WikiPageRefsContext.Provider>
  );
}

/**
 * Registers this section's ref citations with the page-level context and
 * returns the page-wide ordinal and quote maps, so `MarkdownRenderer` numbers
 * refs consistently across sections and `{{refbox}}` lists every page ref with
 * its quotes. Unregisters on unmount so ordinals update when sections go away.
 *
 * Must be called inside a `WikiPageRefsProvider`. Pass `ordinalMap` to
 * `MarkdownRenderer` as `refOrdinalMap`.
 *
 * @example
 * const { ordinalMap, quotesMap } = useWikiPageRefs("content", content);
 * return <MarkdownRenderer refOrdinalMap={ordinalMap}>{content}</MarkdownRenderer>;
 */
export function useWikiPageRefs(
  sectionKey: string,
  markdown: string,
): { ordinalMap: Map<string, number>; quotesMap: Map<string, string[]> } {
  const { ordinalMap, quotesMap, registerSection, unregisterSection } =
    useContext(WikiPageRefsContext);

  // Stable reference: only recomputed when markdown changes.
  const citations = useMemo(() => extractRefCitations(markdown), [markdown]);

  useEffect(() => {
    registerSection(sectionKey, citations);
    return () => {
      unregisterSection(sectionKey);
    };
  }, [sectionKey, citations, registerSection, unregisterSection]);

  return { ordinalMap, quotesMap };
}
