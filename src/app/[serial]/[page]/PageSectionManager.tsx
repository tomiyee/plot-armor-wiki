"use client";

import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { GripVerticalIcon, LockIcon, PenIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/Dialog";
import { RenameForm } from "@/components/RenameForm";
import { useServerAction } from "@/hooks/useServerAction";
import { useOptimisticOrder } from "@/hooks/useOptimisticOrder";
import { Tooltip } from "@/components/ui/Tooltip";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { useSortableSensors, makeDragEndHandler } from "@/lib/dndUtils";
import {
  addPageSection,
  deletePageSection,
  renamePageSection,
  reorderPageSections,
} from "./actions";

export interface PageSection {
  id: number;
  name: string;
  displayOrder: number;
}

interface PageSectionManagerProps {
  pageId: number;
  sections: PageSection[];
}

function LockedSection({ section }: { section: PageSection }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/50">
      <Box className="w-4 mr-1 flex-shrink-0" />
      <Box className="flex-1 items-center gap-1.5">
        <Text as="span" variant="label">
          {section.name}
        </Text>
        <InfoIcon contents="This section appears at the top of the page without a heading. Its content will be shown in preview tooltips when this page is mentioned elsewhere." />
      </Box>
      <LockIcon className="h-3 w-3 text-muted-foreground" />
    </li>
  );
}

function SortableSection({
  section,
  isPending,
  isRenaming,
  onStartRename,
  onCancelRename,
  onDelete,
  onRename,
}: {
  section: PageSection;
  isPending: boolean;
  isRenaming: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onRename: (fd: FormData) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id, disabled: isPending });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/50"
    >
      {isRenaming ? (
        <RenameForm
          hiddenName="sectionId"
          hiddenValue={section.id}
          fieldName="name"
          defaultValue={section.name}
          onSave={onRename}
          onCancel={onCancelRename}
          inputClassName="flex-1 h-7 text-sm"
        />
      ) : (
        <>
          <span
            {...attributes}
            {...listeners}
            className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
            title="Drag to reorder"
          >
            <GripVerticalIcon className="h-3 w-3" />
          </span>
          <Text
            as="span"
            variant="label"
            className="flex-1 cursor-pointer hover:text-primary transition-colors"
            title="Click to rename"
            onClick={onStartRename}
          >
            {section.name}
          </Text>
          <Box className="items-center gap-1">
            <Tooltip content={`Rename ${section.name}`}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Rename ${section.name}`}
                onClick={onStartRename}
              >
                <PenIcon className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
            <Tooltip content={`Delete ${section.name}`}>
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                aria-label={`Delete ${section.name}`}
                onClick={onDelete}
              >
                <Trash2Icon className="h-2.5 w-2.5" />
              </Button>
            </Tooltip>
          </Box>
        </>
      )}
    </li>
  );
}

/**
 * Manages the wall-clock-versioned section structure for a single wiki page.
 * Lets editors add, rename, reorder (drag-and-drop), and delete sections.
 * Delete is guarded: sections with existing content revisions cannot be removed.
 * The first section is always locked in place (it holds the lead/preview content).
 *
 * Shown only in edit mode, above the content editors in PageEditor.
 *
 * @example
 * <PageSectionManager
 *   pageId={42}
 *   sections={[{ id: 1, name: 'Summary', displayOrder: 0 }]}
 * />
 */
export function PageSectionManager({
  pageId,
  sections,
}: PageSectionManagerProps) {
  const { run, isPending } = useServerAction();
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PageSection | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The first section is always locked; only sections[1+] are sortable.
  const lockedSection = sections[0] as PageSection | undefined;
  // Memoized so the reference only changes when server data changes, not on every
  // render triggered by isPending flipping — which would reset optimistic state mid-flight.
  const sortableSections = useMemo(() => sections.slice(1), [sections]);

  const { items: localSections, applyOptimistic, revert } = useOptimisticOrder(sortableSections);

  const localSectionIds = useMemo(() => localSections.map((s) => s.id), [localSections]);

  const sensors = useSortableSensors();
  const handleDragEnd = makeDragEndHandler(localSections, (reorderedIds) => {
    applyOptimistic(reorderedIds); // instant visual update before server round-trip
    const fd = new FormData();
    fd.set(
      "orderedIds",
      JSON.stringify(lockedSection ? [lockedSection.id, ...reorderedIds] : reorderedIds),
    );
    run(reorderPageSections, fd, undefined, revert); // revert on server error
  });

  async function confirmDelete() {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("sectionId", String(deleteTarget.id));
    const result = await deletePageSection(fd);
    if (result?.error) {
      setDeleteError(result.error);
    } else {
      setDeleteTarget(null);
      setDeleteError(null);
    }
  }

  return (
    <Box col className="gap-3 rounded-lg border border-border bg-card p-4">
      <Text variant="h4">Sections</Text>

      {sections.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {lockedSection && <LockedSection section={lockedSection} />}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={localSectionIds}
              strategy={verticalListSortingStrategy}
            >
              {localSections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  isPending={isPending}
                  isRenaming={renamingId === section.id}
                  onStartRename={() => setRenamingId(section.id)}
                  onCancelRename={() => setRenamingId(null)}
                  onDelete={() => {
                    setDeleteTarget(section);
                    setDeleteError(null);
                  }}
                  onRename={(fd) => {
                    run(renamePageSection, fd);
                    setRenamingId(null);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </ol>
      ) : (
        <Text muted className="text-sm">
          No sections yet. Add one below.
        </Text>
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set("pageId", String(pageId));
            run(addPageSection, fd, () => {
              form.reset();
              setAdding(false);
            });
          }}
          className="flex gap-2 items-center"
        >
          <Input
            name="name"
            required
            placeholder="Section name…"
            autoFocus
            className="flex-1"
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <Button type="submit" size="sm" disabled={isPending}>
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="h-3 w-3" />
          Add section
        </Button>
      )}

      <Dialog
        isOpen={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            Delete section &quot;{deleteTarget?.name}&quot;?
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {deleteError ? (
            <Text variant="body" className="text-red-600">
              {deleteError}
            </Text>
          ) : (
            <DialogDescription>
              This section will be removed from this page. This action cannot be
              undone. Sections with existing content revisions cannot be
              deleted.
            </DialogDescription>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose
            render={
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
              />
            }
          >
            {deleteError ? "Close" : "Cancel"}
          </DialogClose>
          {!deleteError && (
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </Box>
  );
}
