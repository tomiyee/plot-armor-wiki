"use client";

import { useMemo, useRef, useState, useCallback, useEffect, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import type { MDXEditorMethods, RealmPlugin } from "@mdxeditor/editor";
import {
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  codeBlockPlugin,
  toolbarPlugin,
  diffSourcePlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  UndoRedo,
  ListsToggle,
  InsertTable,
  InsertThematicBreak,
  DiffSourceToggleWrapper,
  CodeToggle,
  Separator,
} from "@mdxeditor/editor";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  getNearestEditorFromDOMNode,
} from "lexical";
import { MDXEditorClient } from "./MDXEditor";
import { WikiLinkContext } from "./WikiLinkContext";
import { InsertWikiLinkButton } from "./InsertWikiLinkButton";
import { WikiLinkNode, $isWikiLinkNode } from "./WikiLinkNode";
import { WikiLinkEditPopover } from "./WikiLinkEditPopover";
import { wikiPlugin, wikiLinkToMarkdownExtension } from "./WikiLinkVisitors";
import { RefContext } from "./RefContext";
import { InsertRefButton } from "./InsertRefButton";
import { RefNode, $isRefNode } from "./RefNode";
import { RefEditPopover } from "./RefEditPopover";
import { refPlugin, refToMarkdownExtension } from "./RefVisitors";
import { normalizeMarkdown, prepareMarkdownForEditor } from "./normalizeMarkdown";
import {
  useApplySuggestion,
  type Suggestion,
  type SuggestionKind,
} from "./useApplySuggestion";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface WikiPage {
  /** Display title of the wiki page, used for filtering and shown in the dropdown. */
  name: string;
  /** URL slug used as the `[[slug]]` token inserted on selection. */
  slug: string;
}

interface WikiChapter {
  /** Chapter display name (e.g. "Chapter 5"), used for filtering and shown in the dropdown. */
  name: string;
  /** Numeric chapter idx, used to verify the chapter exists. */
  idx: number;
}

