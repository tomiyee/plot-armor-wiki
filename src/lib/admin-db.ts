import { cookies } from "next/headers";
import { getDbFor } from "@/db/index";
import type { DbEnv } from "@/db/index";

/** Cookie holding the admin's chosen target database. */
export const ADMIN_DB_COOKIE = "plotarmor_admin_db";

/**
 * The database `/admin` tools read and write, chosen per browser via cookie.
 * Defaults to dev so prod is only touched after an explicit switch.
 */
export async function getAdminDbEnv(): Promise<DbEnv> {
  const raw = (await cookies()).get(ADMIN_DB_COOKIE)?.value;
  return raw === "prod" ? "prod" : "dev";
}

/** Drizzle client for the admin's chosen database (see `getAdminDbEnv`). */
export async function getAdminDb() {
  return getDbFor(await getAdminDbEnv());
}
