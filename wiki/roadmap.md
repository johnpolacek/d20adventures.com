# Roadmap

[Home](index.md) · [Plans](plans/index.md) · [Architecture](Architecture.md) · [Log](log.md)

Reviewed 2026-10-01. This separates implemented behavior from the chosen next direction.

## Now, Stageview integration

Stageview is the owner's chosen primary play screen, decided 2026-09-29. The engine, Myr crowd library, Kordavos gate set, and development preview are implemented. Players still use the existing text turn page.

Next work:

1. Add staging scripts, set loops, and the Harvest Festival set.
2. Build the stage-first turn page with docked narrative/input, character art, beats, and Storyview synchronization. A scripted demo of the gate scene is merged and public at `/demo/kordavos` (2026-10-01): a staged intro, two rounds, step-through narration, and contest rolls with a 3D d20. See [Stage-first turn mock](plans/feature-stage-turn-mock.md).
3. Cover encounters with authored or generic sets and default staging.
4. Verify phone landscape handling, accessibility, reduced motion, and text fallback on devices that cannot run the stage.

Details and open decisions: [Stageview](plans/stageview.md). Mapview becomes the larger-scale map (a city, wilderness travel, ruins), not a per-encounter backdrop (owner, 2026-09-29).

## Next, desktop local play

Proposed 2026-10-01. A Tauri desktop app becomes the only game client and web play is deprecated. Solo play is free and the GM runs through the player's own signed-in AI CLI. Multiplayer keeps the server GM, paid by a subscription that grants tokens. The stage-first turn page is built in the desktop app.

Phase 0 refinement proves strict field retention and five-call turns for Claude, Codex, and Grok. Combined full-turn samples took 22.5, 26.1, and 86.0 seconds, with dice rendered at 4.3, 6.8, and 24.2 seconds. Core extraction is complete locally in `feature/gm-core`, with production build, 16 Playwright tests, and a seven-turn authenticated playthrough passing. Build the desktop shell next, with Claude for the first interactive demo and the other working adapters selectable. Codex's summary missed established events in this sample, and existing character patches are saved but not applied to live characters. Broader gameplay, local saves, and production auth remain future work. Gemini compatibility is independent after its provider rejected the tested login. Art and scoped Clerk/Convex checks passed. Details: [Desktop local play](plans/desktop-local-play.md#phase-0-spike).

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
