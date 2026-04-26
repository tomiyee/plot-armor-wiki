"use client";

import {
  useCallback,
  useSyncExternalStore,
  Dispatch,
  SetStateAction,
} from "react";

/**
 * A drop-in replacement for `React.useState` that persists to `localStorage`
 * and syncs across browser tabs via the `storage` event.
 *
 * Built on `useSyncExternalStore` so it is hydration-safe:
 * - The server snapshot always returns `defaultValue`.
 * - The client snapshot reads from `localStorage` after hydration.
 * - Cross-tab sync is handled by the native `storage` event.
 * - Same-tab sync uses a synthetic `StorageEvent` dispatched on write.
 *
 * @param key          The localStorage key. Use a unique, namespaced string
 *                     (e.g. `"plotarmor:progress:42"`).
 * @param defaultValue The value to use when no stored value exists yet.
 * @returns            `[value, setValue]` — same shape as `React.useState`.
 *
 * @example
 * const [count, setCount] = usePersistedStore("demo:counter", 0);
 */
export function usePersistedStore<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      function handleStorage(e: StorageEvent) {
        if (e.key === key) onStoreChange();
      }
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    },
    [key]
  );

  const getSnapshot = useCallback((): T => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {}
    return defaultValue;
  }, [key, defaultValue]);

  // Returns defaultValue on server to prevent SSR/client hydration mismatch.
  const getServerSnapshot = useCallback((): T => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      let prevRaw: string | null = null;
      let prev: T = defaultValue;
      try {
        prevRaw = localStorage.getItem(key);
        if (prevRaw !== null) prev = JSON.parse(prevRaw) as T;
      } catch {}

      const next =
        typeof action === "function"
          ? (action as (prev: T) => T)(prev)
          : action;

      try {
        const serialized = JSON.stringify(next);
        if (serialized === prevRaw) return;
        localStorage.setItem(key, serialized);

        // The native `storage` event only fires in *other* tabs.
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: serialized,
            oldValue: prevRaw,
            storageArea: localStorage,
            url: window.location.href,
          })
        );
      } catch {}
    },
    [key, defaultValue]
  );

  return [value, setValue];
}
