"use client"

import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function DialogDemoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Dialog Demo</h1>
      <p className="text-muted-foreground">
        Click the button below to open the Blueprint.js-style dialog.
      </p>

      <Dialog>
        <DialogTrigger render={<Button />}>Open Dialog</DialogTrigger>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              This dialog follows the Blueprint.js Dialog pattern: a fixed
              header with a title and close button, a scrollable body, and a
              pinned footer with action buttons.
            </DialogDescription>
            <p className="mt-3 text-muted-foreground">
              The body grows to fill available space and scrolls independently
              when content is tall. The header and footer remain fixed.
            </p>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
