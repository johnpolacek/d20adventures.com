import { withHitPoints, withStartingHitPoints } from "../sheet/hit-points"
import { rollInitiative } from "../sheet/stat-block"
import type { TurnCharacter } from "../types/adventure"
import type { PCTemplate } from "../types/character"
import { rollD20 } from "../utils/game-utils"
import type { RuntimeArtifacts, RuntimeEncounter } from "./types"

export function buildLocalWikiTurnCharacters(args: {
  artifacts: RuntimeArtifacts
  encounter: RuntimeEncounter
  players: Array<{ userId: string; characterId: string; controlledBy?: "ai" }>
  // Heroes already in play, or saved heroes not yet in play (with no hit points stored).
  existingPlayerCharacters?: Array<TurnCharacter | PCTemplate>
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
    const carried = args.existingPlayerCharacters?.find((character) => character.id === id || character.id === player.characterId)
    const sheet = args.sheetsByCharacterId?.[player.characterId] ?? args.artifacts.characterSheets.premadeCharacters[id]?.sheet ?? carried
    if (!sheet) throw new Error(`Missing player character sheet for ${player.characterId}`)
    // A player's saved copy of a premade hero may predate the rules. It keeps its own state and takes the
    // adventure's rules sheet for that hero.
    const rules = sheet.sheet ?? (args.artifacts.characterSheets.premadeCharacters[sheet.id] ?? args.artifacts.characterSheets.premadeCharacters[id])?.sheet.sheet
    const hero = {
      ...sheet,
      ...(rules ? { sheet: rules } : {}),
      id: sheet.id,
      type: "pc" as const,
      userId: player.userId,
      controlledBy: player.controlledBy,
      initiative: 0,
      hasReplied: false,
      isComplete: false,
    }
    // A hero enters play at its maximum. One carried from the encounter before keeps the hit points it has.
    // Initiative is rolled as the encounter begins and kept until it ends.
    hero.initiative = rollInitiative(hero, rollD20())
    characters.push(carried?.hitPoints === undefined ? withStartingHitPoints(hero) : withHitPoints(hero, carried.hitPoints))
  }

  for (const npcRef of args.encounter.npcRefs) {
    const sheet = args.artifacts.characterSheets.npcs[npcRef.id]?.sheet
    if (!sheet) throw new Error(`Missing NPC sheet for ${npcRef.id}`)
    characters.push(
      withStartingHitPoints({
        ...sheet,
        id: sheet.id,
        type: "npc" as const,
        // An encounter may fix an NPC's place in the order. Otherwise it rolls with its stat block's bonus.
        initiative: typeof npcRef.initialInitiative === "number" ? npcRef.initialInitiative : rollInitiative({ type: "npc", statBlock: sheet.statBlock }, rollD20()),
        hasReplied: false,
        isComplete: false,
        behavior: npcRef.behavior ?? sheet.behavior,
      })
    )
  }

  return characters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
}

export function isLocalWikiFinalEncounter(artifacts: RuntimeArtifacts, encounterId: string) {
  return !artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === encounterId)
}
