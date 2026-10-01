# D20 Adventures

**Home** · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md) · [Sources](Sources.md) · [Log](log.md)

D20 Adventures is a narrative RPG with an AI Game Master, authored adventures, D20 checks, and live turn state in Convex.

Reviewed against local main on 2026-10-01.

| Area | Current state |
|---|---|
| Gameplay | Text turn UI with Storyview audio and optional 2D Mapview. |
| Content | Four Realm of Myr adventures use the wiki runtime. Production cutover completed in June 2026. |
| Current priority | Integrate Stageview as the primary play screen. Its engine and first set are merged, but gameplay integration is still future work. |
| Latest recorded renderer validation | 2026-09-29, engine build/typecheck/lint and GPU checks. Every tested shot stayed within 300 draw calls and 2.5M triangles. Phone performance remains unmeasured. |
| This review | Documentation, source, and history audit. No new gameplay test or deployment claim. |

## Work and references

- [Plans](plans/index.md): Stageview delivery and maintenance backlog.
- [Stageview](plans/stageview.md): owner decisions, remaining phases, release questions.
- [Stage engine](stage-engine.md): implemented runtime, set/staging specs, measured limits.
- [Wiki adventures](wiki-adventures.md): authoring, compilation, source selection, and live content updates.
- [Gameplay flows](gameplay-flows.md): creation, turns, dice, NPCs, and completion.
- [Mapview](plans/mapview.md): stored 2D maps, generation, and token placement.
- [Storyview](storyview.md): narration, caching, automatic generation, and charging.
- [Testing runbook](plans/testing-runbook.md): commands, routes, and coverage limits.
- [Worktree guide](plans/parallel-dev-worktrees.md): isolated Convex projects and local URLs.
- [Wiki maintenance guide](AGENTS.md): documentation rules.

## Product context

[Product](sources/prd.md) · [Technical](sources/technical-brief.md) · [Design](sources/design-brief.md) · [Marketing](sources/marketing-brief.md)

Git preserves completed implementation history. Current contracts live in reference pages, and unfinished work lives in active plans. Commits are allowed when confident. Pushes and long-running operations require confirmation under the repository policy.
