"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from "react";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { cn, normalizeQuery } from "@/lib/utils";

export type Option<T> = {
  /** Display text shown in the dropdown and used for filtering. */
  label: string;
  /** Optional secondary text shown below the label; also matched during filtering. */
  description?: string;
  /** When true, the option cannot be selected or navigated to with keyboard. */
  disabled?: boolean;
  /**
   * The value emitted to `onChange` when this option is selected.
   * For structural nodes this value is never emitted - use a sentinel like `null`.
   */
  value: T;
  /**
   * When true the option acts as a non-selectable section header.
   * Clicking it expands/collapses its children accordion.
   */
  structural?: boolean;
  /** Child options. Options with children render as expandable accordion sections. */
  children?: Option<T>[];
};

type FlatRow<T> = {
  /** Stable string key derived from the option's path in the tree (not index-based). */
  id: string;
  option: Option<T>;
  /** Nesting depth (0 = root). */
  depth: number;
  /** Whether this row's accordion is currently expanded. */
  expanded: boolean;
  /** Whether this row is a selectable option (not structural, not disabled). */
  selectable: boolean;
  /** Sequential index among selectable rows only - used for keyboard navigation. */
  selectableIdx: number;
};

type SelectProps<T> = {
  /** Flat or hierarchical option list. */
  options: Option<T>[];
  /** Currently-selected value (controlled). Pass `undefined` for no selection. */
  value?: T;
  /** Called when the user selects an option. */
  onChange?: (value: T) => void;
  /** Placeholder text shown in the trigger button when no value is selected. */
  placeholder?: string;
  /** Extra classes merged onto the root wrapper element. */
  className?: string;
  /** When true, prevents all interaction. */
  disabled?: boolean;
  /** Forwarded to the trigger button as an `id`. */
  id?: string;
  /**
   * CSS width value applied to the popup (e.g. `"240px"`, `"var(--anchor-width)"`).
   * Defaults to `"var(--anchor-width)"` (match trigger width).
   */
  popupWidth?: string;
  /**
   * When false, the search input is hidden and options are never filtered.
   * Useful for short, well-known lists where search adds no value.
   * Defaults to true.
   */
  searchable?: boolean;
  /**
   * Optional custom trigger element rendered in place of the default outline
   * button. Clicking anywhere inside the element opens the dropdown.
   * The dropdown is positioned relative to this element.
   *
   * @example
   * <Select options={opts} value={v} onChange={setV}>
   *   <Button variant="ghost"><CalendarIcon /></Button>
   * </Select>
   */
  children?: ReactNode;
};

/**
 * Manages expand/collapse state for grouped accordion sections.
 *
 * Uses `Set<string> | null` as a sentinel: `null` means "not yet
 * initialized - treat every section as expanded." On the first toggle the
 * set is seeded from `allRowIds` and the clicked ID is removed (collapse)
 * or added (expand). This avoids a separate initialization render.
 *
 * Row IDs are the path-based strings produced by `buildFlatRows`
 * (e.g. `"0"`, `"0-1"`, `"0-1-2"`).
 *
 * @example
 * const { effectiveExpandedIds, toggleExpand } = useAccordionState(options);
 * // Pass effectiveExpandedIds to buildFlatRows; call toggleExpand on header click.
 */
