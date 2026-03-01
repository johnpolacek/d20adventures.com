import { buildNpcOutcomePrompt, generateNpcOutcome } from "@/lib/services/npc-turn-generation-service"
import { appendNarrative, normalizeNarrative } from "@/lib/services/narrative-service"
import { applyNpcEffectsToCharacters, reconcileNpcRollWithAi, type NpcTurnEffect } from "@/lib/services/npc-turn-resolution-service"
import { getRollModifier } from "@/lib/services/roll-modifier-service"
import { getRollRequirementForAction } from "@/lib/services/roll-requirement-service"
import { rollD20 } from "@/lib/utils"
import type { Turn, TurnCharacter } from "@/types/adventure"

export type NpcRollInfo = {
  rollType: string
  difficulty: number
  baseRoll: number
  modifier: number
  result: number
  success: boolean
}

export type NpcTurnBranchResult = {
  updatedNarrative: string
  updatedCharacters: TurnCharacter[]
  actionSummary: string
  rollInfo?: NpcRollInfo
  effects?: NpcTurnEffect[]
  shortcode?: string
  narrativeToAppend: string
}

type NpcActionResult = {
  actionSummary: string
  narrative: string
  actionType: "attack" | "skill" | "skip" | "pass" | "other"
  effects?: NpcTurnEffect[]
}

export function handleSkipPassNpcTurn(args: {
  turn: Turn
  npc: TurnCharacter
  actionResult: NpcActionResult
}): NpcTurnBranchResult {
  const narrativeToAppend = normalizeNarrative(args.actionResult.narrative)
  const updatedCharacters = args.turn.characters.map((character) => {
    if (character.id === args.npc.id) {
      return {
        ...character,
        hasReplied: true,
        isComplete: true,
        status: args.actionResult.actionType === "skip" ? "skipping" : "passing",
      }
    }
    return character
  })
  const updatedNarrative = appendNarrative(args.turn.narrative || "", narrativeToAppend)

  console.log("[LLM] NPC turn completed:", {
    action: args.actionResult.actionType,
    npc: args.npc.name,
  })

  return {
    updatedNarrative,
    updatedCharacters,
    actionSummary: args.actionResult.actionSummary,
    rollInfo: undefined,
    effects: undefined,
    shortcode: undefined,
    narrativeToAppend,
  }
}

export async function resolveNpcTurnRollOrDirectBranch(args: {
  turn: Turn
  npc: TurnCharacter
  actionResult: NpcActionResult
  encounterContext?: { intro?: string; instructions?: string }
  npcActionContext: {
    contextString: string
    npcDetails: string
    playerCharacters: TurnCharacter[]
  }
}): Promise<Omit<NpcTurnBranchResult, "actionSummary">> {
  let updatedNarrative = args.turn.narrative || ""
  let narrativeToAppend = ""
  let updatedCharacters = [...args.turn.characters]
  let rollInfo: NpcRollInfo | undefined = undefined
  let effects: NpcTurnEffect[] | undefined = undefined
  let shortcode: string | undefined = undefined

  const rollRequirement = await getRollRequirementForAction(args.actionResult.actionSummary, args.npc, {
    encounterInstructions: args.encounterContext?.instructions || "",
    encounterIntro: args.encounterContext?.intro || "",
    narrativeContext: args.turn.narrative || "",
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
        narrativeContext: args.turn.narrative || "",
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

    shortcode = `[DiceRoll:rollType=${rollRequirement.rollType};baseRoll=${baseRoll};modifier=${modifier >= 0 ? `+${modifier}` : modifier};result=${result};difficulty=${rollRequirement.difficulty};character=${args.npc.name};image=${args.npc.image};success=${success}]\n`

    console.log(
      "[LLM DM] Generated dice roll shortcode",
      JSON.stringify(
        {
          shortcode,
          shortcodeLength: shortcode.length,
        },
        null,
        2
      )
    )

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
          narrative: outcomeResult.narrative,
          effects: outcomeResult.effects,
          narrativeLength: outcomeResult.narrative.length,
          effectCount: outcomeResult.effects.length,
        },
        null,
        2
      )
    )

    narrativeToAppend = (shortcode ? shortcode : "") + normalizeNarrative(outcomeResult.narrative || "")
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
      updatedNarrative,
      narrativeToAppend,
      diceRoll,
    })
  } else {
    narrativeToAppend = normalizeNarrative(args.actionResult.narrative)
    effects = args.actionResult.effects

    updatedCharacters = applyNpcEffectsToCharacters({
      characters: updatedCharacters,
      npcId: args.npc.id,
      effects,
      applyHealthAndStatus: false,
    })
  }

  updatedNarrative = appendNarrative(updatedNarrative, narrativeToAppend)

  return {
    updatedNarrative,
    updatedCharacters,
    rollInfo,
    effects,
    shortcode,
    narrativeToAppend,
  }
}

