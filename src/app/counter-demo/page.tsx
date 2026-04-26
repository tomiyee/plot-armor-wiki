"use client";

/**
 * Demo page for usePersistedStore.
 *
 * Open this page in two browser tabs. Incrementing or resetting the counter in
 * one tab should immediately update the other tab — no page refresh needed.
 * Refreshing either tab should also restore the last saved count from
 * localStorage rather than starting from zero.
 *
 * Route: /counter-demo
 */

import { usePersistedStore } from "@/hooks/usePersistedStore";

const STORAGE_KEY = "demo:counter";

export default function CounterDemoPage() {
  const [count, setCount] = usePersistedStore<number>(STORAGE_KEY, 0);

  return (
    <main className="flex flex-col items-center gap-8 px-6 py-16">
      <h1 className="text-3xl font-bold">usePersistedStore demo</h1>

      <p className="max-w-prose text-center text-sm text-gray-500">
        This counter is saved to <code>localStorage</code> under the key{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
          {STORAGE_KEY}
        </code>
        . Open this page in a second tab — clicking either button will update
        both tabs instantly without a page refresh.
      </p>

      <div className="flex flex-col items-center gap-4">
        <span className="text-7xl font-bold tabular-nums">{count}</span>

        <div className="flex gap-3">
          <button
            onClick={() => setCount((n) => n + 1)}
            className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 active:scale-95 transition-transform"
          >
            Increment
          </button>
          <button
            onClick={() => setCount(0)}
            className="rounded-lg border px-5 py-2 text-sm font-medium hover:bg-gray-50 active:scale-95 transition-transform"
          >
            Reset
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Refresh the page to confirm the value is persisted across sessions.
      </p>
    </main>
  );
}
