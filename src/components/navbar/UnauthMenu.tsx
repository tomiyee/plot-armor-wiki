"use client";

import { useState } from "react";
import { UserIcon, LogInIcon, HelpCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeMenuItem } from "@/components/navbar/ThemeMenuItem";
import { Menu, MenuItem } from "@/components/ui/Menu";

/**
 * User icon button for unauthenticated visitors. Opens a dropdown with a
 * "Sign in" link and a theme toggle. Always visible regardless of screen size
 * so there's always a way to authenticate and change the theme on narrow viewports.
 *
 * @example
 * <UnauthMenu />
 */
export function UnauthMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Menu
      isOpen={open}
      onClose={() => setOpen(false)}
      align="right"
      contents={
        <div className="py-1 min-w-40">
          <MenuItem href="/help" onClick={() => setOpen(false)}>
            <HelpCircleIcon className="size-4" />
            Help
          </MenuItem>
          <ThemeMenuItem />
          <MenuItem
            onClick={() => {
              setOpen(false);
              window.location.assign(
                `/signin?callbackUrl=${encodeURIComponent(window.location.href)}`,
              );
            }}
          >
            <LogInIcon className="size-4" />
            Sign in
          </MenuItem>
        </div>
      }
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserIcon className="size-4" />
      </Button>
    </Menu>
  );
}
