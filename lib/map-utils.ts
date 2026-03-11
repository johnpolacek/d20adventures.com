import type {
  AdventureEncounter,
  AdventurePlan,
  AdventureSection,
  Encounter3DMap,
  Encounter3DNpcSlot,
  Encounter3DPartySlot,
  Encounter3DProp,
  Encounter3DPropKind,
  Encounter3DSceneKit,
  Encounter3DTerrain,
  Encounter3DTerrainKind,
  Encounter3DTheme,
} from "@/types/adventure-plan"

const DEFAULT_THEME: Encounter3DTheme = "stone"
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
  const text = [
    args.sectionTitle,
    args.sceneTitle,
    args.encounterTitle,
    args.encounterIntro,
    args.encounterInstructions,
    ...(args.encounterNpcBehaviors || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  const score = (keywords: string[], penalty: string[] = []) =>
    clampScore(
      keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 2 : 0), 0) -
        penalty.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0)
    )

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

export function inferThemeForSceneKit(sceneKit: Encounter3DSceneKit): Encounter3DTheme {
  switch (sceneKit) {
    case "camp":
    case "road":
      return "dirt"
    case "cavern":
      return "cavern"
    case "checkpoint":
      return "wood"
    case "city_gate":
      return "stone"
    case "shrine":
    case "crypt":
    case "courtyard":
    case "ruins":
    case "generic":
    default:
      return DEFAULT_THEME
  }
}

export function formatEncounterSceneKit(sceneKit: Encounter3DSceneKit) {
  switch (sceneKit) {
    case "checkpoint":
      return "Gate checkpoint"
    case "city_gate":
      return "City gate"
    case "courtyard":
      return "Courtyard"
    case "ruins":
      return "Ruins"
    case "shrine":
      return "Shrine"
    case "camp":
      return "Camp"
    case "road":
      return "Road / ambush"
    case "crypt":
      return "Crypt"
    case "cavern":
      return "Cavern"
    case "generic":
    default:
      return "Generic"
  }
}

