# D20 Adventures

**Home** · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md) · [Sources](Sources.md) · [Log](log.md)

D20 Adventures is a narrative RPG with an AI Game Master, authored adventures, D20 checks, and live turn state in Convex.

Desktop integration updated on 2026-10-03 in `feature/desktop-stage-play`, including durable character-state application and the Harvest Festival 3D scene. This worktree includes the committed GM core extraction. Main and production remain separate.

| Area | Current state |
|---|---|
| Gameplay | Text turn UI with Storyview audio and optional 2D Mapview. |
| Content | Four Realm of Myr adventures use the wiki runtime. Production cutover completed in June 2026. |
| Current priority | Desktop Stageview is connected to the local GM flow in this worktree. Extend authored set coverage and finish distribution. |
| Latest recorded renderer validation | 2026-09-29, engine build/typecheck/lint and GPU checks. Every tested shot stayed within 300 draw calls and 2.5M triangles. Phone performance remains unmeasured. |
| Latest gameplay validation | 2026-10-03, native Claude playthrough of The Midnight Summons start to finish, including a fight, the ending, and starting over. Also a native gate-to-festival advance into the new festival set, with NPC focus and cards, saved walks, and reopen without replay. 2026-10-02, native Claude gate playthrough with dice and reopen persistence. The isolated GM core worktree also completed Midnight Summons in seven turns and passed 16 Playwright tests. No production deployment. |

## Work and references

- [Plans](plans/index.md): Stageview delivery and maintenance backlog.
- [Harvest Festival handoff](plans/harvest-festival-handoff.md): handoff record. The festival scene was resumed and implemented on 2026-10-03.
- [Stageview](plans/stageview.md): owner decisions, remaining phases, release questions.
- [Desktop local play](plans/desktop-local-play.md): core extraction, native client, local saves, and character-state application implemented locally. Further sets, provider coverage, and distribution remain open. Free solo play through the player's own AI CLI. Multiplayer through a host's app, free. Revenue from selling adventures, decided 2026-10-07.
- [Adventure store](plans/feature-adventure-store.md): buying adventures on the website, linking the desktop app, and pack downloads.
- [Desktop Stageview integration](plans/zzz-completed/feature-desktop-stage-play.md): native game client, local saves, live turn flow, validation, and limits.
- [Stage engine](stage-engine.md): implemented runtime, set/staging specs, measured limits.
- [Stage set authoring](stage-authoring.md): the pattern for new 3D locations, web review first, then the desktop app.
- [Wiki adventures](wiki-adventures.md): authoring, compilation, source selection, and live content updates.
- [GM core](gm-core.md): portable game runtime, typed interfaces, server adapters, and extraction checks.
- [Gameplay flows](gameplay-flows.md): creation, turns, dice, NPCs, and completion.
- [Mapview](plans/mapview.md): stored 2D maps, generation, and token placement.
- [Storyview](storyview.md): narration, caching, automatic generation, and charging.
- [Testing runbook](plans/testing-runbook.md): commands, routes, and coverage limits.
- [Worktree guide](plans/parallel-dev-worktrees.md): retired 2026-10-08. Feature work happens on branches off main.
- [Wiki maintenance guide](AGENTS.md): documentation rules.

## Product context

[Product](sources/prd.md) · [Technical](sources/technical-brief.md) · [Design](sources/design-brief.md) · [Marketing](sources/marketing-brief.md)

Git preserves completed implementation history. Current contracts live in reference pages, and unfinished work lives in active plans. Commits are allowed when confident. Pushes and long-running operations require confirmation under the repository policy.
