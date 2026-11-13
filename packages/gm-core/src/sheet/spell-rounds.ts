import type { AbilityId, ConditionId, DamageTypeId } from "@d20/srd"
import type { Spell } from "@d20/srd/schema/spells"
import { damageTaken, defensesOf, rollDamage } from "./attack"
import { checkBonus } from "./check"
import { classConcentrationModes, roundStartRules } from "./class-rules"
import { conditionName, withCondition } from "./conditions"
import { afterHarm, type DeathRules, regenerate, withDamage } from "./death"
import { enters, feetIn, floorAreas, touchedThisTurn, withTouch } from "./floor-areas"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { ridersAtRoundEnd } from "./hit-riders"
import { legendaryResistanceWords, withLegendaryResistanceSpent } from "./legendary-resistance"
import { typesTaken } from "./monster-traits"
import { rescueWords, withRescueSpent } from "./save-rules"
import { type Point, sizeOf } from "./space"
import { type ConcentrationSave, settleConcentration } from "./spell-effects"
import { type RoundContext, roundRules } from "./spell-rules"
import { type Castee, rollSave, type SaveRoll, spellcastingFor } from "./spells"
import { recharged } from "./stat-block-actions"

/**
 * What lasting spells do as one round gives way to the next. The engine runs a round as everyone's turns together, so
 * "at the end of each of its turns" and "starts its turn there" both fall here, once a round, before the next round
 * begins (./death `atRoundStart`). Run it on every round within an encounter, and not when the story moves to another.
 *
 * What each spell does here is its own rules' `round` (./spell-rules), from the files of ./spell-mechanics, run for each
 * character in the order the files are listed: a save repeated at the end of each turn, Sleep's second save, a burn
 * as a turn starts, Acid Arrow's later burn, Spirit Guardians round its caster, and the areas that stay on the floor.
 *
 * `d20` throws each save and `roll` each damage die. Everyone comes back as it left them, with the saves, the harm,
 * the conditions given or ended, and what happened in words for the game master.
 */
