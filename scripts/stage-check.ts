// Validates Stageview set and staging specs without a GPU or a DOM: schema, every builder's params, material references,
// nesting and the geometry budget (a dry build into stub materials), plus the crowd population. Stagings also check
// that their art exists, that no one starts inside something solid, and which straight walks are blocked. On a painted
// set they also say which painted point each view is seen from, and which views its paintings do not reach.
//
//   pnpm exec tsx scripts/stage-check.ts                 # every repo-local set and staging
//   pnpm exec tsx scripts/stage-check.ts path/to/set.json

import { existsSync, readFileSync } from "node:fs"
import type { Footprint } from "@d20/stage/builders/types"
import type { CastMember } from "@d20/stage/figures/standees"
import { createStubLibrary } from "@d20/stage/materials/library"
import { SETS, STAGINGS } from "@d20/stage/sets"
import { buildSetGeometry, parseSet, populateCrowd } from "@d20/stage/spec/build"
import { frameShot, resolveCast, resolveShots } from "@d20/stage/spec/resolve"
import { findFloaters } from "@d20/stage/spec/rest"
import { type Sight, viewCost } from "@d20/stage/spec/sight"
import { type StagingShot, type StagingSpec, stagingSpecSchema } from "@d20/stage/spec/staging"
import { clearView } from "@d20/stage/spec/view"
import { doorways, onFootprint, reachOver, routeOver } from "@d20/stage/spec/walk"
import { tripodPoints, tripodView } from "@d20/stage/tripod"
import * as THREE from "three"

async function checkSet(label: string, raw: unknown) {
  const t0 = performance.now()
  const set = parseSet(raw)
  const lib = createStubLibrary(set.materials)
  const built = buildSetGeometry(set, lib, { parts: true })
  let vertices = 0
  const byMaterial: [string, number][] = []
  for (const [m, geos] of built.batch.buckets) {
    const v = geos.reduce((a, g) => a + g.attributes.position.count, 0)
    vertices += v
    byMaterial.push([m.name, v])
  }
  const people = populateCrowd(set, built.footprints, built.anchors)
  const pictures = Object.values(set.painted?.points ?? {}).flatMap((p) => p.paintings.flatMap((f) => (f.clear ? [f.map, f.clear] : [f.map])))
  const lost = pictures.filter((u) => !existsSync(`public${u}`))
  if (lost.length) throw new Error(`set ${label}: missing paintings ${lost.join(", ")}`)
  for (const library of set.crowd ? [set.crowd.library, ...(set.painted?.crowd ? [set.painted.crowd] : [])] : [])
    if (!existsSync(`public/stage/crowd/${library}/atlas.json`)) throw new Error(`set ${label}: missing crowd library ${library}`)
  const kinds: Record<string, number> = {}
  for (const p of people) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1
  const ms = Math.round(performance.now() - t0)
  console.log(
    `PASS set ${label}: ${built.placed} objects placed, ${built.batch.buckets.size} materials in use, ${(vertices / 3 / 1e6).toFixed(2)}M static triangles, ${built.footprints.length} footprints, ${built.anchors.length} anchors, ${people.length} people (${people.filter((p) => p.walker).length} walking) in ${ms} ms`
  )
  byMaterial.sort((a, b) => b[1] - a[1])
  console.log(
    `  heaviest: ${byMaterial
      .slice(0, 6)
      .map(([n, v]) => `${n} ${(v / 3 / 1000).toFixed(0)}k`)
      .join(", ")}`
  )
  console.log(
    `  crowd: ${Object.entries(kinds)
      .map(([k, n]) => `${k} ${n}`)
      .join(", ")}`
  )
  const unused = Object.keys(set.materials).filter((n) => ![...built.batch.buckets.keys()].some((m) => m.name === n))
  if (unused.length) console.log(`  unused materials: ${unused.join(", ")}`)
  // What touches nothing and stands off the ground (spec/rest.ts). Floaters warn and do not fail yet.
  const floaters = findFloaters(built.parts, set.materials)
  console.log(`  rest: ${built.parts.length} objects, ${floaters.length} touching nothing`)
  // A scatter of the same thing floats for one reason: one line for all of it.
  const groups = new Map<string, typeof floaters>()
  for (const f of floaters) {
    const k = `${/^objects\/[^/]+\//.test(f.path) ? f.path.replace(/\/\d+$/, "/*") : f.path} (${f.type})`
    groups.set(k, [...(groups.get(k) ?? []), f])
  }
  for (const [k, fs] of groups) {
    const gaps = fs.map((f) => f.gap)
    const over = [...new Set(fs.map((f) => f.over ?? "the ground"))].join(", ")
    const gap = fs.length > 1 ? `${fs.length} of them, ${Math.min(...gaps).toFixed(2)} to ${Math.max(...gaps).toFixed(2)} m` : `${gaps[0].toFixed(2)} m`
    console.log(`  WARN floats ${fs.length > 1 ? k : `${fs[0].path} (${fs[0].type})`}: ${gap} over ${over}`)
  }
  built.parts.length = 0
  return { set, footprints: built.footprints, doors: doorways(built.anchors), sight: built.sight }
}