function useAccordionState<T>(options: Option<T>[]) {
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);

  const allRowIds = useMemo(() => {
    function collectIds(opts: Option<T>[], prefix = ""): string[] {
      return opts.flatMap((opt, i) => {
        const id = prefix ? `${prefix}-${i}` : `${i}`;
        return [id, ...(opt.children ? collectIds(opt.children, id) : [])];
      });
    }
    return new Set(collectIds(options));
  }, [options]);

  // null sentinel: treat everything as expanded until the user first toggles
  const effectiveExpandedIds: ReadonlySet<string> = expandedIds ?? allRowIds;

  const toggleExpand = useCallback(
    (rowId: string) => {
      setExpandedIds((prev) => {
        const base = prev ?? allRowIds;
        const next = new Set(base);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      });
    },
    [allRowIds],
  );

  const ensureExpanded = useCallback(
    (ids: string[]) => {
      setExpandedIds((prev) => {
        const base = prev ?? allRowIds;
        const next = new Set(base);
        let changed = false;
        for (const id of ids) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [allRowIds],
  );

  return { effectiveExpandedIds, toggleExpand, ensureExpanded };
}

/**
 * Derives the visible row list and keyboard-navigation metadata from the
 * current option tree, expansion state, and search query. All three returned
 * values are memoized independently, so a query change does not invalidate
 * the expansion-state memo and vice versa.
 *
 * @example
 * const { flatRows, selectableRows, totalSelectableCount } = useFlatRows(
 *   options, effectiveExpandedIds, query, searchable,
 * );
 */
function useFlatRows<T>(
  options: Option<T>[],
  effectiveExpandedIds: ReadonlySet<string>,
  query: string,
  searchable: boolean,
) {
  const flatRows = useMemo(
    () => buildFlatRows(options, effectiveExpandedIds, searchable ? query : ""),
    [options, effectiveExpandedIds, query, searchable],
  );
  const selectableRows = useMemo(
    () => flatRows.filter((r) => r.selectable),
    [flatRows],
  );
  return {
    flatRows,
    selectableRows,
    totalSelectableCount: selectableRows.length,
  };
}

type KeyboardNavOptions<T> = {
  /** Whether the dropdown is currently open; handler is a no-op when false. */
  isOpen: boolean;
  /** Total number of selectable (non-header) rows, used to clamp navigation bounds. */
  totalSelectableCount: number;
  /** Flat list of rendered rows, used to resolve the active index to an item on Enter. */
  selectableRows: FlatRow<T>[];
  /** Index into `selectableRows` of the currently highlighted option (-1 = none). */
  activeSelectableIdx: number;
  /** Updates the highlighted row by its stable path ID; called on Arrow/Home/End key presses. */
  setActiveRowId: (id: string | null) => void;
  /** Confirms the selection of a row; called when Enter is pressed. */
  onSelect: (row: FlatRow<T>) => void;
  /** Closes the dropdown; called when Escape is pressed. */
  onClose: () => void;
};

/**
 * Returns a stable `onKeyDown` handler for the search input that drives
 * keyboard navigation through the option list.
 *
 * Arrow keys move the highlight; Home/End jump to the first/last selectable
 * option; Enter confirms the active option; Escape closes the dropdown.
 * The handler is a no-op when `isOpen` is false, so it is safe to attach
 * unconditionally.
 *
 * @example
 * const handleKeyDown = useKeyboardNav({ isOpen, totalSelectableCount, ... });
 * // <input onKeyDown={handleKeyDown} />
 */
function useKeyboardNav<T>(opts: KeyboardNavOptions<T>) {
  const {
    isOpen,
    totalSelectableCount,
    selectableRows,
    activeSelectableIdx,
    setActiveRowId,
    onSelect,
    onClose,
  } = opts;

  return useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.min(activeSelectableIdx + 1, totalSelectableCount - 1);
          setActiveRowId(selectableRows[next]?.id ?? null);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = Math.max(activeSelectableIdx - 1, 0);
          setActiveRowId(selectableRows[prev]?.id ?? null);
          break;
        }
        case "Home":
          e.preventDefault();
          setActiveRowId(selectableRows[0]?.id ?? null);
          break;
        case "End":
          e.preventDefault();
          setActiveRowId(selectableRows[totalSelectableCount - 1]?.id ?? null);
          break;
        case "Enter": {
          e.preventDefault();
          const row = selectableRows[activeSelectableIdx];
          if (row) onSelect(row);
          break;
        }
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [
      isOpen,
      totalSelectableCount,
      selectableRows,
      activeSelectableIdx,
      setActiveRowId,
      onSelect,
      onClose,
    ],
  );
}

/**
 * Manages scroll-into-view for the keyboard-active dropdown row.
 *
 * Attach `activeRowRef` to the active row. Call `onOpen()` before opening the
 * dropdown so the first mount scrolls the row to the top of the list
 * (`block:"start"`); keyboard-nav re-attaches use `block:"nearest"` so the
 * item stays visible without jumping.
 *
 * @example
 * const { activeRowRef, onOpen } = useScrollToActiveRow();
 * // In handleOpen: onOpen();
 * // In renderRow: <LeafRow activeRowRef={isActive ? activeRowRef : undefined} />
 */
function useScrollToActiveRow() {
  const scrollToTopRef = useRef(false);

  const activeRowRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    node.scrollIntoView({ block: scrollToTopRef.current ? "start" : "nearest" });
    scrollToTopRef.current = false;
  }, []);

  const onOpen = useCallback(() => {
    scrollToTopRef.current = true;
  }, []);

  return { activeRowRef, onOpen };
}

