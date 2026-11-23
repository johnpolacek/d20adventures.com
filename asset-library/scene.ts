// A place of the asset library, assembled and live: a built set, empty or with an encounter's cast where the encounter
// opens, as the stage shows it or as an isometric cut-away, with a camera the visitor moves.
//
// As the stage shows it, the set is as built and under the brush, with the game's own shots to jump between, and a
// camera kept where the game keeps it. A painted set's paintings are left out: they hold the camera to fixed points.
// As a cut-away, the set's look (looks.ts) says what is kept, lit and left out, and cast members who have a figure in
// the library stand as figures. A set with a room and no look is cut open about that room.

import type { Stage } from "@d20/stage"
import { onFootprint } from "@d20/stage/spec/walk"
import { addFigure, castRings, crowdShade } from "./figures"
import { iso, isoLamps, isoSet } from "./iso"
import { LOOKS } from "./looks"
import { earlierLook } from "./looks-earlier"
import { applyLook, editLook } from "./play"
import { markBuiltTrees, standTrees } from "./trees"

export interface SceneOptions {
  // The set, `<setting>/<id>`, and the encounter staged in it, if any.
  set: string
  staging: string | null
  iso: boolean
  // Where figures' files are served from, and which character stands for a cast id.
  files: string
  figures: Record<string, string>
  onProgress?: (status: string) => void
  // A cast member was clicked in the scene, and the camera has gone to them.
  onPick?: (shot: string) => void
  // A painted set as the game plays it, from its painted points: "current", or a day to show the paintings as they
  // stood then (paintings.ts). Left out, the set is shown as built.
  painted?: string
  // A played look as it stood until a day (looks-earlier.ts), in place of the current one.
  lookOn?: string
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
  // Where the camera is now, as a look's shot is written: for finding a view by flying to it.
  view: () => string
  stop: () => void
}

type Vec = [number, number, number]
interface SetLike {
  objects: { type: string; id?: string; at?: number[]; clear?: number[][]; item?: { type: string }; items?: { item: { type: string } }[] }[]
  rooms?: { box: number[] }[]
  materials?: Record<string, { type?: string }>
  crowd?: { groups?: { type: string; area?: number[]; count?: number; density?: { rect: number[] }[]; face?: { toward?: number[] } }[] }
  painted?: { points: Record<string, { position: Vec; label?: string; paintings: { map: string; clear?: string; quaternion: number[]; fov: number }[] }> }
  camera?: Record<string, unknown>
  atmosphere?: Record<string, unknown>
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

// A camera that goes anywhere: no walls stop it, it looks from any height, the wheel moves it toward what the pointer
// is on, and W A S D or the arrows fly it, with Q and E for down and up and Shift for speed.
function roam(stage: Stage) {
  const c = stage.controls
  if (!c) return () => {}
  ;(stage as unknown as { collide: () => void }).collide = () => {}
  c.maxPolarAngle = Math.PI * 0.97
  c.minDistance = 0.4
  c.maxDistance = 900
  c.zoomToCursor = true
  const free = () => {
    c.minPolarAngle = 0
  }
  c.addEventListener("start", free)
  const KEYS: Record<string, Vec> = {
    KeyW: [0, 0, 1],
    ArrowUp: [0, 0, 1],
    KeyS: [0, 0, -1],
    ArrowDown: [0, 0, -1],
    KeyD: [1, 0, 0],
    ArrowRight: [1, 0, 0],
    KeyA: [-1, 0, 0],
    ArrowLeft: [-1, 0, 0],
    KeyE: [0, 1, 0],
    KeyQ: [0, -1, 0],
  }
  const held = new Set<string>()
  let fast = false
  const down = (e: KeyboardEvent) => {
    fast = e.shiftKey
    if (!KEYS[e.code] || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.closest?.("input, textarea, select")) return
    e.preventDefault()
    if (!held.size) c.dispatchEvent({ type: "start" } as never)
    held.add(e.code)
  }
  const up = (e: KeyboardEvent) => {
    fast = e.shiftKey
    held.delete(e.code)
  }
  const blur = () => held.clear()
  window.addEventListener("keydown", down)
  window.addEventListener("keyup", up)
  window.addEventListener("blur", blur)
  let last = performance.now()
  let frame = requestAnimationFrame(function fly(now) {
    frame = requestAnimationFrame(fly)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!held.size) return
    const cam = stage.camera
    const [px, py, pz] = [cam.position.x, cam.position.y, cam.position.z]
    // Forward is the way the camera looks, kept level. Looking straight down, it is the top of the frame.
    let [fx, fz] = [c.target.x - px, c.target.z - pz]
    if (Math.hypot(fx, fz) < 1e-3) [fx, fz] = [-Math.sin(cam.rotation.z), -Math.cos(cam.rotation.z)]
    const n = Math.hypot(fx, fz) || 1
    ;[fx, fz] = [fx / n, fz / n]
    const pace = Math.min(40, Math.max(2.5, Math.hypot(c.target.x - px, c.target.y - py, c.target.z - pz) * 0.25)) * (fast ? 3 : 1) * dt
    let [mx, my, mz] = [0, 0, 0]
    for (const k of held) {
      const [side, rise, ahead] = KEYS[k]
      mx += (fx * ahead - fz * side) * pace
      my += rise * pace
      mz += (fz * ahead + fx * side) * pace
    }
    cam.position.set(px + mx, py + my, pz + mz)
    c.target.set(c.target.x + mx, c.target.y + my, c.target.z + mz)
  })
  return () => {
    cancelAnimationFrame(frame)
    c.removeEventListener("start", free)
    window.removeEventListener("keydown", down)
    window.removeEventListener("keyup", up)
    window.removeEventListener("blur", blur)
  }
}

