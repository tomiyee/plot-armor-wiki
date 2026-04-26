'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
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

const CHAPTER_TYPE_OPTIONS = [
  { label: 'Chapter', value: 'Chapter' },
  { label: 'Episode', value: 'Episode' },
  { label: 'Issue', value: 'Issue' },
  { label: 'Part', value: 'Part' },
] as const;

const VOLUME_TYPE_OPTIONS = [
  { label: 'Volume', value: 'Volume' },
  { label: 'Season', value: 'Season' },
  { label: 'Arc', value: 'Arc' },
  { label: 'Book', value: 'Book' },
] as const;

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

export function SerialEditor({
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

  // Refs for "add" forms so we can reset them after submission
  const addVolumeFormRef = useRef<HTMLFormElement>(null);
  const addChapterFormRefs = useRef<Map<number, HTMLFormElement>>(new Map());

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

  const dialogTitle =
    pendingDelete?.type === 'volume'
      ? `Delete "${pendingDelete.name}"?`
      : `Delete "${pendingDelete?.name}"?`;

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
              options={[...VOLUME_TYPE_OPTIONS]}
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
              options={[...CHAPTER_TYPE_OPTIONS]}
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
        <Box col className="gap-5">
          {volumes.map((volume) => {
            const vChapters = chaptersByVolume[volume.id] ?? [];
            const isRenamingVolume = renamingVolumeId === volume.id;

            return (
              <Box col key={volume.id} className="gap-2">
                {/* Volume header */}
                <Box className="items-center justify-between gap-2">
                  {editing && isRenamingVolume ? (
                    <RenameVolumeForm
                      volume={volume}
                      onSave={(fd) => run(renameVolumeAction, fd)}
                      onCancel={() => setRenamingVolumeId(null)}
                    />
                  ) : (
                    <>
                      <Text
                        variant="h4"
                        className={editing ? 'cursor-pointer hover:text-primary transition-colors' : ''}
                        onClick={editing ? () => { setRenamingVolumeId(volume.id); setRenamingChapterId(null); } : undefined}
                        title={editing ? 'Click to rename' : undefined}
                      >
                        {volume.displayName}
                      </Text>
                      {editing && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          title={`Delete ${volume.displayName} and all its chapters`}
                          onClick={() => setPendingDelete({ type: 'volume', id: volume.id, name: volume.displayName })}
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </Box>

                {/* Chapter list */}
                {vChapters.length > 0 ? (
                  <ol className="flex flex-col gap-1 pl-3 border-l-2 border-gray-100">
                    {vChapters.map((chapter) => {
                      const isRenamingChapter = renamingChapterId === chapter.id;
                      return (
                        <li
                          key={chapter.id}
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                        >
                          {editing && isRenamingChapter ? (
                            <RenameChapterForm
                              chapter={chapter}
                              onSave={(fd) => run(renameChapterAction, fd)}
                              onCancel={() => setRenamingChapterId(null)}
                            />
                          ) : (
                            <>
                              <span
                                className={editing ? 'cursor-pointer hover:text-primary transition-colors' : ''}
                                onClick={editing ? () => { setRenamingChapterId(chapter.id); setRenamingVolumeId(null); } : undefined}
                                title={editing ? 'Click to rename' : undefined}
                              >
                                {chapter.displayName}
                              </span>
                              <Box className="items-center gap-2">
                                <Text as="span" muted>#{chapter.idx}</Text>
                                {editing && (
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon-xs"
                                    title={`Delete ${chapter.displayName}`}
                                    onClick={() => setPendingDelete({ type: 'chapter', id: chapter.id, name: chapter.displayName })}
                                  >
                                    <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
                                  </Button>
                                )}
                              </Box>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <Text muted className="pl-3">No chapters yet.</Text>
                )}

                {/* Add chapter — toggle between button and inline form */}
                {editing && (
                  addingChapterToVolumeId === volume.id ? (
                    <form
                      ref={(el) => {
                        if (el) addChapterFormRefs.current.set(volume.id, el);
                        else addChapterFormRefs.current.delete(volume.id);
                      }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        run(addChapterAction, new FormData(form), () => {
                          form.reset();
                          setAddingChapterToVolumeId(null);
                        });
                      }}
                      className="flex gap-2 items-center pl-3 mt-1"
                    >
                      <input type="hidden" name="volumeId" value={volume.id} />
                      <Input
                        name="displayName"
                        required
                        placeholder="Chapter name…"
                        autoFocus
                        className="flex-1"
                        onKeyDown={(e) => e.key === 'Escape' && setAddingChapterToVolumeId(null)}
                      />
                      <Button type="submit" size="sm" disabled={isPending}>Add chapter</Button>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start ml-3 mt-1"
                      onClick={() => { setAddingChapterToVolumeId(volume.id); setAddingVolume(false); }}
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                      Add chapter
                    </Button>
                  )
                )}
              </Box>
            );
          })}
        </Box>
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
