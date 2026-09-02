// Scene pipeline — map an AdventurePlan encounter into the app-agnostic
// SceneBriefInput that lib/scene-pipeline/brief.ts templates from. This is the only
// file in lib/scene-pipeline that knows the plan shape.

import type { AdventurePlan } from "@/types/adventure-plan"
import type { SceneBriefInput, SceneBriefSetCandidate } from "./brief"

export function sceneBriefInputFromPlan(
  plan: AdventurePlan,
  encounterId: string,
  extras: { settingTitle?: string; artDirection?: string; existingSets?: SceneBriefSetCandidate[] } = {}
): SceneBriefInput {
  for (const section of plan.sections) {
    for (const scene of section.scenes) {
      const index = scene.encounters.findIndex((entry) => entry.id === encounterId)
      if (index < 0) continue
      const encounter = scene.encounters[index]
      // Local wiki adventures flatten into one section and one scene named after the
      // plan, so "siblings" would be the whole adventure. Keep the near neighbours
      // only: that is what a reuse decision actually needs.
      const flattened = section.title === plan.title && scene.title === plan.title
      const neighbours = scene.encounters.slice(Math.max(0, index - 2), index + 3)
      return {
        settingTitle: extras.settingTitle ?? plan.settingId,
        adventureTitle: plan.title,
        settingLore: [plan.teaser, plan.overview].filter(Boolean).join("\n\n"),
        artDirection: extras.artDirection,
        sectionTitle: flattened ? undefined : section.title,
        sceneTitle: flattened ? undefined : scene.title,
        siblingEncounterTitles: (scene.encounters.length > 8 ? neighbours : scene.encounters).map((entry) => (entry.id === encounterId ? `[${entry.title}]` : entry.title)),
        encounterId: encounter.id,
        encounterTitle: encounter.title,
        location: encounter.location,
        intro: encounter.intro,
        instructions: encounter.instructions,
        npcs: (encounter.npc ?? []).map((ref) => {
          const record = plan.npcs[ref.id]
          return { id: ref.id, name: record?.name ?? ref.id, description: record?.appearance, behavior: ref.behavior }
        }),
        referenceImageUrl: encounter.image || scene.image || section.image || undefined,
        existingSets: extras.existingSets,
      }
    }
  }
  throw new Error(`Encounter "${encounterId}" not found in plan "${plan.id}"`)
}
