"use client";

import type { ReactElement } from "react";
import {
  DecoratorNode,
  type LexicalEditor,
  type EditorConfig,
  type NodeKey,
  type SerializedLexicalNode,
  type LexicalNode,
} from "lexical";
import { CellListChip } from "./CellListChip";
import { formatCellList } from "@/lib/cell-lists";

interface SerializedCellListNode extends SerializedLexicalNode {
  items: string[];
}

/**
 * Inline Lexical DecoratorNode for a `{{list:…}}` bulleted list.
 *
 * Inline so it can live inside a GFM table cell, whose nested editor only
 * holds phrasing content. Exports back to `{{list:…}}` so the list survives
 * the markdown round trip.
 *
 * @example
 * sel.insertNodes([new CellListNode(["Gum-Gum", "Haki"])]);
 */
export class CellListNode extends DecoratorNode<ReactElement> {
  __items: string[];

  static getType(): string {
    return "cellList";
  }

  static clone(node: CellListNode): CellListNode {
    return new CellListNode([...node.__items], node.__key);
  }

  static importJSON(serialized: SerializedCellListNode): CellListNode {
    return new CellListNode(serialized.items ?? []);
  }

  constructor(items: string[] = [], key?: NodeKey) {
    super(key);
    this.__items = items;
  }

  exportJSON(): SerializedCellListNode {
    return {
      ...super.exportJSON(),
      type: "cellList",
      items: this.__items,
      version: 1,
    };
  }

  setItems(items: string[]): void {
    this.getWritable().__items = items;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.style.verticalAlign = "top";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  getTextContent(): string {
    return formatCellList(this.__items);
  }

  decorate(editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return <CellListChip items={this.__items} nodeKey={this.__key} editor={editor} />;
  }
}

export function $isCellListNode(
  node: LexicalNode | null | undefined,
): node is CellListNode {
  return node instanceof CellListNode;
}
