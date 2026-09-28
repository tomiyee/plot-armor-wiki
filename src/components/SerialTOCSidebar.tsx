"use client";

import { useState } from "react";
import { PenIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/Dialog";
import { SerialTOC } from "@/components/SerialTOC";
import { SerialEditor } from "@/components/SerialEditor";
import { Tooltip } from "@/components/ui/Tooltip";
import { ChapterRow, Volume } from "@/types";
import { ChapterType, VolumeType } from "@/lib/serial-types";
import type { BulkTocPayload } from "@/app/[serial]/actions";

type SerialTOCSidebarProps = {
  /** The serial's database ID. */
  serialId: number;
  /** The serial's URL slug, forwarded to SerialTOC for chapter links. */
  serialSlug: string;
  /** Ordered list of volumes to display in the TOC. */
  volumes: Volume[];
  /** Map from volume ID to its chapters, forwarded to SerialTOC and SerialEditor. */
  chaptersByVolume: Record<number, ChapterRow[]>;
  /** Display label for an individual chapter (e.g. "Chapter", "Episode"). */
  chapterType: ChapterType;
  /** Display label for a volume group (e.g. "Volume", "Season"). Used in SerialEditor. */
  volumeType: VolumeType;
  /** Server action to add a new chapter to a volume. */
  addChapterAction: (formData: FormData) => Promise<void>;
  /** Server action to add a new volume to the serial. */
  addVolumeAction: (formData: FormData) => Promise<void>;
  /** Server action to delete a chapter. */
  deleteChapterAction: (formData: FormData) => Promise<void>;
  /** Server action to delete a volume and all its chapters. */
  deleteVolumeAction: (formData: FormData) => Promise<void>;
  /** Server action to rename a chapter. */
  renameChapterAction: (formData: FormData) => Promise<void>;
  /** Server action to rename a volume. */
  renameVolumeAction: (formData: FormData) => Promise<void>;
  /** Server action to persist a new volume order. */
  reorderVolumesAction: (orderedVolumeIds: number[]) => Promise<void>;
  /** Server action to persist new chapter order across all volumes. */
  reorderAllChaptersAction: (
    volumeOrder: number[],
    chaptersByVolumeId: Record<number, number[]>,
  ) => Promise<void>;
  /** Server action to update the serial's chapter/volume type labels. */
  updateSerialTypesAction: (formData: FormData) => Promise<void>;
  /** Server action that atomically applies a bulk TOC edit. */
  bulkApplyTocAction: (payload: BulkTocPayload) => Promise<void>;
  /** When false, hides the edit (pen) icon so non-admins cannot open SerialEditor. */
  isAdmin?: boolean;
  /** The chapter the admin is currently reading; forwarded to SerialEditor as the initial "Writing as of" selection. */
  readingChapterId?: number | null;
};

/**
 * Desktop left sidebar: collapsible TOC with an inline edit icon. The pen icon
 * opens a dialog with the full SerialEditor already in edit mode. Volume
 * collapse state is shared with SerialEditor via the same localStorage key.
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
    addChapterAction,
    addVolumeAction,
    deleteChapterAction,
    deleteVolumeAction,
    renameChapterAction,
    renameVolumeAction,
    reorderVolumesAction,
    reorderAllChaptersAction,
    updateSerialTypesAction,
    bulkApplyTocAction,
    isAdmin = false,
    readingChapterId = null,
  } = props;
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-toc-border bg-toc-bg p-3">
        <div className="flex items-center justify-between mb-3">
          <Text
            variant="label"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Contents
          </Text>
          {isAdmin && (
            <Tooltip
              content={`Edit ${volumeType.toLowerCase()}s and ${chapterType.toLowerCase()}s`}
              side="right"
            >
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setEditOpen(true)}
                aria-label={`Edit ${volumeType.toLowerCase()}s and ${chapterType.toLowerCase()}s`}
                className="text-muted-foreground hover:text-foreground hover:bg-transparent"
              >
                <PenIcon className="h-3 w-3" />
              </Button>
            </Tooltip>
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

      <Dialog isOpen={editOpen} onClose={() => setEditOpen(false)}>
        <DialogHeader>
          <DialogTitle>
            {volumeType}s &amp; {chapterType}s
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-70vh">
          <SerialEditor
            serialId={serialId}
            volumes={volumes}
            chaptersByVolume={chaptersByVolume}
            chapterType={chapterType}
            volumeType={volumeType}
            readingChapterId={readingChapterId}
            addChapterAction={addChapterAction}
            addVolumeAction={addVolumeAction}
            deleteChapterAction={deleteChapterAction}
            deleteVolumeAction={deleteVolumeAction}
            renameChapterAction={renameChapterAction}
            renameVolumeAction={renameVolumeAction}
            reorderVolumesAction={reorderVolumesAction}
            reorderAllChaptersAction={reorderAllChaptersAction}
            updateSerialTypesAction={updateSerialTypesAction}
            bulkApplyTocAction={bulkApplyTocAction}
          />
        </DialogBody>
      </Dialog>
    </>
  );
}
