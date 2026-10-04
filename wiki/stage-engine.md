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
| Crowd: procedural pawns, instanced front/back cards, hybrid LOD, walkers | Clan Conflict and later encounters (story view on desktop) |
| Named characters as front/back standees with alpha-derived normals | Procedural hero rigs and the MakeHuman head (superseded by standees) |
| Quality tiers, pause when hidden, `dispose()` | Mobile measurement |
| Set spec + interpreter + parametric builders. the Kordavos gate as the first spec | |
| Minimal staging spec (cast at marks, shots relative to cast) for `/dev/stage` | |
| Native gate scene and HUD connected to local CLI GM turns, movement, and SQLite saves | Further sets and native gameplay coverage |
| Kordavos harvest square and the Harvest Festival staging, selected by encounter on desktop | Raised cast placement (festival performers stand in front of the stage) |

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

## Narration shots, 2026-10-04

- Revised the same day after owner review: `narrationShots(paragraphs, stage, genders)` reads a turn's paragraphs in order. A paragraph is about whoever it refers to most: a name counts twice, a pronoun once for the nearest character of that gender named before it, else for the one the previous paragraph was about, unless the paragraph first brings in someone unnamed ("A figure emerges… He is tall"). One character with twice the next one's references gets their own shot, several share the staging group shot. "For her part… She had studied…" after Lyra's paragraph now frames Lyra, not the wide meeting.
- First version: `narrationShot(text, stage)` in `narration.ts` picks a view for a paragraph of narration. Two or more cast members named: the staging group shot framing most of them. One named: their own shot, or a shot on them. Nobody named: the set or staging shot whose key and label best match the paragraph through a small thesaurus (riverboat finds "The tug", water finds "The river"). Nothing matches: the opening shot for the first paragraph, otherwise the camera stays. A first word that describes rather than names ("Elven Archer") does not count as a name.
- The desktop calls it as the player steps through a turn's narration with Continue. A quoted line still frames its speaker.
- Named staging shots on one character swing clear of solid footprints like inline ones. When a shot is taken and the camera had to swing more than 60 degrees from the character's facing, the character turns toward it, so a standee is not seen side on, where front and back dissolve into each other.
- On Covert Cargo's opening, 14 paragraphs moved through the river, the meeting, Poppen in the reeds, the tug and the named characters' shots.

