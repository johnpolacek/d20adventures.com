/**
 * Batch-generate 2D encounter maps for every encounter in an adventure plan
 * (wiki/plans/mapview.md). Same pipeline as scripts/mapview-smoke.ts — plan load →
 * scene-kit inference → generateObject → assemble/clamp → S3 store — run across the
 * whole plan with bounded concurrency, skipping encounters that already have a map.
 *
 * Usage:
 *   pnpm exec dotenv -e .env.local -e .env -- tsx scripts/mapview-generate-plan.ts <planId> [options]
 *
 * Options:
 *   --setting <id>    setting id (default: realm-of-myr)
 *   --only <id>       generate just this one encounter (repeatable)
 *   --force           regenerate encounters that already have a stored map
 *   --concurrency <n> parallel generations (default: 4)
 *   --dry-run         list what would be generated, call no models
 */
// The lib/ai wrapper is Clerk/token-coupled (server-action context only); the model
// module below talks to the provider directly so this runs headless.
import { inferEncounterSceneKit } from "@/lib/map-utils"
import { assembleEncounter2DMap, buildMap2DPrompt, getEncounterMap2DStorageKey } from "@/lib/mapview/generate"
import { loadEncounterMap2D } from "@/lib/mapview/load"
import { generateEncounter2DGeneration } from "@/lib/mapview/model"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventureEncounter } from "@/types/adventure-plan"

type Target = {
  sectionTitle: string
  sceneTitle: string
  encounter: AdventureEncounter
}

function parseArgs(argv: string[]) {
  const positional: string[] = []
  const only: string[] = []
  let settingId = "realm-of-myr"
  let force = false
  let dryRun = false
  let concurrency = 4

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--setting") settingId = argv[++i]
    else if (arg === "--only") only.push(argv[++i])
    else if (arg === "--force") force = true
    else if (arg === "--dry-run") dryRun = true
    else if (arg === "--concurrency") concurrency = Number(argv[++i])
    else positional.push(arg)
  }

  const planId = positional[0]
  if (!planId) throw new Error("Missing <planId>. Usage: tsx scripts/mapview-generate-plan.ts <planId> [--setting id] [--only encounterId] [--force] [--concurrency n] [--dry-run]")
  if (!Number.isFinite(concurrency) || concurrency < 1) throw new Error(`Invalid --concurrency: ${concurrency}`)
  return { planId, settingId, only, force, dryRun, concurrency }
}

/** Run tasks with at most `limit` in flight, preserving input order in the results. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  const { planId, settingId, only, force, dryRun, concurrency } = parseArgs(process.argv.slice(2))

  const plan = await loadAdventurePlanForRuntime(settingId, planId)
  const maxPartySize = plan.party?.[1] ?? 4
  const all: Target[] = plan.sections.flatMap((section) =>
    section.scenes.flatMap((scene) => scene.encounters.map((encounter) => ({ sectionTitle: section.title, sceneTitle: scene.title, encounter }) as Target))
  )

  let targets = all
  if (only.length > 0) {
    targets = only.map((id) => {
      const found = all.find((entry) => entry.encounter.id === id)
      if (!found) throw new Error(`Encounter "${id}" not found in ${settingId}/${planId}. Available: ${all.map((entry) => entry.encounter.id).join(", ")}`)
      return found
    })
  }

  console.log(`Plan ${settingId}/${planId}: ${all.length} encounters, ${targets.length} targeted, party max ${maxPartySize}`)

  // One S3 read per encounter so a rerun after a partial batch only fills the gaps.
  if (!force) {
    const existing = await mapWithConcurrency(targets, 8, async (target) => Boolean(await loadEncounterMap2D(settingId, planId, target.encounter.id)))
    const skipped = targets.filter((_, index) => existing[index])
    targets = targets.filter((_, index) => !existing[index])
    if (skipped.length > 0) console.log(`Skipping ${skipped.length} with existing maps (use --force to regenerate)`)
  }

  if (targets.length === 0) {
    console.log("Nothing to generate.")
    return
  }

  if (dryRun) {
    for (const target of targets) console.log(`  would generate: ${target.encounter.id} ("${target.encounter.title}")`)
    console.log(`Dry run — ${targets.length} generations skipped.`)
    return
  }

  const failures: { id: string; error: string }[] = []
  let done = 0
  const started = Date.now()

  await mapWithConcurrency(targets, concurrency, async (target) => {
    const { encounter } = target
    try {
      const sceneKit = inferEncounterSceneKit({
        sectionTitle: target.sectionTitle,
        sceneTitle: target.sceneTitle,
        encounterTitle: encounter.title,
        encounterIntro: encounter.intro,
        encounterInstructions: encounter.instructions,
        encounterNpcBehaviors: (encounter.npc || []).map((npc) => npc.behavior),
      })
      const prompt = buildMap2DPrompt({
        sectionTitle: target.sectionTitle,
        sceneTitle: target.sceneTitle,
        encounterTitle: encounter.title,
        locationTitle: encounter.location,
        encounterIntro: encounter.intro,
        encounterInstructions: encounter.instructions,
        npcIds: (encounter.npc || []).map((npc) => npc.id),
        sceneKit,
      })
      const generation = await generateEncounter2DGeneration(prompt)
      const map = assembleEncounter2DMap(generation, {
        maxPartySize,
        npcs: (encounter.npc || []).map((npc) => ({ id: npc.id, startNear: npc.startNear })),
      })
      await updateJsonOnS3(getEncounterMap2DStorageKey(settingId, planId, encounter.id), map)
      done++
      console.log(`[${done}/${targets.length}] ${encounter.id} · ${sceneKit} · ${map.board.columns}x${map.board.rows} ${map.board.ground} · ${map.pieces.length} pieces, ${map.npcStarts.length} NPC starts`)
    } catch (error) {
      done++
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ id: encounter.id, error: message })
      console.error(`[${done}/${targets.length}] FAILED ${encounter.id}: ${message}`)
    }
  })

  console.log(`\nGenerated ${targets.length - failures.length}/${targets.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  if (failures.length > 0) {
    console.log(`Failures (rerun without --force to retry just these):`)
    for (const failure of failures) console.log(`  ${failure.id}: ${failure.error}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