export function spellsAtRoundEnd<T extends Castee & { position?: Point }>(args: {
  characters: readonly T[]
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): { characters: T[]; saves: SaveRoll[]; harm: Harm[]; conditions: ConditionChange[]; facts: string[]; told: RoundFact[] } {
  const { round, done } = roundTools(args)
  for (const rule of roundRules()) for (const was of args.characters) rule(round, was)
  return done()
}

/** What the round's tools leave: everyone as they are, with the saves, harm and conditions, and the facts in words. */
type Turned<T> = { characters: T[]; saves: SaveRoll[]; harm: Harm[]; conditions: ConditionChange[]; facts: string[]; told: RoundFact[] }

// The tools every spell rule shares as a round turns or a move is walked (./spell-rules `RoundContext`), over everyone as
// they are left so far, and what they come to.
function roundTools<T extends Castee & { position?: Point }>(args: {
  characters: readonly T[]
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): { round: RoundContext; done: () => Turned<T> } {
  let characters = [...args.characters]
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const told: RoundFact[] = []
  // A fact for the game master, kept with the one it is about and the spell, for the story.
  const tell = (character: string, spell: string, text: string) => {
    facts.push(text)
    told.push({ character, spell, text })
  }
  const find = (id: string | undefined) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const standing = (id: string) => {
    const now = find(id)
    if (!now) return ""
    if (now.dead) return ` ${now.name} dies.`
    const hitPoints = hitPointsOf(now)
    return hitPoints ? ` ${now.name} has ${hitPoints.current} of ${hitPoints.maximum} hit points.` : ""
  }
  const hurt = (id: string, dice: string, type: DamageTypeId, amountOf: (taken: number) => number = (taken) => taken) => {
    const target = find(id)
    if (!target) return 0
    const rolled = rollDamage([{ dice, type }], args.roll)
    const defenses = defensesOf(target)
    const amount = amountOf(damageTaken(rolled, defenses))
    put(afterHarm(withDamage(target, amount, { rules: args.rules, types: typesTaken(rolled, defenses) }).character))
    const [part] = rolled.parts
    harm.push({ target: id, kind: "damage", dice: part?.dice ?? [], sides: part?.sides, bonus: part?.bonus ?? 0, type, amount })
    return amount
  }
  const save = (target: T, ability: AbilityId, caster: T, spell: Spell, against: readonly ConditionId[] = []) => {
    const dc = spellcastingFor(caster, spell.id)?.saveDc ?? 10
    // Made to avoid or end the conditions it names, which a Legendary creature may choose to succeed against.
    const thrown = rollSave({ target, ability, dc, d20: args.d20, roll: args.roll, characters, against, stakes: { conditions: against } })
    saves.push(thrown)
    if (thrown.legendary) {
      const spent = withLegendaryResistanceSpent(find(target.id) ?? target)
      put(spent)
      tell(target.id, spell.name, legendaryResistanceWords(target.name, spent))
    }
    if (thrown.rescued) {
      put(withRescueSpent(find(thrown.rescued.by ?? target.id) ?? target, thrown.rescued))
      tell(target.id, spell.name, rescueWords(target.name, thrown.rescued, thrown))
    }
    return thrown
  }
  const verdict = (target: T, thrown: SaveRoll, spell: Spell, caster: T) =>
    `${target.name} ${thrown.success ? "SUCCEEDS on" : "FAILS"} the saving throw against ${caster.name}'s ${spell.name} (${thrown.total} against DC ${thrown.dc})`
  const give = (target: T, id: ConditionId, spell: Spell, caster: T, span: "turn" | "lasting") => {
    // Given before the round begins, so a condition of one turn lasts through the turn to come. Prone ends as the turn
    // begins, when its bearer stands with half their Speed.
    const given = withCondition(target, { id, source: caster.id, span, spell: spell.id }, { acted: id !== "prone", present: characters })
    if (!given.given) return tell(target.id, spell.name, `${target.name} cannot be ${conditionName(id)} and is not.`)
    put(afterHarm(given.character))
    conditions.push({ target: target.id, condition: id })
    return tell(target.id, spell.name, `${target.name} is now ${conditionName(id)}.`)
  }
  // A spell still holds while its caster is here, and concentrating on it when it takes Concentration.
  const holds = (spell: Spell, by: string | undefined) => {
    const caster = find(by)
    return caster && !caster.dead && (!spell.duration.concentration || caster.concentration?.spell === spell.id) ? caster : undefined
  }
  const round: RoundContext = {
    everyone: () => characters,
    replace: (now) => {
      characters = [...now] as T[]
    },
    find,
    put: (after) => put(after as T),
    hurt,
    save: (target, ability, caster, spell, against) => save(target as T, ability, caster as T, spell, against),
    verdict: (target, thrown, spell, caster) => verdict(target as T, thrown, spell, caster as T),
    give: (target, id, spell, caster, span) => {
      give(target as T, id, spell, caster as T, span)
    },
    tell,
    standing,
    holds,
    conditions,
  }
  return { round, done: () => ({ characters, saves, harm, conditions, facts, told }) }
}

/**
 * A step of a move through the areas that stay on the floor (./floor-areas), from one point to the next of the path:
 * each area the mover comes into touches them as its rules say (./spell-rules `stays`), once a turn unless it says each
 * time, and one they walk in touches them for the feet walked (Spike Growth). A forced move or a teleport is no walk,
 * and is not read here. Everyone comes back as the step left them, the mover standing at its end, with the saves, the
 * harm, and what happened in words.
 */
export function areasWalked<T extends Castee & { position?: Point }>(args: {
  characters: readonly T[]
  moverId: string
  from: Point
  to: Point
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): Turned<T> {
  const moved = args.characters.map((character) => (character.id === args.moverId ? { ...character, position: { x: args.to.x, y: args.to.y } } : character))
  const { round, done } = roundTools({ ...args, characters: moved })
  const mover = round.find(args.moverId)
  if (!mover) return done()
  const size = sizeOf(mover)
  for (const area of floorAreas(args.characters)) {
    const when = area.rules.when ?? []
    const touches = area.rules.touches
    if (!touches) continue
    const now = round.find(args.moverId)
    if (!now || now.dead) break
    const feet = when.includes("move") ? feetIn(area, args.from, args.to, size) : 0
    if (feet > 0) touches({ round, area, creature: now, moment: "move", feet })
    if (!when.includes("enter") || !enters(area, args.from, args.to, size)) continue
    if (!area.rules.eachEntry && touchedThisTurn(now, area)) continue
    touches({ round, area, creature: now, moment: "enter" })
    const after = round.find(args.moverId)
    if (after) round.put(withTouch(after, area))
  }
  return done()
}

/** A fact of a round's turn, with the one it is about and the spell's name. */
export type RoundFact = { character: string; spell: string; text: string }

/**
 * The turn of a round within an encounter, before the next begins (./death `atRoundStart`): what lasting spells do
 * (`spellsAtRoundEnd`), then a stat block's holds (./hit-riders `ridersAtRoundEnd`), then Concentration settled for anyone they hurt or dropped, then a stat block's Recharge rolled
 * and Regeneration as each turn begins (./stat-block-actions `recharged`, ./death `regenerate`), then what a class does
 * as a round begins (./classes). Regeneration belongs to the
 * start of the creature's turn, and the engine starts every turn of a round at once, right after this: it runs here so
 * its fact reaches the story with the round's others. Everyone comes back as it left them, with each fact about the
 * one it is about, for the story: a Concentration save's too, under Concentration, Regeneration's under the trait's
 * name, and a class's under the name it gives.
 */
export function roundTurns<T extends Castee & { position?: Point }>(args: {
  characters: readonly T[]
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): { characters: T[]; told: RoundFact[]; saves: ConcentrationSave[] } {
  const ended = spellsAtRoundEnd(args)
  // A stat block's holds: those ended let go, and one attached drains the one it holds (./hit-riders).
  const held = ridersAtRoundEnd({ characters: ended.characters, roll: args.roll, rules: args.rules })
  const kept = settleConcentration({
    before: args.characters,
    after: held.characters,
    bonus: (caster) => checkBonus(caster, { kind: "save", ability: "con" }),
    modes: classConcentrationModes,
    d20: args.d20,
  })
  const lost = kept.facts.map((text) => ({ character: args.characters.find((character) => character.name && text.startsWith(character.name))?.id ?? "", spell: "Concentration", text }))
  // A stat block's spent Recharge rolls its d6 as the creature's turn starts (./stat-block-actions), with no telling.
  const regenerated = kept.characters.map((character) => regenerate(recharged(character, args.roll)))
  const regrown = regenerated.flatMap(({ character, fact, trait }) => (fact && trait ? [{ character: character.id, spell: trait, text: fact }] : []))
  const classed: RoundFact[] = []
  // A class may have one repeat a save its hero's feature forced (Intimidating Presence), against that hero's DC.
  const round = { everyone: regenerated.map(({ character }) => character), d20: args.d20, roll: args.roll }
  const characters = regenerated.map(({ character }) =>
    roundStartRules().reduce((now, rule) => {
      const begun = rule(now, round)
      if (begun.told) classed.push({ character: now.id, spell: begun.told.name, text: begun.told.text })
      return begun.character
    }, character)
  )
  return { characters, told: [...ended.told, ...held.told, ...lost.filter((fact) => fact.character), ...regrown, ...classed], saves: kept.saves }
}
