# Stage engine

[Home](index.md) · [Plans](plans/index.md) · [Stageview](plans/stageview.md) · [Testing](plans/testing-runbook.md)

Status: Implemented reference. Engine merged in `384a622` on 2026-09-29. Moved to `packages/stage` for web and desktop in `feature/desktop-stage-play` on 2026-10-02, merged into main on 2026-10-03. Native real-turn integration is recorded in [its plan](plans/zzz-completed/feature-desktop-stage-play.md). The Kordavos harvest square, the second authored set, was added there on 2026-10-03. Performance results below remain dated evidence.

## Implementation basis

The engine ports the v5 prototype (`~/Projects/d20-graphics-test-2/src/v5/`, three r180, about 3,100 LOC of JS) into `packages/stage/src/` as plain three.js TypeScript on the app's three r183, with sets described by a **declarative JSON spec** (sets are untrusted input interpreted by trusted builders). The development viewer and verification script support DPR 2 native-pixel review.

## Scope

| Implemented | Deferred or excluded |
|---|---|
| Kit: seeded RNG, `Batch`, primitives, `Frame`, queue loop and staging runtime | Further authored loops and encounter coverage |
| Materials: masonry, wood, cloth, burlap, metal, plain, heraldry. height fog scoped to Stage materials | Beats, hold binding, Storyview sync (phase 4) |
| Sky, sun, hemisphere, PMREM environment, AgX | Character art generator and S3 storage (phase 4) |
| Post: 4× MSAA with resolved depth, FXAA, bloom, quarter-res GTAO, Kuwahara paint at fixed internal height with depth-scaled radius, character mask | Generated turn beats and narration synchronization |
| Crowd: procedural pawns, instanced front/back cards, hybrid LOD, walkers | March of Davos after Clan Conflict (story view on desktop) |
| Named characters as front/back standees with alpha-derived normals | Procedural hero rigs and the MakeHuman head (superseded by standees) |
| Quality tiers, pause when hidden, `dispose()` | Mobile measurement |
| Set spec + interpreter + parametric builders. the Kordavos gate as the first spec | |
| Minimal staging spec (cast at marks, shots relative to cast) for `/dev/stage` | |
| Native gate scene and HUD connected to local CLI GM turns, movement, and SQLite saves | Further sets and native gameplay coverage |
| Kordavos harvest square and the Harvest Festival staging, selected by encounter on desktop | Raised cast placement (festival performers stand in front of the stage) |
| Clan Conflict on a cut of the harvest square with a ring of onlookers, 2026-10-19: 502 people, 0.24M triangles and about 175 draw calls per view at ultra, DPR 2 | |
| The Dragonbone Inn, evening and dawn, 2026-10-22: two rooms, 0.10M static triangles, at most 167 draw calls and 0.20M triangles per view at ultra, DPR 2 | |

## Module layout

| Path | Role |
|---|---|
| `packages/stage/src/kit/` | RNG, geometry cache, `Batch`, primitives, `Frame`, canvas textures |
| `packages/stage/src/materials/` | Shader-patched materials, scoped atmosphere, heraldry, the material library built from a spec |
| `packages/stage/src/render/` | Paint pass, character mask, scaled GTAO, composer pipeline, tiers |
| `packages/stage/src/figures/` | Pawns, card layer and atlas, crowd population and LOD, standees |
| `packages/stage/src/builders/` | Registry of parametric builders (zod params, material roles) |
| `packages/stage/src/spec/` | Set and staging schemas, the interpreter, and `walk.ts` (footprint tests and straight-line reach, shared by the build, the crowd, the runtime and `stage:check`) |
| `packages/stage/src/sets/`, `packages/stage/src/stagings/` | Repo-local specs (phase 2: the Kordavos gate and its dev staging) |
| `packages/stage/src/stage.ts` | Runtime: renderer, camera, shots, loop, pause, dispose, stats |
| `app/dev/stage/` | Dev-only viewer, `?set=&staging=&quality=` |
| `public/stage/` | Realm of Myr crowd library (16 variants, fronts and backs) and dev character fixtures |

## Set spec v1 (`d20.stage.set`)

JSON only: no expressions, no code. Metres. `y` up. ground at `y = 0`. the set faces `+z` (the camera side). Angles are **degrees**. `yaw` 0 faces `+z`. Colours are hex strings. Asset URLs must be same-origin `/stage/…` paths or on an allow-listed host.

