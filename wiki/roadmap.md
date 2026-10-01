# Roadmap

[Home](index.md) · [Plans](plans/index.md) · [Architecture](Architecture.md) · [Log](log.md)

Reviewed 2026-10-01. This separates implemented behavior from the chosen next direction.

## Now, Stageview integration

Stageview is the owner's chosen primary play screen, decided 2026-09-29. The engine, Myr crowd library, Kordavos gate set, and development preview are implemented. Players still use the existing text turn page.

Next work:

1. Add staging scripts, set loops, and the Harvest Festival set.
2. Build the stage-first turn page with docked narrative/input, character art, beats, and Storyview synchronization.
3. Cover encounters with authored or generic sets and default staging.
4. Verify phone landscape handling, accessibility, reduced motion, and text fallback on devices that cannot run the stage.

Details and open decisions: [Stageview](plans/stageview.md). Mapview's role is unresolved. It may become an inset or be retired.

## Next, desktop local play

Proposed 2026-10-01. A Tauri desktop app where solo play is free and the GM runs through the player's own signed-in AI CLI. Online multiplayer keeps the server GM and becomes the paid subscription. Game logic and the stage-first UI move into shared packages during the Stageview rebuild.

First step is a spike measuring CLI latency, JSON validity, and GM quality. Details: [Desktop local play](plans/desktop-local-play.md).

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
