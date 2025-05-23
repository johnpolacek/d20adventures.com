import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service";

export async function getRollRequirement(reply: string) {
  return getRollRequirementForAction(reply);
} 