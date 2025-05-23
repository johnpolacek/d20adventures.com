import type { PC, NPC } from "./character";

export interface Adventure {
  id: string;
  title: string;
  adventurePlanId: string;
  settingId: string;
  party: PC[];
  turns: Turn[];
  startedAt: string;
  endedAt?: string;
  pausedAt?: string;
}

export type TurnCharacter =
  | (PC & { type: "pc"; initiative: number; hasReplied?: boolean; isComplete?: boolean })
  | (NPC & { type: "npc"; initiative: number; hasReplied?: boolean; isComplete?: boolean });

export interface Turn {
  id: string;
  encounterId: string;
  title?: string;
  subtitle?: string;
  narrative: string;
  characters: TurnCharacter[];
  adventureId: string;
  isFinalEncounter?: boolean;
}