type GroupRowProps = {
  /** DOM element id for ARIA references. */
  domId: string;
  /** Display text of the section header. */
  label: string;
  /** Optional secondary text shown after the label. */
  description?: string;
  /** Nesting depth used to compute left-padding. */
  depth: number;
  /** Whether this accordion section is currently expanded. */
  expanded: boolean;
  /** When false, the row is a static label with no expand/collapse behavior. */
  isAccordion: boolean;
  /** Called when the user clicks to expand or collapse. */
  onToggle: () => void;
};

/**
 * Non-selectable section header that doubles as an accordion trigger when
 * `isAccordion` is true (i.e. the option has children).
 *
 * The chevron direction reflects expanded state; clicking calls `onToggle`.
 * When `isAccordion` is false the row is a visual label only - no chevron,
 * no click handler.
 *
 * @example
 * <GroupRow
 *   domId={`${uid}-row-0`}
 *   label="Volume 1"
 *   depth={0}
 *   expanded={true}
 *   isAccordion={true}
 *   onToggle={() => toggleExpand("0")}
 * />
 */
function GroupRow(props: GroupRowProps) {
  const { domId, label, description, depth, expanded, isAccordion, onToggle } =
    props;
  return (
    <div
      id={domId}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      aria-expanded={isAccordion ? expanded : undefined}
      style={{ paddingLeft: depth * 16 + 8 }}
      className="flex items-center gap-1.5 pr-3 h-9 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none cursor-pointer hover:bg-muted/50"
      onClick={() => isAccordion && onToggle()}
    >
      {isAccordion && (
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )}
        </span>
      )}
      <span className="truncate">{label}</span>
      {description && (
        <span className="truncate text-muted-foreground/70 ml-1">
          {description}
        </span>
      )}
    </div>
  );
}

type LeafRowProps = {
  /** DOM element id for ARIA references. */
  domId: string;
  /** Display text of the option. */
  label: string;
  /** Optional secondary text shown alongside the label. */
  description?: string;
  /** Nesting depth used to compute left-padding. */
  depth: number;
  /** When true, the row is visually dimmed and cannot be selected. */
  disabled?: boolean;
  /** Whether this row is currently keyboard-highlighted. */
  isActive: boolean;
  /** Whether this row matches the current controlled value. */
  isSelected: boolean;
  /** Attached only when this row is keyboard-active; fires scrollIntoView the moment the node mounts. */
  activeRowRef?: RefObject<HTMLDivElement | null> | RefCallback<HTMLDivElement>;
  /** Called when the user clicks or presses Enter on this row. */
  onSelect: () => void;
};

/**
 * Selectable leaf option inside the dropdown.
 *
 * Receives `isActive` and `isSelected` as pre-computed booleans so this
 * component stays free of generic type `T` - value comparisons happen in
 * `renderRow` inside `Select`. `activeRowRef` is passed conditionally (only
 * when active) so the parent's scroll-into-view effect targets the right DOM
 * node without iterating the list itself.
 *
 * Uses `onMouseDown` instead of `onClick` to fire before the input's
 * `onBlur`, preventing the dropdown from closing before the selection lands.
 *
 * @example
 * <LeafRow
 *   domId={`${uid}-row-0-1`}
 *   label="Chapter 5"
 *   depth={1}
 *   isActive={false}
 *   isSelected={true}
 *   onSelect={() => handleSelect(row)}
 * />
 */
function LeafRow(props: LeafRowProps) {
  const {
    domId,
    label,
    description,
    depth,
    disabled,
    isActive,
    isSelected,
    activeRowRef,
    onSelect,
  } = props;
  return (
    <div
      id={domId}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-disabled={disabled}
      ref={activeRowRef}
      style={{ paddingLeft: depth * 16 + 8 }}
      className={cn(
        "flex items-start gap-2 pr-3 h-9 cursor-pointer select-none transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/40",
        isActive && !disabled && "bg-primary/10 font-medium text-primary",
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onSelect();
      }}
    >
      <span className="truncate text-sm leading-9">{label}</span>
      {description && (
        <span className="truncate text-xs text-muted-foreground leading-9 shrink-0 max-w-40%">
          {description}
        </span>
      )}
    </div>
  );
}

