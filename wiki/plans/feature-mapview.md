# feature/mapview

[Plans](index.md) · [Wiki Home](../index.md)

Status: Active (2026-07-02)

## Goal

Implement Mapview v1 — 2D D&D-style battle maps, AI-generated at authoring time from a standard SVG piece set, square grid, static encounter backdrop, standalone page. Full spec and decisions: [mapview.md](mapview.md).

## Progress

- [ ] Schema v2: `gridType`, piece refs against a piece-library registry, gameplay semantics preserved (salvage `types/encounter-map-2d.ts` from `2d-maps` branch, `ed402aa`)
- [ ] Piece taxonomy defined; piece set v1 designed in OpenPencil → SVG committed
- [ ] Read-only SVG renderer (square grid)
- [ ] Generation pipeline: scene-kit inference → `generateObject` → validate/clamp → S3 store (transplant from `app/_actions/generate-encounter-map.ts`)
- [ ] Authoring hook: generate/review/regenerate from the wiki admin encounter surface
- [ ] Standalone Mapview page rendering real encounters
- [ ] Evaluate against 2–3 real encounters (e.g. Midnight Summons); iterate on piece set + prompts
