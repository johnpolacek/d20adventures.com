# Painted backdrop

[Home](../index.md) · [Plans](index.md) · [Stage engine](../stage-engine.md) · [Stage set authoring](../stage-authoring.md) · [Stage art spikes](stage-art-spikes.md)

Status: implemented on main, 2026-10-17. Not yet checked in the packaged desktop app.

## Why

Spike (a) in [stage art spikes](stage-art-spikes.md) hung a painted valley behind the Standing Stones in place of its mountain cones. The owner called it a definite improvement and asked for it in the engine, without the paint-over or the animated standee.

## Scope

- A set may have one `backdrop`: a painted, keyed panorama of far scenery on a far cylinder.
  - `map` is a texture in `/stage/textures`, like every painted texture.
  - `arc`, `yaw`, `bottom` and `top` place it in degrees, seen from the set's centre.
  - `gain` and `haze` grade it by eye, against AgX tone mapping and the set's fog.
- `scripts/stage-backdrops.ts` paints a panorama on magenta from the encounter art, and keys it.
- The Old Standing Stones gets the valley backdrop, and loses its three mountain cones.

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
