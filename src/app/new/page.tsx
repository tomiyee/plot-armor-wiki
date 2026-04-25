'use client';

import { useState } from 'react';
import { createSerial } from './actions';

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
        <h1 className="text-2xl font-bold mb-8">Create a new wiki</h1>
        <form action={createSerial} className="flex flex-col gap-5">
          {/* Title */}
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-sm font-medium">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. One Piece"
              className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="A brief spoiler-free synopsis…"
              className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black resize-none"
            />
          </div>

          {/* Authors */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Authors</span>
            {authors.map((author, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  name="authors"
                  value={author}
                  onChange={(e) => updateAuthor(i, e.target.value)}
                  placeholder={`Author ${i + 1}`}
                  className="flex-1 rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
                />
                {authors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAuthor(i)}
                    className="text-sm text-red-500 hover:text-red-700 px-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addAuthor}
              className="self-start text-sm text-gray-600 hover:text-black underline"
            >
              + Add author
            </button>
          </div>

          {/* Splash art URL */}
          <div className="flex flex-col gap-1">
            <label htmlFor="splashArtUrl" className="text-sm font-medium">
              Splash art URL <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="splashArtUrl"
              name="splashArtUrl"
              type="url"
              placeholder="https://example.com/cover.jpg"
              className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <button
            type="submit"
            className="mt-2 rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create wiki
          </button>
        </form>
      </div>
    </main>
  );
}
