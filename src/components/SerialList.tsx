'use client';

import { useState } from 'react';
import Link from 'next/link';
import { titleToSlug } from '@/lib/slug';

type Serial = {
  id: number;
  title: string;
  description: string | null;
  splashArtUrl: string | null;
};

type Props = {
  serials: Serial[];
};

export default function SerialList({ serials }: Props) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? serials.filter((s) =>
        s.title.toLowerCase().includes(query.trim().toLowerCase())
      )
    : serials;

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search serials…"
        className="w-full max-w-md rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
      />
      {filtered.length > 0 ? (
        <ul className="w-full max-w-md flex flex-col gap-3 mt-2">
          {filtered.map((serial) => (
            <li key={serial.id}>
              <Link
                href={`/${titleToSlug(serial.title)}`}
                className="block rounded-lg border px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium">{serial.title}</span>
                {serial.description && (
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                    {serial.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 mt-2">
          {query.trim() ? 'No serials match your search.' : 'No wikis yet.'}
        </p>
      )}
    </>
  );
}
