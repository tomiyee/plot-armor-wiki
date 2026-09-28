"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/Box";
import { Text } from "@/components/ui/Text";
import Link from "next/link";
import {
  savePageContent,
  getPageContentAtChapter,
  getParentPagesAtChapter,
  getAllSerialPagesAtChapter,
  updatePageIntroChapter,
} from "./actions";
import { DeletePageButton } from "./DeletePageButton";
import { Select } from "@/components/ui/Select";
import { useEditMode } from "@/contexts/EditModeContext";
import { Banner } from "@/components/ui/Banner";
import { WritingAsOfBanner } from "./WritingAsOfBanner";
import { PageReadView } from "./PageReadView";
import { PageTitlesPanel } from "./PageTitlesPanel";
import { PageContentEditor } from "./PageContentEditor";
import { PageInfoboxPanel } from "./PageInfoboxPanel";
import {
  PageRelationshipsPanel,
  type ParentPageEntry,
} from "./PageRelationshipsPanel";
import { SuggestionReviewPanel } from "./SuggestionReviewPanel";
import type { ChapterData, PageTitleEntry, ChapterGroupOption } from "./types";
import type { SuggestionStatus } from "@/types";

interface PageEditorProps {
  /** Slug of the serial this page belongs to. */
  serialSlug: string;
  /** URL slug of this wiki page. */
  pageSlug: string;
  /** The DB id of this page, forwarded to the new-page form as the default parent. */
  pageId: number;
  /**
   * All page_titles rows for this page, ordered by chapter idx ascending.
   * Used to render the Titles panel in edit mode.
   */
  pageTitleEntries: PageTitleEntry[];
  /** The page's merged body content at the reader's current cutoff. */
  content: string;
  /** Chapter idx the body content was last updated at, or null if never saved. */
  contentLastUpdatedChapterIdx: number | null;
  /** The page's merged infobox content at the reader's current cutoff. Empty string when absent. */
  infoboxContent: string;
  /** Chapter idx the infobox content was last updated at, or null if never saved. */
  infoboxLastUpdatedChapterIdx: number | null;
  /** null when the page has no infobox image set. */
  floaterImageUrl: string | null;
  /** All chapters for this serial, used to populate the "Writing as of:" selector. */
  allChapters: ChapterData[];
  /** The id of the head chapter (highest idx). Used as the fallback default target for saves. */
  headChapterId: number | null;
  /**
   * The chapter the reader is currently "reading up to" - set by ChapterSelector
   * and stored in a cookie. When present, this is used as the initial default for
   * the "Writing as of:" selector so editors write content that matches what they
   * just read. Falls back to headChapterId when null (no cookie present).
   */
  readingChapterId: number | null;
  /** Wiki pages visible to the reader at their chapter cutoff, used to power
   * the `[[slug]]` autocomplete in edit mode. */
  wikiPages: { name: string; slug: string }[];
  /** slug → chapter-versioned title map for resolving `[[slug]]` display text. */
  pageTitles?: Record<string, string>;
  /**
   * All chapters in the serial (name + idx), used to power the
   * `[[Chapter:Name]]` autocomplete in edit mode and resolve chapter links
   * in the markdown preview.
   */
  wikiChapters?: { name: string; idx: number }[];
  /**
   * The serial's chapter type (e.g. `"Chapter"`, `"Episode"`).
   * Required alongside `wikiChapters` to enable chapter link autocomplete
   * and routing in the editor preview.
   */
  chapterType?: string;
  /**
   * The DB id of the chapter this page was introduced in. Passed alongside
   * `introChapterIdx` so the admin intro-chapter selector can write back to
   * the server via `updatePageIntroChapter`.
   */
  introChapterId: number | null;
  /** The idx of the chapter this page was introduced in. Chapters before this are disabled in the "Writing as of:" selector. */
  introChapterIdx: number | null;
  /**
   * Child pages that are actively related to this page at the reader's chapter
   * cutoff (derived from `page_relationships`). Rendered as a sub-page list
   * below the content in read mode.
   */
  childPages: { id: number; name: string; slug: string; title: string; hasChildren: boolean }[];
  /**
   * Parent pages that are actively related to this page at the reader's chapter
   * cutoff (derived from `page_relationships`). Shown as a breadcrumb in read
   * mode and as a list in the Relationships edit panel.
   */
  parentPages: ParentPageEntry[];
  /**
   * All pages in the serial (excluding the current page) used to populate the
   * "Add parent" dropdown in the Relationships edit panel. Titles are resolved
   * at the reader's chapter cutoff so the dropdown reflects temporal renames.
   */
  allSerialPages: { id: number; title: string }[];
  /**
   * When true, hides the Titles and Relationships panels in edit mode. The home
   * page has a fixed name/slug (cannot be renamed) and is the DAG root (no
   * parents), so both panels are irrelevant there.
   */
  isHomePage?: boolean;
  /**
   * Optional slot rendered at the top of the edit-mode panel, before the
   * "Writing as of:" selector. Used by the serial home page to inject
   * admin-management UI above the content editors.
   */
  editModeHeader?: ReactNode;
  /** Optional element rendered next to the "Sub-pages" heading in read mode, visible only on hover. */
  subPagesAdornment?: ReactNode;
  /**
   * Whether the current user is an admin of this serial. When `false`, the
   * component always renders in read mode - edit controls and the edit FAB
   * are invisible to non-admins. The parent Server Component is responsible
   * for resolving this value via `isSerialAdmin`.
   */
  isAdmin?: boolean;
  /**
   * Whether the current user is authenticated (but not necessarily an admin).
   * When `true` and `isAdmin` is false, shows the "Suggest an Edit" button in
   * read mode. Resolved by the parent via `isAuthenticated()` from auth-guard.
   */
  isAuthenticated?: boolean;
  /**
   * Number of pending suggestions for this page. Shown as a badge next to the
   * edit mode controls when `isAdmin` is true and value > 0.
   */
  pendingSuggestionCount?: number;
  /**
   * Pre-fetched pending suggestions for this page, passed to `SuggestionReviewPanel`.
   * Only populated when `isAdmin` is true.
   */
  pendingSuggestions?: {
    id: number;
    proposerUsername: string | null;
    targetChapterId: number;
    targetChapterName: string;
    citation: string;
    createdAt: Date;
    currentContent: string;
    proposedContent: string | null;
    currentInfoboxContent: string;
    proposedInfoboxContent: string | null;
  }[];
  /**
   * All suggestions the current non-admin user has submitted for this page,
   * most recent first. Passed through to PageReadView for per-page status feedback.
   */
  myPageSuggestions?: {
    id: number;
    status: SuggestionStatus;
    reviewNote: string | null;
    createdAt: Date;
    targetChapterName: string;
    proposedContent: string | null;
    proposedInfoboxContent: string | null;
  }[];
}

