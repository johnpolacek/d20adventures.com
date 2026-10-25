import { createServerCore } from "@/lib/gm-server/core"

export { getEncounterInstructionsFromPlan } from "@d20/gm-core/services/adventure-roll-result-service"

export async function resolvePlayerRollNarrativeAndCharacters(...args: Parameters<ReturnType<typeof createServerCore>["resolvePlayerRollNarrativeAndCharacters"]>) {
  return createServerCore().resolvePlayerRollNarrativeAndCharacters(...args)
}
