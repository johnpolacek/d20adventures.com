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
}

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