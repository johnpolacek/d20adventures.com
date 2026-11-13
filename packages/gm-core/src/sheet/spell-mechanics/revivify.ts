import { revived } from "../death"
import type { SpellRules } from "../spell-rules"
import type { Castee } from "../spells"

/** Revivify: "a creature that has died within the last minute ... revives with 1 Hit Point." */
export const revivify: SpellRules = {
  spells: ["revivify"],
  heals: (cast, target) => {
    const amount = cast.spell.healing?.amount ?? 1
    if (!target.dead) {
      cast.facts.push(`${target.name} is not dead, so Revivify does nothing.`)
      return true
    }
    const { dead: _, ...alive } = target
    cast.put(revived({ ...alive, hitPoints: 0 } as Castee, amount))
    cast.harm.push({ target: target.id, kind: "healing", dice: [], bonus: amount, amount })
    cast.facts.push(`${target.name} returns to life with ${amount} hit point.`)
    return true
  },
}
