import type { GmPorts } from "../ports"
import type { StoryBeat, StoryBy, StoryOutput } from "../story/beats"
import { cleanStory, type StoryScene } from "../story/clean"
import { rollBeat, turnScript } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import { rollD20 } from "../utils/game-utils"
import { buildNpcOutcomePrompt, createNpcTurnGenerationService } from "./npc-turn-generation-service"
import { applyNpcEffectsToCharacters, createNpcTurnResolutionService, type NpcTurnEffect } from "./npc-turn-resolution-service"
import { createRollModifierService } from "./roll-modifier-service"
import { createRollRequirementService } from "./roll-requirement-service"

export type NpcRollInfo = {
  rollType: string
  difficulty: number
  baseRoll: number
  modifier: number
  result: number
  success: boolean
}

export type NpcTurnBranchResult = {
  updatedCharacters: TurnCharacter[]
  actionSummary: string
  rollInfo?: NpcRollInfo
  effects?: NpcTurnEffect[]
  beatsToAppend: StoryBeat[]
}

type NpcActionResult = {
  actionSummary: string
  beats: StoryOutput
  actionType: "attack" | "skill" | "skip" | "pass" | "flee" | "other"
  effects?: NpcTurnEffect[]
}

// An NPC turn that needs no roll and touches nobody else: waiting, holding back, or running away for good.
export function handleSkipPassNpcTurn(args: { turn: Turn; npc: TurnCharacter; actionResult: NpcActionResult; scene: StoryScene }): NpcTurnBranchResult {
  const beatsToAppend = cleanStory(args.actionResult.beats, args.scene, npcStep(args.npc))
  const updatedCharacters = args.turn.characters.map((character) => {
    if (character.id === args.npc.id) {
      // Skipping or passing is not a condition. The NPC keeps whatever status it has. One who flees is out of the
      // encounter: the next round is built without them.
      return { ...character, hasReplied: true, isComplete: true, ...(args.actionResult.actionType === "flee" ? { status: "fled" } : {}) }
    }
    return character
  })

  console.log("[LLM] NPC turn completed:", {
    action: args.actionResult.actionType,
    npc: args.npc.name,
  })

  return {
    updatedCharacters,
    actionSummary: args.actionResult.actionSummary,
    rollInfo: undefined,
    effects: undefined,
    beatsToAppend,
  }
}

const npcStep = (npc: TurnCharacter): StoryBy => ({ step: "npc", character: npc.id })

export function createNpcTurnBranchService(ports: GmPorts) {
  const { generateNpcOutcome } = createNpcTurnGenerationService(ports)
  const { reconcileNpcRollWithAi } = createNpcTurnResolutionService(ports)
  const { getRollModifier } = createRollModifierService(ports)
  const { getRollRequirementForAction } = createRollRequirementService(ports)
  async function resolveNpcTurnRollOrDirectBranch(args: {
    turn: Turn
    npc: TurnCharacter
    actionResult: NpcActionResult
    encounterContext?: { intro?: string; instructions?: string }
    npcActionContext: {
      contextString: string
      npcDetails: string
      playerCharacters: TurnCharacter[]
    }
    scene: StoryScene
  }): Promise<Omit<NpcTurnBranchResult, "actionSummary">> {
    let beatsToAppend: StoryBeat[] = []
    const script = turnScript(args.turn)
    let updatedCharacters = [...args.turn.characters]
    let rollInfo: NpcRollInfo | undefined
    let effects: NpcTurnEffect[] | undefined

    const rollRequirement = await getRollRequirementForAction(args.actionResult.actionSummary, args.npc, {
      encounterInstructions: args.encounterContext?.instructions || "",
      encounterIntro: args.encounterContext?.intro || "",
      narrativeContext: script,
    })

    console.log("[LLM] NPC roll requirement:", {
      requiresRoll: !!rollRequirement,
      rollType: rollRequirement?.rollType,
      difficulty: rollRequirement?.difficulty,
    })

    if (rollRequirement?.rollType && rollRequirement.difficulty) {
      const modifier = await getRollModifier({
        scenario: {
          encounterIntro: args.encounterContext?.intro || "",
          encounterInstructions: args.encounterContext?.instructions || "",
          narrativeContext: script,
        },
        rollRequirement,
        character: args.npc,
      })

      const baseRoll = rollD20()
      const result = baseRoll + (modifier || 0)
      const success = result >= rollRequirement.difficulty
      rollInfo = {
        rollType: rollRequirement.rollType,
        difficulty: rollRequirement.difficulty,
        baseRoll,
        modifier,
        result,
        success,
      }

      console.log("[LLM] NPC dice roll:", {
        rollType: rollRequirement.rollType,
        result,
        difficulty: rollRequirement.difficulty,
        success,
      })

      const prompt2 = buildNpcOutcomePrompt({
        contextString: args.npcActionContext.contextString,
        npcDetails: args.npcActionContext.npcDetails,
        playerCharacters: args.npcActionContext.playerCharacters,
        npcName: args.npc.name,
        actionSummary: args.actionResult.actionSummary,
        rollType: rollRequirement.rollType,
        result,
        difficulty: rollRequirement.difficulty,
        success,
        scene: args.scene,
      })

      console.log(
        "[LLM DM] Sending prompt to LLM for outcome generation",
        JSON.stringify(
          {
            promptLength: prompt2.length,
            actionSummary: args.actionResult.actionSummary,
            rollResult: result,
            success,
            playerCharacterCount: args.npcActionContext.playerCharacters.length,
          },
          null,
          2
        )
      )

      const outcomeResult = await generateNpcOutcome(prompt2)

      console.log(
        "[LLM DM] LLM response for outcome",
        JSON.stringify(
          {
            beats: outcomeResult.beats,
            effects: outcomeResult.effects,
            effectCount: outcomeResult.effects.length,
          },
          null,
          2
        )
      )

      const roll = rollBeat(npcStep(args.npc), {
        id: args.npc.id,
        name: args.npc.name,
        image: args.npc.image,
        check: rollRequirement.rollType,
        natural: baseRoll,
        modifier,
        total: result,
        dc: rollRequirement.difficulty,
        success,
      })
      beatsToAppend = [roll, ...cleanStory(outcomeResult.beats, args.scene, npcStep(args.npc))]
      effects = outcomeResult.effects

      updatedCharacters = applyNpcEffectsToCharacters({
        characters: updatedCharacters,
        npcId: args.npc.id,
        effects,
        applyHealthAndStatus: true,
      })

      const diceRoll = {
        rollType: rollRequirement.rollType,
        baseRoll,
        modifier,
        result,
        difficulty: rollRequirement.difficulty,
        character: args.npc.name,
        target: outcomeResult.effects?.[0] ? outcomeResult.effects[0].targetId : undefined,
        success,
      }

      updatedCharacters = await reconcileNpcRollWithAi({
        turn: args.turn,
        updatedCharacters,
        story: [...args.turn.story, ...beatsToAppend],
        diceRoll,
      })
    } else {
      beatsToAppend = cleanStory(args.actionResult.beats, args.scene, npcStep(args.npc))
      effects = args.actionResult.effects

      updatedCharacters = applyNpcEffectsToCharacters({
        characters: updatedCharacters,
        npcId: args.npc.id,
        effects,
        applyHealthAndStatus: false,
      })
    }

    return {
      updatedCharacters,
      rollInfo,
      effects,
      beatsToAppend,
    }
  }
  return { resolveNpcTurnRollOrDirectBranch }
}
