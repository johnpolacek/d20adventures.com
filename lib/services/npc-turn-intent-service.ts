import { isAiControlledPc } from "@/lib/utils/turn-actors"
import type { TurnCharacter } from "@/types/adventure"
import type { AdventureEncounter, AdventurePlan } from "@/types/adventure-plan"

export function findEncounterInPlan(plan: AdventurePlan, encounterId: string): AdventureEncounter | null {
  return (
    plan.sections
      .flatMap((section) => section.scenes)
      .flatMap((scene) => scene.encounters)
      .find((encounter) => encounter.id === encounterId) ?? null
  )
}

export function resolvePlanContextForEncounter(
  plan: AdventurePlan,
  encounterId: string
): {
  sectionContext?: { title?: string; summary?: string }
  sceneContext?: { title?: string; summary?: string }
  adventureOverview?: string
  sectionTitle?: string
  sceneTitle?: string
} {
  let currentSection: AdventurePlan["sections"][number] | undefined
  let currentScene: AdventurePlan["sections"][number]["scenes"][number] | undefined

  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      if (scene.encounters.some((encounter) => encounter.id === encounterId)) {
        currentSection = section
        currentScene = scene
        break
      }
    }
    if (currentSection && currentScene) break
  }

  return {
    sectionContext: currentSection ? { title: currentSection.title, summary: currentSection.summary } : undefined,
    sceneContext: currentScene ? { title: currentScene.title, summary: currentScene.summary } : undefined,
    adventureOverview: plan.overview || undefined,
    sectionTitle: currentSection?.title,
    sceneTitle: currentScene?.title,
  }
}

export function buildNpcInitiativeOrder(characters: TurnCharacter[]): TurnCharacter[] {
  // AI companions stay eligible after hasReplied so a turn that crashed between
  // submitReply and roll resolution can resume; mid-roll humans stay excluded.
  return characters.filter((character) => !character.isComplete && (!character.hasReplied || isAiControlledPc(character))).sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
}
