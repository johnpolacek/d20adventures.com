import type { TurnCharacter } from "../types/adventure"
import type { PCTemplate } from "../types/character"
import { rollD20 } from "../utils/game-utils"
import type { RuntimeArtifacts, RuntimeEncounter } from "./types"

export function buildLocalWikiTurnCharacters(args: {
  artifacts: RuntimeArtifacts
  encounter: RuntimeEncounter
  players: Array<{ userId: string; characterId: string; controlledBy?: "ai" }>
  existingPlayerCharacters?: TurnCharacter[]
  // Sheets already loaded from storage, keyed by the exact characterId in
  // players[]. Saved characters are filed under a slug of their name while
  // their sheet keeps an unrelated generated id, so matching on the file name
  // alone misses them.
  sheetsByCharacterId?: Record<string, PCTemplate>
}): TurnCharacter[] {
  const characters: TurnCharacter[] = []

  for (const player of args.players) {
    const id =
      player.characterId
        .split("/")
        .pop()
        ?.replace(/\.json$/, "") ?? player.characterId
    const sheet =
      args.sheetsByCharacterId?.[player.characterId] ??
      args.artifacts.characterSheets.premadeCharacters[id]?.sheet ??
      args.existingPlayerCharacters?.find((character) => character.id === id || character.id === player.characterId)
    if (!sheet) throw new Error(`Missing player character sheet for ${player.characterId}`)
    characters.push({
      ...sheet,
      id: sheet.id,
      type: "pc",
      userId: player.userId,
      controlledBy: player.controlledBy,
      initiative: rollD20(),
      hasReplied: false,
      isComplete: false,
    })
  }

  for (const npcRef of args.encounter.npcRefs) {
    const sheet = args.artifacts.characterSheets.npcs[npcRef.id]?.sheet
    if (!sheet) throw new Error(`Missing NPC sheet for ${npcRef.id}`)
    characters.push({
      ...sheet,
      id: sheet.id,
      type: "npc",
      initiative: typeof npcRef.initialInitiative === "number" ? npcRef.initialInitiative : rollD20(),
      hasReplied: false,
      isComplete: false,
      behavior: npcRef.behavior ?? sheet.behavior,
    })
  }

  return characters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
}

export function isLocalWikiFinalEncounter(artifacts: RuntimeArtifacts, encounterId: string) {
  return !artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === encounterId)
}
