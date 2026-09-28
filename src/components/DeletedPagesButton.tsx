"use client";

import { useState } from "react";
import { ArchiveXIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";

type DeletedPage = {
  /** Database ID of the deleted page. */
  id: number;
  /** Display name of the deleted page. */
  name: string;
  /** URL slug of the deleted page. */
  slug: string;
  /** When the page was soft-deleted. */
  deletedAt: Date;
  /** Admin-supplied markdown reason for the deletion. */
  deletionReason: string | null;
};

type DeletedPagesButtonProps = {
  /** URL slug of the serial these pages belong to. */
  serialSlug: string;
  /** List of soft-deleted pages for this serial. */
  deletedPages: DeletedPage[];
};

/**
 * Compact admin button that opens a dialog listing all soft-deleted pages
 * for a serial, including their deletion reasons rendered as markdown.
 *
 * @example
 * <DeletedPagesButton serialSlug="one-piece" deletedPages={deletedPages} />
 */
export function DeletedPagesButton(props: DeletedPagesButtonProps) {
  const { serialSlug, deletedPages } = props;
  const [isOpen, setIsOpen] = useState(false);
  const count = deletedPages.length;

  return (
    <>
      <Tooltip content={`${count} deleted ${count === 1 ? "page" : "pages"}`} side="right">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          onClick={() => setIsOpen(true)}
          aria-label={`${count} deleted ${count === 1 ? "page" : "pages"}`}
        >
          <ArchiveXIcon className="h-4 w-4" />
        </Button>
      </Tooltip>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} popupClassName="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deleted pages</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ul className="flex flex-col divide-y">
            {deletedPages.map((p) => (
              <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <a
                    href={`/${serialSlug}/${p.slug}`}
                    className="font-medium hover:underline text-sm"
                  >
                    {p.name}
                  </a>
                  <Text as="span" muted className="text-xs shrink-0">
                    {p.deletedAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </div>
                {p.deletionReason ? (
                  <MarkdownRenderer sm serialSlug={serialSlug} className="text-muted-foreground">
                    {p.deletionReason}
                  </MarkdownRenderer>
                ) : (
                  <Text as="span" muted className="text-xs italic">
                    No reason provided
                  </Text>
                )}
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </Dialog>
    </>
  );
}
