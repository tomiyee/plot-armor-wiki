import type { TextMigration } from "../types";
import { formatCellList } from "@/lib/cell-lists";

const HEADER_RE = /^\*\*([^*\n]+)\*\*$/;

/** `|` would end the cell; GFM strips the backslash before inline parsing (see escapeTableCellPipes). */
function escapePipes(s: string): string {
  return s.replace(/(?<!\\)\|/g, "\\|");
}

/** Multi-line values become a `{{list:…}}` cell list, since GFM cells are single-line. */
function toCell(value: string): string {
  const lines = value
    .split("\n")
    .map((l) => l.replace(/^\s*[-*+]\s+/, "").trim())
    .filter(Boolean);
  return lines.length > 1 ? formatCellList(lines) : escapePipes(lines[0] ?? "");
}

/**
 * Converts infoboxes written as alternating `**Header**` / value paragraphs
 * into a headerless two-column table (empty `| | |` header row, which
 * MarkdownRenderer hides). Only rewrites content made entirely of such pairs;
 * anything else is left untouched.
 */
function boldPairsToTable(old: string): string {
  const blocks = old
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length < 2 || blocks.length % 2 !== 0) return old;

  const rows: string[] = [];
  for (let i = 0; i < blocks.length; i += 2) {
    const header = HEADER_RE.exec(blocks[i]);
    const value = blocks[i + 1];
    if (!header || HEADER_RE.test(value)) return old;
    rows.push(`| ${escapePipes(header[1].trim())} | ${toCell(value)} |`);
  }
  return ["| | |", "| --- | --- |", ...rows].join("\n") + "\n";
}

export const infoboxBoldPairsToTable: TextMigration = {
  id: "2026-10-18-infobox-bold-pairs-to-table",
  description:
    "Convert infoboxes of alternating **Header** / value paragraphs into a headerless two-column table.",
  targets: ["infoboxValue"],
  transform: boldPairsToTable,
};
