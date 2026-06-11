import { appendNarrative } from "@/lib/services/narrative-service"
import { analyzeAndApplyDiceRoll } from "@/lib/services/turn-update-service"
import type { Turn, TurnCharacter } from "@/types/adventure"

export type NpcTurnEffect = {
  targetId: string
  healthPercentDelta?: number
  status?: string
  equipmentToAdd?: Array<{ name: string; description?: string }>
}

export function applyNpcEffectsToCharacters(args: { characters: TurnCharacter[]; npcId: string; effects?: NpcTurnEffect[]; applyHealthAndStatus: boolean }): TurnCharacter[] {
  return args.characters.map((character) => {
    const effect = args.effects?.find((entry) => entry.targetId === character.id)
    const updated = { ...character }

    if (effect) {
      if (args.applyHealthAndStatus && effect.healthPercentDelta !== undefined) {
        const oldHealth = character.healthPercent ?? 100
        const newHealth = Math.max(0, oldHealth + effect.healthPercentDelta)
        updated.healthPercent = newHealth
      }

      if (args.applyHealthAndStatus) {
        updated.status = effect.status || character.status
      }

      if (effect.equipmentToAdd && effect.equipmentToAdd.length > 0) {
        const existingEquipment = Array.isArray(character.equipment) ? character.equipment : []
        updated.equipment = [...existingEquipment, ...effect.equipmentToAdd]
      }
    }

    if (character.id === args.npcId) {
      updated.hasReplied = true
      updated.isComplete = true
    }
    return updated
  })
}

export async function reconcileNpcRollWithAi(args: {
  turn: Turn
  updatedCharacters: TurnCharacter[]
  updatedNarrative: string
  narrativeToAppend: string
  diceRoll: {
    rollType: string
    baseRoll: number
    modifier: number
    result: number
    difficulty: number
    character: string
    target?: string
    success: boolean
  }
}): Promise<TurnCharacter[]> {
  console.log("[LLM DM] Calling analyzeAndApplyDiceRoll with dice roll", JSON.stringify(args.diceRoll, null, 2))

  args.updatedCharacters.forEach((character) => {
    console.log(`  ${character.name} (${character.id}): ${character.healthPercent}%`)
  })

  const aiTurn = await analyzeAndApplyDiceRoll({
    turn: { ...args.turn, characters: args.updatedCharacters },
    diceRoll: args.diceRoll,
    narrative: appendNarrative(args.updatedNarrative, args.narrativeToAppend),
  })

  console.log(
    "[LLM DM] analyzeAndApplyDiceRoll result",
    JSON.stringify(
      {
        aiTurnCharacters: aiTurn.characters.map((character) => ({
          id: character.id,
          name: character.name,
          healthPercent: character.healthPercent,
          status: character.status,
        })),
      },
      null,
      2
    )
  )

  aiTurn.characters.forEach((aiCharacter) => {
    const originalCharacter = args.updatedCharacters.find((character) => character.id === aiCharacter.id)
    if (!originalCharacter) return

    console.log(`  ${originalCharacter.name} (${aiCharacter.id}):`)
    if (originalCharacter.healthPercent !== aiCharacter.healthPercent) {
      console.log(`    Health: ${originalCharacter.healthPercent}% -> ${aiCharacter.healthPercent}%`)
    }
    if (originalCharacter.status !== aiCharacter.status) {
      console.log(`    Status: "${originalCharacter.status}" -> "${aiCharacter.status}"`)
    }
  })

  return args.updatedCharacters.map((originalCharacter) => {
    const aiCharacter = aiTurn.characters.find((entry) => entry.id === originalCharacter.id)
    return aiCharacter ? { ...originalCharacter, ...aiCharacter } : originalCharacter
  })
}
