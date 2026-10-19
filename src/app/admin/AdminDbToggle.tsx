"use client";

import { Select } from "@/components/ui/Select";
import { Text } from "@/components/ui/Text";
import { useServerAction } from "@/hooks/useServerAction";
import type { DbEnv } from "@/db/index";
import { setAdminDbEnv } from "./actions";

type AdminDbToggleProps = {
  /** Database currently targeted by the admin tools. */
  env: DbEnv;
};

const OPTIONS = [
  { label: "DEV database", value: "dev" as DbEnv },
  { label: "PROD database", value: "prod" as DbEnv },
];

/**
 * Admin-wide target DB picker. The bar turns red on PROD so it's obvious
 * that previews and applies hit production data.
 */
export function AdminDbToggle(props: AdminDbToggleProps) {
  const { env } = props;
  const { runAsync, isPending } = useServerAction();
  const prod = env === "prod";
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 border-b ${prod ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}
    >
      <Text variant="label">Target:</Text>
      <Select
        options={OPTIONS}
        value={env}
        searchable={false}
        disabled={isPending}
        className="w-48"
        onChange={(v) => {
          if (v === env) return;
          if (
            v === "prod" &&
            !window.confirm("Switch admin tools to the PRODUCTION database?")
          )
            return;
          runAsync(() => setAdminDbEnv(v));
        }}
      />
      {prod && <Text variant="label">⚠️ Changes apply to production data</Text>}
    </div>
  );
}
