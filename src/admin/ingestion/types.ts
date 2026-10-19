/**
 * Shapes of the `.ingest/<chapter>/` working files (see
 * `.claude/skills/ingest-chapter/proposals.schema.json`) and of the
 * per-proposal review items built from them.
 */

/** One quote from the chapter that backs a proposal. */
export type IngestCitation = { quote: string; note?: string };

/** A quote after checking it against the chapter text. */
export type VerifiedCitation = IngestCitation & { verified: boolean };

/** One edit operation of a page update. */
export type EditOp =
  | { op: "append"; text: string }
  | { op: "insert_after"; anchor: string; text: string }
  | { op: "replace"; find: string; with: string };

/** A proposed page that does not exist yet. */
export type NewPageProposal = {
  tempId: string;
  title: string;
  aliases: string[];
  /** Existing page id, a proposed tempId, or omitted for the serial home page. */
  parentPageId?: number | string | null;
  content: string;
  infobox?: string;
  changeSummary: string;
  citations: IngestCitation[];
};

/** A proposed change to an existing page. */
export type PageUpdateProposal = {
  pageId: number;
  importance: "major" | "minor";
  edits?: EditOp[];
  infobox?: string;
  changeSummary: string;
  citations: IngestCitation[];
};

/** Contents of `proposals.json`. */
export type Proposals = {
  v: 1;
  chapterId: number;
  contextSha256: string;
  promptVersion: string;
  synopsis: { content: string; citations: IngestCitation[] } | null;
  newPages: NewPageProposal[];
  updates: PageUpdateProposal[];
};

/** A page in the spoiler-filtered index of `context.json`. */
export type ContextIndexPage = {
  id: number;
  slug: string;
  title: string;
  aliases: string[];
};

/** A page whose text is included in `context.json`. */
export type ContextPage = {
  id: number;
  title: string;
  content: string;
  infobox?: string | null;
  /** Body/infobox at the chapter before, when a revision already exists at this chapter. */
  previous?: { content?: string; infobox?: string } | null;
};

/** Contents of `context.json` (only the fields the review and validator read). */
export type IngestContext = {
  /** Database the context was exported from (`DB_ENV`); missing in older exports. */
  dbEnv?: "dev" | "prod";
  serial: { id: number; slug: string; name: string };
  chapter: { id: number; idx: number; displayName: string; refToken?: string };
  source: { url: string; title: string };
  homePageId: number | null;
  chapterText: string;
  existingSynopsis?: string | null;
  pageIndex: ContextIndexPage[];
  pages: ContextPage[];
};

/** Where a `[[page:…]]` link points: an existing page, or a proposed new page. */
export type LinkTarget = { pageId: number; live?: boolean } | { tempId: string };

/** A live (non-deleted) page of the serial, used to resolve links outside the index. */
export type LivePage = { id: number; slug: string };

/** Kind of a review item. */
export type IngestItemKind = "synopsis" | "new_page" | "page_update";

/** One reviewable proposal with its validation results. */
export type IngestItem = {
  kind: IngestItemKind;
  /** Stable key: `synopsis`, `new:<tempId>` or `update:<pageId>`. */
  key: string;
  proposal: NewPageProposal | PageUpdateProposal | { content: string; citations: IngestCitation[] };
  title?: string;
  /** Live text the proposal was made against. */
  base?: string;
  /** Proposed body. */
  body: string;
  /** Proposed infobox markdown, or null when the proposal leaves the infobox alone. */
  infobox: string | null;
  infoboxBase: string | null;
  /** Page updates: body/infobox as of the chapter before, which the review diff compares against. */
  diffBase?: string;
  infoboxDiffBase?: string;
  bodyChanged?: boolean;
  citations: VerifiedCitation[];
  links: { name: string; target: LinkTarget | null }[];
  editErrors: string[];
};

/** One entry of the `decisions.json` audit log. */
export type IngestDecision = {
  key: string;
  kind: IngestItemKind;
  action: "approve" | "reject";
  proposal: unknown;
  finalText: string | null;
  finalInfobox: string | null;
  edited: boolean;
  createdPageId?: number;
  dryRun: boolean;
  /** Database the decision was applied to; missing in older logs. */
  dbEnv?: "dev" | "prod";
  promptVersion: string;
  decidedAt: string;
};
