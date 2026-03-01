import type { NpcRollInfo } from "@/lib/services/npc-turn-branch-service"
import type { NpcTurnEffect } from "@/lib/services/npc-turn-resolution-service"
import { detectSpellFromRollType, markSpellAsUsed } from "@/lib/services/spell-tracking-service"
import type { TurnCharacter } from "@/types/adventure"

export function applyNpcSpellPostProcessing(args: {
  updatedCharacters: TurnCharacter[]
  rollInfo?: NpcRollInfo
  npcId: string
}): TurnCharacter[] {
  if (!args.rollInfo?.rollType) {
    return args.updatedCharacters
  }

  const spellName = detectSpellFromRollType(args.rollInfo.rollType)
  if (!spellName) {
    return args.updatedCharacters
  }

  console.log(`[LLM DM] NPC spell detected: "${spellName}" - marking as used for NPC ${args.npcId}`)
  return markSpellAsUsed(args.updatedCharacters, args.npcId, spellName)
}

export function finalizeNpcTurnResponse(args: {
  actionSummary: string
  updatedNarrative: string
  updatedCharacters: TurnCharacter[]
  rollInfo?: NpcRollInfo
  effects?: NpcTurnEffect[]
  shortcode?: string
  narrativeToAppend: string
  npcId: string
}) {
  console.log(
    "[LLM DM] NPC turn processing completed",
    JSON.stringify(
      {
        finalNarrativeLength: args.updatedNarrative.length,
        narrativeToAppendLength: args.narrativeToAppend.length,
        characterCount: args.updatedCharacters.length,
        npcStatus: args.updatedCharacters.find((character) => character.id === args.npcId)?.status,
        hasRollInfo: !!args.rollInfo,
        effectCount: args.effects?.length || 0,
      },
      null,
      2
    )
  )

  return {
    updatedNarrative: args.updatedNarrative,
    updatedCharacters: args.updatedCharacters,
    actionSummary: args.actionSummary,
    rollInfo: args.rollInfo,
    effects: args.effects,
    shortcode: args.shortcode,
    narrativeToAppend: args.narrativeToAppend,
  }
}

