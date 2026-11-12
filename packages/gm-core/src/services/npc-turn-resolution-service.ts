import type { TurnCharacter } from "../types/adventure"

export type NpcTurnEffect = {
  targetId: string
  equipmentToAdd?: Array<{ name: string; description?: string }>
}

// What an NPC's turn hands over. Hit points and conditions are the engine's: an outcome sets neither.
export function applyNpcEffectsToCharacters(args: { characters: TurnCharacter[]; npcId: string; effects?: NpcTurnEffect[] }): TurnCharacter[] {
  return args.characters.map((character) => {
    const effect = args.effects?.find((entry) => entry.targetId === character.id)
    const updated = { ...character }

    if (effect) {
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
