"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PlusIcon,
  Trash2Icon,
  GripVerticalIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react";
import type { BulkTocPayload } from "@/app/[serial]/actions";
import { Banner } from "@/components/ui/Banner";
import { WritingAsOfBanner } from "@/app/[serial]/[page]/WritingAsOfBanner";
import type { ChapterGroupOption } from "@/app/[serial]/[page]/types";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/Dialog";
import { useServerAction } from "@/hooks/useServerAction";
import { usePersistedStore } from "@/hooks/usePersistedStore";
import {
  CHAPTER_TYPE_OPTIONS,
  VOLUME_TYPE_OPTIONS,
  ChapterType,
  VolumeType,
} from "@/lib/serial-types";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ChapterRow as Chapter, Volume } from "@/types";

interface PendingDelete {
  type: "volume" | "chapter";
  id: number;
  name: string;
}

interface SerialEditorProps {
  serialId: number;
  volumes: Volume[];
  chaptersByVolume: Record<number, Chapter[]>;
  chapterType: ChapterType;
  volumeType: VolumeType;
  /** The chapter the admin is currently reading; used as the initial "Writing as of" selection. */
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
  /** Server action that atomically applies a bulk TOC edit. */
  bulkApplyTocAction: (payload: BulkTocPayload) => Promise<void>;
}

type RenameVolumeFormProps = {
  volume: Volume;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
};

function RenameVolumeForm({ volume, onSave, onCancel }: RenameVolumeFormProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave(new FormData(e.currentTarget));
    onCancel();
  }
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <input type="hidden" name="volumeId" value={volume.id} />
      <Input
        name="displayName"
        defaultValue={volume.displayName}
        required
        autoFocus
        className="flex-1"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <Button type="submit" size="sm">
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

type RenameChapterFormProps = {
  chapter: Chapter;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
};

function RenameChapterForm(props: RenameChapterFormProps) {
  const { chapter, onSave, onCancel } = props;
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave(new FormData(e.currentTarget));
    onCancel();
  }
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <input type="hidden" name="chapterId" value={chapter.id} />
      <Input
        name="displayName"
        defaultValue={chapter.displayName}
        required
        autoFocus
        className="flex-1 h-7 text-sm"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <Button type="submit" size="sm">
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

// Non-interactive clone of a volume rendered by DragOverlay - layout-isolated from flex container.
function VolumeDragPreview({
  volume,
  chapters: vChapters,
}: {
  volume: Volume;
  chapters: Chapter[];
}) {
  return (
    <Box
      col
      className="gap-2 rounded-lg bg-card border border-border shadow-xl p-2"
    >
      <Text variant="h4">{volume.displayName}</Text>
      {vChapters.length > 0 && (
        <ol className="flex flex-col gap-1 pl-3 border-l-2 border-border">
          {vChapters.map((chapter) => (
            <li
              key={chapter.id}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
            >
              <Text as="span" variant="label" className="truncate">
                {chapter.displayName}
              </Text>
              <Text as="span" muted>
                #{chapter.idx}
              </Text>
            </li>
          ))}
        </ol>
      )}
    </Box>
  );
}

// Non-interactive clone of a chapter rendered by DragOverlay.
function ChapterDragPreview({ chapter }: { chapter: Chapter }) {
  return (
    <li className="flex items-center justify-between rounded-md px-3 py-2 text-sm bg-card border border-border shadow-lg list-none">
      <Text as="span" variant="label" className="truncate">
        {chapter.displayName}
      </Text>
      <Text as="span" muted>
        #{chapter.idx}
      </Text>
    </li>
  );
}

type SortableChapterItemProps = {
  chapter: Chapter;
  editing: boolean;
  isRenaming: boolean;
  isPending: boolean;
  isVolumeDragging: boolean;
  onStartRename: () => void;
  onSaveRename: (fd: FormData) => void;
  onCancelRename: () => void;
  onDelete: () => void;
};

/**
 * Sortable row for a single chapter within a volume.
 * In edit mode the drag handle is visible and the row is draggable.
 */
