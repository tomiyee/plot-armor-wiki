"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  deletePage,
  getPageWikiLinkReferences,
  getPageChapterSynopsisReferences,
} from "./actions";

const WikiLinkMDEditor = dynamic(
  () => import("@/components/MDEditor").then((m) => m.WikiLinkMDEditor),
  { ssr: false },
);

type WikiLinkRef = {
  /** Slug of the page that contains the reference. */
  pageSlug: string;
  /** Display name of the page that contains the reference. */
  pageName: string;
};

type ChapterSynopsisRef = {
  /** The chapter's sort index, used to build the chapter page URL. */
  chapterIdx: number;
  /** Human-readable chapter display name. */
  chapterDisplayName: string;
  /** Human-readable volume display name. */
  volumeName: string;
};

type DeletePageButtonProps = {
  /** URL slug of the serial this page belongs to. */
  serialSlug: string;
  /** URL slug of the page to delete. */
  pageSlug: string;
  /** Wiki pages visible at the reader's cutoff, for wiki-link autocomplete in the reason field. */
  wikiPages: { name: string; slug: string }[];
};

/**
 * Admin-only "Delete page" button with a confirmation dialog that lists all
 * incoming references (wiki page sections and chapter synopses) so the admin
 * knows what will have broken links after deletion.
 *
 * After a successful delete the user is redirected to the serial home.
 *
 * @example
 * <DeletePageButton serialSlug="one-piece" pageSlug="luffy" wikiPages={[]} />
 */
export function DeletePageButton(props: DeletePageButtonProps) {
  const { serialSlug, pageSlug, wikiPages } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [dialogState, setDialogState] = useState<
    | { kind: "closed" }
    | {
        kind: "confirm";
        wikiRefs: WikiLinkRef[];
        chapterRefs: ChapterSynopsisRef[];
      }
    | { kind: "error"; message: string }
  >({ kind: "closed" });

  function handleClick() {
    setReason("");
    startTransition(async () => {
      const [wikiRefs, chapterRefs] = await Promise.all([
        getPageWikiLinkReferences(serialSlug, pageSlug),
        getPageChapterSynopsisReferences(serialSlug, pageSlug),
      ]);
      setDialogState({ kind: "confirm", wikiRefs, chapterRefs });
    });
  }

  function handleConfirmDelete() {
    startTransition(async () => {
      const result = await deletePage(serialSlug, pageSlug, reason);
      if (result.error) {
        setDialogState({ kind: "error", message: result.error });
      } else {
        setDialogState({ kind: "closed" });
        router.push(`/${serialSlug}`);
      }
    });
  }

  function handleClose() {
    if (!isPending) setDialogState({ kind: "closed" });
  }

  const hasRefs =
    dialogState.kind === "confirm" &&
    (dialogState.wikiRefs.length > 0 || dialogState.chapterRefs.length > 0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive border-destructive/40 hover:bg-destructive/10"
        onClick={handleClick}
        disabled={isPending}
      >
        <Trash2Icon className="size-4" />
        Delete page
      </Button>

      {/* Confirmation dialog */}
      <Dialog
        isOpen={dialogState.kind === "confirm"}
        onClose={handleClose}
        popupClassName={hasRefs ? "sm:max-w-xl" : undefined}
      >
        <DialogHeader>
          <DialogTitle>Delete this page?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text variant="body">
            This will hide the page from all readers and remove it from search
            results. All versioned content is preserved - an admin can restore
            the page at any time by visiting its URL.
          </Text>

          <div className="mt-4">
            <Text variant="label" className="mb-1.5 block">
              Reason for deletion
            </Text>
            <WikiLinkMDEditor
              value={reason}
              onChange={(val) => setReason(val ?? "")}
              height={120}
              wikiPages={wikiPages}
              serialSlug={serialSlug}
            />
          </div>

          {dialogState.kind === "confirm" &&
            dialogState.wikiRefs.length > 0 && (
              <div className="mt-4">
                <Text variant="label" className="mb-2 block text-destructive">
                  Wiki links that will break ({dialogState.wikiRefs.length})
                </Text>
                <ul className="space-y-1 text-sm">
                  {dialogState.wikiRefs.map((ref, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <a
                        href={`/${serialSlug}/${ref.pageSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {ref.pageName}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {dialogState.kind === "confirm" &&
            dialogState.chapterRefs.length > 0 && (
              <div className="mt-4">
                <Text variant="label" className="mb-2 block text-destructive">
                  Chapter synopses that will break (
                  {dialogState.chapterRefs.length})
                </Text>
                <ul className="space-y-1 text-sm">
                  {dialogState.chapterRefs.map((ref, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <a
                        href={`/${serialSlug}/chapter/${ref.chapterIdx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {ref.volumeName} - {ref.chapterDisplayName}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </DialogBody>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={isPending || !reason.trim()}
          >
            Delete page
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Error dialog */}
      <Dialog isOpen={dialogState.kind === "error"} onClose={handleClose}>
        <DialogHeader>
          <DialogTitle>Error</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text variant="body">
            {dialogState.kind === "error" ? dialogState.message : ""}
          </Text>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </Dialog>
    </>
  );
}