/**
 * Renders the page body in read mode and switches to an inline edit mode with
 * an MDEditor for the body content alongside its current rendered value, and
 * a second MDEditor + image URL input for the infobox.
 * Edit mode is driven by the global `EditModeContext`; the `<EditModeFAB>`
 * triggers save and discard.
 * On save, calls the `savePageContent` Server Action which writes via SCD Type 2.
 *
 * In edit mode, the "Writing as of:" chapter selector defaults to the reader's
 * current chapter (readingChapterId) so the editor writes content that aligns
 * with where they are in the story. Changing the selection reloads draft content
 * via `getPageContentAtChapter` so the editor always sees what readers at that
 * chapter currently see.
 *
 * @example
 * <PageEditor
 *   serialSlug="one-piece"
 *   pageSlug="luffy"
 *   pageId={42}
 *   pageTitleEntries={[]}
 *   content="..."
 *   contentLastUpdatedChapterIdx={1}
 *   infoboxContent="**Age:** 19"
 *   infoboxLastUpdatedChapterIdx={1}
 *   floaterImageUrl="https://..."
 *   allChapters={[{ id: 5, displayName: '1', idx: 1, volumeName: 'Volume 1' }]}
 *   headChapterId={5}
 *   readingChapterId={3}
 *   wikiPages={[{ name: 'Luffy' }]}
 *   introChapterIdx={1}
 *   childPages={[]}
 *   parentPages={[]}
 *   allSerialPages={[]}
 * />
 */
