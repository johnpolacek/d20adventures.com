# feature/mapview

[Plans](index.md) · [Wiki Home](../index.md)

Status: Active (2026-07-02)

## Goal

Implement Mapview v1 — 2D D&D-style battle maps, AI-generated at authoring time from a standard SVG piece set, square grid, static encounter backdrop, standalone page. Full spec and decisions: [mapview.md](mapview.md).

## Progress

- [x] Schema v2: `gridType`, piece refs against a piece-library registry, gameplay semantics preserved — `types/encounter-map-2d.ts` (rotation is a plain number snapped to quarter turns; Gemini structured output rejects numeric-literal unions)
- [x] Piece taxonomy defined (27 pieces: natural/structure/dressing/hazard) — `lib/mapview/piece-catalog.ts`. Piece art is **code-drawn SVG** (`components/mapview/pieces.tsx`, deterministic seeded variation); the OpenPencil art pass is deferred as a pure per-piece visual upgrade (same registry keys/footprints)
- [x] Read-only SVG renderer (square grid) — `components/mapview/encounter-map-2d.tsx`: textured ground, grid, zones, walls, pieces, party/NPC tokens, labels
- [x] Generation pipeline: scene-kit inference → `generateObject` → normalize/clamp → deterministic token placement → S3 store (`lib/mapview/generate.ts`, `app/_actions/mapview.ts`; retry on flaky `NoObjectGeneratedError`)
- [x] Lab authoring surface: generate/review/regenerate at `/admin/mapview` (admin-gated). Integration into the wiki-adventures editor page proper still open
- [x] Standalone Mapview page rendering real encounters (`/admin/mapview/[settingId]/[planId]`)
- [ ] Evaluate against 2–3 real encounters; iterate on piece set + prompts — 2/3 done via `scripts/mapview-smoke.ts` (broken-silence/checkpoint, owlbear-confrontation/road; both stored to S3 and visually verified). Remaining: in-browser lab pass + a third encounter, then piece/prompt iteration
