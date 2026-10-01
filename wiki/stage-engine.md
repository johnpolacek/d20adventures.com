# Stage engine

[Home](index.md) · [Plans](plans/index.md) · [Stageview](plans/stageview.md) · [Testing](plans/testing-runbook.md)

Status: Implemented reference. Engine merged in `384a622` on 2026-09-29. Reviewed against local main on 2026-10-01. Performance and validation results below remain dated evidence.

## Implementation basis

The engine ports the v5 prototype (`~/Projects/d20-graphics-test-2/src/v5/`, three r180, about 3,100 LOC of JS) into `lib/stage/` as plain three.js TypeScript on the app's three r183, with sets described by a **declarative JSON spec** (sets are untrusted input interpreted by trusted builders). The development viewer and verification script support DPR 2 native-pixel review.

## Scope

| Implemented | Deferred or excluded |
|---|---|
| Kit: seeded RNG, `Batch`, primitives, `Frame` | Queue `Director` → set loops and staging scripts (phase 3) |
| Materials: masonry, wood, cloth, burlap, metal, plain, heraldry. height fog scoped to Stage materials | Beats, hold binding, Storyview sync (phase 4) |
| Sky, sun, hemisphere, PMREM environment, AgX | Character art generator and S3 storage (phase 4) |
| Post: 4× MSAA with resolved depth, FXAA, bloom, quarter-res GTAO, Kuwahara paint at fixed internal height with depth-scaled radius, character mask | Stage-first turn page integration (phase 4) |
| Crowd: procedural pawns, instanced front/back cards, hybrid LOD, walkers | Festival street as its own set (phase 3) |
| Named characters as front/back standees with alpha-derived normals | Procedural hero rigs and the MakeHuman head (superseded by standees) |
| Quality tiers, pause when hidden, `dispose()` | Mobile measurement |
| Set spec + interpreter + parametric builders. the Kordavos gate as the first spec | |
| Minimal staging spec (cast at marks, shots relative to cast) for `/dev/stage` | |

## Module layout

| Path | Role |
|---|---|
| `lib/stage/kit/` | RNG, geometry cache, `Batch`, primitives, `Frame`, canvas textures |
| `lib/stage/materials/` | Shader-patched materials, scoped atmosphere, heraldry, the material library built from a spec |
| `lib/stage/render/` | Paint pass, character mask, scaled GTAO, composer pipeline, tiers |
| `lib/stage/figures/` | Pawns, card layer and atlas, crowd population and LOD, standees |
| `lib/stage/builders/` | Registry of parametric builders (zod params, material roles) |
| `lib/stage/spec/` | Set and staging schemas, the interpreter |
| `lib/stage/sets/`, `lib/stage/stagings/` | Repo-local specs (phase 2: the Kordavos gate and its dev staging) |
| `lib/stage/stage.ts` | Runtime: renderer, camera, shots, loop, pause, dispose, stats |
| `app/dev/stage/` | Dev-only viewer, `?set=&staging=&quality=` |
| `public/stage/` | Realm of Myr crowd library (16 variants, fronts and backs) and dev character fixtures |

## Set spec v1 (`d20.stage.set`)

JSON only: no expressions, no code. Metres. `y` up. ground at `y = 0`. the set faces `+z` (the camera side). Angles are **degrees**. `yaw` 0 faces `+z`. Colours are hex strings. Asset URLs must be same-origin `/stage/…` paths or on an allow-listed host.