function SortableChapterItem({
  chapter,
  editing,
  isRenaming,
  isPending,
  isVolumeDragging,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onDelete,
}: SortableChapterItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: chapter.id,
    // Disable chapter sortable while a volume is being dragged to prevent collision conflicts.
    disabled: !editing || isPending || isVolumeDragging,
    data: { type: "chapter", volumeId: chapter.volumeId },
  });

  const style: React.CSSProperties = {
    // CSS.Translate avoids any scale components that would distort the element's size.
    transform: CSS.Translate.toString(transform),
    transition,
    // Hide the original element while DragOverlay renders the visual clone.
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
    >
      {editing && isRenaming ? (
        <RenameChapterForm
          chapter={chapter}
          onSave={onSaveRename}
          onCancel={onCancelRename}
        />
      ) : (
        <>
          <Box className="items-center gap-2 flex-1 min-w-0">
            {editing && (
              <span
                {...attributes}
                {...listeners}
                className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
                title="Drag to reorder"
              >
                <GripVerticalIcon className="h-3 w-3" />
              </span>
            )}
            <Text
              as="span"
              variant="label"
              className={`truncate ${editing ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
              onClick={editing ? onStartRename : undefined}
              title={editing ? "Click to rename" : undefined}
            >
              {chapter.displayName}
            </Text>
          </Box>
          <Box className="items-center gap-2 shrink-0">
            <Text as="span" muted>
              #{chapter.idx}
            </Text>
            {editing && (
              <Tooltip content={`Delete ${chapter.displayName}`}>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  aria-label={`Delete ${chapter.displayName}`}
                  onClick={onDelete}
                >
                  <Trash2Icon className="h-2.5 w-2.5" />
                </Button>
              </Tooltip>
            )}
          </Box>
        </>
      )}
    </li>
  );
}

/**
 * Sortable card for a single volume (including its inner chapter list).
 * In edit mode the volume header has its own drag handle.
 * Chapter reordering and cross-volume moves are handled by the outer DndContext.
 */
function SortableVolumeItem({
  volume,
  chapters: vChapters,
  editing,
  isPending,
  isCollapsed,
  onToggleCollapse,
  isRenamingVolume,
  renamingChapterId,
  addingChapterToVolumeId,
  isVolumeDragging,
  onStartRenameVolume,
  onSaveRenameVolume,
  onCancelRenameVolume,
  onDeleteVolume,
  onStartRenameChapter,
  onSaveRenameChapter,
  onCancelRenameChapter,
  onDeleteChapter,
  onAddChapterClick,
  onAddChapterSubmit,
  onCancelAddChapter,
  addChapterFormRef,
  chapterType,
  volumeType,
}: {
  volume: Volume;
  chapters: Chapter[];
  editing: boolean;
  isPending: boolean;
  isRenamingVolume: boolean;
  renamingChapterId: number | null;
  addingChapterToVolumeId: number | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isVolumeDragging: boolean;
  onStartRenameVolume: () => void;
  onSaveRenameVolume: (fd: FormData) => void;
  onCancelRenameVolume: () => void;
  onDeleteVolume: () => void;
  onStartRenameChapter: (id: number) => void;
  onSaveRenameChapter: (fd: FormData) => void;
  onCancelRenameChapter: () => void;
  onDeleteChapter: (id: number, name: string) => void;
  onAddChapterClick: (volumeId: number) => void;
  onAddChapterSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancelAddChapter: () => void;
  addChapterFormRef: (el: HTMLFormElement | null) => void;
  chapterType: ChapterType;
  volumeType: VolumeType;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: volume.id,
    disabled: !editing || isPending,
    data: { type: "volume" },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const isAddingChapterHere = addingChapterToVolumeId === volume.id;

  return (
    <Box col ref={setNodeRef} style={style} className="gap-2">
      {/* Volume header */}
      <Box className="items-center justify-between gap-2">
        {editing && isRenamingVolume ? (
          <RenameVolumeForm
            volume={volume}
            onSave={onSaveRenameVolume}
            onCancel={onCancelRenameVolume}
          />
        ) : (
          <>
            <Box className="items-center gap-2 flex-1 min-w-0">
              {editing ? (
                <span
                  {...attributes}
                  {...listeners}
                  className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
                  title={`Drag to reorder ${volumeType.toLowerCase()}`}
                >
                  <GripVerticalIcon className="h-4 w-4" />
                </span>
              ) : (
                <Tooltip
                  content={
                    isCollapsed
                      ? `Expand ${volume.displayName}`
                      : `Collapse ${volume.displayName}`
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onToggleCollapse}
                    aria-label={
                      isCollapsed
                        ? `Expand ${volume.displayName}`
                        : `Collapse ${volume.displayName}`
                    }
                    className="text-muted-foreground hover:text-foreground hover:bg-transparent"
                  >
                    {isCollapsed ? (
                      <ChevronRightIcon className="h-3 w-3" />
                    ) : (
                      <ChevronDownIcon className="h-3 w-3" />
                    )}
                  </Button>
                </Tooltip>
              )}
              <Text
                variant="h4"
                className={
                  editing
                    ? "cursor-pointer hover:text-primary transition-colors"
                    : ""
                }
                onClick={editing ? onStartRenameVolume : undefined}
                title={editing ? "Click to rename" : undefined}
              >
                {volume.displayName}
              </Text>
            </Box>
            {editing && (
              <Tooltip
                content={`Delete ${volume.displayName} and all its ${chapterType.toLowerCase()}s`}
              >
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Delete ${volume.displayName} and all its ${chapterType.toLowerCase()}s`}
                  onClick={onDeleteVolume}
                >
                  <Trash2Icon className="h-3 w-3" />
                </Button>
              </Tooltip>
            )}
          </>
        )}
      </Box>

      {/* Chapter list - SortableContext only; DndContext lives in the parent SerialEditor */}
      {/* Hidden when collapsed in read mode; always shown in edit mode. */}
      {(editing || !isCollapsed) &&
        (vChapters.length > 0 ? (
          <SortableContext
            items={vChapters.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-1 pl-3 border-l-2 border-border">
              {vChapters.map((chapter) => (
                <SortableChapterItem
                  key={chapter.id}
                  chapter={chapter}
                  editing={editing}
                  isRenaming={renamingChapterId === chapter.id}
                  isPending={isPending}
                  isVolumeDragging={isVolumeDragging}
                  onStartRename={() => onStartRenameChapter(chapter.id)}
                  onSaveRename={onSaveRenameChapter}
                  onCancelRename={onCancelRenameChapter}
                  onDelete={() =>
                    onDeleteChapter(chapter.id, chapter.displayName)
                  }
                />
              ))}
            </ol>
          </SortableContext>
        ) : (
          <Text muted className="pl-3">
            No {chapterType.toLowerCase()}s yet.
          </Text>
        ))}

      {/* Add chapter - toggle between button and inline form */}
      {editing &&
        (isAddingChapterHere ? (
          <form
            ref={addChapterFormRef}
            onSubmit={onAddChapterSubmit}
            className="flex gap-2 items-center pl-3 mt-1"
          >
            <input type="hidden" name="volumeId" value={volume.id} />
            <Input
              name="displayName"
              required
              placeholder={`${chapterType} name…`}
              autoFocus
              className="flex-1"
              onKeyDown={(e) => e.key === "Escape" && onCancelAddChapter()}
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Add {chapterType.toLowerCase()}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start ml-3 mt-1"
            onClick={() => onAddChapterClick(volume.id)}
          >
            <PlusIcon className="h-3 w-3" />
            Add {chapterType.toLowerCase()}
          </Button>
        ))}
    </Box>
  );
}

