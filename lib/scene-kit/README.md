# scene-kit

The shared runtime library every authored 3D encounter set is built from. Vanilla three.js, browser-only, no imports from the rest of the app. This document is also the kit reference handed to the model that authors sets, so keep it accurate when the API changes.

## The set contract

A **set** is a location. One file per location under `lib/scene-sets/<setting>/<set-id>.ts`, registered in `lib/scene-sets/manifest.ts`.

```ts
import type { SetContext, SceneSet, SetDefinition } from "@/lib/scene-kit"

async function build(ctx: SetContext): Promise<SceneSet> { ... }

export const mySet: SetDefinition = {
  id: "kordavos-outer-gate",          // kebab-case location id
  title: "The Gates of Kordavos",
  summary: "One line: what it is, its marks, cameras and toggles.",
  build,
}
```

`SetContext` gives the builder:

| field | what it is |
|---|---|
| `scene`, `renderer` | the three scene and renderer (needed by `createEnvironment`) |
| `time` | `{ value }` seconds, ticked every frame; pass to cloth, grass, sky |
| `rng` | seeded `Rng`; use `rng.fork(salt)` for independent streams |
| `materials` | `MaterialLibrary`: cached texture bakes and material constructors |
| `fire` | `FireSystem`: flames, smoke, flickering lights; **push it into `animated`** |
| `toggles` | `{ timeOfDay?: "day" \| "dusk" \| "night", ...set-specific flags }` |
| `progress(msg)` | report a loading stage and yield a frame |

`SceneSet` the builder returns:

| field | what it is |
|---|---|
| `root` | a `Group` containing everything; the host adds it to the scene |
| `marks` | named stage positions `{ position: [x,y,z], facing: yawRadians, label }`. Facing 0 looks toward +Z. |
| `cameras` | named shots `{ position, target, label, fov? }`. **The first is the opening shot** players see on load; name one `establishing` for the wide view. |
| `groundHeight(x, z)` | terrain height, for placing characters and clamping the fly camera |
| `environment` | the handle from `createEnvironment` |
| `animated` | objects with `update(t, dt)`; must include `ctx.fire` |
| `dispose()` | `environment.dispose()` plus anything else held outside `root` |

Conventions: Y up, metres. The approach to the action runs along +Z toward the origin. Builders construct at the origin facing +Z; the set positions and rotates them. Nothing is text or lettering; emblems only.

## Modules

### core
`Rng` (`value`, `range(a,b)`, `int(n)`, `pick(arr)`, `chance(p)`, `sign()`, `fork(salt)`), `Noise` (`v`, `fbm`, `f`), `smoothstep`, `clamp`, `lerp`. `TEXTURE_NOISE` and `TERRAIN_NOISE` are fixed shared fields.

### materials — `MaterialLibrary`
Texture sets (lazy, cached): `stoneTex`, `stoneLightTex`, `plasterTex`, `woodTex`, `woodDarkTex`, `woodVTex`, `knotTex`, `medallionTex`, `grassTex`, `dirtTex`, `cobbleTex`, `birchTex`, plus cloth: `asterianTex`, `valkaranTex`, `tabardTex`, `canvasClothTex`, `stripeRedTex`, `stripeTealTex`, `stripeGoldTex`, `plainRedTex`, and `cloth(key, options)` for any other cloth (`color`, `weave`, `noise`, `fade`, `emblem`, `tatter`, `stripes`).

`plasterTex` is lime plaster; `rubbleTex` is fine pale coursed stone.

Materials: `stone(ru, rv, extra?, tex?, moss=1)`, `wood(ru, rv, tex?, extra?)`, `clothMat(tex, ru, rv, extra?)`, `relief(tex, ru, rv, normalScale)`, `flat(color, roughness?)`, `emissive(color, emissive, intensity)`, and constants `iron`, `ironDark`, `steel`, `plate`, `gold`, `brass`, `rope`, `roofTimber`, `hay`. `sprite(inner, outer)` gives a radial gradient texture.

### textures
Generators behind the library, for one-offs: `stoneTexture`, `woodTexture`, `clothTexture`, `knotTexture`, `medallionTexture`, `grassTexture`, `dirtTexture`, `cobbleTexture`, `birchTexture`, `radialSprite`; helpers `texSet(set, ru, rv, rot)`, `normalFromHeight`, `grayTex`, `canvasTex`.

### emblems
`drawSunEagle` (Asterian), `drawTreeStag` (Valkaran), `drawCityCrest` (Kordavos). Painters `(ctx, size) => void` for `clothTexture({ emblem })`.

### shaders
`mossify(mat, strength)`, `clothify(mat, time, { W, H, strength, phase, mode })`, `grassify(mat, time)`, `hayify(mat)`, `addWorldPos(shader)`.

### environment
`createEnvironment(scene, renderer, time, options)` → `{ sun, hemisphere, sky, sunDirection, dispose }`. Presets in `ENVIRONMENT_PRESETS`: `autumnMorning`, `goldenHour`, `night`. Options: `sun` direction, `sunColor`, `sunIntensity`, `shadowExtent`, `shadowMapSize`, `shadowTarget`, `hemisphere`, `sky: { zenith, horizon, ground, cloudCover } | false`, `environmentIntensity`, `fog: { color, density } | false`, `exposure`. Interiors pass `sky: false` and light themselves.

