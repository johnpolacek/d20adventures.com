# Mapview

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md)

Status: Implemented reference. V1 merged 2026-07-03. Reviewed against local main on 2026-10-01.

Mapview renders a stored 2D encounter backdrop during play. Maps use a square grid and SVG pieces. Party and NPC positions are static visual staging, not gameplay state.

## Runtime and authoring

| Surface | Current behavior |
|---|---|
| `/admin/mapview` | Admin adventure selection for map generation. |
| `/admin/mapview/{settingId}/{planId}` | Generate, inspect, and regenerate encounter maps. |
| `components/mapview/map-panel.tsx` | Desktop rail preview and shared fullscreen map. Floating entry below xl. |
| Per-turn route | Loads the encounter map separately with `loadEncounterMap2D`. Missing or invalid maps return null and hide map entry points. |
| Wiki adventure editor | Map generation is not integrated into the editor. |

Storage is S3 at `settings/{settingId}/maps2d/{adventurePlanId}/{encounterId}.json`, defined by `getEncounterMap2DStorageKey` in `lib/mapview/generate.ts`. It does not use legacy `maps/` hydration or require a map key in encounter frontmatter.

Map titles prefer the wiki location entity's display name, falling back to the encounter title.

## Generation

`app/_actions/mapview.ts` loads wiki-backed plan content and calls the pipeline under `lib/mapview/`. Scene inference, the catalog, encounter text, and location feed the prompt. Generated data is normalized, clamped, placed, and stored.

Model configuration lives in `lib/mapview/model.ts`. The pipeline uses a tolerant generation schema and repairs model output. Rendering requirements such as connected paths, tree density, and valid positions must be enforced in code, not left to prompts.

Generation is an admin authoring operation. Players read the stored result without generating a new map.

## Piece library

- Registry: `lib/mapview/piece-catalog.ts`.
- Renderer: `components/mapview/pieces.tsx`, with compiled art in `pieces-art.ts`.
- Editable artwork: `design/mapview-pieces.op`, compiled by `scripts/mapview-pieces-compile.ts`.
- OpenPencil hero art and procedural natural clutter coexist. Runtime has no OpenPencil dependency.
- Piece IDs are append-only because stored maps refer to them.
- Linear pieces reuse the path-chain renderer.
- Grow the catalog when an adventure needs pieces. Beyond roughly 60 to 80 entries, consider scene/biome filtering to limit prompt size.

## Placement contract

NPC refs may set `startNear: "party"`, `"distant"`, or a zone/label name. A close ambush should explicitly use `"party"`. After changing staging hints, re-place stored tokens with `scripts/mapview-replace-tokens.ts`. This writes shared S3 maps.

Narrative generation reads the map's spatial summary so described distances agree with the visual staging. Locations and staging still need authoring per adventure.

The schema is hex-ready, but rendering and generation are square-only. There is no manual map editor, token movement, or positional combat state.

## Remaining work

- Decide whether Stageview keeps Mapview as an inset before committing to major map work.
- If retained, integrate generation into wiki authoring and expand pieces for docks, boats, interiors, city streets, and crypts as needed.
- Check location metadata and map coverage beyond The Midnight Summons. Stored S3 coverage was not audited in this documentation pass.

## Recorded validation

The July 2026 implementation record includes a fresh-player playthrough of all seven Midnight Summons encounters and visual iteration on maps. The 2026-09-29 removal of the old 3D stack verified the extracted map rail, fullscreen view, Escape/close behavior, and floating entry on a fixture page. That removal check did not open a real adventure turn.

Use the [testing runbook](testing-runbook.md) for future changes.
