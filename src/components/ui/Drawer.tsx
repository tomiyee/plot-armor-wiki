"use client";

import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import type { ReactNode } from "react";

/** Props for the {@link Drawer} component. */
interface DrawerProps {
  /** Whether the drawer is open. */
  open: boolean;
  /** Called when the drawer requests an open/close state change. */
  onOpenChange: (open: boolean) => void;
  /** Edge the drawer slides in from. Defaults to `"down"`. */
  direction?: "up" | "down" | "left" | "right";
  /** Content rendered inside the drawer popup. */
  children: ReactNode;
}

/**
 * Directional sheet drawer built on Base UI's Drawer primitive.
 * Handles the portal, backdrop, and popup chrome - pass inner content as children.
 * Fully controlled: manage open state externally and trigger open via any button.
 *
 * @example
 * <Drawer open={open} onOpenChange={setOpen} direction="down">
 *   <div>Drawer content</div>
 * </Drawer>
 */
export function Drawer(props: DrawerProps) {
  const { open, onOpenChange, direction = "down", children } = props;
  const { popup } = directionClasses[direction];
  return (
    <BaseDrawer.Root
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={direction}
    >
      <BaseDrawer.Portal>
        <BaseDrawer.Viewport>
          <BaseDrawer.Backdrop className="fixed inset-0 z-40 bg-black/20 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-200" />
          <BaseDrawer.Popup
            className={`z-50 flex bg-background shadow-xl outline-none data-open:animate-in data-closed:animate-out duration-300 ${popup}`}
          >
            {children}
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}

const directionClasses: Record<
  NonNullable<DrawerProps["direction"]>,
  { popup: string }
> = {
  down: {
    popup:
      "fixed bottom-0 left-0 right-0 max-h-85dvh flex-col rounded-t-md data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
  },
  up: {
    popup:
      "fixed top-0 left-0 right-0 max-h-85dvh flex-col rounded-b-md data-open:slide-in-from-top data-closed:slide-out-to-top",
  },
  left: {
    popup:
      "fixed left-0 top-0 bottom-0 max-w-85dvw flex-row rounded-r-md data-open:slide-in-from-left data-closed:slide-out-to-left",
  },
  right: {
    popup:
      "fixed right-0 top-0 bottom-0 max-w-85dvw flex-row rounded-l-md data-open:slide-in-from-right data-closed:slide-out-to-right",
  },
};
