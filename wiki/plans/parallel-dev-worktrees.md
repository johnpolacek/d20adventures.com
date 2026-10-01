# Parallel Dev Worktrees

[Plans](index.md) · [Wiki Home](../index.md)

Status: Implemented operating guide. Reviewed against `scripts/wt.sh` and `package.json` on 2026-10-01.

## Goal

Support multiple feature branches developed in parallel via git worktrees, each with its own dev server URL (no port conflicts) and its own isolated Convex backend (no shared mutable database state).

## Isolation and setup

- The "database" is Convex. The workflow isolates each branch in a **per-worktree Convex project**, provisioned with `npx convex dev --once --configure new --project d20adventures-<slug> --dev-deployment cloud`.
- The script provisions a fresh cloud Convex project. It does not clone deployment environment variables. Review any new server-side environment requirements when adding them.
- Seeding a worktree backend from main uses `npx convex export` (main) + `npx convex import --replace-all -y` (worktree).
- The workflow requires a globally available Portless CLI. `next dev -p ${PORT:-3000}` honors the `PORT` env var Portless injects.
- `.env` and `.env.local` are gitignored. any `CONVEX_DEPLOYMENT` / `NEXT_PUBLIC_CONVEX_URL` values must be stripped when creating a worktree so Convex provisioning writes fresh values.
- S3 buckets and the Clerk dev instance remain shared across worktrees. Mitigation: worktrees default `NEXT_PUBLIC_USE_PLACEHOLDER_IMAGES=true`. doctor warns about shared S3/Clerk. avoid parallel work that mutates shared user/token state.

## Design

- Integration checkout: `main` at the repo root. Feature worktrees at `../d20adventures.com.worktrees/<branch-slug>`.
- URLs: `https://d20adventures.localhost` for main, `https://<branch-slug>.d20adventures.localhost` for worktrees, via Portless.
- One driver script `scripts/wt.sh` with subcommands, exposed as `pnpm wt:*`:
  - `wt:doctor` , environment and isolation checks
  - `wt:create <branch>` , worktree + env strip/augment + `pnpm install --ignore-scripts` + new Convex project + plan skeleton
  - `wt:seed <branch>` , clone main's Convex data into the worktree's project
  - `wt:list` / `wt:resume <branch>` , status, URLs, plans, next steps
  - `wt:dev` , run `pnpm dev` behind the branch's Portless name
  - `wt:open <branch>` , open the worktree URL
  - `wt:finish <branch>` , clean checks, ff-pull, overlap check, plan → `zzz-completed/`, merge (no-ff), remove worktree + branch, prune
  - `wt:clean` , prune stale worktree metadata, report orphans (no destructive deletes)
- `pnpm dev` no longer runs `kill:ports` (it killed sibling worktree servers). `dev:fresh` preserves the old behavior. `test` uses `dev:fresh` so test runs still get clean ports.
- Finish policy: **merge** (no-ff), preserving feature history.
- Plans: active at `wiki/plans/<branch-slug>.md`, completed moved to `wiki/plans/zzz-completed/` during finish. Consolidate useful reference material and unresolved work, then delete redundant completed plans during wiki maintenance.
- `wt:finish` appends a finished line but does not update the old status or relative links. Reconcile those before keeping an archived plan.
- `pnpm test` still waits on ports 3000 and 4000. Use `test:run` against the selected server until the wrapper is repaired. See [Testing](testing-runbook.md).

## Out of Scope / Known Gaps

- Convex project deletion has no CLI. `wt:finish` prints a dashboard reminder.
- S3 key namespacing per worktree (not built. placeholder images + doctor warning instead).
- Clerk per-worktree instances (shared dev instance. `*.d20adventures.localhost` origins may need adding in Clerk dashboard if auth redirects fail).
