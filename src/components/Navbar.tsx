"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldHalfIcon } from "lucide-react";
import { useNavbarSerialContext } from "@/contexts/NavbarSerialContext";
import { PagesDropdown } from "@/components/navbar/PagesDropdown";
import { SerialSearch } from "@/components/navbar/SerialSearch";
import { MobileMenuDrawer } from "@/components/navbar/MobileMenuDrawer";
import { Box } from "./ui/Box";

type NavbarProps = {
  /** Server-rendered auth controls (sign-in button or avatar + sign-out). Passed as a slot from the server layout so `auth()` can be called there. */
  authSlot: ReactNode;
};

/**
 * Global top navbar. When on a serial route, the serial layout injects typed
 * data (serial title + schemas) and pre-rendered ChapterSelector/TOC slots via
 * NavbarSerialContext. When not on a serial route, only the logo and auth
 * controls are shown.
 *
 * Layout by breakpoint:
 * - Mobile (<md): hamburger (or logo if no serial) | serial title · · search + chapter selector + auth
 * - Desktop (md+): logo | serial title | Pages | TOC button · · search + chapter selector + auth
 *
 * `authSlot` is passed from the root server layout (which can call `auth()`)
 * so the Navbar can remain a client component while still displaying
 * server-side auth state.
 *
 * The left-side container uses `suppressHydrationWarning` because serial data
 * is injected client-side via `useLayoutEffect` - the server renders it empty
 * and the client fills it in before the first paint.
 *
 * @example
 * // Rendered once in the root layout:
 * <Navbar authSlot={<AuthControls />} />
 */
export default function Navbar(props: NavbarProps) {
  const { authSlot } = props;
  const { serialData, chapterSelectorSlot, tocSlot, tocContent } =
    useNavbarSerialContext();

  return (
    <nav className="sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto max-w-(--content-width) w-full px-4 py-2 flex items-center justify-between gap-4 min-h-13.5">
        {/* Left: hamburger (mobile) or logo (desktop) + serial breadcrumb + Pages + TOC */}
        <div className="flex items-center gap-2 min-w-0" suppressHydrationWarning>
          {/* Mobile: hamburger replaces the logo */}
          <div className="md:hidden shrink-0">
            {serialData ? (
              <MobileMenuDrawer
                serialTitle={serialData.serialTitle}
                serialSlug={serialData.serialSlug}
                categories={serialData.categories}
                tocContent={tocContent}
              />
            ) : (
              <Link
                href="/"
                aria-label="PlotArmor home"
                className="flex items-center text-xl font-bold tracking-tight"
              >
                <ShieldHalfIcon className="size-5" />
              </Link>
            )}
          </div>
          {/* Desktop: full logo with wordmark. Hide wordmark when a serial is active. */}
          <Link
            href="/"
            aria-label="PlotArmor home"
            className="hidden md:flex items-center gap-2 text-xl font-bold tracking-tight shrink-0"
          >
            <ShieldHalfIcon className="size-5" />
            {!serialData && <span>PlotArmor</span>}
          </Link>
          {serialData && (
            <>
              <Link
                href={`/${serialData.serialSlug}`}
                className="truncate min-w-0 text-sm font-medium text-foreground/70 hover:text-foreground max-w-40"
              >
                {serialData.serialTitle}
              </Link>
              {/* Pages dropdown + TOC button: desktop only (mobile lives in hamburger drawer) */}
              <div className="hidden md:flex items-center gap-1">
                <PagesDropdown
                  serialSlug={serialData.serialSlug}
                  categories={serialData.categories}
                />
                {tocSlot}
              </div>
            </>
          )}
        </div>
        {/* Right: search + chapter selector + auth */}
        <Box className="gap-2 items-center">
          {serialData && (
            <SerialSearch
              serialSlug={serialData.serialSlug}
              isAdmin={serialData.isAdmin}
            />
          )}
          {chapterSelectorSlot}
          {authSlot}
        </Box>
      </div>
    </nav>
  );
}
