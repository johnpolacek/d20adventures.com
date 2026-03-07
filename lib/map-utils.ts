import type {
  AdventureEncounter,
  AdventurePlan,
  AdventureSection,
  Encounter3DMap,
  Encounter3DNpcSlot,
  Encounter3DPartySlot,
  Encounter3DProp,
  Encounter3DPropKind,
  Encounter3DTerrain,
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

function cloneEncounterMap(map: Encounter3DMap): Encounter3DMap {
  return {
    ...map,
    board: { ...map.board },
    camera: { ...map.camera },
    terrain: map.terrain.map((item) => ({ ...item })),
    props: map.props.map((item) => ({ ...item })),
    zones: map.zones.map((item) => ({ ...item })),
    tokenSlots: {
      party: map.tokenSlots.party.map((item) => ({ ...item })),
      npc: map.tokenSlots.npc.map((item) => ({ ...item })),
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

function addIfMissing<T extends { id: string }>(collection: T[], nextItem: T) {
  if (!collection.some((item) => item.id === nextItem.id)) {
    collection.push(nextItem)
  }
}

function createPerimeterTerrain(theme: Encounter3DTheme, width: number, depth: number): Encounter3DTerrain[] {
  if (theme === "cavern") {
    return [
      { id: "auto-ridge-back", kind: "platform", x: 0, z: -depth / 2 + 0.8, y: 0.2, width: width - 1.6, depth: 1.6, height: 1.2, rotation: 0, color: "#4b4f58", label: "Rock ridge" },
      { id: "auto-ridge-left", kind: "platform", x: -width / 2 + 0.8, z: 0, y: 0.2, width: 1.6, depth: depth - 1.6, height: 1.2, rotation: 0, color: "#41454f", label: "Rock ridge" },
      { id: "auto-ridge-right", kind: "platform", x: width / 2 - 0.8, z: 0, y: 0.2, width: 1.6, depth: depth - 1.6, height: 1.2, rotation: 0, color: "#41454f", label: "Rock ridge" },
    ]
  }

  return [
    { id: "auto-wall-back", kind: "wall", x: 0, z: -depth / 2 + 0.35, y: 0, width: width - 0.8, depth: 0.7, height: 2.8, rotation: 0, color: theme === "wood" ? "#7a5230" : "#6c675f", label: "Perimeter wall" },
    { id: "auto-wall-left", kind: "wall", x: -width / 2 + 0.35, z: 0, y: 0, width: 0.7, depth: depth - 1.8, height: 2.6, rotation: 0, color: theme === "wood" ? "#6d4927" : "#686259", label: "Perimeter wall" },
    { id: "auto-wall-right", kind: "wall", x: width / 2 - 0.35, z: 0, y: 0, width: 0.7, depth: depth - 1.8, height: 2.6, rotation: 0, color: theme === "wood" ? "#6d4927" : "#686259", label: "Perimeter wall" },
  ]
}

function createAtmosphereProps(theme: Encounter3DTheme, width: number, depth: number): Encounter3DProp[] {
  const edgeZ = -depth / 2 + 1.8
  const flankZ = 1.6

  switch (theme) {
    case "snow":
      return [
        { id: "auto-tree-left", kind: "tree", x: -width / 2 + 2.2, z: flankZ, y: 0, scale: 1.4, rotation: 0.3, color: "#7ba05b", label: "Evergreen" },
        { id: "auto-tree-right", kind: "tree", x: width / 2 - 2.2, z: flankZ, y: 0, scale: 1.4, rotation: -0.3, color: "#7ba05b", label: "Evergreen" },
        { id: "auto-rock-center", kind: "rock", x: 0, z: edgeZ + 2, y: 0, scale: 1.3, rotation: 0.4, color: "#c9d3de", label: "Snow drift" },
      ]
    case "sand":
      return [
        { id: "auto-obelisk-left", kind: "pillar", x: -width / 2 + 2.4, z: edgeZ, y: 0, scale: 1.2, rotation: 0.2, color: "#d0b484", label: "Weathered obelisk" },
        { id: "auto-obelisk-right", kind: "pillar", x: width / 2 - 2.4, z: edgeZ, y: 0, scale: 1.2, rotation: -0.2, color: "#d0b484", label: "Weathered obelisk" },
        { id: "auto-altar-center", kind: "altar", x: 0, z: 0.8, y: 0, scale: 1, rotation: 0, color: "#bfa477", label: "Stone marker" },
      ]
    case "cavern":
      return [
        { id: "auto-rock-left", kind: "rock", x: -width / 2 + 2.2, z: edgeZ + 1, y: 0, scale: 1.3, rotation: 0.2, color: "#727785", label: "Boulder" },
        { id: "auto-rock-right", kind: "rock", x: width / 2 - 2.2, z: edgeZ + 1, y: 0, scale: 1.3, rotation: -0.2, color: "#727785", label: "Boulder" },
        { id: "auto-torch-center", kind: "torch", x: 0, z: edgeZ + 2.6, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Brazer" },
      ]
    case "wood":
      return [
        { id: "auto-banner-left", kind: "banner", x: -width / 2 + 1.2, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#9c6644", label: "Banner" },
        { id: "auto-banner-right", kind: "banner", x: width / 2 - 1.2, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#9c6644", label: "Banner" },
        { id: "auto-table-center", kind: "table", x: 0, z: edgeZ + 2.2, y: 0, scale: 1, rotation: 0, color: "#7b4f2c", label: "Checkpoint table" },
      ]
    case "dirt":
      return [
        { id: "auto-crate-left", kind: "crate", x: -2.6, z: 1.4, y: 0, scale: 1, rotation: 0.2, color: "#9c5f28", label: "Supply crate" },
        { id: "auto-crate-right", kind: "crate", x: 2.6, z: -0.4, y: 0, scale: 1.1, rotation: -0.2, color: "#8d5524", label: "Supply crate" },
        { id: "auto-torch-left", kind: "torch", x: -width / 2 + 1.6, z: edgeZ + 0.8, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
        { id: "auto-torch-right", kind: "torch", x: width / 2 - 1.6, z: edgeZ + 0.8, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
      ]
    case "stone":
    default:
      return [
        { id: "auto-banner-left", kind: "banner", x: -width / 2 + 1.1, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#8c2f39", label: "House banner" },
        { id: "auto-banner-right", kind: "banner", x: width / 2 - 1.1, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#8c2f39", label: "House banner" },
        { id: "auto-torch-left", kind: "torch", x: -width / 2 + 1.8, z: flankZ, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
        { id: "auto-torch-right", kind: "torch", x: width / 2 - 1.8, z: flankZ, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
        { id: "auto-table-center", kind: "table", x: 0, z: edgeZ + 2.3, y: 0, scale: 1, rotation: 0, color: "#6f4e37", label: "Checkpoint table" },
      ]
  }
}

function createScatterProps(theme: Encounter3DTheme): Encounter3DProp[] {
  switch (theme) {
    case "cavern":
      return [
        { id: "auto-scatter-rock-1", kind: "rock", x: -2.5, z: 2.3, y: 0, scale: 1, rotation: 0.3, color: "#70757f", label: "Rock cover" },
        { id: "auto-scatter-rock-2", kind: "rock", x: 2.9, z: -1.7, y: 0, scale: 0.9, rotation: -0.4, color: "#70757f", label: "Rock cover" },
      ]
    case "snow":
      return [
        { id: "auto-scatter-rock-1", kind: "rock", x: -2.1, z: 1.8, y: 0, scale: 0.9, rotation: 0.2, color: "#cfd7df", label: "Snowy rock" },
        { id: "auto-scatter-rock-2", kind: "rock", x: 2.6, z: -1.8, y: 0, scale: 0.9, rotation: -0.3, color: "#cfd7df", label: "Snowy rock" },
      ]
    default:
      return [
        { id: "auto-scatter-crate-1", kind: "crate", x: -2.4, z: 1.8, y: 0, scale: 0.9, rotation: 0.2, color: "#99602b", label: "Cover crate" },
        { id: "auto-scatter-crate-2", kind: "crate", x: 2.8, z: -1.6, y: 0, scale: 1, rotation: -0.2, color: "#8f5726", label: "Cover crate" },
      ]
  }
}

function createDefaultPartySlots(maxPartySize: number, depth: number): Encounter3DPartySlot[] {
  return Array.from({ length: Math.max(maxPartySize, 0) }, (_, index) => ({
    id: `auto-party-${index + 1}`,
    slotIndex: index,
    x: (index % 3) - 1 + (index >= 3 ? 0.5 : 0),
    y: 0,
    z: depth / 2 - 3.2 - Math.floor(index / 3) * 1.2,
    facing: 0,
  }))
}

function createDefaultNpcSlots(npcIds: string[], depth: number): Encounter3DNpcSlot[] {
  return npcIds.map((npcId, index) => ({
    id: `auto-npc-${index + 1}`,
    npcId,
    x: (index % 3) - 1 + (index >= 3 ? 0.5 : 0),
    y: 0,
    z: -depth / 2 + 3 + Math.floor(index / 3) * 1.1,
    facing: Math.PI,
  }))
}

export function enhanceEncounterMap(
  map: Encounter3DMap,
  options?: {
    maxPartySize?: number
    npcIds?: string[]
  }
) {
  const next = cloneEncounterMap(map)
  const width = next.board.width * next.board.cellSize
  const depth = next.board.depth * next.board.cellSize

  const hasPerimeterTreatment =
    next.terrain.some((item) => item.id.startsWith("auto-wall") || item.id.startsWith("auto-ridge")) ||
    next.terrain.filter((item) => item.kind === "wall").length >= 2

  if (!hasPerimeterTreatment) {
    for (const terrain of createPerimeterTerrain(next.board.theme, width, depth)) {
      addIfMissing(next.terrain, terrain)
    }
  }

  if (next.props.length < 4) {
    for (const prop of createAtmosphereProps(next.board.theme, width, depth)) {
      addIfMissing(next.props, prop)
    }
  }

  if (next.props.length < 6) {
    for (const prop of createScatterProps(next.board.theme)) {
      addIfMissing(next.props, prop)
    }
  }

  if (next.tokenSlots.party.length === 0 && options?.maxPartySize) {
    next.tokenSlots.party = createDefaultPartySlots(options.maxPartySize, depth)
  }

  if (next.tokenSlots.npc.length === 0 && options?.npcIds?.length) {
    next.tokenSlots.npc = createDefaultNpcSlots(options.npcIds, depth)
  }

  return next
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
