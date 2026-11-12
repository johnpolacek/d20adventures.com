import type { StoryBeat } from "../story/beats"
import { withStory } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import { takesTurn } from "../utils/turn-actors"

export function buildNpcTurnUpdatePatch(args: { turn: { story: StoryBeat[] }; beatsToAppend: StoryBeat[]; updatedCharacters: TurnCharacter[] }): {
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
  // Everyone down who takes no turn this round: the dead, the Stable, and a hero who dropped mid-round, who makes their
  // Death Saving Throw next round.
  const fallen = (character: TurnCharacter) => !character.isComplete && !takesTurn(character)
  const deadCharacters = args.characters.filter(fallen)
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
      if (fallen(character)) {
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
