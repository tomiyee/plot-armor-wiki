import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isSiteAdmin } from "@/lib/auth-guard";

type AdminLayoutProps = {
  /** Admin tool page. */
  children: ReactNode;
};

/**
 * Gate for all `/admin` routes. Responds 404 (not 403) so the route's
 * existence is not advertised when tooling is disabled or the user is not a
 * site admin.
 */
export default async function AdminLayout(props: AdminLayoutProps) {
  const { children } = props;
  if (!(await isSiteAdmin())) notFound();
  return <main className="flex-1 min-h-0 overflow-y-scroll">{children}</main>;
}
