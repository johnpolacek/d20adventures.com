import type { AbilityId, ConditionId, DamageTypeId } from "@d20/srd"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { isDown } from "../utils/turn-actors"
import { damageTaken, defensesOf, rollDamage } from "./attack"
import { conditionName, withCondition } from "./conditions"
import { afterHarm, type DeathRules, withDamage } from "./death"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { type Point, placedOf, within } from "./space"
import { AREA_SPELLS, endConcentration, spellEnded } from "./spell-effects"
import { type Castee, rollSave, type SaveRoll, spellcastingOf } from "./spells"

/**
 * What lasting spells do as one round gives way to the next. The engine runs a round as everyone's turns together, so
 * "at the end of each of its turns" and "starts its turn there" both fall here, once a round, before the next round
 * begins (./death `atRoundStart`). Run it on every round within an encounter, and not when the story moves to another.
 *
 * - A save a spell's target repeats at the end of each of its turns, ending the spell on itself on a success: Hold
 *   Person, Blindness/Deafness, Ray of Enfeeblement, Slow, Hideous Laughter. Fear's, made only out of its caster's
 *   sight, is not.
 * - Acid Arrow's 2d4 Acid at the end of its target's next turn, and 1d4 more for each slot level above 2.
 * - Spirit Guardians: each creature not of its caster's side within 15 feet of them makes a Wisdom save, taking 3d8
 *   Radiant damage, and 1d8 more for each slot level above 3, or half on a success. Its Speed is not halved.
 * - The areas that stay on the floor, for those still in them: Web's Dexterity save or Restrained, Stinking Cloud's
 *   Constitution save or Poisoned through the turn, and Sleet Storm's Dexterity save or Prone and their Concentration
 *   lost.
 *
 * `d20` throws each save and `roll` each damage die. Everyone comes back as it left them, with the saves, the harm,
 * the conditions given or ended, and what happened in words for the game master.
 */