export async function openScene(container: HTMLElement, o: SceneOptions): Promise<Scene> {
  const [{ createStage }, { SETS, STAGINGS }] = await Promise.all([import("@d20/stage"), import("@d20/stage/sets")])
  const set = structuredClone(await SETS[o.set]()) as SetLike
  const staging = o.staging && STAGINGS[o.staging] ? (structuredClone(await STAGINGS[o.staging]()) as StagingLike) : null
  if (o.painted && set.painted) return openPainted(container, o, set, staging, createStage)
  const look = earlierLook(o.set, o.lookOn) ?? LOOKS[o.set]
  const room = set.rooms?.[0]?.box
  const stops: (() => void)[] = []
  // A camera the visitor moves needs the set as built: paintings hold it to the points they were made from.
  delete set.painted
  if (staging) staging.painted = false

  // The cut-away's switches: the look's, or a room seen from a corner. The look's wide view is the one the views on
  // people are taken from, wherever the scene opens.
  const first = look ? (look.shots.wide ? "wide" : Object.keys(look.shots)[0]) : ""
  const q: Record<string, string> = !o.iso
    ? {}
    : look
      ? { ...look.params, ...look.shots[first] }
      : room
        ? { iso: `45,35,40,${lens(room[3] - room[0], room[5] - room[2])}`, isolight: "1.4,0.3,1.8", paint: "0" }
        : {}
  const cut = !!q.iso
  // The visitor's camera goes anywhere, in either view.
  isoSet(set)
  if (cut) {
    // The scattered crowd keeps to the ground that is kept: each scatter is cut to it and thinned to match.
    const ground = nums(q.isobox)
    if (ground && ground.length >= 4 && !q.isowhole) {
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
    applyLook(set, look, q)
    // Sets that share this one's world are built into it where they stand: their parts as one group, moved there, and
    // their scattered crowds with them. A material both sets name keeps this set's.
    for (const j of look?.join ?? []) {
      const other = structuredClone(await SETS[j.set]()) as SetLike
      const [dx, dz] = j.at
      const children = other.objects.filter((p) => !j.leave.includes(p.type)).map(({ id: _, ...p }) => p)
      set.objects.push({ type: "group", id: `join-${j.set.split("/").pop()}`, at: [dx, 0, dz], children } as SetLike["objects"][number])
      set.materials = { ...other.materials, ...set.materials }
      const moved = (r: number[]) => [r[0] + dx, r[1] + dz, r[2] + dx, r[3] + dz]
      for (const g of other.crowd?.groups ?? []) {
        if (g.type !== "scatter" || !g.area) continue
        set.crowd?.groups?.push({
          ...g,
          area: moved(g.area),
          ...(g.density ? { density: g.density.map((d) => ({ ...d, rect: moved(d.rect) })) } : {}),
          ...(g.face?.toward ? { face: { ...g.face, toward: [g.face.toward[0] + dx, g.face.toward[1] + dz] } } : {}),
        })
      }
    }
    editLook(set, look)
    if (staging && look?.cast) staging.cast = [...(staging.cast ?? []), ...(look.cast as { id: string }[])]
  }

  // Where a look asks for modelled trees, the set's own are built apart, to be put out of sight (trees.ts).
  const wood = cut ? look?.trees : undefined
  if (wood) markBuiltTrees(set)
  const flags = cut ? { cardRadius: 500, ...(q.bloom ? { bloom: q.bloom === "on" } : {}) } : undefined
  const stage = await createStage({ container, set, staging: staging?.set === o.set ? staging : null, tier: "auto", flags, onProgress: o.onProgress })
  stops.push(() => stage.dispose())

  // What is built, as the engine keeps it: where no one can stand, and how high each thing stands.
  const solid = (stage as unknown as { footprints: Parameters<typeof onFootprint>[0] }).footprints
  if (wood) stops.push((await standTrees(stage, solid, set, wood)).stop)
  // What the footprints do not know: a tree's crown. A footprint is a trunk, and a wood is mostly leaves, so a camera
  // sent to look at someone from among them sees only leaves. The stage keeps no geometry to test a line against, so a
  // crown is taken to be as wide as the builders make one at their widest: from a seventh of the way up the tree, four
  // tenths of its height out, drawn in toward the top. Whether one lies on the line from an eye to a point.
  const wooded = set.objects.some((p) => [p, p.item, ...(p.items ?? []).map((i) => i.item)].some((i) => i?.type === "tree"))
  const crowns = wooded ? (solid as { kind: string; x: number; z: number; r: number; height?: number }[]).filter((f) => f.kind === "circle" && f.r < 2 && (f.height ?? 0) >= 8) : []
  const veiled = (eye: Vec, to: Vec) => {
    const len = Math.hypot(to[0] - eye[0], to[1] - eye[1], to[2] - eye[2])
    for (const f of crowns) {
      const h = f.height as number
      for (let d = 0; d < len - 0.9; d += 0.4) {
        const [x, y, z] = [eye[0] + ((to[0] - eye[0]) * d) / len, eye[1] + ((to[1] - eye[1]) * d) / len, eye[2] + ((to[2] - eye[2]) * d) / len]
        if (y > h * 0.15 && y < h * 1.05 && Math.hypot(x - f.x, z - f.z) < h * 0.42 * Math.sqrt(Math.max(0, 1 - ((y - h * 0.15) / (h * 0.9)) ** 2))) return true
      }
    }
    return false
  }
  // Face to face with one of the cast: in front of them, from the first side where nothing built and no other cast
  // member stands in the way.
  const front = (id: string, label: string, instant = false) => {
    const c = stage.cast.find((m) => m.id === id)
    if (!c) return
    const [h, dist, up] = [c.height, c.height * 2.15, (6 * Math.PI) / 180]
    const clear = (turn: number) => {
      const [dx, dz] = [Math.sin(c.ry + turn), Math.cos(c.ry + turn)]
      // The line from their waist out to the camera.
      for (let d = 0.35; d <= dist * Math.cos(up); d += 0.1) if (onFootprint(solid, c.x + dx * d, c.z + dz * d, (c.y ?? 0) + h * 0.5 + Math.tan(up) * d - 0.25)) return false
      return stage.cast.every((m) => {
        if (m === c) return true
        const along = (m.x - c.x) * dx + (m.z - c.z) * dz
        return along < 0.2 || along > dist + 0.4 || Math.abs((m.x - c.x) * dz - (m.z - c.z) * dx) > 0.5
      })
    }
    const target: Vec = [c.x, (c.y ?? 0) + h * 0.5, c.z]
    const eye = (turn: number): Vec => [target[0] + Math.cos(up) * Math.sin(c.ry + turn) * dist, target[1] + Math.sin(up) * dist, target[2] + Math.cos(up) * Math.cos(c.ry + turn) * dist]
    const turns = [0, 18, -18, 36, -36, 54, -54, 72, -72].map((d) => (d * Math.PI) / 180).filter(clear)
    // Of the sides nothing built is on, the first that no leaves hang across. Their head is looked for as well as their waist.
    const head: Vec = [c.x, (c.y ?? 0) + h * 0.92, c.z]
    const turn = turns.find((t) => !veiled(eye(t), target) && !veiled(eye(t), head)) ?? turns[0] ?? 0
    const position = eye(turn)
    stage.shot({ position, target, fov: 34, label } as Parameters<Stage["shot"]>[0], { instant })
  }

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
      whole: !!q.isowhole,
      gain: gain || undefined,
      ambient: ambient || undefined,
      key: key || undefined,
      sky: q.isosky ? `#${q.isosky.replace("#", "")}` : undefined,
      lamps: isoLamps(q.isolamps),
      fill: q.isofill ? Number(q.isofill) : undefined,
      haze: q.isohaze ? Number(q.isohaze) : undefined,
      soft: q.isosoft ? Number(q.isosoft) : undefined,
      vignette: q.isovignette ? Number(q.isovignette) : undefined,
    })
    stage.shot(view as Parameters<Stage["shot"]>[0], { instant: true })
    // Cast members with a figure in the library stand as figures: the look's own choices first, then anyone else.
    // One that will not load leaves its card standing.
    if (staging) {
      const stand = { ...Object.fromEntries((staging.cast ?? []).filter((c) => o.figures[c.id]).map((c) => [c.id, o.figures[c.id]])), ...(look?.figures ?? {}) }
      // A few figures stand at their full detail, since the camera goes right up to a face. A crowd of them stands at
      // the middle level: fourteen at full detail cost a third of the frame rate.
      const detail = Object.keys(stand).length <= 3 ? "lod0" : "lod1"
      await Promise.all(
        Object.entries(stand).map(async ([cast, character]) => {
          const f = await addFigure(stage, `${o.files}/${character}/${detail}.glb`, cast, { clip: "Idle", env: q.figenv ? Number(q.figenv) : undefined, tint: look?.tint?.[cast] }).catch(() => null)
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
    // On people in a cut-away: close enough to fill the frame with them, from the side the cut-away is seen from.
    const LENS = 10
    const down = (x: number, z: number, reach: number, label: string, instant: boolean) => {
      // A group too wide for that lens from where the cut-away stands is seen through a wider one.
      const far = (reach * 1.15) / Math.tan((LENS * Math.PI) / 360)
      const wide = far > distance ? (2 * Math.atan((reach * 1.15) / distance) * 180) / Math.PI : LENS
      from([x, 0.95, z], azimuth, elevation, Math.min(distance, far), wide, label, instant)
    }
    // On people in a whole place: from near eye level, on the side their faces are, and from wherever about there the
    // fewest others stand in the way. People who face each other are seen from the side.
    const EYE = 30
    const level = (who: typeof stage.cast, x: number, z: number, reach: number, label: string, instant: boolean) => {
      // A group too wide to stand back from is seen through a wider lens, and only then from farther.
      const half = (lensOf: number) => Math.tan((lensOf * Math.PI) / 360)
      const lensOf = Math.min(58, Math.max(EYE, (2 * Math.atan((reach * 1.2) / 16) * 180) / Math.PI))
      const dist = Math.max(4.5, (reach * 1.2) / half(lensOf))
      const [fx, fz] = [who.reduce((n, c) => n + Math.sin(c.ry), 0) / who.length, who.reduce((n, c) => n + Math.cos(c.ry), 0) / who.length]
      let facing = Math.atan2(fx, fz)
      if (Math.hypot(fx, fz) < 0.35) {
        const [sxx, sxz, szz] = who.reduce((n, c) => [n[0] + (c.x - x) ** 2, n[1] + (c.x - x) * (c.z - z), n[2] + (c.z - z) ** 2], [0, 0, 0])
        const across = 0.5 * Math.atan2(2 * sxz, szz - sxx) + Math.PI / 2
        const base = (azimuth * Math.PI) / 180
        facing = Math.cos(across - base) >= 0 ? across : across + Math.PI
      }
      const y = Math.max(...who.map((c) => c.height)) * 0.55
      const others = [
        ...stage.cast.filter((c) => !who.includes(c)).map((c) => ({ x: c.x, z: c.z, top: c.height, cost: 3 })),
        ...stage.crowd.people.map((p) => ({ x: p.x, z: p.z, top: 1.7 * p.s, cost: 0.3 })),
      ]
      const inTheWay = (a: number, e: number) => {
        const [dx, dz, rise] = [Math.sin(a), Math.cos(a), Math.tan(e)]
        const [cx, cy, cz] = [x + Math.cos(e) * dx * dist, y + Math.sin(e) * dist, z + Math.cos(e) * dz * dist]
        // The camera inside something built, or something built between it and anyone's waist.
        let cost = onFootprint(solid, cx, cz, cy - 0.3) ? 12 : 0
        for (const c of who) {
          const [lx, lz, waist] = [c.x - cx, c.z - cz, (c.y ?? 0) + c.height * 0.5]
          const len = Math.hypot(lx, lz)
          for (let d = 0.3; d < len - 0.35; d += 0.1)
            if (onFootprint(solid, cx + (lx * d) / len, cz + (lz * d) / len, cy + ((waist - cy) * d) / len)) {
              cost += 2.5
              break
            }
        }
        // One of them behind another.
        for (let i = 0; i < who.length; i++) for (let j = i + 1; j < who.length; j++) if (Math.abs((who[i].x - who[j].x) * dz - (who[i].z - who[j].z) * dx) < 0.55) cost += 3
        // Someone is seen over when the line to the group's knees clears their head.
        for (const m of others) {
          const along = (m.x - x) * dx + (m.z - z) * dz
          if (along > 0.4 && along < dist && Math.abs((m.x - x) * dz - (m.z - z) * dx) < reach && m.top > 0.5 + rise * along) cost += m.cost
        }
        return { cost, eye: [cx, cy, cz] as Vec }
      }
      const views: { a: number; e: number; score: number; eye: Vec }[] = []
      for (const e of [7, 11, 16, 22, 30])
        for (const turn of [25, -25, 0, 45, -45, 65, -65, 90, -90]) {
          const a = facing + (turn * Math.PI) / 180
          const { cost, eye } = inTheWay(a, (e * Math.PI) / 180)
          // A view from the side shows no one's face, so it has to be much the clearest to be taken.
          views.push({ a, e, eye, score: cost + (Math.abs(turn) >= 80 ? 4 : Math.abs(Math.abs(turn) - 25) / 30) + (e - 7) / 5 })
        }
      // A crown across the line to anyone counts as a wall does. The best views are tried first, and the first with
      // none crossed is taken.
      views.sort((p, q) => p.score - q.score)
      let best = views[0]
      let least = Number.POSITIVE_INFINITY
      for (const v of views.slice(0, 16)) {
        const crossed = who.reduce((n, c) => n + (veiled(v.eye, [c.x, (c.y ?? 0) + c.height * 0.5, c.z]) ? 2.5 : 0) + (veiled(v.eye, [c.x, (c.y ?? 0) + c.height * 0.92, c.z]) ? 1.5 : 0), 0)
        if (v.score + crossed < least) [best, least] = [v, v.score + crossed]
        if (least <= v.score) break
      }
      from([x, y, z], (best.a * 180) / Math.PI, best.e, dist, lensOf, label, instant)
    }
    const on = (ids: string[], label: string, instant: boolean) => {
      const who = stage.cast.filter((c) => ids.includes(c.id))
      if (!who.length) return
      const [x, z] = [who.reduce((n, c) => n + c.x, 0) / who.length, who.reduce((n, c) => n + c.z, 0) / who.length]
      const far = Math.max(...who.map((c) => Math.hypot(c.x - x, c.z - z)))
      // Room for the tallest of them from head to foot: an owlbear stands 3.3 m.
      if (q.isowhole) level(who, x, z, Math.max(far + 1.1, Math.max(...who.map((c) => c.height)) * 0.6), label, instant)
      else down(x, z, far + 1.7, label, instant)
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
      if (shot.startsWith("cast:")) return front(shot.slice(5), label, instant)
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
    open = people.length
      ? look?.open && looks[look.open]
        ? look.open
        : looks.play
          ? "play"
          : groups.some(([k]) => k === "party")
            ? "on:party"
            : people.length > 1
              ? "on:*"
              : people[0].key
      : Object.keys(looks)[0]
  } else {
    // Where the encounter opens, or the set's first shot.
    open = staging?.shot ?? Object.keys(stage.shots)[0] ?? ""
    if (open) stage.shot(open, { instant: true })
    shots = [...Object.entries(stage.shots).map(([k, s]) => ({ key: k, label: s.label ?? title(k) })), ...people]
    go = (shot) => (shot.startsWith("cast:") ? front(shot.slice(5), shots.find((s) => s.key === shot)?.label ?? "") : void stage.shot(shot))
  }

  stops.push(roam(stage))
  // The cut-away's own limits on the camera are lifted by now, so its opening view can look up from the ground.
  if (cut) go(open, true)
  // A click on one of the cast, and not a drag of the camera, goes to them.
  let pressed: [number, number, number] | null = null
  const press = (e: PointerEvent) => {
    pressed = [e.clientX, e.clientY, performance.now()]
  }
  const release = (e: PointerEvent) => {
    const [x, y, t] = pressed ?? [0, 0, 0]
    pressed = null
    if (!t || Math.hypot(e.clientX - x, e.clientY - y) > 5 || performance.now() - t > 500) return
    const r = stage.renderer.domElement.getBoundingClientRect()
    const id = stage.pick(e.clientX - r.left, e.clientY - r.top)
    if (!id || !shots.some((s) => s.key === `cast:${id}`)) return
    go(`cast:${id}`)
    o.onPick?.(`cast:${id}`)
  }
  container.addEventListener("pointerdown", press)
  container.addEventListener("pointerup", release)
  stops.push(() => {
    container.removeEventListener("pointerdown", press)
    container.removeEventListener("pointerup", release)
  })
  const view = () => {
    const at = stage.controls?.target ?? stage.camera.getWorldDirection(stage.camera.position.clone()).multiplyScalar(10).add(stage.camera.position)
    const d = stage.camera.position.clone().sub(at)
    const [deg, r] = [(n: number) => (n * 180) / Math.PI, (n: number) => Math.round(n * 10) / 10]
    return `iso: "${r(deg(Math.atan2(d.x, d.z)))},${r(deg(Math.asin(d.y / d.length())))},${r(d.length())},${r(stage.camera.fov)}", isoat: "${r(at.x)},${r(at.z)},${r(at.y)}"`
  }
  return {
    stage,
    shots,
    open,
    go,
    view,
    stop: () => {
      for (const stop of stops.reverse()) stop()
    },
  }
}

// The way a painting's camera looks: -z turned by its quaternion (v + 2w(q×v) + 2q×(q×v), with v = -z).
const ahead = ([x, y, z, w]: number[]): Vec => {
  const [tx, ty] = [-2 * y, 2 * x]
  return [w * tx - z * ty, w * ty + z * tx, -1 + x * ty - y * tx]
}

// A painted set as the game plays it: the camera stands on the painted points and turns and zooms there (drag and
// scroll), and the paintings are those of the day asked for. Its jumps are the points, then the cast, each seen as a
// speaker is in the game.
async function openPainted(container: HTMLElement, o: SceneOptions, set: SetLike, staging: StagingLike | null, createStage: typeof import("@d20/stage").createStage): Promise<Scene> {
  const { paintingsOn } = await import("./paintings")
  const on = paintingsOn(o.painted === "current" ? null : (o.painted ?? null))
  const points = set.painted?.points ?? {}
  for (const p of Object.values(points)) for (const painting of p.paintings) painting.map = on(painting.map)
  const stage = await createStage({ container, set: set as never, staging: (staging?.set === o.set ? staging : null) as never, tier: "auto", onProgress: o.onProgress })
  const pointShot = (name: string) => {
    const p = points[name]
    const first = p.paintings[0]
    const d = ahead(first.quaternion)
    return { position: p.position, target: [p.position[0] + d[0] * 10, p.position[1] + d[1] * 10, p.position[2] + d[2] * 10] as Vec, fov: Math.round(first.fov * 0.8) }
  }
  const people: Spot[] = (staging?.cast ?? []).map((c) => ({ key: `cast:${c.id}`, label: short((c as { name?: string }).name ?? title(c.id.split("/").pop() ?? c.id)), cast: true }))
  const shots: Spot[] = [...Object.entries(points).map(([k, p]) => ({ key: `point:${k}`, label: p.label ?? title(k) })), ...people]
  const go = (shot: string) => {
    if (shot.startsWith("point:")) stage.shot(pointShot(shot.slice(6)) as never)
    else if (shot.startsWith("cast:")) stage.shot({ subject: shot.slice(5), distance: 4, angle: 18, height: 1.6, lookHeight: 1.1, fov: 40 } as never)
    else stage.shot(shot)
  }
  // It opens where the encounter opens, one of the set's views, shown as the first jump. Empty, on the first point.
  const all: Spot[] = staging?.shot ? [{ key: staging.shot, label: "Opening" }, ...shots] : shots
  const open = all[0]?.key ?? ""
  if (open) stage.shot(open.startsWith("point:") ? (pointShot(open.slice(6)) as never) : open, { instant: true })
  return { stage, shots: all, open, go, view: () => "", stop: () => stage.dispose() }
}
