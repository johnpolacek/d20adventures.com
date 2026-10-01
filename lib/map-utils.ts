import type { AdventureEncounter, AdventurePlan, AdventureSection, Encounter3DSceneKit } from "@/types/adventure-plan"

// Encounter lookup helpers plus the keyword heuristic that suggests a scene kit for
// Mapview generation (see lib/mapview/generate.ts). The old 3D map assembly that lived
// here was removed with the 3D encounter stack (wiki/plans/stageview.md).

const DEFAULT_SCENE_KIT: Encounter3DSceneKit = "generic"

function clampScore(score: number) {
  return Math.max(score, 0)
}

export function inferEncounterSceneKit(args: {
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  encounterNpcBehaviors?: string[]
}): Encounter3DSceneKit {
  const text = [args.sectionTitle, args.sceneTitle, args.encounterTitle, args.encounterIntro, args.encounterInstructions, ...(args.encounterNpcBehaviors || [])].filter(Boolean).join(" ").toLowerCase()

  const score = (keywords: string[], penalty: string[] = []) =>
    clampScore(keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 2 : 0), 0) - penalty.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0))

  const rankedKits = [
    {
      kit: "city_gate" as const,
      score: score(
        ["city gate", "city gates", "gates of", "gate entrance", "grand gate", "main gate", "gatehouse", "city wall", "fortress gate", "arched gate", "portcullis", "city entrance", "market gate"],
        ["checkpoint", "customs", "toll", "guard post", "border"]
      ),
    },
    {
      kit: "checkpoint" as const,
      score: score(["checkpoint", "border", "toll", "customs", "watchtower", "guard post", "barricade"], ["city gate", "city gates", "main gate", "fortress gate", "market"]),
    },
    {
      kit: "crypt" as const,
      score: score(["crypt", "tomb", "mausoleum", "grave", "catacomb", "sarcophagus", "burial", "sepulcher"]),
    },
    {
      kit: "shrine" as const,
      score: score(["shrine", "altar", "temple", "sanctum", "idol", "ritual", "chapel", "sacred"]),
    },
    {
      kit: "cavern" as const,
      score: score(["cavern", "cave", "grotto", "underground", "mine", "tunnel", "chasm"]),
    },
    {
      kit: "camp" as const,
      score: score(["camp", "encampment", "campfire", "tent", "supply", "wagon", "outpost"]),
    },
    {
      kit: "road" as const,
      score: score(["road", "path", "trail", "pass", "bridge", "causeway", "roadside", "caravan", "ambush"]),
    },
    {
      kit: "ruins" as const,
      score: score(["ruins", "ruined", "collapsed", "broken", "shattered", "rubble", "derelict"]),
    },
    {
      kit: "courtyard" as const,
      score: score(["courtyard", "plaza", "hall", "keep", "castle", "fort", "fortress", "court"], ["ruins", "collapsed", "crypt"]),
    },
  ]

  const best = rankedKits.sort((left, right) => right.score - left.score)[0]
  return best && best.score > 0 ? best.kit : DEFAULT_SCENE_KIT
}

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

export function listEncounterOptions(sections: AdventureSection[], currentEncounterId: string) {
  return sections.flatMap((section) =>
    section.scenes.flatMap((scene) =>
      scene.encounters
        .filter((encounter) => encounter.id !== currentEncounterId)
        .map((encounter) => ({
          id: encounter.id,
          label: `${section.title || "Section"} / ${scene.title || "Scene"} / ${encounter.title || encounter.id}`,
          hasMap: Boolean(encounter.map3d),
        }))
    )
  )
}