type DropdownContentProps = {
  /** When false, the search input is hidden and options are never filtered. */
  searchable: boolean;
  /** Current text in the search input. */
  query: string;
  /** Called on every input event in the search box. */
  onQueryChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Keyboard handler for Arrow/Enter/Escape navigation. */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Whether the dropdown is currently visible; triggers focus on the search input. */
  isOpen: boolean;
  /** DOM id applied to the tree element for ARIA references. */
  treeId: string;
  /** DOM id of the currently highlighted row for aria-activedescendant. */
  activeRowDomId: string | undefined;
  /** When false, renders the empty-state message instead of the tree. */
  hasOptions: boolean;
  /** Number of selectable options, used in the screen-reader live region. */
  selectableCount: number;
  /** Rendered rows; this component does not inspect them. */
  children: ReactNode;
};

/**
 * The panel rendered inside the dropdown Popover: an optional search input,
 * a screen-reader live region, and the scrollable option tree.
 *
 * Owns its `searchRef` and focuses the input whenever `isOpen` transitions
 * to `true`, keeping focus management self-contained and out of `Select`.
 * The rendered rows are passed as `children`; this component never inspects
 * them - it only uses `hasOptions` to choose between the tree view and the
 * empty-state message.
 *
 * @example
 * <DropdownContent
 *   isOpen={isOpen}
 *   treeId={treeId}
 *   hasOptions={flatRows.length > 0}
 *   selectableCount={totalSelectableCount}
 *   {...searchProps}
 * >
 *   {flatRows.map(renderRow)}
 * </DropdownContent>
 */
function DropdownContent(props: DropdownContentProps) {
  const {
    searchable,
    query,
    onQueryChange,
    onKeyDown,
    isOpen,
    treeId,
    activeRowDomId,
    hasOptions,
    selectableCount,
    children,
  } = props;

  const liveRegionId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  return (
    <div className="flex flex-col h-full">
      {searchable && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={onQueryChange}
              onKeyDown={onKeyDown}
              placeholder="Search…"
              autoComplete="off"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={treeId}
              aria-autocomplete="list"
              aria-activedescendant={activeRowDomId}
              className={cn(
                "w-full h-7 pl-7 pr-2 text-sm bg-transparent outline-none",
                "placeholder:text-muted-foreground",
              )}
            />
          </div>
        </div>
      )}

      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {hasOptions
          ? `${selectableCount} option${selectableCount === 1 ? "" : "s"} available`
          : "No options available."}
      </div>

      {hasOptions ? (
        <div className="overflow-y-auto flex-1">
          <div id={treeId} role="tree">
            {children}
          </div>
        </div>
      ) : (
        <div
          role="status"
          aria-label="No options available."
          className="px-3 py-3 text-sm text-muted-foreground text-center"
        >
          No options available.
        </div>
      )}
    </div>
  );
}

/**
 * Searchable, hierarchical dropdown select with keyboard navigation and full
 * ARIA accessibility (combobox + tree semantics).
 *
 * Supports:
 * - Searchable input inside the dropdown
 * - Structural (non-selectable) group headers
 * - Expandable accordion sections with multi-level nesting
 * - Full keyboard navigation (ArrowUp/Down/Home/End/Enter/Escape)
 *
 * All persistent state (open, search, expanded accordions, active option) is
 * managed internally. The only controlled state is `value`/`onChange`.
 *
 * @example
 * // Flat list
 * <Select
 *   options={VOLUME_TYPE_OPTIONS}
 *   value={volumeType}
 *   onChange={setVolumeType}
 *   placeholder="Volume type"
 * />
 *
 * @example
 * // Grouped hierarchical
 * <Select
 *   options={volumes.map(v => ({
 *     label: v.name, value: null, structural: true,
 *     children: v.chapters.map(c => ({ label: c.name, value: c.id })),
 *   }))}
 *   value={selectedChapterId}
 *   onChange={setSelectedChapterId}
 *   placeholder="Select chapter…"
 * />
 *
 * @example
 * // Custom trigger - any element as the dropdown button
 * <Select options={opts} value={v} onChange={setV}>
 *   <Button variant="ghost" size="icon"><BookmarkIcon /></Button>
 * </Select>
 */
