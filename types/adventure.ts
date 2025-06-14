import type { PC, NPC } from "./character";
import type { RollRequirement } from "@/lib/validations/roll-requirement-schema";

export interface Adventure {
  id: string;
  title: string;
  adventurePlanId: string;
  settingId: string;
  status?: "waitingForPlayers" | "active" | "completed";
  party: PC[];
  turns: Turn[];
  startedAt: string;
  endedAt?: string;
  pausedAt?: string;
  players?: { characterId: string; userId: string }[];
}

export type TurnCharacter =
  | (PC & { 
      type: "pc"; 
      initiative: number; 
      hasReplied?: boolean; 
      isComplete?: boolean;
      rollRequired?: RollRequirement;
      rollResult?: number;
    })
  | (NPC & { 
      type: "npc"; 
      initiative: number; 
      hasReplied?: boolean; 
      isComplete?: boolean;
      rollRequired?: RollRequirement;
      rollResult?: number;
    });

export interface Turn {
  id: string;
  encounterId: string;
  title: string;
  narrative: string;
  characters: TurnCharacter[];
  adventureId: string;
  isFinalEncounter?: boolean;
}

export interface DiceRoll {
  rollType: string;
  baseRoll: number;
  modifier: string | number;
  result: number;
  difficulty: number;
  character: string;
  success: boolean;
}