"use client";

import { useState, useEffect } from "react";

/**
 * Manages optimistic ordering state for a server-driven sortable list.
 *
 * Immediately reflects drags locally so the UI responds without waiting for the
 * server round-trip, then reverts on failure. Syncs with `serverItems` whenever
 * the prop changes — so a successful router.refresh() quietly replaces the
 * optimistic state with canonical server data.
 *
 * @example
 * const { items, applyOptimistic, revert } = useOptimisticOrder(serverSections);
 * // On drag end: applyOptimistic(reorderedIds), fire server action, pass revert as onError.
 */
export function useOptimisticOrder<T extends { id: number }>(serverItems: T[]) {
  const [items, setItems] = useState(serverItems);

  // Absorb the post-refresh server state. Without this, a second drag would
  // start from stale local state instead of the canonical order.
  useEffect(() => {
    setItems(serverItems);
  }, [serverItems]);

  /** Immediately reorder by ID list — call before the server action fires. */
  function applyOptimistic(reorderedIds: number[]) {
    setItems((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      return reorderedIds.map((id) => byId.get(id)!);
    });
  }

  /** Restore server state — call in the server action's onError handler. */
  function revert() {
    setItems(serverItems);
  }

  return { items, applyOptimistic, revert };
}
