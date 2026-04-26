'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faPlus, faTrash, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { CHAPTER_TYPE_OPTIONS, VOLUME_TYPE_OPTIONS } from '@/lib/serial-types';

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
  type: 'volume' | 'chapter';
  id: number;
  name: string;
}

interface SerialEditorProps {
  volumes: Volume[];
  chaptersByVolume: Record<number, Chapter[]>;
  chapterType: string;
  volumeType: string;
  addChapterAction: (formData: FormData) => Promise<void>;
  addVolumeAction: (formData: FormData) => Promise<void>;
  deleteChapterAction: (formData: FormData) => Promise<void>;
  deleteVolumeAction: (formData: FormData) => Promise<void>;
  renameChapterAction: (formData: FormData) => Promise<void>;
  renameVolumeAction: (formData: FormData) => Promise<void>;
  reorderVolumesAction: (orderedVolumeIds: number[]) => Promise<void>;
  reorderChaptersAction: (volumeId: number, orderedChapterIds: number[]) => Promise<void>;
  updateSerialTypesAction: (formData: FormData) => Promise<void>;
}

function RenameVolumeForm({
  volume,
  onSave,
  onCancel,
}: {
  volume: Volume;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
}) {
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
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function RenameChapterForm({
  chapter,
  onSave,
  onCancel,
}: {
  chapter: Chapter;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
}) {
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
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

/**
 * Sortable row for a single chapter within a volume.
 * In edit mode the drag handle is visible and the row is draggable.
 */
function SortableChapterItem({
  chapter,
  editing,
  isRenaming,
  isPending,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onDelete,
}: {
  chapter: Chapter;
  editing: boolean;
  isRenaming: boolean;
  isPending: boolean;
  onStartRename: () => void;
  onSaveRename: (fd: FormData) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
    disabled: !editing || isPending,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
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
              className={`truncate ${editing ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
              onClick={editing ? onStartRename : undefined}
              title={editing ? 'Click to rename' : undefined}
            >
              {chapter.displayName}
            </span>
          </Box>
          <Box className="items-center gap-2 shrink-0">
            <Text as="span" muted>#{chapter.idx}</Text>
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
 */
function SortableVolumeItem({
  volume,
  chapters: vChapters,
  editing,
  isPending,
  isRenamingVolume,
  renamingChapterId,
  addingChapterToVolumeId,
  onStartRenameVolume,
  onSaveRenameVolume,
  onCancelRenameVolume,
  onDeleteVolume,
  onStartRenameChapter,
  onSaveRenameChapter,
  onCancelRenameChapter,
  onDeleteChapter,
  onChapterDragEnd,
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
  onStartRenameVolume: () => void;
  onSaveRenameVolume: (fd: FormData) => void;
  onCancelRenameVolume: () => void;
  onDeleteVolume: () => void;
  onStartRenameChapter: (id: number) => void;
  onSaveRenameChapter: (fd: FormData) => void;
  onCancelRenameChapter: () => void;
  onDeleteChapter: (id: number, name: string) => void;
  onChapterDragEnd: (volumeId: number, event: DragEndEvent) => void;
  chapterSensors: ReturnType<typeof useSensors>;
  onAddChapterClick: (volumeId: number) => void;
  onAddChapterSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancelAddChapter: () => void;
  addChapterFormRef: (el: HTMLFormElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: volume.id,
    disabled: !editing || isPending,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
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
                className={editing ? 'cursor-pointer hover:text-primary transition-colors' : ''}
                onClick={editing ? onStartRenameVolume : undefined}
                title={editing ? 'Click to rename' : undefined}
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

      {/* Chapter list with inner sortable context */}
      {vChapters.length > 0 ? (
        <DndContext
          sensors={chapterSensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => onChapterDragEnd(volume.id, event)}
        >
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
                  onStartRename={() => onStartRenameChapter(chapter.id)}
                  onSaveRename={onSaveRenameChapter}
                  onCancelRename={onCancelRenameChapter}
                  onDelete={() => onDeleteChapter(chapter.id, chapter.displayName)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <Text muted className="pl-3">No chapters yet.</Text>
      )}

      {/* Add chapter — toggle between button and inline form */}
      {editing && (
        isAddingChapterHere ? (
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
              onKeyDown={(e) => e.key === 'Escape' && onCancelAddChapter()}
            />
            <Button type="submit" size="sm" disabled={isPending}>Add chapter</Button>
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
        )
      )}
    </Box>
  );
}

/**
 * Client Component managing edit mode for a serial's volumes and chapters.
 * In edit mode, volumes and chapters are reorderable via drag-and-drop (dnd-kit).
 * Reorder actions update the server and then refresh the page; no optimistic UI.
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
 *   reorderChaptersAction={reorderChaptersForSerial}
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
  reorderChaptersAction,
  updateSerialTypesAction,
}: SerialEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [currentChapterType, setCurrentChapterType] = useState(chapterType);
  const [currentVolumeType, setCurrentVolumeType] = useState(volumeType);
  const [renamingVolumeId, setRenamingVolumeId] = useState<number | null>(null);
  const [renamingChapterId, setRenamingChapterId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [addingChapterToVolumeId, setAddingChapterToVolumeId] = useState<number | null>(null);
  const [addingVolume, setAddingVolume] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Local optimistic ordering — updated immediately on drag end, then server-confirmed on refresh
  const [volumes, setVolumes] = useState<Volume[]>(initialVolumes);
  const [chaptersByVolume, setChaptersByVolume] = useState<Record<number, Chapter[]>>(initialChaptersByVolume);

  // Sync with server-side props when the page refreshes
  const prevVolumes = useRef(initialVolumes);
  if (prevVolumes.current !== initialVolumes) {
    prevVolumes.current = initialVolumes;
    setVolumes(initialVolumes);
    setChaptersByVolume(initialChaptersByVolume);
  }

  // Refs for "add" forms so we can reset them after submission
  const addVolumeFormRef = useRef<HTMLFormElement>(null);
  const addChapterFormRefs = useRef<Map<number, HTMLFormElement>>(new Map());

  const volumeSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function runTypeUpdate(newVolumeType: string, newChapterType: string) {
    const fd = new FormData();
    fd.set('chapterType', newChapterType);
    fd.set('volumeType', newVolumeType);
    run(updateSerialTypesAction, fd);
  }

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, onDone?: () => void) {
    startTransition(async () => {
      await action(fd);
      router.refresh();
      onDone?.();
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const fd = new FormData();
    if (pendingDelete.type === 'volume') {
      fd.set('volumeId', String(pendingDelete.id));
      run(deleteVolumeAction, fd, () => setPendingDelete(null));
    } else {
      fd.set('chapterId', String(pendingDelete.id));
      run(deleteChapterAction, fd, () => setPendingDelete(null));
    }
  }

  function handleVolumeDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = volumes.findIndex((v) => v.id === active.id);
    const newIndex = volumes.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(volumes, oldIndex, newIndex);
    setVolumes(reordered);

    startTransition(async () => {
      await reorderVolumesAction(reordered.map((v) => v.id));
      router.refresh();
    });
  }

  function handleChapterDragEnd(volumeId: number, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const vChapters = chaptersByVolume[volumeId] ?? [];
    const oldIndex = vChapters.findIndex((c) => c.id === active.id);
    const newIndex = vChapters.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(vChapters, oldIndex, newIndex);
    setChaptersByVolume((prev) => ({ ...prev, [volumeId]: reordered }));

    startTransition(async () => {
      await reorderChaptersAction(volumeId, reordered.map((c) => c.id));
      router.refresh();
    });
  }

  function handleAddChapterSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    run(addChapterAction, new FormData(form), () => {
      form.reset();
      setAddingChapterToVolumeId(null);
    });
  }

  const dialogTitle = `Delete "${pendingDelete?.name}"?`;

  const dialogBody =
    pendingDelete?.type === 'volume'
      ? 'This will permanently delete the volume and all its chapters. This action cannot be undone.'
      : 'This will permanently delete the chapter. This action cannot be undone.';

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Box className="items-center justify-between">
        <Text variant="h2">Volumes &amp; Chapters</Text>
        <button
          type="button"
          onClick={() => {
            setEditing((prev) => !prev);
            setRenamingVolumeId(null);
            setRenamingChapterId(null);
          }}
          title={editing ? 'Exit edit mode' : 'Edit volumes and chapters'}
          className={`rounded-md p-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            editing
              ? 'bg-primary text-primary-foreground'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <FontAwesomeIcon icon={faPen} className="h-4 w-4" />
        </button>
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

      {volumes.length > 0 ? (
        <DndContext
          sensors={volumeSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleVolumeDragEnd}
        >
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
                  onStartRenameVolume={() => { setRenamingVolumeId(volume.id); setRenamingChapterId(null); }}
                  onSaveRenameVolume={(fd) => run(renameVolumeAction, fd)}
                  onCancelRenameVolume={() => setRenamingVolumeId(null)}
                  onDeleteVolume={() => setPendingDelete({ type: 'volume', id: volume.id, name: volume.displayName })}
                  onStartRenameChapter={(id) => { setRenamingChapterId(id); setRenamingVolumeId(null); }}
                  onSaveRenameChapter={(fd) => run(renameChapterAction, fd)}
                  onCancelRenameChapter={() => setRenamingChapterId(null)}
                  onDeleteChapter={(id, name) => setPendingDelete({ type: 'chapter', id, name })}
                  onChapterDragEnd={handleChapterDragEnd}
                  chapterSensors={volumeSensors}
                  onAddChapterClick={(volId) => { setAddingChapterToVolumeId(volId); setAddingVolume(false); }}
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
        </DndContext>
      ) : (
        <Text muted>No volumes yet. Add a volume to get started.</Text>
      )}

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
                onKeyDown={(e) => e.key === 'Escape' && setAddingVolume(false)}
              />
              <Button type="submit" disabled={isPending}>Add volume</Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => { setAddingVolume(true); setAddingChapterToVolumeId(null); }}
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
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>{dialogBody}</DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={isPending} onClick={confirmDelete}>
            {isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}
