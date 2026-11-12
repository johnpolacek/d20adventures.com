import type { AdventureEncounter, AdventurePlan, AdventureSection } from "@/types/adventure-plan"

export function findEncounterById(sections: AdventureSection[] | AdventurePlan["sections"], encounterId: string | undefined): AdventureEncounter | null {
  if (!encounterId) return null
  for (const section of sections) {
    for (const scene of section.scenes) {
      for (const encounter of scene.encounters) {
        if (encounter.id === encounterId) {
          return encounter
        }
      }
    }
  }
  return null
}
