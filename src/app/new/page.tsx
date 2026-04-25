'use client';

import { useState } from 'react';
import { createSerial } from './actions';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function NewSerialPage() {
  const [authors, setAuthors] = useState<string[]>(['']);

  function addAuthor() {
    setAuthors((prev) => [...prev, '']);
  }

  function removeAuthor(index: number) {
    setAuthors((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAuthor(index: number, value: string) {
    setAuthors((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  return (
    <main className="flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-lg">
        <Text variant="h1" className="text-2xl mb-8">Create a new wiki</Text>
        <form action={createSerial} className="flex flex-col gap-5">
          {/* Title */}
          <Box col className="gap-1">
            <Label htmlFor="title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="e.g. One Piece"
            />
          </Box>

          {/* Description */}
          <Box col className="gap-1">
            <Label htmlFor="description">
              Description
            </Label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="A brief spoiler-free synopsis…"
              className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black resize-none"
            />
          </Box>

          {/* Authors */}
          <Box col className="gap-2">
            <Text variant="label">Authors</Text>
            {authors.map((author, i) => (
              <Box key={i} className="items-center gap-2">
                <Input
                  name="authors"
                  value={author}
                  onChange={(e) => updateAuthor(i, e.target.value)}
                  placeholder={`Author ${i + 1}`}
                  className="flex-1"
                />
                {authors.length > 1 && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeAuthor(i)}
                  >
                    Remove
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
              + Add author
            </Button>
          </Box>

          {/* Splash art URL */}
          <Box col className="gap-1">
            <Label htmlFor="splashArtUrl">
              Splash art URL <span className="text-gray-400">(optional)</span>
            </Label>
            <Input
              id="splashArtUrl"
              name="splashArtUrl"
              type="url"
              placeholder="https://example.com/cover.jpg"
            />
          </Box>

          <Button type="submit" className="mt-2">
            Create wiki
          </Button>
        </form>
      </div>
    </main>
  );
}
