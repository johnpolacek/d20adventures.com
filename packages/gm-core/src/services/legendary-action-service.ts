import type { GmPorts } from "../ports"
import { checkBonus } from "../sheet/check"
import { classConcentrationModes } from "../sheet/class-rules"
import type { DeathRules } from "../sheet/death"
import { legendaryActionsAfter, legendaryActionsOf } from "../sheet/legendary-actions"
import type { EncounterFloor } from "../sheet/placement"
import { ordered } from "../sheet/reactions"
import { settleConcentration } from "../sheet/spell-effects"
import type { StoryBeat } from "../story/beats"
import { storyNames } from "../story/render"
import { attackBeat, concentrationBeat } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import { rollD20, rollDie } from "../utils/game-utils"

/**
 * The Legendary Actions taken as a creature's turn ends, a hero's or an NPC's (../sheet/legendary-actions), as the
 * story keeps them. Each is an
 * entry of its own under the creature's name, then the Opportunity Attacks its move drew and its attack, as a hero's
 * move tells the attacks it draws. The game master reads them in the story and tells them with the next beat. Every
 * reaction is answered by standing orders at once, as on a hero's own move: no player is asked between turns. A
 * party with no Legendary creature in it comes back as it was, with no beats.
 */
export function legendaryAfterTurn(args: { characters: TurnCharacter[]; endedId: string; floor?: EncounterFloor; rules?: DeathRules }): { characters: TurnCharacter[]; beats: StoryBeat[] } {
  if (!args.characters.some((character) => legendaryActionsOf(character))) return { characters: args.characters, beats: [] }
  const ask = (offer: { to: string; id: string; matters: boolean }) => ordered(args.characters.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters)
  const acted = legendaryActionsAfter({ characters: args.characters, endedId: args.endedId, floor: args.floor, d20: rollD20, roll: rollDie, rules: args.rules, ask })
  if (!acted.taken.length) return { characters: args.characters, beats: [] }
  // A caster the blows hurt saves to keep Concentration, and one they dropped loses it.
  const kept = settleConcentration({
    before: args.characters,
    after: acted.characters,
    bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
    modes: classConcentrationModes,
    d20: rollD20,
  })
  const names = storyNames(args.characters)
  const find = (id: string) => kept.characters.find((character) => character.id === id)
  const beats = acted.taken.flatMap((taken): StoryBeat[] => {
    const legend = find(taken.by)
    if (!legend) return []
    const by = { step: "npc" as const, character: legend.id }
    return [
      { kind: "feature", by, character: legend.id, name: `Legendary Action: ${taken.name}`, text: taken.text, ...(taken.target ? { target: taken.target } : {}) },
      ...taken.opportunity.flatMap((made): StoryBeat[] => {
        const attacker = find(made.attacker)
        if (!attacker) return []
        return [
          { kind: "feature", by, character: attacker.id, name: "Opportunity Attack", text: `${attacker.name} strikes as ${legend.name} leaves their reach.`, target: legend.id },
          ...made.reactions.map((reaction): StoryBeat => ({ kind: "feature", by, character: reaction.by, name: reaction.name, text: reaction.text })),
          attackBeat(by, attacker, legend.id, made.blow),
        ]
      }),
      ...taken.reactions.map((reaction): StoryBeat => ({ kind: "feature", by, character: reaction.by, name: reaction.name, text: reaction.text })),
      ...(taken.blow && taken.target ? [attackBeat(by, legend, taken.target, taken.blow)] : []),
    ]
  })
  return { characters: kept.characters, beats: [...beats, ...kept.saves.map((save) => concentrationBeat({ step: "npc", character: save.character }, save, names))] }
}

/**
 * The Legendary Actions after a hero's turn that ended with no roll left to resolve, read and written on the stored
 * turn: a Dodge, a word, a fall to an Opportunity Attack. A turn with no Legendary creature is not written.
 */
export function createLegendaryActionService(ports: GmPorts) {
  async function afterHeroTurn(turnId: string, heroId: string): Promise<void> {
    const turn = await ports.store.getTurn({ turnId })
    if (!turn) return
    const characters = turn.characters as TurnCharacter[]
    if (!characters.some((character) => legendaryActionsOf(character))) return
    // The adventure's rules: with `playerDeath: false` a hero the blow would kill is left Stable instead.
    const adventure = await ports.store.getAdventure({ adventureId: turn.adventureId })
    const plan = adventure ? await ports.content.loadPlan(adventure.settingId, adventure.planId) : undefined
    const acted = legendaryAfterTurn({ characters, endedId: heroId, floor: await ports.content.floor?.(turn.encounterId), rules: { playerDeath: plan?.playerDeath } })
    if (!acted.beats.length) return
    await ports.store.updateTurn({ turnId, patch: { characters: acted.characters, story: [...turn.story, ...acted.beats], updatedAt: Date.now() } })
  }
  return { afterHeroTurn }
}
