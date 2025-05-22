import type { PC, NPC } from "./character";

export interface Adventure {
  id: string;
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
  encounterId: string;
  title?: string;
  subtitle?: string;
  narrative: string;
  characters: TurnCharacter[];
}