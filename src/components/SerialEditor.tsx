'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrash } from '@fortawesome/free-solid-svg-icons';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

interface SerialEditorProps {
  volumes: Volume[];
  chaptersByVolume: Record<number, Chapter[]>;
  addChapterAction: (formData: FormData) => Promise<void>;
  addVolumeAction: (formData: FormData) => Promise<void>;
  deleteChapterAction: (formData: FormData) => Promise<void>;
  deleteVolumeAction: (formData: FormData) => Promise<void>;
}

export function SerialEditor({
  volumes,
  chaptersByVolume,
  addChapterAction,
  addVolumeAction,
  deleteChapterAction,
  deleteVolumeAction,
}: SerialEditorProps) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Box className="items-center justify-between">
        <Text variant="h2">Volumes &amp; Chapters</Text>
        <button
          type="button"
          onClick={() => setEditing((prev) => !prev)}
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

      {volumes.length > 0 ? (
        <Box col className="gap-5">
          {volumes.map((volume) => {
            const vChapters = chaptersByVolume[volume.id] ?? [];
            return (
              <Box col key={volume.id} className="gap-2">
                {/* Volume header */}
                <Box className="items-center justify-between gap-2">
                  <Text variant="h4">{volume.displayName}</Text>
                  {editing && (
                    <form action={deleteVolumeAction}>
                      <input type="hidden" name="volumeId" value={volume.id} />
                      <Button
                        type="submit"
                        variant="destructive"
                        size="icon-sm"
                        title={`Delete ${volume.displayName} and all its chapters`}
                        onClick={(e) => {
                          if (
                            !confirm(
                              `Delete "${volume.displayName}" and all its chapters? This cannot be undone.`
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                      </Button>
                    </form>
                  )}
                </Box>

                {/* Chapter list */}
                {vChapters.length > 0 ? (
                  <ol className="flex flex-col gap-1 pl-3 border-l-2 border-gray-100">
                    {vChapters.map((chapter) => (
                      <li
                        key={chapter.id}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                      >
                        <span>{chapter.displayName}</span>
                        <Box className="items-center gap-2">
                          <Text as="span" muted>
                            #{chapter.idx}
                          </Text>
                          {editing && (
                            <form action={deleteChapterAction}>
                              <input
                                type="hidden"
                                name="chapterId"
                                value={chapter.id}
                              />
                              <Button
                                type="submit"
                                variant="destructive"
                                size="icon-xs"
                                title={`Delete ${chapter.displayName}`}
                                onClick={(e) => {
                                  if (
                                    !confirm(
                                      `Delete "${chapter.displayName}"? This cannot be undone.`
                                    )
                                  ) {
                                    e.preventDefault();
                                  }
                                }}
                              >
                                <FontAwesomeIcon
                                  icon={faTrash}
                                  className="h-2.5 w-2.5"
                                />
                              </Button>
                            </form>
                          )}
                        </Box>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Text muted className="pl-3">
                    No chapters yet.
                  </Text>
                )}

                {/* Inline add chapter form per volume */}
                {editing && (
                  <form
                    action={addChapterAction}
                    className="flex gap-2 items-center pl-3 mt-1"
                  >
                    <input type="hidden" name="volumeId" value={volume.id} />
                    <Input
                      name="displayName"
                      required
                      placeholder="New chapter name…"
                      className="flex-1"
                    />
                    <Button type="submit" size="sm">
                      Add chapter
                    </Button>
                  </form>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Text muted>No volumes yet. Add a volume to get started.</Text>
      )}

      {/* Add volume form — always visible in edit mode, after the last volume */}
      {editing && (
        <form
          action={addVolumeAction}
          className="flex gap-2 items-center mt-2 pt-4 border-t border-gray-100"
        >
          <Input
            name="displayName"
            required
            placeholder="New volume name…"
            className="flex-1"
          />
          <Button type="submit">Add volume</Button>
        </form>
      )}
    </section>
  );
}
