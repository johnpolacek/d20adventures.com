# D20 Adventures Wiki Agent Guide

<!-- PROJECT-HTML-WIKI-SKILL:START v1 -->
This `wiki/` directory is the maintained knowledge and planning layer for `D20 Adventures`.

## Source Of Truth

- `index.md` is the wiki front door.
- `log.md` is the project-context changelog. Git owns routine implementation history.
- `Sources.md` catalogs source material, repository evidence, and unknowns.
- `plans/index.md` defines the planning contract.
- `roadmap.md` tracks the next useful project direction.
- `Architecture.md` captures cross-cutting architecture boundaries and risks.

## Rules

- Read `index.md` before structural wiki changes.
- Keep durable project knowledge, planning, decisions, and validation notes under `wiki/`.
- Preserve exact source material under `wiki/sources/` only when provenance matters.
- Update `index.md` when adding or materially changing durable pages.
- Update `log.md` after bootstrapping, planning, validation, or material project changes that affect durable project context.
- Write pages as GitHub-flavored Markdown with a short breadcrumb nav line, relative `.md` links, and tables instead of decorative HTML. Keep pages concise and scannable.

## Boundaries

Do not create root-level `docs/` or `tasks/` for maintained project knowledge.

## Automation Policy

Follow the root repo policy when it is more current. Default to committing local wiki or code changes when confident the work is correct and implementation questions are resolved. Ask before pushing or running long commands.

- Commit docs-only wiki changes: allow
- Commit code changes: allow
- Push changes: ask
- Install dependencies: allow
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- PROJECT-HTML-WIKI-SKILL:END -->
