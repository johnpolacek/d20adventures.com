import { appendNarrative } from "@/lib/services/narrative-service"
import type { TurnCharacter } from "@/types/adventure"

export function buildNpcTurnUpdatePatch(args: { currentNarrative?: string; narrativeToAppend?: string; updatedCharacters: TurnCharacter[] }): {
  narrative: string
  characters: TurnCharacter[]
  updatedAt: number
} {
  return {
    narrative: appendNarrative(args.currentNarrative || "", args.narrativeToAppend || ""),
    characters: args.updatedCharacters,
    updatedAt: Date.now(),
  }
}

export function buildDeadCharacterCompletion(args: { characters: TurnCharacter[] }): {
  deadCharacters: TurnCharacter[]
  updatedCharacters: TurnCharacter[]
  hasChanges: boolean
} {
  const deadCharacters = args.characters.filter((character) => !character.isComplete && (character.healthPercent === 0 || character.status === "dead"))
  if (deadCharacters.length === 0) {
    return {
      deadCharacters,
      updatedCharacters: args.characters,
      hasChanges: false,
    }
  }

  return {
    deadCharacters,
    updatedCharacters: args.characters.map((character) => {
      if (!character.isComplete && (character.healthPercent === 0 || character.status === "dead")) {
        return {
          ...character,
          hasReplied: true,
          isComplete: true,
        }
      }
      return character
    }),
    hasChanges: true,
  }
}
