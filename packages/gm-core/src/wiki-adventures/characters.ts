import { atInitiative } from "../sheet/class-rules"
import { conditionsAtEncounterEnd } from "../sheet/conditions"
import { withHitPoints, withStartingHitPoints } from "../sheet/hit-points"
import { rollInitiative } from "../sheet/initiative"
import { raisedTo } from "../sheet/milestone"
import { spellEffectsAtEncounterEnd } from "../sheet/spell-effects"
import type { TurnCharacter } from "../types/adventure"
import type { PCTemplate } from "../types/character"
import { rollD20, rollDie } from "../utils/game-utils"
import { isDead } from "../utils/turn-actors"
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
  // The NPCs of the encounter just left. One who is in this encounter too comes as they left it.
  existingNpcs?: TurnCharacter[]
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
    // A hero who comes on from the encounter before keeps the rules sheet they have, with the levels they hold. A
    // player's saved copy of a premade hero may predate the rules: it keeps its own state and takes the adventure's
    // rules sheet for that hero.
    const rules = carried?.sheet ?? sheet.sheet ?? (args.artifacts.characterSheets.premadeCharacters[sheet.id] ?? args.artifacts.characterSheets.premadeCharacters[id])?.sheet.sheet
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
    // A hero enters play at its maximum. One carried from the encounter before keeps the hit points it has, and one
    // carried at 0 stays down as they were: dead, Stable, or dying with their Death Saving Throws so far.
    // Initiative is rolled as the encounter begins and kept until it ends.
    hero.initiative = rollInitiative(hero, rollD20(), rollD20())
    // The conditions of the fight they left are over, and the lasting ones come with them.
    const was = carried as Partial<TurnCharacter> | undefined
    const kept = was ? conditionsAtEncounterEnd({ conditions: was.conditions }).conditions : undefined
    // A spell that lasts longer than a minute comes along, with its caster's Concentration. The rest end with the encounter.
    const lasting = was ? spellEffectsAtEncounterEnd({ spellEffects: was.spellEffects, concentration: was.concentration }) : undefined
    // Spent spell slots, feature uses and Hit Point Dice stay spent, and Temporary Hit Points stay until a hit takes
    // them: only a rest gives back (../sheet/rest). A held Bardic Inspiration die ends with the encounter, standing in
    // for its hour (../sheet/features).
    const state = {
      spellEffects: lasting?.spellEffects,
      concentration: lasting?.concentration,
      tempHitPoints: was?.tempHitPoints,
      // A Beast's shape lasts hours, which only a rest counts (../sheet/rest).
      shape: was?.shape,
      conditions: kept,
      turnEffects: undefined,
      featureUses: was?.featureUses,
      inspiration: undefined,
      spellSlots: was?.spellSlots,
      hitDiceUsed: was?.hitDiceUsed,
      // The player's own orders for the hero's reactions go on with them.
      standingOrders: was?.standingOrders,
      dead: was?.dead,
      deathSaves: was?.hitPoints === 0 ? was.deathSaves : undefined,
    }
    const standing = carried?.hitPoints === undefined ? withStartingHitPoints(hero) : { ...withHitPoints(hero, carried.hitPoints), ...state }
    // A hero below the level the adventure is played at is owed the levels up to it. One the AI plays takes them at
    // once, and a player's is marked for the level-up screen (../sheet/milestone).
    // Then what their class does as Initiative is rolled: a Monk's Uncanny Metabolism.
    characters.push(atInitiative(raisedTo(standing, Math.max(args.artifacts.manifest.level ?? 1, carried?.levelDue ?? 1)), rollDie))
  }

  for (const npcRef of args.encounter.npcRefs) {
    const sheet = args.artifacts.characterSheets.npcs[npcRef.id]?.sheet
    if (!sheet) throw new Error(`Missing NPC sheet for ${npcRef.id}`)
    // An NPC who was in the encounter just left comes as they left it. The dead stay out. The hurt stay hurt, with
    // their lasting conditions, the spells that outlast a minute, and what they have spent, as a hero does.
    const was = args.existingNpcs?.find((npc) => npc.id === sheet.id)
    if (was && isDead(was)) continue
    // Its side is this encounter's mark alone (../sheet/sides).
    const { side: _, ...unsided } = sheet
    const npc = {
      ...unsided,
      id: sheet.id,
      type: "npc" as const,
      ...(npcRef.side ? { side: npcRef.side } : {}),
      // An encounter may fix an NPC's place in the order. Otherwise it rolls with its stat block's bonus.
      initiative: typeof npcRef.initialInitiative === "number" ? npcRef.initialInitiative : rollInitiative({ type: "npc", statBlock: sheet.statBlock, sheet: sheet.sheet }, rollD20()),
      hasReplied: false,
      isComplete: false,
      behavior: npcRef.behavior ?? sheet.behavior,
    }
    if (was?.hitPoints === undefined) {
      characters.push(withStartingHitPoints(npc))
      continue
    }
    const lasting = spellEffectsAtEncounterEnd({ spellEffects: was.spellEffects, concentration: was.concentration })
    // A day's casts stay spent, and Temporary Hit Points stay, until a Long Rest.
    characters.push({
      ...withHitPoints(npc, was.hitPoints),
      conditions: conditionsAtEncounterEnd({ conditions: was.conditions }).conditions,
      spellEffects: lasting.spellEffects,
      concentration: lasting.concentration,
      featureUses: was.featureUses,
      tempHitPoints: was.tempHitPoints,
    })
  }

  return characters.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
}

export function isLocalWikiFinalEncounter(artifacts: RuntimeArtifacts, encounterId: string) {
  return !artifacts.graph.encounterTransitions.some((transition) => transition.fromEncounterId === encounterId)
}
