import { cache } from "react";
import { db } from "@/db/index";
import { serials, serialAuthors, serialAdmins, users } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type { SerialRow, SerialAdminStub } from "@/types";

/**
 * Fetches the full serial row by its URL slug. Returns `undefined` when no
 * serial matches, so callers can call `notFound()` immediately.
 *
 * Wrapped in `React.cache()` so that when the layout and its nested page both
 * call this function in the same request they share a single DB round-trip.
 */
export const getSerialBySlug = cache(async function getSerialBySlug(
  serialSlug: string,
): Promise<SerialRow | undefined> {
  const [row] = await db
    .select()
    .from(serials)
    .where(eq(serials.slug, serialSlug))
    .limit(1);
  return row;
});

/**
 * Returns the ordered author names for a serial, ready to pass to `<SerialMetadataEditor>`.
 */
export async function fetchSerialAuthors(serialId: number): Promise<string[]> {
  const rows = await db
    .select({ name: serialAuthors.name })
    .from(serialAuthors)
    .where(eq(serialAuthors.serialId, serialId))
    .orderBy(serialAuthors.displayOrder);
  return rows.map((r) => r.name);
}

/**
 * Returns all admins for a serial joined with their usernames, ordered by grant date.
 * Used by the admin management panel to display and revoke admin access.
 */
export async function fetchSerialAdmins(
  serialId: number,
): Promise<SerialAdminStub[]> {
  return db
    .select({ userId: serialAdmins.userId, username: users.username })
    .from(serialAdmins)
    .innerJoin(users, eq(serialAdmins.userId, users.id))
    .where(eq(serialAdmins.serialId, serialId))
    .orderBy(asc(serialAdmins.grantedAt));
}

/**
 * Returns all serial rows, ordered by insertion order. Used by the home page to
 * list every wiki on the platform.
 */
export async function fetchAllSerials(): Promise<SerialRow[]> {
  return db.select().from(serials);
}

/**
 * Returns `true` when `userId` is in `serial_admins` for `serialId`. Does not
 * throw — safe for Server Component render paths where a hard error would break
 * the page for all visitors.
 */
export async function checkSerialAdminMembership(
  userId: string,
  serialId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: serialAdmins.userId })
    .from(serialAdmins)
    .where(
      and(eq(serialAdmins.userId, userId), eq(serialAdmins.serialId, serialId)),
    )
    .limit(1);
  return !!row;
}
