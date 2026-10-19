import type { TextMigration } from "../types";

/** Normalizes Windows line endings pasted into editors to `\n`. */
export const normalizeCrlf: TextMigration = {
  id: "2026-10-18-normalize-crlf",
  description: "Normalize CRLF / CR line endings to LF in all stored markdown.",
  targets: ["sectionContent", "infoboxValue", "synopsis"],
  transform: (old) => old.replace(/\r\n?/g, "\n"),
};