// ── Bulk TOC helpers ─────────────────────────────────────────────────────────

/**
 * Parses and validates an unknown value as a `BulkTocPayload`.
 * Throws a descriptive error if the shape is wrong.
 */
function validateBulkTocPayload(raw: unknown): BulkTocPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("JSON root must be an object.");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.volumes)) {
    throw new Error('JSON must have a "volumes" array at the root.');
  }
  const parsedVolumes = obj.volumes.map((v: unknown, vi: number) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      throw new Error(`volumes[${vi}] must be an object.`);
    }
    const vo = v as Record<string, unknown>;
    if (vo.id !== null && typeof vo.id !== "number") {
      throw new Error(`volumes[${vi}].id must be a number or null.`);
    }
    if (typeof vo.displayName !== "string" || !vo.displayName.trim()) {
      throw new Error(`volumes[${vi}].displayName must be a non-empty string.`);
    }
    if (!Array.isArray(vo.chapters)) {
      throw new Error(`volumes[${vi}].chapters must be an array.`);
    }
    const parsedChapters = vo.chapters.map((c: unknown, ci: number) => {
      if (!c || typeof c !== "object" || Array.isArray(c)) {
        throw new Error(`volumes[${vi}].chapters[${ci}] must be an object.`);
      }
      const co = c as Record<string, unknown>;
      if (co.id !== null && typeof co.id !== "number") {
        throw new Error(
          `volumes[${vi}].chapters[${ci}].id must be a number or null.`,
        );
      }
      if (typeof co.displayName !== "string" || !co.displayName.trim()) {
        throw new Error(
          `volumes[${vi}].chapters[${ci}].displayName must be a non-empty string.`,
        );
      }
      return {
        id: co.id as number | null,
        displayName: co.displayName as string,
      };
    });
    return {
      id: vo.id as number | null,
      displayName: vo.displayName as string,
      chapters: parsedChapters,
    };
  });
  return { volumes: parsedVolumes };
}

// ── Bulk TOC diff helpers ───────────────────────────────────────────────────

/** A single chapter diff line shown in the preview dialog. */
type ChapterDiffLine =
  | { kind: "unchanged"; id: number; name: string }
  | { kind: "renamed"; id: number; oldName: string; newName: string }
  | { kind: "moved"; id: number; name: string; fromVolume: string }
  | { kind: "new"; name: string };

/** A single volume diff line plus its chapter diff lines. */
type VolumeDiffEntry = {
  kind: "unchanged" | "renamed" | "new";
  id: number | null;
  displayName: string;
  oldDisplayName?: string;
  chapters: ChapterDiffLine[];
};

/**
 * Computes a human-readable diff between current TOC state and the uploaded
 * payload. Returns an array of VolumeDiffEntry objects ready to render.
 */
