# Product brief

[Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Plans](../plans/index.md)

Reviewed 2026-10-01 against local code and recorded owner decisions.

D20 Adventures is an AI-led narrative RPG. Players choose an authored adventure, select or create characters, respond with actions and dialogue, roll D20 checks, and progress through encounters.

## Implemented experience

- Solo, multiplayer lobby/join, and owner-controlled practice flows.
- Wiki-authored adventures for The Midnight Summons, Covert Cargo, The Road to Kordavos, and March of Davos.
- Text-driven turns, NPC behavior, character state, reports, chat, and completion.
- Storyview audio with narrator/character voices, cached playback, and optional automatic narration.
- Optional stored 2D Mapview encounter backdrops.
- Admin chat and key-field editing of existing registered adventures.

The rules remain lightweight narrative D20 checks rather than a full tabletop rules simulator.

## Chosen next direction

The owner chose Stageview as the primary play screen on 2026-09-29. A painted 3D stage will sit behind the complete docked turn UI. Phones will play in landscape, with a text fallback for devices that cannot run the stage.

The engine is merged. Stage-first gameplay, narration synchronization, character generation, and encounter coverage remain to be implemented. Mapview's future role is undecided.

## Later ambitions

Player-created settings and adventures, community browsing/forking, and private/unlisted/public sharing need separate plans. The existing wiki editor is not a complete community publishing product.

The owner reported only test accounts when authorizing the old 3D removal on 2026-09-29. Current public launch status and usage metrics were not checked in this review.