type WikiLinkMDEditorProps = {
  /** Current markdown content. */
  value: string;
  /** Called when content changes. */
  onChange: (val: string | undefined) => void;
  /** Editor height in pixels. */
  height?: number;
  /**
   * Kept for API compatibility with existing callers. Has no effect: MDXEditor
   * is always WYSIWYG; a "Source" toggle in the toolbar gives access to raw markdown.
   */
  preview?: "edit" | "live" | "preview";
  /** All wiki pages visible to the reader at their current chapter cutoff. */
  wikiPages: WikiPage[];
  /** Slug of the serial being edited - used to build preview links. */
  serialSlug: string;
  /**
   * All chapters for this serial. When provided, typing `[[` also shows chapter
   * suggestions as a separate group. Selecting one inserts
   * `[[{chapterType}:{displayName}]]`.
   */
  wikiChapters?: WikiChapter[];
  /**
   * The serial's chapter type label (e.g. `"Chapter"`, `"Episode"`).
   * Required when `wikiChapters` is provided so the correct namespace prefix
   * is inserted (`[[Episode:Episode 3]]` vs `[[Chapter:Chapter 5]]`).
   */
  chapterType?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reads token and alias from a WikiLinkNode by key; returns null if not found. */
function readWikiLinkTokenAlias(
  lexEditor: ReturnType<typeof getNearestEditorFromDOMNode>,
  nodeKey: string,
): { token: string; alias: string } | null {
  let token = "";
  let alias = "";
  lexEditor!.read(() => {
    const node = $getNodeByKey(nodeKey);
    if ($isWikiLinkNode(node)) {
      token = node.__token;
      alias = node.__alias ?? "";
    }
  });
  return token ? { token, alias } : null;
}

/**
 * Inserts a WikiLinkNode at the current cursor selection in the given Lexical
 * editor without replacing any `[[` fragment - suitable for toolbar-triggered
 * insertion where there is no autocomplete fragment to replace.
 */
function insertWikiLinkAtCursor(
  token: string,
  alias: string | undefined,
  lexEditor: ReturnType<typeof getNearestEditorFromDOMNode>,
) {
  lexEditor!.update(() => {
    const sel = $getSelection();
    if ($isRangeSelection(sel)) {
      sel.insertNodes([new WikiLinkNode(token, alias)]);
    }
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Wraps MDXEditor (WYSIWYG) with `[[Page]]` wiki link autocomplete and chip
 * rendering for existing wiki links.
 *
 * Autocomplete is triggered by typing `[[` anywhere in the editor. The dropdown
 * filters pages and chapters by name (substring match) as the user types and is
 * positioned at the cursor's pixel location via the DOM Selection API.
 *
 * Selecting a suggestion replaces the open `[[…` fragment with a `WikiLinkNode`
 * chip via Lexical's `editor.update()` + `selection.setTextNodeRange` +
 * `selection.insertNodes`, placing the cursor immediately after the chip
 * rather than at end-of-document.
 *
 * Existing `[[token]]` patterns in loaded markdown are automatically converted
 * to chips by the `WikiLinkTextVisitor` import visitor (priority 1).
 *
 * The `preview` prop is accepted for API compatibility but has no effect:
 * MDXEditor is always WYSIWYG. A "Source" toggle in the toolbar allows raw
 * markdown editing when needed.
 *
 * @example
 * <WikiLinkMDEditor
 *   value={draft}
 *   onChange={(v) => setDraft(v ?? "")}
 *   wikiPages={wikiPages}
 *   wikiChapters={chapters}
 *   chapterType="Chapter"
 *   serialSlug="one-piece"
 * />
 */
export function WikiLinkMDEditor(props: WikiLinkMDEditorProps) {
  const {
    value,
    onChange,
    height = 300,
    wikiPages,
    wikiChapters = [],
    chapterType,
  } = props;

  // Sync MDXEditor's built-in .dark class with the app's class-based theme.
  // next-themes returns undefined during SSR, so we gate on hasMounted to
  // avoid hydration mismatches. After mount, resolvedTheme is always defined.
  const { resolvedTheme } = useTheme();
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isDark = hasMounted && resolvedTheme === "dark";

  const editorRef = useRef<MDXEditorMethods>(null);
  // prepareMarkdownForEditor doubles backslashes for CommonMark safety; that
  // format must NOT be used as the diff baseline because the editor emits the
  // un-doubled form on onChange. normalizeMarkdown(value) matches the save-path
  // format, so the diff shows real content changes instead of escape artifacts.
  const [initialValue] = useState(() => prepareMarkdownForEditor(value));
  const [diffBaseline] = useState(() => normalizeMarkdown(value));
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // State for the wiki link edit/insert popover. nodeKey is null for toolbar insert mode.
  const [editState, setEditState] = useState<{
    nodeKey: string | null;
    anchorEl: HTMLElement;
    initialToken: string;
    initialAlias: string;
    autoFocusAlias: boolean;
  } | null>(null);

  // State for the ref edit/insert popover. nodeKey is null for toolbar insert mode.
  const [refEditState, setRefEditState] = useState<{
    nodeKey: string | null;
    anchorEl: HTMLElement;
    initialToken: string;
  } | null>(null);

  useEffect(() => {
    listboxRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function closeSuggestions() {
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(0);
    setDropdownPos(null);
  }

  // Stable ref that always points to the latest handleAfterInsert callback.
  // Avoids a forward-reference issue since handleAfterInsert is defined below.
  type AfterInsertFn = (nodeKey: string, el: HTMLElement) => void;
  const onAfterInsertRef = useRef<AfterInsertFn | undefined>(undefined);

  const { applySuggestion, isApplyingRef, lastEmittedRef, prevValueRef } =
    useApplySuggestion({
      containerRef,
      editorRef,
      value,
      closeSuggestions,
      chapterType,
      onChange,
      onAfterInsert: useCallback((nodeKey: string, el: HTMLElement) => {
        onAfterInsertRef.current?.(nodeKey, el);
      }, []),
    });

  /**
   * Called on every MDXEditor onChange event. Normalizes the escaped `\[\[`
   * sequences produced by mdast-util-to-markdown before trigger detection.
   *
   * Reads the Lexical text node's content up to the cursor position so that
   * `[[links]]` elsewhere in the document don't interfere with trigger detection.
   * Falls back to full-document markdown analysis when the Lexical editor is
   * not yet mounted.
   */
  const handleChange = useCallback(
    (rawMarkdown: string) => {
      const markdown = normalizeMarkdown(rawMarkdown).trimEnd();
      lastEmittedRef.current = markdown;
      prevValueRef.current = markdown;
      onChange(markdown);

      if (isApplyingRef.current) return;

      // Resolve the text before the cursor inside the active Lexical text node.
      // This is cursor-aware: only the text in the current node up to the caret
      // is examined, so existing [[closed]] links after the cursor are invisible.
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;

      let triggerText: string | null = null;

      if (lexEditor) {
        lexEditor.read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const anchor = sel.anchor;
          const anchorNode = anchor.getNode();
          if (!$isTextNode(anchorNode)) return;

          const textBefore = anchorNode
            .getTextContent()
            .slice(0, anchor.offset);
          const lastOpen = textBefore.lastIndexOf("[[");
          if (lastOpen === -1) return;
          const fragment = textBefore.slice(lastOpen + 2);
          if (fragment.includes("]]")) return;
          triggerText = fragment;
        });
      } else {
        // Fallback: scan the full markdown string (cursor position unknown).
        const lastOpen = markdown.lastIndexOf("[[");
        if (lastOpen !== -1 && markdown.indexOf("]]", lastOpen) === -1) {
          triggerText = markdown.slice(lastOpen + 2);
        }
      }

      if (triggerText === null) {
        closeSuggestions();
        return;
      }

      const colonIdx = (triggerText as string).indexOf(":");
      const prefixTyped =
        colonIdx !== -1 ? triggerText.slice(0, colonIdx).toLowerCase() : null;
      const query = (
        colonIdx !== -1 ? triggerText.slice(colonIdx + 1) : triggerText
      ).toLowerCase();

      const isChapterPrefix =
        prefixTyped !== null &&
        chapterType !== undefined &&
        prefixTyped === chapterType.toLowerCase();
      const isExplicitPagePrefix = prefixTyped === "page";
      const showPages = prefixTyped === null || isExplicitPagePrefix;
      const showChapters = prefixTyped === null || isChapterPrefix;

      const pageSuggestions: Suggestion[] = showPages
        ? wikiPages
            .filter((p) => p.name.toLowerCase().includes(query))
            .map((p) => ({
              kind: "page" as SuggestionKind,
              name: p.name,
              slug: p.slug,
            }))
        : [];

      const chapterSuggestions: Suggestion[] =
        showChapters && wikiChapters.length > 0
          ? wikiChapters
              .filter((c) => c.name.toLowerCase().includes(query))
              .map((c) => ({
                kind: "chapter" as SuggestionKind,
                name: c.name,
                slug: c.name,
              }))
          : [];

      const next: Suggestion[] = [...pageSuggestions, ...chapterSuggestions];

      if (next.length === 0) {
        closeSuggestions();
        return;
      }

      setSuggestions(next);
      setActiveIndex(0);
      setIsOpen(true);
      setDropdownPos(getCursorPos(containerRef.current));
    },
    [
      lastEmittedRef,
      prevValueRef,
      onChange,
      isApplyingRef,
      chapterType,
      wikiPages,
      wikiChapters,
    ],
  );

  /**
   * Focuses the Lexical contenteditable element via DOM traversal.
   * Exposed via WikiLinkContext so toolbar components can return focus to the
   * editor after a popover interaction without holding a Lexical editor ref.
   */
  const focusEditor = useCallback(() => {
    const editorEl = containerRef.current?.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;
    lexEditor?.focus();
  }, []);

  /**
   * Opens the insert-wiki-link popover anchored to the toolbar button element.
   * Rendering happens here (outside MDXEditor's DOM) so popover styling is
   * consistent with chip-click edits, which also render at this level.
   */
  const openInsertMenu = useCallback((anchorEl: HTMLElement, selectedText = "") => {
    setEditState({
      nodeKey: null, anchorEl, initialToken: "", initialAlias: selectedText, autoFocusAlias: false,
    });
  }, []);

  /**
   * Opens the edit popover for an existing WikiLinkNode.
   * Called from WikiLinkChip onClick via WikiLinkContext so chips can request
   * an edit without owning Lexical state themselves.
   */
  const openEditMenu = useCallback(
    (nodeKey: string, anchorEl: HTMLElement) => {
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;
      if (!lexEditor) return;
      const read = readWikiLinkTokenAlias(lexEditor, nodeKey);
      if (!read) return;
      setEditState({
        nodeKey,
        anchorEl,
        initialToken: read.token,
        initialAlias: read.alias,
        autoFocusAlias: false,
      });
    },
    [],
  );

  /**
   * Called by useApplySuggestion after autocomplete insertion so the user can
   * optionally customise the alias before the cursor returns to the editor.
   * Assigned to onAfterInsertRef so useApplySuggestion can call it without a
   * forward-reference problem.
   */
  const handleAfterInsert = useCallback(
    (nodeKey: string, anchorEl: HTMLElement) => {
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;
      if (!lexEditor) return;
      const read = readWikiLinkTokenAlias(lexEditor, nodeKey);
      if (!read) return;
      setEditState({
        nodeKey, anchorEl, initialToken: read.token, initialAlias: read.alias, autoFocusAlias: true,
      });
    },
    [],
  );
  // Keep the stable ref in sync with the latest callback.
  useEffect(() => {
    onAfterInsertRef.current = handleAfterInsert;
  });

  /**
   * Inserts a `[[token]]` WikiLinkNode at the current Lexical cursor position.
   * Exposed via WikiLinkContext so InsertWikiLinkButton (inside the MDXEditor
   * plugin subtree) can trigger an insertion without DOM traversal.
   *
   * Falls back to appending to the end of the document via setMarkdown when the
   * Lexical editor is not reachable from the DOM.
   */
  const insertWikiLink = useCallback(
    (token: string, alias?: string) => {
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;

      if (lexEditor) {
        isApplyingRef.current = true;
        insertWikiLinkAtCursor(token, alias, lexEditor);
        requestAnimationFrame(() => {
          isApplyingRef.current = false;
        });
        return;
      }

      // Fallback: append at end of document via setMarkdown.
      const current = lastEmittedRef.current;
      const linkText = alias ? `[[${token}|${alias}]]` : `[[${token}]]`;
      const newMarkdown = current ? `${current}\n${linkText}` : linkText;
      isApplyingRef.current = true;
      editorRef.current?.setMarkdown(newMarkdown);
      lastEmittedRef.current = newMarkdown;
      prevValueRef.current = newMarkdown;
      onChange(newMarkdown);
      requestAnimationFrame(() => {
        isApplyingRef.current = false;
      });
    },
    [isApplyingRef, lastEmittedRef, onChange, prevValueRef],
  );

  /**
   * Applies an edited token/alias to an existing WikiLinkNode in place,
   * or inserts a new one when opened from the toolbar button (nodeKey === null).
   */
  const handleEditConfirm = useCallback(
    (token: string, alias: string | undefined) => {
      if (!editState) return;
      const { nodeKey } = editState;
      setEditState(null);

      if (nodeKey === null) {
        insertWikiLink(token, alias);
        requestAnimationFrame(() => focusEditor());
        return;
      }

      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;
      if (!lexEditor) return;

      isApplyingRef.current = true;
      lexEditor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isWikiLinkNode(node)) {
          const writable = node.getWritable();
          writable.__token = token;
          writable.__alias = alias;
        }
      });
      requestAnimationFrame(() => {
        isApplyingRef.current = false;
        lexEditor.focus();
      });
    },
    [editState, isApplyingRef, insertWikiLink, focusEditor],
  );

  // ── Ref insert / edit callbacks ──────────────────────────────────────────────

  /**
   * Opens the insert-ref popover anchored to the toolbar button element.
   */
  const openRefInsertMenu = useCallback((anchorEl: HTMLElement) => {
    setRefEditState({ nodeKey: null, anchorEl, initialToken: "" });
  }, []);

  /**
   * Opens the edit popover for an existing RefNode.
   * Called from RefChip onClick via RefContext.
   */
  const openRefEditMenu = useCallback(
    (nodeKey: string, anchorEl: HTMLElement) => {
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;
      if (!lexEditor) return;
      let token = "";
      lexEditor.read(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isRefNode(node)) token = node.__token;
      });
      if (!token) return;
      setRefEditState({ nodeKey, anchorEl, initialToken: token });
    },
    [],
  );

  /**
   * Inserts a `{{ref|token}}` RefNode at the current Lexical cursor position.
   */
  const insertRef = useCallback(
    (token: string) => {
      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;

      if (lexEditor) {
        isApplyingRef.current = true;
        lexEditor.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            sel.insertNodes([new RefNode(token)]);
          }
        });
        requestAnimationFrame(() => {
          isApplyingRef.current = false;
        });
        return;
      }

      // Fallback: append at end of document.
      const current = lastEmittedRef.current;
      const refText = `{{ref|${token}}}`;
      const newMarkdown = current ? `${current}\n${refText}` : refText;
      isApplyingRef.current = true;
      editorRef.current?.setMarkdown(newMarkdown);
      lastEmittedRef.current = newMarkdown;
      prevValueRef.current = newMarkdown;
      onChange(newMarkdown);
      requestAnimationFrame(() => {
        isApplyingRef.current = false;
      });
    },
    [isApplyingRef, lastEmittedRef, onChange, prevValueRef],
  );

  /**
   * Applies the selected token to an existing RefNode in place, or inserts a
   * new one when opened from the toolbar button (nodeKey === null).
   */
  const handleRefEditConfirm = useCallback(
    (token: string) => {
      if (!refEditState) return;
      const { nodeKey } = refEditState;
      setRefEditState(null);

      if (nodeKey === null) {
        insertRef(token);
        requestAnimationFrame(() => focusEditor());
        return;
      }

      const editorEl = containerRef.current?.querySelector<HTMLElement>(
        '[contenteditable="true"]',
      );
      const lexEditor = editorEl ? getNearestEditorFromDOMNode(editorEl) : null;
      if (!lexEditor) return;

      isApplyingRef.current = true;
      lexEditor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isRefNode(node)) {
          const writable = node.getWritable();
          writable.__token = token;
        }
      });
      requestAnimationFrame(() => {
        isApplyingRef.current = false;
        lexEditor.focus();
      });
    },
    [refEditState, isApplyingRef, insertRef, focusEditor],
  );

  /**
   * Intercepts dropdown navigation keys in the capture phase on the wrapper div.
   * Capture fires before MDXEditor's Lexical key handlers, so our handler always
   * wins when the dropdown is open.
   */
  function handleKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isOpen || isComposing) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(
          (i) => (i - 1 + suggestions.length) % suggestions.length,
        );
        break;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        // Stop the native event too; Lexical registers its own keydown listener
        // on the contenteditable and doesn't check defaultPrevented, so without
        // this it would still insert a newline after the chip is inserted.
        e.nativeEvent.stopImmediatePropagation();
        applySuggestion(suggestions[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        closeSuggestions();
        break;
    }
  }

  // Plugin array - memoised so identity is stable across re-renders.
  const plugins = useMemo((): RealmPlugin[] => {
    return [
      wikiPlugin,
      refPlugin,
      toolbarPlugin({
        toolbarContents: () => (
          <DiffSourceToggleWrapper>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
            <CodeToggle />
            <Separator />
            <ListsToggle />
            <Separator />
            <InsertTable />
            <InsertThematicBreak />
            <Separator />
            <InsertWikiLinkButton />
            <InsertRefButton />
          </DiffSourceToggleWrapper>
        ),
      }),
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4] }),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      codeBlockPlugin(),
      diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: diffBaseline }),
    ];
    // Toolbar buttons are self-contained and read mutable data from context,
    // so only diffBaseline (the diff baseline) is a real dep.
  }, [diffBaseline]);

  const pos = dropdownPos ?? { top: 0, left: 0 };

  return (
    <div
      ref={containerRef}
      style={{ "--editor-min-height": `${height}px` } as CSSProperties}
      className="relative rounded border border-border"
      onKeyDownCapture={handleKeyDownCapture}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
    >
      <WikiLinkContext.Provider
        value={{
          wikiPages,
          wikiChapters,
          chapterType,
          insertWikiLink,
          focusEditor,
          openEditMenu,
          openInsertMenu,
        }}
      >
        <RefContext.Provider
          value={{
            openRefEditMenu,
            openRefInsertMenu,
          }}
        >
          <MDXEditorClient
            ref={editorRef}
            markdown={initialValue}
            onChange={handleChange}
            plugins={plugins}
            toMarkdownOptions={{
              extensions: [wikiLinkToMarkdownExtension, refToMarkdownExtension],
            }}
            className={isDark ? "mdx-editor-wiki dark" : "mdx-editor-wiki"}
            contentEditableClassName="max-w-none px-4 py-3 focus:outline-none"
          />
          {editState && (
            <WikiLinkEditPopover
              anchorEl={editState.anchorEl}
              initialToken={editState.initialToken}
              initialAlias={editState.initialAlias}
              autoFocusAlias={editState.autoFocusAlias}
              onConfirm={handleEditConfirm}
              onClose={() => {
                setEditState(null);
                focusEditor();
              }}
            />
          )}
          {refEditState && (
            <RefEditPopover
              anchorEl={refEditState.anchorEl}
              initialToken={refEditState.initialToken}
              onConfirm={handleRefEditConfirm}
              onClose={() => {
                setRefEditState(null);
                focusEditor();
              }}
            />
          )}
        </RefContext.Provider>
      </WikiLinkContext.Provider>
      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listboxRef}
          role="listbox"
          style={{ top: pos.top, left: pos.left }}
          className="absolute z-50 max-h-48 w-72 overflow-y-auto rounded border border-border bg-popover shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}:${s.name}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`flex cursor-pointer select-none items-baseline gap-1.5 px-3 py-2 text-sm ${
                i === activeIndex ? "bg-accent" : "hover:bg-muted"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              <span className="text-foreground font-medium">{s.name}</span>
              {s.kind === "chapter" && chapterType && (
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {chapterType}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Reads the cursor's pixel position from the DOM Selection API and returns
 * coordinates relative to `containerRef` so the autocomplete dropdown
 * appears just below the current insertion point.
 */
function getCursorPos(
  container: HTMLDivElement | null,
): { top: number; left: number } | null {
  if (!container) return null;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) return null;

  const lineH = 24;
  return {
    top: rect.bottom - containerRect.top + lineH / 4,
    // Keep w-72 (288 px) dropdown horizontally inside the container
    left: Math.max(
      0,
      Math.min(rect.left - containerRect.left, containerRect.width - 288),
    ),
  };
}
