import type {
  MdastImportVisitor,
  LexicalExportVisitor,
  ToMarkdownExtension,
} from "@mdxeditor/editor";
import {
  addLexicalNode$,
  addImportVisitor$,
  addExportVisitor$,
  realmPlugin,
} from "@mdxeditor/editor";
import { ElementNode, $createTextNode } from "lexical";
import type * as Mdast from "mdast";
import { WikiLinkNode, $isWikiLinkNode } from "./WikiLinkNode";
import { RefNode } from "./RefNode";
import { REF_RE, parseRefBody } from "@/lib/refs";
import { escapeWikiAlias, unescapeWikiAlias } from "@/lib/wiki-links";

// Combined pattern matching wiki links and ref citations in one pass.
// Groups: 1 = wikilink token, 2 = wikilink alias, 3 = ref body.
const COMBINED_RE = new RegExp(
  String.raw`\[?\[\[([^|\[\]]+)(?:\|((?:[^\]\\]|\\.)*))?\]\]|` +
    REF_RE.source,
  "g",
);

// ── MDXEditor import visitor: text → WikiLinkNode / RefNode ─────────────────

/**
 * Intercepts mdast text nodes that contain `[[token]]` or `{{ref|token}}`
 * patterns and splits them into WikiLinkNodes, RefNodes, and plain TextNodes
 * in a single left-to-right pass.
 *
 * Handles both patterns together so a text node like
 * `[[Page|Alias]]. {{ref|Chapter:1.04}}` produces a WikiLinkNode followed by a
 * RefNode rather than leaving the ref as literal text (which would happen if the
 * wiki-link visitor consumed the node first and a separate ref visitor never saw
 * the remaining text).
 *
 * Priority 1 ensures this runs before MDXEditor's built-in text visitor
 * (priority 0). For text nodes with no recognised patterns, `nextVisitor()`
 * delegates back to the default handler.
 */
export const WikiLinkTextVisitor: MdastImportVisitor<Mdast.Text> = {
  testNode: "text",
  priority: 1,
  visitNode({ mdastNode, lexicalParent, actions }) {
    const text = mdastNode.value;
    const hasWikiLink = text.includes("[[");
    const hasRef = text.includes("{{ref");

    if (!hasWikiLink && !hasRef) {
      actions.nextVisitor();
      return;
    }

    const formatting = actions.getParentFormatting();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    COMBINED_RE.lastIndex = 0;

    while ((match = COMBINED_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const before = $createTextNode(text.slice(lastIndex, match.index));
        before.setFormat(formatting);
        (lexicalParent as ElementNode).append(before);
      }

      if (match[1] !== undefined) {
        // Wiki link — group 1 = token, group 2 = optional alias
        const alias = match[2] ? unescapeWikiAlias(match[2].trim()) || undefined : undefined;
        (lexicalParent as ElementNode).append(new WikiLinkNode(match[1], alias));
      } else {
        // Ref citation — group 3 = body (token plus optional quote params)
        const { token, quotes } = parseRefBody(match[3]);
        (lexicalParent as ElementNode).append(new RefNode(token, quotes));
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const after = $createTextNode(text.slice(lastIndex));
      after.setFormat(formatting);
      (lexicalParent as ElementNode).append(after);
    }
  },
};

// ── MDXEditor export visitor: WikiLinkNode → wikiLink mdast node ─────────────

// Custom mdast node - not part of the standard Mdast.Nodes union.
interface MdastWikiLinkNode {
  type: "wikiLink";
  value: string;
  alias?: string;
}

export const WikiLinkExportVisitor: LexicalExportVisitor<
  WikiLinkNode,
  Mdast.Text
> = {
  testLexicalNode: $isWikiLinkNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    // Produce a custom "wikiLink" node so the toMarkdown handler below can
    // emit [[token]] without mdast-util-to-markdown escaping the [ character.
    actions.appendToParent(mdastParent, {
      type: "wikiLink",
      value: lexicalNode.__token,
      alias: lexicalNode.__alias,
    } as unknown as Mdast.Text);
  },
};

// Passed to MDXEditorClient.toMarkdownOptions - emits [[token]] or [[token|alias]] verbatim.
// mdast-util-to-markdown escapes [ in text nodes; a custom handler bypasses that.
export const wikiLinkToMarkdownExtension = {
  handlers: {
    wikiLink: (node: MdastWikiLinkNode) =>
      node.alias ? `[[${node.value}|${escapeWikiAlias(node.alias)}]]` : `[[${node.value}]]`,
  },
} as unknown as ToMarkdownExtension;

/**
 * Realm plugin that registers the WikiLinkNode, import visitor, and export
 * visitor with the MDXEditor Lexical realm.
 *
 * @example
 * plugins={[wikiPlugin, toolbarPlugin({ ... }), ...]}
 */
export const wikiPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: WikiLinkNode,
      [addImportVisitor$]: WikiLinkTextVisitor,
      [addExportVisitor$]: WikiLinkExportVisitor,
    });
  },
})();
