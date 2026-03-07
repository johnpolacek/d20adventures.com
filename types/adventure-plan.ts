import { z } from "zod"
import type { Character, PCTemplate } from "./character"

export interface AdventurePlan {
  id: string
  settingId: string
  ownerId?: string
  title: string
  author: string
  version: string
  teaser: string
  overview: string
  party: [number, number]
  tags: string[]
  image: string
  start: string
  sections: AdventureSection[]
  premadePlayerCharacters: PCTemplate[]
  npcs: Record<string, Character>
  draft?: boolean
  availableCharacterOptions?: {
    races: string[]
    archetypes: string[]
  }
  nextAdventure?: string
}

export const RULES_PRESETS = [
  {
    label: "Basic Fantasy",
    value: "basic",
    races: ["Human", "Elf", "Dwarf", "Half-Elf", "Halfling"],
    archetypes: ["Fighter", "Wizard", "Rogue", "Cleric"],
  },
  {
    label: "Classic Fantasy",
    value: "classic",
    races: ["Human", "Elf", "Dwarf", "Halfling", "Gnome", "Half-Elf", "Half-Orc"],
    archetypes: ["Fighter", "Barbarian", "Rogue", "Wizard", "Sorcerer", "Cleric", "Paladin", "Bard", "Ranger", "Monk", "Druid", "Warlock"],
  },
  {
    label: "Modern Fantasy",
    value: "modern",
    races: [
      "Human",
      "Elf",
      "Dwarf",
      "Halfling",
      "Gnome",
      "Dragonborn",
      "Tiefling",
      "Half-Elf",
      "Half-Orc",
      "Aasimar",
      "Genasi",
      "Gith",
      "Goliath",
      "Kenku",
      "Lizardfolk",
      "Tabaxi",
      "Tortle",
      "Firbolg",
      "Goblin",
      "Orc",
      "Kobold",
    ],
    archetypes: ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard", "Artificer"],
  },
]

export const encounterCharacterRefSchema = z.object({
  id: z.string(),
  behavior: z.string(),
  initialInitiative: z.number().optional(),
})
export type EncounterCharacterRef = z.infer<typeof encounterCharacterRefSchema>

export const encounterTransitionSchema = z.object({
  condition: z.string(),
  encounter: z.string(),
})
export type EncounterTransition = z.infer<typeof encounterTransitionSchema>

function normalizeAngleValue(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return value
  }

  // Accept model outputs in degrees and normalize to radians for runtime use.
  if (Math.abs(value) > Math.PI * 2) {
    return (value * Math.PI) / 180
  }

  return value
}

const rotationAngleSchema = z.preprocess(normalizeAngleValue, z.number().min(-Math.PI).max(Math.PI).default(0))
const pitchAngleSchema = z.preprocess(normalizeAngleValue, z.number().min(0.2).max(1.4))

export const encounter3dThemeSchema = z.enum(["stone", "dirt", "wood", "cavern", "sand", "snow"])
export type Encounter3DTheme = z.infer<typeof encounter3dThemeSchema>

export const encounter3dSceneKitSchema = z.enum(["generic", "checkpoint", "courtyard", "ruins", "shrine", "camp", "road", "crypt", "cavern"])
export type Encounter3DSceneKit = z.infer<typeof encounter3dSceneKitSchema>

export const encounter3dBoardSchema = z.object({
  width: z.number().min(4).max(48),
  depth: z.number().min(4).max(48),
  cellSize: z.number().min(0.5).max(4),
  theme: encounter3dThemeSchema,
  accentColor: z.string().default("#b08968"),
})
export type Encounter3DBoard = z.infer<typeof encounter3dBoardSchema>

export const encounter3dCameraSchema = z.object({
  distance: z.number().min(6).max(60),
  pitch: pitchAngleSchema,
  yaw: rotationAngleSchema,
  focusX: z.number().min(-48).max(48).default(0),
  focusZ: z.number().min(-48).max(48).default(0),
})
export type Encounter3DCamera = z.infer<typeof encounter3dCameraSchema>

export const encounter3dTerrainKindSchema = z.enum(["platform", "wall", "water", "dais", "ramp", "pit"])
export type Encounter3DTerrainKind = z.infer<typeof encounter3dTerrainKindSchema>