export function spellsAtRoundEnd<T extends Castee & { position?: Point }>(args: {
  characters: readonly T[]
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): { characters: T[]; saves: SaveRoll[]; harm: Harm[]; conditions: ConditionChange[]; facts: string[] } {
  let characters = [...args.characters]
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
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
    const amount = amountOf(damageTaken(rolled, defensesOf(target)))
    put(afterHarm(withDamage(target, amount, { rules: args.rules }).character))
    const [part] = rolled.parts
    harm.push({ target: id, kind: "damage", dice: part?.dice ?? [], sides: part?.sides, bonus: part?.bonus ?? 0, type, amount })
    return amount
  }
  const save = (target: T, ability: AbilityId, caster: T) => {
    const dc = spellcastingOf(caster)?.saveDc ?? 10
    const thrown = rollSave({ target, ability, dc, d20: args.d20, roll: args.roll, characters })
    saves.push(thrown)
    return thrown
  }
  const verdict = (target: T, thrown: SaveRoll, spell: Spell, caster: T) =>
    `${target.name} ${thrown.success ? "SUCCEEDS on" : "FAILS"} the saving throw against ${caster.name}'s ${spell.name} (${thrown.total} against DC ${thrown.dc})`
  const give = (target: T, id: ConditionId, spell: Spell, caster: T, span: "turn" | "lasting") => {
    // Given before the round begins, so a condition of one turn lasts through the turn to come. Prone ends as the turn
    // begins, when its bearer stands with half their Speed.
    const given = withCondition(target, { id, source: caster.id, span, spell: spell.id }, { acted: id !== "prone" })
    if (!given.given) return facts.push(`${target.name} cannot be ${conditionName(id)} and is not.`)
    put(afterHarm(given.character))
    conditions.push({ target: target.id, condition: id })
    return facts.push(`${target.name} is now ${conditionName(id)}.`)
  }
  // A spell still holds while its caster is here, and concentrating on it when it takes Concentration.
  const holds = (spell: Spell, by: string | undefined) => {
    const caster = find(by)
    return caster && !caster.dead && (!spell.duration.concentration || caster.concentration?.spell === spell.id) ? caster : undefined
  }

  // Saves repeated at the end of each of the target's turns.
  for (const was of args.characters) {
    const held = new Map<string, string | undefined>()
    for (const effect of was.spellEffects ?? []) held.set(effect.spell, effect.by)
    for (const entry of was.conditions ?? []) if (entry.spell) held.set(entry.spell, entry.source)
    for (const [id, by] of held) {
      const spell = spellById.get(id)
      const repeat = spell?.saves?.find((entry) => entry.when === "end-of-turn" && entry.onSuccess === "ends")
      const target = find(was.id)
      const caster = spell && holds(spell, by)
      if (!spell || !repeat || NOT_REPEATED.has(id) || !target || target.dead || isDown(target) || !caster) continue
      const thrown = save(target, repeat.ability, caster)
      facts.push(`${verdict(target, thrown, spell, caster)}${thrown.success ? `, and ${spell.name} ends on them` : ""}.`)
      if (!thrown.success) continue
      const ending = (find(was.id) as T).conditions?.filter((entry) => entry.spell === id).map((entry) => entry.id) ?? []
      put(spellEnded(find(was.id) as T, (spellId) => spellId === id))
      for (const condition of ending) conditions.push({ target: was.id, condition, ends: true })
    }
  }

  // Acid Arrow's burn at the end of its target's next turn.
  for (const was of args.characters) {
    const effect = was.spellEffects?.find((entry) => entry.spell === "acid-arrow" && entry.turns === 1)
    const target = find(was.id)
    const spell = spellById.get("acid-arrow")
    if (!effect || !target || target.dead || !spell) continue
    const amount = hurt(was.id, `${2 + Math.max(0, (effect.amount ?? spell.level) - spell.level)}d4`, "acid")
    facts.push(`Acid Arrow's acid burns ${target.name} again for ${amount} acid damage.${standing(was.id)}`)
  }

  // Spirit Guardians, round its caster.
  for (const was of args.characters) {
    const effect = was.spellEffects?.find((entry) => entry.spell === "spirit-guardians" && entry.by === was.id)
    const spell = spellById.get("spirit-guardians")
    const caster = find(was.id)
    const at = caster && placedOf(caster)
    if (!effect || !spell || !caster || !at || caster.concentration?.spell !== spell.id) continue
    const area = spell.range.area?.size ?? 15
    const above = Math.max(0, (effect.amount ?? spell.level) - spell.level)
    for (const other of characters) {
      const there = placedOf(other)
      if (other.id === caster.id || other.type === caster.type || other.dead || !there || !within(at, there, area)) continue
      const thrown = save(other, "wis", caster)
      const amount = hurt(other.id, `${3 + above}d8`, "radiant", (taken) => (thrown.success ? Math.floor(taken / 2) : taken))
      facts.push(`${verdict(other, thrown, spell, caster)} and takes ${amount} radiant damage.${standing(other.id)}`)
    }
  }

  // The areas on the floor, for those still in them as their turn begins.
  for (const was of args.characters) {
    for (const effect of was.spellEffects ?? []) {
      const spell = spellById.get(effect.spell)
      const target = find(was.id)
      const caster = spell && AREA_SPELLS.has(effect.spell) ? holds(spell, effect.by) : undefined
      if (!spell || !caster || !target || target.dead || isDown(target)) continue
      if (spell.id === "web" && target.conditions?.some((entry) => entry.id === "restrained" && entry.spell === "web")) continue
      const ability = spell.saves?.[0]?.ability ?? "dex"
      const thrown = save(target, ability, caster)
      facts.push(`${verdict(target, thrown, spell, caster)}.`)
      if (thrown.success) continue
      if (spell.id === "web") give(target, "restrained", spell, caster, "lasting")
      if (spell.id === "stinking-cloud") {
        give(target, "poisoned", spell, caster, "turn")
        facts.push(`${target.name} can take no action or Bonus Action this turn.`)
      }
      if (spell.id === "sleet-storm") {
        give(find(was.id) as T, "prone", spell, caster, "turn")
        if ((find(was.id) as T).concentration) {
          const ended = endConcentration(characters, was.id)
          characters = ended.characters
          if (ended.ended) facts.push(`${target.name} loses Concentration, and ${ended.ended} ends.`)
        }
      }
    }
  }

  return { characters, saves, harm, conditions, facts }
}

// Fear's repeated save is made only "If the creature ends its turn in a space where it doesn't have line of sight to
// you": the engine does not read sight, so it is the game master's to tell.
const NOT_REPEATED = new Set(["fear"])
