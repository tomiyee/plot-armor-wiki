/**
 * Builds the `pageIndex` / `pages` entries of a context.json. Shared by
 * export-context.ts (full export) and add-context.ts (append to an export).
 */
import {
  fetchActiveParentPagesAtIdx,
  fetchPageContentAtIdx,
  fetchPageInfoboxAtIdx,
  fetchSerialPageTitlesAtIdx,
  fetchSerialPagesAtIdx,
  getSerialPages,
} from "@/data/pages/queries";
import { fetchChapterSynopsis } from "@/data/chapters/queries";
import { extractPageLinks } from "./core.mjs";

/** Title, slug and other names of a page, as of the export chapter. */
export type PageNames = { title: string; slug: string; aliases: string[] };

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, word-boundary (Unicode-aware) mention test. */
export function mentions(textLower: string, term: string) {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return false;
  if (!textLower.includes(t)) return false; // cheap pre-filter
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(t)}(?![\\p{L}\\p{N}])`, "u").test(textLower);
}

/** Words too common to count as a partial title match ("The Wandering Inn" must not match "the"). */
const STOPWORDS = new Set(["a", "an", "the", "of", "and", "in", "on", "at", "to", "for", "with", "by", "from", "his", "her", "its"]);

/** Title words (3+ letters, not stopwords) that the chapter mentions. */
function partialMatches(textLower: string, n: PageNames) {
  const words = new Set(
    [n.title, ...n.aliases].flatMap((t) => t.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
  return [...words].filter((w) => mentions(textLower, w));
}

export function firstLine(md: string) {
  const line = md.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#")) ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

/**
 * Adds the parents of `seed` (recursively, only pages in `names`) and returns
 * every included id with its first parent. Parents are read at idx N, so a
 * later re-parenting never leaks.
 */
export async function withParents(seed: Iterable<number>, names: Map<number, PageNames>, N: number) {
  const parentOf = new Map<number, number | null>();
  const included = new Set(seed);
  const queue = [...included];
  while (queue.length) {
    const id = queue.pop()!;
    const parents = await fetchActiveParentPagesAtIdx(id, N);
    parentOf.set(id, parents[0]?.id ?? null);
    for (const par of parents) {
      if (!included.has(par.id) && names.has(par.id)) {
        included.add(par.id);
        queue.push(par.id);
      }
    }
  }
  return parentOf;
}

/**
 * Reads each page's body and infobox at idx N and returns the matching
 * `pageIndex` and `pages` entries, sorted by id.
 *
 * @example
 * const parentOf = await withParents(ids, names, N);
 * const { pageIndex, pages } = await buildContextPages(parentOf, names, N, { introducedHere, forced });
 */
export async function buildContextPages(
  parentOf: Map<number, number | null>,
  names: Map<number, PageNames>,
  N: number,
  flags: { introducedHere: Set<number>; forced: Set<number>; related?: Map<number, string[]> },
) {
  const ids = [...parentOf.keys()].sort((a, b) => a - b);
  const bodies = await Promise.all(
    ids.map(async (id) => {
      const [content, infobox] = await Promise.all([
        fetchPageContentAtIdx(id, N),
        fetchPageInfoboxAtIdx(id, N),
      ]);
      // A revision already written at this chapter may have dropped facts from
      // the one before it, so export that earlier state too: edits propagate
      // forward, and anything lost here would vanish from every later chapter.
      // Body and infobox are revised independently, so each only gets its
      // earlier state when that field itself has a revision at this chapter.
      const [prevContent, prevInfobox] = await Promise.all([
        content.lastUpdatedChapterIdx === N ? fetchPageContentAtIdx(id, N - 1) : null,
        infobox.lastUpdatedChapterIdx === N ? fetchPageInfoboxAtIdx(id, N - 1) : null,
      ]);
      const previous: { content?: string; infobox?: string } = {};
      // "" when the revision at this chapter is the field's first one.
      if (prevContent) previous.content = prevContent.lastUpdatedChapterIdx != null ? prevContent.content : "";
      if (prevInfobox) previous.infobox = prevInfobox.lastUpdatedChapterIdx != null ? prevInfobox.content : "";
      return {
        id,
        content: content.content,
        infobox: infobox.content,
        previous: Object.keys(previous).length ? previous : null,
      };
    }),
  );
  const pages = bodies.map((b) => ({
    id: b.id,
    title: names.get(b.id)!.title,
    content: b.content,
    infobox: b.infobox,
    ...(b.previous && { previous: b.previous }),
  }));
  const pageIndex = bodies.map((b) => ({
    id: b.id,
    title: names.get(b.id)!.title,
    slug: names.get(b.id)!.slug,
    aliases: names.get(b.id)!.aliases,
    parentId: parentOf.get(b.id) ?? null,
    introducedAtChapter: flags.introducedHere.has(b.id),
    ...(flags.forced.has(b.id) && { includedByAdmin: true }),
    ...(flags.related?.has(b.id) && !flags.forced.has(b.id) && { relatedBy: [...new Set(flags.related.get(b.id))] }),
    firstLine: firstLine(b.content),
  }));
  return { pageIndex, pages };
}

/**
 * Names of every page visible at idx N (spoiler-safe title history), plus a
 * resolver for admin-requested slugs. A requested page not yet visible at N is
 * named by its current name; its content still comes from revisions at or before N.
 */
export async function loadPageNames(serialId: number, N: number) {
  const [visible, titleRows] = await Promise.all([
    fetchSerialPagesAtIdx(serialId, N),
    fetchSerialPageTitlesAtIdx(serialId, N),
  ]);
  const titlesByPage = new Map<number, string[]>();
  for (const r of titleRows) {
    const list = titlesByPage.get(r.pageId) ?? [];
    list.push(r.title);
    titlesByPage.set(r.pageId, list);
  }
  const names = new Map<number, PageNames>();
  for (const p of visible) {
    const history = titlesByPage.get(p.id) ?? [];
    const title = history.at(-1) ?? p.name;
    const aliases = [...new Set([p.name, ...history].filter((t) => t !== title))];
    names.set(p.id, { title, slug: p.slug, aliases });
  }

  /** Adds the pages with these slugs to `names`; returns their ids. Throws on an unknown slug. */
  const include = async (slugs: string[]) => {
    if (!slugs.length) return new Set<number>();
    const live = new Map((await getSerialPages(serialId)).map((p) => [p.slug, p]));
    const unknown = slugs.filter((s) => !live.has(s));
    if (unknown.length) throw new Error(`--include: no live page with slug ${unknown.join(", ")}`);
    const ids = new Set<number>();
    for (const slug of slugs) {
      const p = live.get(slug)!;
      if (!names.has(p.id)) names.set(p.id, { title: p.name, slug: p.slug, aliases: [] });
      ids.add(p.id);
    }
    return ids;
  };
  return { visible, names, include };
}

/** Why a page is related to the chapter, for pages the exact-title match missed. */
export type Candidate = {
  id: number;
  title: string;
  slug: string;
  firstLine: string;
  /** `synopsis:<chapter>` / `linkedFrom:<slug>` / `titleWord:<word>`. */
  reasons: string[];
};

/**
 * Finds pages the exact title match missed, from three signals read at idx N:
 * links in the synopses of the last `synopsisChapters` chapters, links in the
 * matched pages' content (one hop), and title words the chapter mentions.
 *
 * Returns `include` (pages to export in full: linked from a recent synopsis,
 * or backed by two signals) and `candidates` (the rest, ranked, for the skill
 * to pull in with add-context.ts if it needs them).
 */
export async function findRelatedPages(opts: {
  names: Map<number, PageNames>;
  matched: Set<number>;
  homeId: number | null;
  textLower: string;
  N: number;
  /** Chapters before N, oldest first. */
  previousChapters: { id: number; displayName: string }[];
  synopsisChapters?: number;
  maxCandidates?: number;
}) {
  const { names, matched, homeId, textLower, N, previousChapters, synopsisChapters = 3, maxCandidates = 30 } = opts;
  const bySlug = new Map([...names].map(([id, n]) => [n.slug, id]));
  const reasons = new Map<number, string[]>();
  const add = (id: number | undefined, why: string) => {
    if (id === undefined || id === homeId || matched.has(id)) return;
    reasons.set(id, [...(reasons.get(id) ?? []), why]);
  };

  const recent = previousChapters.slice(-synopsisChapters);
  const synopses = await Promise.all(recent.map((c) => fetchChapterSynopsis(c.id)));
  const fromSynopsis = new Set<number>();
  recent.forEach((c, i) => {
    for (const slug of extractPageLinks(synopses[i] ?? "")) {
      const id = bySlug.get(slug);
      add(id, `synopsis:${c.displayName}`);
      if (id !== undefined) fromSynopsis.add(id);
    }
  });

  const matchedContent = await Promise.all([...matched].map(async (id) => [id, (await fetchPageContentAtIdx(id, N)).content] as const));
  for (const [id, md] of matchedContent)
    for (const slug of new Set<string>(extractPageLinks(md))) add(bySlug.get(slug), `linkedFrom:${names.get(id)!.slug}`);

  for (const [id, n] of names) for (const w of partialMatches(textLower, n)) add(id, `titleWord:${w}`);

  const kinds = (r: string[]) => new Set(r.map((x) => x.slice(0, x.indexOf(":")))).size;
  const include = new Set<number>();
  for (const [id, r] of reasons) if (fromSynopsis.has(id) || kinds(r) >= 2) include.add(id);

  const rest = [...reasons].filter(([id]) => !include.has(id)).sort((a, b) => kinds(b[1]) - kinds(a[1]) || b[1].length - a[1].length).slice(0, maxCandidates);
  const candidates: Candidate[] = await Promise.all(
    rest.map(async ([id, r]) => ({
      id,
      title: names.get(id)!.title,
      slug: names.get(id)!.slug,
      firstLine: firstLine((await fetchPageContentAtIdx(id, N)).content),
      reasons: [...new Set(r)],
    })),
  );
  return { include, reasons, candidates };
}
