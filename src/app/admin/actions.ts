"use server";

import { cookies } from "next/headers";
import type { DbEnv } from "@/db/index";
import { requireSiteAdmin } from "@/lib/auth-guard";
import { ADMIN_DB_COOKIE } from "@/lib/admin-db";

/** Switches which database the `/admin` tools target for this browser. */
export async function setAdminDbEnv(env: DbEnv): Promise<void> {
  await requireSiteAdmin();
  if (env !== "dev" && env !== "prod") throw new Error(`Invalid DB: ${env}`);
  (await cookies()).set(ADMIN_DB_COOKIE, env, {
    httpOnly: true,
    sameSite: "strict",
    path: "/admin",
  });
}
