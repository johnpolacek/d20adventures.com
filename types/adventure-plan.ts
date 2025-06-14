import type { Character, PCTemplate } from "./character";

export interface AdventurePlan {
  id: string;
  settingId: string;
  title: string;
  author: string;
  version: string;
  teaser: string;
  overview: string;
  party: [number, number];
  tags: string[];
  image: string;
  start: string;
  sections: AdventureSection[];
  premadePlayerCharacters: PCTemplate[];
  npcs: Record<string, Character>;
  draft?: boolean;
  availableCharacterOptions?: {
    races: string[];
    archetypes: string[];
  };
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

export interface AdventureSection {
  title: string;
  summary: string;
  image?: string;
  scenes: AdventureScene[];
}

export interface AdventureScene {
  title: string;
  summary: string;
  image?: string;
  encounters: AdventureEncounter[];
}

export interface AdventureEncounter {
  id: string;
  title: string;
  intro: string;
  instructions?: string;
  image?: string;
  transitions?: EncounterTransition[];
  npc?: EncounterCharacterRef[];
  skipInitialNpcTurns?: boolean;
  resetHealth?: boolean;
}

export interface EncounterTransition {
  condition: string;
  encounter: string;
}

export interface EncounterCharacterRef {
  id: string;
  behavior: string;
  initialInitiative?: number;
}