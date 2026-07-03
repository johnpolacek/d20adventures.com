# Mapview

[Plans](index.md) · [Wiki Home](../index.md) · [Roadmap](../roadmap.md)

Status: v1 merged to main (2026-07-03) · progress tracker archived at [zzz-completed/feature-mapview.md](zzz-completed/feature-mapview.md)

## Goal

2D standard D&D-style battle maps as a static visual backdrop for each encounter. Maps are AI-generated at authoring time from encounter text, composed from a standard SVG piece set, stored per-encounter, and rendered read-only during play. Square grid first with a hex-ready schema. Developed on a standalone page until the design matures.

## Decisions (2026-07-02)

- **Mapview is 2D.** The roadmap's original "realistic 3D tile map" vision is split off as a separate future **Miniview**. The 3D implementation was shelved on 2026-03-12 (`126200c`) because visual quality fell short; the renderer stays dormant (`components/adventure/miniatures-map.tsx`, `lib/map-utils.ts`, `app/_actions/generate-encounter-map.ts`, plus the `minimap-claude` branch with SSAO/HDR/archetype-token improvements).
- **AI-generated at authoring time, stored.** An author triggers generation per encounter; the result is reviewable before publish and deterministic for players. No play-time generation cost or latency.
- **Storage reuses the existing externalization.** Per-encounter map JSON in S3 at `settings/{settingId}/maps/{adventurePlanId}/{encounterId}.json` with lazy hydration (`loadAdventurePlanFromStorage(..., { includeMaps: true })`) — already built in `lib/adventure-plan-storage.ts`.
- **Standard piece set as SVG, designed in OpenPencil.** [OpenPencil](https://github.com/ZSeven-W/openpencil) (MIT, open-source AI-native vector design tool) is the design surface for the piece library. Workflow (verified 2026-07-02): pieces live as PenNode frames in the committed OpenPencil document `design/mapview-pieces.op` (one top-level frame per catalog pieceId, 96 units/cell, authored headlessly via `op insert --file` or interactively in the app); `scripts/mapview-pieces-compile.ts` compiles PenNode → SVG into the generated `components/mapview/pieces-art.ts`; the renderer prefers compiled art and falls back to code-drawn procedural SVG (kept for high-count natural clutter where per-instance seeded variation reads better). Note: OpenPencil has no native SVG export — the compiler covers the rect/ellipse/line/path/gradient/shadow subset we use. Crisp at any zoom, no runtime asset pipeline, zero runtime dependency on OpenPencil.
- **Static scene backdrop.** Fixed party-slot and NPC-start placements per encounter. No positional game state, no token movement, no new turn-state fields.
- **Square grid v1, hex-ready schema.** The schema carries a `gridType` field and hex-compatible coordinates from day one; only square rendering/generation ships in v1.
- **Standalone page for development.** Mapview lives on its own route until the design is proven in isolation. Mode-switcher integration (Gameview/Storyview/Mapview) is deferred — Storyview will force that architecture anyway.

## Salvage Map (verified 2026-07-02)

| Asset | Verdict |
|---|---|
| `2d-maps` branch (`ed402aa`): `types/encounter-map-2d.ts` | **Foundation.** Board/walls/terrain-kinds (`blocking/difficult/hazard/cover`)/zones (`spawn/objective/interest`)/labels/party-slots/NPC-starts/notes are right. Needs `gridType`, hex-compatible coords, and a `piece` concept replacing bare color+label rects. |
| `2d-maps` branch: `lib/encounter-map-2d.ts` templates (`road/shrine/camp/courtyard/ruins/cavern/gate`) | Reuse as generation scaffolding / few-shot examples. |
| 3D pipeline: `app/_actions/generate-encounter-map.ts` (scene-kit inference + `generateObject` against a zod schema, per-kit prompt guidance) | **Transplant directly** — retarget the schema from `encounter3dMapSchema` to the 2D schema. `inferEncounterSceneKit` in `lib/map-utils.ts` reuses as-is. |
| `2d-maps` branch: 874-line `encounter-map-2d-editor.tsx` | Defer. AI generation means no editor in v1; keep as reference for a future manual touch-up surface. It mounted in the legacy plan editor (removed at cutover), so it would need re-homing anyway. |
| `miniatures-map.tsx` (2,448 lines) + `map-utils.ts` scene rendering + `minimap-claude` branch | Stays dormant for Miniview. `claude/stoic-gates` deleted 2026-07-02 (strict subset of `minimap-claude`). |
| Encounter schema: `map3d` / `map3dKey` optional fields | Leave untouched (legacy/Miniview). Mapview adds its own field (e.g. `map2d` / `map2dKey`). |

## Known Gaps to Cover

1. **Wiki content model attachment.** The wiki migration deferred maps (`myr-migration.ts` warns "map asset migration is deferred") — wiki-authored plans carry no map data today. Decide how the 2D map key attaches to a wiki-authored encounter and flows through compile → publish → runtime.
2. **Piece taxonomy.** Define the standard library before generation prompts can reference it: terrain surfaces (grass, stone, water, sand), natural elements (trees, boulders, cliffs), structures (walls, doors, buildings, bridges), dressing (crates, campfires, altars, rubble), hazards.
3. **Hex-ready coordinates.** The one hard-to-migrate decision. Design coordinates so square v1 data survives a hex-capable v2 (e.g. `gridType` + per-grid coordinate interpretation, pieces sized in cells).
4. **Generation quality loop.** Validate + clamp generated JSON against the schema; regenerate control in authoring; template few-shots per scene kit.

## Milestones (v1 — merged 2026-07-03)

- [x] Schema v2: `gridType`, piece refs against a piece-library registry, gameplay semantics preserved
- [x] Piece taxonomy defined; piece set v1 designed in OpenPencil → SVG committed (30 pieces incl. river/monolith/trail)
- [x] Read-only SVG renderer (square grid, 16:9 framed)
- [x] Generation pipeline: scene-kit inference → `generateObject` (gemini-3.5-flash) → validate/clamp → S3 store
- [x] Authoring hook: generate/review/regenerate at `/admin/mapview`
- [x] Standalone Mapview page rendering real encounters
- [x] Evaluated against all 7 Midnight Summons encounters via a full fresh-player playthrough; iterated on piece set + prompts + renderer through many feedback rounds (trail/river network rendering, tree density, lighting, portrait tokens, labels, fullscreen panel)

See [Catalog Growth](#catalog-growth) below for what's next.

## Catalog Growth

The piece catalog grows demand-driven, per adventure — not speculatively. Rules:

- **Append-only**: never rename or remove a piece id (stored maps reference ids; unknown ids degrade gracefully by not rendering). Adding = one entry in `lib/mapview/piece-catalog.ts` + one renderer (code-drawn in `pieces.tsx` or an OpenPencil frame in `design/mapview-pieces.op`); prompt + schema pick it up automatically.
- **Linear features** (trail, river — and future roads, streams, walls-as-runs) share the network renderer: chained segments → merged graph → smoothed winding path, ends extended to map edges. New linear pieces should reuse `buildPathChains`/`chainsToWobbledPath`.
- **Prompt bloat threshold**: past ~60–80 pieces, tag pieces by scene kit/biome and filter the catalog per generation instead of sending all of it.
- **Demand signal**: candidate — a `wishlist` field in the generation schema ("pieces you wanted but the catalog lacked"), logged per generation and surfaced in the lab, so growth follows actual adventure content. Known upcoming needs: Covert Cargo (docks, boat, water expanse, warehouse interior), city encounters (streets, enterable buildings, furniture), crypts (graves, webs, bones).

## Out of Scope

- Hex rendering/generation (schema-ready only)
- Manual map editor / touch-up surface
- Gameview/Storyview/Mapview mode switcher
- Positional game state or token movement
- Miniview (3D miniatures) — separate future plan
