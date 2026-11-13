import type { DamageTypeId } from "@d20/srd"
import { spellById } from "@d20/srd/spells"
import { isDown } from "../../utils/turn-actors"
import { parseDice } from "../attack"
import { spellEnded } from "../spell-effects"
import { type SpellRules, spellRule } from "../spell-rules"

/**
 * A save a spell's target repeats at the end of each of its turns, ending the spell on itself on a success, read from
 * the typed data of any spell: Hold Person, Blindness/Deafness, Ray of Enfeeblement, Slow, Hideous Laughter. A spell
 * whose rules say so is left out (`repeatsSave`). A failure deals the damage the data ties to that save: Phantasmal
 * Killer's 4d10 Psychic, and 1d10 more for each slot level above 4 held as the effect's `amount`, Weird's 5d10.
 */
export const repeatedSaves: SpellRules = {
  spells: [],
  round: (round, was) => {
    const held = new Map<string, string | undefined>()
    const slots = new Map<string, number>()
    for (const effect of was.spellEffects ?? []) {
      held.set(effect.spell, effect.by)
      if (effect.amount !== undefined) slots.set(effect.spell, effect.amount)
    }
    for (const entry of was.conditions ?? []) if (entry.spell) held.set(entry.spell, entry.source)
    for (const [id, by] of held) {
      const spell = spellById.get(id)
      const repeat = spell?.saves?.find((entry) => entry.when === "end-of-turn" && entry.onSuccess === "ends")
      const target = round.find(was.id)
      const caster = spell && round.holds(spell, by)
      if (!spell || !repeat || spellRule(id)?.repeatsSave === false || !target || target.dead || isDown(target) || !caster) continue
      // Made to end the conditions the spell holds them in.
      const holding = target.conditions?.filter((entry) => entry.spell === id).map((entry) => entry.id) ?? []
      const thrown = round.save(target, repeat.ability, caster, spell, holding)
      round.tell(target.id, spell.name, `${round.verdict(target, thrown, spell, caster)}${thrown.success ? `, and ${spell.name} ends on them` : ""}.`)
      if (!thrown.success) {
        // The damage a failure deals again, with what each slot level above the spell's own adds.
        const index = spell.saves?.indexOf(repeat)
        const above = Math.max(0, (slots.get(id) ?? spell.level) - spell.level)
        for (const part of spell.damage ?? []) {
          if (part.trigger !== "failed-save" || part.save !== index || !part.dice || part.timing || part.appliesWhen) continue
          const base = parseDice(part.dice)
          const more = part.perSlot ? parseDice(part.perSlot).count * above : 0
          const type = part.types[0] as DamageTypeId
          const amount = round.hurt(was.id, `${base.count + more}d${base.sides}${base.bonus ? ` + ${base.bonus}` : ""}`, type)
          round.tell(was.id, spell.name, `${caster.name}'s ${spell.name} deals ${was.name} ${amount} ${type} damage.${round.standing(was.id)}`)
        }
        continue
      }
      const now = round.find(was.id)
      if (!now) continue
      const ending = now.conditions?.filter((entry) => entry.spell === id).map((entry) => entry.id) ?? []
      round.put(spellEnded(now, (spellId) => spellId === id))
      for (const condition of ending) round.conditions.push({ target: was.id, condition, ends: true })
    }
  },
}

/** Fear's repeated save is made only "If the creature ends its turn in a space where it doesn't have line of sight to you": the engine does not read sight, so it is the game master's to tell. */
export const fear: SpellRules = { spells: ["fear"], repeatsSave: false }
