import { createServerCore } from "@/lib/gm-server/core"

export async function getRollRequirementHelper(...args: Parameters<ReturnType<typeof createServerCore>["getRollRequirementHelper"]>) {
  return createServerCore().getRollRequirementHelper(...args)
}

export { formatNarrativeAction, generateNarrativeUpdate, generateRollOutcomeNarrativeWithContext } from "@/lib/services/narrative-generation-service"

export { getRollModifier } from "@/lib/services/roll-modifier-service"

export { analyzePlayerInput } from "@/lib/utils/narrative-analysis"

export { appendNarrative, fixMalformedQuotes, limitToTwoSentences, normalizeNarrative } from "@/lib/utils/narrative-utils"
