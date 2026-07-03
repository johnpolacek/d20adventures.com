"use server"

// Mapview server actions — generate/load 2D encounter maps (wiki/plans/mapview.md).
// Maps are generated at authoring time by an admin and stored as per-encounter JSON
// in S3, keyed independently of the plan so the wiki compile pipeline is untouched.

import { auth } from "@clerk/nextjs/server"
import { generateObject } from "@/lib/ai"
import { isAdmin } from "@/lib/auth-utils"
import { inferEncounterSceneKit } from "@/lib/map-utils"
import { assembleEncounter2DMap, buildMap2DPrompt, getEncounterMap2DStorageKey } from "@/lib/mapview/generate"
import { loadEncounterMap2D } from "@/lib/mapview/load"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventureEncounter } from "@/types/adventure-plan"
import type { Encounter2DMap } from "@/types/encounter-map-2d"
import { encounter2dGenerationSchema } from "@/types/encounter-map-2d"

async function requireAdminUser(): Promise<string> {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    throw new Error("Unauthorized")
  }
  return userId
}

function findEncounterContext(sections: { title: string; scenes: { title: string; encounters: AdventureEncounter[] }[] }[], encounterId: string) {
  for (const section of sections) {
    for (const scene of section.scenes) {
      const encounter = scene.encounters.find((entry) => entry.id === encounterId)
      if (encounter) {
        return { sectionTitle: section.title, sceneTitle: scene.title, encounter }
      }
    }
  }
  return null
}

export async function getEncounterMap2D(settingId: string, adventurePlanId: string, encounterId: string): Promise<Encounter2DMap | null> {
  await requireAdminUser()
  return loadEncounterMap2D(settingId, adventurePlanId, encounterId)
}

export async function generateEncounterMap2D(args: { settingId: string; adventurePlanId: string; encounterId: string; prompt?: string; revise?: boolean }): Promise<Encounter2DMap> {
  await requireAdminUser()

  const plan = await loadAdventurePlanForRuntime(args.settingId, args.adventurePlanId)
  const context = findEncounterContext(plan.sections, args.encounterId)
  if (!context) {
    throw new Error(`Encounter "${args.encounterId}" not found in ${args.settingId}/${args.adventurePlanId}`)
  }

  const { sectionTitle, sceneTitle, encounter } = context
  const npcIds = (encounter.npc || []).map((npc) => npc.id)
  const sceneKit = inferEncounterSceneKit({
    sectionTitle,
    sceneTitle,
    encounterTitle: encounter.title,
    encounterIntro: encounter.intro,
    encounterInstructions: encounter.instructions,
    encounterNpcBehaviors: (encounter.npc || []).map((npc) => npc.behavior),
  })

  const existingMap = args.revise ? await getEncounterMap2D(args.settingId, args.adventurePlanId, args.encounterId) : null

  const prompt = buildMap2DPrompt({
    sectionTitle,
    sceneTitle,
    encounterTitle: encounter.title,
    encounterIntro: encounter.intro,
    encounterInstructions: encounter.instructions,
    npcIds,
    sceneKit,
    ownerPrompt: args.prompt,
    existingMapJson: existingMap ? JSON.stringify(existingMap, null, 2) : undefined,
  })

  // Structured generation is occasionally flaky (NoObjectGeneratedError); retry once.
  let result: Awaited<ReturnType<typeof generateObject<typeof encounter2dGenerationSchema>>>
  try {
    result = await generateObject({ prompt, schema: encounter2dGenerationSchema })
  } catch (firstError) {
    console.warn("Map generation failed once, retrying:", firstError)
    result = await generateObject({ prompt, schema: encounter2dGenerationSchema })
  }

  const map = assembleEncounter2DMap(result.object, {
    maxPartySize: plan.party?.[1] ?? 4,
    npcIds,
    prompt: args.prompt,
    previousPromptHistory: existingMap?.promptHistory,
  })

  await updateJsonOnS3(getEncounterMap2DStorageKey(args.settingId, args.adventurePlanId, args.encounterId), map)
  return map
}
