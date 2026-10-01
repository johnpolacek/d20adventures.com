# Plans

[Wiki Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Reviewed against local main on 2026-10-01. Implementation status does not imply production deployment.

## Active work

| Plan | Status | Next work |
|---|---|---|
| [Stageview](stageview.md) | Old 3D stack removed. Engine and first set merged on 2026-09-29. Gameplay integration is not built. | Staging scripts and festival set, then the stage-first turn page and encounter coverage. |
| [Desktop local play](desktop-local-play.md) | Proposed 2026-10-01. Tauri app, free solo play through the player's own AI CLI, paid online multiplayer. No code yet. | Phase 0 spike: CLI latency, JSON validity, and GM quality. Then extract `gm-core`. |
| [Maintenance follow-ups](maintenance.md) | Open findings and unverified follow-ups carried forward from completed work. | Test harness, authoring edge cases, narration validation, and environment cleanup. |

## Maintained references

| Guide | Scope |
|---|---|
| [Mapview](mapview.md) | Implemented 2D maps, storage, generation, placement, and catalog rules. |
| [Storyview](../storyview.md) | Implemented narration, incremental caching, and token charging. |
| [Stage engine](../stage-engine.md) | Implemented set/staging specs, rendering, and dated performance evidence. |
| [Wiki adventures](../wiki-adventures.md) | Content contracts, authoring, source selection, and turn persistence. |
| [Testing runbook](testing-runbook.md) | Current commands, routes, browser checks, and known test limits. |
| [Parallel dev worktrees](parallel-dev-worktrees.md) | Implemented pnpm wt commands and isolation rules. |

## Plan lifecycle

Create a plan before meaningful behavior, architecture, schema, dependency, build, or test changes. Record current state, remaining work, decisions, and validation. Small local fixes do not need a plan.

`wt:finish` still moves branch plans into `wiki/plans/zzz-completed/`. During wiki maintenance, move useful contracts into reference pages, carry open work into an active plan, record the outcome in [the log](../log.md), and delete redundant completed plans. Git preserves implementation history.

The completed-plan archive and obsolete Stageview comparison images were removed on 2026-10-01. Migration inputs under `wiki/sources/adventure plans/` remain because scripts still read them.
