# feature/mapview

[Plans](index.md) · [Wiki Home](../index.md)

Status: Active (2026-07-02)

## Goal

Implement Mapview v1 — 2D D&D-style battle maps, AI-generated at authoring time from a standard SVG piece set, square grid, static encounter backdrop, standalone page. Full spec and decisions: [mapview.md](mapview.md).

## Progress

- [x] Schema v2: `gridType`, piece refs against a piece-library registry, gameplay semantics preserved — `types/encounter-map-2d.ts` (rotation is a plain number snapped to quarter turns; Gemini structured output rejects numeric-literal unions)
- [x] Piece taxonomy defined (27 pieces: natural/structure/dressing/hazard) — `lib/mapview/piece-catalog.ts`. Piece art is hybrid: **10 hero pieces designed in OpenPencil** (`design/mapview-pieces.op`, authored/editable via the OpenPencil app or `op insert --file`; compiled to SVG by `scripts/mapview-pieces-compile.ts` → generated `components/mapview/pieces-art.ts`) with code-drawn procedural SVG (`components/mapview/pieces.tsx`) as the fallback for natural clutter (trees, rocks, bushes keep per-instance seeded variation). Hero set: gate, altar, statue, well, building-hut, wagon, tent, bridge, market-stall, campfire
- [x] Read-only SVG renderer (square grid) — `components/mapview/encounter-map-2d.tsx`: textured ground, grid, zones, walls, pieces, party/NPC tokens, labels
- [x] Generation pipeline: scene-kit inference → `generateObject` → normalize/clamp → deterministic token placement → S3 store (`lib/mapview/generate.ts`, `app/_actions/mapview.ts`; retry on flaky `NoObjectGeneratedError`)
- [x] Lab authoring surface: generate/review/regenerate at `/admin/mapview` (admin-gated). Integration into the wiki-adventures editor page proper still open
- [x] Standalone Mapview page rendering real encounters (`/admin/mapview/[settingId]/[planId]`)
- [x] Evaluate against real encounters — **all 7 Midnight Summons encounters** generated and stored to S3 via `scripts/mapview-smoke.ts`, visually verified (checkpoint, road, camp, grove kits all compose sensibly; the model repurposes statues as standing stones)
- [x] Player-facing map in play: floating Map panel on the turn page (`components/mapview/map-panel.tsx`), shown only when the encounter has a stored map
- [x] Fresh-player playthrough of The Midnight Summons on the worktree (empty Convex = clean history) with the map panel in play — underway 2026-07-02/03
- [x] Model: **gemini-3.5-flash** (verified live), centralized in `lib/mapview/model.ts` shared by the action + script; structured outputs OFF with a tolerant/repairing generation schema (bounded numbers digit-loop Gemini's constrained decoder)
- [x] Feedback round 1 (2026-07-03): narrative-driven scene kit (forest/grove added) over the keyword heuristic; night/dusk lighting overlay; character-portrait tokens with hover names; trail + monolith pieces; NPC placement no longer stacks on the party (infer spawn zone; keep NPCs in a separate zone)
- [x] Feedback round 2 (2026-07-03): fullscreen map panel (fit mode); trees rewritten to render a grove of individual crowns per footprint + prompt pushes denser forests; removed dashed zone boxes (zones are placement-only; narrative cues are on-map labels now); labels use the display font (Cinzel, `var(--font-display)`)
- [ ] Next: fold remaining playthrough findings into the piece set/prompt; wire generation into the wiki-adventures editor; broaden beyond Midnight Summons

Finished: 2026-07-03 (merged to main, policy: merge)
