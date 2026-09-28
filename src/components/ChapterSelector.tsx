"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import { Button } from "@/components/ui/Button";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import { Popover } from "@/components/ui/Popover";
import { Select } from "@/components/ui/Select";
import type { Option } from "@/components/ui/Select";
import { BookmarkIcon, XIcon } from "lucide-react";
import { ChapterRow, Volume } from "@/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { syncUserProgress } from "@/app/[serial]/actions";

interface ChapterSelectorProps {
  /** DB id of the serial; used to scope the localStorage key, cookie name, and progress sync. */
  serialId: number;
  /** URL slug of the serial. */
  serialSlug: string;
  /** Label for the chapter unit (e.g. `"Chapter"`, `"Episode"`). */
  chapterType: string;
  /** All volumes for this serial, used to build grouped chapter options. */
  volumes: Volume[];
  /** Chapters keyed by volume id, used alongside `volumes` to populate the dropdown. */
  chaptersByVolume: Partial<Record<number, ChapterRow[]>>;
  /**
   * Chapter ID sourced from the `user_progress` database row (for authenticated
   * users). When provided it seeds the initial selection, overriding any stale
   * localStorage value, so that progress is consistent across devices.
   */
  initialChapterId?: number | null;
  /** Whether the current visitor is signed in. Enables server-side progress sync. */
  isAuthenticated?: boolean;
}

function cookieName(serialId: number) {
  return `plotarmor_chapter_${serialId}`;
}

function writeCookie(serialId: number, chapterId: number) {
  document.cookie = `${cookieName(serialId)}=${chapterId}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

/** Once dismissed on any serial, the spoiler popover never shows again. */
const GLOBAL_POPOVER_DISMISSED_KEY = "plotarmor:spoiler_popover_dismissed";

/**
 * Chapter-progress selector that persists to localStorage and mirrors the
 * selection into a cookie so Server Components can read the cutoff without
 * waiting for hydration.
 *
 * On first visit globally (across all serials), a popover callout anchored
 * below the chapter button reminds the user to set their chapter. Dismisses
 * when the user picks a chapter or clicks the X.
 *
 * On wide screens renders an inline "Reading up to:" label + dropdown.
 * On narrow screens renders a book icon button that opens a bottom drawer.
 * An amber badge dot appears over the icon when the spoiler warning is active.
 *
 * @example
 * <ChapterSelector
 *   serialId={serial.id}
 *   serialSlug={serialSlug}
 *   chapterType={serial.chapterType}
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 * />
 */
export function ChapterSelector(props: ChapterSelectorProps) {
  const {
    serialId,
    chapterType,
    volumes,
    chaptersByVolume,
    initialChapterId,
    isAuthenticated,
  } = props;

  const allChapters = useMemo(
    () =>
      volumes
        .flatMap((v) => chaptersByVolume[v.id] ?? [])
        .sort((a, b) => a.idx - b.idx),
    [volumes, chaptersByVolume],
  );

  const firstChapterId = allChapters[0]?.id ?? null;
  const defaultChapterId = initialChapterId ?? firstChapterId;

  const [selectedChapterId, setSelectedChapterId] = usePersistedStore<
    number | null
  >(`plotarmor:progress:${serialId}`, defaultChapterId);

  // suppressHydrationWarning: server renders open (default=false); client may
  // have dismissed=true in localStorage - intentional mismatch accepted.
  const [popoverDismissed, setPopoverDismissed] = usePersistedStore<boolean>(
    GLOBAL_POPOVER_DISMISSED_KEY,
    false,
  );

  // Wraps the Select trigger; anchors the spoiler Popover callout.
  const triggerRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  // Stable options array; new reference each render would bust Select's memos.
  const options = useMemo<Option<number | null>[]>(
    () =>
      volumes
        .filter((v) => (chaptersByVolume[v.id] ?? []).length > 0)
        .map((v) => ({
          label: v.displayName,
          value: null,
          structural: true as const,
          children: (chaptersByVolume[v.id] ?? []).map(
            (c): Option<number | null> => ({
              label: c.displayName,
              value: c.id,
            }),
          ),
        })),
    [volumes, chaptersByVolume],
  );

  const handleChange = useCallback(
    (id: number | null) => {
      if (id === null) return;
      setSelectedChapterId(id);
      setPopoverDismissed(true);
      writeCookie(serialId, id);
      if (isAuthenticated) void syncUserProgress(serialId, id);
      router.refresh();
    },
    [
      serialId,
      isAuthenticated,
      router,
      setSelectedChapterId,
      setPopoverDismissed,
    ],
  );

  useEffect(() => {
    const id = selectedChapterId ?? firstChapterId;
    if (id === null) return;
    writeCookie(serialId, id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the server provides a DB-sourced initialChapterId, override localStorage
  // and sync the cookie so SSR sees the correct cutoff without waiting for a
  // chapter-change interaction.
  useEffect(() => {
    if (initialChapterId == null) return;
    setSelectedChapterId(initialChapterId);
    writeCookie(serialId, initialChapterId);
    // Only run once on mount when the server provides a DB value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (allChapters.length === 0) return null;

  const effectiveChapterId = selectedChapterId ?? firstChapterId;
  const selectedChapter = allChapters.find((c) => c.id === effectiveChapterId);
  const selectedLabel = selectedChapter
    ? selectedChapter.displayName
    : `Select ${chapterType}`;

  const spoilerCallout = (
    <Box className="items-start gap-2 px-3 py-2 text-sm">
      <Text variant="label" className="flex-1 leading-snug text-amber-800">
        We defaulted to the first {chapterType.toLowerCase()} to avoid spoilers.
        Set your {chapterType.toLowerCase()} here.
      </Text>
      <Tooltip content="Dismiss">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setPopoverDismissed(true)}
          aria-label="Dismiss spoiler reminder"
          className="shrink-0 text-amber-600 hover:bg-amber-100 hover:text-amber-800"
        >
          <XIcon />
        </Button>
      </Tooltip>
    </Box>
  );

  return (
    <Box className="items-center">
      <div ref={triggerRef}>
        <Select
          options={options}
          value={effectiveChapterId ?? undefined}
          onChange={handleChange}
          popupWidth="240px"
          aria-label={`Set ${chapterType} progress`}
        >
          <Tooltip content={`Set your ${chapterType}`}>
            <Button
              variant="ghost"
              size="icon"
              className="sm:w-auto sm:px-2.5 gap-1 items-center"
              aria-label={`Set ${chapterType} progress`}
            >
              <BookmarkIcon className="size-4" />
              <Text
                as="span"
                variant="label"
                className="hidden sm:inline truncate"
              >
                {selectedLabel}
              </Text>
            </Button>
          </Tooltip>
        </Select>
      </div>

      <span suppressHydrationWarning>
        <Popover
          anchor={triggerRef}
          open={!popoverDismissed}
          onOpenChange={(open) => {
            if (!open) setPopoverDismissed(true);
          }}
          modal={false}
          side="bottom"
          align="end"
          className="w-64 border-amber-300 bg-amber-50 text-amber-800"
          content={spoilerCallout}
        />
      </span>
    </Box>
  );
}
