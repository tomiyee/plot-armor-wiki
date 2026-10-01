import type {
  LexicalExportVisitor,
  ToMarkdownExtension,
} from "@mdxeditor/editor";
import {
  addLexicalNode$,
  addExportVisitor$,
  addToMarkdownExtension$,
  realmPlugin,
} from "@mdxeditor/editor";
import type * as Mdast from "mdast";
import { RefNode, $isRefNode } from "./RefNode";
import { formatRef } from "@/lib/refs";
import { escapeTableCellPipes } from "./escapeTableCellPipes";

// ── MDXEditor export visitors ────────────────────────────────────────────────

// Custom mdast node type — not part of the standard Mdast.Nodes union.
interface MdastRefNode {
  type: "refCitation";
  token: string;
  quotes: string[];
}

export const RefExportVisitor: LexicalExportVisitor<RefNode, Mdast.Text> = {
  testLexicalNode: $isRefNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: "refCitation",
      token: lexicalNode.__token,
      quotes: lexicalNode.__quotes,
    } as unknown as Mdast.Text);
  },
};

// ── toMarkdown handlers ──────────────────────────────────────────────────────

/**
 * Registered via addToMarkdownExtension$ in refPlugin. Emits `{{ref|token|quote=…}}` verbatim
 * — mdast-util-to-markdown would otherwise escape `{`. Pipes are escaped
 * inside table cells.
 */
export const refToMarkdownExtension = {
  handlers: {
    refCitation: (node: MdastRefNode, _parent: unknown, state: { stack: string[] }) =>
      escapeTableCellPipes(formatRef(node), state),
  },
} as unknown as ToMarkdownExtension;

// ── realmPlugin ──────────────────────────────────────────────────────────────

/**
 * Realm plugin that registers RefNode and its export visitor.
 *
 * @example
 * plugins={[wikiPlugin, refPlugin, toolbarPlugin({ ... }), ...]}
 */
export const refPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: RefNode,
      [addExportVisitor$]: RefExportVisitor,
      [addToMarkdownExtension$]: refToMarkdownExtension,
    });
  },
})();
