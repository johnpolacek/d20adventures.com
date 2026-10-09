# AGENTS.md instructions for /Users/johnpolacek/Projects/d20adventures.com

Auto-commit local changes whenever confident that the code is good and there are no questions about implementation. Prefer to pull before work when it is safe and useful.

<!-- PROJECT-HTML-WIKI-SKILL:START v1 -->
## D20 Adventures Agent Guide

### Project Wiki

- Read `wiki/index.md` before answering project-specific questions or making structural changes.
- Keep durable project knowledge, plans, decisions, and project-context history under `wiki/`.
- Use `wiki/Sources.md` as the source index.
- Create or update `wiki/plans/` before meaningful code, config, schema, dependency, architecture, test, build, or app behavior changes.
- Do not create plans for small, local, reversible fixes that do not change product behavior, architecture, schema, dependencies, build configuration, public APIs, security posture, or durable project direction.
- Sync recent codebase changes back into `wiki/log.md`, relevant plans, roadmap, and source docs when work happened before planning or made the wiki stale.
- Update `wiki/index.md` when adding or materially changing durable wiki pages.
- Update `wiki/log.md` after bootstrapping, planning, validation, or material project changes that affect durable project context.

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

## Branches

Owner decision, 2026-10-08: feature work happens on branches off `main` in the main checkout, not in git worktrees.

- Create a feature branch from an up-to-date `main` (`git switch -c feature/<name>`). Never create git worktrees or run `pnpm wt:create`.
- Put the feature's plan at `wiki/plans/<slug>.md` on the branch before meaningful work.
- The branch shares main's dev Convex deployment, S3 buckets, and Clerk dev instance. Keep schema changes additive until the branch merges.
- `pnpm dev` does not kill ports. Use `pnpm dev:fresh` to kill ports first.
- Merge with `--no-ff` to preserve feature history. Do not merge with uncommitted changes.
- The `wt:*` scripts and `wiki/plans/parallel-dev-worktrees.md` remain for reference only.