function computeTocDiff(
  currentVolumes: Volume[],
  currentChaptersByVolume: Record<number, Chapter[]>,
  payload: BulkTocPayload,
): VolumeDiffEntry[] {
  // Build lookup maps from current state.
  const currentVolumeById = new Map(currentVolumes.map((v) => [v.id, v]));
  const allCurrentChapters = Object.values(currentChaptersByVolume).flat();
  const currentChapterById = new Map(allCurrentChapters.map((c) => [c.id, c]));
  // volumeId → displayName for cross-volume move labels
  const volumeNameById = new Map(
    currentVolumes.map((v) => [v.id, v.displayName]),
  );

  return payload.volumes.map((payloadVol): VolumeDiffEntry => {
    let volumeKind: VolumeDiffEntry["kind"];
    let oldDisplayName: string | undefined;

    if (payloadVol.id === null) {
      volumeKind = "new";
    } else {
      const existing = currentVolumeById.get(payloadVol.id);
      volumeKind =
        existing && existing.displayName !== payloadVol.displayName
          ? "renamed"
          : "unchanged";
      oldDisplayName = existing?.displayName;
    }

    const chapterLines: ChapterDiffLine[] = payloadVol.chapters.map(
      (payloadCh): ChapterDiffLine => {
        if (payloadCh.id === null)
          return { kind: "new", name: payloadCh.displayName };

        const existing = currentChapterById.get(payloadCh.id);
        if (!existing) return { kind: "new", name: payloadCh.displayName };

        const nameChanged = existing.displayName !== payloadCh.displayName;
        const volumeChanged =
          payloadVol.id !== null && existing.volumeId !== payloadVol.id;
        const fromVolumeName = volumeChanged
          ? (volumeNameById.get(existing.volumeId) ?? "")
          : "";

        if (nameChanged && volumeChanged) {
          // Show as renamed (the volume move is already shown by position).
          return {
            kind: "renamed",
            id: payloadCh.id,
            oldName: existing.displayName,
            newName: payloadCh.displayName,
          };
        }
        if (nameChanged) {
          return {
            kind: "renamed",
            id: payloadCh.id,
            oldName: existing.displayName,
            newName: payloadCh.displayName,
          };
        }
        if (volumeChanged) {
          return {
            kind: "moved",
            id: payloadCh.id,
            name: payloadCh.displayName,
            fromVolume: fromVolumeName,
          };
        }
        return {
          kind: "unchanged",
          id: payloadCh.id,
          name: payloadCh.displayName,
        };
      },
    );

    return {
      kind: volumeKind,
      id: payloadVol.id,
      displayName: payloadVol.displayName,
      oldDisplayName,
      chapters: chapterLines,
    };
  });
}

type TocDiffPreviewDialogProps = {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** Called when the user cancels or closes the dialog. */
  onClose: () => void;
  /** Pre-computed diff entries to display. */
  diff: VolumeDiffEntry[];
  /** Whether the apply action is in-flight. */
  isPending: boolean;
  /** Called when the user confirms the changes. */
  onConfirm: () => void;
  /** Label for an individual chapter (e.g. "Chapter", "Episode"). */
  chapterType: string;
  /** Label for a volume group (e.g. "Volume", "Season"). */
  volumeType: string;
};

/**
 * Shows a diff-preview of a pending bulk TOC import before committing.
 * New entries are highlighted green, renamed entries yellow, moved chapters
 * display their source volume.
 */
