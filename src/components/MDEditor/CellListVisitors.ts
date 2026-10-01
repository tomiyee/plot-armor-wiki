import type { LexicalExportVisitor, ToMarkdownExtension } from "@mdxeditor/editor";
import {
  addLexicalNode$,
  addExportVisitor$,
  addToMarkdownExtension$,
  realmPlugin,
} from "@mdxeditor/editor";
import type * as Mdast from "mdast";
import { CellListNode, $isCellListNode } from "./CellListNode";
import { formatCellList } from "@/lib/cell-lists";

// Custom mdast node type — not part of the standard Mdast.Nodes union.
interface MdastCellListNode {
  type: "cellList";
  items: string[];
}

const CellListExportVisitor: LexicalExportVisitor<CellListNode, Mdast.Text> = {
  testLexicalNode: $isCellListNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: "cellList",
      items: lexicalNode.__items,
    } as unknown as Mdast.Text);
  },
};

// Emits `{{list:…}}` verbatim — mdast-util-to-markdown would otherwise escape `{`.
const cellListToMarkdownExtension = {
  handlers: {
    cellList: (node: MdastCellListNode) => formatCellList(node.items),
  },
} as unknown as ToMarkdownExtension;

/**
 * Realm plugin that registers CellListNode and its export visitor. Import is
 * handled by `WikiLinkTextVisitor`, which splits all `{{…}}`/`[[…]]` syntax
 * out of text nodes in one pass.
 *
 * @example
 * plugins={[wikiPlugin, refPlugin, cellListPlugin, tablePlugin(), ...]}
 */
export const cellListPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: CellListNode,
      [addExportVisitor$]: CellListExportVisitor,
      [addToMarkdownExtension$]: cellListToMarkdownExtension,
    });
  },
})();
