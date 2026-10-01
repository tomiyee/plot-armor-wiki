import type { List, Nodes, Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { CELL_LIST_RE, parseCellListBody } from "./cell-lists";

function toList(items: string[]): List {
  return {
    type: "list",
    ordered: false,
    spread: false,
    children: items.map((value) => ({
      type: "listItem",
      spread: false,
      children: [{ type: "paragraph", children: [{ type: "text", value }] }],
    })),
  };
}

// Splits one text value into text + list nodes. Returns null when no list is present.
function splitText(value: string): (PhrasingContent | List)[] | null {
  if (!value.includes("{{list:")) return null;
  const out: (PhrasingContent | List)[] = [];
  let last = 0;
  CELL_LIST_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CELL_LIST_RE.exec(value)) !== null) {
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    out.push(toList(parseCellListBody(m[1])));
    last = m.index + m[0].length;
  }
  if (out.length === 0) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

// A list cannot sit inside <p>, so split the paragraph around each list.
function splitParagraph(p: Paragraph): RootContent[] {
  const out: RootContent[] = [];
  let run: PhrasingContent[] = [];
  const flush = () => {
    if (run.some((n) => n.type !== "text" || n.value.trim())) {
      out.push({ ...p, children: run });
    }
    run = [];
  };
  for (const child of p.children as (PhrasingContent | List)[]) {
    if (child.type === "list") {
      flush();
      out.push(child);
    } else {
      run.push(child);
    }
  }
  flush();
  return out;
}

function transform(node: Nodes): void {
  if (!("children" in node)) return;
  const next: Nodes[] = [];
  let changed = false;
  for (const child of node.children as Nodes[]) {
    if (child.type === "text") {
      const parts = splitText(child.value);
      if (parts) {
        next.push(...parts);
        changed = true;
        continue;
      }
    }
    transform(child);
    if (child.type === "paragraph" && child.children.some((c) => (c as Nodes).type === "list")) {
      next.push(...splitParagraph(child));
      changed = true;
      continue;
    }
    next.push(child);
  }
  if (changed) (node as { children: Nodes[] }).children = next;
}

/**
 * Remark plugin that turns `{{list:item;item}}` into real bulleted lists.
 * Must run before `remarkWikiLinks`/`remarkRefs` so their syntax inside list
 * items is still processed.
 *
 * @example
 * remarkPlugins={[remarkGfm, remarkCellLists, remarkWikiLinks(serialSlug)]}
 */
export const remarkCellLists: Plugin<[], Root> = () => (tree) => {
  transform(tree);
};
