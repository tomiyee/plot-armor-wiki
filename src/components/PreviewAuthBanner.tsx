import { auth } from "@/auth";
import { PREVIEW_USER } from "@/auth";

/**
 * Server Component that renders a visible banner when the active session
 * belongs to the preview-only developer account. This helps contributors
 * avoid confusing a preview session with a real user account.
 *
 * Renders nothing in production or when no session is active.
 *
 * @example
 * // Place above <main> in the root layout:
 * <PreviewAuthBanner />
 */
export async function PreviewAuthBanner() {
  const session = await auth();

  if (session?.user?.email !== PREVIEW_USER.email) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-yellow-400/90 px-4 py-1.5 text-center text-sm font-medium text-yellow-950 dark:bg-yellow-500/80 dark:text-yellow-950"
    >
      <span className="size-2 rounded-full bg-yellow-700" />
      Preview Authentication Active — this is a test account
    </div>
  );
}