### terrain
`rollingMeadow(opts)` and `flatGround` are `HeightFn`s. `createGround(materials, { heightFn, size, segments, grassRepeat, road })` with `road: { halfWidth, fadeWidth, startZ, apron: { x, z, radius }, ruts } | false`. `createPavedArea(materials, { width, depth, x, z })`. `createGrassField(materials, time, { count, sample, heightFn, rng })` and `createWildflowers(...)` take a `sample(rng) => [x, z] | null` callback that encodes keep-clear zones. `birchTree(materials, rng, heightFn, x, z, scale)`.

### atmosphere
`createGodRays(time, { halfWidth, springHeight, centreY, fromZ, toZ, count, color, strength })`, `createDust(time, rng, { count, near, far, pixelRatio })`, `createGlow(materials, { x, y, z, width, height, opacity })`, `createBirds(rng, opts)` → `{ group, update }`. `FireSystem`: `addFire(parent, { count, y, scale })`, `addSmoke(parent, { count, y })`, `addLight(parent, { color, intensity, distance, y })`.

### builders (all take a `BuilderContext { materials, rng, time, fire }` first)
- **figure**: `figure(ctx, opts)` (h, skin, tunic, legs, cloak, hood, hat, staff, bundle, basket, sack, hair, seated), `randomTraveler(ctx, extra)`, `guard(ctx, { spear, tabard, tunic })`, `armoredCaptain(ctx, { skin, beard, hair, eyes, tabard, underTunic, scale })` → `{ group, update }`. Palettes `SKIN_TONES`, `CLOTH_COLORS`, `HAIR_COLORS`.
- **animals**: `horse(ctx, { color, grazing, harness, saddle })`, `critter(ctx, { size, color, horns, tailUp })`.
- **wagon**: `wagon(ctx, { type: "covered" | "hay" | "barrels", horses, driver })`.
- **props**: `barrel`, `crate(ctx, w, h, d)`, `sack(ctx, s)`, `wheel`, `torchPole`, `brazier`, `campfire`, `lantern(ctx, light)`, `ropeLine(ctx, points)`, `handcart`, `henCrate`, `hayBale`, `noticeBoard`, `inspectionTable`, `leaningSpear`, `pavilion(ctx, { wall, roof, pennant })`, `stagTotem`, `marketStall(ctx, canopyTex)`, `restingTravelers`.
- **gatehouse**: `resolveArch({ w, spring, r })`, `gateBlock(ctx, { arch, halfWidth, height, depth, frieze, medallion, portcullis, lantern, sconces })`, `tower(ctx, { radius, height, streamers })`, `curtainWall(ctx, { sign, startX, length, height, midTowerAt, endTower, pennant })`, `gateDoors(ctx, arch, { openAngles, z })`, `archBand` for custom mouldings.
- **interior**: `roomShell(ctx, { width, depth, height, openings: { north, south, east, west }, floor: "plank" | "flagstone", postSpacing, beamSpacing })` (north is +Z, the approach side; openings on north/south use world X, on east/west world Z), `wallSegment`, `leadedWindow(ctx, { w, h, light })`, `doubleDoor(ctx, { w, h, outside })`, `hearth(ctx, { width, height, depth, ceilingHeight })`, `barCounter(ctx, { length })`, `trestleTable`, `bench`, `highBackBench`, `stool`, `tableClutter`, `wheelChandelier`, `wallSconce`, `gallery(ctx, { length, depth, height })`, `staircase(ctx, { rise, width })`, `kitchenPass`, `harvestDressing`, `hostStand`, `tankard`, plus the procedural `innkeeper`, `bard`, `seatedPatron` (superseded by standees for anything near the camera). Use `ENVIRONMENT_PRESETS.interiorDusk` or `interiorNight` (no sky, room environment map).
- **standee** (people): `StandeeLibrary.load("/standees/<setting>")` fetches the painted cutouts generated by `scripts/scene-pipeline/standee-library.ts`; `library.get(id)` / `library.pick(rng, "standing" | "seated")`; `new StandeeSystem()` (push into `animated`) and `system.add(art, { facing, height })` returns a group with the figure's feet at its origin. Cards lean toward the camera up to 60° and flip to the rear art (or mirrored front) when seen from behind. Use standees for every person closer than ~20 m; the procedural `figure` is for distant silhouettes. Named NPCs are `npc-<id>` entries rendered from their wiki portrait.
- **banners**: `banner(ctx, tex, w, h, { wind, phase, tatter })`, `hangBanner(ctx, tex, w, h, opts)` (rod, finials, brackets), `bunting(ctx, runs)`.
- **crowd**: `crowd(ctx, { count, sample, groundHeight })` — instanced background figures, three draw calls for any count.

### runtime
`createRuntime({ container, set, toggles, seed, onProgress, bloom, flyControls })` → `{ set, renderer, scene, camera, controls, setCamera(name), stats(), dispose() }`. `createSetContext(scene, renderer, opts)` for hosts with their own loop.

## Performance rules
- Anything repeated more than ~20 times is instanced (`createGrassField`, `createWildflowers`, `crowd`, `bunting`). Parametric figures are for people near the camera.
- Texture bakes are cached per `MaterialLibrary`; ask the library, don't call generators in loops.
- One directional shadow caster. Point lights only on practicals (fire, lanterns).
- Budget per set: under 1.5 M triangles and under 4,000 draw calls at the establishing camera. The dev viewer shows both.

## Exemplars
`scripts/scene-pipeline/exemplars/<encounter-id>/` holds the brief, reference image and standalone scene each set was extracted from. `lib/scene-sets/realm-of-myr/kordavos-outer-gate.ts` is the reference exterior set; `kordavos-dragonbone-inn.ts` the reference interior.
