# feature/stageview-engine

[Plans](index.md) · [Wiki Home](../index.md) · [Stageview](stageview.md)

Status: Active (2026-09-29) · phase 2 of [Stageview](stageview.md)

## Goal

Port the v5 prototype (`~/Projects/d20-graphics-test-2/src/v5/`, three r180, about 3,100 LOC of JS) into `lib/stage/` as plain three.js TypeScript on the app's three r183, with sets described by a **declarative JSON spec** (owner decision 2: sets are untrusted input, never code). Add `/dev/stage` and `scripts/stage-verify.ts`, and verify at DPR 2 with native-pixel crops.

## Scope

| In | Out (later phases) |
|---|---|
| Kit: seeded RNG, `Batch`, primitives, `Frame` | Queue `Director` → set loops and staging scripts (phase 3) |
| Materials: masonry, wood, cloth, burlap, metal, plain, heraldry; height fog scoped to Stage materials | Beats, hold binding, Storyview sync (phase 4) |
| Sky, sun, hemisphere, PMREM environment, AgX | Character art generator and S3 storage (phase 4) |
| Post: 4× MSAA with resolved depth, FXAA, bloom, quarter-res GTAO, Kuwahara paint at fixed internal height with depth-scaled radius, character mask | Encounter overlay integration (phase 4) |
| Crowd: procedural pawns, instanced front/back cards, hybrid LOD, walkers | Festival street as its own set (phase 3) |
| Named characters as front/back standees with alpha-derived normals | Procedural hero rigs and the MakeHuman head (superseded by standees) |
| Quality tiers, pause when hidden, `dispose()` | Mobile measurement |
| Set spec + interpreter + parametric builders; the Kordavos gate as the first spec | |
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

JSON only: no expressions, no code. Metres; `y` up; ground at `y = 0`; the set faces `+z` (the camera side). Angles are **degrees**; `yaw` 0 faces `+z`. Colours are hex strings. Asset URLs must be same-origin `/stage/…` paths or on an allow-listed host.

| Field | Contents |
|---|---|
| `format`, `version`, `id`, `settingId`, `locationId`, `title`, `seed` | Identity; `seed` drives every random choice (per object, so editing one object does not reshuffle the rest) |
| `atmosphere` | Sun direction, colour, intensity, shadow box; hemisphere; sky colours; fog density (fog colour = sky horizon); environment intensity; exposure; wind |
| `camera` | Near/far, bounds box, orbit limits |
| `materials` | Name → `{ type: masonry \| wood \| cloth \| burlap \| metal \| plain, …params }`; cloth can carry `heraldry` (a named banner design) and `tatters` |
| `objects[]` | `{ type, id?, at?, yaw?, materials?, …params }` — `type` names a builder; params are validated by that builder's schema (unknown keys rejected, ranges clamped) |
| `crowd` | `library` (crowd art id), `avoid` (rects and circles), `groups[]`: `scatter` (area, count, density rects, mix, facing), `line`, `points`, `path` (people along a path), `walkers` (loop or ping-pong along a path), `anchors` (people on builder-emitted anchors such as parapet lookouts) |
| `marks` | Name → `{ at: [x, z], yaw? }` |
| `paths` | Name → polyline `[[x, z], …]` |
| `shots` | Name → `{ position, target, fov }` |
| `life` | `birds`, `dust` |

**Builders.** Each builder declares a zod param schema and **material roles** with default material names (role `wall` → material `stone` unless the object overrides it). Builders author in local coordinates; the interpreter supplies a framed batch (`at` + `yaw`), so footprints and anchors land in world space.

- Primitives: `box`, `cylinder`, `cone`, `sphere`, `torus`, `lathe`, `beam`, `extrude` (polygon with holes), `opening` (arched window).
- Layouts: `group` (children in a local frame), `row` (items along a line at a random step), `scatter` (items in an area), each with `vary` (numeric ranges) and `choose` (discrete picks) per placement.
- Kit (ported from v5): fortifications (`gatehouse`, `drumTower`, `curtainWall`, `roundTower`, `squareTower`, `archScreen`, `skyline`, `dome`), town (`house`, `farTown`), market (`stall`, `sail`, `spearRack`, `standard`, `crate`, `barrel`, `sack`, `pot`, `basket`, `lantern`, `goodsPile`), festival (`bunting`, `sheaf`, `gourds`), checkpoint (`barrier`, `ropeLine`, `brazier`, `ledgerTable`, `cart`, `awning`, `bannerPole`), dressing (`banner`, `pennant`), ground (`groundDisc`, `land`).

**Limits** (untrusted input): object count, nesting depth, per-layout counts, crowd total, segment counts and extents are capped in the schemas.

## Staging spec v1 (`d20.stage.staging`), minimal

`set` id, `cast[]` (`id`, `name`, `role`, `height`, `art.front|back|portrait`, `at` = mark name or `[x, z]`, `facing` = degrees, a cast id or a point), `shots` (merged over the set's; adds `subjects` + `offset` two-shots and `subject` + `distance`/`angle` close-ups), `shot` (the opening shot). Scripts, ambient loops and beats come in phases 3–4.

## Verification

- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
- `scripts/stage-verify.ts` over CDP against system Chrome at `--force-device-scale-factor=2`, 1440×900 CSS: page ready, no exceptions, every program runnable, budgets per shot (≤ 300 draw calls, ≤ 2.5M triangles), a full screenshot per shot and native-pixel crops of each named character.
- Compare against the prototype's `previews/v5b-*` and `v5w-*` shots.

## Progress

- [ ] Kit, materials, sky, atmosphere
- [ ] Render pipeline (paint, mask, GTAO, MSAA/FXAA, bloom, tiers)
- [ ] Crowd (pawns, cards, LOD, walkers) and standees
- [ ] Set/staging schemas, builders, interpreter
- [ ] Kordavos gate set spec and dev staging; assets in `public/stage/`
- [ ] `/dev/stage` viewer
- [ ] `scripts/stage-verify.ts`; DPR 2 screenshots and crops reviewed
- [ ] Wiki: stageview phases, log, index
