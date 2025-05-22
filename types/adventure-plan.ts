import type { Character } from "./character";

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
  npcs: Record<string, Character>;
}

export interface AdventureSection {
  title: string;
  summary: string;
  scenes: AdventureScene[];
}

export interface AdventureScene {
  title: string;
  summary: string;
  encounters: AdventureEncounter[];
}

export interface AdventureEncounter {
  id: string;
  title: string;
  intro: string;
  instructions: string;
  image: string;
  transitions?: EncounterTransition[];
  npc?: CharacterRef[];
  notes?: string;
}

export interface EncounterTransition {
  condition: string;
  encounter: string;
}

export interface CharacterRef {
  id: string;
  behavior: string;
} 