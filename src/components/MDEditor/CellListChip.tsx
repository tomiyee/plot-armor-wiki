"use client";

import { useEffect, useRef, useState } from "react";
import { $getNodeByKey, type LexicalEditor } from "lexical";
import { NESTED_EDITOR_UPDATED_COMMAND } from "@mdxeditor/editor";
import { Popover } from "@/components/ui/Popover";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { $isCellListNode } from "./CellListNode";

type CellListChipProps = {
  /** Current list items, in order. */
  items: string[];
  /** Lexical key of the owning CellListNode. */
  nodeKey: string;
  /** Editor that owns the node — the nested table-cell editor when inside a table. */
  editor: LexicalEditor;
};

/**
 * In-editor view of a `{{list:…}}` node: a bulleted list that opens a
 * one-item-per-line textarea on click. A new, empty list opens straight away.
 *
 * Saves by updating the node in its own editor, then dispatching
 * `NESTED_EDITOR_UPDATED_COMMAND` so a table cell writes the change back
 * into the table's mdast (the cell editor only syncs on blur otherwise).
 *
 * @example
 * <CellListChip items={["a", "b"]} nodeKey={node.__key} editor={editor} />
 */
export function CellListChip(props: CellListChipProps) {
  const { items, nodeKey, editor } = props;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const openEditor = () => {
    setDraft(items.join("\n"));
    setOpen(true);
  };

  useEffect(() => {
    if (items.length === 0) openEditor();
    // Only on mount: auto-open freshly inserted empty lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    const next = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isCellListNode(node)) return;
        if (next.length === 0) node.remove();
        else node.setItems(next);
      },
      { discrete: true },
    );
    editor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
    setOpen(false);
  };

  return (
    <>
      <span
        ref={anchorRef}
        contentEditable={false}
        data-cell-list-key={nodeKey}
        onClick={openEditor}
        className="inline-block cursor-pointer select-none rounded px-1 hover:bg-accent"
      >
        {items.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <Text as="span" variant="label" muted>
            Empty list
          </Text>
        )}
      </span>
      <Popover
        anchor={anchorRef}
        open={open}
        onOpenChange={(o) => {
          if (!o) save();
        }}
        className="w-72 p-3"
        content={
          <div className="flex flex-col gap-2">
            <Text variant="label">
              One bullet per line
            </Text>
            <Textarea
              autoFocus
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Keep Enter for new lines; Ctrl/Cmd+Enter saves.
                e.stopPropagation();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  save();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save}>
                Save
              </Button>
            </div>
          </div>
        }
      />
    </>
  );
}
