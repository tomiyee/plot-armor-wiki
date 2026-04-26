"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPen,
  faPlus,
  faTrash,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
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
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useServerAction } from "@/hooks/useServerAction";
import {
  CHAPTER_TYPE_OPTIONS,
  VOLUME_TYPE_OPTIONS,
  ChapterType,
  VolumeType,
} from "@/lib/serial-types";

interface Chapter {
  id: number;
  displayName: string;
  idx: number;
  volumeId: number;
}

interface Volume {
  id: number;
  displayName: string;
  idx: number;
}

interface PendingDelete {
  type: "volume" | "chapter";
  id: number;
  name: string;
}

interface SerialEditorProps {
  volumes: Volume[];
  chaptersByVolume: Record<number, Chapter[]>;
  chapterType: ChapterType;
  volumeType: VolumeType;
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

// Non-interactive clone of a volume rendered by DragOverlay — layout-isolated from flex container.
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
      className="gap-2 rounded-lg bg-white border border-gray-200 shadow-xl p-2"
    >
      <Text variant="h4">{volume.displayName}</Text>
      {vChapters.length > 0 && (
        <ol className="flex flex-col gap-1 pl-3 border-l-2 border-gray-100">
          {vChapters.map((chapter) => (
            <li
              key={chapter.id}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
            >
              <span className="truncate">{chapter.displayName}</span>
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
    <li className="flex items-center justify-between rounded-md px-3 py-2 text-sm bg-white border border-gray-200 shadow-lg list-none">
      <span className="truncate">{chapter.displayName}</span>
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
                className="text-gray-400 cursor-grab active:cursor-grabbing touch-none"
                title="Drag to reorder"
              >
                <FontAwesomeIcon icon={faGripVertical} className="h-3 w-3" />
              </span>
            )}
            <span
              className={`truncate ${editing ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
              onClick={editing ? onStartRename : undefined}
              title={editing ? "Click to rename" : undefined}
            >
              {chapter.displayName}
            </span>
          </Box>
          <Box className="items-center gap-2 shrink-0">
            <Text as="span" muted>
              #{chapter.idx}
            </Text>
            {editing && (
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                title={`Delete ${chapter.displayName}`}
                onClick={onDelete}
              >
                <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
              </Button>
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
}: {
  volume: Volume;
  chapters: Chapter[];
  editing: boolean;
  isPending: boolean;
  isRenamingVolume: boolean;
  renamingChapterId: number | null;
  addingChapterToVolumeId: number | null;
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
              {editing && (
                <span
                  {...attributes}
                  {...listeners}
                  className="text-gray-400 cursor-grab active:cursor-grabbing touch-none"
                  title="Drag to reorder volume"
                >
                  <FontAwesomeIcon icon={faGripVertical} className="h-4 w-4" />
                </span>
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
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                title={`Delete ${volume.displayName} and all its chapters`}
                onClick={onDeleteVolume}
              >
                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
      </Box>

      {/* Chapter list — SortableContext only; DndContext lives in the parent SerialEditor */}
      {vChapters.length > 0 ? (
        <SortableContext
          items={vChapters.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex flex-col gap-1 pl-3 border-l-2 border-gray-100">
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
          No chapters yet.
        </Text>
      )}

      {/* Add chapter — toggle between button and inline form */}
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
              placeholder="Chapter name…"
              autoFocus
              className="flex-1"
              onKeyDown={(e) => e.key === "Escape" && onCancelAddChapter()}
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Add chapter
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
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add chapter
          </Button>
        ))}
    </Box>
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
 * />
 */
export function SerialEditor({
  volumes: initialVolumes,
  chaptersByVolume: initialChaptersByVolume,
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
}: SerialEditorProps) {
  const { run, isPending } = useServerAction();
  const [editing, setEditing] = useState(false);
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

  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local optimistic ordering — updated immediately on drag, server-confirmed on refresh.
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
      ? "This will permanently delete the volume and all its chapters. This action cannot be undone."
      : "This will permanently delete the chapter. This action cannot be undone.";

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Box className="items-center justify-between">
        <Text variant="h2">Volumes &amp; Chapters</Text>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            setEditing((prev) => !prev);
            setRenamingVolumeId(null);
            setRenamingChapterId(null);
          }}
          title={editing ? "Exit edit mode" : "Edit volumes and chapters"}
          className={
            editing
              ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              : "text-gray-500 hover:text-gray-700"
          }
        >
          <FontAwesomeIcon icon={faPen} className="h-4 w-4" />
        </Button>
      </Box>

      {editing && (
        <Box className="gap-4">
          <Box col className="gap-1 flex-1">
            <Label htmlFor="volumeType">Volume type</Label>
            <Select
              id="volumeType"
              options={VOLUME_TYPE_OPTIONS}
              value={currentVolumeType}
              onChange={(val) => {
                setCurrentVolumeType(val);
                runTypeUpdate(val, currentChapterType);
              }}
            />
          </Box>
          <Box col className="gap-1 flex-1">
            <Label htmlFor="chapterType">Chapter type</Label>
            <Select
              id="chapterType"
              options={CHAPTER_TYPE_OPTIONS}
              value={currentChapterType}
              onChange={(val) => {
                setCurrentChapterType(val);
                runTypeUpdate(currentVolumeType, val);
              }}
            />
          </Box>
        </Box>
      )}

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
                />
              ))}
            </Box>
          </SortableContext>
        ) : (
          <Text muted>No volumes yet. Add a volume to get started.</Text>
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

      {/* Add volume — toggle between button and inline form */}
      {editing && (
        <div className="mt-2 pt-4 border-t border-gray-100">
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
                placeholder="Volume name…"
                autoFocus
                className="flex-1"
                onKeyDown={(e) => e.key === "Escape" && setAddingVolume(false)}
              />
              <Button type="submit" disabled={isPending}>
                Add volume
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
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              Add volume
            </Button>
          )}
        </div>
      )}

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
    </section>
  );
}
