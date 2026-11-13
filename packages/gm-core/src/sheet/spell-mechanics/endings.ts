import type { ConditionId } from "@d20/srd"
import { spellById } from "@d20/srd/spells"
import { conditionName, withoutCondition } from "../conditions"
import type { ConditionChange } from "../harm"
import { endConcentration, spellEnded } from "../spell-effects"
import type { Ended, EndsArgs, SpellRules } from "../spell-rules"

/**
 * Spells that end what other spells or conditions do, by their SRD 5.2.1 text: Lesser Restoration, Remove Curse and
 * Dispel Magic. Each falls on the first of its targets.
 */

// The conditions Lesser Restoration ends, in the order the engine chooses among them: the one that hinders most first.
const RESTORED: readonly ConditionId[] = ["paralyzed", "blinded", "poisoned", "deafened"]

// The spells on the target, each with whoever cast it, and how one of them is ended wholly: where its caster
// concentrates on it, that Concentration ends and it leaves everyone it took.
function spellsOn<T extends Ended>(args: EndsArgs<T>) {
  let characters = [...args.characters]
  const target = characters.find((character) => character.id === args.targets[0])
  const on = new Map<string, { spell: string; by?: string }>()
  for (const effect of target?.spellEffects ?? []) on.set(`${effect.spell}:${effect.by}`, { spell: effect.spell, by: effect.by })
  for (const entry of target?.conditions ?? []) if (entry.spell) on.set(`${entry.spell}:${entry.source ?? ""}`, { spell: entry.spell, by: entry.source })
  const end = (spellId: string, by: string | undefined) => {
    const holder = by ? characters.find((character) => character.id === by) : undefined
    if (holder?.concentration?.spell === spellId) characters = endConcentration(characters, holder.id).characters
    const now = characters.find((character) => character.id === target?.id) as T
    characters = characters.map((character) => (character.id === now.id ? spellEnded(now, (id) => id === spellId) : character))
  }
  return { target, on, end, characters: () => characters }
}

/** Lesser Restoration ends one of Blinded, Deafened, Paralyzed or Poisoned, the one that hinders most. */
export const lesserRestoration: SpellRules = {
  spells: ["lesser-restoration"],
  ends: (args) => {
    let characters = [...args.characters]
    const conditions: ConditionChange[] = []
    const facts: string[] = []
    const target = characters.find((character) => character.id === args.targets[0])
    if (!target) return { characters, conditions, facts }
    const ends = RESTORED.find((id) => target.conditions?.some((entry) => entry.id === id))
    if (!ends) facts.push(`${target.name} has none of the conditions Lesser Restoration ends.`)
    else {
      const after = withoutCondition(target, ends).character
      characters = characters.map((character) => (character.id === after.id ? after : character))
      conditions.push({ target: target.id, condition: ends, ends: true })
      facts.push(`Lesser Restoration ends ${target.name}'s ${conditionName(ends)} condition.`)
    }
    return { characters, conditions, facts }
  },
}

/** Remove Curse ends Bestow Curse. */
export const removeCurse: SpellRules = {
  spells: ["remove-curse"],
  ends: (args) => {
    const held = spellsOn(args)
    if (!held.target) return { characters: held.characters(), conditions: [], facts: [] }
    const curses = [...held.on.values()].filter((entry) => entry.spell === "bestow-curse")
    for (const entry of curses) held.end(entry.spell, entry.by)
    return { characters: held.characters(), conditions: [], facts: [curses.length ? `Remove Curse ends the curse on ${held.target.name}.` : `No curse the game holds is on ${held.target.name}.`] }
  },
}

/**
 * Dispel Magic ends every spell on the target of the slot's level or lower, and for each higher one the caster makes an
 * ability check with their spellcasting ability (`modifier`) against 10 and its level.
 */
export const dispelMagic: SpellRules = {
  spells: ["dispel-magic"],
  ends: (args) => {
    const held = spellsOn(args)
    const { target } = held
    const facts: string[] = []
    if (!target) return { characters: held.characters(), conditions: [], facts }
    if (!held.on.size) facts.push(`No spell the game holds is on ${target.name}.`)
    for (const entry of held.on.values()) {
      const found = spellById.get(entry.spell)
      const name = found?.name ?? entry.spell
      const level = found?.level ?? 0
      if (level <= args.slot) {
        held.end(entry.spell, entry.by)
        facts.push(`Dispel Magic ends ${name} on ${target.name}.`)
        continue
      }
      const natural = args.d20()
      const total = natural + args.modifier
      const dc = 10 + level
      if (total >= dc) held.end(entry.spell, entry.by)
      facts.push(`${args.caster.name} ${total >= dc ? "breaks" : "fails to break"} ${name} on ${target.name} (${total} against DC ${dc}).`)
    }
    return { characters: held.characters(), conditions: [], facts }
  },
}
