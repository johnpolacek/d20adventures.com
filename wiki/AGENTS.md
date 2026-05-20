# D20 Adventures Wiki Agent Guide

<!-- PROJECT-HTML-WIKI-SKILL:START v1 -->
This `wiki/` directory is the maintained knowledge and planning layer for `D20 Adventures`.

## Source Of Truth

- `index.html` is the wiki front door.
- `log.html` is the project-context changelog. Git owns routine implementation history.
- `Sources.html` catalogs source material, repository evidence, and unknowns.
- `plans/index.html` defines the planning contract.
- `roadmap.html` tracks the next useful project direction.
- `Architecture.html` captures cross-cutting architecture boundaries and risks.

## Rules

- Read `index.html` before structural wiki changes.
- Keep durable project knowledge, planning, decisions, and validation notes under `wiki/`.
- Preserve exact source material under `wiki/sources/` only when provenance matters.
- Update `index.html` when adding or materially changing durable pages.
- Update `log.html` after bootstrapping, planning, validation, or material project changes that affect durable project context.
- Use standalone HTML pages with embedded CSS, relative links, semantic structure, and accessible tables, diagrams, or controls when they improve readability.

## Boundaries

Do not create root-level `docs/` or `tasks/` for maintained project knowledge.

## Automation Policy

Default to asking before committing, pushing, installing dependencies, or running long commands unless the user chooses a more automated repo policy.

- Commit docs-only wiki changes: ask
- Commit code changes: ask
- Push changes: ask
- Install dependencies: ask
- Run long commands: ask
- Create plans before code: meaningful-only
<!-- PROJECT-HTML-WIKI-SKILL:END -->
