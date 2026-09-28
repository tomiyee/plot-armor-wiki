import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Redirect authenticated users who have not yet chosen a username to
 * /onboarding. Skips /api/auth/** and /onboarding itself to avoid loops.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/signin")
  ) {
    return NextResponse.next();
  }

  if (req.auth?.user && req.auth.user.username === null) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
