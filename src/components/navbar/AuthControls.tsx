import { auth } from "@/auth";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { UserMenu } from "@/components/navbar/UserMenu";
import { UnauthMenu } from "@/components/navbar/UnauthMenu";

/**
 * Server Component that reads the Auth.js session and renders either
 * a sign-in button + user icon (unauthenticated) or a user avatar dropdown
 * (authenticated). Rendered in the root layout so it is never stale.
 *
 * When unauthenticated: the sign-in button is hidden on narrow viewports
 * (sm:), but the user icon is always visible and opens a menu with a
 * sign-in link and the theme toggle.
 *
 * @example
 * // Inside a Server Component layout:
 * <AuthControls />
 */
export async function AuthControls() {
  const session = await auth();

  if (!session?.user) {
    return (
      <>
        <Link href="/signin" className="hidden sm:block">
          <Button size="sm">Sign in</Button>
        </Link>
        <UnauthMenu />
      </>
    );
  }

  const { name, image } = session.user;
  return <UserMenu name={name} image={image} />;
}
