"use client";

import { LogOutIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import { MenuItem } from "@/components/ui/Menu";

/**
 * Client-side sign-out button. Uses next-auth/react's `signOut` (not the
 * server action) so it can be invoked from an event handler.
 */
export function SignOutButton() {
  return (
    <MenuItem onClick={() => signOut({ callbackUrl: window.location.href })}>
      <LogOutIcon className="size-4" />
      Sign out
    </MenuItem>
  );
}