| Field | Contents |
|---|---|
| `format`, `version`, `id`, `settingId`, `locationId`, `title`, `seed` | Identity. `seed` drives every random choice (per object, so editing one object does not reshuffle the rest) |
| `atmosphere` | Sun direction, colour, intensity, shadow box. hemisphere. sky colours. fog density (fog colour = sky horizon). environment intensity. exposure. wind. `lights`: up to 8 static point lights, no shadows |
| `camera` | Near/far, bounds box, orbit limits |
| `backdrops` | Up to four painted, keyed panoramas of far scenery from `/stage/textures`, each on a far cylinder: `arc`, `yaw`, `bottom`, `top` and `radius` place it, `gain` and `haze` grade it. Later ones draw over earlier ones |
| `materials` | Name → `{ type: masonry \| wood \| cloth \| burlap \| metal \| plain \| foliage \| glow \| rock \| meadow \| grass \| water, …params }`. cloth can carry `heraldry` (a named banner design) and `tatters`. Ground masonry draws the gate road's ruts and edge dust unless `roads: false`. `foliage` is an alpha-tested painted leaf texture tinted by its colour. `rock`, `meadow` and `water` are painted from world position, so they need no uv and never tile: rock has moss on upward faces and hollows and lichen on bare stone, meadow has grass and moss patches, bare earth, pebbles, fallen leaves and wildflowers, water mirrors the sky with drifting ripples. `grass` shades blades from root to tip and sways them |
| `objects[]` | `{ type, id?, at?, yaw?, materials?, …params }` , `type` names a builder. params are validated by that builder's schema (unknown keys rejected, ranges clamped) |
| `crowd` | `library` (crowd art id), `avoid` (rects and circles), `groups[]`: `scatter` (area, count, density rects, mix, facing), `line`, `points`, `path` (people along a path), `walkers` (loop or ping-pong along a path), `anchors` (people on builder-emitted anchors such as parapet lookouts) |
| `marks` | Name → `{ at: [x, z], yaw? }` |
| `paths` | Name → polyline `[[x, z], …]` |
| `shots` | Name → `{ position, target, fov }` |
| `life` | `birds`, `dust` |

**Builders.** Each builder declares a zod param schema and **material roles** with default material names (role `wall` → material `stone` unless the object overrides it). Builders author in local coordinates. the interpreter supplies a framed batch (`at` + `yaw`), so footprints and anchors land in world space.

- Woodland: `tree` (`oak`, `pine`, `birch`, solid trunk), `fern`, `bush`, `rock` (solid), `log` (solid), `trail` (a worn strip along a polyline). Scatter layouts take `clear` circles that stay empty.
- Primitives: `box`, `cylinder`, `cone`, `sphere`, `torus`, `lathe`, `beam`, `extrude` (polygon with holes), `opening` (arched window). `box` and `cylinder` take `solid: true` to register a footprint (a platform, a well).
- Layouts: `group` (children in a local frame), `row` (items along a line at a random step), `scatter` (items in an area), each with `vary` (numeric ranges) and `choose` (discrete picks) per placement.
- Kit (ported from v5): fortifications (`gatehouse`, `drumTower`, `curtainWall`, `roundTower`, `squareTower`, `archScreen`, `skyline`, `dome`), town (`house`, `farTown`), market (`stall` with goods `pots`, `baskets`, `cloth`, `sacks`, `arms`, or by name only `jewels`, `spices`, `none`, `sail`, `spearRack`, `standard`, `crate`, `barrel`, `sack`, `pot`, `basket`, `lantern`, `goodsPile`), festival (`bunting`, `sheaf`, `gourds`), checkpoint (`barrier`, `ropeLine`, `brazier`, `ledgerTable`, `cart`, `awning`, `bannerPole`), dressing (`banner`, `pennant`), ground (`groundDisc`, `land`).
- Taverns (`tavern.ts`): `wall` (a straight wall cut by windows with leaded lights, doors with a planked leaf and doorways, each face plaster, boards or stone with a dado, studs and a rail; `door` anchors either side of every doorway), `hearth` (a stone-faced chimney breast, mantel, live fire, spit, pot and log stack), `bar` (counter, dresser of bottles and tankards, kegs), `table` (trestle or round, with a `setting` of tableware), `bench` (a settle with `back`), `stool`, `chair`, `stairs`, `chandelier`, `dragonSkull`.

**Limits** (untrusted input): object count, nesting depth, per-layout counts, crowd total, segment counts and extents are capped in the schemas.

## Staging spec v1 (`d20.stage.staging`), minimal

