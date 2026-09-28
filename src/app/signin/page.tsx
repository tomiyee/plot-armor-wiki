import { signIn } from "@/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";

/**
 * Custom sign-in page replacing the default NextAuth UI.
 *
 * Shows the Google OAuth button on all environments. In Vercel Preview
 * environments, a "Developer Login" button is also shown so contributors
 * can test auth-dependent features without Google OAuth (which does not
 * support wildcard preview URLs).
 *
 * `callbackUrl` is forwarded to `signIn()` so that after authentication
 * the user is returned to the page they came from — including the correct
 * preview origin — instead of being redirected to the production URL.
 *
 * @example
 * // Linked from AuthControls and UnauthMenu as "/signin"
 * <Link href="/signin">Sign in</Link>
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const isPreview = process.env.VERCEL_ENV === "preview";

  const [{ callbackUrl }, hdrs] = await Promise.all([searchParams, headers()]);
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = (hdrs.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const redirectTo = callbackUrl ?? (host ? `${proto}://${host}/` : "/");

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <Text variant="h2">Sign in</Text>
          <Text variant="body" muted>
            to continue to PlotArmor
          </Text>
        </div>

        <div className="space-y-3">
          {/* Google OAuth — always shown */}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <Button type="submit" className="w-full" variant="outline">
              Continue with Google
            </Button>
          </form>

          {/* Developer login — preview environments only */}
          {isPreview && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <form
                action={async () => {
                  "use server";
                  await signIn("credentials", { redirectTo });
                }}
              >
                <Button
                  type="submit"
                  className="w-full"
                  variant="secondary"
                >
                  Developer Login (Preview Only)
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
