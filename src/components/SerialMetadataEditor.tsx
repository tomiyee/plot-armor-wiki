'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useServerAction } from '@/hooks/useServerAction';

interface SerialMetadataEditorProps {
  title: string;
  description: string | null;
  splashArtUrl: string | null;
  authors: string[];
  updateMetadataAction: (formData: FormData) => Promise<void>;
}

/**
 * Displays the serial's title, authors, description, and splash art in read
 * mode with a pen-icon toggle that swaps to an inline edit form. Submitting
 * the form calls `updateMetadataAction`, which may redirect if the slug changes.
 *
 * @example
 * <SerialMetadataEditor
 *   title={serial.title}
 *   description={serial.description}
 *   splashArtUrl={serial.splashArtUrl}
 *   authors={authors.map((a) => a.name)}
 *   updateMetadataAction={updateMetadataForSerial}
 * />
 */
export function SerialMetadataEditor({
  title,
  description,
  splashArtUrl,
  authors,
  updateMetadataAction,
}: SerialMetadataEditorProps) {
  const { run, isPending } = useServerAction();
  const [editing, setEditing] = useState(false);
  const [authorFields, setAuthorFields] = useState<string[]>(
    authors.length > 0 ? authors : ['']
  );

  function addAuthor() {
    setAuthorFields((prev) => [...prev, '']);
  }

  function removeAuthor(index: number) {
    setAuthorFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAuthor(index: number, value: string) {
    setAuthorFields((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  function handleCancel() {
    setEditing(false);
    // Reset author fields to the original values on cancel.
    setAuthorFields(authors.length > 0 ? authors : ['']);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(updateMetadataAction, fd, () => setEditing(false));
  }

  if (!editing) {
    return (
      <Box col className="gap-2">
        <Box className="items-start justify-between gap-2">
          <Text variant="h1">{title}</Text>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            title="Edit serial info"
            className="text-gray-500 hover:text-gray-700 mt-1 shrink-0"
          >
            <FontAwesomeIcon icon={faPen} className="h-4 w-4" />
          </Button>
        </Box>
        {authors.length > 0 && (
          <Text muted>{authors.join(', ')}</Text>
        )}
        {description && (
          <Text className="mt-1">{description}</Text>
        )}
        {splashArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={splashArtUrl}
            alt={`${title} splash art`}
            className="mt-2 rounded-lg max-h-64 object-cover"
          />
        )}
      </Box>
    );
  }

  return (
    <Box col className="gap-4">
      <Box className="items-center justify-between">
        <Text variant="h2">Edit serial info</Text>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCancel}
          title="Cancel editing"
          className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
        >
          <FontAwesomeIcon icon={faPen} className="h-4 w-4" />
        </Button>
      </Box>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Title */}
        <Box col className="gap-1">
          <Label htmlFor="meta-title">
            Title <span className="text-red-500">*</span>
          </Label>
          <Input
            id="meta-title"
            name="title"
            required
            defaultValue={title}
            placeholder="e.g. One Piece"
          />
        </Box>

        {/* Description */}
        <Box col className="gap-1">
          <Label htmlFor="meta-description">Description</Label>
          <textarea
            id="meta-description"
            name="description"
            rows={4}
            defaultValue={description ?? ''}
            placeholder="A brief spoiler-free synopsis…"
            className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black resize-none"
          />
        </Box>

        {/* Authors */}
        <Box col className="gap-2">
          <Text variant="label">Authors</Text>
          {authorFields.map((author, i) => (
            <Box key={i} className="items-center gap-2">
              <Input
                name="authors"
                value={author}
                onChange={(e) => updateAuthor(i, e.target.value)}
                placeholder={`Author ${i + 1}`}
                className="flex-1"
              />
              {authorFields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeAuthor(i)}
                  title="Remove author"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </Button>
              )}
            </Box>
          ))}
          <Button
            type="button"
            variant="link"
            onClick={addAuthor}
            className="self-start"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add author
          </Button>
        </Box>

        {/* Splash art URL */}
        <Box col className="gap-1">
          <Label htmlFor="meta-splashArtUrl">
            Splash art URL <span className="text-gray-400">(optional)</span>
          </Label>
          <Input
            id="meta-splashArtUrl"
            name="splashArtUrl"
            type="url"
            defaultValue={splashArtUrl ?? ''}
            placeholder="https://example.com/cover.jpg"
          />
        </Box>

        <Box className="gap-2 justify-end">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </Box>
      </form>
    </Box>
  );
}
