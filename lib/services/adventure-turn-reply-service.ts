import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { getRollModifier } from "@/lib/services/roll-modifier-service"
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service"
import type { RollRequirement } from "@/lib/validations/roll-requirement-schema"
import type { Character } from "@/types/character"
import type { AdventurePlan } from "@/types/adventure-plan"

export async function buildTurnReplyRollRequirement(args: {
  turn: {
    encounterId: string
    order?: number
    narrative?: string
    adventureId: Id<"adventures">
  }
  adventure: {
    settingId: string
    planId: string
  }
  characterPerformingAction: {
    name: string
    [key: string]: unknown
  }
  narrativeAction: string
  originalPlayerInput?: string
}): Promise<RollRequirement> {
  const planPath = `settings/${args.adventure.settingId}/${args.adventure.planId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!plan) {
    console.error("[processTurnReply] Adventure plan not found at path:", planPath)
    throw new Error("Adventure plan not found")
  }

  const encounter = plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((entry) => entry.id === args.turn.encounterId)
  if (!encounter) {
    console.error("[processTurnReply] Encounter not found for encounterId:", args.turn.encounterId)
    throw new Error("Encounter not found")
  }

  const allTurns = await convex.query(api.adventure.getTurnsByAdventure, { adventureId: args.turn.adventureId })
  const currentTurnOrder = args.turn.order || 1

  const recentTurnNarratives = allTurns
    .filter((entry) => entry.order <= currentTurnOrder)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(-3)
    .map((entry) => entry.narrative || "")
    .join("\n\n---\n\n")

  const actionToAnalyze = args.originalPlayerInput?.trim() ? args.originalPlayerInput : args.narrativeAction

  console.log("[LLM] Analyzing action for roll requirement:", {
    action: actionToAnalyze,
    isOriginalInput: !!args.originalPlayerInput?.trim(),
    character: args.characterPerformingAction.name,
    encounter: encounter.id,
    recentTurnsCount: allTurns.filter((entry) => entry.order <= currentTurnOrder).length,
  })

  const assessment = await getRollRequirementForAction(actionToAnalyze, args.characterPerformingAction as Character, {
    encounterInstructions: encounter.instructions || "",
    narrativeContext: recentTurnNarratives || args.turn.narrative || "",
    encounterIntro: encounter.intro || "",
  })

  const rollRequirement: RollRequirement = assessment
  console.log("[LLM] Roll requirement analysis result:", {
    requiresRoll: !!rollRequirement,
    rollType: rollRequirement?.rollType,
    difficulty: rollRequirement?.difficulty,
  })

  if (rollRequirement?.rollType && typeof rollRequirement.difficulty === "number") {
    console.log("[LLM] Calculating roll modifier for:", rollRequirement.rollType)
    const calculatedModifier = await getRollModifier({
      scenario: {
        encounterIntro: encounter.instructions || "",
        encounterInstructions: encounter.instructions || "",
        narrativeContext: args.turn.narrative || "",
      },
      rollRequirement,
      character: args.characterPerformingAction as Character,
    })
    rollRequirement.modifier = calculatedModifier
    console.log("[LLM] Roll configuration:", {
      rollType: rollRequirement.rollType,
      difficulty: rollRequirement.difficulty,
      modifier: calculatedModifier,
    })
  }

  return rollRequirement
}
