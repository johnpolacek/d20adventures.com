// scene-kit: the shared runtime library every authored 3D set is built from.
//
// Browser-only, vanilla three. No imports from the rest of the app — this
// directory is meant to lift out into its own package once it settles.
//
//   core         seeded Rng, value noise, math
//   textures     procedural PBR texture bakes
//   emblems      heraldry painters (no lettering)
//   shaders      onBeforeCompile mods: moss, cloth wind, grass sway, hay
//   materials    MaterialLibrary: cached bakes + standard material constructors
//   environment  sky shader, environment map, sun, hemisphere, fog, presets
//   terrain      heightfields, road blend, paving, grass, flowers, birches
//   atmosphere   god rays, dust, glow, birds, FireSystem
//   builders/    figures, animals, props, wagons, fortifications, banners, crowd
//   set          the set contract (marks, cameras, toggles)
//   runtime      standalone viewer: renderer, bloom, controls, loop

export * from "./atmosphere"
export * from "./builders/animals"
export * from "./builders/banners"
export * from "./builders/context"
export * from "./builders/crowd"
export * from "./builders/figure"
export * from "./builders/gatehouse"
export * from "./builders/interior"
export * from "./builders/props"
export * from "./builders/standee"
export * from "./builders/wagon"
export * from "./core"
export * from "./emblems"
export * from "./environment"
export * from "./materials"
export * from "./primitives"
export * from "./runtime"
export * from "./set"
export * from "./shaders"
export * from "./terrain"
export * from "./textures"
