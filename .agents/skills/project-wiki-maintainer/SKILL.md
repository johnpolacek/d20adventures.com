---
name: project-wiki-maintainer
description: Maintain this repository's HTML-first project wiki, source briefs, roadmap, planning index, and durable project-context log.
---

# Project Wiki Maintainer

Use this repo-local skill whenever work changes durable project knowledge for D20 Adventures.

## Workflow

1. Read `AGENTS.md`, `wiki/AGENTS.md`, and `wiki/index.html`.
2. For substantial code, config, schema, dependency, architecture, build, test, or user-facing behavior changes, inspect `wiki/plans/index.html` and create or update the closest plan before implementation unless the change is small, local, and reversible.
3. Preserve project context in `wiki/`, not root-level `docs/` or ad hoc task files.
4. Update `wiki/Sources.html` and relevant source briefs when source truth changes.
5. Append `wiki/log.html` only for durable decisions, bootstrap/import events, planning changes, validation results that affect roadmap state, or source-context changes.

## HTML Artifacts

Generated wiki pages must be standalone HTML documents with embedded CSS, relative links, accessible headings, responsive layouts, and no external dependencies.

## Automation Policy

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: ask
- Run long commands: ask
- Create plans before code: meaningful-only