export function PageEditor(props: PageEditorProps) {
  const {
    serialSlug,
    pageSlug,
    pageId,
    pageTitleEntries,
    content,
    contentLastUpdatedChapterIdx,
    infoboxContent,
    infoboxLastUpdatedChapterIdx,
    floaterImageUrl,
    allChapters,
    headChapterId,
    readingChapterId,
    wikiPages,
    pageTitles,
    wikiChapters,
    chapterType,
    introChapterId,
    introChapterIdx,
    childPages,
    parentPages,
    allSerialPages,
    isHomePage = false,
    editModeHeader,
    subPagesAdornment,
    isAdmin = false,
    isAuthenticated = false,
    pendingSuggestionCount: _pendingSuggestionCount = 0,
    pendingSuggestions = [],
    myPageSuggestions = [],
  } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isEditing, registerHandlers, setIsDirty } = useEditMode();

  const [draftContent, setDraftContent] = useState(content);
  const [currentContentLastUpdatedIdx, setCurrentContentLastUpdatedIdx] =
    useState(contentLastUpdatedChapterIdx);

  // Content of the revision immediately before the selected chapter's revision.
  // Populated on edit mode entry and after each chapter change. Used by the
  // "Remove revision" button in PageContentEditor.
  const [previousContent, setPreviousContent] = useState("");
  const [previousContentRevisionChapterIdx, setPreviousContentRevisionChapterIdx] =
    useState<number | null>(null);
  const [nextContentRevisionChapterIdx, setNextContentRevisionChapterIdx] =
    useState<number | null>(null);

  const [draftInfoboxContent, setDraftInfoboxContent] = useState(infoboxContent);
  const [currentInfoboxLastUpdatedIdx, setCurrentInfoboxLastUpdatedIdx] =
    useState(infoboxLastUpdatedChapterIdx);
  const [previousInfoboxContent, setPreviousInfoboxContent] = useState("");
  const [
    previousInfoboxRevisionChapterIdx,
    setPreviousInfoboxRevisionChapterIdx,
  ] = useState<number | null>(null);
  const [nextInfoboxRevisionChapterIdx, setNextInfoboxRevisionChapterIdx] =
    useState<number | null>(null);

  const [currentParentPages, setCurrentParentPages] =
    useState<ParentPageEntry[]>(parentPages);

  const [currentAllSerialPages, setCurrentAllSerialPages] = useState<
    { id: number; title: string }[]
  >(allSerialPages);

  const [draftFloaterImageUrl, setDraftFloaterImageUrl] = useState<string>(
    floaterImageUrl ?? "",
  );

  // Defaults to the reader's current chapter so writing stays in sync with what
  // the reader just read. Falls back to headChapterId when no reading chapter is set.
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    readingChapterId ?? headChapterId,
  );

  // Tracks the currently selected intro chapter in edit mode. Initialises from
  // the prop so the selector shows the current value before any changes.
  const [draftIntroChapterId, setDraftIntroChapterId] = useState<number | null>(
    introChapterId,
  );

  // Filter pending suggestions to those whose target chapter is within the admin's
  // reading cutoff. Suggestions targeting chapters beyond the cutoff could reveal
  // spoilers (the content being proposed may reference future events).
  const readingCutoffIdx =
    allChapters.find((c) => c.id === readingChapterId)?.idx ?? null;
  const visibleSuggestions = pendingSuggestions.filter((s) => {
    const targetIdx = allChapters.find((c) => c.id === s.targetChapterId)?.idx;
    return (
      readingCutoffIdx === null ||
      targetIdx === undefined ||
      targetIdx <= readingCutoffIdx
    );
  });
  const hiddenSuggestionCount =
    pendingSuggestions.length - visibleSuggestions.length;

  // Compute dirty state: true when any draft differs from the server-provided value.
  const isDirty =
    draftContent !== content ||
    draftInfoboxContent !== infoboxContent ||
    draftFloaterImageUrl !== (floaterImageUrl ?? "");

  // Propagate dirty state into EditModeContext so the navigation guard can react.
  useEffect(() => {
    setIsDirty(isDirty);
    // Reset dirty flag on unmount so the guard doesn't fire after discarding.
    return () => setIsDirty(false);
  }, [isDirty, setIsDirty]);

  // Re-sync the "Writing as of:" chapter to the reader's cutoff whenever it changes
  // outside of an active edit session. Without this, the useState init only runs on
  // first mount — subsequent cutoff changes via ChapterSelector (which triggers a
  // router.refresh()) would leave selectedChapterId stale until the user discards.
  useEffect(() => {
    if (!isEditing) {
      setSelectedChapterId(readingChapterId ?? headChapterId);
    }
  }, [readingChapterId, headChapterId, isEditing]);

  const handleDiscard = useCallback(() => {
    setDraftContent(content);
    setCurrentContentLastUpdatedIdx(contentLastUpdatedChapterIdx);
    setDraftInfoboxContent(infoboxContent);
    setCurrentInfoboxLastUpdatedIdx(infoboxLastUpdatedChapterIdx);
    setDraftFloaterImageUrl(floaterImageUrl ?? "");
    setCurrentParentPages(parentPages);
    setCurrentAllSerialPages(allSerialPages);
    setSelectedChapterId(readingChapterId ?? headChapterId);
    setDraftIntroChapterId(introChapterId);
  }, [
    content,
    contentLastUpdatedChapterIdx,
    infoboxContent,
    infoboxLastUpdatedChapterIdx,
    floaterImageUrl,
    parentPages,
    allSerialPages,
    readingChapterId,
    headChapterId,
    introChapterId,
  ]);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      await savePageContent(
        serialSlug,
        pageSlug,
        draftContent,
        draftInfoboxContent,
        draftFloaterImageUrl.trim() || null,
        selectedChapterId ?? undefined,
      );
      router.refresh();
    });
  }, [
    serialSlug,
    pageSlug,
    draftContent,
    draftInfoboxContent,
    draftFloaterImageUrl,
    selectedChapterId,
    router,
  ]);

  useEffect(() => {
    return registerHandlers({ onSave: handleSave, onDiscard: handleDiscard });
  }, [registerHandlers, handleSave, handleDiscard]);

  /**
   * Persists the intro chapter change immediately (not deferred to the page
   * save) so the spoiler gate updates as soon as the admin confirms. A
   * router.refresh() revalidates the SSR view to reflect the new gate.
   */
  function handleIntroChapterChange(chapterId: number) {
    const previousId = draftIntroChapterId;
    setDraftIntroChapterId(chapterId);
    startTransition(async () => {
      try {
        await updatePageIntroChapter(pageId, chapterId);
        router.refresh();
      } catch {
        setDraftIntroChapterId(previousId);
      }
    });
  }

  /** Applies previous/next revision metadata for both the body and infobox fields. */
  function applyRevisionMetadata(data: {
    previousContent: string;
    previousRevisionChapterIdx: number | null;
    nextRevisionChapterIdx: number | null;
    previousInfoboxContent: string;
    previousInfoboxRevisionChapterIdx: number | null;
    nextInfoboxRevisionChapterIdx: number | null;
  }) {
    setPreviousContent(data.previousContent);
    setPreviousContentRevisionChapterIdx(data.previousRevisionChapterIdx);
    setNextContentRevisionChapterIdx(data.nextRevisionChapterIdx);
    setPreviousInfoboxContent(data.previousInfoboxContent);
    setPreviousInfoboxRevisionChapterIdx(data.previousInfoboxRevisionChapterIdx);
    setNextInfoboxRevisionChapterIdx(data.nextInfoboxRevisionChapterIdx);
  }

  // When entering edit mode, prime previous/next revision metadata for the
  // initial chapter so the "Remove revision" buttons are available without
  // needing a chapter change. Subsequent chapter changes are handled by
  // handleChapterChange.
  useEffect(() => {
    if (!isEditing || selectedChapterId === null) return;
    let cancelled = false;
    getPageContentAtChapter(serialSlug, pageSlug, selectedChapterId).then(
      (data) => {
        if (!cancelled) applyRevisionMetadata(data);
      },
    );
    return () => {
      cancelled = true;
    };
    // Only re-fetch when edit mode toggles; chapter changes are handled by
    // handleChapterChange which also updates these states.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  /**
   * When the editor picks a different target chapter, fetch the content that
   * readers at that chapter currently see and replace both the reference view
   * and the draft with it so the editor can review and then overwrite it.
   * `overrides` lets `handleRemoveRevisionConfirmed` inject the
   * already-known previous content for a non-direct revision switch.
   */
  function handleChapterChange(
    chapterId: number,
    overrides?: { content?: string; infoboxContent?: string },
  ) {
    setSelectedChapterId(chapterId);
    startTransition(async () => {
      const [data, parents, serialPages] = await Promise.all([
        getPageContentAtChapter(serialSlug, pageSlug, chapterId),
        getParentPagesAtChapter(serialSlug, pageSlug, chapterId),
        getAllSerialPagesAtChapter(serialSlug, pageSlug, chapterId),
      ]);
      setDraftContent(overrides?.content ?? data.content);
      setCurrentContentLastUpdatedIdx(data.lastUpdatedChapterIdx);
      setDraftInfoboxContent(overrides?.infoboxContent ?? data.infoboxContent);
      setCurrentInfoboxLastUpdatedIdx(data.infoboxLastUpdatedChapterIdx);
      setDraftFloaterImageUrl(data.floaterImageUrl ?? "");
      applyRevisionMetadata(data);
      setCurrentParentPages(parents);
      setCurrentAllSerialPages(serialPages);
    });
  }

  function handleRemoveRevisionConfirmed(kind: "content" | "infobox") {
    const isBody = kind === "content";
    const lastUpdatedIdx = isBody
      ? currentContentLastUpdatedIdx
      : currentInfoboxLastUpdatedIdx;
    const prevContent = isBody ? previousContent : previousInfoboxContent;
    const prevRevisionChapterIdx = isBody
      ? previousContentRevisionChapterIdx
      : previousInfoboxRevisionChapterIdx;
    const isDirectRevision =
      lastUpdatedIdx !== null && lastUpdatedIdx === selectedChapterIdx;

    if (isDirectRevision) {
      if (isBody) {
        setDraftContent(prevContent);
        setCurrentContentLastUpdatedIdx(prevRevisionChapterIdx);
      } else {
        setDraftInfoboxContent(prevContent);
        setCurrentInfoboxLastUpdatedIdx(prevRevisionChapterIdx);
      }
      // Re-fetch previous/next revision metadata for the selected chapter so that
      // a second "Remove revision" click shows the correct diff rather than stale
      // data from before the first removal.
      if (selectedChapterId !== null) {
        startTransition(async () => {
          const data = await getPageContentAtChapter(
            serialSlug,
            pageSlug,
            selectedChapterId,
          );
          applyRevisionMetadata(data);
        });
      }
    } else if (lastUpdatedIdx !== null) {
      // Non-direct: the revision lives at a different chapter than the current
      // selection. Switch to that chapter so the subsequent save targets it.
      const revisionChapterId = allChapters.find(
        (c) => c.idx === lastUpdatedIdx,
      )?.id;
      if (revisionChapterId !== undefined) {
        handleChapterChange(
          revisionChapterId,
          isBody ? { content: prevContent } : { infoboxContent: prevContent },
        );
      }
    }
  }

  // Build chapter name → idx map for MarkdownRenderer
  const wikiChaptersByName = wikiChapters
    ? Object.fromEntries(wikiChapters.map((c) => [c.name, c.idx]))
    : undefined;

  if (!isAdmin || !isEditing) {
    return (
      <Box col className="gap-6">
        {isAdmin && visibleSuggestions.length > 0 && (
          <SuggestionReviewPanel
            suggestions={visibleSuggestions}
            serialSlug={serialSlug}
          />
        )}
        {isAdmin && hiddenSuggestionCount > 0 && (
          <Text
            as="div"
            className="rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
          >
            {hiddenSuggestionCount} pending{" "}
            {hiddenSuggestionCount === 1 ? "suggestion" : "suggestions"} target
            {hiddenSuggestionCount === 1 ? "s" : ""} chapters beyond your
            current reading progress - advance your chapter to review them.
          </Text>
        )}
        <PageReadView
          serialSlug={serialSlug}
          content={content}
          contentLastUpdatedChapterIdx={contentLastUpdatedChapterIdx}
          infoboxContent={infoboxContent}
          infoboxLastUpdatedChapterIdx={infoboxLastUpdatedChapterIdx}
          floaterImageUrl={floaterImageUrl}
          childPages={childPages}
          pageId={pageId}
          pageTitles={pageTitles}
          wikiChapters={wikiChaptersByName}
          chapterType={chapterType}
          suggestionContext={
            isAuthenticated
              ? {
                  isAdmin,
                  allChapters,
                  readingChapterId: readingChapterId ?? null,
                  wikiPagesList: wikiPages,
                  wikiChaptersList: wikiChapters ?? [],
                  myPageSuggestions: myPageSuggestions,
                }
              : undefined
          }
          subPagesAdornment={subPagesAdornment}
        />
      </Box>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  const selectedChapterIdx =
    allChapters.find((c) => c.id === selectedChapterId)?.idx ?? null;

  function buildChapterGroupOptions(
    isDisabled: (ch: ChapterData) => boolean,
  ): ChapterGroupOption[] {
    const volumeMap = new Map<
      string,
      { label: string; value: number; disabled: boolean }[]
    >();
    for (const ch of allChapters) {
      const arr = volumeMap.get(ch.volumeName) ?? [];
      arr.push({ label: ch.displayName, value: ch.id, disabled: isDisabled(ch) });
      volumeMap.set(ch.volumeName, arr);
    }
    return Array.from(volumeMap.entries()).map(([volumeName, chaps]) => ({
      label: volumeName,
      value: -1 as number,
      children: chaps,
    }));
  }

  // Intro chapter selector: all chapters enabled (no cutoff restriction). An
  // admin must be able to move the intro chapter to any chapter in the serial,
  // including ones beyond their personal reading progress.
  const introChapterSelectOptions = buildChapterGroupOptions(() => false);

  // Chapters before the page's intro chapter are disabled - content can't predate the page.
  // Chapters beyond the reader's cutoff are also disabled - editors can't write spoilers.
  const chapterSelectOptions = buildChapterGroupOptions(
    (ch) =>
      (introChapterIdx !== null && ch.idx < introChapterIdx) ||
      (readingCutoffIdx !== null && ch.idx > readingCutoffIdx),
  );

  return (
    <Banner scrollable={false}>
    <Box col className="gap-6">
      {allChapters.length > 0 && (
        <WritingAsOfBanner
          options={chapterSelectOptions}
          value={selectedChapterId ?? undefined}
          onChange={handleChapterChange}
          isPending={isPending}
          isDirty={isDirty}
        />
      )}

      {editModeHeader}

      {visibleSuggestions.length > 0 && (
        <SuggestionReviewPanel
          suggestions={visibleSuggestions}
          serialSlug={serialSlug}
        />
      )}
      {hiddenSuggestionCount > 0 && (
        <Text
          as="div"
          className="rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
        >
          {hiddenSuggestionCount} pending{" "}
          {hiddenSuggestionCount === 1 ? "suggestion" : "suggestions"} target
          {hiddenSuggestionCount === 1 ? "s" : ""} chapters beyond your current
          reading progress - advance your chapter to review them.
        </Text>
      )}

      <Text className="text-xs text-muted-foreground">
        Markdown and{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          [[wiki links]]
        </code>{" "}
        are supported.{" "}
        <Link
          href="/help#editing-content"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          See the guide.
        </Link>
      </Text>

      {!isHomePage && allChapters.length > 0 && (
        <Box col className="gap-2">
          <Text variant="label">Introduced in {chapterType ?? "Chapter"}</Text>
          <Select<number>
            options={introChapterSelectOptions}
            placeholder="Select a chapter…"
            value={draftIntroChapterId ?? undefined}
            onChange={handleIntroChapterChange}
            disabled={isPending}
          />
        </Box>
      )}

      {!isHomePage && (
        <PageTitlesPanel
          serialSlug={serialSlug}
          pageSlug={pageSlug}
          pageTitleEntries={pageTitleEntries}
          chapterSelectOptions={chapterSelectOptions}
          isPending={isPending}
        />
      )}

      {!isHomePage && (
        <PageRelationshipsPanel
          pageId={pageId}
          parentPages={currentParentPages}
          allSerialPages={currentAllSerialPages}
          chapterId={selectedChapterId}
        />
      )}

      <PageContentEditor
        label="Body"
        isBody
        savedContent={content}
        draftContent={draftContent}
        lastUpdatedIdx={currentContentLastUpdatedIdx}
        selectedChapterIdx={selectedChapterIdx}
        onChange={setDraftContent}
        serialSlug={serialSlug}
        wikiPages={wikiPages}
        wikiChapters={wikiChapters}
        chapterType={chapterType}
        previousRevisionContent={previousContent}
        previousRevisionChapterIdx={previousContentRevisionChapterIdx}
        onConfirmRemove={() => handleRemoveRevisionConfirmed("content")}
        allChapters={allChapters}
        nextRevisionChapterIdx={nextContentRevisionChapterIdx}
      />

      <PageInfoboxPanel
        savedContent={infoboxContent}
        draftContent={draftInfoboxContent}
        setDraftContent={setDraftInfoboxContent}
        lastUpdatedIdx={currentInfoboxLastUpdatedIdx}
        selectedChapterIdx={selectedChapterIdx}
        draftFloaterImageUrl={draftFloaterImageUrl}
        setDraftFloaterImageUrl={setDraftFloaterImageUrl}
        previousRevisionContent={previousInfoboxContent}
        previousRevisionChapterIdx={previousInfoboxRevisionChapterIdx}
        onConfirmRemove={() => handleRemoveRevisionConfirmed("infobox")}
        allChapters={allChapters}
        nextRevisionChapterIdx={nextInfoboxRevisionChapterIdx}
        serialSlug={serialSlug}
        wikiPages={wikiPages}
        wikiChapters={wikiChapters}
        chapterType={chapterType}
      />

      {!isHomePage && (
        <Box className="border-t pt-4">
          <DeletePageButton serialSlug={serialSlug} pageSlug={pageSlug} wikiPages={wikiPages} />
        </Box>
      )}

    </Box>
    </Banner>
  );
}
