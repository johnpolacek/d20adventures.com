// Builds every authored encounter's floor plan from its 3D set and staging, headless, and writes it as plain JSON into
// packages/stage/src/plans: one file per set (what is solid, the doorways, the labelled marks) and one per encounter
// (where the cast starts, where the party stands, spare spots), with a generated index that reads them. The encounters
// are the desktop's SCENES, after its in-code tweaks to the gate stagings.
//
//   pnpm stage:plans          # write the plans, and remove plan files that no longer belong
//   pnpm stage:plans:check    # fail, naming the files, when anything on disk is missing, stale or extra

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createStubLibrary } from "@d20/stage/materials/library"
import { buildSetGeometry, parseSet } from "@d20/stage/spec/build"
import { type EncounterPlan, encounterPlanSchema, type Point, type SetPlan, type Solid, setPlanSchema } from "@d20/stage/spec/plan"
import { resolveCast } from "@d20/stage/spec/resolve"
import { stagingSpecSchema } from "@d20/stage/spec/staging"
import { doorways, onFootprint } from "@d20/stage/spec/walk"
import { SCENES } from "../apps/desktop/src/scenes"

const ROOT = "packages/stage/src/plans"
const check = process.argv.includes("--check")

const round = (n: number) => {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? 0 : r
}
const pt = (x: number, z: number): Point => ({ x: round(x), z: round(z) })
const fileFor = (setId: string) => setId.replaceAll("/", "-")

// JSON as biome formats it at its 200 column line width: an object of plain values, and an array that fits on its line,
// sit on one line, and everything else takes one key or item per line. `lead` is how far into its line the value starts
// and `tail` what follows it there (a comma). Keys keep the order they are built in, which is fixed below.
const WIDTH = 200
function stringify(v: unknown, indent = "", lead = 0, tail = 0): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v)
  const inner = `${indent}  `
  if (Array.isArray(v)) {
    if (!v.length) return "[]"
    const flat = v.map((e) => stringify(e, inner, 0, 0))
    const line = `[${flat.join(", ")}]`
    if (!line.includes("\n") && lead + line.length + tail <= WIDTH) return line
    return `[\n${v.map((e, i) => inner + stringify(e, inner, inner.length, i < v.length - 1 ? 1 : 0)).join(",\n")}\n${indent}]`
  }
  const entries = Object.entries(v).filter(([, e]) => e !== undefined)
  if (!entries.length) return "{}"
  if (entries.every(([, e]) => e === null || typeof e !== "object")) return `{ ${entries.map(([k, e]) => `${JSON.stringify(k)}: ${JSON.stringify(e)}`).join(", ")} }`
  return `{\n${entries
    .map(([k, e], i) => {
      const key = `${inner}${JSON.stringify(k)}: `
      return key + stringify(e, inner, key.length, i < entries.length - 1 ? 1 : 0)
    })
    .join(",\n")}\n${indent}}`
}

const bySolid = (a: Solid, b: Solid) => a.kind.localeCompare(b.kind) || a.x - b.x || a.z - b.z || stringify(a).localeCompare(stringify(b))

function setPlan(raw: unknown) {
  const set = parseSet(raw)
  const built = buildSetGeometry(set, createStubLibrary(set.materials))
  const id = `${set.settingId}/${set.id}`
  const solids: Solid[] = built.footprints
    .map(
      (f): Solid =>
        f.kind === "circle"
          ? { kind: "circle", x: round(f.x), z: round(f.z), r: round(f.r), height: f.height === undefined ? undefined : round(f.height) }
          : {
              kind: "rect",
              x: round(f.x),
              z: round(f.z),
              hw: round(f.hw),
              hd: round(f.hd),
              ry: round(f.ry),
              top: f.top === undefined ? undefined : round(f.top),
              height: f.height === undefined ? undefined : round(f.height),
            }
    )
    .sort(bySolid)
  const doors = doorways(built.anchors).map(([a, b]): [Point, Point] => [pt(a.x, a.z), pt(b.x, b.z)])
  const places = Object.entries(set.marks)
    .flatMap(([mark, m]) => (m.label ? [{ id: mark, label: m.label, ...pt(m.at[0], m.at[1]) }] : []))
    .sort((a, b) => a.id.localeCompare(b.id))
  const plan: SetPlan = setPlanSchema.parse({ id, title: set.title, solids, doors, places })
  // The exact footprints, for the checks below, so rounding cannot move anyone across an edge.
  return { set, plan, footprints: built.footprints }
}

const files = new Map<string, string>()
const warnings: string[] = []
const errors: string[] = []
const sets = new Map<unknown, ReturnType<typeof setPlan>>()
const setFiles = new Map<string, unknown>()
const encounterSets = new Map<string, string>()

