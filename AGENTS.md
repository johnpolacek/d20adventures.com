# AGENTS.md instructions for /Users/johnpolacek/Projects/d20adventures.com

Auto-commit local changes whenever confident that the code is good and there are no questions about implementation. Prefer to pull before work when it is safe and useful.

<!-- PROJECT-HTML-WIKI-SKILL:START v1 -->
## D20 Adventures Agent Guide

### Project Wiki

- Read `wiki/index.html` before answering project-specific questions or making structural changes.
- Keep durable project knowledge, plans, decisions, and project-context history under `wiki/`.
- Use `wiki/Sources.html` as the source index.
- Create or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
- Do not create plans for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction.
- Sync recent codebase changes back into `wiki/log.html`, relevant plans, roadmap, and source docs when work happened before planning or made the wiki stale.
- Update `wiki/index.html` when adding or materially changing durable wiki pages.
- Update `wiki/log.html` after bootstrapping, planning, validation, or material project changes that affect durable project context.

### Working Rules

- Inspect existing files and Git state before writing.
- Preserve user-authored files and existing Git history.
- For admin/editor UI, keep surfaces dense and operational: do not add explanatory helper text, status phrases, or "what this does" copy unless the user asks for it or it is required for accessibility, validation, or error handling.
- Do not create root-level `docs/` or `tasks/` for durable planning.
- Name unknowns and contradictions instead of inventing certainty.

### Encounter Authoring

- Initial NPC map placement must match the intro's implied distance: an NPC whose intro reads as a close ambush should set `startNear: "party"` on its ref in the encounter frontmatter ("distant"/absent keeps the default far placement; a zone/label name targets that spot). After changing staging hints, re-place tokens on stored maps with `scripts/mapview-replace-tokens.ts`.

### Automation Policy

- Commit docs-only wiki changes: allow
- Commit code changes: allow
- Push changes: ask
- Install dependencies: allow
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- PROJECT-HTML-WIKI-SKILL:END -->

## Parallel Dev Worktrees

This repo supports parallel feature development with git worktrees. Full design: `wiki/plans/parallel-dev-worktrees.md`. Use the `wt:*` scripts instead of raw `git worktree` commands.

- `pnpm wt:doctor` — environment and isolation checks
- `pnpm wt:create <branch>` — sibling worktree at `../d20adventures.com.worktrees/<slug>`, env copied with Convex pointers stripped, `pnpm install`, fresh isolated Convex project `d20adventures-<slug>`, plan skeleton at `wiki/plans/<slug>.md`
- `pnpm wt:seed <branch>` — clone main's Convex data into the worktree's project (replaces its data)
- `pnpm wt:list` / `pnpm wt:resume <branch>` — status, URLs, plans
- `pnpm wt:dev` — start the dev server behind the checkout's Portless URL (`https://d20adventures.localhost` on main, `https://<slug>.d20adventures.localhost` in worktrees)
- `pnpm wt:open [branch]` — open the worktree URL
- `pnpm wt:finish <branch>` — requires clean checkouts; archives the plan to `wiki/plans/zzz-completed/`, merges with `--no-ff`, removes the worktree and branch
- `pnpm wt:clean` — prune stale metadata only (never deletes work)

Rules:

- One worktree per feature branch; `main` stays the integration checkout.
- Each worktree gets its own Convex project (isolated database). Never copy `CONVEX_DEPLOYMENT` / `NEXT_PUBLIC_CONVEX_URL` between worktrees.
- S3 buckets and the Clerk dev instance are shared across worktrees. Worktrees default to `NEXT_PUBLIC_USE_PLACEHOLDER_IMAGES=true`; avoid parallel work that mutates shared user/token state in Clerk.
- `pnpm dev` no longer kills ports (that would kill sibling worktree servers). Use `pnpm dev:fresh` for the old kill-ports-first behavior.
- Never delete, reset, or force-clean a dirty worktree without explicit user approval. Do not merge when either checkout is dirty.
- Finish policy is merge (no-ff), preserving feature history.
- After `wt:finish`, delete the worktree's Convex project `d20adventures-<slug>` in the Convex dashboard (no CLI for project deletion).
