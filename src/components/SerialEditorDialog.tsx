"use client";

import { useState } from "react";
import { PenIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { SerialEditor } from "@/components/SerialEditor";
import type { ChapterRow, Volume } from "@/types";
import type { ChapterType, VolumeType } from "@/lib/serial-types";
import type { BulkTocPayload } from "@/app/[serial]/actions";

type SerialEditorDialogProps = {
  /** The serial's database ID, forwarded to SerialEditor. */
  serialId: number;
  /** Ordered list of volumes, forwarded to SerialEditor. */
  volumes: Volume[];
  /** Map from volume ID to its chapters, forwarded to SerialEditor. */
  chaptersByVolume: Record<number, ChapterRow[]>;
  /** Display label for an individual chapter (e.g. "Chapter", "Episode"). */
  chapterType: ChapterType;
  /** Display label for a volume group (e.g. "Volume", "Season"). */
  volumeType: VolumeType;
  /** The chapter the admin is currently reading; forwarded to SerialEditor as the initial "Writing as of" selection. */
  readingChapterId?: number | null;
  addChapterAction: (formData: FormData) => Promise<void>;
  addVolumeAction: (formData: FormData) => Promise<void>;
  deleteChapterAction: (formData: FormData) => Promise<void>;
  deleteVolumeAction: (formData: FormData) => Promise<void>;
  renameChapterAction: (formData: FormData) => Promise<void>;
  renameVolumeAction: (formData: FormData) => Promise<void>;
  reorderVolumesAction: (orderedVolumeIds: number[]) => Promise<void>;
  reorderAllChaptersAction: (
    volumeOrder: number[],
    chaptersByVolumeId: Record<number, number[]>,
  ) => Promise<void>;
  updateSerialTypesAction: (formData: FormData) => Promise<void>;
  bulkApplyTocAction: (payload: BulkTocPayload) => Promise<void>;
};

/**
 * Pen-icon trigger + dialog shell for SerialEditor. Keeps "use client" isolated
 * so SerialTOCSidebar can remain a server component.
 */
export function SerialEditorDialog(props: SerialEditorDialogProps) {
  const {
    serialId,
    volumes,
    chaptersByVolume,
    chapterType,
    volumeType,
    readingChapterId = null,
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
  } = props;

  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip
        content={`Edit ${volumeType.toLowerCase()}s and ${chapterType.toLowerCase()}s`}
        side="right"
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${volumeType.toLowerCase()}s and ${chapterType.toLowerCase()}s`}
          className="text-muted-foreground hover:text-foreground hover:bg-transparent"
        >
          <PenIcon className="h-3 w-3" />
        </Button>
      </Tooltip>

      <Dialog isOpen={open} onClose={() => setOpen(false)}>
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
