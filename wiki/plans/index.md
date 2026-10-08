# Plans

[Wiki Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Updated for the desktop integration worktree on 2026-10-02. Implementation status does not imply production deployment.

## Active work

| Plan | Status | Next work |
|---|---|---|
| [Adventure store](feature-adventure-store.md) | Planned 2026-10-08. Owner chose selling first-party adventures, with solo and host mode free. | Phase 1, catalog and entitlements. Stripe test keys for phase 2. |
| [Roll results in the narration](roll-results.md) | Implemented on main 2026-10-05. A roll's paragraph shows the d20 landing, the total against the DC and a stamped verdict. | Owner review. |
| [Covert Cargo: the meeting inside the boat](covert-cargo-boat-meeting.md) | Implemented on main 2026-10-05. One larger saloon for every boat encounter, restaged to the source, intro edited, walks through doors. | Owner play-through. |
| [Desktop module covers](desktop-module-covers.md) | Implemented on main 2026-10-04. Painted module-style covers and a module cover layout for the New game screen. | Owner review. |
| [Harvest Festival handoff](harvest-festival-handoff.md) | Implementation stopped at owner request. No scene code changed. | Resume from inspected integration points, authored NPCs, and validation steps. |
| [Stageview](stageview.md) | Desktop gate scene connected to the real local turn flow in this worktree. | More authored sets, per-turn beats, and encounter coverage. |
| [Stage-first turn mock](feature-stage-turn-mock.md) | Scripted gate-scene demo merged 2026-10-01; public at `/demo/kordavos` for feedback. | Owner and playtester feedback, then the real turn page (Stageview phase 4). |
| [Covert Cargo in 3D](zzz-completed/covert-cargo-3d.md) | Merged into main 2026-10-04 and archived. Four sets, nine stagings and five character standees from the adventure's art, painted textures, leaf cards and water reflections, checked in the packaged app. | Owner play-through. The End's forest haze. |
| [Desktop heroes](zzz-completed/feature-desktop-heroes.md) | Merged into main 2026-10-04 and archived. Hero creation, a local roster, party setup with AI companions, all four Myr adventures, stock figures, and art painted through Codex or Grok. | Delete the worktree's Convex project in the dashboard. |
| [Desktop Stageview integration](zzz-completed/feature-desktop-stage-play.md) | Merged into main 2026-10-03 and archived. Both bundled adventures play in the desktop app, The Midnight Summons on every branch with 3D scenes. | Package distribution and more 3D sets. Character creation is in [Desktop heroes](zzz-completed/feature-desktop-heroes.md). |
| [Desktop local play](desktop-local-play.md) | Core extraction, desktop shell, and initial local save/CLI play implemented. Revenue and multiplayer direction revised 2026-10-07. | More sets, save management, optional pre-roll batching, broader gameplay, provider coverage, and distribution. |
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
