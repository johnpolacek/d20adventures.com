# Roadmap

[Home](index.md) · [Plans](plans/index.md) · [Architecture](Architecture.md) · [Log](log.md)

Updated 2026-10-02 in the desktop integration worktree. This separates implemented behavior from the chosen next direction.

## Now, Stageview integration

Stageview is the owner's chosen primary play screen, decided 2026-09-29. The engine, Myr crowd library, Kordavos gate set, and development preview are implemented. The web retains the text turn page. The unmerged `feature/desktop-stage-play` worktree adds native Stageview connected to local CLI generation and SQLite saves. See [desktop integration](plans/zzz-completed/feature-desktop-stage-play.md).

Next work:

1. Add further authored sets and staging. The Harvest Festival set exists on desktop in `feature/desktop-stage-play` (2026-10-03). Clan Conflict is next in March of Davos.
2. Extend the native turn UI with generated beats and narration synchronization. The gate scene now uses real local turns. The scripted web demo remains public at `/demo/kordavos`.
3. Cover encounters with authored or generic sets and default staging.
4. Verify phone landscape handling, accessibility, reduced motion, and text fallback on devices that cannot run the stage.

Details and open decisions: [Stageview](plans/stageview.md). Mapview becomes the larger-scale map (a city, wilderness travel, ruins), not a per-encounter backdrop (owner, 2026-09-29).

## Next, desktop local play

Proposed 2026-10-01. A Tauri desktop app becomes the only game client and web play is deprecated. Solo play is free and the GM runs through the player's own signed-in AI CLI. Multiplayer keeps the server GM, paid by a subscription that grants tokens. The stage-first turn page is built in the desktop app.

Phase 0 refinement proves strict field retention and five-call turns for Claude, Codex, and Grok. Combined full-turn samples took 22.5, 26.1, and 86.0 seconds, with dice rendered at 4.3, 6.8, and 24.2 seconds. Core extraction is complete locally in `feature/gm-core`, with production build, 16 Playwright tests, and a seven-turn authenticated playthrough passing. The native shell and SQLite saves are now implemented locally. A packaged Claude run reached the festival and resumed after restart. Codex's summary missed established events in that sample. The October 3 follow-up now applies typed character patches to live desktop state and preserves them across encounters. Broader gameplay, save management, distribution, and production auth remain future work. Gemini compatibility is independent after its provider rejected the tested login. Art and scoped Clerk/Convex checks passed. Details: [Desktop local play](plans/desktop-local-play.md#phase-0-spike).

## Maintenance

[Maintenance follow-ups](plans/maintenance.md) tracks the test-wrapper issue, production admin sign-in behavior, editor clearing, legacy completion, narration coverage, technical audits, and remote cleanup.

Security, realtime, and Convex audits remain proposed work. Older findings must be checked against current code before scheduling fixes.

## Later, community creation

- Setting creation with lore, factions, and visual identity.
- New adventure creation beyond the current registered modules.
- Community library, forks, and private/unlisted/public sharing.

These ambitions need scoped plans. The current admin editor improves existing adventures and does not establish a complete community publishing workflow.

## Implemented foundation

| Feature | State |
|---|---|
| Wiki adventures | Four Myr migrations, public/runtime cutover, validated admin writes, source fallback, and revision restore. |
| Play layout | Character rail, narrative, map/audio/chat surfaces, and responsive controls. |
| Mapview | Stored 2D maps, SVG catalog, admin generation, player rail/fullscreen view. |
| Storyview | Narration with stable voices, cached segments, incremental generation, and owner-controlled automatic narration. |
| Public rendering | Request-wide visit tracking removed, public content routes static, homepage personalization loaded through private APIs. |
| Stageview foundation | Old 3D stack removed and replacement engine merged. |

Historical milestones are in [the log](log.md). Merged code and production deployment are separate facts.
