// A place of the asset library, assembled and live: a built set, empty or with an encounter's cast where the encounter
// opens, as the stage shows it or as an isometric cut-away, with a camera the visitor moves.
//
// As the stage shows it, the set is as built and under the brush, with the game's own shots to jump between, and a
// camera kept where the game keeps it. A painted set's paintings are left out: they hold the camera to fixed points.
// As a cut-away, the set's look (looks.ts) says what is kept, lit and left out, and cast members who have a figure in
// the library stand as figures. A set with a room and no look is cut open about that room.

import type { Stage } from "@d20/stage"
import { addFigure, castRings, crowdShade } from "./figures"
import { iso, isoSet } from "./iso"
import { LOOKS } from "./looks"

export interface SceneOptions {
  // The set, `<setting>/<id>`, and the encounter staged in it, if any.
  set: string
  staging: string | null
  iso: boolean
  // Where figures' files are served from, and which character stands for a cast id.
  files: string
  figures: Record<string, string>
  onProgress?: (status: string) => void
}
// A place to send the camera: one of the place's own views, or a member of the cast.
export interface Spot {
  key: string
  label: string
  cast?: boolean
}
export interface Scene {
  stage: Stage
  // Views to jump between, then the cast: the first is where the scene opens.
  shots: Spot[]
  open: string
  go: (shot: string) => void
  stop: () => void
}

type Vec = [number, number, number]
interface SetLike {
  objects: { type: string }[]
  rooms?: { box: number[] }[]
  materials?: Record<string, object>
  crowd?: { groups?: { type: string; area?: number[]; count?: number }[] }
  painted?: unknown
  camera?: Record<string, unknown>
}
interface StagingLike {
  set: string
  shot?: string
  shots?: Record<string, { subject?: string; subjects?: string[]; label?: string }>
  cast?: { id: string }[]
  painted?: boolean
}

const nums = (s: string | undefined) => s?.split(",").map(Number)
const title = (s: string) => s.replace(/(^|-)(\w)/g, (_, dash: string, c: string) => `${dash ? " " : ""}${c.toUpperCase()}`)
// A first name, or all of "The bard".
const short = (name: string) => (/^(the|an?)\s/i.test(name) ? name : name.split(" ")[0])
// The lens that fits a room seen from 40 metres.
const lens = (w: number, d: number) => Math.round(Math.min(40, Math.max(8, (2 * Math.atan((Math.hypot(w, d) * 0.52) / 40) * 180) / Math.PI)))

// Whether a set has a cut-away to show: a look of its own, or a room to cut open.
export const hasIso = (set: string, room: unknown) => !!LOOKS[set] || !!room

