"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/**
 * Controlled modal dialog. Renders a backdrop, centered popup, and an optional
 * X close button. Compose with `DialogHeader`, `DialogBody`, and `DialogFooter`.
 *
 * @example
 * function Example() {
 *   const [isOpen, setIsOpen] = useState(false)
 *   return (
 *     <>
 *       <Button onClick={() => setIsOpen(true)}>Open</Button>
 *       <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)}>
 *         <DialogHeader><DialogTitle>Title</DialogTitle></DialogHeader>
 *         <DialogBody>Content goes here.</DialogBody>
 *         <DialogFooter>
 *           <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
 *           <Button>Confirm</Button>
 *         </DialogFooter>
 *       </Dialog>
 *     </>
 *   )
 * }
 */
function Dialog({
  isOpen,
  onClose,
  showCloseButton = true,
  children,
  ...props
}: {
  isOpen: boolean
  onClose: () => void
  showCloseButton?: boolean
  children: React.ReactNode
} & Omit<DialogPrimitive.Root.Props, "open" | "onOpenChange">) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
      {...props}
    >
      <DialogPrimitive.Portal data-slot="dialog-portal">
        <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute top-2 right-2"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Renders a button that closes the dialog when clicked. Use inside
 * `DialogFooter` for Cancel-style actions.
 *
 * @example
 * <DialogFooter>
 *   <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
 * </DialogFooter>
 */
function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * Fixed top bar containing the dialog title and optional actions. Renders a
 * bottom border to visually separate it from the body.
 *
 * @example
 * <DialogHeader>
 *   <DialogTitle>Settings</DialogTitle>
 * </DialogHeader>
 */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 items-center gap-2 border-b px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

/**
 * Scrollable content region between the header and footer. Grows to fill
 * available dialog height; overflows with a scrollbar when content is taller
 * than the dialog's max height.
 *
 * @example
 * <DialogBody>
 *   <p>Long form content that may scroll...</p>
 * </DialogBody>
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex-1 overflow-y-auto px-4 py-4", className)}
      {...props}
    />
  )
}

/**
 * Pinned action row at the bottom of the dialog. Renders action buttons
 * right-aligned on desktop and stacked on mobile.
 *
 * @example
 * <DialogFooter>
 *   <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
 *   <Button>Save</Button>
 * </DialogFooter>
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 px-4 py-3 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Accessible dialog title rendered inside `DialogHeader`. Announced by screen
 * readers when the dialog opens.
 *
 * @example
 * <DialogHeader>
 *   <DialogTitle>Confirm deletion</DialogTitle>
 * </DialogHeader>
 */
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("flex-1 text-base leading-none font-semibold", className)}
      {...props}
    />
  )
}

/**
 * Muted supporting text rendered inside `DialogBody`. Announced by screen
 * readers as the dialog's accessible description.
 *
 * @example
 * <DialogBody>
 *   <DialogDescription>This action cannot be undone.</DialogDescription>
 * </DialogBody>
 */
function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
}
