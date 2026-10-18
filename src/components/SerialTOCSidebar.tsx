import { Text } from "@/components/ui/Text";
import { SerialTOC } from "@/components/SerialTOC";
import { SerialEditorDialog } from "@/components/SerialEditorDialog";
import type { ChapterRow, Volume } from "@/types";
import type { ChapterType, VolumeType } from "@/lib/serial-types";
import {
  addChapter,
  addVolume,
  deleteChapter,
  deleteVolume,
  renameChapter,
  renameVolume,
  updateSerialTypes,
  reorderVolumes,
  reorderAllChapters,
  bulkApplyToc,
} from "@/app/[serial]/actions";

type SerialTOCSidebarProps = {
  /** The serial's database ID. */
  serialId: number;
  /** The serial's URL slug, forwarded to SerialTOC for chapter links. */
  serialSlug: string;
  /** Ordered list of volumes to display in the TOC. */
  volumes: Volume[];
  /** Map from volume ID to its chapters. */
  chaptersByVolume: Record<number, ChapterRow[]>;
  /** Display label for an individual chapter (e.g. "Chapter", "Episode"). */
  chapterType: ChapterType;
  /** Display label for a volume group (e.g. "Volume", "Season"). */
  volumeType: VolumeType;
  /** When false, hides the edit icon so non-admins cannot open SerialEditor. */
  isAdmin?: boolean;
  /** The chapter the admin is currently reading; forwarded to SerialEditor as the initial "Writing as of" selection. */
  readingChapterId?: number | null;
};

/**
 * Desktop left sidebar: collapsible TOC with an inline edit icon for admins.
 * Server component — binds serial actions internally so callers only pass data.
 *
 * @example
 * <SerialTOCSidebar serialId={1} serialSlug="my-serial" volumes={...} ... />
 */
export function SerialTOCSidebar(props: SerialTOCSidebarProps) {
  const {
    serialId,
    serialSlug,
    volumes,
    chaptersByVolume,
    chapterType,
    volumeType,
    isAdmin = false,
    readingChapterId = null,
  } = props;

  return (
    <div className="rounded-lg border border-toc-border bg-toc-bg p-3">
      <div className="flex items-center justify-between mb-3">
        <Text
          variant="label"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Contents
        </Text>
        {isAdmin && (
          <SerialEditorDialog
            serialId={serialId}
            volumes={volumes}
            chaptersByVolume={chaptersByVolume}
            chapterType={chapterType}
            volumeType={volumeType}
            readingChapterId={readingChapterId}
            addChapterAction={addChapter.bind(null, serialId)}
            addVolumeAction={addVolume.bind(null, serialId)}
            deleteChapterAction={deleteChapter.bind(null, serialId)}
            deleteVolumeAction={deleteVolume.bind(null, serialId)}
            renameChapterAction={renameChapter.bind(null, serialId)}
            renameVolumeAction={renameVolume.bind(null, serialId)}
            reorderVolumesAction={reorderVolumes.bind(null, serialId)}
            reorderAllChaptersAction={reorderAllChapters.bind(null, serialId)}
            updateSerialTypesAction={updateSerialTypes.bind(null, serialId)}
            bulkApplyTocAction={bulkApplyToc.bind(null, serialId)}
          />
        )}
      </div>

      <SerialTOC
        serialId={serialId}
        serialSlug={serialSlug}
        volumes={volumes}
        chaptersByVolume={chaptersByVolume}
        chapterType={chapterType}
      />
    </div>
  );
}
