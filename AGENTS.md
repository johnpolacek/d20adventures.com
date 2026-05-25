# AGENTS.md instructions for /Users/johnpolacek/Projects/d20adventures.com

Prefer to commit and pull whenever confident that the code is good and there are no questions about implementation.

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

### Automation Policy

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: allow
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- PROJECT-HTML-WIKI-SKILL:END -->
