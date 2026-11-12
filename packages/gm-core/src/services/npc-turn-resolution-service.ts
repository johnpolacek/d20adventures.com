import { withStatusWord } from "../sheet/death"
import type { TurnCharacter } from "../types/adventure"

export type NpcTurnEffect = {
  targetId: string
  status?: string
  equipmentToAdd?: Array<{ name: string; description?: string }>
}

export function applyNpcEffectsToCharacters(args: { characters: TurnCharacter[]; npcId: string; effects?: NpcTurnEffect[]; applyHealthAndStatus: boolean }): TurnCharacter[] {
  return args.characters.map((character) => {
    const effect = args.effects?.find((entry) => entry.targetId === character.id)
    let updated = { ...character }

    if (effect) {
      if (args.applyHealthAndStatus && effect.status) updated = withStatusWord(updated, effect.status)

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
