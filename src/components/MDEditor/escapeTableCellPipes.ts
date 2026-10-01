/** The part of mdast-util-to-markdown's handler state these helpers read. */
type ToMarkdownState = { stack: string[] };

/**
 * Escapes `|` as `\|` when a custom to-markdown handler runs inside a GFM
 * table cell. Our handlers emit `[[page|Alias]]` and `{{ref|…}}` verbatim, and
 * a bare `|` there would end the cell and split the syntax across two cells.
 * GFM removes the backslash before inline parsing, so the renderer and the
 * editor's import visitor still see the plain `|` form.
 */
export function escapeTableCellPipes(out: string, state: ToMarkdownState): string {
  return state.stack.includes("tableCell") ? out.replace(/\|/g, "\\|") : out;
}
