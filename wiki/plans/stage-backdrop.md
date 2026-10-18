# Painted backdrop

[Home](../index.md) · [Plans](index.md) · [Stage engine](../stage-engine.md) · [Stage set authoring](../stage-authoring.md) · [Stage art spikes](stage-art-spikes.md)

Status: implemented on main, 2026-10-17. Second painting for Thalbern's close-up added 2026-10-18. The owner has run the stones in the desktop dev app. The packaged app is not checked.

## Why

Spike (a) in [stage art spikes](stage-art-spikes.md) hung a painted valley behind the Standing Stones in place of its mountain cones. The owner called it a definite improvement and asked for it in the engine, without the paint-over or the animated standee.

## Scope

- A set may have one `backdrop`: a painted, keyed panorama of far scenery on a far cylinder.
  - `map` is a texture in `/stage/textures`, like every painted texture.
  - `arc`, `yaw`, `bottom` and `top` place it in degrees, seen from the set's centre.
  - `gain` and `haze` grade it by eye, against AgX tone mapping and the set's fog.
- `scripts/stage-backdrops.ts` paints a panorama on magenta from the encounter art, and keys it.
- The Old Standing Stones gets the valley backdrop, and loses its three mountain cones.

## Other sets, 2026-10-18

Owner chose to add backdrops to the other outdoor sets. Every set's shots were captured first.

- Need one: their fixed shots show a bare horizon or a bright gap.
  - Kordavos riverfront: the close-ups look away from the river, past where the quay's paving ends.
  - Old forest path: the close-ups show a bright gap where the tree scatter ends.
  - Thalbern's forest home: pale bare ground between the trees in the ranger and woods shots.
- Little or no gain, skipped:
  - Valkarr forest trail: thick mist hides the far trees.
  - Kordavos gate and harvest square: walls and houses close every view.
  - Mordava piers: an enclosed, misty swamp.
- The riverfront and forest path come from `scripts/stage-sets/covert-cargo.ts`, so their backdrops go there.
- The key's moonlight correction would brown red roofs, so it is now per painting (`cool`).
- Results, each checked shot by shot against captures from before:
  - Riverfront: `riverfront-city.webp`, a row of timber-framed houses and towers, 70 m out at the paving's edge. The close-ups now show the far side of a square instead of a bare plain.
  - Forest path: `forest-path-depths.webp`, giant trunks in green haze, 90 m out ahead and behind. The bright gaps in the close-ups are gone.
  - Thalbern's home: `home-woods.webp`, a sunlit forest edge, 120 m out. The pale gaps between trunks now show hazy forest. A subtler gain.
- The forest painting faded its haze into the magenta sky, and the key left that band pink. An `opaque` backdrop is painted edge to edge with no sky and is not keyed.

## Not in scope

- Paint-over projection and animated standees. The owner declined them for now.
- Backdrops for other sets. Each is a later, per-set call.

## Steps

1. Spec field and validation in `packages/stage/src/spec/set.ts`.
2. `packages/stage/src/backdrop.ts`, created and disposed by the Stage, its texture awaited by `load()`.
3. The script, and the Standing Stones backdrop at 4096 px wide.
4. The lab viewer stops adding a second backdrop.
5. Check: `pnpm stage:check`, types, lint, and captures of every Standing Stones shot against the spike's.
6. Wiki: authoring guide, engine page, log.

## Results

- Engine renders match the spike's at every Standing Stones shot, mean difference under 0.2 of 255.
- 4096 px wide is not visibly softer than the spike's 6336 px at DPR 2, and costs about 38 MB of GPU memory against 91 MB.
- The key now holds red down by how far blue rises above green, and blue near green. A far ridge the model painted lavender now reads as blue-grey mist.
- The desktop build copies `public/stage`, so the texture ships with the app.
- 2026-10-18, owner, in the desktop app: Thalbern's close-up "could be better". He faces the valley, so the shot looks away from it, at a bare plain and sky.
  - `backdrop` became `backdrops`, up to four. `stones-woods.webp` covers that side: a dark forested ridge beyond the river.
  - Three paintings: the first had magenta mist bands, the second read as cloud banks, the third, a crisp dark ridge, reads as land.
  - The key now drops paint floating in the sky and fills magenta that the land encloses. The valley texture lost only stray specks.
