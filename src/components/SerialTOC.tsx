"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/Accordion";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { ChapterRow, Volume } from "@/types";

type SerialTOCProps = {
  /** The serial's database ID, used as the localStorage key namespace. */
  serialId: number;
  /** The serial's URL slug, used to build chapter hrefs. */
  serialSlug: string;
  /** Ordered list of volumes to render as accordion sections. */
  volumes: Volume[];
  /** Map from volume ID to its chapters, used to populate each accordion section. */
  chaptersByVolume: Partial<Record<number, ChapterRow[]>>;
  /** Display label for an individual chapter (e.g. "Chapter", "Episode"). */
  chapterType: string;
};

/**
 * Collapsible table-of-contents listing volumes and their chapters. Collapse
 * state is persisted per-serial via localStorage (same key as SerialEditor),
 * so opening/closing volumes here stays in sync with the editor dialog.
 * Used as the body of the desktop sidebar and the mobile navbar drawer.
 *
 * @example
 * <SerialTOC
 *   serialId={serial.id}
 *   serialSlug="my-serial"
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 *   chapterType="Chapter"
 * />
 */
export function SerialTOC(props: SerialTOCProps) {
  const { serialId, serialSlug, volumes, chaptersByVolume, chapterType } =
    props;

  const [volCollapsed, setVolCollapsed] = usePersistedStore<
    Record<number, boolean>
  >(`plotarmor:toc-collapsed:${serialId}`, {});

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const visibleVolumes = volumes.filter(
    (v) => (chaptersByVolume[v.id] ?? []).length > 0,
  );

  if (visibleVolumes.length === 0) {
    return (
      <Text muted className="text-sm">
        No {chapterType.toLowerCase()}s yet - add your first one below.
      </Text>
    );
  }

  // When a search is active, only show volumes that have at least one match
  // and auto-expand them all. Otherwise respect the persisted collapse state.
  const filteredVolumes = normalizedQuery
    ? visibleVolumes.filter((v) =>
        (chaptersByVolume[v.id] ?? []).some((c) =>
          c.displayName.toLowerCase().includes(normalizedQuery),
        ),
      )
    : visibleVolumes;

  const openIds = normalizedQuery
    ? filteredVolumes.map((v) => v.id)
    : filteredVolumes.filter((v) => !volCollapsed[v.id]).map((v) => v.id);

  function handleValueChange(newValues: number[]) {
    setVolCollapsed(() => {
      const next: Record<number, boolean> = {};
      visibleVolumes.forEach((v) => {
        if (!newValues.includes(v.id)) next[v.id] = true;
      });
      return next;
    });
  }

  function getChapters(volumeId: number): ChapterRow[] {
    const chaps = chaptersByVolume[volumeId] ?? [];
    if (!normalizedQuery) return chaps;
    return chaps.filter((c) =>
      c.displayName.toLowerCase().includes(normalizedQuery),
    );
  }

  return (
    <nav aria-label="Table of contents">
      <Input
        placeholder={`Search ${chapterType.toLowerCase()}s…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 h-7 text-sm"
      />
      {filteredVolumes.length === 0 ? (
        <Text muted className="text-sm px-2">
          No {chapterType.toLowerCase()}s match &ldquo;{query}&rdquo;
        </Text>
      ) : (
        <Accordion
          value={openIds}
          onValueChange={normalizedQuery ? undefined : handleValueChange}
          multiple
          className="gap-0"
        >
          {filteredVolumes.map((volume) => (
            <AccordionItem
              key={volume.id}
              value={volume.id}
              className="border-none"
            >
              <AccordionTrigger className="border-none text-xs font-semibold uppercase tracking-wider text-muted-foreground py-1 hover:no-underline hover:text-foreground bg-transparent hover:bg-transparent rounded-none">
                {volume.displayName}
              </AccordionTrigger>
              <AccordionContent className="[&_a]:no-underline [&_a]:hover:text-foreground pb-0">
                <ul className="space-y-0.5 mb-2">
                  {getChapters(volume.id).map((chapter) => (
                    <li key={chapter.id}>
                      <Link
                        href={`/${serialSlug}/chapter/${chapter.idx}`}
                        className="block rounded px-2 py-1 text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {chapter.displayName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </nav>
  );
}