for (const [encounterId, scene] of Object.entries(SCENES).sort(([a], [b]) => a.localeCompare(b))) {
  let built = sets.get(scene.set)
  if (!built) {
    built = setPlan(scene.set)
    sets.set(scene.set, built)
    const seen = setFiles.get(built.plan.id)
    if (seen && seen !== scene.set) errors.push(`two different sets are both ${built.plan.id}`)
    setFiles.set(built.plan.id, scene.set)
    files.set(`sets/${fileFor(built.plan.id)}.json`, `${stringify(built.plan)}\n`)
  }
  const { set, plan: sp, footprints } = built
  const staging = stagingSpecSchema.parse(scene.staging)
  if (`${staging.set}` !== sp.id) warnings.push(`${encounterId}: staging names set ${staging.set} but plays on ${sp.id}`)
  const cast = resolveCast(set, staging)
  const party = scene.party.flatMap((id) => {
    const c = cast.find((m) => m.id === id)
    if (!c) errors.push(`${encounterId}: party id ${id} is not in the cast`)
    return c ? [c] : []
  })
  const solid = (x: number, z: number) => onFootprint(footprints, x, z)
  for (const c of cast) if (!c.y && solid(c.x, c.z)) warnings.push(`${encounterId}: ${c.id} starts inside something solid at (${round(c.x)}, ${round(c.z)})`)
  for (const [x, z] of scene.spare ?? []) if (solid(x, z)) warnings.push(`${encounterId}: spare spot (${x}, ${z}) is inside something solid`)
  const plan: EncounterPlan = encounterPlanSchema.parse({
    encounterId,
    set: sp.id,
    location: scene.location,
    where: scene.where,
    cast: cast.map((c) => ({ id: c.id, name: c.name, ...pt(c.x, c.z), raised: c.y ? round(c.y) : undefined })),
    party: party.map((c) => ({ id: c.id, ...pt(c.x, c.z) })),
    spare: (scene.spare ?? []).map(([x, z]) => pt(x, z)),
  })
  encounterSets.set(encounterId, sp.id)
  files.set(`encounters/${encounterId}.json`, `${stringify(plan)}\n`)
}

const missingPlans = Object.keys(SCENES).filter((id) => !files.has(`encounters/${id}.json`))
if (missingPlans.length) errors.push(`no plan for ${missingPlans.join(", ")}`)

// An object key as biome writes it: bare when it can be.
const key = (id: string) => (/^[A-Za-z_$][\w$]*$/.test(id) ? id : JSON.stringify(id))
// The reader: a literal map of lazy imports, as the stage's SETS, so a bundler splits each plan into its own chunk.
const setIds = [...setFiles.keys()].sort()
const encounterIds = [...encounterSets.keys()].sort()
files.set(
  "index.ts",
  `// Generated by scripts/stage-plans.ts. Do not edit: run \`pnpm stage:plans\`.
import { type EncounterPlan, type FloorPlan, joinPlan, parseEncounterPlan, parseSetPlan, type SetPlan } from "../spec/plan"

const SET_PLANS: Record<string, () => Promise<unknown>> = {
${setIds.map((id) => `  ${key(id)}: () => import("./sets/${fileFor(id)}.json").then((m) => m.default),`).join("\n")}
}

const ENCOUNTER_PLANS: Record<string, () => Promise<unknown>> = {
${encounterIds.map((id) => `  ${key(id)}: () => import("./encounters/${id}.json").then((m) => m.default),`).join("\n")}
}

export const FLOOR_PLAN_IDS: string[] = Object.keys(ENCOUNTER_PLANS)

export async function setPlanFor(setId: string): Promise<SetPlan | undefined> {
  const load = SET_PLANS[setId]
  return load && parseSetPlan(await load())
}

export async function encounterPlanFor(encounterId: string): Promise<EncounterPlan | undefined> {
  const load = ENCOUNTER_PLANS[encounterId]
  return load && parseEncounterPlan(await load())
}

// An encounter's floor plan joined with its set, or undefined when the encounter has no authored scene.
export async function floorPlanFor(encounterId: string): Promise<FloorPlan | undefined> {
  const encounter = await encounterPlanFor(encounterId)
  if (!encounter) return undefined
  const set = await setPlanFor(encounter.set)
  if (!set) throw new Error(\`floor plan \${encounterId} names unknown set \${encounter.set}\`)
  return joinPlan(encounter, set)
}
`
)

for (const w of warnings) console.log(`WARN ${w}`)
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`)
  process.exit(1)
}

const onDisk = ["sets", "encounters"].flatMap((dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).map((f) => `${dir}/${f}`) : []))
const extra = onDisk.filter((f) => !files.has(f))
const changed = [...files].filter(([f, text]) => !existsSync(join(ROOT, f)) || readFileSync(join(ROOT, f), "utf8") !== text).map(([f]) => f)

if (check) {
  const stale = [...changed.map((f) => `${existsSync(join(ROOT, f)) ? "stale" : "missing"} ${f}`), ...extra.map((f) => `extra ${f}`)]
  if (stale.length) {
    for (const s of stale) console.error(`FAIL ${ROOT}/${s.slice(s.indexOf(" ") + 1)}: ${s.slice(0, s.indexOf(" "))}`)
    console.error("Run `pnpm stage:plans`.")
    process.exit(1)
  }
  console.log(`PASS plans: ${setIds.length} sets, ${encounterIds.length} encounters, up to date`)
} else {
  for (const dir of ["sets", "encounters"]) mkdirSync(join(ROOT, dir), { recursive: true })
  for (const f of changed) writeFileSync(join(ROOT, f), files.get(f)!)
  for (const f of extra) rmSync(join(ROOT, f))
  console.log(`Wrote ${changed.length} and removed ${extra.length} plan files: ${setIds.length} sets, ${encounterIds.length} encounters`)
}
