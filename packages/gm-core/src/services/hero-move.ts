import { fallen } from "../sheet/attack"
import { checkBonus } from "../sheet/check"
import { classConcentrationModes } from "../sheet/class-rules"
import type { DeathRules } from "../sheet/death"
import { afterHarm } from "../sheet/death"
import type { Moved } from "../sheet/moves"
import { moveWithReactions, ordered } from "../sheet/reactions"
import { settleConcentration } from "../sheet/spell-effects"
import { moveBeats, type StoryBeat } from "../story/beats"
import { storyNames } from "../story/render"
import { attackBeat, concentrationBeat } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import { rollD20, rollDie } from "../utils/game-utils"

/**
 * A hero's move on their turn, made on the floor with all it draws: those whose reach it leaves may strike as it does,
 * each by their standing order at once, and the hero may answer them. The areas on the floor touch the hero as they
 * walk. A caster the blows hurt saves to keep Concentration. One who took the Disengage action draws no attack, and
 * neither does a move while no fight is on (`fight: false`). `stopped` says a blow dropped the hero as they moved: the
 * rest of their turn is lost, and the story says so.
 *
 * Made before the action as a reply is read (./adventure-turn-reply-service), and after it when a check broke the grapple
 * that held the hero (./adventure-roll-result-service): Lyra, held by Reinhard, breaks free and climbs out the window.
 */
export function heroMove(args: {
  characters: TurnCharacter[]
  moverId: string
  move: Moved
  fight?: false
  disengaged?: boolean
  by: StoryBeat["by"]
  rules?: DeathRules
}): { characters: TurnCharacter[]; beats: StoryBeat[]; facts: string[]; stopped?: true } {
  const { characters, moverId, move, by } = args
  const went = moveWithReactions({
    characters,
    moverId,
    path: move.path,
    fight: args.fight,
    // A spell's teleport walks nothing (../sheet/moves `takeTeleport`).
    teleport: move.teleport,
    disengaged: args.disengaged,
    ask: (offer) => ordered(characters.find((character) => character.id === offer.to)?.standingOrders, offer.id, offer.matters),
    d20: rollD20,
    roll: rollDie,
    // With `playerDeath: false` a blow that would kill the hero leaves them Stable at 0 Hit Points.
    rules: args.rules,
  })
  const mover = characters.find((character) => character.id === moverId)
  const kept = settleConcentration({
    before: characters,
    after: went.characters.map(afterHarm),
    bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
    modes: classConcentrationModes,
    d20: rollD20,
  })
  const beats: StoryBeat[] = [...moveBeats(by, moverId, went.walked, move.teleport, move.dash ? "hurry" : undefined)]
  const facts: string[] = []
  for (const made of went.attacks) {
    const attacker = kept.characters.find((character) => character.id === made.attacker)
    if (!attacker || !mover) continue
    facts.push(`${attacker.name} strikes as ${mover.name} leaves their reach.`)
    beats.push(
      { kind: "feature", by, character: attacker.id, name: "Opportunity Attack", text: `${attacker.name} strikes as ${mover.name} leaves their reach.`, target: mover.id },
      ...made.reactions.map((taken): StoryBeat => ({ kind: "feature", by, character: taken.by, name: taken.name, text: taken.text })),
      attackBeat(by, attacker, mover.id, made.blow)
    )
  }
  // What the areas on the floor did to the hero as they walked (../sheet/spell-rounds `areasWalked`).
  beats.push(...went.told.map((fact): StoryBeat => ({ kind: "feature", by, character: fact.character, name: fact.spell, text: fact.text })))
  facts.push(...went.told.map((fact) => fact.text))
  beats.push(...kept.saves.map((save) => concentrationBeat(by, save, storyNames(characters))))
  if (!went.stopped) return { characters: kept.characters, beats, facts }
  // A hero the blow dropped does nothing more this turn: what they meant to do is lost. The story says so, or the
  // action they set out on would simply vanish from it.
  const dropped = [...went.attacks].reverse().find((made) => made.blow.hitPoints.after === 0)
  if (mover && dropped) {
    const text = `${fallen(mover.name, dropped.blow)} What ${mover.name} set out to do is not done.`
    beats.push({ kind: "feature", by, character: mover.id, name: "Down", text })
    facts.push(text)
  }
  return { characters: kept.characters, beats, facts, stopped: true }
}
