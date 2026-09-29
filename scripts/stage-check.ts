// Validates Stageview set and staging specs without a GPU or a DOM: schema, every builder's params, material references,
// nesting and the geometry budget (a dry build into stub materials), plus the crowd population.
//
//   pnpm exec tsx scripts/stage-check.ts                 # every repo-local set and staging
//   pnpm exec tsx scripts/stage-check.ts path/to/set.json

import { readFileSync } from "node:fs"
import { createStubLibrary } from "../lib/stage/materials/library"
import { SETS, STAGINGS } from "../lib/stage/sets"
import { buildSetGeometry, parseSet, populateCrowd } from "../lib/stage/spec/build"
import { resolveCast, resolveShots } from "../lib/stage/spec/resolve"
import { stagingSpecSchema } from "../lib/stage/spec/staging"

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
  return set
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
    const set = sets.get(staging.set)
    if (!set) throw new Error(`staging ${key}: unknown set ${staging.set}`)
    const cast = resolveCast(set, staging)
    const shots = resolveShots(set, staging, cast)
    if (staging.shot && !shots[staging.shot]) throw new Error(`staging ${key}: unknown opening shot ${staging.shot}`)
    console.log(`PASS staging ${key}: ${cast.length} cast (${cast.map((c) => c.id).join(", ")}), ${Object.keys(shots).length} shots (${Object.keys(shots).join(", ")})`)
  }
}

main().catch((err) => {
  console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
