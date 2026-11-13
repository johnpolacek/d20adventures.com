import { withHealing } from "../death"
import type { SpellRules } from "../spell-rules"

/**
 * Vampiric Touch, held by its caster with the slot it was cast at, and used again "on each of your turns as a Magic
 * action". On a hit "you regain Hit Points equal to half the amount of Necrotic damage dealt".
 */
export const vampiricTouch: SpellRules = {
  spells: ["vampiric-touch"],
  held: { byCaster: true },
  again: { takes: "action" },
  hit: (cast, attack) => {
    const healer = cast.find(cast.caster.id)
    if (!healer || attack.taken <= 1) return
    const amount = Math.floor(attack.taken / 2)
    cast.put(withHealing(healer, amount))
    cast.harm.push({ target: cast.caster.id, kind: "healing", dice: [], bonus: amount, amount })
    const after = cast.find(cast.caster.id)
    cast.facts.push(`${cast.caster.name} regains ${amount} hit points. ${after ? cast.standing(after) : ""}`)
  },
}