// The views the desktop takes of whoever acts, and of an actor and their target when no authored shot is on both.
const SUBJECT_SHOT = (subject: string) => ({ subject, distance: 4.5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
const PAIR_SHOT = (subject: string) => ({ subject, distance: 6, angle: 25, height: 1.8, lookHeight: 1.2, fov: 48 })

// Every view of the cast where they stand, as the stage takes it (spec/view.ts): which ones the solver had to move off
// their framing, and which still hide someone behind something solid once it has. Hidden views warn and do not fail yet.
// STAGE_SIGHT=all also lists every moved view with what its framing cost before the move.
function checkSightlines(key: string, set: ReturnType<typeof parseSet>, sight: Sight, staging: StagingSpec, cast: ReturnType<typeof resolveCast>) {
  const seen = (m: CastMember) => ({ x: m.x, z: m.z, y: m.y, height: m.height, down: m.down })
  const member = (id: string) => {
    const m = cast.find((c) => c.id === id)
    if (!m) throw new Error(`staging ${key}: a view is on unknown cast member ${id}`)
    return m
  }
  const views: { kind: string; name: string; shot: StagingShot; ids: string[] }[] = []
  for (const [name, s] of Object.entries(staging.shots))
    if ("subject" in s) views.push({ kind: "authored", name, shot: s, ids: [s.subject] })
    else if ("subjects" in s) views.push({ kind: "authored", name, shot: s, ids: s.subjects })
  for (const c of cast) views.push({ kind: "subject", name: `on ${c.id}`, shot: SUBJECT_SHOT(c.id), ids: [c.id] })
  // The app frames two together only when they are near enough to share a picture.
  for (const a of cast) for (const t of cast) if (a !== t && Math.hypot(a.x - t.x, a.z - t.z) < 14) views.push({ kind: "pair", name: `${a.id} at ${t.id}`, shot: PAIR_SHOT(t.id), ids: [t.id, a.id] })
  const cost = (r: { position: number[]; target: number[]; fov: number }, ids: string[]) =>
    viewCost(
      sight,
      { position: r.position as [number, number, number], target: r.target as [number, number, number], fov: r.fov, aspect: 1.6 },
      ids.map((id) => seen(member(id)))
    )
  const show = (v: ReturnType<typeof viewCost>) => `hidden ${v.hidden.toFixed(2)}, out ${v.out.toFixed(2)}, cover ${v.cover.toFixed(2)}`
  let moved = 0
  // Two who stand either side of a wall cannot share a picture, which is the place and not a fault: they are counted.
  let apart = 0
  const hidden: string[] = []
  const all = process.env.STAGE_SIGHT === "all"
  for (const v of views) {
    const r = clearView({ shot: v.shot, cast, ids: v.ids, sight, box: set.camera, rooms: set.rooms, aspect: 1.6, seen })
    const after = cost(r.shot, v.ids)
    if (r.moved) moved++
    if (after.hidden > 0.2 && v.kind === "pair") apart++
    else if (after.hidden > 0.2) hidden.push(`${v.kind} ${v.name}${r.moved ? " (moved)" : ""}: ${show(after)}`)
    if (all && r.moved) {
      // What the solver changed: how far round it swung, how much nearer or farther, and how much higher.
      const first = frameShot(v.shot, cast)
      const [tx, ty, tz] = first.target
      const ox = first.position[0] - tx
      const oz = first.position[2] - tz
      const nx = r.shot.position[0] - tx
      const nz = r.shot.position[2] - tz
      const swing = (Math.atan2(ox * nz - oz * nx, ox * nx + oz * nz) * 180) / Math.PI
      const scale = Math.hypot(nx, nz) / Math.max(Math.hypot(ox, oz), 1e-6)
      const lift = r.shot.position[1] - ty - (first.position[1] - ty)
      console.log(
        `  moved ${v.kind} ${v.name}: was ${show(cost(first, v.ids))}, now ${show(after)}, swing ${swing.toFixed(0)}, scale ${scale.toFixed(2)}, lift ${lift.toFixed(1)}`
      )
    }
  }
  console.log(`  sight: ${views.length} views, ${moved} moved, ${hidden.length} hidden${apart ? `, ${apart} pairs with no view of both` : ""}`)
  for (const h of hidden) console.log(`  WARN hidden ${h}`)
}

// Every cast member walking to every labelled mark and to conversation distance of every other cast member, as the
// desktop movement does (Stage.route: straight or through a doorway, then 1.1 m short of a person). Blocked walks stop
// at the first solid thing.
function checkWalks(set: ReturnType<typeof parseSet>, footprints: Footprint[], doors: ReturnType<typeof doorways>, cast: ReturnType<typeof resolveCast>) {
  // Someone raised (on a roof, a balcony) stands on something solid by design, and no one walks up to them.
  const ground = cast.filter((c) => !c.y)
  const inside = ground.filter((c) => onFootprint(footprints, c.x, c.z))
  if (inside.length) throw new Error(`cast starts inside something solid: ${inside.map((c) => c.id).join(", ")}`)
  const places = Object.entries(set.marks).filter(([, m]) => m.label)
  const blocked: string[] = []
  let walks = 0
  for (const c of ground) {
    const targets = [...places.map(([id, m]) => ({ id, x: m.at[0], z: m.at[1], stop: 0 })), ...ground.filter((o) => o.id !== c.id).map((o) => ({ id: o.id, x: o.x, z: o.z, stop: 1.1 }))]
    for (const t of targets) {
      const d = Math.hypot(t.x - c.x, t.z - c.z)
      const k = Math.max(0, d - t.stop) / Math.max(d, 1e-6)
      const to = { x: c.x + (t.x - c.x) * k, z: c.z + (t.z - c.z) * k }
      const r = reachOver(footprints, c, to, Number.POSITIVE_INFINITY)
      walks++
      if (r.blocked && !routeOver(footprints, doors, c, to)) blocked.push(`${c.id} -> ${t.id} (${r.distance.toFixed(1)} of ${Math.hypot(to.x - c.x, to.z - c.z).toFixed(1)} m)`)
    }
  }
  const solidPlaces = places.filter(([, m]) => onFootprint(footprints, m.at[0], m.at[1])).map(([id]) => id)
  console.log(`  walks: ${walks - blocked.length} of ${walks} clear${solidPlaces.length ? `. places on something solid (walks stop at its edge): ${solidPlaces.join(", ")}` : ""}`)
  // STAGE_WALKS=all lists every blocked walk.
  const show = process.env.STAGE_WALKS === "all" ? blocked.length : 12
  for (const b of blocked.slice(0, show)) console.log(`  blocked: ${b}`)
  if (blocked.length > show) console.log(`  blocked: ${blocked.length - show} more`)
}

// A staged run has to get where it is going. Each leg, by `via` and then `to`, is walked as the desktop walks it:
// straight or through one doorway.
function checkExits(
  key: string,
  exits: StagingSpec["exits"],
  marks: ReturnType<typeof parseSet>["marks"],
  footprints: Footprint[],
  doors: ReturnType<typeof doorways>,
  cast: ReturnType<typeof resolveCast>
) {
  const point = (ref: string | number[]) => {
    if (Array.isArray(ref)) return { x: ref[0], z: ref[1] }
    const at = cast.find((c) => c.id === ref) ?? (marks[ref] && { x: marks[ref].at[0], z: marks[ref].at[1] })
    if (!at) throw new Error(`staging ${key}: exit names unknown place ${ref}`)
    return { x: at.x, z: at.z }
  }
  for (const e of exits) {
    if (e.lands !== undefined) point(e.lands)
    if (e.via && e.to === undefined) throw new Error(`staging ${key}: ${e.cast}'s exit has a way but nowhere to go`)
    // Someone raised runs off along the roof they stand on, which no ground walk can check.
    if (e.to === undefined || cast.find((c) => c.id === e.cast)?.y) continue
    let from = point(e.cast)
    for (const leg of [...(e.via ?? []), e.to].map(point))
      for (const p of routeOver(footprints, doors, from, leg) ?? [leg]) {
        const hit = reachOver(footprints, from, p, 40)
        if (hit.short) throw new Error(`staging ${key}: ${e.cast}'s exit stops ${hit.distance.toFixed(1)} m into the leg to (${leg.x}, ${leg.z})`)
        from = p
      }
  }
}

// A cued walk on stage has to get from where it starts to the walker's place, the same way.
function checkCuedWalks(key: string, walks: StagingSpec["walks"], marks: ReturnType<typeof parseSet>["marks"], footprints: Footprint[], doors: ReturnType<typeof doorways>, cast: ReturnType<typeof resolveCast>) {
  const point = (ref: string | number[]) => {
    if (Array.isArray(ref)) return { x: ref[0], z: ref[1] }
    const at = cast.find((c) => c.id === ref) ?? (marks[ref] && { x: marks[ref].at[0], z: marks[ref].at[1] })
    if (!at) throw new Error(`staging ${key}: walk names unknown place ${ref}`)
    return { x: at.x, z: at.z }
  }
  for (const w of walks) {
    let from = point(w.from)
    for (const leg of [...(w.via ?? []), w.cast].map(point))
      for (const p of routeOver(footprints, doors, from, leg) ?? [leg]) {
        const hit = reachOver(footprints, from, p, 60)
        if (hit.short) throw new Error(`staging ${key}: ${w.cast}'s walk stops ${hit.distance.toFixed(1)} m into the leg to (${leg.x}, ${leg.z})`)
        from = p
      }
  }
}

// The view the play screen takes of whoever acts.
const HERO_SHOT = (subject: string) => ({ subject, distance: 4, angle: 18, height: 1.6, lookHeight: 1.1, fov: 40 })

// On a painted set every view is taken from a painted point. A view whose subject the paintings do not reach has to turn
// away from it or narrow: it needs a painting of its own.
function checkPainted(painted: NonNullable<Awaited<ReturnType<typeof checkSet>>["set"]["painted"]>, shots: Record<string, { position: number[]; target: number[]; fov: number }>) {
  const points = tripodPoints(painted)
  const off: string[] = []
  const from: Record<string, string[]> = {}
  for (const [name, s] of Object.entries(shots)) {
    const v = tripodView(points, s, 1.6)
    const want = new THREE.Vector3(...(s.target as [number, number, number])).sub(v.point.position)
    const turned = THREE.MathUtils.radToDeg(want.angleTo(v.target.clone().sub(v.point.position)))
    ;(from[v.point.name] ??= []).push(name)
    if (turned > v.fov * 0.3 || v.fov < v.asked * 0.6) off.push(`${name} (from ${v.point.name}, turned ${turned.toFixed(0)} of a ${v.fov.toFixed(0)} degree lens, asked ${v.asked.toFixed(0)})`)
  }
  console.log(
    `  painted: ${Object.entries(from)
      .map(([p, names]) => `${p}: ${names.join(", ")}`)
      .join(". ")}`
  )
  for (const o of off) console.log(`  off the paint: ${o}`)
}

// Every card listed as having a photograph has both of its files.
function checkPhotographs() {
  if (!existsSync("public/stage/photoreal.json")) return
  const listed = JSON.parse(readFileSync("public/stage/photoreal.json", "utf8")) as string[]
  const lost = listed
    .flatMap((b) => ["front", "back"].map((v) => `public/stage/${b.slice(0, b.lastIndexOf("/"))}/photoreal/${b.slice(b.lastIndexOf("/") + 1)}-${v}.webp`))
    .filter((f) => !existsSync(f))
  if (lost.length) throw new Error(`photoreal.json lists missing cards: ${lost.join(", ")}`)
  console.log(`PASS photographs: ${listed.length} cards`)
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length) {
    for (const f of files) await checkSet(f, JSON.parse(readFileSync(f, "utf8")))
    return
  }
  checkPhotographs()
  const sets = new Map<string, Awaited<ReturnType<typeof checkSet>>>()
  for (const [key, load] of Object.entries(SETS)) sets.set(key, await checkSet(key, await load()))
  for (const [key, load] of Object.entries(STAGINGS)) {
    const staging = stagingSpecSchema.parse(await load())
    const built = sets.get(staging.set)
    if (!built) throw new Error(`staging ${key}: unknown set ${staging.set}`)
    const { set, footprints, doors } = built
    const cast = resolveCast(set, staging)
    const shots = resolveShots(set, staging, cast)
    if (staging.shot && !shots[staging.shot]) throw new Error(`staging ${key}: unknown opening shot ${staging.shot}`)
    for (const e of staging.entrances) if (e.shot && !shots[e.shot]) throw new Error(`staging ${key}: unknown entrance shot ${e.shot}`)
    for (const e of staging.exits) if (e.shot && !shots[e.shot]) throw new Error(`staging ${key}: unknown exit shot ${e.shot}`)
    checkExits(key, staging.exits, set.marks, footprints, doors, cast)
    checkCuedWalks(key, staging.walks, set.marks, footprints, doors, cast)
    const missing = staging.cast.flatMap((c) => [...Object.values(c.art), ...(c.figure ? [c.figure.model] : [])]).filter((u) => u.startsWith("/stage/") && !existsSync(`public${u}`))
    if (missing.length) throw new Error(`staging ${key}: missing art ${missing.join(", ")}`)
    console.log(`PASS staging ${key}: ${cast.length} cast (${cast.map((c) => c.id).join(", ")}), ${Object.keys(shots).length} shots (${Object.keys(shots).join(", ")})`)
    if (set.painted && staging.painted) checkPainted(set.painted, { ...shots, ...Object.fromEntries(cast.map((c) => [`on ${c.id}`, frameShot(HERO_SHOT(c.id), cast)])) })
    checkWalks(set, footprints, doors, cast)
    checkSightlines(key, set, built.sight, staging, cast)
  }
}

main().catch((err) => {
  console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
