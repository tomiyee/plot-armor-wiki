'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronDown,
  faChevronRight,
  faPen,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { RenameForm } from '@/components/RenameForm';
import { useServerAction } from '@/hooks/useServerAction';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  id: number;
  name: string;
  displayOrder: number;
}

interface FloaterRow {
  id: number;
  label: string;
  displayOrder: number;
}

interface Schema {
  id: number;
  name: string;
  hasFloater: boolean;
  sections: Section[];
  floaterRows: FloaterRow[];
}

interface PendingDelete {
  type: 'schema' | 'section' | 'floaterRow';
  id: number;
  name: string;
  schemaId?: number;
}

interface SchemaManagerProps {
  schemas: Schema[];
  serialSlug: string;
  addSchemaAction: (formData: FormData) => Promise<void>;
  deleteSchemaAction: (formData: FormData) => Promise<void>;
  renameSchemaAction: (formData: FormData) => Promise<void>;
  addSectionAction: (formData: FormData) => Promise<void>;
  deleteSectionAction: (formData: FormData) => Promise<void>;
  renameSectionAction: (formData: FormData) => Promise<void>;
  reorderSectionsAction: (formData: FormData) => Promise<void>;
  addFloaterRowAction: (formData: FormData) => Promise<void>;
  deleteFloaterRowAction: (formData: FormData) => Promise<void>;
  renameFloaterRowAction: (formData: FormData) => Promise<void>;
  reorderFloaterRowsAction: (formData: FormData) => Promise<void>;
}

// ─── ReorderableItem ───────────────────────────────────────────────────────────

function ReorderableItem({
  label,
  isFirst,
  isLast,
  isPending,
  isRenaming,
  onMoveUp,
  onMoveDown,
  onStartRename,
  renameForm,
  onDelete,
}: {
  label: string;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  isRenaming: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStartRename: () => void;
  renameForm: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-gray-50">
      {isRenaming ? (
        renameForm
      ) : (
        <>
          <Box className="flex-1 items-center gap-2">
            <Box col className="gap-0.5 mr-1">
              <Button
                type="button"
                variant="ghost"
                title="Move up"
                disabled={isFirst || isPending}
                onClick={onMoveUp}
                className="h-3 w-4 p-0 rounded-sm text-gray-400 hover:text-gray-600 hover:bg-transparent disabled:opacity-30 leading-none"
                aria-label={`Move ${label} up`}
              >
                ▲
              </Button>
              <Button
                type="button"
                variant="ghost"
                title="Move down"
                disabled={isLast || isPending}
                onClick={onMoveDown}
                className="h-3 w-4 p-0 rounded-sm text-gray-400 hover:text-gray-600 hover:bg-transparent disabled:opacity-30 leading-none"
                aria-label={`Move ${label} down`}
              >
                ▼
              </Button>
            </Box>
            <span
              className="cursor-pointer hover:text-primary transition-colors"
              title="Click to rename"
              onClick={onStartRename}
            >
              {label}
            </span>
          </Box>
          <Box className="items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title={`Rename ${label}`}
              onClick={onStartRename}
            >
              <FontAwesomeIcon icon={faPen} className="h-2.5 w-2.5" />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon-xs"
              title={`Delete ${label}`}
              onClick={onDelete}
            >
              <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
            </Button>
          </Box>
        </>
      )}
    </li>
  );
}

// ─── Schema detail (expanded view) ─────────────────────────────────────────────

/**
 * Renders the sections and floater rows for a single expanded schema.
 *
 * @example
 * <SchemaDetail schema={schema} {...actionProps} />
 */
