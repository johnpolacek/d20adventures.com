/**
 * Mapview smoke check — runs the real generation pipeline end-to-end for one encounter
 * (plan load → scene-kit inference → generateObject → assemble/clamp → S3 store) and
 * writes an SSR-rendered HTML preview for visual review. See wiki/plans/mapview.md.
 *
 * Usage: pnpm exec dotenv -e .env.local -e .env -- tsx scripts/mapview-smoke.ts [encounterId] [outDir] [designer prompt]
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
// The lib/ai wrapper is Clerk/token-coupled (server-action context only); use the
// same underlying model directly so the script runs headless.
import { google } from "@ai-sdk/google"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EncounterMap2D } from "@/components/mapview/encounter-map-2d"
import { currentModel, openaiModel } from "@/lib/ai/llm"
import { inferEncounterSceneKit } from "@/lib/map-utils"
import { assembleEncounter2DMap, buildMap2DPrompt, getEncounterMap2DStorageKey } from "@/lib/mapview/generate"
import { generateEncounter2DGeneration } from "@/lib/mapview/model"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "the-midnight-summons"

async function main() {
  const requestedEncounterId = process.argv[2]
  const outDir = process.argv[3] || "."
  const ownerPrompt = process.argv[4] || undefined

  const plan = await loadAdventurePlanForRuntime(SETTING_ID, PLAN_ID)
  const flat = plan.sections.flatMap((section) => section.scenes.flatMap((scene) => scene.encounters.map((encounter) => ({ section, scene, encounter }))))
  const target = requestedEncounterId ? flat.find((entry) => entry.encounter.id === requestedEncounterId) : flat[0]
  if (!target) {
    throw new Error(`Encounter not found. Available: ${flat.map((entry) => entry.encounter.id).join(", ")}`)
  }

  const { section, scene, encounter } = target
  const npcIds = (encounter.npc || []).map((npc) => npc.id)
  const sceneKit = inferEncounterSceneKit({
    sectionTitle: section.title,
    sceneTitle: scene.title,
    encounterTitle: encounter.title,
    encounterIntro: encounter.intro,
    encounterInstructions: encounter.instructions,
    encounterNpcBehaviors: (encounter.npc || []).map((npc) => npc.behavior),
  })
  console.log(`Encounter: ${encounter.id} ("${encounter.title}") · kit: ${sceneKit} · NPCs: ${npcIds.join(", ") || "none"}`)

  const prompt = buildMap2DPrompt({
    sectionTitle: section.title,
    sceneTitle: scene.title,
    encounterTitle: encounter.title,
    encounterIntro: encounter.intro,
    encounterInstructions: encounter.instructions,
    npcIds,
    sceneKit,
    ownerPrompt,
  })

  // MV_MODEL overrides the shared default (gemini-3.5-flash) for experiments only.
  const modelOverride = process.env.MV_MODEL === "openai" ? openaiModel : process.env.MV_MODEL === "lite" ? currentModel : process.env.MV_MODEL ? google(process.env.MV_MODEL) : undefined
  const started = Date.now()
  const generation = await generateEncounter2DGeneration(prompt, { model: modelOverride })
  console.log(`Generated in ${((Date.now() - started) / 1000).toFixed(1)}s`)

  const map = assembleEncounter2DMap(generation, { maxPartySize: plan.party?.[1] ?? 4, npcIds, prompt: ownerPrompt })
  console.log(
    `Board ${map.board.columns}x${map.board.rows} (${map.board.ground}) · ${map.pieces.length} pieces · ${map.walls.length} walls · ${map.zones.length} zones · ${map.partySlots.length} party slots · ${map.npcStarts.length} NPC starts`
  )
  console.log(`Summary: ${map.summary}`)

  const key = getEncounterMap2DStorageKey(SETTING_ID, PLAN_ID, encounter.id)
  await updateJsonOnS3(key, map)
  console.log(`Stored to S3: ${key}`)

  mkdirSync(outDir, { recursive: true })
  const jsonPath = join(outDir, `mapview-${encounter.id}.json`)
  writeFileSync(jsonPath, JSON.stringify(map, null, 2))
  const svgMarkup = renderToStaticMarkup(createElement(EncounterMap2D, { map }))
  const htmlPath = join(outDir, `mapview-${encounter.id}.html`)
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><title>${encounter.title}</title><style>body{background:#181510;margin:0;padding:24px;font-family:system-ui}h1{color:#e8c86a;font-size:18px}p{color:#a89b82;font-size:13px}.wrap{max-width:960px;margin:0 auto}</style></head><body><div class="wrap"><h1>${encounter.title} — ${map.sceneKit}</h1><p>${map.summary}</p>${svgMarkup}</div></body></html>`
  )
  console.log(`Wrote ${jsonPath} and ${htmlPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
