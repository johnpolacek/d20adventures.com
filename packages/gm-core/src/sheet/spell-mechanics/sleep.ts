import { spellById } from "@d20/srd/spells"
import { ownBlockOf } from "../blocks"
import type { Roller } from "../check"
import { spellEnded } from "../spell-effects"
import type { SpellRules } from "../spell-rules"

/**
 * Sleep: "Creatures that don't sleep, such as elves, or that have Immunity to the Exhaustion condition automatically
 * succeed on saves against this spell." A hero is an elf by its sheet's species, an NPC by the `species` it is written
 * with. A pattern on the NPC's race once decided it, and would have let a drow sleep.
 */
function sleepless(character: Roller & { species?: string }): boolean {
  if (character.sheet) return character.sheet.species === "elf"
  if (character.species === "elf") return true
  return !!(character.type === "npc" && ownBlockOf(character)?.conditionImmunities?.includes("exhaustion"))
}

/**
 * Sleep. One who does not sleep passes with no roll. "The spell ends on a target if it takes damage." Its second save
 * comes at the end of the target's next turn, as its Incapacitated runs out: on a failure the target is Unconscious for
 * as long as the spell lasts, and on a success the spell ends on it.
 */
export const sleep: SpellRules = {
  spells: ["sleep"],
  passes: (target) => (sleepless(target) ? `${target.name} does not sleep, so Sleep does not take them.` : undefined),
  endsOnDamage: true,
  round: (round, was) => {
    const entry = was.conditions?.find((held) => held.spell === "sleep" && held.id === "incapacitated" && held.turns === 1)
    const target = round.find(was.id)
    const spell = spellById.get("sleep")
    const caster = spell && entry ? round.holds(spell, entry.source) : undefined
    if (!spell || !caster || !target || target.dead) return
    const thrown = round.save(target, "wis", caster, spell, ["unconscious"])
    round.tell(target.id, spell.name, `${round.verdict(target, thrown, spell, caster)}${thrown.success ? `, and ${spell.name} ends on them` : ""}.`)
    if (thrown.success) {
      round.put(spellEnded(target, (id) => id === spell.id))
      round.conditions.push({ target: was.id, condition: "incapacitated", ends: true })
    } else round.give(target, "unconscious", spell, caster, "lasting")
  },
}
