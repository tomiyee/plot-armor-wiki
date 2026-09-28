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
import { RefChip } from "./RefChip";
import { formatRef } from "@/lib/refs";

// ── RefNode ──────────────────────────────────────────────────────────────────

interface SerializedRefNode extends SerializedLexicalNode {
  token: string;
  quotes?: string[];
}

/**
 * Custom Lexical DecoratorNode for inline reference citations.
 *
 * Stores the raw token string (e.g. `page:luffy` or `Chapter:Chapter 5`) and
 * any optional quotes. On export, produces `{{ref|token|quote=…}}` so the markdown stored in the DB
 * round-trips correctly through the remark-refs plugin.
 *
 * @example
 * const node = new RefNode("page:luffy");
 */
export class RefNode extends DecoratorNode<ReactElement> {
  __token: string;
  __quotes: string[];

  static getType(): string {
    return "ref";
  }

  static clone(node: RefNode): RefNode {
    return new RefNode(node.__token, node.__quotes, node.__key);
  }

  static importJSON(serialized: SerializedRefNode): RefNode {
    return new RefNode(serialized.token, serialized.quotes ?? []);
  }

  constructor(token: string, quotes: string[] = [], key?: NodeKey) {
    super(key);
    this.__token = token;
    this.__quotes = quotes;
  }

  exportJSON(): SerializedRefNode {
    return {
      ...super.exportJSON(),
      type: "ref",
      token: this.__token,
      quotes: this.__quotes,
      version: 1,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  getTextContent(): string {
    return formatRef({ token: this.__token, quotes: this.__quotes });
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactElement {
    return (
      <RefChip
        token={this.__token}
        quoteCount={this.__quotes.length}
        nodeKey={this.__key}
      />
    );
  }
}

export function $isRefNode(node: LexicalNode | null | undefined): node is RefNode {
  return node instanceof RefNode;
}
