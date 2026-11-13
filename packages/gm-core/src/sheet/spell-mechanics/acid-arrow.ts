import { spellById } from "@d20/srd/spells"
import { withSpellEffect } from "../spell-effects"
import type { SpellRules } from "../spell-rules"

/**
 * Acid Arrow. "On a miss, the arrow splashes the target with acid for half as much of the initial damage only." On a hit
 * it burns again for 2d4 Acid at the end of the target's next turn, and 1d4 more for each slot level above 2, held as
 * the effect's `amount`.
 */
export const acidArrow: SpellRules = {
  spells: ["acid-arrow"],
  halfOnMiss: true,
  cast: (cast) => {
    const [first] = cast.attacks
    if (!first?.roll.hit) return
    const target = cast.find(first.target)
    if (target && !target.dead) cast.put(withSpellEffect(target, { spell: cast.spell.id, by: cast.caster.id, turns: target.isComplete ? 2 : 1, amount: cast.slot }))
  },
  round: (round, was) => {
    const effect = was.spellEffects?.find((entry) => entry.spell === "acid-arrow" && entry.turns === 1)
    const target = round.find(was.id)
    const spell = spellById.get("acid-arrow")
    if (!effect || !target || target.dead || !spell) return
    const amount = round.hurt(was.id, `${2 + Math.max(0, (effect.amount ?? spell.level) - spell.level)}d4`, "acid")
    round.tell(target.id, spell.name, `Acid Arrow's acid burns ${target.name} again for ${amount} acid damage.${round.standing(was.id)}`)
  },
}
