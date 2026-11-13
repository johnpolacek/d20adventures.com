import type { DamageTypeId } from "@d20/srd"
import { spellById } from "@d20/srd/spells"
import { parseDice } from "../attack"
import { endConcentration } from "../spell-effects"
import type { SpellRules } from "../spell-rules"

/**
 * Ensnaring Strike as each of its target's turns starts. "While Restrained, the target takes 1d6 Piercing damage at the
 * start of each of its turns", and 1d6 more for each slot level above 1, held as the effect's `amount`. One no longer
 * Restrained by it has broken free ("On a success, the spell ends"), and the caster's Concentration on it ends. It is
 * cast with the hit it rides (../classes/ranger), which gives the Restrained condition and the effect.
 */
export const ensnaringStrike: SpellRules = {
  spells: ["ensnaring-strike"],
  round: (round, was) => {
    for (const effect of was.spellEffects ?? []) {
      const spell = effect.spell === "ensnaring-strike" ? spellById.get(effect.spell) : undefined
      const caster = spell && round.holds(spell, effect.by)
      const now = round.find(was.id)
      if (!spell || !caster || !now || now.dead) continue
      const held = now.conditions?.some((entry) => entry.id === "restrained" && entry.spell === spell.id && entry.source === effect.by)
      if (!held) {
        round.replace(endConcentration(round.everyone(), effect.by).characters)
        round.tell(was.id, spell.name, `${was.name} is free of the vines, and ${caster.name}'s ${spell.name} ends.`)
        continue
      }
      const burn = spell.damage?.find((entry) => entry.dice && entry.appliesWhen === "While Restrained")
      if (!burn?.dice) continue
      const base = parseDice(burn.dice)
      const above = Math.max(0, (effect.amount ?? spell.level) - spell.level)
      const type = burn.types[0] as DamageTypeId
      const amount = round.hurt(was.id, `${base.count + (burn.perSlot ? parseDice(burn.perSlot).count * above : 0)}d${base.sides}`, type)
      round.tell(was.id, spell.name, `${caster.name}'s ${spell.name} tears at ${was.name} for ${amount} ${type} damage.${round.standing(was.id)}`)
    }
  },
}
