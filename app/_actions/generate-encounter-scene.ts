"use server"

// Encounter view server action — get-or-generate the per-turn 3D miniature scene.
// Player-facing (any participant of the adventure), unlike the admin-only mapview
// generation: scenes are staged from play-time narratives, so players trigger them.

import { auth } from "@clerk/nextjs/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccessByTurn } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { assembleEncounterScene3D, buildScenePrompt, getEncounterScene3DStorageKey, normalizeSceneGeneration, type SceneRosterCharacter } from "@/lib/encounterview/generate"
import { loadEncounterScene3D } from "@/lib/encounterview/load"
import { generateEncounterScene3DGeneration } from "@/lib/encounterview/model"
import { updateJsonOnS3 } from "@/lib/s3-utils"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventureEncounter } from "@/types/adventure-plan"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"

const PREVIOUS_NARRATIVE_LIMIT = 4

function findEncounter(sections: { title: string; scenes: { title: string; encounters: AdventureEncounter[] }[] }[], encounterId: string): AdventureEncounter | null {
  for (const section of sections) {
    for (const scene of section.scenes) {
      const encounter = scene.encounters.find((entry) => entry.id === encounterId)
      if (encounter) return encounter
    }
  }
  return null
}

export async function getOrGenerateEncounterScene(args: { settingId: string; adventurePlanId: string; adventureId: string; turnId: string }): Promise<{ scene: EncounterScene3D; cached: boolean }> {
  const { userId } = await auth()
  const { turn } = await assertAdventureAccessByTurn(userId, args.turnId as Id<"turns">)
  if (turn.adventureId !== args.adventureId) {
    throw new Error("Turn does not belong to this adventure")
  }

  const cachedScene = await loadEncounterScene3D(args.settingId, args.adventureId, args.turnId)
  if (cachedScene) {
    return { scene: cachedScene, cached: true }
  }

  const allTurns = await convex.query(api.adventure.getTurnsByAdventure, { adventureId: turn.adventureId })
  const previousNarratives = allTurns
    .filter((t) => t.order < turn.order && t.encounterId === turn.encounterId)
    .sort((a, b) => a.order - b.order)
    .slice(-PREVIOUS_NARRATIVE_LIMIT)
    .map((t) => t.narrative)

  let encounter: AdventureEncounter | null = null
  try {
    const plan = await loadAdventurePlanForRuntime(args.settingId, args.adventurePlanId)
    encounter = findEncounter(plan.sections, turn.encounterId)
  } catch (error) {
    console.warn(`[encounterview] could not load plan for encounter intro: ${error instanceof Error ? error.message : error}`)
  }

  const roster: SceneRosterCharacter[] = turn.characters.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type === "pc" ? "pc" : "npc",
    race: c.race,
    archetype: c.archetype,
    healthPercent: c.healthPercent,
  }))

  const prompt = buildScenePrompt({
    encounterTitle: encounter?.title ?? turn.title,
    encounterIntro: encounter?.intro,
    previousNarratives,
    currentNarrative: turn.narrative,
    roster,
  })

  const generation = await generateEncounterScene3DGeneration(prompt)
  const scene = assembleEncounterScene3D(normalizeSceneGeneration(generation, roster), { turnId: args.turnId })

  await updateJsonOnS3(getEncounterScene3DStorageKey(args.settingId, args.adventureId, args.turnId), scene)
  return { scene, cached: false }
}
