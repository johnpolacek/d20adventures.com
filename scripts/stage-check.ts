// Validates Stageview set and staging specs without a GPU or a DOM: schema, every builder's params, material references,
// nesting and the geometry budget (a dry build into stub materials), plus the crowd population. Stagings also check
// that their art exists, that no one starts inside something solid, and which straight walks are blocked.
//
//   pnpm exec tsx scripts/stage-check.ts                 # every repo-local set and staging
//   pnpm exec tsx scripts/stage-check.ts path/to/set.json

import { existsSync, readFileSync } from "node:fs"
import type { Footprint } from "@d20/stage/builders/types"
import { createStubLibrary } from "@d20/stage/materials/library"
import { SETS, STAGINGS } from "@d20/stage/sets"
import { buildSetGeometry, parseSet, populateCrowd } from "@d20/stage/spec/build"
import { resolveCast, resolveShots } from "@d20/stage/spec/resolve"
import { stagingSpecSchema } from "@d20/stage/spec/staging"
import { onFootprint, reachOver } from "@d20/stage/spec/walk"

async function checkSet(label: string, raw: unknown) {
  const t0 = performance.now()
  const set = parseSet(raw)
  const lib = createStubLibrary(set.materials)
  const built = buildSetGeometry(set, lib)
  let vertices = 0
  const byMaterial: [string, number][] = []
  for (const [m, geos] of built.batch.buckets) {
    const v = geos.reduce((a, g) => a + g.attributes.position.count, 0)
    vertices += v
    byMaterial.push([m.name, v])
  }
  const people = populateCrowd(set, built.footprints, built.anchors)
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
  return { set, footprints: built.footprints }
}

// Every cast member walking straight to every labelled mark and to conversation distance of every other cast member,
// as the desktop movement does (Stage.reach, then 1.1 m short of a person). Blocked walks stop at the first solid thing.
function checkWalks(set: ReturnType<typeof parseSet>, footprints: Footprint[], cast: ReturnType<typeof resolveCast>) {
  const inside = cast.filter((c) => onFootprint(footprints, c.x, c.z))
  if (inside.length) throw new Error(`cast starts inside something solid: ${inside.map((c) => c.id).join(", ")}`)
  const places = Object.entries(set.marks).filter(([, m]) => m.label)
  const blocked: string[] = []
  let walks = 0
  for (const c of cast) {
    const targets = [...places.map(([id, m]) => ({ id, x: m.at[0], z: m.at[1], stop: 0 })), ...cast.filter((o) => o.id !== c.id).map((o) => ({ id: o.id, x: o.x, z: o.z, stop: 1.1 }))]
    for (const t of targets) {
      const d = Math.hypot(t.x - c.x, t.z - c.z)
      const k = Math.max(0, d - t.stop) / Math.max(d, 1e-6)
      const to = { x: c.x + (t.x - c.x) * k, z: c.z + (t.z - c.z) * k }
      const r = reachOver(footprints, c, to, Number.POSITIVE_INFINITY)
      walks++
      if (r.blocked) blocked.push(`${c.id} -> ${t.id} (${r.distance.toFixed(1)} of ${Math.hypot(to.x - c.x, to.z - c.z).toFixed(1)} m)`)
    }
  }
  const solidPlaces = places.filter(([, m]) => onFootprint(footprints, m.at[0], m.at[1])).map(([id]) => id)
  console.log(`  walks: ${walks - blocked.length} of ${walks} clear${solidPlaces.length ? `. places on something solid (walks stop at its edge): ${solidPlaces.join(", ")}` : ""}`)
  for (const b of blocked.slice(0, 12)) console.log(`  blocked: ${b}`)
  if (blocked.length > 12) console.log(`  blocked: ${blocked.length - 12} more`)
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length) {
    for (const f of files) await checkSet(f, JSON.parse(readFileSync(f, "utf8")))
    return
  }
  const sets = new Map<string, Awaited<ReturnType<typeof checkSet>>>()
  for (const [key, load] of Object.entries(SETS)) sets.set(key, await checkSet(key, await load()))
  for (const [key, load] of Object.entries(STAGINGS)) {
    const staging = stagingSpecSchema.parse(await load())
    const built = sets.get(staging.set)
    if (!built) throw new Error(`staging ${key}: unknown set ${staging.set}`)
    const { set, footprints } = built
    const cast = resolveCast(set, staging)
    const shots = resolveShots(set, staging, cast)
    if (staging.shot && !shots[staging.shot]) throw new Error(`staging ${key}: unknown opening shot ${staging.shot}`)
    const missing = staging.cast.flatMap((c) => Object.values(c.art)).filter((u) => u.startsWith("/stage/") && !existsSync(`public${u}`))
    if (missing.length) throw new Error(`staging ${key}: missing art ${missing.join(", ")}`)
    console.log(`PASS staging ${key}: ${cast.length} cast (${cast.map((c) => c.id).join(", ")}), ${Object.keys(shots).length} shots (${Object.keys(shots).join(", ")})`)
    checkWalks(set, footprints, cast)
  }
}

main().catch((err) => {
  console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
