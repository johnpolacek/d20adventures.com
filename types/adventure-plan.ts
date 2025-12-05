import { z } from "zod"
import type { Character, PCTemplate } from "./character"

export interface AdventurePlan {
  id: string
  settingId: string
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