export async function openScene(container: HTMLElement, o: SceneOptions): Promise<Scene> {
  const [{ createStage }, { SETS, STAGINGS }] = await Promise.all([import("@d20/stage"), import("@d20/stage/sets")])
  const set = structuredClone(await SETS[o.set]()) as SetLike
  const staging = o.staging && STAGINGS[o.staging] ? (structuredClone(await STAGINGS[o.staging]()) as StagingLike) : null
  const look = LOOKS[o.set]
  const room = set.rooms?.[0]?.box
  const stops: (() => void)[] = []
  // A camera the visitor moves needs the set as built: paintings hold it to the points they were made from.
  delete set.painted
  if (staging) staging.painted = false

  // The cut-away's switches: the look's, or a room seen from a corner.
  const first = look ? Object.keys(look.shots)[0] : ""
  const q: Record<string, string> = !o.iso
    ? {}
    : look
      ? { ...look.params, ...look.shots[first] }
      : room
        ? { iso: `45,35,40,${lens(room[3] - room[0], room[5] - room[2])}`, isolight: "1.4,0.3,1.8", paint: "0" }
        : {}
  const cut = !!q.iso
  if (cut) {
    isoSet(set)
    // The scattered crowd keeps to the ground that is kept: each scatter is cut to it and thinned to match.
    const ground = nums(q.isobox)
    if (ground && ground.length >= 4) {
      for (const g of set.crowd?.groups ?? []) {
        if (g.type !== "scatter" || !g.area || !g.count) continue
        const [a0, b0, a1, b1] = g.area
        const kept = [Math.max(a0, ground[0]), Math.max(b0, ground[1]), Math.min(a1, ground[2]), Math.min(b1, ground[3])]
        const share = (Math.max(0, kept[2] - kept[0]) * Math.max(0, kept[3] - kept[1])) / Math.max(1e-6, (a1 - a0) * (b1 - b0))
        g.area = share > 0 ? kept : [ground[0], ground[1], ground[0] + 0.01, ground[1] + 0.01]
        g.count = Math.round(g.count * share)
      }
      if (set.crowd?.groups) set.crowd.groups = set.crowd.groups.filter((g) => g.type !== "scatter" || (g.count ?? 0) >= 1)
    }
    if (q.isohide) set.objects = set.objects.filter((p) => !q.isohide.split(",").includes(p.type))
    for (const [name, change] of Object.entries(look?.materials ?? {})) if (set.materials?.[name]) Object.assign(set.materials[name], change)
    if (staging && look?.cast) staging.cast = [...(staging.cast ?? []), ...(look.cast as { id: string }[])]
  }

  const flags = cut ? { cardRadius: 500, ...(q.bloom ? { bloom: q.bloom === "on" } : {}) } : undefined
  const stage = await createStage({ container, set, staging: staging?.set === o.set ? staging : null, tier: "auto", flags, onProgress: o.onProgress })
  stops.push(() => stage.dispose())

  // In a cut-away a cast member goes by the name of the figure standing there.
  const people = stage.cast.map((c) => ({ key: `cast:${c.id}`, label: cut && look?.figures?.[c.id] ? title(look.figures[c.id]) : short(c.name), cast: true }))
  let shots: Spot[]
  let open: string
  let go: (shot: string, instant?: boolean) => void
  if (cut) {
    if (q.paint === "0") Object.defineProperty((stage as unknown as { pipeline: { paint: object } }).pipeline.paint, "strength", { get: () => 0, set: () => {} })
    const [azimuth = 45, elevation = 35, distance = 40, fov = 24] = nums(q.iso) ?? []
    const [gain, ambient, key] = nums(q.isolight) ?? []
    const view = iso(stage, {
      azimuth,
      elevation,
      distance,
      fov,
      at: nums(q.isoat),
      box: nums(q.isobox),
      gain: gain || undefined,
      ambient: ambient || undefined,
      key: key || undefined,
      sky: q.isosky ? `#${q.isosky.replace("#", "")}` : undefined,
      lamps: q.isolamps?.split(";").map((l) => l.split(",").map(Number)),
    })
    stage.shot(view as Parameters<Stage["shot"]>[0], { instant: true })
    // Cast members with a figure in the library stand as figures: the look's own choices first, then anyone else.
    // One that will not load leaves its card standing.
    if (staging) {
      const stand = { ...Object.fromEntries((staging.cast ?? []).filter((c) => o.figures[c.id]).map((c) => [c.id, o.figures[c.id]])), ...(look?.figures ?? {}) }
      await Promise.all(
        Object.entries(stand).map(async ([cast, character]) => {
          const f = await addFigure(stage, `${o.files}/${character}/lod1.glb`, cast, { clip: "Idle" }).catch(() => null)
          if (f) stops.push(f.stop)
        })
      )
      if (q.rings) stops.push(castRings(stage, q.rings.split(",")).stop)
    }
    if (Number(q.shade)) stops.push(crowdShade(stage, Number(q.shade)).stop)

    // Every view is the same cut-away from another place: the camera glides there.
    const centre = view.target as Vec
    const from = (target: Vec, az: number, el: number, dist: number, lensOf: number, label: string, instant: boolean) => {
      const [a, e] = [(az * Math.PI) / 180, (el * Math.PI) / 180]
      const position: Vec = [target[0] + Math.cos(e) * Math.sin(a) * dist, target[1] + Math.sin(e) * dist, target[2] + Math.cos(e) * Math.cos(a) * dist]
      stage.shot({ position, target, fov: lensOf, label } as Parameters<Stage["shot"]>[0], { instant })
    }
    // On people: close enough to fill the frame with them, from the side the cut-away is seen from.
    const LENS = 10
    const on = (ids: string[], label: string, instant: boolean) => {
      const who = stage.cast.filter((c) => ids.includes(c.id))
      if (!who.length) return
      const [x, z] = [who.reduce((n, c) => n + c.x, 0) / who.length, who.reduce((n, c) => n + c.z, 0) / who.length]
      const reach = Math.max(...who.map((c) => Math.hypot(c.x - x, c.z - z))) + 1.7
      // A group too wide for that lens from where the cut-away stands is seen through a wider one.
      const far = (reach * 1.15) / Math.tan((LENS * Math.PI) / 360)
      const wide = far > distance ? (2 * Math.atan((reach * 1.15) / distance) * 180) / Math.PI : LENS
      from([x, 0.95, z], azimuth, elevation, Math.min(distance, far), wide, label, instant)
    }
    const looks = look ? look.shots : { wide: {} as Record<string, string> }
    const groups = Object.entries(staging?.shots ?? {}).filter(([k, s]) => (s.subjects || s.subject) && !looks[k])
    shots = [
      ...Object.keys(looks).map((k) => ({ key: k, label: title(k) })),
      { key: "overhead", label: "Overhead" },
      ...(people.length > 1 ? [{ key: "on:*", label: "Everyone" }] : []),
      ...groups.map(([k, s]) => ({ key: `on:${k}`, label: s.label ?? title(k) })),
      ...people,
    ]
    go = (shot, instant = false) => {
      const label = shots.find((s) => s.key === shot)?.label ?? ""
      if (shot.startsWith("cast:")) return on([shot.slice(5)], label, instant)
      if (shot === "on:*")
        return on(
          stage.cast.map((c) => c.id),
          label,
          instant
        )
      const group = shot.startsWith("on:") && staging?.shots?.[shot.slice(3)]
      if (group) return on(group.subjects ?? (group.subject ? [group.subject] : []), label, instant)
      if (shot === "overhead") return from([centre[0], 0, centre[2]], 0, 84, distance, fov, label, instant)
      const s = looks[shot]
      if (!s) return
      const [az = azimuth, el = elevation, dist = distance, lensOf = fov] = nums(s.iso) ?? []
      const at = nums(s.isoat)
      from([at?.[0] ?? centre[0], at?.[2] ?? 0.6, at?.[1] ?? centre[2]], az, el, dist, lensOf, label, instant)
    }
    // With a cast, it opens where the scene is played, close enough to see them.
    open = people.length ? (looks.play ? "play" : groups.some(([k]) => k === "party") ? "on:party" : people.length > 1 ? "on:*" : people[0].key) : Object.keys(looks)[0]
    if (open !== Object.keys(looks)[0]) go(open, true)
  } else {
    // Where the encounter opens, or the set's first shot.
    open = staging?.shot ?? Object.keys(stage.shots)[0] ?? ""
    if (open) stage.shot(open, { instant: true })
    shots = [...Object.entries(stage.shots).map(([k, s]) => ({ key: k, label: s.label ?? title(k) })), ...people]
    // On one of the cast: from a little off the way they face, at their own height.
    go = (shot) => {
      const c = shot.startsWith("cast:") && stage.cast.find((m) => m.id === shot.slice(5))
      if (!c) return void stage.shot(shot)
      const h = c.height
      stage.shot({ subject: c.id, distance: Math.max(2.2, h * 1.5), angle: 24, height: h * 0.86, lookHeight: h * 0.66, fov: 46, label: c.name })
    }
  }
  return {
    stage,
    shots,
    open,
    go,
    stop: () => {
      for (const stop of stops.reverse()) stop()
    },
  }
}
