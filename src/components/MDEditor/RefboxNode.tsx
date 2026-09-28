"use client";

import type { ReactElement } from "react";
import { ListOrdered } from "lucide-react";
import {
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type LexicalNode,
} from "lexical";
import { WIKI_LINK_CHIP_BASE } from "./wikiLinkChipClasses";

/**
 * Inline Lexical DecoratorNode for the `{{refbox}}` placeholder, so the editor
 * shows a "References" chip instead of raw text. Exports back to `{{refbox}}`;
 * the actual list is built at render time by `MarkdownRenderer`.
 *
 * @example
 * const node = new RefboxNode();
 */
export class RefboxNode extends DecoratorNode<ReactElement> {
  static getType(): string {
    return "refbox";
  }

  static clone(node: RefboxNode): RefboxNode {
    return new RefboxNode(node.__key);
  }

  static importJSON(_serialized: SerializedLexicalNode): RefboxNode {
    return new RefboxNode();
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  exportJSON(): SerializedLexicalNode {
    return { ...super.exportJSON(), type: "refbox", version: 1 };
  }

  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  getTextContent(): string {
    return "{{refbox}}";
  }

  decorate(): ReactElement {
    return (
      <span contentEditable={false} className={WIKI_LINK_CHIP_BASE}>
        <ListOrdered className="size-3.5 self-center text-muted-foreground" />
        References list
      </span>
    );
  }
}

/**
 * Type guard for `RefboxNode`.
 *
 * @example
 * if ($isRefboxNode(node)) { ... }
 */
export function $isRefboxNode(
  node: LexicalNode | null | undefined,
): node is RefboxNode {
  return node instanceof RefboxNode;
}