function SchemaDetail({
  schema,
  onDeleteSection,
  onDeleteFloaterRow,
  renameSectionAction,
  renameFloaterRowAction,
  reorderSectionsAction,
  reorderFloaterRowsAction,
  addSectionAction,
  addFloaterRowAction,
}: {
  schema: Schema;
  onDeleteSection: (sectionId: number, name: string) => void;
  onDeleteFloaterRow: (rowId: number, label: string, schemaId: number) => void;
  renameSectionAction: (fd: FormData) => Promise<void>;
  renameFloaterRowAction: (fd: FormData) => Promise<void>;
  reorderSectionsAction: (fd: FormData) => Promise<void>;
  reorderFloaterRowsAction: (fd: FormData) => Promise<void>;
  addSectionAction: (formData: FormData) => Promise<void>;
  addFloaterRowAction: (formData: FormData) => Promise<void>;
}) {
  const { run, isPending } = useServerAction();
  const [renamingSectionId, setRenamingSectionId] = useState<number | null>(null);
  const [renamingRowId, setRenamingRowId] = useState<number | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingFloaterRow, setAddingFloaterRow] = useState(false);

  const sections = schema.sections;
  const floaterRows = schema.floaterRows;

  function moveSection(id: number, direction: 'up' | 'down') {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const newOrder = sections.map((s) => s.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const fd = new FormData();
    fd.set('orderedIds', JSON.stringify(newOrder));
    run(reorderSectionsAction, fd);
  }

  function moveFloaterRow(id: number, direction: 'up' | 'down') {
    const idx = floaterRows.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= floaterRows.length) return;
    const newOrder = floaterRows.map((r) => r.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    const fd = new FormData();
    fd.set('orderedIds', JSON.stringify(newOrder));
    run(reorderFloaterRowsAction, fd);
  }

  return (
    <Box col className="gap-4 pl-4 border-l-2 border-gray-100">
      {/* Sections */}
      <Box col className="gap-2">
        <Text variant="h4">Sections</Text>
        {sections.length > 0 ? (
          <ol className="flex flex-col gap-1">
            {sections.map((section, i) => (
              <ReorderableItem
                key={section.id}
                label={section.name}
                isFirst={i === 0}
                isLast={i === sections.length - 1}
                isPending={isPending}
                isRenaming={renamingSectionId === section.id}
                onMoveUp={() => moveSection(section.id, 'up')}
                onMoveDown={() => moveSection(section.id, 'down')}
                onStartRename={() => setRenamingSectionId(section.id)}
                onDelete={() => onDeleteSection(section.id, section.name)}
                renameForm={
                  <RenameForm
                    hiddenName="sectionId"
                    hiddenValue={section.id}
                    fieldName="name"
                    defaultValue={section.name}
                    onSave={(fd) => run(renameSectionAction, fd)}
                    onCancel={() => setRenamingSectionId(null)}
                    inputClassName="flex-1 h-7 text-sm"
                  />
                }
              />
            ))}
          </ol>
        ) : (
          <Text muted>No sections yet.</Text>
        )}

        {addingSection ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              run(addSectionAction, new FormData(form), () => {
                form.reset();
                setAddingSection(false);
              });
            }}
            className="flex gap-2 items-center"
          >
            <input type="hidden" name="schemaId" value={schema.id} />
            <Input
              name="name"
              required
              placeholder="Section name…"
              autoFocus
              className="flex-1"
              onKeyDown={(e) => e.key === 'Escape' && setAddingSection(false)}
            />
            <Button type="submit" size="sm" disabled={isPending}>Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddingSection(false)}>Cancel</Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setAddingSection(true)}
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add section
          </Button>
        )}
      </Box>

      {schema.hasFloater && (
        <Box col className="gap-2">
          <Text variant="h4">Floater rows</Text>
          {floaterRows.length > 0 ? (
            <ol className="flex flex-col gap-1">
              {floaterRows.map((row, i) => (
                <ReorderableItem
                  key={row.id}
                  label={row.label}
                  isFirst={i === 0}
                  isLast={i === floaterRows.length - 1}
                  isPending={isPending}
                  isRenaming={renamingRowId === row.id}
                  onMoveUp={() => moveFloaterRow(row.id, 'up')}
                  onMoveDown={() => moveFloaterRow(row.id, 'down')}
                  onStartRename={() => setRenamingRowId(row.id)}
                  onDelete={() => onDeleteFloaterRow(row.id, row.label, schema.id)}
                  renameForm={
                    <RenameForm
                      hiddenName="rowId"
                      hiddenValue={row.id}
                      fieldName="label"
                      defaultValue={row.label}
                      onSave={(fd) => run(renameFloaterRowAction, fd)}
                      onCancel={() => setRenamingRowId(null)}
                      inputClassName="flex-1 h-7 text-sm"
                    />
                  }
                />
              ))}
            </ol>
          ) : (
            <Text muted>No floater rows yet.</Text>
          )}

          {addingFloaterRow ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                run(addFloaterRowAction, new FormData(form), () => {
                  form.reset();
                  setAddingFloaterRow(false);
                });
              }}
              className="flex gap-2 items-center"
            >
              <input type="hidden" name="schemaId" value={schema.id} />
              <Input
                name="label"
                required
                placeholder="Row label…"
                autoFocus
                className="flex-1"
                onKeyDown={(e) => e.key === 'Escape' && setAddingFloaterRow(false)}
              />
              <Button type="submit" size="sm" disabled={isPending}>Add</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAddingFloaterRow(false)}>Cancel</Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setAddingFloaterRow(true)}
            >
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              Add floater row
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── Schema Manager ─────────────────────────────────────────────────────────────

