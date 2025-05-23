// Base type for all characters
export interface BaseCharacter {
  id: string;
  name: string;
  image: string;
  archetype: string;
  race: string;
  gender?: string;
  appearance: string;
  personality?: string;
  background?: string;
  motivation?: string;
  behavior?: string;
  healthPercent: number; // 0-100, percentage
  equipment?: EquipmentItem[];
  skills?: string[];
  status?: string;
}

// Equipment item type
export interface EquipmentItem {
  name: string;
  description?: string;
}

// Standard RPG attributes (1-20)
export interface Attributes {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

// Player Character (PC) type
export interface PC extends BaseCharacter {
  type: "pc";
  userId: string; // Clerk user id
  attributes: Attributes;
}

// Non-Player Character (NPC) type
export interface NPC extends BaseCharacter {
  type: "npc";
  attributes?: Partial<Attributes>; // Some NPCs may have attributes
}

// Pre-rolled Player Character template (no userId)
export interface PCTemplate extends BaseCharacter {
  type: "pc";
  attributes: Attributes;
}

// Union type for all characters
export type Character = PC | NPC; 