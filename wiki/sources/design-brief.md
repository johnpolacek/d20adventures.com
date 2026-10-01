# Design brief

[Home](../index.md) · [Sources](../Sources.md) · [Roadmap](../roadmap.md) · [Stageview](../plans/stageview.md)

Reviewed 2026-10-01 against current components and owner decisions.

## Current play UI

Text narrative remains the primary implemented interaction. Desktop uses a character rail, narrative column, and right rail for maps, Storyview, and multiplayer chat. Smaller layouts use compact or floating entry points and fullscreen overlays.

Preserve readable narrative, clear acting-character state, reply and roll affordances, visible errors, keyboard access, focus, and responsive controls.

## Stageview direction

The stage becomes the primary play surface, with the complete text UI docked over it. Side docking in landscape and a bottom sheet on portrait tablets are proposals to settle during integration. Phones require landscape.

Use painted environments, illustrated front/back characters, portrait plates, and consistent palette/lighting. The procedural-only hero approach and old miniatures overlay were superseded.

Do not remove text access to narrative or actions. Reduced motion, performance fallback, and no-WebGL behavior are part of the integration work.

## Admin authoring

The implemented editor uses chat and key fields with validation and revision restore. Preserve dense operational surfaces. Do not add helper copy, status phrases, or explanatory panels unless requested or required for accessibility, validation, or errors.

The old draft approval queue and raw-source-first workbench proposal do not describe the current editor. Future community creation needs its own interaction design.

## Open design work

Stage docking, mobile controls, portrait gating, transitions, narration timing, and Mapview's role still need integrated review. Existing components and current owner decisions are the design source. No separate formal design-system specification is maintained here.
