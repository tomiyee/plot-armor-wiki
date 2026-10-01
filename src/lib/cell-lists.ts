/**
 * Shared parsing/formatting for `{{list:item;item}}` bulleted lists.
 *
 * GFM table cells hold only inline content, so a real markdown list cannot
 * live in one. Raw `<ul>` HTML is not an option either: MDXEditor parses
 * markdown as MDX and would turn it into JSX it cannot handle. This compact
 * syntax keeps the list on one line inside the cell, and uses `;` rather than
 * `|` between items because `|` would end the table cell. Characters that would
 * break the syntax or be parsed as markdown are percent-encoded, so the whole
 * list survives remark parsing as a single text node.
 */

/** Matches a whole cell list; group 1 is the body after `list:`. */
export const CELL_LIST_RE = /\{\{list:([^}]*)\}\}/g;

// `|` must be encoded too: inside a table row it would end the cell.
const ITEM_UNSAFE_RE = /[%|;{}*_[\]`<>&~\\:@]/g;

function encodeItem(item: string): string {
  return item
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim()
    .replace(
      ITEM_UNSAFE_RE,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
    );
}

function decodeItem(raw: string): string {
  return raw.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/**
 * Parses the body of a cell list (the part after `{{list:`). Empty items are dropped.
 *
 * @example
 * parseCellListBody("Gum%3AGum;Haki") // → ["Gum:Gum", "Haki"]
 */
export function parseCellListBody(body: string): string[] {
  return body
    .split(";")
    .map((raw) => decodeItem(raw).trim())
    .filter(Boolean);
}

/**
 * Serializes items back to `{{list:…}}` markdown. Empty items are dropped.
 *
 * @example
 * formatCellList(["[[page:luffy]]", "Zoro"]) // → "{{list:%5B%5Bpage%3Aluffy%5D%5D;Zoro}}"
 */
export function formatCellList(items: string[]): string {
  const encoded = items.map(encodeItem).filter(Boolean);
  return `{{list:${encoded.join(";")}}}`;
}

/**
 * Replaces each `{{list:…}}` with its decoded items, space-separated. Used where
 * raw markdown is scanned for other syntax (e.g. ref citations) that may be
 * nested, encoded, inside a list item.
 */
export function expandCellLists(markdown: string): string {
  return markdown.replace(CELL_LIST_RE, (_m, body: string) =>
    parseCellListBody(body).join(" "),
  );
}