function TocDiffPreviewDialog(props: TocDiffPreviewDialogProps) {
  const {
    isOpen,
    onClose,
    diff,
    isPending,
    onConfirm,
    chapterType,
    volumeType,
  } = props;

  const hasChanges = diff.some(
    (v) =>
      v.kind !== "unchanged" || v.chapters.some((c) => c.kind !== "unchanged"),
  );

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Preview TOC changes</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-60vh">
        {!hasChanges ? (
          <Text muted>
            No changes detected - the uploaded TOC matches the current one.
          </Text>
        ) : (
          <Box col className="gap-4">
            <Text variant="body" muted>
              Review the changes below. New entries are{" "}
              <span className="text-green-600 dark:text-green-400 font-medium">
                green
              </span>
              , renamed entries are{" "}
              <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                yellow
              </span>
              , and moved {chapterType.toLowerCase()}s show their source{" "}
              {volumeType.toLowerCase()}.
            </Text>
            <Box col className="gap-3">
              {diff.map((vol, vi) => (
                <Box col key={vol.id ?? `new-${vi}`} className="gap-1">
                  {/* Volume header */}
                  <Box className="items-center gap-2">
                    {vol.kind === "new" ? (
                      <Text
                        variant="h4"
                        className="text-green-600 dark:text-green-400"
                      >
                        + {vol.displayName}
                        <Text
                          as="span"
                          variant="label"
                          muted
                          className="ml-2 text-xs"
                        >
                          (new {volumeType.toLowerCase()})
                        </Text>
                      </Text>
                    ) : vol.kind === "renamed" ? (
                      <Text
                        variant="h4"
                        className="text-yellow-600 dark:text-yellow-400"
                      >
                        {vol.displayName}
                        <Text
                          as="span"
                          variant="label"
                          muted
                          className="ml-2 text-xs"
                        >
                          (was: {vol.oldDisplayName})
                        </Text>
                      </Text>
                    ) : (
                      <Text variant="h4">{vol.displayName}</Text>
                    )}
                  </Box>

                  {/* Chapter list */}
                  {vol.chapters.length > 0 && (
                    <ol className="flex flex-col gap-0.5 pl-4 border-l-2 border-border">
                      {vol.chapters.map((ch, ci) => {
                        if (ch.kind === "new") {
                          return (
                            <li
                              key={`new-${ci}`}
                              className="text-sm text-green-600 dark:text-green-400"
                            >
                              + {ch.name}{" "}
                              <span className="text-muted-foreground text-xs">
                                (new {chapterType.toLowerCase()})
                              </span>
                            </li>
                          );
                        }
                        if (ch.kind === "renamed") {
                          return (
                            <li
                              key={ch.id}
                              className="text-sm text-yellow-600 dark:text-yellow-400"
                            >
                              {ch.newName}{" "}
                              <span className="text-muted-foreground text-xs">
                                (was: {ch.oldName})
                              </span>
                            </li>
                          );
                        }
                        if (ch.kind === "moved") {
                          return (
                            <li
                              key={ch.id}
                              className="text-sm text-blue-600 dark:text-blue-400"
                            >
                              {ch.name}{" "}
                              <span className="text-muted-foreground text-xs">
                                ← moved from {ch.fromVolume}
                              </span>
                            </li>
                          );
                        }
                        return (
                          <li key={ch.id} className="text-sm text-foreground">
                            {ch.name}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {vol.chapters.length === 0 && (
                    <Text muted className="pl-4 text-xs">
                      No {chapterType.toLowerCase()}s
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button disabled={isPending || !hasChanges} onClick={onConfirm}>
          {isPending ? "Applying…" : "Apply changes"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/**
 * Client Component managing edit mode for a serial's volumes and chapters.
 * Uses a single DndContext for both volume reordering and chapter reordering
 * (including cross-volume moves). DragOverlay renders an isolated clone so the
 * drag preview is never distorted by its flex container.
 *
 * @example
 * <SerialEditor
 *   serialId={serial.id}
 *   volumes={volumeList}
 *   chaptersByVolume={chaptersByVolume}
 *   chapterType="Chapter"
 *   volumeType="Volume"
 *   addChapterAction={addChapterForSerial}
 *   addVolumeAction={addVolumeForSerial}
 *   deleteChapterAction={deleteChapterForSerial}
 *   deleteVolumeAction={deleteVolumeForSerial}
 *   renameChapterAction={renameChapterForSerial}
 *   renameVolumeAction={renameVolumeForSerial}
 *   reorderVolumesAction={reorderVolumesForSerial}
 *   reorderAllChaptersAction={reorderAllChaptersForSerial}
 *   updateSerialTypesAction={updateSerialTypesForSerial}
 *   bulkApplyTocAction={bulkApplyTocForSerial}
 * />
 */
export function SerialEditor(props: SerialEditorProps) {
  const {
    serialId,
    volumes: initialVolumes,
    chaptersByVolume: initialChaptersByVolume,
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

  const { run, isPending } = useServerAction();
  // SerialEditor is always in edit mode; it is rendered inside a dialog that
  // the user explicitly opens to manage volumes and chapters.
  const editing = true;

  // Derive a flat, volume-named chapter list from existing props for the banner selector.
  const allChaptersWithVolume = initialVolumes.flatMap((v) =>
    (initialChaptersByVolume[v.id] ?? []).map((c) => ({
      id: c.id,
      displayName: c.displayName,
      idx: c.idx,
      volumeName: v.displayName,
    })),
  );
  const headChapterId = allChaptersWithVolume.at(-1)?.id ?? null;
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    readingChapterId ?? headChapterId,
  );

  const chapterSelectOptions: ChapterGroupOption[] = (() => {
    const volumeMap = new Map<
      string,
      { label: string; value: number; disabled: boolean }[]
    >();
    for (const ch of allChaptersWithVolume) {
      const arr = volumeMap.get(ch.volumeName) ?? [];
      arr.push({ label: ch.displayName, value: ch.id, disabled: false });
      volumeMap.set(ch.volumeName, arr);
    }
    return Array.from(volumeMap.entries()).map(([volumeName, chaps]) => ({
      label: volumeName,
      value: -1 as number,
      children: chaps,
    }));
  })();

  const [volCollapsed, setVolCollapsed] = usePersistedStore<
    Record<number, boolean>
  >(`plotarmor:toc-collapsed:${serialId}`, {});

  function toggleVolume(volumeId: number) {
    setVolCollapsed((prev) => ({ ...prev, [volumeId]: !prev[volumeId] }));
  }
  const [currentChapterType, setCurrentChapterType] = useState(chapterType);
  const [currentVolumeType, setCurrentVolumeType] = useState(volumeType);
  const [renamingVolumeId, setRenamingVolumeId] = useState<number | null>(null);
  const [renamingChapterId, setRenamingChapterId] = useState<number | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [addingChapterToVolumeId, setAddingChapterToVolumeId] = useState<
    number | null
  >(null);
  const [addingVolume, setAddingVolume] = useState(false);

  // ── Bulk TOC import state ──────────────────────────────────────────────────
  const [bulkDiff, setBulkDiff] = useState<VolumeDiffEntry[] | null>(null);
  const [pendingPayload, setPendingPayload] = useState<BulkTocPayload | null>(
    null,
  );
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkPending, startBulkTransition] = useTransition();
  const jsonUploadRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local optimistic ordering - updated immediately on drag, server-confirmed on refresh.
  const [volumes, setVolumes] = useState<Volume[]>(initialVolumes);
  const [chaptersByVolume, setChaptersByVolume] = useState<
    Record<number, Chapter[]>
  >(initialChaptersByVolume);

  // Sync with server-side props when the page refreshes.
  const [prevInitialVolumes, setPrevInitialVolumes] = useState(initialVolumes);
  if (prevInitialVolumes !== initialVolumes) {
    setPrevInitialVolumes(initialVolumes);
    setVolumes(initialVolumes);
    setChaptersByVolume(initialChaptersByVolume);
  }

  // Tracks what is currently being dragged; drives DragOverlay content.
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeDragType, setActiveDragType] = useState<
    "volume" | "chapter" | null
  >(null);

  // Refs for "add" forms so we can reset them after submission.
  const addVolumeFormRef = useRef<HTMLFormElement>(null);
  const addChapterFormRefs = useRef<Map<number, HTMLFormElement>>(new Map());

  // When dragging a volume, exclude chapter droppables from collision detection.
  // Without this filter, closestCenter fires against small chapter rects too,
  // causing the target volume to thrash as the winning collision flips rapidly.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (args.active.data.current?.type === "volume") {
        const volumeIds = new Set(volumes.map((v) => v.id));
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) =>
            volumeIds.has(c.id as number),
          ),
        });
      }
      return closestCenter(args);
    },
    [volumes],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function findVolumeForChapter(
    chapterId: number,
    state: Record<number, Chapter[]>,
  ): number | null {
    for (const [volumeId, chs] of Object.entries(state)) {
      if (chs.some((c) => c.id === chapterId)) return Number(volumeId);
    }
    return null;
  }

  function runTypeUpdate(newVolumeType: string, newChapterType: string) {
    const fd = new FormData();
    fd.set("chapterType", newChapterType);
    fd.set("volumeType", newVolumeType);
    run(updateSerialTypesAction, fd);
  }

  // ── Bulk TOC: export ───────────────────────────────────────────────────────
  function handleExportJson() {
    const payload: BulkTocPayload = {
      volumes: volumes.map((v) => ({
        id: v.id,
        displayName: v.displayName,
        chapters: (chaptersByVolume[v.id] ?? []).map((c) => ({
          id: c.id,
          displayName: c.displayName,
        })),
      })),
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toc-${serialId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Bulk TOC: import ───────────────────────────────────────────────────────
  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so re-uploading the same file fires the event again.
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as unknown;
        const validated = validateBulkTocPayload(raw);
        const diff = computeTocDiff(volumes, chaptersByVolume, validated);
        setPendingPayload(validated);
        setBulkDiff(diff);
        setBulkError(null);
      } catch (err) {
        setBulkError(err instanceof Error ? err.message : "Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  function handleBulkConfirm() {
    if (!pendingPayload) return;
    startBulkTransition(async () => {
      try {
        await bulkApplyTocAction(pendingPayload);
        router.refresh();
        setBulkDiff(null);
        setPendingPayload(null);
      } catch (err) {
        setBulkError(
          err instanceof Error ? err.message : "Failed to apply changes.",
        );
        setBulkDiff(null);
        setPendingPayload(null);
      }
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const fd = new FormData();
    if (pendingDelete.type === "volume") {
      fd.set("volumeId", String(pendingDelete.id));
      run(deleteVolumeAction, fd, () => setPendingDelete(null));
    } else {
      fd.set("chapterId", String(pendingDelete.id));
      run(deleteChapterAction, fd, () => setPendingDelete(null));
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number);
    setActiveDragType(event.active.data.current?.type ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "chapter") return;

    const activeChapterId = active.id as number;
    const overId = over.id as number;

    setChaptersByVolume((prev) => {
      const activeVolumeId = findVolumeForChapter(activeChapterId, prev);
      if (activeVolumeId === null) return prev;

      let targetVolumeId: number | null = null;
      if (over.data.current?.type === "volume") {
        targetVolumeId = overId;
      } else if (over.data.current?.type === "chapter") {
        targetVolumeId = findVolumeForChapter(overId, prev);
      }

      // Only act on cross-volume moves; within-volume sorting is handled by DragEnd.
      if (targetVolumeId === null || targetVolumeId === activeVolumeId)
        return prev;

      const activeChapter = prev[activeVolumeId]?.find(
        (c) => c.id === activeChapterId,
      );
      if (!activeChapter) return prev;

      const sourceChapters = prev[activeVolumeId].filter(
        (c) => c.id !== activeChapterId,
      );
      const destChapters = prev[targetVolumeId] ?? [];

      let newDestChapters: Chapter[];
      if (over.data.current?.type === "chapter") {
        const overIndex = destChapters.findIndex((c) => c.id === overId);
        newDestChapters =
          overIndex >= 0
            ? [
                ...destChapters.slice(0, overIndex),
                activeChapter,
                ...destChapters.slice(overIndex),
              ]
            : [...destChapters, activeChapter];
      } else {
        newDestChapters = [...destChapters, activeChapter];
      }

      return {
        ...prev,
        [activeVolumeId]: sourceChapters,
        [targetVolumeId]: newDestChapters,
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveDragType(null);
    if (!over) return;

    const activeNumId = active.id as number;
    const overNumId = over.id as number;

    if (active.data.current?.type === "volume") {
      if (activeNumId === overNumId) return;
      const oldIndex = volumes.findIndex((v) => v.id === activeNumId);
      const newIndex = volumes.findIndex((v) => v.id === overNumId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(volumes, oldIndex, newIndex);
      setVolumes(reordered);
      startTransition(async () => {
        await reorderVolumesAction(reordered.map((v) => v.id));
        router.refresh();
      });
    } else if (active.data.current?.type === "chapter") {
      // Cross-volume moves were applied in onDragOver; apply within-volume arrayMove here.
      let finalChaptersByVolume = chaptersByVolume;
      const currentVolumeId = findVolumeForChapter(
        activeNumId,
        chaptersByVolume,
      );

      if (
        currentVolumeId !== null &&
        over.data.current?.type === "chapter" &&
        activeNumId !== overNumId
      ) {
        const overVolumeId = findVolumeForChapter(overNumId, chaptersByVolume);
        if (overVolumeId === currentVolumeId) {
          const vChapters = chaptersByVolume[currentVolumeId] ?? [];
          const oldIdx = vChapters.findIndex((c) => c.id === activeNumId);
          const newIdx = vChapters.findIndex((c) => c.id === overNumId);
          if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            const reordered = arrayMove(vChapters, oldIdx, newIdx);
            finalChaptersByVolume = {
              ...chaptersByVolume,
              [currentVolumeId]: reordered,
            };
            setChaptersByVolume(finalChaptersByVolume);
          }
        }
      }

      startTransition(async () => {
        await reorderAllChaptersAction(
          volumes.map((v) => v.id),
          Object.fromEntries(
            Object.entries(finalChaptersByVolume).map(([vid, chs]) => [
              Number(vid),
              chs.map((c) => c.id),
            ]),
          ),
        );
        router.refresh();
      });
    }
  }

  function handleAddChapterSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    run(addChapterAction, new FormData(form), () => {
      form.reset();
      setAddingChapterToVolumeId(null);
    });
  }

  const activeVolume =
    activeId !== null ? volumes.find((v) => v.id === activeId) : null;
  const activeChapter =
    activeId !== null
      ? Object.values(chaptersByVolume)
          .flat()
          .find((c) => c.id === activeId)
      : null;

  const dialogBody =
    pendingDelete?.type === "volume"
      ? `This will permanently delete the ${currentVolumeType.toLowerCase()} and all its ${currentChapterType.toLowerCase()}s. This action cannot be undone.`
      : `This will permanently delete the ${currentChapterType.toLowerCase()}. This action cannot be undone.`;

  return (
    <Banner scrollable={false}>
    {allChaptersWithVolume.length > 0 && (
      <WritingAsOfBanner
        options={chapterSelectOptions}
        value={selectedChapterId ?? undefined}
        onChange={setSelectedChapterId}
        isPending={false}
        isDirty={false}
      />
    )}
    <section className="flex flex-col gap-4 mt-4">
      <Box className="items-center gap-2 flex-wrap">
        <Text variant="body" as="span">
          Each
        </Text>
        <Select
          id="chapterType"
          options={CHAPTER_TYPE_OPTIONS}
          value={currentChapterType}
          onChange={(val) => {
            setCurrentChapterType(val);
            runTypeUpdate(currentVolumeType, val);
          }}
          searchable={false}
        />
        <Text variant="body" as="span">
          is grouped by
        </Text>
        <Select
          id="volumeType"
          options={VOLUME_TYPE_OPTIONS}
          value={currentVolumeType}
          onChange={(val) => {
            setCurrentVolumeType(val);
            runTypeUpdate(val, currentChapterType);
          }}
          searchable={false}
        />
      </Box>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {volumes.length > 0 ? (
          <SortableContext
            items={volumes.map((v) => v.id)}
            strategy={verticalListSortingStrategy}
          >
            <Box col className="gap-5">
              {volumes.map((volume) => (
                <SortableVolumeItem
                  key={volume.id}
                  volume={volume}
                  chapters={chaptersByVolume[volume.id] ?? []}
                  editing={editing}
                  isPending={isPending}
                  isCollapsed={!!volCollapsed[volume.id]}
                  onToggleCollapse={() => toggleVolume(volume.id)}
                  isRenamingVolume={renamingVolumeId === volume.id}
                  renamingChapterId={renamingChapterId}
                  addingChapterToVolumeId={addingChapterToVolumeId}
                  isVolumeDragging={activeDragType === "volume"}
                  onStartRenameVolume={() => {
                    setRenamingVolumeId(volume.id);
                    setRenamingChapterId(null);
                  }}
                  onSaveRenameVolume={(fd) => run(renameVolumeAction, fd)}
                  onCancelRenameVolume={() => setRenamingVolumeId(null)}
                  onDeleteVolume={() =>
                    setPendingDelete({
                      type: "volume",
                      id: volume.id,
                      name: volume.displayName,
                    })
                  }
                  onStartRenameChapter={(id) => {
                    setRenamingChapterId(id);
                    setRenamingVolumeId(null);
                  }}
                  onSaveRenameChapter={(fd) => run(renameChapterAction, fd)}
                  onCancelRenameChapter={() => setRenamingChapterId(null)}
                  onDeleteChapter={(id, name) =>
                    setPendingDelete({ type: "chapter", id, name })
                  }
                  onAddChapterClick={(volId) => {
                    setAddingChapterToVolumeId(volId);
                    setAddingVolume(false);
                  }}
                  onAddChapterSubmit={handleAddChapterSubmit}
                  onCancelAddChapter={() => setAddingChapterToVolumeId(null)}
                  addChapterFormRef={(el) => {
                    if (el) addChapterFormRefs.current.set(volume.id, el);
                    else addChapterFormRefs.current.delete(volume.id);
                  }}
                  chapterType={currentChapterType}
                  volumeType={currentVolumeType}
                />
              ))}
            </Box>
          </SortableContext>
        ) : (
          <Text muted>
            No {volumeType.toLowerCase()}s yet. Add a {volumeType.toLowerCase()}{" "}
            to get started.
          </Text>
        )}

        <DragOverlay>
          {activeVolume && (
            <VolumeDragPreview
              volume={activeVolume}
              chapters={chaptersByVolume[activeVolume.id] ?? []}
            />
          )}
          {activeChapter && <ChapterDragPreview chapter={activeChapter} />}
        </DragOverlay>
      </DndContext>

      {/* Add volume - toggle between button and inline form */}
      {editing && (
        <div className="mt-2 pt-4 border-t border-border">
          {addingVolume ? (
            <form
              ref={addVolumeFormRef}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                run(addVolumeAction, new FormData(form), () => {
                  form.reset();
                  setAddingVolume(false);
                });
              }}
              className="flex gap-2 items-center"
            >
              <Input
                name="displayName"
                required
                placeholder={`${currentVolumeType} name…`}
                autoFocus
                className="flex-1"
                onKeyDown={(e) => e.key === "Escape" && setAddingVolume(false)}
              />
              <Button type="submit" disabled={isPending}>
                Add {currentVolumeType.toLowerCase()}
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddingVolume(true);
                setAddingChapterToVolumeId(null);
              }}
            >
              <PlusIcon className="h-3 w-3" />
              Add {currentVolumeType.toLowerCase()}
            </Button>
          )}
        </div>
      )}

      {/* Bulk TOC export / import */}
      <div className="pt-4 border-t border-border flex flex-col gap-2">
        <Text variant="label" muted className="text-xs">
          Bulk edit
        </Text>
        <Box className="gap-2 flex-wrap">
          <Tooltip content="Download current TOC as JSON for bulk editing">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportJson}
            >
              <DownloadIcon className="h-3 w-3" />
              Download JSON
            </Button>
          </Tooltip>
          <Tooltip content="Upload an edited JSON file to preview and apply bulk changes">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => jsonUploadRef.current?.click()}
              disabled={isBulkPending}
            >
              <UploadIcon className="h-3 w-3" />
              Upload JSON
            </Button>
          </Tooltip>
          {/* Hidden file input for JSON upload */}
          <input
            ref={jsonUploadRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={handleImportFileChange}
          />
        </Box>
        {bulkError && (
          <Text variant="label" className="text-destructive text-xs">
            {bulkError}
          </Text>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{pendingDelete?.name}&rdquo;?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>{dialogBody}</DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={confirmDelete}
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Bulk TOC diff-preview dialog */}
      {bulkDiff !== null && (
        <TocDiffPreviewDialog
          isOpen={bulkDiff !== null}
          onClose={() => {
            setBulkDiff(null);
            setPendingPayload(null);
            setBulkError(null);
          }}
          diff={bulkDiff}
          isPending={isBulkPending}
          onConfirm={handleBulkConfirm}
          chapterType={currentChapterType}
          volumeType={currentVolumeType}
        />
      )}
    </section>
    </Banner>
  );
}
