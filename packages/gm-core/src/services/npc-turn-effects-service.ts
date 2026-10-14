import type { StoryBeat } from "../story/beats"
import { withStory } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"

export function buildNpcTurnUpdatePatch(args: {
  turn: { narrative?: string; story?: StoryBeat[]; characters: readonly { id: string; name: string }[] }
  beatsToAppend: StoryBeat[]
  updatedCharacters: TurnCharacter[]
}): {
  narrative: string
  story: StoryBeat[]
  characters: TurnCharacter[]
  updatedAt: number
} {
  return {
    ...withStory(args.turn, args.beatsToAppend),
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
