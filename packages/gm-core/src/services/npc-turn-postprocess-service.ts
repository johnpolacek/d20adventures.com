import { conditionWords } from "../sheet/conditions"
import type { StoryBeat } from "../story/beats"
import type { TurnCharacter } from "../types/adventure"
import type { NpcRollInfo } from "./npc-turn-branch-service"
import type { NpcTurnEffect } from "./npc-turn-resolution-service"
import { markSpellAsUsed } from "./spell-tracking-service"

export function applyNpcSpellPostProcessing(args: { updatedCharacters: TurnCharacter[]; rollInfo?: NpcRollInfo; npcId: string }): TurnCharacter[] {
  const spell = args.rollInfo?.spell
  return spell ? markSpellAsUsed(args.updatedCharacters, args.npcId, spell) : args.updatedCharacters
}

export function finalizeNpcTurnResponse(args: {
  actionSummary: string
  updatedCharacters: TurnCharacter[]
  rollInfo?: NpcRollInfo
  effects?: NpcTurnEffect[]
  beatsToAppend: StoryBeat[]
  npcId: string
}) {
  console.log(
    "[LLM DM] NPC turn processing completed",
    JSON.stringify(
      {
        beats: args.beatsToAppend.length,
        characterCount: args.updatedCharacters.length,
        npcConditions: conditionWords(args.updatedCharacters.find((character) => character.id === args.npcId) ?? {}),
        hasRollInfo: !!args.rollInfo,
        effectCount: args.effects?.length || 0,
      },
      null,
      2
    )
  )

  return {
    updatedCharacters: args.updatedCharacters,
    actionSummary: args.actionSummary,
    rollInfo: args.rollInfo,
    effects: args.effects,
    beatsToAppend: args.beatsToAppend,
  }
}