export function createDefaultEncounterMap(
  summary = "",
  options?: {
    theme?: Encounter3DTheme
    sceneKit?: Encounter3DSceneKit
  }
): Encounter3DMap {
  const sceneKit = options?.sceneKit || DEFAULT_SCENE_KIT
  const theme = options?.theme || inferThemeForSceneKit(sceneKit)
  return {
    version: 1,
    summary,
    promptHistory: [],
    sceneKit,
    board: {
      width: 12,
      depth: 12,
      cellSize: 1,
      theme,
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

export function resolveEncounterMapSceneKit(map: Encounter3DMap): Encounter3DSceneKit {
  if (map.sceneKit === "city_gate") {
    return "city_gate"
  }

  const hasCityGateIds =
    map.terrain.some((item) => item.id.includes("city-gate")) || map.props.some((item) => item.id.includes("city-gate"))

  if (hasCityGateIds) {
    return "city_gate"
  }

  const inferredFromText = inferEncounterSceneKit({
    encounterTitle: map.summary,
    encounterIntro: map.promptHistory.join(" "),
  })

  if (inferredFromText === "city_gate" && (map.sceneKit === "generic" || map.sceneKit === "checkpoint")) {
    return "city_gate"
  }

  return map.sceneKit || DEFAULT_SCENE_KIT
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
      return {
        floor: "#7c5b3e",
        edge: "#473221",
        accent: "#b78650",
        frame: "#2b1e16",
        rim: "#8c6b4b",
        backdrop: "#342720",
        haze: "#261b15",
        grid: "#f4e4c6",
      }
    case "wood":
      return {
        floor: "#9a6934",
        edge: "#5c371d",
        accent: "#d7b27b",
        frame: "#2f1a10",
        rim: "#b17a46",
        backdrop: "#2c1a11",
        haze: "#1f130c",
        grid: "#f2dfbf",
      }
    case "cavern":
      return {
        floor: "#626672",
        edge: "#31343d",
        accent: "#99a0ae",
        frame: "#16181d",
        rim: "#515866",
        backdrop: "#1a1f28",
        haze: "#12161d",
        grid: "#dbe4f6",
      }
    case "sand":
      return {
        floor: "#ceb487",
        edge: "#8f7553",
        accent: "#efd9a1",
        frame: "#463626",
        rim: "#bd9c6e",
        backdrop: "#433223",
        haze: "#2c2015",
        grid: "#f7e9c4",
      }
    case "snow":
      return {
        floor: "#dce8f1",
        edge: "#97aab6",
        accent: "#f8fbff",
        frame: "#384956",
        rim: "#c2d0dc",
        backdrop: "#273540",
        haze: "#19222d",
        grid: "#ffffff",
      }
    case "stone":
    default:
      return {
        floor: "#817a72",
        edge: "#4b443f",
        accent: "#bb9470",
        frame: "#241d18",
        rim: "#6a5d51",
        backdrop: "#2a221d",
        haze: "#1a1411",
        grid: "#f4ead6",
      }
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
    case "wagon":
      return { scale: 1.2 }
    case "stall":
      return { scale: 1.15 }
    case "barrel":
      return { scale: 0.82 }
    case "post":
      return { scale: 0.9 }
    default:
      return { scale: 1 }
  }
}

function addIfMissing<T extends { id: string }>(collection: T[], nextItem: T) {
  if (!collection.some((item) => item.id === nextItem.id)) {
    collection.push(nextItem)
  }
}

function createSceneKitTerrain(sceneKit: Encounter3DSceneKit, theme: Encounter3DTheme, width: number, depth: number): Encounter3DTerrain[] {
  const palette = getThemePalette(theme)
  const backline = -depth / 2 + 2.2

  switch (sceneKit) {
    case "checkpoint":
      return [
        { id: "auto-kit-checkpoint-tower-left", kind: "wall", x: -3.4, z: backline + 0.1, y: 0, width: 1.8, depth: 2.6, height: 3.2, rotation: 0, color: palette.edge, label: "Gate tower" },
        { id: "auto-kit-checkpoint-tower-right", kind: "wall", x: 3.4, z: backline + 0.1, y: 0, width: 1.8, depth: 2.6, height: 3.2, rotation: 0, color: palette.edge, label: "Gate tower" },
        { id: "auto-kit-checkpoint-bridge", kind: "ramp", x: 0, z: backline - 0.2, y: 0, width: 3.8, depth: 1.5, height: 1.1, rotation: 0, color: palette.floor, label: "Gate bridge" },
        { id: "auto-kit-checkpoint-platform", kind: "dais", x: 1.7, z: -0.1, y: 0, width: 2.2, depth: 1.5, height: 0.26, rotation: 0.08, color: palette.accent, label: "Inspection platform" },
      ]
    case "city_gate":
      return [
        { id: "auto-kit-city-gate-bridge", kind: "ramp", x: 0, z: backline - 0.18, y: 0, width: 5.4, depth: 2.3, height: 1.25, rotation: 0, color: palette.floor, label: "Gate threshold" },
        { id: "auto-kit-city-gate-platform-left", kind: "dais", x: -2.35, z: 0.25, y: 0, width: 1.7, depth: 1.1, height: 0.2, rotation: 0.04, color: palette.accent, label: "Guard post" },
        { id: "auto-kit-city-gate-platform-right", kind: "dais", x: 2.35, z: 0.15, y: 0, width: 1.7, depth: 1.1, height: 0.2, rotation: -0.04, color: palette.accent, label: "Guard post" },
        { id: "auto-kit-city-gate-market-left", kind: "platform", x: -3.45, z: 1.8, y: 0, width: 2.15, depth: 1.34, height: 0.12, rotation: 0.04, color: palette.rim, label: "Merchant pad" },
        { id: "auto-kit-city-gate-market-right", kind: "platform", x: 3.35, z: 1.48, y: 0, width: 2.05, depth: 1.28, height: 0.12, rotation: -0.04, color: palette.rim, label: "Merchant pad" },
      ]
    case "courtyard":
      return [
        { id: "auto-kit-courtyard-dais", kind: "dais", x: 0, z: backline, y: 0, width: 4.8, depth: 2.5, height: 0.48, rotation: 0, color: palette.accent, label: "Rear dais" },
        { id: "auto-kit-courtyard-arcade-left", kind: "wall", x: -3.2, z: -0.8, y: 0, width: 1, depth: depth - 5.6, height: 1.8, rotation: 0.02, color: palette.floor, label: "Colonnade" },
        { id: "auto-kit-courtyard-arcade-right", kind: "wall", x: 3.2, z: 0.6, y: 0, width: 1, depth: depth - 5.8, height: 1.8, rotation: -0.02, color: palette.floor, label: "Colonnade" },
        { id: "auto-kit-courtyard-plinth", kind: "platform", x: 0.4, z: 1.3, y: 0, width: 2, depth: 1.4, height: 0.22, rotation: 0.1, color: palette.rim, label: "Center plinth" },
      ]
    case "ruins":
      return [
        { id: "auto-kit-ruins-wall-left", kind: "wall", x: -3.1, z: -0.4, y: 0, width: 1, depth: 4.6, height: 1.8, rotation: 0.16, color: palette.edge, label: "Broken wall" },
        { id: "auto-kit-ruins-wall-right", kind: "wall", x: 2.5, z: 0.9, y: 0, width: 1, depth: 3.8, height: 1.5, rotation: -0.22, color: palette.edge, label: "Broken wall" },
        { id: "auto-kit-ruins-plinth", kind: "platform", x: -0.4, z: 1.5, y: 0, width: 2.1, depth: 1.2, height: 0.24, rotation: -0.14, color: palette.floor, label: "Collapsed plinth" },
        { id: "auto-kit-ruins-dais", kind: "dais", x: 2.1, z: -1.9, y: 0, width: 1.9, depth: 1.2, height: 0.22, rotation: 0.2, color: palette.accent, label: "Broken step" },
      ]
    case "shrine":
      return [
        { id: "auto-kit-shrine-dais", kind: "dais", x: 0, z: backline, y: 0, width: 4.2, depth: 2.2, height: 0.55, rotation: 0, color: palette.accent, label: "Shrine dais" },
        { id: "auto-kit-shrine-approach", kind: "platform", x: 0, z: -0.2, y: 0, width: 2.2, depth: depth - 5, height: 0.1, rotation: 0, color: palette.floor, label: "Processional path" },
        { id: "auto-kit-shrine-plinth-left", kind: "platform", x: -2.5, z: 0.8, y: 0, width: 1.6, depth: 1.2, height: 0.24, rotation: 0.12, color: palette.rim, label: "Offering plinth" },
        { id: "auto-kit-shrine-plinth-right", kind: "platform", x: 2.3, z: -0.6, y: 0, width: 1.6, depth: 1.2, height: 0.24, rotation: -0.14, color: palette.rim, label: "Offering plinth" },
      ]
    case "camp":
      return [
        { id: "auto-kit-camp-command", kind: "platform", x: -2.2, z: backline + 0.6, y: 0, width: 3, depth: 2.1, height: 0.18, rotation: -0.08, color: palette.accent, label: "Command ground" },
        { id: "auto-kit-camp-barricade-left", kind: "wall", x: -0.6, z: 1.1, y: 0, width: 2.2, depth: 0.55, height: 0.72, rotation: 0.22, color: palette.edge, label: "Camp barricade" },
        { id: "auto-kit-camp-barricade-right", kind: "wall", x: 2.6, z: -0.8, y: 0, width: 2.1, depth: 0.55, height: 0.72, rotation: -0.18, color: palette.edge, label: "Camp barricade" },
        { id: "auto-kit-camp-lane", kind: "platform", x: 1.2, z: 0.2, y: 0, width: 2.5, depth: 1.2, height: 0.12, rotation: -0.08, color: palette.floor, label: "Trampled lane" },
      ]
    case "road":
      return [
        { id: "auto-kit-road-lane", kind: "platform", x: 0, z: 0, y: 0, width: 3.6, depth: depth - 2.8, height: 0.12, rotation: 0.02, color: palette.accent, label: "Road lane" },
        { id: "auto-kit-road-bank-left", kind: "platform", x: -3.1, z: 0.5, y: 0, width: 2.1, depth: depth - 4.2, height: 0.3, rotation: 0.08, color: palette.edge, label: "Road bank" },
        { id: "auto-kit-road-bank-right", kind: "platform", x: 3, z: -0.4, y: 0, width: 2.1, depth: depth - 4.2, height: 0.3, rotation: -0.08, color: palette.edge, label: "Road bank" },
        { id: "auto-kit-road-choke", kind: "wall", x: 1.5, z: 1.3, y: 0, width: 2.2, depth: 0.55, height: 0.7, rotation: -0.24, color: palette.floor, label: "Ambush barricade" },
      ]
    case "crypt":
      return [
        { id: "auto-kit-crypt-sarcophagus", kind: "dais", x: 0, z: backline, y: 0, width: 3.2, depth: 1.9, height: 0.52, rotation: 0, color: palette.floor, label: "Stone tomb" },
        { id: "auto-kit-crypt-aisle-left", kind: "wall", x: -2.8, z: 0.3, y: 0, width: 1, depth: depth - 5.4, height: 1.4, rotation: 0.04, color: palette.edge, label: "Tomb aisle" },
        { id: "auto-kit-crypt-aisle-right", kind: "wall", x: 2.8, z: -0.2, y: 0, width: 1, depth: depth - 5.4, height: 1.4, rotation: -0.04, color: palette.edge, label: "Tomb aisle" },
        { id: "auto-kit-crypt-step", kind: "platform", x: 0.5, z: 1.8, y: 0, width: 2, depth: 1.3, height: 0.16, rotation: 0.08, color: palette.rim, label: "Burial step" },
      ]
    case "cavern":
      return [
        { id: "auto-kit-cavern-arch-left", kind: "platform", x: -3.2, z: backline + 0.4, y: 0.1, width: 2.4, depth: 2.8, height: 1.2, rotation: 0.18, color: palette.edge, label: "Rock arch" },
        { id: "auto-kit-cavern-arch-right", kind: "platform", x: 3, z: backline, y: 0.1, width: 2.2, depth: 2.8, height: 1.1, rotation: -0.18, color: palette.edge, label: "Rock arch" },
        { id: "auto-kit-cavern-shelf", kind: "dais", x: 0.4, z: 1.2, y: 0, width: 2.4, depth: 1.5, height: 0.42, rotation: 0.1, color: palette.floor, label: "Rock shelf" },
        { id: "auto-kit-cavern-spur", kind: "platform", x: -1.8, z: -0.8, y: 0, width: 2, depth: 1.4, height: 0.38, rotation: -0.16, color: palette.rim, label: "Rock spur" },
      ]
    case "generic":
    default:
      return []
  }
}

function createSceneKitProps(sceneKit: Encounter3DSceneKit, theme: Encounter3DTheme, width: number, depth: number): Encounter3DProp[] {
  const palette = getThemePalette(theme)
  const backline = -depth / 2 + 2.6

  switch (sceneKit) {
    case "checkpoint":
      return [
        { id: "auto-kit-checkpoint-banner-left", kind: "banner", x: -1.6, z: backline + 0.1, y: 0, scale: 0.92, rotation: 0, color: palette.accent, label: "Checkpoint banner" },
        { id: "auto-kit-checkpoint-banner-right", kind: "banner", x: 1.6, z: backline + 0.2, y: 0, scale: 0.92, rotation: 0, color: palette.accent, label: "Checkpoint banner" },
        { id: "auto-kit-checkpoint-table", kind: "table", x: 1.8, z: -0.5, y: 0, scale: 0.92, rotation: 0.1, color: palette.rim, label: "Inspection table" },
        { id: "auto-kit-checkpoint-crate", kind: "crate", x: -2, z: 0.8, y: 0, scale: 1.02, rotation: -0.12, color: palette.accent, label: "Supply crate" },
      ]
    case "city_gate":
      return [
        { id: "auto-kit-city-gate-banner-left", kind: "banner", x: -1.95, z: backline + 0.25, y: 0, scale: 1.26, rotation: 0.02, color: palette.accent, label: "Gate banner" },
        { id: "auto-kit-city-gate-banner-right", kind: "banner", x: 1.95, z: backline + 0.25, y: 0, scale: 1.26, rotation: -0.02, color: palette.accent, label: "Gate banner" },
        { id: "auto-kit-city-gate-banner-tower-left", kind: "banner", x: -4.45, z: backline + 1.28, y: 0, scale: 1.02, rotation: 0.06, color: palette.accent, label: "Tower standard" },
        { id: "auto-kit-city-gate-banner-tower-right", kind: "banner", x: 4.45, z: backline + 1.2, y: 0, scale: 1.02, rotation: -0.06, color: palette.accent, label: "Tower standard" },
        { id: "auto-kit-city-gate-guard-table-left", kind: "table", x: -1.55, z: 0.48, y: 0, scale: 1.02, rotation: 0.04, color: palette.rim, label: "Customs desk" },
        { id: "auto-kit-city-gate-guard-table-right", kind: "table", x: 1.95, z: 0.28, y: 0, scale: 1.08, rotation: -0.04, color: palette.rim, label: "Ledger station" },
        { id: "auto-kit-city-gate-wagon-left", kind: "wagon", x: -3.7, z: 1.62, y: 0, scale: 1.18, rotation: 0.1, color: palette.accent, label: "Merchant wagon" },
        { id: "auto-kit-city-gate-wagon-right", kind: "wagon", x: 3.5, z: 1.42, y: 0, scale: 1.12, rotation: -0.12, color: palette.accent, label: "Supply wagon" },
        { id: "auto-kit-city-gate-stall-left", kind: "stall", x: -2.45, z: 1.24, y: 0, scale: 1.08, rotation: 0.04, color: palette.accent, label: "Market awning" },
        { id: "auto-kit-city-gate-stall-right", kind: "stall", x: 2.5, z: 1.08, y: 0, scale: 1.06, rotation: -0.06, color: palette.accent, label: "Cloth stall" },
        { id: "auto-kit-city-gate-barrel-left", kind: "barrel", x: -2.82, z: 0.62, y: 0, scale: 0.88, rotation: 0.08, color: palette.rim, label: "Barrel stack" },
        { id: "auto-kit-city-gate-barrel-right", kind: "barrel", x: 2.65, z: 0.52, y: 0, scale: 0.84, rotation: -0.06, color: palette.rim, label: "Barrel stack" },
        { id: "auto-kit-city-gate-post-left", kind: "post", x: -4.3, z: 2.1, y: 0, scale: 0.96, rotation: 0, color: palette.rim, label: "Hitching post" },
        { id: "auto-kit-city-gate-post-right", kind: "post", x: 4.05, z: 1.92, y: 0, scale: 0.96, rotation: 0, color: palette.rim, label: "Queue post" },
        { id: "auto-kit-city-gate-torch-left", kind: "torch", x: -1.3, z: 0.1, y: 0, scale: 1, rotation: 0, color: "#efc65b", label: "Gate torch" },
        { id: "auto-kit-city-gate-torch-right", kind: "torch", x: 1.3, z: 0.1, y: 0, scale: 1, rotation: 0, color: "#efc65b", label: "Gate torch" },
      ]
    case "courtyard":
      return [
        { id: "auto-kit-courtyard-statue-left", kind: "statue", x: -3.1, z: backline + 0.4, y: 0, scale: 0.92, rotation: 0, color: palette.accent, label: "Court marker" },
        { id: "auto-kit-courtyard-statue-right", kind: "statue", x: 3.1, z: backline + 0.3, y: 0, scale: 0.92, rotation: 0, color: palette.accent, label: "Court marker" },
        { id: "auto-kit-courtyard-banner-left", kind: "banner", x: -1.6, z: backline, y: 0, scale: 0.86, rotation: 0.04, color: palette.accent, label: "Court banner" },
        { id: "auto-kit-courtyard-banner-right", kind: "banner", x: 1.6, z: backline + 0.2, y: 0, scale: 0.86, rotation: -0.04, color: palette.accent, label: "Court banner" },
      ]
    case "ruins":
      return [
        { id: "auto-kit-ruins-pillar-left", kind: "pillar", x: -2.3, z: -1.6, y: 0, scale: 0.92, rotation: 0.14, color: palette.floor, label: "Broken pillar" },
        { id: "auto-kit-ruins-pillar-right", kind: "pillar", x: 2.4, z: 1.9, y: 0, scale: 0.84, rotation: -0.12, color: palette.floor, label: "Broken pillar" },
        { id: "auto-kit-ruins-rubble-left", kind: "rock", x: -0.8, z: 2.1, y: 0, scale: 0.95, rotation: 0.2, color: palette.edge, label: "Rubble pile" },
        { id: "auto-kit-ruins-rubble-right", kind: "rock", x: 2.1, z: -2, y: 0, scale: 1.02, rotation: -0.14, color: palette.edge, label: "Rubble pile" },
      ]
    case "shrine":
      return [
        { id: "auto-kit-shrine-altar", kind: "altar", x: 0, z: backline + 0.1, y: 0, scale: 0.94, rotation: 0, color: palette.accent, label: "Shrine altar" },
        { id: "auto-kit-shrine-banner-left", kind: "banner", x: -2.2, z: backline + 0.3, y: 0, scale: 0.88, rotation: 0.08, color: palette.accent, label: "Ritual banner" },
        { id: "auto-kit-shrine-banner-right", kind: "banner", x: 2.2, z: backline + 0.3, y: 0, scale: 0.88, rotation: -0.08, color: palette.accent, label: "Ritual banner" },
        { id: "auto-kit-shrine-torch-left", kind: "torch", x: -1.1, z: 0.4, y: 0, scale: 0.96, rotation: 0, color: "#efc65b", label: "Ceremonial torch" },
      ]
    case "camp":
      return [
        { id: "auto-kit-camp-table", kind: "table", x: -2.1, z: backline + 0.4, y: 0, scale: 1, rotation: -0.08, color: palette.rim, label: "Command table" },
        { id: "auto-kit-camp-crate-1", kind: "crate", x: -0.6, z: 2.1, y: 0, scale: 1.02, rotation: 0.18, color: palette.accent, label: "Supply stack" },
        { id: "auto-kit-camp-crate-2", kind: "crate", x: 2.6, z: -1.4, y: 0, scale: 0.94, rotation: -0.16, color: palette.accent, label: "Supply stack" },
        { id: "auto-kit-camp-banner", kind: "banner", x: 0.5, z: backline + 0.2, y: 0, scale: 0.84, rotation: 0.04, color: palette.accent, label: "Camp standard" },
      ]
    case "road":
      return [
        { id: "auto-kit-road-tree-left", kind: "tree", x: -4.2, z: 2.1, y: 0, scale: 0.94, rotation: 0.18, color: "#78965e", label: "Roadside tree" },
        { id: "auto-kit-road-tree-right", kind: "tree", x: 4, z: -1.8, y: 0, scale: 0.9, rotation: -0.16, color: "#78965e", label: "Roadside tree" },
        { id: "auto-kit-road-rock", kind: "rock", x: 2.6, z: 0.8, y: 0, scale: 0.92, rotation: 0.12, color: palette.edge, label: "Roadside rock" },
        { id: "auto-kit-road-crate", kind: "crate", x: -1.8, z: -1.4, y: 0, scale: 0.88, rotation: -0.18, color: palette.accent, label: "Abandoned cargo" },
      ]
    case "crypt":
      return [
        { id: "auto-kit-crypt-statue-left", kind: "statue", x: -2.1, z: backline + 0.3, y: 0, scale: 0.86, rotation: 0.06, color: palette.rim, label: "Funerary statue" },
        { id: "auto-kit-crypt-statue-right", kind: "statue", x: 2.1, z: backline + 0.2, y: 0, scale: 0.86, rotation: -0.06, color: palette.rim, label: "Funerary statue" },
        { id: "auto-kit-crypt-torch-left", kind: "torch", x: -1.4, z: 0.7, y: 0, scale: 0.92, rotation: 0, color: "#efc65b", label: "Grave torch" },
        { id: "auto-kit-crypt-torch-right", kind: "torch", x: 1.5, z: 0.5, y: 0, scale: 0.92, rotation: 0, color: "#efc65b", label: "Grave torch" },
      ]
    case "cavern":
      return [
        { id: "auto-kit-cavern-rock-left", kind: "rock", x: -2.5, z: 2.1, y: 0, scale: 1.08, rotation: 0.2, color: palette.rim, label: "Boulder cluster" },
        { id: "auto-kit-cavern-rock-right", kind: "rock", x: 2.8, z: -1.9, y: 0, scale: 1.02, rotation: -0.18, color: palette.rim, label: "Boulder cluster" },
        { id: "auto-kit-cavern-torch", kind: "torch", x: 0.7, z: backline + 0.3, y: 0, scale: 0.9, rotation: 0, color: "#efc65b", label: "Wall torch" },
      ]
    case "generic":
    default:
      return []
  }
}

function createPerimeterTerrain(sceneKit: Encounter3DSceneKit, theme: Encounter3DTheme, width: number, depth: number): Encounter3DTerrain[] {
  if (theme === "cavern") {
    return [
      { id: "auto-ridge-back", kind: "platform", x: 0, z: -depth / 2 + 0.8, y: 0.2, width: width - 1.6, depth: 1.6, height: 1.2, rotation: 0, color: "#4b4f58", label: "Rock ridge" },
      { id: "auto-ridge-left", kind: "platform", x: -width / 2 + 0.8, z: 0, y: 0.2, width: 1.6, depth: depth - 1.6, height: 1.2, rotation: 0, color: "#41454f", label: "Rock ridge" },
      { id: "auto-ridge-right", kind: "platform", x: width / 2 - 0.8, z: 0, y: 0.2, width: 1.6, depth: depth - 1.6, height: 1.2, rotation: 0, color: "#41454f", label: "Rock ridge" },
      { id: "auto-ridge-front-left", kind: "platform", x: -width / 2 + 1.5, z: depth / 2 - 1.2, y: 0.15, width: 2.4, depth: 1.8, height: 0.9, rotation: 0, color: "#3f434b", label: "Rock shelf" },
      { id: "auto-ridge-front-right", kind: "platform", x: width / 2 - 1.5, z: depth / 2 - 1.2, y: 0.15, width: 2.4, depth: 1.8, height: 0.9, rotation: 0, color: "#3f434b", label: "Rock shelf" },
    ]
  }

  if (sceneKit === "checkpoint") {
    return [
      { id: "auto-wall-back", kind: "wall", x: 0, z: -depth / 2 + 0.35, y: 0, width: width - 1.6, depth: 0.7, height: 2.4, rotation: 0, color: theme === "wood" ? "#7a5230" : "#6c675f", label: "Rear fortification" },
      { id: "auto-wall-left", kind: "wall", x: -width / 2 + 0.8, z: -depth / 2 + 2.3, y: 0, width: 1.2, depth: 3.1, height: 2.3, rotation: 0, color: theme === "wood" ? "#6d4927" : "#686259", label: "Gate flank" },
      { id: "auto-wall-right", kind: "wall", x: width / 2 - 0.8, z: -depth / 2 + 2.3, y: 0, width: 1.2, depth: 3.1, height: 2.3, rotation: 0, color: theme === "wood" ? "#6d4927" : "#686259", label: "Gate flank" },
      { id: "auto-wall-front-left", kind: "wall", x: -width / 2 + 1.6, z: depth / 2 - 0.6, y: 0, width: 2.1, depth: 0.7, height: 0.9, rotation: 0.06, color: theme === "wood" ? "#7a5230" : "#736d66", label: "Approach barricade" },
      { id: "auto-wall-front-right", kind: "wall", x: width / 2 - 1.6, z: depth / 2 - 0.6, y: 0, width: 2.1, depth: 0.7, height: 0.9, rotation: -0.06, color: theme === "wood" ? "#7a5230" : "#736d66", label: "Approach barricade" },
    ]
  }

  if (sceneKit === "city_gate") {
    return []
  }

  if (sceneKit === "camp" || sceneKit === "road" || sceneKit === "ruins") {
    return [
      { id: "auto-wall-back", kind: "wall", x: 0, z: -depth / 2 + 0.45, y: 0, width: width - 1.2, depth: 0.7, height: 1.6, rotation: 0, color: theme === "wood" ? "#7a5230" : "#6c675f", label: "Rear boundary" },
      { id: "auto-wall-left", kind: "wall", x: -width / 2 + 1.2, z: 0.8, y: 0, width: 1.2, depth: 4.8, height: 1.2, rotation: 0.18, color: theme === "wood" ? "#6d4927" : "#686259", label: "Flank cover" },
      { id: "auto-wall-right", kind: "wall", x: width / 2 - 1.2, z: -0.8, y: 0, width: 1.2, depth: 4.4, height: 1.2, rotation: -0.18, color: theme === "wood" ? "#6d4927" : "#686259", label: "Flank cover" },
      { id: "auto-wall-front-left", kind: "wall", x: -width / 2 + 1.7, z: depth / 2 - 0.6, y: 0, width: 2, depth: 0.7, height: 0.75, rotation: 0.08, color: theme === "wood" ? "#7a5230" : "#736d66", label: "Front cover" },
      { id: "auto-wall-front-right", kind: "wall", x: width / 2 - 1.7, z: depth / 2 - 0.6, y: 0, width: 2, depth: 0.7, height: 0.75, rotation: -0.08, color: theme === "wood" ? "#7a5230" : "#736d66", label: "Front cover" },
    ]
  }

  return [
    { id: "auto-wall-back", kind: "wall", x: 0, z: -depth / 2 + 0.35, y: 0, width: width - 0.8, depth: 0.7, height: 2.8, rotation: 0, color: theme === "wood" ? "#7a5230" : "#6c675f", label: "Perimeter wall" },
    { id: "auto-wall-left", kind: "wall", x: -width / 2 + 0.35, z: 0, y: 0, width: 0.7, depth: depth - 1.8, height: 2.6, rotation: 0, color: theme === "wood" ? "#6d4927" : "#686259", label: "Perimeter wall" },
    { id: "auto-wall-right", kind: "wall", x: width / 2 - 0.35, z: 0, y: 0, width: 0.7, depth: depth - 1.8, height: 2.6, rotation: 0, color: theme === "wood" ? "#6d4927" : "#686259", label: "Perimeter wall" },
    { id: "auto-wall-front-left", kind: "wall", x: -width / 2 + 1.5, z: depth / 2 - 0.4, y: 0, width: 2.2, depth: 0.7, height: 1.3, rotation: 0, color: theme === "wood" ? "#7a5230" : "#736d66", label: "Front barricade" },
    { id: "auto-wall-front-right", kind: "wall", x: width / 2 - 1.5, z: depth / 2 - 0.4, y: 0, width: 2.2, depth: 0.7, height: 1.3, rotation: 0, color: theme === "wood" ? "#7a5230" : "#736d66", label: "Front barricade" },
  ]
}

function createFocalTerrain(theme: Encounter3DTheme, width: number, depth: number): Encounter3DTerrain[] {
  const backline = -depth / 2 + 2.8

  switch (theme) {
    case "dirt":
      return [
        { id: "auto-focal-road", kind: "platform", x: 0, z: 0.6, y: 0, width: 3.4, depth: depth - 3.2, height: 0.14, rotation: 0, color: "#8d6846", label: "Packed road" },
        { id: "auto-focal-berm-left", kind: "platform", x: -width / 2 + 2.1, z: -0.4, y: 0, width: 2.3, depth: depth - 5, height: 0.42, rotation: 0, color: "#6b4e33", label: "Earth berm" },
        { id: "auto-focal-berm-right", kind: "platform", x: width / 2 - 2.1, z: 0.7, y: 0, width: 2.3, depth: depth - 5, height: 0.42, rotation: 0, color: "#6b4e33", label: "Earth berm" },
      ]
    case "wood":
      return [
        { id: "auto-focal-platform", kind: "dais", x: 0, z: backline, y: 0, width: 4.2, depth: 2.4, height: 0.5, rotation: 0, color: "#8d5d33", label: "Raised checkpoint" },
        { id: "auto-focal-lane-left", kind: "platform", x: -2.7, z: -0.4, y: 0, width: 2, depth: depth - 4.8, height: 0.12, rotation: 0, color: "#7b512f", label: "Boardwalk lane" },
        { id: "auto-focal-lane-right", kind: "platform", x: 2.7, z: 0.4, y: 0, width: 2, depth: depth - 4.8, height: 0.12, rotation: 0, color: "#7b512f", label: "Boardwalk lane" },
      ]
    case "cavern":
      return [
        { id: "auto-focal-shelf", kind: "dais", x: 0, z: backline, y: 0, width: 4.8, depth: 2.6, height: 0.7, rotation: 0, color: "#5b606c", label: "Stone shelf" },
        { id: "auto-focal-ledge-left", kind: "platform", x: -width / 2 + 2.6, z: 0.4, y: 0, width: 2.6, depth: depth - 5.4, height: 0.5, rotation: 0, color: "#4a4f58", label: "Ledge" },
        { id: "auto-focal-ledge-right", kind: "platform", x: width / 2 - 2.6, z: -0.3, y: 0, width: 2.6, depth: depth - 5.4, height: 0.5, rotation: 0, color: "#4a4f58", label: "Ledge" },
      ]
    case "sand":
      return [
        { id: "auto-focal-dais", kind: "dais", x: 0, z: backline, y: 0, width: 4.4, depth: 2.5, height: 0.55, rotation: 0, color: "#c9aa78", label: "Ceremonial dais" },
        { id: "auto-focal-ridge-left", kind: "platform", x: -width / 2 + 2.3, z: -0.2, y: 0, width: 2.2, depth: depth - 4.8, height: 0.3, rotation: 0, color: "#b89363", label: "Dune ridge" },
        { id: "auto-focal-ridge-right", kind: "platform", x: width / 2 - 2.3, z: 0.5, y: 0, width: 2.2, depth: depth - 4.8, height: 0.3, rotation: 0, color: "#b89363", label: "Dune ridge" },
      ]
    case "snow":
      return [
        { id: "auto-focal-ice-dais", kind: "dais", x: 0, z: backline, y: 0, width: 4.2, depth: 2.4, height: 0.45, rotation: 0, color: "#d4e4f2", label: "Frozen rise" },
        { id: "auto-focal-bank-left", kind: "platform", x: -width / 2 + 2.1, z: 0.2, y: 0, width: 2.2, depth: depth - 4.6, height: 0.28, rotation: 0, color: "#cedce7", label: "Snow bank" },
        { id: "auto-focal-bank-right", kind: "platform", x: width / 2 - 2.1, z: -0.5, y: 0, width: 2.2, depth: depth - 4.6, height: 0.28, rotation: 0, color: "#cedce7", label: "Snow bank" },
      ]
    case "stone":
    default:
      return [
        { id: "auto-focal-dais", kind: "dais", x: 0, z: backline, y: 0, width: 4.6, depth: 2.6, height: 0.55, rotation: 0, color: "#8c847a", label: "Command dais" },
        { id: "auto-focal-plinth-left", kind: "platform", x: -width / 2 + 2.1, z: -0.2, y: 0, width: 2.3, depth: depth - 5, height: 0.2, rotation: 0, color: "#726b62", label: "Stone run" },
        { id: "auto-focal-plinth-right", kind: "platform", x: width / 2 - 2.1, z: 0.5, y: 0, width: 2.3, depth: depth - 5, height: 0.2, rotation: 0, color: "#726b62", label: "Stone run" },
      ]
  }
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
        { id: "auto-statue-back", kind: "statue", x: 0, z: edgeZ + 0.4, y: 0, scale: 1.05, rotation: 0, color: "#e5edf4", label: "Frozen marker" },
      ]
    case "sand":
      return [
        { id: "auto-obelisk-left", kind: "pillar", x: -width / 2 + 2.4, z: edgeZ, y: 0, scale: 1.2, rotation: 0.2, color: "#d0b484", label: "Weathered obelisk" },
        { id: "auto-obelisk-right", kind: "pillar", x: width / 2 - 2.4, z: edgeZ, y: 0, scale: 1.2, rotation: -0.2, color: "#d0b484", label: "Weathered obelisk" },
        { id: "auto-altar-center", kind: "altar", x: 0, z: 0.8, y: 0, scale: 1, rotation: 0, color: "#bfa477", label: "Stone marker" },
        { id: "auto-banner-left", kind: "banner", x: -2.4, z: edgeZ + 1.8, y: 0, scale: 0.95, rotation: 0, color: "#9c6644", label: "Tattered standard" },
        { id: "auto-banner-right", kind: "banner", x: 2.4, z: edgeZ + 1.8, y: 0, scale: 0.95, rotation: 0, color: "#9c6644", label: "Tattered standard" },
      ]
    case "cavern":
      return [
        { id: "auto-rock-left", kind: "rock", x: -width / 2 + 2.2, z: edgeZ + 1, y: 0, scale: 1.3, rotation: 0.2, color: "#727785", label: "Boulder" },
        { id: "auto-rock-right", kind: "rock", x: width / 2 - 2.2, z: edgeZ + 1, y: 0, scale: 1.3, rotation: -0.2, color: "#727785", label: "Boulder" },
        { id: "auto-torch-center", kind: "torch", x: 0, z: edgeZ + 2.6, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Brazer" },
        { id: "auto-pillar-left", kind: "pillar", x: -2.6, z: edgeZ + 1.9, y: 0, scale: 1.1, rotation: 0.2, color: "#8f94a1", label: "Stone column" },
        { id: "auto-pillar-right", kind: "pillar", x: 2.6, z: edgeZ + 1.9, y: 0, scale: 1.1, rotation: -0.2, color: "#8f94a1", label: "Stone column" },
      ]
    case "wood":
      return [
        { id: "auto-banner-left", kind: "banner", x: -width / 2 + 1.2, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#9c6644", label: "Banner" },
        { id: "auto-banner-right", kind: "banner", x: width / 2 - 1.2, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#9c6644", label: "Banner" },
        { id: "auto-table-center", kind: "table", x: 0, z: edgeZ + 2.2, y: 0, scale: 1, rotation: 0, color: "#7b4f2c", label: "Checkpoint table" },
        { id: "auto-crate-left", kind: "crate", x: -2.5, z: 0.8, y: 0, scale: 1, rotation: 0.2, color: "#88512b", label: "Cargo stack" },
        { id: "auto-crate-right", kind: "crate", x: 2.6, z: -0.4, y: 0, scale: 1.05, rotation: -0.2, color: "#88512b", label: "Cargo stack" },
      ]
    case "dirt":
      return [
        { id: "auto-crate-left", kind: "crate", x: -2.6, z: 1.4, y: 0, scale: 1, rotation: 0.2, color: "#9c5f28", label: "Supply crate" },
        { id: "auto-crate-right", kind: "crate", x: 2.6, z: -0.4, y: 0, scale: 1.1, rotation: -0.2, color: "#8d5524", label: "Supply crate" },
        { id: "auto-torch-left", kind: "torch", x: -width / 2 + 1.6, z: edgeZ + 0.8, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
        { id: "auto-torch-right", kind: "torch", x: width / 2 - 1.6, z: edgeZ + 0.8, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
        { id: "auto-banner-center", kind: "banner", x: 0, z: edgeZ + 1.1, y: 0, scale: 0.95, rotation: 0, color: "#9d3a24", label: "Road sign" },
      ]
    case "stone":
    default:
      return [
        { id: "auto-banner-left", kind: "banner", x: -width / 2 + 1.1, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#8c2f39", label: "House banner" },
        { id: "auto-banner-right", kind: "banner", x: width / 2 - 1.1, z: edgeZ + 0.5, y: 0, scale: 1.1, rotation: 0, color: "#8c2f39", label: "House banner" },
        { id: "auto-torch-left", kind: "torch", x: -width / 2 + 1.8, z: flankZ, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
        { id: "auto-torch-right", kind: "torch", x: width / 2 - 1.8, z: flankZ, y: 0, scale: 1, rotation: 0, color: "#ffb703", label: "Torch" },
        { id: "auto-table-center", kind: "table", x: 0, z: edgeZ + 2.3, y: 0, scale: 1, rotation: 0, color: "#6f4e37", label: "Checkpoint table" },
        { id: "auto-statue-left", kind: "statue", x: -2.8, z: edgeZ + 1.7, y: 0, scale: 1.05, rotation: 0.1, color: "#bdb7ad", label: "Guardian statue" },
        { id: "auto-statue-right", kind: "statue", x: 2.8, z: edgeZ + 1.7, y: 0, scale: 1.05, rotation: -0.1, color: "#bdb7ad", label: "Guardian statue" },
      ]
  }
}

function createScatterProps(theme: Encounter3DTheme): Encounter3DProp[] {
  switch (theme) {
    case "cavern":
      return [
        { id: "auto-scatter-rock-1", kind: "rock", x: -2.5, z: 2.3, y: 0, scale: 1, rotation: 0.3, color: "#70757f", label: "Rock cover" },
        { id: "auto-scatter-rock-2", kind: "rock", x: 2.9, z: -1.7, y: 0, scale: 0.9, rotation: -0.4, color: "#70757f", label: "Rock cover" },
        { id: "auto-scatter-rock-3", kind: "rock", x: 0.8, z: 1.1, y: 0, scale: 0.8, rotation: 0.4, color: "#676c76", label: "Stone outcrop" },
        { id: "auto-scatter-rock-4", kind: "rock", x: -1.2, z: -2.2, y: 0, scale: 0.85, rotation: -0.2, color: "#676c76", label: "Stone outcrop" },
      ]
    case "snow":
      return [
        { id: "auto-scatter-rock-1", kind: "rock", x: -2.1, z: 1.8, y: 0, scale: 0.9, rotation: 0.2, color: "#cfd7df", label: "Snowy rock" },
        { id: "auto-scatter-rock-2", kind: "rock", x: 2.6, z: -1.8, y: 0, scale: 0.9, rotation: -0.3, color: "#cfd7df", label: "Snowy rock" },
        { id: "auto-scatter-rock-3", kind: "rock", x: 0.9, z: 1.2, y: 0, scale: 0.8, rotation: 0.1, color: "#d8e1e9", label: "Ice chunk" },
        { id: "auto-scatter-rock-4", kind: "rock", x: -1.4, z: -1.9, y: 0, scale: 0.8, rotation: -0.2, color: "#d8e1e9", label: "Ice chunk" },
      ]
    default:
      return [
        { id: "auto-scatter-crate-1", kind: "crate", x: -2.4, z: 1.8, y: 0, scale: 0.9, rotation: 0.2, color: "#99602b", label: "Cover crate" },
        { id: "auto-scatter-crate-2", kind: "crate", x: 2.8, z: -1.6, y: 0, scale: 1, rotation: -0.2, color: "#8f5726", label: "Cover crate" },
        { id: "auto-scatter-crate-3", kind: "crate", x: 1.2, z: 1.3, y: 0, scale: 0.8, rotation: 0.1, color: "#a56b31", label: "Cover crate" },
        { id: "auto-scatter-crate-4", kind: "crate", x: -0.8, z: -2.1, y: 0, scale: 0.85, rotation: -0.15, color: "#a56b31", label: "Cover crate" },
      ]
  }
}

function createMidfieldTerrain(theme: Encounter3DTheme, width: number, depth: number): Encounter3DTerrain[] {
  switch (theme) {
    case "dirt":
      return [
        { id: "auto-mid-barricade-left", kind: "wall", x: -2.6, z: 0.9, y: 0, width: 2.4, depth: 0.6, height: 0.75, rotation: 0.22, color: "#8a6443", label: "Barricade" },
        { id: "auto-mid-barricade-right", kind: "wall", x: 2.3, z: -0.6, y: 0, width: 2, depth: 0.6, height: 0.75, rotation: -0.18, color: "#8a6443", label: "Barricade" },
        { id: "auto-mid-hillock", kind: "platform", x: 0.7, z: 1.8, y: 0, width: 2.2, depth: 1.4, height: 0.2, rotation: 0.12, color: "#956b46", label: "Earth rise" },
      ]
    case "wood":
      return [
        { id: "auto-mid-cover-left", kind: "wall", x: -2.8, z: 0.8, y: 0, width: 2.1, depth: 0.55, height: 0.8, rotation: 0.18, color: "#916036", label: "Timber cover" },
        { id: "auto-mid-cover-right", kind: "wall", x: 2.5, z: -0.5, y: 0, width: 2.1, depth: 0.55, height: 0.8, rotation: -0.16, color: "#916036", label: "Timber cover" },
        { id: "auto-mid-platform", kind: "platform", x: 0.8, z: 1.6, y: 0, width: 2.3, depth: 1.3, height: 0.16, rotation: 0.08, color: "#986a3e", label: "Cargo deck" },
      ]
    case "cavern":
      return [
        { id: "auto-mid-spur-left", kind: "platform", x: -2.7, z: 0.7, y: 0, width: 2.4, depth: 1.5, height: 0.55, rotation: 0.22, color: "#525763", label: "Rock spur" },
        { id: "auto-mid-spur-right", kind: "platform", x: 2.4, z: -0.8, y: 0, width: 2.3, depth: 1.5, height: 0.5, rotation: -0.2, color: "#525763", label: "Rock spur" },
        { id: "auto-mid-bridge", kind: "platform", x: 0.4, z: 1.8, y: 0, width: 1.8, depth: 1.1, height: 0.25, rotation: 0.12, color: "#646a76", label: "Stone shelf" },
      ]
    case "sand":
      return [
        { id: "auto-mid-dune-left", kind: "platform", x: -2.7, z: 1.0, y: 0, width: 2.4, depth: 1.6, height: 0.28, rotation: 0.24, color: "#d2b27e", label: "Dune rise" },
        { id: "auto-mid-dune-right", kind: "platform", x: 2.4, z: -0.7, y: 0, width: 2.2, depth: 1.4, height: 0.24, rotation: -0.18, color: "#d2b27e", label: "Dune rise" },
        { id: "auto-mid-shrine-step", kind: "dais", x: 0.7, z: 1.7, y: 0, width: 2.1, depth: 1.2, height: 0.32, rotation: 0.1, color: "#d9bf8f", label: "Shrine step" },
      ]
    case "snow":
      return [
        { id: "auto-mid-bank-left", kind: "platform", x: -2.7, z: 0.9, y: 0, width: 2.4, depth: 1.6, height: 0.24, rotation: 0.22, color: "#dce7f0", label: "Snow bank" },
        { id: "auto-mid-bank-right", kind: "platform", x: 2.4, z: -0.7, y: 0, width: 2.2, depth: 1.4, height: 0.22, rotation: -0.18, color: "#dce7f0", label: "Snow bank" },
        { id: "auto-mid-ice-step", kind: "dais", x: 0.8, z: 1.6, y: 0, width: 2, depth: 1.2, height: 0.26, rotation: 0.08, color: "#eef6fc", label: "Ice shelf" },
      ]
    case "stone":
    default:
      return [
        { id: "auto-mid-cover-left", kind: "wall", x: -2.8, z: 0.9, y: 0, width: 2.2, depth: 0.6, height: 0.82, rotation: 0.2, color: "#8b8378", label: "Stone cover" },
        { id: "auto-mid-cover-right", kind: "wall", x: 2.5, z: -0.6, y: 0, width: 2, depth: 0.6, height: 0.82, rotation: -0.18, color: "#8b8378", label: "Stone cover" },
        { id: "auto-mid-plinth", kind: "platform", x: 0.8, z: 1.7, y: 0, width: 2.1, depth: 1.2, height: 0.18, rotation: 0.1, color: "#979084", label: "Flagstone plinth" },
      ]
  }
}

function createClusterProps(theme: Encounter3DTheme, width: number, depth: number): Encounter3DProp[] {
  const backline = -depth / 2 + 3

  switch (theme) {
    case "dirt":
      return [
        { id: "auto-cluster-left-1", kind: "crate", x: -3.2, z: 2.4, y: 0, scale: 1.08, rotation: 0.14, color: "#ab6a30", label: "Supply stack" },
        { id: "auto-cluster-left-2", kind: "crate", x: -2.35, z: 2.05, y: 0, scale: 0.94, rotation: -0.12, color: "#b27339", label: "Supply stack" },
        { id: "auto-cluster-right-1", kind: "crate", x: 3, z: -2.3, y: 0, scale: 1.06, rotation: -0.14, color: "#ab6a30", label: "Supply stack" },
        { id: "auto-cluster-right-2", kind: "crate", x: 2.35, z: -1.9, y: 0, scale: 0.92, rotation: 0.18, color: "#b27339", label: "Supply stack" },
      ]
    case "wood":
      return [
        { id: "auto-cluster-left-1", kind: "crate", x: -3.1, z: 2.3, y: 0, scale: 1.12, rotation: 0.16, color: "#9d6633", label: "Cargo stack" },
        { id: "auto-cluster-left-2", kind: "crate", x: -2.3, z: 2.0, y: 0, scale: 0.96, rotation: -0.12, color: "#a86f39", label: "Cargo stack" },
        { id: "auto-cluster-right-1", kind: "crate", x: 2.9, z: -2.1, y: 0, scale: 1.08, rotation: -0.14, color: "#9d6633", label: "Cargo stack" },
        { id: "auto-cluster-right-2", kind: "crate", x: 2.25, z: -1.72, y: 0, scale: 0.92, rotation: 0.18, color: "#a86f39", label: "Cargo stack" },
      ]
    case "cavern":
      return [
        { id: "auto-cluster-left-1", kind: "rock", x: -3, z: 2.2, y: 0, scale: 1.18, rotation: 0.2, color: "#767c87", label: "Boulder cluster" },
        { id: "auto-cluster-left-2", kind: "rock", x: -2.2, z: 1.9, y: 0, scale: 0.92, rotation: -0.16, color: "#808692", label: "Boulder cluster" },
        { id: "auto-cluster-right-1", kind: "rock", x: 2.9, z: -2.2, y: 0, scale: 1.14, rotation: -0.2, color: "#767c87", label: "Boulder cluster" },
        { id: "auto-cluster-right-2", kind: "rock", x: 2.2, z: -1.8, y: 0, scale: 0.9, rotation: 0.12, color: "#808692", label: "Boulder cluster" },
      ]
    case "sand":
      return [
        { id: "auto-cluster-left-1", kind: "pillar", x: -3, z: 2.2, y: 0, scale: 1.02, rotation: 0.18, color: "#dcc08a", label: "Shrine marker" },
        { id: "auto-cluster-left-2", kind: "banner", x: -2.15, z: 1.85, y: 0, scale: 0.88, rotation: -0.12, color: "#b98756", label: "Shrine banner" },
        { id: "auto-cluster-right-1", kind: "pillar", x: 2.9, z: -2.2, y: 0, scale: 1, rotation: -0.16, color: "#dcc08a", label: "Shrine marker" },
        { id: "auto-cluster-right-2", kind: "banner", x: 2.2, z: -1.8, y: 0, scale: 0.86, rotation: 0.14, color: "#b98756", label: "Shrine banner" },
      ]
    case "snow":
      return [
        { id: "auto-cluster-left-1", kind: "rock", x: -3.1, z: 2.3, y: 0, scale: 1.06, rotation: 0.18, color: "#e2ebf2", label: "Snow drift" },
        { id: "auto-cluster-left-2", kind: "tree", x: -2.2, z: 1.9, y: 0, scale: 0.9, rotation: -0.14, color: "#7ca46b", label: "Snow pine" },
        { id: "auto-cluster-right-1", kind: "rock", x: 2.9, z: -2.1, y: 0, scale: 1.04, rotation: -0.18, color: "#e2ebf2", label: "Snow drift" },
        { id: "auto-cluster-right-2", kind: "tree", x: 2.2, z: -1.75, y: 0, scale: 0.88, rotation: 0.16, color: "#7ca46b", label: "Snow pine" },
      ]
    case "stone":
    default:
      return [
        { id: "auto-cluster-left-1", kind: "crate", x: -3.2, z: 2.35, y: 0, scale: 1.06, rotation: 0.16, color: "#b0733f", label: "Supply stack" },
        { id: "auto-cluster-left-2", kind: "crate", x: -2.35, z: 1.98, y: 0, scale: 0.92, rotation: -0.12, color: "#bc8450", label: "Supply stack" },
        { id: "auto-cluster-right-1", kind: "crate", x: 3.05, z: -2.2, y: 0, scale: 1.08, rotation: -0.14, color: "#b0733f", label: "Supply stack" },
        { id: "auto-cluster-right-2", kind: "crate", x: 2.25, z: -1.82, y: 0, scale: 0.92, rotation: 0.18, color: "#bc8450", label: "Supply stack" },
        { id: "auto-cluster-banner-left", kind: "banner", x: -1.4, z: backline + 0.4, y: 0, scale: 0.9, rotation: 0.02, color: "#b8896d", label: "Court banner" },
        { id: "auto-cluster-banner-right", kind: "banner", x: 1.45, z: backline + 0.6, y: 0, scale: 0.9, rotation: -0.04, color: "#b8896d", label: "Court banner" },
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

function createCityGateCoreTerrain(theme: Encounter3DTheme, width: number, depth: number): Encounter3DTerrain[] {
  return createSceneKitTerrain("city_gate", theme, width, depth)
}

function createCityGateCoreProps(theme: Encounter3DTheme, width: number, depth: number): Encounter3DProp[] {
  return createSceneKitProps("city_gate", theme, width, depth)
}

function isCityGateStructuralTerrain(item: Encounter3DTerrain) {
  if (item.id.startsWith("auto-kit-city-gate") || item.id.startsWith("auto-city-gate")) {
    return true
  }

  if (!["wall", "ramp", "dais", "platform"].includes(item.kind)) {
    return false
  }

  return item.z <= 2.4
}

function isCityGateVariableProp(item: Encounter3DProp) {
  if (item.id.startsWith("auto-kit-city-gate")) {
    return true
  }

  return ["crate", "table", "banner", "torch", "wagon", "stall", "barrel", "post", "pillar", "statue"].includes(item.kind)
}

export function enhanceEncounterMap(
  map: Encounter3DMap,
  options?: {
    maxPartySize?: number
    npcIds?: string[]
  }
) {
  const next = cloneEncounterMap(map)
  const sceneKit = resolveEncounterMapSceneKit(next)
  next.sceneKit = sceneKit
  const width = next.board.width * next.board.cellSize
  const depth = next.board.depth * next.board.cellSize

  if (sceneKit === "city_gate") {
    next.camera = {
      ...next.camera,
      distance: 19.2,
      pitch: 0.58,
      yaw: Math.PI / 2,
      focusX: 0,
      focusZ: -3.15,
    }

    next.terrain = next.terrain.filter((item) => !isCityGateStructuralTerrain(item))
    for (const terrain of createCityGateCoreTerrain(next.board.theme, width, depth)) {
      addIfMissing(next.terrain, terrain)
    }

    next.props = next.props.filter((item) => !isCityGateVariableProp(item))
    for (const prop of createCityGateCoreProps(next.board.theme, width, depth)) {
      addIfMissing(next.props, prop)
    }

    if (next.tokenSlots.party.length === 0 && options?.maxPartySize) {
      next.tokenSlots.party = createDefaultPartySlots(options.maxPartySize, depth)
    }

    if (next.tokenSlots.npc.length === 0 && options?.npcIds?.length) {
      next.tokenSlots.npc = createDefaultNpcSlots(options.npcIds, depth)
    }

    next.premiumAssetKit = "city_gate_v1"

    return next
  }

  const hasSceneKitTerrain = next.terrain.some((item) => item.id.startsWith(`auto-kit-${sceneKit}`))
  const hasSceneKitProps = next.props.some((item) => item.id.startsWith(`auto-kit-${sceneKit}`))
  const hasPerimeterTreatment =
    next.terrain.some((item) => item.id.startsWith("auto-wall") || item.id.startsWith("auto-ridge")) ||
    next.terrain.filter((item) => item.kind === "wall").length >= 2

  if (!hasSceneKitTerrain && sceneKit !== "generic" && next.terrain.length < 9) {
    for (const terrain of createSceneKitTerrain(sceneKit, next.board.theme, width, depth)) {
      addIfMissing(next.terrain, terrain)
    }
  }

  if (!hasPerimeterTreatment) {
    for (const terrain of createPerimeterTerrain(sceneKit, next.board.theme, width, depth)) {
      addIfMissing(next.terrain, terrain)
    }
  }

  if (next.terrain.length < 4) {
    for (const terrain of createFocalTerrain(next.board.theme, width, depth)) {
      addIfMissing(next.terrain, terrain)
    }
  }

  if (next.terrain.length < 7) {
    for (const terrain of createMidfieldTerrain(next.board.theme, width, depth)) {
      addIfMissing(next.terrain, terrain)
    }
  }

  if (next.props.length < 6) {
    for (const prop of createAtmosphereProps(next.board.theme, width, depth)) {
      addIfMissing(next.props, prop)
    }
  }

  if (next.props.length < 10) {
    for (const prop of createScatterProps(next.board.theme)) {
      addIfMissing(next.props, prop)
    }
  }

  if (next.props.length < 14) {
    for (const prop of createClusterProps(next.board.theme, width, depth)) {
      addIfMissing(next.props, prop)
    }
  }

  if (!hasSceneKitProps && sceneKit !== "generic" && next.props.length < 18) {
    for (const prop of createSceneKitProps(sceneKit, next.board.theme, width, depth)) {
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
