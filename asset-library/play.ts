// A place played as built: the game's own stage, made from the set's look (looks.ts) and not from its paintings.
//
// A look marked `play` is the one the game plays in. The set is built, its paintings left out, so the camera is the
// game's and goes where its shots and the story send it. The look's light, sky, haze, cleared ground and modelled trees
// go into it as they go into the library's place (scene.ts), and every cast member with a figure stands as that figure:
// the game's own figures path (packages/stage/src/figures/models.ts), which plays the written clips, walks, holds what
// the skeleton says and falls. What the library adds for a visitor stays there: its free camera, the rings, its views.
//
// Figures are served at /asset-library/characters/<id>/: the site from the public bucket, the desktop app from its own
// bundle (apps/desktop/scripts/build-runtime.ts fetches SHIPPED, shipped.ts, into it).

import type { Flags, Stage } from "@d20/stage"
import { iso, isoLamps } from "./iso"
import { LOOKS, type Look } from "./looks"
import { FIGURE_FILES, SHIPPED } from "./shipped"
import { markBuiltTrees, standTrees } from "./trees"


const nums = (s: string | undefined) => s?.split(",").map(Number)

interface Part {
  type: string
  id?: string
  at?: number[]
  clear?: number[][]
  item?: { type: string }
  items?: { item: { type: string } }[]
}
export interface LookSet {
  objects: Part[]
  materials?: Record<string, { type?: string }>
  atmosphere?: Record<string, unknown>
  painted?: unknown
}

// The look's own switches, under its wide view: the view the light's direction is taken from.
export function lookParams(look: Look): Record<string, string> {
  const first = look.shots.wide ? "wide" : Object.keys(look.shots)[0]
  return { ...look.params, ...look.shots[first] }
}

// What a look changes in its set before it is built: parts left out that roof people over, trees cleared from where
// the place is seen from, its materials and its atmosphere.
export function applyLook(set: LookSet, look: Look | undefined, q: Record<string, string>) {
  if (q.isohide) set.objects = set.objects.filter((p) => !q.isohide.split(",").includes(p.type))
  // Trees left out where they would stand between the people and where the place is seen from, as an awning is: a
  // wood seen from above is all canopy. Circles of x,z,r, which a tree set by hand is dropped from and a scattered
  // wood keeps clear of. A scatter holds 256 circles at most.
  const glade = q.isoclear?.split(";").map((c) => c.split(",").map(Number))
  if (glade) {
    const trees = (p: Part) => [p.item, ...(p.items ?? []).map((i) => i.item)].some((i) => i?.type === "tree")
    set.objects = set.objects.filter((p) => !(p.type === "tree" && p.at && glade.some(([x, z, r]) => Math.hypot(p.at![0] - x, p.at![1] - z) < r)))
    for (const p of set.objects) if (p.type === "scatter" && trees(p)) p.clear = [...(p.clear ?? []), ...glade].slice(0, 256)
  }
  for (const [name, change] of Object.entries(look?.materials ?? {})) if (set.materials?.[name]) Object.assign(set.materials[name], change)
  for (const [name, change] of Object.entries(look?.atmosphere ?? {}))
    if (set.atmosphere) set.atmosphere[name] = typeof change === "object" ? { ...(set.atmosphere[name] as object), ...change } : change
}

// The look's changes to the set's parts by id: null leaves one out.
export function editLook(set: LookSet, look: Look | undefined) {
  for (const [id, change] of Object.entries(look?.edit ?? {})) {
    if (!change) set.objects = set.objects.filter((p) => p.id !== id)
    else Object.assign(set.objects.find((p) => p.id === id) ?? {}, change)
  }
}

// The look's light on a built stage: its exposure, its light from all round and from above, its lamps, how much of the
// camera's own light a night keeps, and its share of the haze. `keepCamera` leaves the camera to the game.
export function lightLook(stage: Stage, q: Record<string, string>, keepCamera = false) {
  const [azimuth = 45, elevation = 35, distance = 40, fov = 24] = nums(q.iso) ?? []
  const [gain, ambient, key] = nums(q.isolight) ?? []
  return iso(stage, {
    azimuth,
    elevation,
    distance,
    fov,
    at: nums(q.isoat),
    box: nums(q.isobox),
    whole: !!q.isowhole,
    gain: gain || undefined,
    ambient: ambient || undefined,
    key: key || undefined,
    sky: q.isosky ? `#${q.isosky.replace("#", "")}` : undefined,
    lamps: isoLamps(q.isolamps),
    fill: q.isofill ? Number(q.isofill) : undefined,
    haze: q.isohaze ? Number(q.isohaze) : undefined,
    keepCamera,
  })
}

// The look the game plays a set in, if it has one.
export const playedLook = (set: string | undefined) => (set && LOOKS[set]?.play ? LOOKS[set] : null)

interface CastLike {
  id: string
  figure?: unknown
}
interface StagingLike {
  set?: string
  cast?: CastLike[]
  painted?: boolean
}

// The set, the staging and the flags for the game's stage in a played look, and what to do once it is built. Who has
// no figure is named in `cards`: the game plays on with their card.
export function builtPlay(setSpec: unknown, stagingSpec: unknown, look: Look) {
  const set = structuredClone(setSpec) as LookSet
  const staging = structuredClone(stagingSpec) as StagingLike
  delete set.painted
  staging.painted = false
  const q = lookParams(look)
  applyLook(set, look, q)
  editLook(set, look)
  if (look.trees) markBuiltTrees(set)
  const cast = staging.cast ?? []
  const figureOf = (id: string) => look.figures?.[id] ?? (SHIPPED.includes(id) ? id : undefined)
  // A few figures stand at their full detail, since the camera goes right up to a face. A crowd of them stands at the
  // middle level: fourteen at full detail cost a third of the frame rate.
  const detail = cast.filter((c) => figureOf(c.id)).length <= 3 ? "lod0" : "lod1"
  const env = q.figenv ? Number(q.figenv) : 0.55
  for (const c of cast) {
    const character = figureOf(c.id)
    if (character) c.figure = { model: `${FIGURE_FILES}/${character}/${detail}.glb`, env }
  }
  const flags: Partial<Flags> = { figures: true, ...(q.paint === "0" ? { brush: 0 } : {}), ...(q.bloom ? { bloom: q.bloom === "on" } : {}) }
  return {
    set,
    staging,
    flags,
    cards: cast.filter((c) => !c.figure).map((c) => c.id),
    // Lights it as the look does, and stands its trees. Resolves to what takes it all down again.
    async dress(stage: Stage) {
      lightLook(stage, q, true)
      const solid = (stage as unknown as { footprints: unknown }).footprints
      const wood = look.trees ? await standTrees(stage, solid, set, look.trees) : null
      return () => wood?.stop()
    },
  }
}