function Select<T>(props: SelectProps<T>) {
  const {
    options,
    value,
    onChange,
    placeholder = "Select…",
    className,
    disabled,
    id,
    popupWidth = "var(--anchor-width)",
    searchable = true,
    children,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const { activeRowRef, onOpen } = useScrollToActiveRow();

  const hasCustomTrigger = children != null;

  const uid = useId();
  const treeId = `${uid}-tree`;

  const { effectiveExpandedIds, toggleExpand, ensureExpanded } = useAccordionState(options);
  const { flatRows, selectableRows, totalSelectableCount } = useFlatRows(
    options,
    effectiveExpandedIds,
    query,
    searchable,
  );

  // Derive the active index from the stable row ID so accordion
  // collapse/expand never shifts the highlight to the wrong option.
  const activeSelectableIdx = useMemo(
    () =>
      activeRowId === null ? -1 : selectableRows.findIndex((r) => r.id === activeRowId),
    [activeRowId, selectableRows],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (row: FlatRow<T>) => {
      if (!row.selectable) return;
      onChange?.(row.option.value);
      setIsOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setQuery("");
    onOpen();
    // Expand any collapsed groups that contain the selected option so the
    // scroll target is visible on the first render.
    const ancestorIds =
      value !== undefined ? (findAncestorIds(options, value) ?? []) : [];
    if (ancestorIds.length > 0) ensureExpanded(ancestorIds);
    // Compute rows with the now-expanded state to find the right row ID.
    // All state updates below are batched into one re-render (React 18).
    const nextExpandedIds =
      ancestorIds.length > 0
        ? new Set([...effectiveExpandedIds, ...ancestorIds])
        : effectiveExpandedIds;
    const nextSelectableRows = buildFlatRows(options, nextExpandedIds, "").filter(
      (r) => r.selectable,
    );
    const selectedRow =
      value !== undefined
        ? nextSelectableRows.find((r) => r.option.value === value)
        : undefined;
    setActiveRowId(selectedRow?.id ?? nextSelectableRows[0]?.id ?? null);
    setIsOpen(true);
  }, [disabled, onOpen, options, value, effectiveExpandedIds, ensureExpanded]);

  const handleQueryChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  // Reset to the first matching row after each query change. Runs after render
  // so selectableRows already reflects the new query when this fires.
  useEffect(() => {
    if (!isOpen) return;
    setActiveRowId(selectableRows[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only reset on query change
  }, [query]);

  const handleKeyDown = useKeyboardNav({
    isOpen,
    totalSelectableCount,
    selectableRows,
    activeSelectableIdx,
    setActiveRowId,
    onSelect: handleSelect,
    onClose: handleClose,
  });

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger =
        (triggerRef.current?.contains(target) ?? false) ||
        (wrapperRef.current?.contains(target) ?? false);
      const inPopup = popupRef.current?.contains(target) ?? false;
      if (!inTrigger && !inPopup) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const selectedLabel =
    value !== undefined ? findLabel(options, value) : undefined;

  const activeRow = selectableRows[activeSelectableIdx];
  const activeRowDomId = activeRow ? `${uid}-row-${activeRow.id}` : undefined;

  function renderRow(row: FlatRow<T>) {
    const { option, depth, expanded, id: rowId } = row;
    const hasChildren = (option.children?.length ?? 0) > 0;
    const domId = `${uid}-row-${rowId}`;

    if (option.structural || hasChildren) {
      return (
        <GroupRow
          key={rowId}
          domId={domId}
          label={option.label}
          description={option.description}
          depth={depth}
          expanded={expanded}
          isAccordion={hasChildren}
          onToggle={() => toggleExpand(rowId)}
        />
      );
    }

    const isActive =
      row.selectable && row.selectableIdx === activeSelectableIdx;
    const isSelected = value !== undefined && option.value === value;
    return (
      <LeafRow
        key={rowId}
        domId={domId}
        label={option.label}
        description={option.description}
        depth={depth}
        disabled={option.disabled}
        isActive={isActive}
        isSelected={isSelected}
        activeRowRef={isActive ? activeRowRef : undefined}
        onSelect={() => handleSelect(row)}
      />
    );
  }

  const anchorRef = hasCustomTrigger
    ? (wrapperRef as RefObject<Element | null>)
    : (triggerRef as RefObject<Element | null>);

  return (
    <div data-slot="select-wrapper" className={cn("relative", className)}>
      {hasCustomTrigger ? (
        <div
          ref={wrapperRef}
          onClick={disabled ? undefined : handleOpen}
          className="inline-flex"
        >
          {children}
        </div>
      ) : (
        <Button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="tree"
          aria-expanded={isOpen}
          aria-controls={isOpen ? treeId : undefined}
          onClick={handleOpen}
          variant="outline"
          size="lg"
          className={cn(
            "w-full justify-between px-3 border-border shadow-xs",
            !selectedLabel && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "shrink-0 size-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </Button>
      )}

      <Popover
        anchor={anchorRef}
        open={isOpen}
        modal={false}
        popupRef={popupRef}
        popupId={treeId}
        popupRole="dialog"
        initialFocus={false}
        side="bottom"
        align="start"
        popupStyle={{ width: popupWidth, height: "min(300px, 60vh)" }}
        className="flex flex-col bg-background text-foreground overflow-hidden"
        content={
          <DropdownContent
            searchable={searchable}
            query={query}
            onQueryChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            isOpen={isOpen}
            treeId={treeId}
            activeRowDomId={activeRowDomId}
            hasOptions={flatRows.length > 0}
            selectableCount={totalSelectableCount}
          >
            {flatRows.map((row) => renderRow(row))}
          </DropdownContent>
        }
      />
    </div>
  );
}

export { Select };

/**
 * Flattens the option tree into a linear list of visible rows, honoring
 * accordion expansion state and the active search query.
 *
 * Row IDs are path-based (e.g. `"0"`, `"0-1"`, `"0-1-2"`) so they remain
 * stable when siblings are filtered out - keyboard-navigation indices never
 * jump unexpectedly.
 *
 * When a query is active every ancestor accordion is force-expanded so
 * matching descendants are always reachable regardless of prior collapse state.
 *
 * @example
 * const rows = buildFlatRows(options, effectiveExpandedIds, query);
 */
function buildFlatRows<T>(
  options: Option<T>[],
  expandedIds: ReadonlySet<string>,
  query: string,
  parentId = "",
): FlatRow<T>[] {
  const q = normalizeQuery(query);

  function matchesFilter(opt: Option<T>): boolean {
    if (opt.label.toLowerCase().includes(q)) return true;
    if (opt.description?.toLowerCase().includes(q)) return true;
    if (opt.children) return opt.children.some((c) => matchesFilter(c));
    return false;
  }

  function walk(
    opts: Option<T>[],
    depth: number,
    prefix: string,
    selectableCounter: { n: number },
  ): FlatRow<T>[] {
    const rows: FlatRow<T>[] = [];

    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      const id = prefix ? `${prefix}-${i}` : `${i}`;
      const hasChildren = (opt.children?.length ?? 0) > 0;

      if (q && !matchesFilter(opt)) continue;

      const selectable = !opt.structural && !opt.disabled && !hasChildren;
      const selectableIdx = selectable ? selectableCounter.n++ : -1;
      // When filtering, force-expand all accordions so matches are always visible.
      const isExpanded = q ? true : expandedIds.has(id);

      rows.push({
        id,
        option: opt,
        depth,
        expanded: isExpanded,
        selectable,
        selectableIdx,
      });

      if (hasChildren && isExpanded) {
        rows.push(...walk(opt.children!, depth + 1, id, selectableCounter));
      }
    }

    return rows;
  }

  return walk(options, 0, parentId, { n: 0 });
}

/**
 * Recursively searches the option tree for the option whose `value` matches
 * and returns its `label`, or `undefined` when not found.
 *
 * Used to derive the trigger button's display text from the controlled value
 * without requiring the caller to maintain a label-to-value mapping.
 *
 * @example
 * const label = findLabel(options, selectedChapterId); // "Chapter 5"
 */
function findLabel<T>(options: Option<T>[], value: T): string | undefined {
  for (const opt of options) {
    if (opt.value === value) return opt.label;
    if (opt.children) {
      const found = findLabel(opt.children, value);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * Returns the row IDs of every ancestor group that must be expanded to make
 * the option matching `value` visible in the flat row list. Returns `null`
 * when the value is not found, or `[]` when it is a root-level option.
 *
 * IDs use the same path-based scheme as `buildFlatRows` (e.g. `"0"`, `"0-2"`).
 *
 * @example
 * const ids = findAncestorIds(options, chapterId); // ["1", "1-2"]
 */
function findAncestorIds<T>(
  options: Option<T>[],
  value: T,
  prefix = "",
): string[] | null {
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const id = prefix ? `${prefix}-${i}` : `${i}`;
    if (opt.value === value) return [];
    if (opt.children) {
      const childPath = findAncestorIds(opt.children, value, id);
      if (childPath !== null) return [id, ...childPath];
    }
  }
  return null;
}
