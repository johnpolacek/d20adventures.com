import type { DamageTypeId } from "@d20/srd"
import { spellById } from "@d20/srd/spells"
import { isDown } from "../../utils/turn-actors"
import { parseDice } from "../attack"
import { spellEnded } from "../spell-effects"
import type { SpellRules } from "../spell-rules"

/**
 * A burn at the start of each of the target's turns, then a save that ends the spell on a success, read from the typed
 * data of any spell: Searing Smite's 1d6 Fire, and 1d6 more for each slot level above 1, held as the effect's `amount`.
 */
export const turnBurns: SpellRules = {
  spells: [],
  round: (round, was) => {
    for (const effect of was.spellEffects ?? []) {
      const spell = spellById.get(effect.spell)
      const repeat = spell?.saves?.find((entry) => entry.when === "start-of-turn" && entry.onSuccess === "ends" && !entry.appliesWhen)
      const burn = spell?.damage?.find((entry) => entry.dice && entry.timing === "At the start of each of its turns" && !entry.trigger)
      const caster = spell && repeat && burn ? round.holds(spell, effect.by) : undefined
      if (!spell || !repeat || !burn?.dice || !caster || round.find(was.id)?.dead) continue
      const base = parseDice(burn.dice)
      const above = Math.max(0, (effect.amount ?? spell.level) - spell.level)
      const amount = round.hurt(was.id, `${base.count + (burn.perSlot ? parseDice(burn.perSlot).count * above : 0)}d${base.sides}`, burn.types[0] as DamageTypeId)
      round.tell(was.id, spell.name, `${caster.name}'s ${spell.name} burns ${was.name} for ${amount} ${burn.types[0]} damage.${round.standing(was.id)}`)
      const target = round.find(was.id)
      if (!target || target.dead || isDown(target)) continue
      const thrown = round.save(target, repeat.ability, caster, spell)
      round.tell(was.id, spell.name, `${round.verdict(target, thrown, spell, caster)}${thrown.success ? `, and ${spell.name} ends on them` : ""}.`)
      const now = round.find(was.id)
      if (thrown.success && now) round.put(spellEnded(now, (id) => id === spell.id))
    }
  },
}