/**
 * Client component that manages the list of page schemas for a serial. Provides
 * inline add/delete for schemas, expand/collapse to manage sections and floater
 * rows per schema, and a link to the schema index page.
 *
 * @example
 * <SchemaManager
 *   schemas={schemas}
 *   serialSlug="one-piece"
 *   addSchemaAction={addSchemaAction}
 *   deleteSchemaAction={deleteSchemaAction}
 *   renameSchemaAction={renameSchemaAction}
 *   addSectionAction={addSectionAction}
 *   deleteSectionAction={deleteSectionAction}
 *   renameSectionAction={renameSectionAction}
 *   reorderSectionsAction={reorderSectionsAction}
 *   addFloaterRowAction={addFloaterRowAction}
 *   deleteFloaterRowAction={deleteFloaterRowAction}
 *   renameFloaterRowAction={renameFloaterRowAction}
 *   reorderFloaterRowsAction={reorderFloaterRowsAction}
 * />
 */
export function SchemaManager({
  schemas,
  serialSlug,
  addSchemaAction,
  deleteSchemaAction,
  renameSchemaAction,
  addSectionAction,
  deleteSectionAction,
  renameSectionAction,
  reorderSectionsAction,
  addFloaterRowAction,
  deleteFloaterRowAction,
  renameFloaterRowAction,
  reorderFloaterRowsAction,
}: SchemaManagerProps) {
  const { run, isPending } = useServerAction();
  const [expandedSchemaIds, setExpandedSchemaIds] = useState<Set<number>>(new Set());
  const [renamingSchemaId, setRenamingSchemaId] = useState<number | null>(null);
  const [addingSchema, setAddingSchema] = useState(false);
  const [hasFloater, setHasFloater] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  function toggleExpand(schemaId: number) {
    setExpandedSchemaIds((prev) => {
      const next = new Set(prev);
      if (next.has(schemaId)) {
        next.delete(schemaId);
      } else {
        next.add(schemaId);
      }
      return next;
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const fd = new FormData();
    if (pendingDelete.type === 'schema') {
      fd.set('schemaId', String(pendingDelete.id));
      run(deleteSchemaAction, fd, () => setPendingDelete(null));
    } else if (pendingDelete.type === 'section') {
      fd.set('sectionId', String(pendingDelete.id));
      run(deleteSectionAction, fd, () => setPendingDelete(null));
    } else {
      fd.set('rowId', String(pendingDelete.id));
      run(deleteFloaterRowAction, fd, () => setPendingDelete(null));
    }
  }

  const deleteDialogTitle =
    pendingDelete?.type === 'schema'
      ? `Delete page type "${pendingDelete.name}"?`
      : pendingDelete?.type === 'section'
        ? `Delete section "${pendingDelete.name}"?`
        : `Delete floater row "${pendingDelete?.name}"?`;

  const deleteDialogBody =
    pendingDelete?.type === 'schema'
      ? 'This will permanently delete this page type and all its pages. This action cannot be undone.'
      : pendingDelete?.type === 'section'
        ? 'This will remove this section from all wiki pages in this page type. This action cannot be undone.'
        : 'This will remove this floater row from all wiki pages in this page type. This action cannot be undone.';

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Text variant="h2">Page Types</Text>

      {schemas.length > 0 ? (
        <Box col className="gap-3">
          {schemas.map((schema) => {
            const isExpanded = expandedSchemaIds.has(schema.id);
            const isRenaming = renamingSchemaId === schema.id;

            return (
              <Box col key={schema.id} className="gap-2 rounded-lg border border-gray-200 p-3">
                <Box className="items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => toggleExpand(schema.id)}
                    className="text-gray-500 hover:text-gray-700"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    aria-expanded={isExpanded}
                  >
                    <FontAwesomeIcon
                      icon={isExpanded ? faChevronDown : faChevronRight}
                      className="h-3 w-3"
                    />
                  </Button>

                  {isRenaming ? (
                    <RenameForm
                      hiddenName="schemaId"
                      hiddenValue={schema.id}
                      fieldName="name"
                      defaultValue={schema.name}
                      onSave={(fd) => run(renameSchemaAction, fd)}
                      onCancel={() => setRenamingSchemaId(null)}
                    />
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleExpand(schema.id)}
                        className="flex-1 justify-start h-auto p-0 hover:bg-transparent font-normal"
                      >
                        <Text variant="h4" as="span">{schema.name}</Text>
                        {schema.hasFloater && (
                          <Text as="span" muted className="ml-2 text-xs">(has floater)</Text>
                        )}
                      </Button>
                      <Box className="items-center gap-1">
                        <Link
                          href={`/${serialSlug}/${encodeURIComponent(schema.name)}`}
                          className="text-xs text-blue-600 hover:underline px-1"
                          title={`View ${schema.name} index page`}
                        >
                          View
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={`Rename ${schema.name}`}
                          onClick={() => setRenamingSchemaId(schema.id)}
                        >
                          <FontAwesomeIcon icon={faPen} className="h-2.5 w-2.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-xs"
                          title={`Delete ${schema.name}`}
                          onClick={() => setPendingDelete({ type: 'schema', id: schema.id, name: schema.name })}
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>

                {isExpanded && (
                  <SchemaDetail
                    schema={schema}
                    onDeleteSection={(id, name) => setPendingDelete({ type: 'section', id, name })}
                    onDeleteFloaterRow={(id, label, schemaId) =>
                      setPendingDelete({ type: 'floaterRow', id, name: label, schemaId })
                    }
                    renameSectionAction={renameSectionAction}
                    renameFloaterRowAction={renameFloaterRowAction}
                    reorderSectionsAction={reorderSectionsAction}
                    reorderFloaterRowsAction={reorderFloaterRowsAction}
                    addSectionAction={addSectionAction}
                    addFloaterRowAction={addFloaterRowAction}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Text muted>No page types yet. Add a page type to define wiki page categories.</Text>
      )}

      <div className="mt-2 pt-4 border-t border-gray-100">
        {addingSchema ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              fd.set('hasFloater', String(hasFloater));
              run(addSchemaAction, fd, () => {
                form.reset();
                setHasFloater(false);
                setAddingSchema(false);
              });
            }}
            className="flex flex-col gap-3"
          >
            <Box col className="gap-1 flex-1">
              <Label htmlFor="schemaName">Page type name</Label>
              <Input
                id="schemaName"
                name="name"
                required
                placeholder="e.g. Characters, Locations…"
                autoFocus
                onKeyDown={(e) => e.key === 'Escape' && setAddingSchema(false)}
              />
            </Box>
            <Box className="items-center gap-2">
              <input
                type="checkbox"
                id="hasFloater"
                checked={hasFloater}
                onChange={(e) => setHasFloater(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="hasFloater">Has floater sidebar</Label>
            </Box>
            <Box className="gap-2">
              <Button type="submit" disabled={isPending}>Add page type</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAddingSchema(false);
                  setHasFloater(false);
                }}
              >
                Cancel
              </Button>
            </Box>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddingSchema(true)}
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add page type
          </Button>
        )}
      </div>

      <Dialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{deleteDialogTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>{deleteDialogBody}</DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={isPending} onClick={confirmDelete}>
            {isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}
