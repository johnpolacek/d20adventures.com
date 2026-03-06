import type {
  AdventureEncounter,
  AdventurePlan,
  AdventureSection,
  Encounter3DMap,
  Encounter3DPropKind,
  Encounter3DTerrainKind,
  Encounter3DTheme,
} from "@/types/adventure-plan"

const DEFAULT_THEME: Encounter3DTheme = "stone"

export function createDefaultEncounterMap(summary = ""): Encounter3DMap {
  return {
    version: 1,
    summary,
    promptHistory: [],
    board: {
      width: 12,
      depth: 12,
      cellSize: 1,
      theme: DEFAULT_THEME,
      accentColor: "#b08968",
    },
    camera: {
      distance: 18,
      pitch: 0.9,
      yaw: -0.75,
      focusX: 0,
      focusZ: 0,
    },
    terrain: [],
    props: [],
    zones: [],
    tokenSlots: {
      party: [],
      npc: [],
    },
  }
}

export function getThemePalette(theme: Encounter3DTheme) {
  switch (theme) {
    case "dirt":
      return { floor: "#6f4e37", edge: "#422d1d", accent: "#a67c52" }
    case "wood":
      return { floor: "#8b5a2b", edge: "#55341c", accent: "#d6b27d" }
    case "cavern":
      return { floor: "#585b66", edge: "#2f3138", accent: "#9da3af" }
    case "sand":
      return { floor: "#c8ad7f", edge: "#8b7355", accent: "#eed9a7" }
    case "snow":
      return { floor: "#dbe8f1", edge: "#98a8b3", accent: "#f8fbff" }
    case "stone":
    default:
      return { floor: "#7a746b", edge: "#4c4741", accent: "#b08968" }
  }
}

export function getTerrainDefaults(kind: Encounter3DTerrainKind) {
  switch (kind) {
    case "wall":
      return { width: 4, depth: 0.6, height: 2.4 }
    case "water":
      return { width: 3, depth: 3, height: 0.1 }
    case "dais":
      return { width: 3, depth: 3, height: 0.6 }
    case "ramp":
      return { width: 3, depth: 1.5, height: 0.8 }
    case "pit":
      return { width: 3, depth: 3, height: 1.2 }
    case "platform":
    default:
      return { width: 3, depth: 3, height: 0.5 }
  }
}

export function getPropDefaults(kind: Encounter3DPropKind) {
  switch (kind) {
    case "pillar":
      return { scale: 1.1 }
    case "torch":
      return { scale: 0.9 }
    case "tree":
      return { scale: 1.5 }
    case "rock":
      return { scale: 1.2 }
    case "statue":
      return { scale: 1.3 }
    case "altar":
      return { scale: 1.1 }
    case "crate":
    case "table":
    case "stairs":
    case "banner":
    default:
      return { scale: 1 }
  }
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
