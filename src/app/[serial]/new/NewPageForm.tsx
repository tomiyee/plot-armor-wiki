"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { createPage } from "./actions";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SimilarPagesWarning } from "./SimilarPagesWarning";

import type { ChapterRow as Chapter, VolumeRow as Volume } from "@/types";
import type { PageOption } from "./SimilarPagesWarning";

type SubmitButtonProps = {
  /** When true, disables the button regardless of form-pending state. */
  disabled: boolean;
};

/**
 * Submit button that disables itself while its parent `<form>` is pending.
 * Must be rendered inside a `<form>` to receive `useFormStatus` context.
 * Prevents double-click races by locking out further clicks as soon as the
 * first submission is in-flight.
 */
function SubmitButton(props: SubmitButtonProps) {
  const { disabled } = props;
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="mt-2" disabled={disabled || pending}>
      {pending ? "Creating…" : "Create page"}
    </Button>
  );
}

interface NewPageFormProps {
  /** URL slug of the serial — used to scope the `createPage` action. */
  serialSlug: string;
  /** Label for the chapter unit (e.g. `"Chapter"`, `"Episode"`). */
  chapterType: string;
  /** All volumes for the intro chapter grouped selector. */
  volumeList: Volume[];
  /** All chapters for the intro chapter selector. */
  chapterList: Chapter[];
  /** All existing pages in the serial. Future pages carry `introChapterLabel`; visible pages do not. */
  existingPages: PageOption[];
  /** Pre-selected parent page id, e.g. when navigating here from a page's edit mode. */
  defaultParentPageId?: number;
  /** The user's current reading chapter cutoff; pre-selects the intro chapter and disables future chapters. */
  defaultIntroChapterId?: number;
  /** Pre-filled page name, e.g. when navigating here from the search palette's "+ Page" option. */
  defaultName?: string;
}

/**
 * Page creation form. Tracks the selected intro chapter and narrows the parent
 * page dropdown to pages that are visible at (i.e. introduced at or before) that
 * chapter, so a child page cannot reference a parent that doesn't exist yet.
 */
export function NewPageForm(props: NewPageFormProps) {
  const {
    serialSlug,
    chapterType,
    volumeList,
    chapterList,
    existingPages,
    defaultParentPageId,
    defaultIntroChapterId,
    defaultName,
  } = props;
  const chapterTypeLabel = chapterType.toLowerCase();

  const chapterIdxById = Object.fromEntries(
    chapterList.map((c) => [c.id, c.idx]),
  );

  const chaptersByVolume = chapterList.reduce<Record<number, Chapter[]>>(
    (acc, c) => {
      (acc[c.volumeId] ??= []).push(c);
      return acc;
    },
    {},
  );

  const firstChapterId = chapterList[0]?.id ?? 0;
  // Default to the user's reading cutoff so the intro chapter matches where they are.
  // Falls back to chapter 1 when no cutoff is available (e.g. no progress cookie).
  const [selectedIntroChapterId, setSelectedIntroChapterId] = useState<number>(
    defaultIntroChapterId ?? firstChapterId,
  );
  const [selectedParentPageId, setSelectedParentPageId] = useState<
    number | undefined
  >(undefined);
  // Generated once per form mount. Sent as a hidden field so the server can
  // detect retried submissions and redirect to the already-created page.
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());
  // Controlled name value so we can react to the user's input for similarity checks.
  const [name, setName] = useState<string>(defaultName ?? "");

  // The idx of the user's reading cutoff chapter, used to gate the chapter options.
  const cutoffIdx =
    defaultIntroChapterId !== undefined
      ? (chapterIdxById[defaultIntroChapterId] ?? Infinity)
      : Infinity;

  const chapterOptions = volumeList
    .filter((v) => (chaptersByVolume[v.id]?.length ?? 0) > 0)
    .map((v) => ({
      label: v.displayName,
      value: -v.id,
      children: (chaptersByVolume[v.id] ?? []).map((c) => ({
        label: c.displayName,
        value: c.id,
        // Disable chapters beyond the user's cutoff to prevent accidental spoilers.
        disabled: c.idx > cutoffIdx,
      })),
    }));

  // Pages visible at the selected intro chapter: home page (null introChapterId)
  // is always included; others must have been introduced at or before it.
  const selectedIdx =
    selectedIntroChapterId > 0
      ? (chapterIdxById[selectedIntroChapterId] ?? Infinity)
      : Infinity;
  const visiblePages = existingPages.filter(
    (p) =>
      p.introChapterId === null ||
      (chapterIdxById[p.introChapterId] ?? 0) <= selectedIdx,
  );
  const parentPageOptions = visiblePages.map((p) => ({
    label: p.name,
    value: p.id,
  }));

  // Only pre-select the defaultParentPageId if it is still visible.
  const visibleParentDefault =
    defaultParentPageId !== undefined &&
    visiblePages.some((p) => p.id === defaultParentPageId)
      ? defaultParentPageId
      : undefined;

  // If the user's selection is still visible at the current intro chapter, keep it;
  // otherwise fall back to the prop default or the first visible page.
  const effectiveParentPageId =
    selectedParentPageId !== undefined &&
    parentPageOptions.some((p) => p.value === selectedParentPageId)
      ? selectedParentPageId
      : (visibleParentDefault ?? parentPageOptions[0]?.value);

  const createPageAction = createPage.bind(null, serialSlug);
  const hasChapters = chapterList.length > 0;

  return (
    <form action={createPageAction} className="flex flex-col gap-5">
      {/* Idempotency key — generated once per form mount to deduplicate retries. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {/* Page name */}
      <Box col className="gap-1">
        <Label htmlFor="name">
          Page name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="e.g. Monkey D. Luffy"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {/* Warn the admin when existing pages have similar names to prevent accidental duplicates. */}
        <SimilarPagesWarning
          name={name}
          serialSlug={serialSlug}
          existingPages={existingPages}
        />
      </Box>

      {/* Intro chapter */}
      <Box col className="gap-1">
        <Label htmlFor="introChapterId">
          Intro {chapterTypeLabel} <span className="text-red-500">*</span>
        </Label>
        {hasChapters ? (
          <>
            <input
              type="hidden"
              name="introChapterId"
              value={selectedIntroChapterId}
            />
            <Select<number>
              id="introChapterId"
              options={chapterOptions}
              placeholder={`Select a ${chapterTypeLabel}…`}
              value={selectedIntroChapterId}
              onChange={setSelectedIntroChapterId}
            />
          </>
        ) : (
          <Text muted className="text-sm">
            No {chapterTypeLabel}s yet.{" "}
            <Link
              href={`/${serialSlug}`}
              className="text-primary hover:underline"
            >
              Add a {chapterTypeLabel} first.
            </Link>
          </Text>
        )}
      </Box>

      {/* Parent page (restricted to pages visible at the selected intro chapter) */}
      <Box col className="gap-1">
        <Label htmlFor="parentPageId">
          Parent page <span className="text-red-500">*</span>
        </Label>
        <input
          type="hidden"
          name="parentPageId"
          value={effectiveParentPageId ?? ""}
        />
        <Select<number>
          id="parentPageId"
          options={parentPageOptions}
          value={effectiveParentPageId}
          onChange={setSelectedParentPageId}
          placeholder="Select a parent page…"
        />
      </Box>

      <SubmitButton disabled={!hasChapters} />
    </form>
  );
}
