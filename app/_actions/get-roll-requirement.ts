import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service";
import type { Character } from "@/types/character";

export async function getRollRequirement(reply: string, character: Character, options?: {
  encounterInstructions?: string;
  encounterIntro?: string;
  narrativeContext?: string;
}) {
  return getRollRequirementForAction(reply, character, options);
} 