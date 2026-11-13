import { checkBonus } from "../sheet/check"
import { classConcentrationModes } from "../sheet/class-rules"
import { costWhenCountered, reactionsToCast } from "../sheet/counterspell"
import { afterHarm } from "../sheet/death"
import { useBonusAction } from "../sheet/features"
import type { Ask } from "../sheet/reactions"
import { areEnemies } from "../sheet/sides"
import type { Floor } from "../sheet/space"
import { settleConcentration } from "../sheet/spell-effects"
import { castInSpace } from "../sheet/spell-space"
import { againOf, castAgain, castCost, castSpell, spellById, withCastSpent } from "../sheet/spells"
import type { StoryBeat, StoryBy } from "../story/beats"
import type { StoryNames } from "../story/render"
import { castAnswerBeats, castBeats, concentrationBeat } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import { hasFled, isDead, isDown } from "../utils/turn-actors"

/**
 * A Bonus Action used beside the turn's action, a hero's or an NPC's by the one path: a feature (Cunning Action, a
 * stat block's Nimble Escape, Second Wind) or a spell that takes one (Healing Word, a Priest's Bless by Divine Aid).
 * The spell is cast by the same rules as any other, and the story keeps it with no telling of its own: the turn's
 * action is told after. A spell they hold is used again with no cost (Spiritual Weapon's attack). One cast is measured
 * where the caster now stands, may be countered by the other side, and Magic Missile may draw Shield, each answered by
 * `ask`. `floor` is fetched only for a spell. Everyone comes back as it left them, with the beats to tell and the fact
 * of a feature used, for the game master.
 */
export async function useBonus(args: {
  characters: TurnCharacter[]
  actorId: string
  bonus: { feature: string; target?: string; targets?: string[] }
  floor: () => Promise<Floor | undefined>
  ask: Ask
  d20: () => number
  roll: (sides: number) => number
  by: StoryBy
  names: StoryNames
}): Promise<{ characters: TurnCharacter[]; beats: StoryBeat[]; fact?: string }> {
  let characters = args.characters
  const { bonus } = args
  const actor = characters.find((character) => character.id === args.actorId)
  const spell = spellById.get(bonus.feature)
  if (!spell) {
    const used = useBonusAction({ characters, actorId: args.actorId, feature: bonus.feature, target: bonus.target, roll: args.roll })
    const beats: StoryBeat[] = used.use
      ? [
          {
            kind: "feature",
            by: args.by,
            character: args.actorId,
            name: used.use.name,
            text: used.use.fact,
            ...(used.use.target ? { target: used.use.target } : {}),
            ...(used.use.harm ? { harm: used.use.harm } : {}),
          },
        ]
      : []
    return { characters: used.characters, beats, ...(used.use ? { fact: used.use.fact } : {}) }
  }
  const again = actor ? againOf(actor).find((entry) => entry.spell.id === spell.id) : undefined
  const cost = actor && !again ? castCost(actor, spell.id) : undefined
  if (!actor || !(again || (cost && !("problem" in cost)))) return { characters, beats: [] }
  const paid = cost && !("problem" in cost) ? cost : undefined
  const everyone = characters.filter((character) => !isDead(character) && !hasFled(character))
  // Who it is cast on: those named, or for a spell attack the only foe here, and otherwise the caster.
  const foes = everyone.filter((character) => areEnemies(character, actor) && !isDown(character))
  const named = bonus.targets ?? (bonus.target ? [bonus.target] : spell.attack ? (foes.length === 1 ? [foes[0].id] : []) : [actor.id])
  const floor = again?.spell.id === "spiritual-weapon" ? undefined : await args.floor()
  const spaced = floor ? castInSpace({ spell, caster: actor, everyone, named, floor }) : undefined
  if (spaced?.problem || !named.length) {
    const problem = spaced?.problem ?? { name: "No One To Cast On", text: `${actor.name} has no one to cast ${spell.name} on.` }
    return { characters, beats: [{ kind: "feature", by: args.by, character: actor.id, name: problem.name, text: problem.text }] }
  }
  const targets = spaced?.targets ?? named
  const answered = paid ? reactionsToCast({ characters, casterId: actor.id, spell, targets, ask: args.ask, d20: args.d20, roll: args.roll }) : undefined
  if (answered) characters = answered.characters
  const reacted = answered ? castAnswerBeats(args.by, answered, args.names) : []
  if (answered?.countered && paid) {
    characters = characters.map((character) => (character.id === actor.id ? withCastSpent(character, costWhenCountered(paid.cost)) : character))
    return { characters, beats: reacted }
  }
  const how = {
    characters,
    casterId: actor.id,
    targets,
    d20: args.d20,
    roll: args.roll,
    ...(spaced && Object.keys(spaced.cover).length ? { cover: spaced.cover } : {}),
    ...(spaced?.measured ? { measured: true } : {}),
  }
  // Cast at the slot it spends: a Healing Word from a level 2 slot heals as a level 2 casting.
  const level = paid?.cost.kind === "slot" ? paid.cost.level : undefined
  const cast = again ? castAgain({ ...how, spellId: spell.id }) : castSpell({ ...how, spell, level })
  const spent = cast.characters.map((character) => (character.id === actor.id && paid ? withCastSpent(character, paid.cost) : character))
  // A caster the spell hurt saves to keep Concentration.
  const kept = settleConcentration({
    before: characters,
    after: spent.map(afterHarm),
    bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
    modes: classConcentrationModes,
    d20: args.d20,
  })
  return {
    characters: kept.characters,
    beats: [...reacted, ...castBeats(args.by, actor, spell, cast, args.names), ...kept.saves.map((save) => concentrationBeat(args.by, save, args.names))],
    fact: [`${actor.name} casts ${spell.name} as a Bonus Action.`, ...cast.facts].join(" "),
  }
}
