---
name: update-docs
description: Update project documentation to reflect the current state of the branch.
---

Update project documentation to reflect the current state of the branch.

## Steps

1. **Identify what changed.** Run `git diff main...HEAD --stat` and `git log main...HEAD --oneline` to get the full picture of what this branch adds or changes.

2. **Update `spec.md`** if the branch changes any data model, URL structure, spoiler logic, or architectural decisions described there. Keep it accurate — do not add aspirational content, only reflect what is implemented.

3. **Update `CLAUDE.md`** if the branch changes the tech stack, key design files, commands, or architectural patterns described there. The "Progress state" and tech stack table are the most likely sections to drift.

4. **Update `README.md`** if it exists and contains setup instructions, env var docs, or feature descriptions affected by the branch.

5. **Update `todo.md`** — for each step in the todo list, check whether the branch fully completes it. If a step is complete, strike it out with `~~` and append `✓` (matching the style of the already-completed Step 1). Do not mark a step complete if it is only partially done. Do not add new steps unless the user asks.

## Rules

- Edit only what is inaccurate or missing — do not rewrite sections that are still correct.
- Do not add speculative or future-looking content to any doc.
- If a file does not exist (e.g. no README.md), skip it silently.
- After all edits, briefly summarise which files were changed and why.
