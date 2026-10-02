import type { GmPorts } from "../ports"
import type { AdventurePlan } from "../types/adventure-plan"
import type { Character } from "../types/character"
import type { RollRequirement } from "../validations/roll-requirement-schema"
import { createRollModifierService } from "./roll-modifier-service"
import { createRollRequirementService } from "./roll-requirement-service"

export function createAdventureTurnReplyService(ports: GmPorts) {
  const { getRollModifier } = createRollModifierService(ports)
  const { getRollRequirementForAction } = createRollRequirementService(ports)
  const isLocalWikiAdventure = ports.content.isWikiAdventure.bind(ports.content)
  const loadWikiAdventureRuntime = ports.content.loadWikiRuntime.bind(ports.content)
  async function resolveEncounterContent(settingId: string, planId: string, encounterId: string): Promise<{ encounterIntro: string; encounterInstructions: string }> {
    if (isLocalWikiAdventure(settingId, planId)) {
      const { artifacts } = await loadWikiAdventureRuntime(settingId, planId)
      const encounter = artifacts.encounters[encounterId]
      if (!encounter) {
        console.error("[processTurnReply] Wiki encounter not found for encounterId:", encounterId)
        throw new Error("Encounter not found")
      }
      return {
        encounterIntro: encounter.sections.intro ?? encounter.sections.body ?? "",
        encounterInstructions: encounter.sections.gmNotes ?? "",
      }
    }

    const planPath = `settings/${settingId}/${planId}.json`
    const plan = (await ports.content.loadLegacyPlan(settingId, planId)) as AdventurePlan
    if (!plan) {
      console.error("[processTurnReply] Adventure plan not found at path:", planPath)
      throw new Error("Adventure plan not found")
    }
    const encounter = plan.sections
      .flatMap((section) => section.scenes)
      .flatMap((scene) => scene.encounters)
      .find((entry) => entry.id === encounterId)
    if (!encounter) {
      console.error("[processTurnReply] Encounter not found for encounterId:", encounterId)
      throw new Error("Encounter not found")
    }
    return { encounterIntro: encounter.intro || "", encounterInstructions: encounter.instructions || "" }
  }

  async function buildTurnReplyRollRequirement(args: {
    turn: {
      encounterId: string
      order?: number
      narrative?: string
      adventureId: string
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
    const { encounterIntro, encounterInstructions } = await resolveEncounterContent(args.adventure.settingId, args.adventure.planId, args.turn.encounterId)

    const allTurns = await ports.store.getTurns({ adventureId: args.turn.adventureId })
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
      encounter: args.turn.encounterId,
      recentTurnsCount: allTurns.filter((entry) => entry.order <= currentTurnOrder).length,
    })

    const assessment = await getRollRequirementForAction(actionToAnalyze, args.characterPerformingAction as Character, {
      encounterInstructions,
      narrativeContext: recentTurnNarratives || args.turn.narrative || "",
      encounterIntro,
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
          encounterIntro: encounterInstructions,
          encounterInstructions,
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
  return { buildTurnReplyRollRequirement }
}