| Field | Contents |
|---|---|
| `format`, `version`, `id`, `settingId`, `locationId`, `title`, `seed` | Identity. `seed` drives every random choice (per object, so editing one object does not reshuffle the rest) |
| `atmosphere` | Sun direction, colour, intensity, shadow box. hemisphere. sky colours. fog density (fog colour = sky horizon). environment intensity. exposure. wind |
| `camera` | Near/far, bounds box, orbit limits |
| `materials` | Name → `{ type: masonry \| wood \| cloth \| burlap \| metal \| plain, …params }`. cloth can carry `heraldry` (a named banner design) and `tatters` |
| `objects[]` | `{ type, id?, at?, yaw?, materials?, …params }` , `type` names a builder. params are validated by that builder's schema (unknown keys rejected, ranges clamped) |
| `crowd` | `library` (crowd art id), `avoid` (rects and circles), `groups[]`: `scatter` (area, count, density rects, mix, facing), `line`, `points`, `path` (people along a path), `walkers` (loop or ping-pong along a path), `anchors` (people on builder-emitted anchors such as parapet lookouts) |
| `marks` | Name → `{ at: [x, z], yaw? }` |
| `paths` | Name → polyline `[[x, z], …]` |
| `shots` | Name → `{ position, target, fov }` |
| `life` | `birds`, `dust` |

**Builders.** Each builder declares a zod param schema and **material roles** with default material names (role `wall` → material `stone` unless the object overrides it). Builders author in local coordinates. the interpreter supplies a framed batch (`at` + `yaw`), so footprints and anchors land in world space.

- Primitives: `box`, `cylinder`, `cone`, `sphere`, `torus`, `lathe`, `beam`, `extrude` (polygon with holes), `opening` (arched window).
- Layouts: `group` (children in a local frame), `row` (items along a line at a random step), `scatter` (items in an area), each with `vary` (numeric ranges) and `choose` (discrete picks) per placement.
- Kit (ported from v5): fortifications (`gatehouse`, `drumTower`, `curtainWall`, `roundTower`, `squareTower`, `archScreen`, `skyline`, `dome`), town (`house`, `farTown`), market (`stall`, `sail`, `spearRack`, `standard`, `crate`, `barrel`, `sack`, `pot`, `basket`, `lantern`, `goodsPile`), festival (`bunting`, `sheaf`, `gourds`), checkpoint (`barrier`, `ropeLine`, `brazier`, `ledgerTable`, `cart`, `awning`, `bannerPole`), dressing (`banner`, `pennant`), ground (`groundDisc`, `land`).

**Limits** (untrusted input): object count, nesting depth, per-layout counts, crowd total, segment counts and extents are capped in the schemas.

## Staging spec v1 (`d20.stage.staging`), minimal

