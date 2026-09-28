/**
 * Shared parsing/formatting for `{{ref|token|quote=…|quote=…}}` citations.
 *
 * Quotes are optional and repeatable. Characters that would break the
 * surrounding syntax or be interpreted as markdown (`|`, `}`, `*`, `[`, …)
 * are percent-encoded in the stored markdown, so the raw citation always
 * survives remark parsing as a single text node.
 */

/** Matches a whole ref citation; group 1 is the body after `ref|`. */
export const REF_RE = /\{\{ref\|([^}]+)\}\}/g;

/** Matches a line containing only `{{refbox}}`. */
export const REFBOX_LINE_RE = /^[ \t]*\{\{refbox\}\}[ \t]*$/gm;

const QUOTE_PREFIX = "quote=";
const QUOTE_UNSAFE_RE = /[%|{}*_[\]`<>&~\\\r\n]/g;

/** A parsed ref citation: the cited target plus zero or more supporting quotes. */
export type RefCitation = {
  /** Target in `category:value` form, e.g. `page:luffy` or `Chapter:Chapter 5`. */
  token: string;
  /** Exact quotes attached to this citation, in authoring order. */
  quotes: string[];
};

// Percent-encodes characters that would break the ref syntax or be parsed as
// markdown. Newlines collapse to spaces.
function encodeRefQuote(quote: string): string {
  return quote
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(
      QUOTE_UNSAFE_RE,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
    );
}

function decodeRefQuote(raw: string): string {
  return raw.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/**
 * Parses the body of a ref citation (the part after `{{ref|`).
 *
 * @example
 * parseRefBody("Chapter:Chapter 5|quote=I'll be king!")
 * // → { token: "Chapter:Chapter 5", quotes: ["I'll be king!"] }
 */
export function parseRefBody(body: string): RefCitation {
  const [tokenRaw, ...params] = body.split("|");
  const quotes = params
    .map((p) => p.trim())
    .filter((p) => p.startsWith(QUOTE_PREFIX))
    .map((p) => decodeRefQuote(p.slice(QUOTE_PREFIX.length)).trim())
    .filter(Boolean);
  return { token: tokenRaw.trim(), quotes };
}

/**
 * Serializes a citation back to `{{ref|…}}` markdown. Empty quotes are dropped.
 *
 * @example
 * formatRef({ token: "page:luffy", quotes: ["Gum-Gum!"] })
 * // → "{{ref|page:luffy|quote=Gum-Gum!}}"
 */
export function formatRef(ref: RefCitation): string {
  const params = ref.quotes
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => `|${QUOTE_PREFIX}${encodeRefQuote(q)}`)
    .join("");
  return `{{ref|${ref.token}${params}}}`;
}

/**
 * Returns every ref citation in `markdown`, in document order (duplicates kept).
 *
 * @example
 * extractRefCitations("A{{ref|page:a}} B{{ref|page:a|quote=x}}").length // → 2
 */
export function extractRefCitations(markdown: string): RefCitation[] {
  const out: RefCitation[] = [];
  for (const m of markdown.matchAll(REF_RE)) out.push(parseRefBody(m[1]));
  return out;
}
