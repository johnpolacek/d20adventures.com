# Plans

[Wiki Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Updated for the desktop integration worktree on 2026-10-02. Implementation status does not imply production deployment.

## Active work

| Plan | Status | Next work |
|---|---|---|
| [Stageview](stageview.md) | Desktop gate scene connected to the real local turn flow in this worktree. | More authored sets, per-turn beats, and encounter coverage. |
| [Stage-first turn mock](feature-stage-turn-mock.md) | Scripted gate-scene demo merged 2026-10-01; public at `/demo/kordavos` for feedback. | Owner and playtester feedback, then the real turn page (Stageview phase 4). |
| [Desktop Stageview integration](feature-desktop-stage-play.md) | Implemented locally. Native validation recorded in its plan. | Review the app, extend set coverage, and package distribution. |
| [Desktop local play](desktop-local-play.md) | Core extraction, desktop shell, and initial local save/CLI play implemented on unmerged branches. | More sets, save management, character-state application, optional pre-roll batching, broader gameplay, provider coverage, and distribution. |
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
