import type { ConditionId } from "@d20/srd"
import { spellById } from "@d20/srd/spells"
import { isDown } from "../../utils/turn-actors"
import { endConcentration } from "../spell-effects"
import type { SpellRules } from "../spell-rules"

// The condition each area spell gives on a failed save as a turn begins in it: what the save is made to avoid.
const AREA_GIVES: Record<string, readonly ConditionId[]> = { web: ["restrained"], "stinking-cloud": ["poisoned"], "sleet-storm": ["prone"] }

/**
 * The areas that stay on the floor: their effect marks those standing in one, who leave it on any move. For those still
 * in them as their turn begins: Web's Dexterity save or Restrained, Stinking Cloud's Constitution save or Poisoned
 * through the turn, and Sleet Storm's Dexterity save or Prone and their Concentration lost.
 */
export const areas: SpellRules = {
  spells: ["web", "stinking-cloud", "sleet-storm"],
  held: { area: true },
  round: (round, was) => {
    for (const effect of was.spellEffects ?? []) {
      const spell = spellById.get(effect.spell)
      const target = round.find(was.id)
      const caster = spell && AREA_GIVES[effect.spell] ? round.holds(spell, effect.by) : undefined
      if (!spell || !caster || !target || target.dead || isDown(target)) continue
      if (spell.id === "web" && target.conditions?.some((entry) => entry.id === "restrained" && entry.spell === "web")) continue
      const ability = spell.saves?.[0]?.ability ?? "dex"
      const thrown = round.save(target, ability, caster, spell, AREA_GIVES[spell.id] ?? [])
      round.tell(target.id, spell.name, `${round.verdict(target, thrown, spell, caster)}.`)
      if (thrown.success) continue
      if (spell.id === "web") round.give(target, "restrained", spell, caster, "lasting")
      if (spell.id === "stinking-cloud") {
        round.give(target, "poisoned", spell, caster, "turn")
        round.tell(target.id, spell.name, `${target.name} can take no action or Bonus Action this turn.`)
      }
      if (spell.id === "sleet-storm") {
        round.give(round.find(was.id) ?? target, "prone", spell, caster, "turn")
        if (round.find(was.id)?.concentration) {
          const ended = endConcentration(round.everyone(), was.id)
          round.replace(ended.characters)
          if (ended.ended) round.tell(target.id, spell.name, `${target.name} loses Concentration, and ${ended.ended} ends.`)
        }
      }
    }
  },
}
