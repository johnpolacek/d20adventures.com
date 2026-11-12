import type { ConditionId } from "@d20/srd"
import { spellById } from "@d20/srd/spells"
import type { ConditionEntry } from "./condition-entry"
import { conditionName, withoutCondition } from "./conditions"
import type { ConditionChange } from "./harm"
import { endConcentration, spellEnded } from "./spell-effects"
import type { Concentration, SpellEffect } from "./turn-effect"

/**
 * Spells that end what other spells or conditions do, by their SRD 5.2.1 text: Lesser Restoration, Remove Curse and
 * Dispel Magic. Each falls on the first of its targets.
 */

type Ended = { id: string; name: string; conditions?: readonly ConditionEntry[]; spellEffects?: readonly SpellEffect[]; concentration?: Concentration; isComplete?: boolean }

// The conditions Lesser Restoration ends, in the order the engine chooses among them: the one that hinders most first.
const RESTORED: readonly ConditionId[] = ["paralyzed", "blinded", "poisoned", "deafened"]

/**
 * What a spell that ends things does to its target, or nothing for any other spell. Lesser Restoration ends one of
 * Blinded, Deafened, Paralyzed or Poisoned, the one that hinders most. Remove Curse ends Bestow Curse. Dispel Magic ends
 * every spell on the target of the slot's level or lower, and for each higher one the caster makes an ability check
 * with their spellcasting ability (`modifier`) against 10 and its level. A spell ended this way ends wholly: where its
 * caster concentrates on it, that Concentration ends and it leaves everyone it took.
 */
export function endsBySpell<T extends Ended>(args: {
  spell: { id: string; name: string }
  slot: number
  caster: { name: string }
  targets: readonly string[]
  characters: readonly T[]
  d20: () => number
  modifier: number
}): { characters: T[]; conditions: ConditionChange[]; facts: string[] } | undefined {
  if (!["lesser-restoration", "remove-curse", "dispel-magic"].includes(args.spell.id)) return undefined
  let characters = [...args.characters]
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const target = characters.find((character) => character.id === args.targets[0])
  if (!target) return { characters, conditions, facts }
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }

  if (args.spell.id === "lesser-restoration") {
    const ends = RESTORED.find((id) => target.conditions?.some((entry) => entry.id === id))
    if (!ends) facts.push(`${target.name} has none of the conditions Lesser Restoration ends.`)
    else {
      put(withoutCondition(target, ends).character)
      conditions.push({ target: target.id, condition: ends, ends: true })
      facts.push(`Lesser Restoration ends ${target.name}'s ${conditionName(ends)} condition.`)
    }
    return { characters, conditions, facts }
  }

  // The spells on the target, each with whoever cast it.
  const on = new Map<string, { spell: string; by?: string }>()
  for (const effect of target.spellEffects ?? []) on.set(`${effect.spell}:${effect.by}`, { spell: effect.spell, by: effect.by })
  for (const entry of target.conditions ?? []) if (entry.spell) on.set(`${entry.spell}:${entry.source ?? ""}`, { spell: entry.spell, by: entry.source })
  const end = (spellId: string, by: string | undefined) => {
    const holder = by ? characters.find((character) => character.id === by) : undefined
    if (holder?.concentration?.spell === spellId) characters = endConcentration(characters, holder.id).characters
    const now = characters.find((character) => character.id === target.id) as T
    put(spellEnded(now, (id) => id === spellId))
  }

  if (args.spell.id === "remove-curse") {
    const curses = [...on.values()].filter((held) => held.spell === "bestow-curse")
    for (const held of curses) end(held.spell, held.by)
    facts.push(curses.length ? `Remove Curse ends the curse on ${target.name}.` : `No curse the game holds is on ${target.name}.`)
    return { characters, conditions, facts }
  }

  // Dispel Magic.
  if (!on.size) facts.push(`No spell the game holds is on ${target.name}.`)
  for (const held of on.values()) {
    const found = spellById.get(held.spell)
    const name = found?.name ?? held.spell
    const level = found?.level ?? 0
    if (level <= args.slot) {
      end(held.spell, held.by)
      facts.push(`Dispel Magic ends ${name} on ${target.name}.`)
      continue
    }
    const natural = args.d20()
    const total = natural + args.modifier
    const dc = 10 + level
    if (total >= dc) end(held.spell, held.by)
    facts.push(`${args.caster.name} ${total >= dc ? "breaks" : "fails to break"} ${name} on ${target.name} (${total} against DC ${dc}).`)
  }
  return { characters, conditions, facts }
}
