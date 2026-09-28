import { auth, PREVIEW_USER } from "@/auth";
import { getSerialBySlug, checkSerialAdminMembership } from "@/data/serials/queries";
import { fetchPageSerialId } from "@/data/pages/queries";

/**
 * Returns `true` when the currently authenticated user is an admin of the given
 * serial. Never throws - safe to call from Server Component render functions
 * where a hard error would break the page for all visitors.
 *
 * Use `requireSerialAdmin` (which throws) in Server Actions where an
 * unauthenticated call must be rejected.
 *
 * @example
 * const isAdmin = await isSerialAdmin(serial.id);
 * return <PageEditor isAdmin={isAdmin} ... />;
 */
export async function isSerialAdmin(serialId: number): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  if (session.user.id === PREVIEW_USER.id) return true;

  return checkSerialAdminMembership(session.user.id, serialId);
}

/**
 * Asserts that the currently authenticated user is an admin of the given serial.
 * Throws an error (caught by Next.js and surfaced as a 500) if the session is
 * missing or the user is not in `serial_admins` for this serial.
 *
 * Call this at the top of every mutating Server Action that is scoped to a serial.
 *
 * @example
 * export async function deleteChapter(serialId: number, formData: FormData) {
 *   await requireSerialAdmin(serialId);
 *   // ... rest of action
 * }
 */
export async function requireSerialAdmin(serialId: number): Promise<string> {
  const session = await auth();
  if (!session?.user?.id)
    throw new Error("Unauthorized: sign in to perform this action.");

  const userId = session.user.id;
  if (userId === PREVIEW_USER.id) return userId;

  const isAdmin = await checkSerialAdminMembership(userId, serialId);
  if (!isAdmin)
    throw new Error("Unauthorized: you are not an admin of this serial.");

  return userId;
}

/**
 * Resolves the serial ID from a URL slug, then delegates to `requireSerialAdmin`.
 * Use this in page-level Server Actions that receive `serialSlug` instead of `serialId`.
 *
 * @example
 * export async function savePageContent(serialSlug: string, ...) {
 *   await requireSerialAdminBySlug(serialSlug);
 *   // ...
 * }
 */
export async function requireSerialAdminBySlug(
  serialSlug: string,
): Promise<string> {
  const serial = await getSerialBySlug(serialSlug);

  if (!serial) throw new Error("Serial not found.");

  return requireSerialAdmin(serial.id);
}

/**
 * Returns the authenticated user's id, or null if no session exists.
 * Never throws - safe to call from Server Component render functions.
 * Use `requireAuthenticated` (which throws) in Server Actions.
 *
 * @example
 * const userId = await isAuthenticated();
 * return <PageEditor isAuthenticated={!!userId} ... />;
 */
export async function isAuthenticated(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Asserts that a session exists and returns the user id.
 * Throws if no session - caught by Next.js and surfaced as a 500.
 * Call at the top of Server Actions that require any login (not necessarily admin).
 *
 * @example
 * export async function submitPageSuggestion(...) {
 *   const userId = await requireAuthenticated();
 *   // ...
 * }
 */
export async function requireAuthenticated(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id)
    throw new Error("Unauthorized: sign in to perform this action.");
  return session.user.id;
}

/**
 * Resolves the serial ID from a page ID, then delegates to `requireSerialAdmin`.
 * Use this in page-level Server Actions that receive only a `pageId` (e.g. section management).
 *
 * @example
 * export async function addPageSection(formData: FormData) {
 *   const pageId = parseInt(formData.get('pageId') as string, 10);
 *   await requireSerialAdminByPageId(pageId);
 *   // ...
 * }
 */
export async function requireSerialAdminByPageId(
  pageId: number,
): Promise<string> {
  const serialId = await fetchPageSerialId(pageId);

  if (!serialId) throw new Error("Page not found.");

  return requireSerialAdmin(serialId);
}
