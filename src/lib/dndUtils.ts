"use client";

import type { CSSProperties } from "react";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Standard PointerSensor + KeyboardSensor setup for sortable lists.
 *
 * @example
 * const sensors = useSortableSensors();
 */
export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

/**
 * Returns drag/drop refs and props for a single sortable item.
 *
 * @example
 * const { ref, style, dragHandleProps } = useSortableItem(section.id, isPending);
 */
export function useSortableItem(id: number, disabled: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return {
    ref: setNodeRef,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      opacity: isDragging ? 0 : 1,
    } as CSSProperties,
    dragHandleProps: { ...attributes, ...listeners },
  };
}

/**
 * Returns a DragEndEvent handler for a sortable list of id-bearing items.
 * Calls onReorder only when the item actually moved to a new position.
 *
 * @example
 * const handleDragEnd = makeDragEndHandler(sections, onReorder);
 */
export function makeDragEndHandler<T extends { id: number }>(
  items: T[],
  onReorder: (orderedIds: number[]) => void,
) {
  return (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item.id));
  };
}
