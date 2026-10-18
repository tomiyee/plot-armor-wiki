import type { TextMigration } from "./types";
import { normalizeCrlf } from "./migrations/2026-10-18-normalize-crlf";

/**
 * All known text migrations, oldest first. Add one file per migration under
 * `./migrations/` and append it here; ids must be unique and stable.
 */
export const TEXT_MIGRATIONS: TextMigration[] = [normalizeCrlf];

/** Looks up a registered migration by id. */
export function getTextMigration(id: string): TextMigration | undefined {
  return TEXT_MIGRATIONS.find((m) => m.id === id);
}
