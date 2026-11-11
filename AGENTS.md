# AGENTS.md instructions for /Users/johnpolacek/Projects/d20adventures.com

Auto-commit local changes whenever confident that the code is good and there are no questions about implementation. Prefer to pull before work when it is safe and useful.

## D20 Adventures Agent Guide

### Working Rules

- Inspect existing files and Git state before writing.
- Preserve user-authored files and existing Git history.
- For admin/editor UI, keep surfaces dense and operational: do not add explanatory helper text, status phrases, or "what this does" copy unless the user asks for it or it is required for accessibility, validation, or error handling.
- Name unknowns and contradictions instead of inventing certainty.

### Encounter Authoring

- Initial NPC map placement must match the intro's implied distance: an NPC whose intro reads as a close ambush should set `startNear: "party"` on its ref in the encounter frontmatter ("distant"/absent keeps the default far placement; a zone/label name targets that spot). After changing staging hints, re-place tokens on stored maps with `scripts/mapview-replace-tokens.ts`.
- Run `pnpm stage:sync` before pushing new or changed files in `public/stage`, `public/stage-lab` or `public/images/app/backgrounds`. Vercel deploys leave them out and the site serves them from the public bucket.

### Automation Policy

- Commit code changes: allow
- Push changes: allow
- Install dependencies: allow
- Run long commands: ask
- Create plans before code: optional, large work only

## Branches

Owner decision, 2026-10-10: the project is back in alpha with no players, so work happens directly on `main`. This replaces the 2026-10-08 decision to use feature branches. Worktrees return at beta.

- Commit to `main` in the main checkout. Do not create feature branches or git worktrees, and do not run `pnpm wt:create`.
- `pnpm dev` starts Convex, the website, and the desktop app pointed at the local website. `pnpm dev:web` starts the website alone, and `pnpm dev:app` the app alone.
- `pnpm dev` does not kill ports. Use `pnpm dev:fresh` to kill ports first.
- The `wt:*` scripts remain for reference until beta.
