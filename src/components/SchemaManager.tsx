'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

// ─── Inline rename forms ────────────────────────────────────────────────────────

function RenameForm({
  hiddenName,
  hiddenValue,
  fieldName,
  defaultValue,
  onSave,
  onCancel,
  inputClassName,
}: {
  hiddenName: string;
  hiddenValue: string | number;
  fieldName: string;
  defaultValue: string;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
  inputClassName?: string;
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave(new FormData(e.currentTarget));
    onCancel();
  }
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <Input
        name={fieldName}
        defaultValue={defaultValue}
        required
        autoFocus
        className={inputClassName ?? 'flex-1'}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

// ─── Schema detail (expanded view) ─────────────────────────────────────────────

/**
 * Renders the sections and floater rows for a single expanded schema.
 *
 * @example
 * <SchemaDetail schema={schema} onAction={...} isPending={false} />
 */
function SchemaDetail({
  schema,
  onDeleteSection,
  onDeleteFloaterRow,
  onRenameSection,
  onRenameFloaterRow,
  onMoveSection,
  onMoveFloaterRow,
  addSectionAction,
  addFloaterRowAction,
  isPending,
  run,
}: {
  schema: Schema;
  onDeleteSection: (sectionId: number, name: string) => void;
  onDeleteFloaterRow: (rowId: number, label: string, schemaId: number) => void;
  onRenameSection: (fd: FormData) => void;
  onRenameFloaterRow: (fd: FormData) => void;
  onMoveSection: (schemaId: number, orderedIds: number[]) => void;
  onMoveFloaterRow: (schemaId: number, orderedIds: number[]) => void;
  addSectionAction: (formData: FormData) => Promise<void>;
  addFloaterRowAction: (formData: FormData) => Promise<void>;
  isPending: boolean;
  run: (action: (fd: FormData) => Promise<void>, fd: FormData, onDone?: () => void) => void;
}) {
  const [renamingSectionId, setRenamingSectionId] = useState<number | null>(null);
  const [renamingRowId, setRenamingRowId] = useState<number | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingFloaterRow, setAddingFloaterRow] = useState(false);

  const sections = [...schema.sections].sort((a, b) => a.displayOrder - b.displayOrder);
  const floaterRows = [...schema.floaterRows].sort((a, b) => a.displayOrder - b.displayOrder);

  function moveSection(id: number, direction: 'up' | 'down') {
    const sorted = [...sections];
    const idx = sorted.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newOrder = sorted.map((s) => s.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    onMoveSection(schema.id, newOrder);
  }

  function moveFloaterRow(id: number, direction: 'up' | 'down') {
    const sorted = [...floaterRows];
    const idx = sorted.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newOrder = sorted.map((r) => r.id);
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    onMoveFloaterRow(schema.id, newOrder);
  }

  return (
    <Box col className="gap-4 pl-4 border-l-2 border-gray-100">
      {/* Sections */}
      <Box col className="gap-2">
        <Text variant="h4">Sections</Text>
        {sections.length > 0 ? (
          <ol className="flex flex-col gap-1">
            {sections.map((section, i) => (
              <li key={section.id} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-gray-50">
                {renamingSectionId === section.id ? (
                  <RenameForm
                    hiddenName="sectionId"
                    hiddenValue={section.id}
                    fieldName="name"
                    defaultValue={section.name}
                    onSave={onRenameSection}
                    onCancel={() => setRenamingSectionId(null)}
                    inputClassName="flex-1 h-7 text-sm"
                  />
                ) : (
                  <>
                    <Box className="flex-1 items-center gap-2">
                      <Box col className="gap-0.5 mr-1">
                        <button
                          type="button"
                          title="Move up"
                          disabled={i === 0 || isPending}
                          onClick={() => moveSection(section.id, 'up')}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-30 leading-none h-3"
                          aria-label={`Move ${section.name} up`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          title="Move down"
                          disabled={i === sections.length - 1 || isPending}
                          onClick={() => moveSection(section.id, 'down')}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-30 leading-none h-3"
                          aria-label={`Move ${section.name} down`}
                        >
                          ▼
                        </button>
                      </Box>
                      <span
                        className="cursor-pointer hover:text-primary transition-colors"
                        title="Click to rename"
                        onClick={() => setRenamingSectionId(section.id)}
                      >
                        {section.name}
                      </span>
                    </Box>
                    <Box className="items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        title={`Rename ${section.name}`}
                        onClick={() => setRenamingSectionId(section.id)}
                      >
                        <FontAwesomeIcon icon={faPen} className="h-2.5 w-2.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-xs"
                        title={`Delete ${section.name}`}
                        onClick={() => onDeleteSection(section.id, section.name)}
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
                      </Button>
                    </Box>
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <Text muted>No sections yet.</Text>
        )}

        {/* Add section */}
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

      {/* Floater rows (only if schema has floater) */}
      {schema.hasFloater && (
        <Box col className="gap-2">
          <Text variant="h4">Floater rows</Text>
          {floaterRows.length > 0 ? (
            <ol className="flex flex-col gap-1">
              {floaterRows.map((row, i) => (
                <li key={row.id} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-gray-50">
                  {renamingRowId === row.id ? (
                    <RenameForm
                      hiddenName="rowId"
                      hiddenValue={row.id}
                      fieldName="label"
                      defaultValue={row.label}
                      onSave={onRenameFloaterRow}
                      onCancel={() => setRenamingRowId(null)}
                      inputClassName="flex-1 h-7 text-sm"
                    />
                  ) : (
                    <>
                      <Box className="flex-1 items-center gap-2">
                        <Box col className="gap-0.5 mr-1">
                          <button
                            type="button"
                            title="Move up"
                            disabled={i === 0 || isPending}
                            onClick={() => moveFloaterRow(row.id, 'up')}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 leading-none h-3"
                            aria-label={`Move ${row.label} up`}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            disabled={i === floaterRows.length - 1 || isPending}
                            onClick={() => moveFloaterRow(row.id, 'down')}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 leading-none h-3"
                            aria-label={`Move ${row.label} down`}
                          >
                            ▼
                          </button>
                        </Box>
                        <span
                          className="cursor-pointer hover:text-primary transition-colors"
                          title="Click to rename"
                          onClick={() => setRenamingRowId(row.id)}
                        >
                          {row.label}
                        </span>
                      </Box>
                      <Box className="items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={`Rename ${row.label}`}
                          onClick={() => setRenamingRowId(row.id)}
                        >
                          <FontAwesomeIcon icon={faPen} className="h-2.5 w-2.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-xs"
                          title={`Delete ${row.label}`}
                          onClick={() => onDeleteFloaterRow(row.id, row.label, schema.id)}
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-2.5 w-2.5" />
                        </Button>
                      </Box>
                    </>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Text muted>No floater rows yet.</Text>
          )}

          {/* Add floater row */}
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
 * inline add/delete for schemas, and expand/collapse to manage sections and
 * floater rows per schema.
 *
 * @example
 * <SchemaManager
 *   schemas={schemas}
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
  const router = useRouter();
  const [expandedSchemaIds, setExpandedSchemaIds] = useState<Set<number>>(new Set());
  const [renamingSchemaId, setRenamingSchemaId] = useState<number | null>(null);
  const [addingSchema, setAddingSchema] = useState(false);
  const [hasFloater, setHasFloater] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, onDone?: () => void) {
    startTransition(async () => {
      await action(fd);
      router.refresh();
      onDone?.();
    });
  }

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

  function handleMoveSection(schemaId: number, orderedIds: number[]) {
    const fd = new FormData();
    fd.set('orderedIds', JSON.stringify(orderedIds));
    run(reorderSectionsAction, fd);
  }

  function handleMoveFloaterRow(schemaId: number, orderedIds: number[]) {
    const fd = new FormData();
    fd.set('orderedIds', JSON.stringify(orderedIds));
    run(reorderFloaterRowsAction, fd);
  }

  const deleteDialogTitle =
    pendingDelete?.type === 'schema'
      ? `Delete schema "${pendingDelete.name}"?`
      : pendingDelete?.type === 'section'
        ? `Delete section "${pendingDelete?.name}"?`
        : `Delete floater row "${pendingDelete?.name}"?`;

  const deleteDialogBody =
    pendingDelete?.type === 'schema'
      ? 'This will permanently delete this schema and all its pages. This action cannot be undone.'
      : pendingDelete?.type === 'section'
        ? 'This will remove this section from all wiki pages in this schema. This action cannot be undone.'
        : 'This will remove this floater row from all wiki pages in this schema. This action cannot be undone.';

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Text variant="h2">Schemas</Text>

      {/* Schema list */}
      {schemas.length > 0 ? (
        <Box col className="gap-3">
          {schemas.map((schema) => {
            const isExpanded = expandedSchemaIds.has(schema.id);
            const isRenaming = renamingSchemaId === schema.id;

            return (
              <Box col key={schema.id} className="gap-2 rounded-lg border border-gray-200 p-3">
                {/* Schema header */}
                <Box className="items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(schema.id)}
                    className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    aria-expanded={isExpanded}
                  >
                    <FontAwesomeIcon
                      icon={isExpanded ? faChevronDown : faChevronRight}
                      className="h-3 w-3"
                    />
                  </button>

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
                      <button
                        type="button"
                        onClick={() => toggleExpand(schema.id)}
                        className="flex-1 text-left"
                      >
                        <Text variant="h4" as="span">{schema.name}</Text>
                        {schema.hasFloater && (
                          <Text as="span" muted className="ml-2 text-xs">(has floater)</Text>
                        )}
                      </button>
                      <Box className="items-center gap-1">
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

                {/* Expanded detail */}
                {isExpanded && (
                  <SchemaDetail
                    schema={schema}
                    onDeleteSection={(id, name) => setPendingDelete({ type: 'section', id, name })}
                    onDeleteFloaterRow={(id, label, schemaId) =>
                      setPendingDelete({ type: 'floaterRow', id, name: label, schemaId })
                    }
                    onRenameSection={(fd) => run(renameSectionAction, fd)}
                    onRenameFloaterRow={(fd) => run(renameFloaterRowAction, fd)}
                    onMoveSection={handleMoveSection}
                    onMoveFloaterRow={handleMoveFloaterRow}
                    addSectionAction={addSectionAction}
                    addFloaterRowAction={addFloaterRowAction}
                    isPending={isPending}
                    run={run}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Text muted>No schemas yet. Add a schema to define wiki page categories.</Text>
      )}

      {/* Add schema */}
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
            <Box className="gap-3 items-end">
              <Box col className="gap-1 flex-1">
                <Label htmlFor="schemaName">Schema name</Label>
                <Input
                  id="schemaName"
                  name="name"
                  required
                  placeholder="e.g. Characters, Locations…"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Escape' && setAddingSchema(false)}
                />
              </Box>
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
              <Button type="submit" disabled={isPending}>Add schema</Button>
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
            Add schema
          </Button>
        )}
      </div>

      {/* Delete confirmation dialog */}
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