`set` id, `cast[]` (`id`, `name`, `role`, `height`, `art.front|back|portrait`, `at` = mark name or `[x, z]`, `facing` = degrees, a cast id or a point), `shots` (merged over the set's. adds `subjects` + `offset` two-shots and `subject` + `distance`/`angle` close-ups), `shot` (the opening shot). Scripts, ambient loops and beats come in phases 3–4.

## Verification

- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
- `pnpm stage:check` also checks each staging's art files exist, fails if a cast member starts inside a solid footprint, and reports every straight walk from a cast member to a labelled mark or to conversation distance of another cast member that something blocks.
- `scripts/stage-verify.ts` over CDP against system Chrome at `--force-device-scale-factor=2`, 1440×900 CSS: page ready, no exceptions, every program runnable, budgets per shot (≤ 300 draw calls, ≤ 2.5M triangles), a full screenshot per shot and native-pixel crops of each named character.
- Compare against the prototype's `previews/v5b-*` and `v5w-*` shots.

## Recorded validation

Results recorded 2026-09-29, not rerun in the documentation audit.

About 6,700 lines of TypeScript under `packages/stage/src/` (Biome-formatted) plus a 1,770-line set spec (Biome expands its coordinate arrays). The Kordavos gate builds from JSON in about 240 ms in Node: 398 objects placed, 64 materials, 0.56M static triangles, 194 footprints, 32 lookout anchors and 1,587 people (155 walking).

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

- Phase 3: generalize `Director` into set `loops` and staging scripts (the queue is static here), time of day and weather toggles.
- Cast stand on the ground plane. The festival performers stand in front of a low stage, with crowd cards (which take a `y`) on it.
- Movement is a straight walk that stops at the first footprint. It does not route around stalls.
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

## Recorded checks, 2026-10-03, Valkarr forest trail

- `sun.disc` draws the sun or moon at a different place in the sky than its light comes from. `standingStone` builds irregular weathered monoliths, each with its own shape.
- Night lighting: `sky.clouds` and `sky.stars`, `atmosphere.glow` (colour of the sky's glow and the haze toward the sun or moon), and `atmosphere.fill` (a soft point light carried with the camera). `fog.color` sets mist apart from the sky. `glow` is an additive, unlit, shadowless material, and `lightShaft` builds a soft open cone of moonlight with it. `tree` adds a `gnarled` kind.
- Night set: `atmosphere.sky.gain` (0.22) dims the painted sky, its clouds and sun glow, and the fog colour follows it. The moon is the sun light, cool and high.
- `pnpm stage:check`: 992 objects, 0.61M static triangles, 561 footprints, no crowd. All party walks clear in all three stagings. The owlbear's walk home is blocked by trees, which nothing asks for.
- `stage:verify` at ultra, DPR 2, dev build: every view of the three stagings passes at 49–52 draw calls and 1.22M triangles, ready in about 4 s. Frame rates of 19–24 fps were noisy while other work shared the machine.

## Recorded checks, 2026-10-03, Standing Stones art pass

- New builders in `builders/wilds.ts`: `standingStone` and `rock` are rebuilt from seeded noise cut by fracture planes, with creased normals, so stones have flat broken faces and weathered curves. `flagstones` sets irregular slabs in turf along a polyline. `grass` fills an area with tufts of curved blades (or heather with a heather material). `mountain` builds a distant ridged peak.
- `tree` adds `leanYaw` (lean toward a heading) and `low` (coarser leaf masses for distant woods). Scatter `clear` takes up to 256 circles.
- `atmosphere.sky.moon` draws a crisp full moon at the sun's disc. `atmosphere.grade: "neutral"` turns off the paint pass's warm umber shadows and parchment highlights, which had warmed every night scene. It also turns off the standee shader's warm grade, through the shared `warmth` uniform.
- `pnpm stage:check`: the stones set places 1,415 objects, 1.19M static triangles, 671 footprints. Grass (0.35M) and leaves (0.41M) dominate. All party walks clear in both stagings.
- `stage:verify` at balanced, DPR 2, dev build: 42–44 draw calls, 1.55–1.94M triangles, 36–61 fps while other work shared the machine.

## Recorded checks, 2026-10-03, Kordavos harvest square

- `pnpm stage:check`: both sets and stagings pass. The square places 138 objects, 0.12M static triangles, 76 footprints and 454 people (44 walking). The gate is unchanged: 0.56M static triangles and 1,593 people.
- Walks: in the festival staging, 160 of 162 are clear. Every walk from the party to each labelled place and each NPC is clear. The two blocked walks are NPCs to the food stalls, which nothing asks for.
- `stage:verify` on the festival (dev build, M3, 1440×900 CSS): all 8 shots pass. Ultra at DPR 2: 159–180 draw calls, 0.24–0.26M triangles, ready in 4.1 s. Balanced: 142–163 calls. Native-pixel crops of all five NPCs keep faces and costume detail. Frame rates in that run were noisy (6–31 fps ultra, 25–66 balanced) while other work shared the 8 GB machine, so they are not a benchmark.
- `moveCast` also ends a walk on a timer at its expected arrival, and `dispose()` resolves walks in progress. Frames stop while a window is covered, and the native app's turn used to wait on the walk.
- After the shared walk/footprint refactor and the ground `roads` flag, the gate's balanced shots still pass with the same counts (1.37–1.57M triangles, 172–179 calls).

## Recorded checks, 2026-10-04, Covert Cargo

- New builders in `builders/river.ts`: `riverboat`, a river tug (a lofted hull with a U section, a sheer that rises to the bow and a dark hull below a blue-grey strake, rust rub rails, a pale cabin with rust posts, a glazed saloon forward with lit windows, a glazed pilothouse with a barrel roof, stack, vent, life rings and bitts; the cabin is solid; rebuilt after the owner's review, below), `pier` (boards on pilings with mooring posts, `rickety` tilts and drops boards) and `ship` (stepped hull, sterncastle, one to three masts, sails set or furled, stays). Decks and boards sit at y = 0 so people stand on them, with the water lower.
- `tree` adds `moss` (grey beards hanging from limbs and crowns) and an `ancient` kind: a smooth kinked taper, a buttress flare, snaking roots and great limbs. The `gnarled` trunk tapers each segment to half its radius, which reads as stacked cones at large girths, so it was left alone for the approved Midnight Summons sets.
- Ground with a river cut: an `extrude` in the "xz" plane with the river as a hole, 0.6 m deep with its top at y = 0, and a water slab 0.49 m down. The primitive's "xz" plane mirrors z (a point `[x, z]` lands at world `(x, -z)`), so `scripts/stage-sets/covert-cargo.ts` writes those outlines mirrored. `river.ts` has its own `plan()` helper that does not mirror.
- `pnpm stage:check`: the pier places 1,128 objects, 1.00M static triangles (leaves 0.56M, bark 0.15M) after cutting trees and moss from a first 1.75M. The cabin 212 objects and 0.11M, the riverfront 138 objects and 0.14M, the forest path 753 objects and 0.83M. All nine stagings pass with no one starting inside something solid.
- `stage:verify` at high, DPR 2, dev build: the pier 88–89 calls and 1.81M triangles (the first version measured 3.21M, over budget), the cabin 73–86 calls and 0.21M, the riverfront 87 calls and 0.28M, the forest path 39–40 calls and 1.44M. 44–67 fps while other work shared the machine.

### Second pass, matched to the art

- Owner feedback: "I was expecting it to match the art more exactly for the boat and lighting." The first `riverboat` was a stepped box. It is now the tug in the art. The hull is lofted from stations, 12 m by 3.6 m. Params: `length`, `beam`, `draft`, `sheer`, `cabin`, `saloon`, `height`, `lit`. The pilothouse glass has its own `helm` role, defaulting to `window`, so it can glow dimmer than the saloon as in the art.
- New `atmosphere.lights`: up to 8 static point lights with colour, intensity, distance and decay, and no shadows. They pool lamp and window light on the deck and the pier, and glint in the water. The water still mirrors only the sky, so the lit windows have no true reflection.
- Pier: saturated blue night with a low misty sun disc, warm lights in the saloon and pilothouse, a lantern on the pier and a cold lamp on the bank. Dense bushes and ferns along both banks, with clear circles at the cameras and along the trail. Cabin: a neutral grade with grey-brown wood, warm lanterns and candles, and a cold teal light at the open door.
- `pnpm stage:check`: the pier 1,859 objects and 1.24M static triangles (leaves 0.39M, dark leaves 0.28M, bark 0.15M). The cabin 212 objects and 0.11M.
- `stage:verify`, dev build: the pier at high 88 to 91 calls and 2.30M triangles, under the 2.5M budget, 25 to 31 fps. At balanced 84 to 87 calls and 55 to 61 fps. The cabin at high 73 to 82 calls, 0.21M triangles and 52 to 69 fps.

### Third pass: painted textures, props, hillside, fog

- `painted` material: one board's grain from an image in `public/stage/textures/`, laid along each piece's grain with the wood shader's seams, worn edges, grime and optional nails. Each board shows its own patch of the painting. `size` is the metres the image covers across and along the grain. `tint` multiplies it.
- `card` material: an alpha cut-out, double-sided, no shadow. Tree `moss` hangs as crossed cards when the moss material is a card.
- `mist` material and `mist` builder: soft cloud cards faded at every edge, standing or flat over water.
- `heightfield` primitive: a grid of heights from a set generator, which seats trees and bushes on the same function.
- `strongbox` builder: a detailed cargo crate. `riverboat` gained a full roof rail, rope fenders, a `rope` role and a pilothouse that scales with the cabin height.
- `atmosphere.fog.start`: haze begins this many metres out. Near things keep their colour, as in the art.
- The material library loads painted textures and the stage waits for them before the first frame. Set specs accept textures only from `/stage/textures/`.
- Grain: a flat face takes the axis that runs longest along it, projected into the face. Boxes keep their old grain. A lofted hull's planks now follow it to the bow instead of turning vertical.
- Textures come from `scripts/stage-textures.ts`. The desktop build copies `public/stage`, so they ship with the app.

### Fourth pass: leaf cards, rope and chain

- `foliage` takes an optional painted `map`, a leaf clump cut out from the art. Builders then lay each crown or bush mass as crossed leaf cards with normals pointing out from the centre, so a mass shades like a rounded clump. Cards cost 28 triangles a mass against 192 for a leafy sphere.
- The card foliage shader boosts alpha by the sampled mip level, so distant crowns keep their leaves. Card foliage casts leaf-shaped shadows through an alpha-tested depth material.
- `rope` and `chain` builders: a sagging line between two points, rope with knots, chain with alternating oval links.
- `stage:check`'s stub materials carry the card flags, so its triangle counts match what renders.
- `scripts/stage-textures.ts` keys cut-outs on magenta when the subject is green.

### Fifth pass: planar water reflection

- Water with `mirror` (0..1) gets a true reflection: `render/mirror.ts` renders the scene from a camera mirrored in the water plane, with an oblique near plane so nothing below the surface draws, into a half-float target. Shadow maps are reused from the main render. The water shader samples it projectively and mixes it into its specular, offset by the ripple normal.
- Tiers set its size as a share of the drawing buffer: mobile 0, balanced 0.35, high 0.5, ultra 0.6. A `mirror` flag overrides it. Sets without mirrored water pay nothing.
- `riverboat` now has a rounded saloon bow with windows and a glazed door round it, rust posts and fascia following the curve, an overhanging upper deck with a rail all round, and a narrower pilothouse.

### Speed pass, 2026-10-04

- `atmosphere.sun.shadow.size` caps a set's shadow map below the tier's. The Mordava pier uses 2048.
- `foliage.shadow: false` keeps a leaf material out of the shadow map. Card foliage casts plain card shadows when it casts at all: alpha-tested leaf shadows in a 4096 map cost several milliseconds.
- Leaf masses are nine larger cards. Painted wood drops the ring and fibre noise and three grime octaves the painting already carries.
- The planar reflection leaves out grass, unpainted foliage, cards, mist and rocks. High renders it at 0.4 of the drawing buffer.
- River view on high: 1.82M to 1.09M triangles, 138 to 125 calls. Balanced reads 66 fps, high 40 to 48, on a loaded dev machine.
- Character shots swing clear: `stage.shot({ subject, ... })` tries turns of up to 180 degrees round the subject and then 75 and 55 percent of the distance, until the camera, clamped to the set's camera box, has 0.45 m of room and a clear line to the subject past every solid footprint. Walls that should block a camera must be `solid`.
- Someone standing in a room (`set.rooms`) is framed from inside it. The swing first looks for a spot in the room with nobody else in the sight line, then any spot in the room, and only then a camera outside looking in through a door.

## Saloon wood and windows, 2026-10-05

- Owner: the wood still lacked the paintings' detail, and asked for windows with depth. The interior had used `cabin-dark`, a low-contrast smoky board that showed almost no grain once tinted and dimly lit.
- Four textures painted from the interior paintings at 1536 px with `scripts/stage-textures.ts`: `cabin-planks` (the battle's red-brown wall boards, a knot), `timber-hold` (the hold's cracked grey-brown timber), `door-oak` (the Fake's honey oak door) and `floor-worn` (the hold's worn floor). Walls, posts and beams, ceiling, floor, door and the helm's trim use them.
- A `glass` material: see-through and one-sided, drawn as single panes. A window's outer pane faces out and glows warm while the room shows through; from inside it is culled, and a faint inner pane faces in.
- With `interior`, the riverboat's bow has seven flat panels, one per window, and the saloon's walls are built around real openings: piers, sills and heads in the planking and lining, a rust frame, sill, mullion and two transoms outside, the timber frame inside. Footprints still close every window and leave the doorway open. A second outdoor lamp lights the aft saloon for the view in.

## Rooms and the saloon's finish, 2026-10-05

- Owner: the interior did not meet the quality bar next to the crate, battle and fake paintings. The saloon read as an evenly lit box with flat blue window panels, striped thin timbers and pale box lanterns.
- Sets can declare `rooms`: a box the camera stands in, with an `ambient` share for the sky's light, a camera `fill`, an `exposure` and up to eight lamps of its own. While the camera is inside, the hemisphere and environment fade to that share and the room's lamps replace the set's, over about a third of a second each way. One set of point lights serves outside and every room, so the light count and the shaders never change.
- The saloon is dark but for its lamps, as in the crate's art: a warm pool on the crate, five ship's lanterns, a lamp by the door and cold river light at it. Outside, one lamp inside the saloon lights its door.
- The riverboat builder's interior now has upright red-brown boards in narrow panels, ribs between the windows, a rail and skirting, a dark boarded ceiling with deep beams, carlins and knee braces, worn floorboards, window frames with sills and glazing bars, closed shutters on every other side window, and a planked door to the owner's cabin standing open against the bulkhead. The bow door has iron studs, strap hinges, a riveted brass porthole and a brass knob. New material roles: `floor`, `ceiling`.
- The generator adds massive iron-bound posts with bolts, a header beam carrying the chain, knee braces, ship's lanterns of brass, glass and iron, a chart table with a candle and papers, gauges with needles, more rope and stores.

## Covert Cargo's meeting inside the boat, 2026-10-05

- Owner review against the source: the meeting belongs inside the boat, with one larger interior. See [the plan](plans/covert-cargo-boat-meeting.md).
- The tug's cabin is wider and longer (`riverboat.width` 0.78 of the beam, `cabin` 0.6, `saloon` 0.72), so the saloon is a room about 7.3 by 4.2 m. With `interior`, the bow door is the only way out, with a porthole in its leaf. The aft exterior door is gone, and a dark doorway in the aft bulkhead leads to the owner's cabin, which stays solid.
- The Fake, Battle on the Boat and The Crate now play in the pier set's saloon. The separate `riverboat-cabin` set is retired, and the helm, gauges and crate hold moved into the saloon.
- Staging: Lyra at the crate, Reinhard beside her, Silas by the door, Aelar out of his cabin on "the cabin door opened", one elf by the gangway and one at the stern, Poppen peeking from bushes at the treeline. The Shipment's intro lines that put people outside were edited to match.
- Walks go through doorways. A builder anchors a doorway as a pair of `door` anchors, a step inside and a step outside. `routeOver` tries the straight line, then each doorway in either direction. `Stage.route` returns the points to walk through within the budget, the desktop walks them, and `stage:check` counts a walk through a door as clear.
- A staging entrance can name the `shot` it is seen from. The computed arrival view would have put the camera on Silas.
- Interior lanterns use a dimmer amber flame. The shared flame, emissive 5, reads as a white box up close.

## Covert Cargo's crate inside the tug, 2026-10-04

- Owner review: Covert Cargo opens with "Lyra stands inside the boat, the mysterious cargo crate before her", and the crate's art shows a dim hold. The crate now sits inside the tug's saloon, not on the foredeck.
- `riverboat.interior: true` makes the saloon a room. Its walls follow the cabin outline round the bow, panelled inside, with dark night panes behind the lit windows and the bow door standing open on its port hinge. The aft cabin stays solid. Walls and the door leaf are footprints, so walks and camera lines stop at them and pass through the doorway.
- The pier's saloon is 0.55 of the cabin, a room about 5 m long, so a camera can stand back from the crate. The crate faces aft between banded posts, a chain sags between them, a rope hangs to the floor, and a light above the crate's front pools on it.
- Footprints can carry a `top`. A strongbox registers its height, and a character shot's sight line and elbow-room test pass over anything lower than the line at that point. Lyra's shot looks over the crate at her with the open door and the river behind her.
- Staging `entrances` keep a cast member offstage until the paragraph containing `when`, then walk them on from `from`. `stage.setOnStage(id, on)` and `stage.isOnStage(id)` drive it. Aelar comes out of the saloon door at "the cabin door opened", and the camera looks back at the door from beyond his place.
- Staging `exits` are the mirror. A cast member stays until the paragraph containing `when`, then runs to `to` and is gone, or with no `to` falls where they stand. A run goes by its `via` points first, in order, since one walk is a straight line or a single doorway. `stage:check` walks every exit and fails one that stops short. An exit with no `when` only names the way out. A fall waits about 1.5 seconds so the camera is there, lands the head toward `lands`, and is seen from the exit's `shot`. Someone down lies on their back along their own facing, so a body's `facing` sets how it lies. A cast member with `down: true` lies on the ground from the start. `stage.setDown(id, down, instant)` tips the card back onto the floor.
- A cast member's `y` stands them that many metres up, on a roof or a balcony. Subject and group shots add it to their heights, effects start at their chest, and walks keep it. `stage:check` does not walk them or to them, and does not check their exits. Added 2026-10-23 for the Cowl's archers and Joran's balcony.
- The desktop play view also takes out anyone the game has: a character whose last round in the encounter left them dead lies down, and one who fled runs to their exit's `to` and is gone. It happens at the first new paragraph that names them. Before 2026-10-12 a dead or fled NPC kept standing.
- Narration reads an entrance cue as naming the entrant, so "A figure emerges… He is tall" is about Aelar. A possessive name counts once ("Lyra's escorts" are not Lyra), and an unnamed description that fits the last character ("the lead elf" after Aelar) keeps their pronouns.
- Limits: walks are straight lines. From inside the saloon, a walk toward the foredeck passes the door, but one toward the gangway stops at the wall. Saves made before this change keep their stored positions.

## Narration shots, 2026-10-04

Removed 2026-10-14: the camera and speakers now come from labelled beats. The history below is kept for the record.

- Revised the same day after owner review: `narrationShots(paragraphs, stage, genders)` reads a turn's paragraphs in order. A paragraph is about whoever it refers to most: a name counts twice, a pronoun once for the nearest character of that gender named before it, else for the one the previous paragraph was about, unless the paragraph first brings in someone unnamed ("A figure emerges… He is tall"). One character with twice the next one's references gets their own shot, several share the staging group shot. "For her part… She had studied…" after Lyra's paragraph now frames Lyra, not the wide meeting.
- Speakers: `readNarration(paragraphs, stage, people)` also says who speaks in each paragraph. Each quote goes to the speech tag beside it ("Silas replies", "says Reinhard", "asked the elf", "she said"): a name, a pronoun resolved like the camera's, or a word the character goes by unnamed, from their race and class. Without a tag, whoever the sentence beside the quote is about (the pronoun or name it opens on, else the first name in it that is not a possessive), the sentence before first, else the one after. Only then the cast member named nearest. Changed 2026-10-11: "Lyra adjusts her spectacles and gives Silas a small nod. “It is genuine.”" gave Silas the line. A tag before a quote also no longer reaches back past the sentence just before it. Before this, a bubble appeared only when a paragraph named exactly one character, so "asked the elf" and "“I have it here, Aelar,” Silas replies" got none. Each speaker gets a bubble, the first a portrait plate and the camera. Changed 2026-10-13: a quote alone on its line, as an NPC's turn now writes them, had no sentence beside it, so "“Thalbern, we have a problem.”" went to Thalbern, the nearest name. A quote that opens its paragraph now follows on from the sentence that closed the paragraph before. Nobody speaks a quote that names them, unless they name themselves ("I am", "call me"), and when that leaves one other person in the scene the line is theirs. The nearest-name fallback ignores names inside quotes. A sentence that opens on a pronoun is about whoever the sentence before was about when the gender fits ("Garlan raises a hand toward Yeva and Milos. His voice carries." is about Garlan, not Milos), and a speaker carries to the next paragraph's pronouns. Changed again the same day: "Thalbern meets Wollandora's gaze and asks quietly, “…”" gave Wollandora the line, because the three words before "asks" held her name. A tag before a quote is now cut at its last conjunction, so "…gaze and asks" names nobody and the sentence's subject speaks. The nearest tag before the quote counts, not the first. A tag that leads into the quote on a comma or colon comes before one that follows it. After a quote that ends on a full stop, "Aelar laughs." is the next sentence, not a tag. In a tag the name beside the verb counts: the first after "says", the last before it. "He says" follows the subject of the sentence before when the gender fits, and a pronoun with no one to point back to is the only one of that gender in the scene. "I am Thalbern" is spoken by Thalbern. A quote that follows a paragraph ending on a quote is the same voice going on, as an NPC's turn writes each spoken line on its own line.
- First version: `narrationShot(text, stage)` in `narration.ts` picks a view for a paragraph of narration. Two or more cast members named: the staging group shot framing most of them. One named: their own shot, or a shot on them. Nobody named: the set or staging shot whose key and label best match the paragraph through a small thesaurus (riverboat finds "The tug", water finds "The river"). Nothing matches: the opening shot for the first paragraph, otherwise the camera stays. A first word that describes rather than names ("Elven Archer") does not count as a name.
- The desktop calls it as the player steps through a turn's narration with Continue. A quoted line still frames its speaker.
- Named staging shots on one character swing clear of solid footprints like inline ones. When a shot is taken and the camera had to swing more than 60 degrees from the character's facing, the character turns toward it, so a standee is not seen side on, where front and back dissolve into each other.
- On Covert Cargo's opening, 14 paragraphs moved through the river, the meeting, Poppen in the reeds, the tug and the named characters' shots.

## Effects, objects and labelled beats, 2026-10-14

Part of [structured narrative](plans/structured-narrative.md).

- `packages/stage/src/effects.ts` plays an attack or a spell from a small library: `arrow`, `bolt`, `beam`, `burst`, `aura`, `sparkles`, `slash`, `impact` and `mist`, coloured by an element (fire, frost, lightning, radiant, nature, shadow, arcane). Each is built at runtime from additive glow sprites, rings and shells, plays once and is disposed.
- Objects: `scroll`, `letter`, `map`, `pouch`, `coin`, `key`, `relic`, `lantern`, `torch`, `blade`, `bow`, `potion`, `book`, `gem`, `pack`. Each is a small procedural model about half again its real size, held toward the camera beside the holder, and carried across to a receiver when there is one.
- One point light is added to every stage for effects, dark when idle, so lighting an effect never changes the shaders.
- `stage.effect(kind, from, to?, element?, { miss })`, `stage.prop(kind, holder, receiver?)`, `stage.hit(id, color, strength)`. A miss lands beside the target and flashes nobody.
- A struck card is tinted toward the effect's colour, with a faint glow and a shake, over about half a second. A stronger glow turned night-scene cards into flat silhouettes.
- The desktop play view reads a labelled turn from its beats: bubbles from lines, the camera from who acts and at whom or from a named place, entrances from `from`, walks from a place or a person, effects and objects once the camera has settled. An attack in a hero's reply waits for its roll and plays after it, as a hit or a miss.
- Two people are framed by the staging's own group shot on both when there is one, else over the actor's shoulder when nothing solid stands behind them, else on the target. A place is seen from behind the heroes, or from the scene's view nearest it.
- `stage.point(name)` finds a cast member before a mark of the same name. The Midnight Summons names its marks after the cast, so an entrance walked to where the entrant already stood. The play view now reads an entrance's places as marks.
- `readNarration` and `narrationShots` are removed, the same day, once every intro was labelled. A paragraph that names no one and no place leaves the camera where it is.
- Checked on the dev stage page and in the desktop preview with a scripted Owlbear fight. Not checked in the packaged app or at the small-window layout.


## Crisp near ground, 2026-10-15

- Owner: the grass at the Standing Stones looked fuzzy in the desktop app.
- Cause: the paint filter runs 540 to 900 px tall, and the whole frame was mixed toward it. Grass blades are about 2 cm wide, so the filter smeared them. The desktop app plays on balanced, which also renders at pixel ratio 1 with no anti-aliasing.
- The paint pass's final blend now keeps a quarter of the paint (`nearKeep`) within 3 m of the camera, rising to all of it by 18 m. Uniform paint mode turns this off. Characters keep their own mask.
- Balanced now uses FXAA. Without it the crisp blades and leaf cards stair-step at pixel ratio 1.
- Checked on `/dev/stage` at the stones (path, stones and Wollandora shots), balanced and high, DPR 2. Stones, trees, characters and sky look unchanged. FXAA on balanced measured within noise, 44 to 58 fps either way at load average 4.5. Not checked in the packaged app.

## Painted backdrop, 2026-10-17

Part of [painted backdrop](plans/stage-backdrop.md), from spike (a) of the [stage art spikes](plans/stage-art-spikes.md).

- A set's `backdrops` hang painted panoramas on open cylinders, 520 m out by default. One draw call, unlit, drawn after the opaque set, so the land hides its lower edge and the sky, moon and stars show through its keyed sky.
- `packages/stage/src/backdrop.ts` builds it. `load()` waits for its texture, and one that fails stays hidden.
- `scripts/stage-backdrops.ts` paints a panorama with Gemini 3 Pro Image at 21:9 4K on magenta, then keys it at 4096 px wide: about one texel per screen pixel at DPR 2, and within every GPU's limit.
- The Old Standing Stones uses `stones-valley.webp`, 360 KB, over 130 degrees, in place of its three mountain cones.
- Checked on the lab page at DPR 2, high tier, every Standing Stones shot: matches the spike's 6336 px version, mean difference under 0.2 of 255.
- 2026-10-18: owner flagged Thalbern's close-up. He faces the valley, so his close-up looks the other way, at a bare plain. `backdrop` became `backdrops`, up to four, drawn before other see-through things and in order. The stones gained `stones-woods.webp`: a dark forested ridge across the river, 440 m out over 120 degrees, gain 0.42.
- The key now keeps only paint joined to the bottom edge, drops paint floating in the sky, and fills magenta that the land encloses as mist.
- 2026-10-18: backdrops added to the Kordavos riverfront (a row of houses at the paving's edge), the old forest path (giant trunks in haze, both ways) and Thalbern's forest home (a sunlit forest edge). The forest trail, the Kordavos gate and square, and the Mordava piers show no bare horizon in their shots and have none.

## March of Davos playtest pass, 2026-10-19

From an automated play of March of Davos with the live GM and a pass over every view. See [the playtest plan](plans/march-of-davos-playtest.md).

- Subject shots (close-ups, speakers, the acting hero) score every view clear of walls by who stands in the sight line or within 1.8 m beside the lens, cast at 3 and crowd at 1, plus a cost for swinging far round (up to 2.5 behind the subject) or drawing in. The lowest wins. Rooms keep their inside-first pass.
- Crowd cards within 1.1 m of the camera, measured to the chest, are not drawn, so a passer-by never fills the frame.
- A camera the player drags into a solid footprint (circles of 1.2 m radius and up, and rects of 1.5 m² and up without a `top`) is drawn back toward its target until clear. Shots are left as authored.
- `fire` material: crossed flame cards that lick, sway and flicker, premultiplied so the core covers what is behind it. `brazier` uses three cards turned at random when its fire material is a `fire`.
- `orb` material: dark polished glass with mist turning inside and a bright rim, for spheres.
- Cloth lets the sun through: the side turned from the sun gets a tenth of the sun's light in its own colour, so awnings seen from below are not black.
- `prizeWheel` builder: a wheel of chance on a post, painted wedges, brass rim and pegs, hub and pointer.
- `sheaf` is now stalks bound at the waist with ears of grain round a core, about 1,250 triangles.
- Town houses' windows have frames, a cross of glazing bars, sills and shutters, open or now and then closed.
- Story view, for an encounter with no set, shows the encounter's painting from `public/stage/art`, and NPC portraits come from `public/stage/portraits`.
- Cloth thins out, dithered, over the last metre before the camera, so bunting or an awning's edge passing by the lens never fills the frame with flat colour. 2026-10-20.
- A drag stops at 50 degrees from straight overhead, a look down of about 40 degrees, near the festival's overview shot. From higher the crowd's cards read as pegs. The limit applies from the angle the drag starts at, so a steeper authored shot does not jump, and every `shot()` lifts it. 2026-10-20.
- Measured: the gate set 0.67M static triangles, the square 0.18M, after windows and sheaves. Every staging still passes `pnpm stage:check`.

## The Dragonbone Inn, 2026-10-22

See [the plan](plans/dragonbone-inn-stage.md).

- Two sets from one generator: the evening, lit by the fire, two chandeliers and lanterns with dusk in the windows, and the dawn, with the sun through the street windows, the fire banked, candles out and dust in the light.
- The camera passing straight from one room into another, as from the common room into the backroom, kept the first room's lamps. `lightRoom` now relights when the room changes.
- Window glass cast shadows, so the sun never came through a window. Glass now casts none, while the leading and frames do: the dawn sun lays the leaded lights on the floor.
- The hearth's face is courses of rough faceted stones in a `rock` material over a dark mortar core. Masonry blocks with relief read as studded tiles under firelight.
- The plaster between the studs is a `rock` material in limewash colours. A blank masonry plaster read as empty panels.
- Measured at ultra, DPR 2, on this Mac: 121 to 167 draw calls, 0.16M to 0.20M triangles, 25 to 36 fps.


## March of Davos sets, from 2026-10-23

See [the plan](plans/march-of-davos-sets.md).

- `image` material: a painting laid by the builder's uv, tinted, with `glow` (lit from within by its own colours, no shadow) and `double`.
- Library builders: `panel`, `archHead`, `bookcase`, `vault`, `cupola`, `gallery`, `column`, `desk`, `armchair`, `globe`, `candleStand`. `beam` takes `open`, and `chandelier` drops up to 12 m.
- Measured: the Old Grand Library 0.25M static triangles, 0.50M rendered with shadows, about 130 draw calls.
- Nautical builders: `serpent` (a sea serpent in a wall's plane, for a sign), `shipWheel`, `anchor`.
- Measured: the Silver Serpent Tavern 0.12M static triangles, 0.24M rendered, about 160 draw calls.
- Harbour builders: `galleon` (a ship people walk aboard, deck at y = 0, a gangway doorway), `cage` (with `melted`), `crane`, `warehouse`, `skiff`, `bollard`. `crate` and `barrel` take `solid`.
- Measured: the Kordavos docks 0.16M static triangles, 0.47M rendered, about 220 draw calls, after the quality pass.
- `galleon` castles follow the hull outline, with a rising stem and beakhead, gilt bands, and four yards a mast with the top sails furled. Standee keying takes `hue`.
- Street builders: `tenement`, `laundry`, `wallLantern`, `hangingSign`. Measured: the Lower Districts 0.17M static triangles, 0.33M rendered, about 150 draw calls with 84 walkers.
- Black Market builders: `curtain`, `lanternString`, `curioShelf`, `treasureCounter`, `bladeRack`, `boards`, `canvas`. `stall` takes `pad`. `image` takes `size`, the metres a tile covers on surfaces whose uv runs in metres. Measured: the Black Market 0.21M static triangles, 0.42M rendered, about 210 draw calls with 48 walkers.
- A shot's target beyond `camera.maxDistance` is drawn in along the shot's line, so the orbit no longer drags the camera toward it.