export const encounter3dTerrainSchema = z.object({
  id: z.string(),
  kind: encounter3dTerrainKindSchema,
  x: z.number().min(-48).max(48),
  z: z.number().min(-48).max(48),
  y: z.number().min(-12).max(24).default(0),
  width: z.number().min(0.5).max(48),
  depth: z.number().min(0.5).max(48),
  height: z.number().min(0.1).max(24).default(1),
  rotation: rotationAngleSchema,
  color: z.string().optional(),
  label: z.string().optional(),
})
export type Encounter3DTerrain = z.infer<typeof encounter3dTerrainSchema>

export const encounter3dPropKindSchema = z.enum(["pillar", "crate", "torch", "statue", "tree", "rock", "table", "stairs", "banner", "altar"])
export type Encounter3DPropKind = z.infer<typeof encounter3dPropKindSchema>

export const encounter3dPropSchema = z.object({
  id: z.string(),
  kind: encounter3dPropKindSchema,
  x: z.number().min(-48).max(48),
  z: z.number().min(-48).max(48),
  y: z.number().min(-12).max(24).default(0),
  scale: z.number().min(0.25).max(6).default(1),
  rotation: rotationAngleSchema,
  color: z.string().optional(),
  label: z.string().optional(),
})
export type Encounter3DProp = z.infer<typeof encounter3dPropSchema>

export const encounter3dZoneKindSchema = z.enum(["spawn", "danger", "objective", "cover"])
export type Encounter3DZoneKind = z.infer<typeof encounter3dZoneKindSchema>

export const encounter3dZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: encounter3dZoneKindSchema,
  x: z.number().min(-48).max(48),
  z: z.number().min(-48).max(48),
  width: z.number().min(0.5).max(48),
  depth: z.number().min(0.5).max(48),
  color: z.string().optional(),
})
export type Encounter3DZone = z.infer<typeof encounter3dZoneSchema>

export const encounter3dPartySlotSchema = z.object({
  id: z.string(),
  slotIndex: z.number().int().min(0).max(7),
  x: z.number().min(-48).max(48),
  z: z.number().min(-48).max(48),
  y: z.number().min(-12).max(24).default(0),
  facing: rotationAngleSchema,
})
export type Encounter3DPartySlot = z.infer<typeof encounter3dPartySlotSchema>

export const encounter3dNpcSlotSchema = z.object({
  id: z.string(),
  npcId: z.string(),
  x: z.number().min(-48).max(48),
  z: z.number().min(-48).max(48),
  y: z.number().min(-12).max(24).default(0),
  facing: rotationAngleSchema,
})
export type Encounter3DNpcSlot = z.infer<typeof encounter3dNpcSlotSchema>

export const encounter3dMapSchema = z.object({
  version: z.number().int().min(1).max(1).default(1),
  summary: z.string().default(""),
  promptHistory: z.array(z.string()).default([]),
  sceneKit: encounter3dSceneKitSchema.default("generic"),
  lastRedrawIntent: z.string().default(""),
  board: encounter3dBoardSchema,
  camera: encounter3dCameraSchema,
  terrain: z.array(encounter3dTerrainSchema).default([]),
  props: z.array(encounter3dPropSchema).default([]),
  zones: z.array(encounter3dZoneSchema).default([]),
  tokenSlots: z.object({
    party: z.array(encounter3dPartySlotSchema).default([]),
    npc: z.array(encounter3dNpcSlotSchema).default([]),
  }),
})
export type Encounter3DMap = z.infer<typeof encounter3dMapSchema>

export const adventureEncounterSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required for encounters"),
  intro: z.string(),
  instructions: z.string().optional(),
  image: z.string().optional(),
  transitions: z.array(encounterTransitionSchema).optional(),
  npc: z.array(encounterCharacterRefSchema).optional(),
  skipInitialNpcTurns: z.boolean().optional(),
  resetHealth: z.boolean().optional(),
  map3d: encounter3dMapSchema.optional(),
  map3dKey: z.string().optional(),
})
export type AdventureEncounter = z.infer<typeof adventureEncounterSchema>

export const adventureSceneSchema = z.object({
  title: z.string(),
  summary: z.string(),
  image: z.string().optional(),
  encounters: z.array(adventureEncounterSchema),
})
export type AdventureScene = z.infer<typeof adventureSceneSchema>

export const adventureSectionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  image: z.string().optional(),
  scenes: z.array(adventureSceneSchema),
})
export type AdventureSection = z.infer<typeof adventureSectionSchema>
