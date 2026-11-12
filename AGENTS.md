# AGENTS.md instructions for /Users/johnpolacek/Projects/d20adventures.com

Auto-commit local changes whenever confident that the code is good and there are no questions about implementation. Prefer to pull before work when it is safe and useful.

## D20 Adventures Agent Guide

### Working Rules

- Inspect existing files and Git state before writing.
- Preserve user-authored files and existing Git history.
- For admin/editor UI, keep surfaces dense and operational: do not add explanatory helper text, status phrases, or "what this does" copy unless the user asks for it or it is required for accessibility, validation, or error handling.
- Name unknowns and contradictions instead of inventing certainty.

### Where Things Live

- `packages/gm-core` is the game master: turn flow, NPC turns, rolls, narrative. Game logic goes here. It imports nothing from Next, Clerk or Convex and reaches the outside only through the ports in `src/ports.ts`.
- `lib/gm-server` binds that core to the website. Most of `lib/services` is one-line wrappers that call it, so logic does not go there. `turn-audio-service.ts` and `mailing-list.ts` are the exceptions.
- `apps/desktop` is the Tauri app. `apps/desktop/runtime` is its bundled Node game runtime: the same core over SQLite. `apps/desktop-spike` is a throwaway phase 0 spike, not the app.
- `packages/stage` is Stageview, the painted 3D encounter stage. `components/stage` is the React UI around it (HUD, dice, journal), shared by the site and the desktop app. `components/floorplan` is the site's top-down floor plan, drawn from the plans under `packages/stage/src/plans`, which `pnpm stage:plans` generates from the sets and stagings.
- Adventures are authored as markdown under `content/settings/<setting>/adventures/<adventure>/`. `lib/wiki-adventures` compiles and validates them. `data/adventure-plans/*.json` is the old format, referenced only by the `scripts/migrate-*` scripts.
- `app/` is the Next.js site. Server actions live in `app/_actions`, and `proxy.ts` is the Clerk middleware.
- `convex/` is the database and its functions. `convex/_generated` is written by `npx convex codegen`, so never edit it.
- `app/dev` and `lab/stage-art` are dev pages and experiments, not shipped features.
- `plans/` holds open multi-session plans. `plans/srd-rules.md` is the staged move to the full SRD 5.2.1 rules.

### Encounter Authoring

- Where everyone starts is the encounter's 3D staging (`packages/stage/src/stagings`): an NPC whose intro reads as a close ambush is staged close to the party's spots. The rules read each encounter's floor from its generated plan, so run `pnpm stage:plans` after changing a set or a staging. `pnpm stage:plans:check` fails on a stale one.
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
