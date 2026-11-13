import { spellById } from "@d20/srd/spells"
import { areEnemies } from "../sides"
import { placedOf, within } from "../space"
import type { SpellRules } from "../spell-rules"

/**
 * Spirit Guardians, held by its caster with the slot it was cast at: as each round turns, each creature not of its
 * caster's side within 15 feet of them makes a Wisdom save, taking 3d8 Radiant damage, and 1d8 more for each slot level
 * above 3, or half on a success. Its Speed is not halved.
 */
export const spiritGuardians: SpellRules = {
  spells: ["spirit-guardians"],
  held: { byCaster: true },
  round: (round, was) => {
    const effect = was.spellEffects?.find((entry) => entry.spell === "spirit-guardians" && entry.by === was.id)
    const spell = spellById.get("spirit-guardians")
    const caster = round.find(was.id)
    const at = caster && placedOf(caster)
    if (!effect || !spell || !caster || !at || caster.concentration?.spell !== spell.id) return
    const area = spell.range.area?.size ?? 15
    const above = Math.max(0, (effect.amount ?? spell.level) - spell.level)
    for (const other of round.everyone()) {
      const there = placedOf(other)
      if (other.id === caster.id || !areEnemies(other, caster) || other.dead || !there || !within(at, there, area)) continue
      const thrown = round.save(other, "wis", caster, spell)
      const amount = round.hurt(other.id, `${3 + above}d8`, "radiant", (taken) => (thrown.success ? Math.floor(taken / 2) : taken))
      round.tell(other.id, spell.name, `${round.verdict(other, thrown, spell, caster)} and takes ${amount} radiant damage.${round.standing(other.id)}`)
    }
  },
}