`set` id, `cast[]` (`id`, `name`, `role`, `height`, `art.front|back|portrait`, `at` = mark name or `[x, z]`, `facing` = degrees, a cast id or a point), `shots` (merged over the set's. adds `subjects` + `offset` two-shots and `subject` + `distance`/`angle` close-ups), `shot` (the opening shot). Scripts, ambient loops and beats come in phases 3–4.

## Verification

- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
- `scripts/stage-verify.ts` over CDP against system Chrome at `--force-device-scale-factor=2`, 1440×900 CSS: page ready, no exceptions, every program runnable, budgets per shot (≤ 300 draw calls, ≤ 2.5M triangles), a full screenshot per shot and native-pixel crops of each named character.
- Compare against the prototype's `previews/v5b-*` and `v5w-*` shots.

## Recorded validation

Results recorded 2026-09-29, not rerun in the documentation audit.

About 6,700 lines of TypeScript under `lib/stage/` (Biome-formatted) plus a 1,770-line set spec (Biome expands its coordinate arrays). The Kordavos gate builds from JSON in about 240 ms in Node: 398 objects placed, 64 materials, 0.56M static triangles, 194 footprints, 32 lookout anchors and 1,587 people (155 walking).

Measured on the M3 in Chrome 154, 1440×900 CSS, dev build, `motion=0` unless noted:

| Tier | DPR | Paint | Gate | Party | Queue | Draw calls | Triangles (max) |
|---|---|---|---|---|---|---|---|
| Ultra (MSAA, AO, bloom) | 2 | 900 | 22 fps | 28 fps | 21 fps | 187–193 | 2.13M (ramparts) |
| High (FXAA, AO) | 1.5 | 720 | 52 fps | 54 fps | 52 fps | 174–180 | 1.57M |
| High, motion on | 1.5 | 720 | , | 44 fps | 40 fps | 174–178 | 1.38M |
| Balanced | 1 | 540 | 66 fps (vsync) | 66 | 66 | 170–176 | 1.57M |
| Mobile (card radius 40 m) | 1 | 480 | 66 fps (vsync) | 66 | 66 | 170–176 | 1.80M |

- Prototype for comparison: high 37 fps (gate) and 43–46 (party). ultra about 21.
- Every shot is within budget (≤ 300 draw calls, ≤ 2.5M triangles). The ramparts shot (a steep view, so every person is a pawn) needed coarser pawns: the average pawn fell from about 520 to about 313 triangles, and ramparts from 2.76M to 2.13M.
- Steady-state JS heap is 42 MB after GC (prototype: 234 MB). Static geometry and the 64 MB card atlas drop their CPU copies after upload.
- Ready in about 2 s on a warm dev server. There are 36–49 shader programs, all runnable.
- The DPR 2 frames match the prototype's `v5w`/`v5b` shots. Native-pixel crops of Garlan at 2.5 m, and of Branka and Cassia in the party and two-shot, keep faces and costume detail.

## Decisions and deviations

- **Sets are JSON, not TS modules.** The interpreter runs only kit builders. Each object gets its own random stream (set seed plus its path), so editing one object leaves the rest of the set unchanged.
- **Material roles.** A builder asks for roles such as `stone`, `trim` or `wall`. A role resolves through the object's `materials` map (inherited by children), then the builder's defaults, then the role's own name. Material-name params (a stall's `cloth`) resolve the same way.
- **Layouts use `itemYaw`.** `yaw` belongs to the object envelope. on a layout it turns the whole row or scatter.
- **Named characters are standees only.** The procedural hero rigs and the 1.8 MB MakeHuman head were not ported. A cast member is a position, a facing and a walk state.
- **Pawns are coarse by design.** Hybrid LOD shows cards near the eye. `crowd=procedural` remains an A/B flag.
- **Fog is scoped.** `stageMaterial()` patches each Stage material's own fog chunks, keyed in the program cache, and three's global `ShaderChunk` is untouched. The sun direction is a uniform.
- **three r183.** `PCFSoftShadowMap` is deprecated, so shadows use `PCFShadowMap`. There is no `Clock`: frame time comes from rAF timestamps.
- **Pixels for review come from the canvas.** In the recorded verification environment, CDP `Page.captureScreenshot` hung on full-viewport captures, and messages over about 10 MB stalled the socket. `stage.capture()` renders a frame and reads the canvas in the same task. the verify script moves PNGs in 2 MB slices and cuts crops in the page.
- **Ramparts shot moved** to `[-54, 70, 22]`, so it no longer clips the drum tower's hoarding.
- **Assets are in the repo for now:** the Realm of Myr crowd library (2.0 MB) and the March of Davos standees and portraits (2.2 MB) under `public/stage/`. Phase 4 moves per-character art to S3.

## Current limits

- Phase 3: generalize `Director` into set `loops` and staging scripts (the queue is static here), the festival street as its own set, time of day and weather toggles.
- The spec has no `loops`, and staging has no scripts or beats yet.
- Heraldry is limited to three named designs, with no parametric heraldry.
- Pawn and card swaps still pop with no crossfade. The 16 crowd variants repeat in dense areas.
- The mobile tier has not been measured on a phone.
- Not yet measured on a production build (the numbers above are from the dev server).

## Recorded checks, 2026-09-29

- `pnpm exec tsc --noEmit`: clean. `pnpm lint`: 0 warnings, 1 info (baseline). `pnpm build`: passes.
- `pnpm stage:check`: the set and the staging pass (schema, params, materials, budget, crowd).
- `pnpm stage:verify --tiers=ultra`: all 7 shots pass. High, balanced and mobile pass on gate, party and queue.
- In the browser: pause stops frames and resume restarts them. `dispose()` releases the context and removes the canvas. clicking a standee opens its plate and head-anchored bubble.

Remaining product work is tracked in [Stageview](plans/stageview.md).
