/**
 * Re-run deterministic token placement on already-stored maps without regenerating art.
 * Use after a placeTokens() fix to correct party/NPC positions in place.
 *
 * Usage: pnpm exec dotenv -e .env.local -e .env -- tsx scripts/mapview-replace-tokens.ts [outDir]
 * Rewrites every Midnight Summons encounter map that has NPCs or is worth re-placing.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EncounterMap2D } from "@/components/mapview/encounter-map-2d"
import { densifyForest, getEncounterMap2DStorageKey, placeTokens } from "@/lib/mapview/generate"
import { loadEncounterMap2D } from "@/lib/mapview/load"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"

const SETTING_ID = "realm-of-myr"
const PLAN_ID = "the-midnight-summons"

async function main() {
  const outDir = process.argv[2]
  const plan = await loadAdventurePlanForRuntime(SETTING_ID, PLAN_ID)
  const maxPartySize = plan.party?.[1] ?? 4

  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        const map = await loadEncounterMap2D(SETTING_ID, PLAN_ID, encounter.id)
        if (!map) continue
        const npcs = (encounter.npc || []).map((npc) => ({ id: npc.id, startNear: npc.startNear }))
        const densified = { ...map, ...densifyForest(map) }
        const { partySlots, npcStarts } = placeTokens(densified, maxPartySize, npcs)
        const updated = { ...densified, partySlots, npcStarts }
        await updateJsonOnS3(getEncounterMap2DStorageKey(SETTING_ID, PLAN_ID, encounter.id), updated)
        console.log(`${encounter.id}: party ${partySlots.map((slot) => `(${slot.x},${slot.y})`).join("")} · npc ${npcStarts.map((npc) => `${npc.npcId}(${npc.x},${npc.y})`).join(" ") || "none"}`)
        if (outDir) {
          mkdirSync(outDir, { recursive: true })
          writeFileSync(join(outDir, `mapview-${encounter.id}.json`), JSON.stringify(updated, null, 2))
          const svg = renderToStaticMarkup(createElement(EncounterMap2D, { map: updated }))
          writeFileSync(
            join(outDir, `mapview-${encounter.id}.html`),
            `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#181510;margin:0;padding:24px}.wrap{max-width:960px;margin:0 auto}</style></head><body><div class="wrap">${svg}</div></body></html>`
          )
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
