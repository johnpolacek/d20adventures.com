import type { ConditionId } from "@d20/srd"
import { spellById } from "@d20/srd/spells"
import { CONDITION_SPANS, type ConditionSpan } from "../condition-entry"
import { withoutCondition } from "../conditions"
import { afterHarm, killed } from "../death"
import { hitPointsOf } from "../hit-points"
import { withDeathWardSpent, withSpellEffect } from "../spell-effects"
import type { CastContext, SpellRules } from "../spell-rules"
import type { Castee } from "../spells"
import { creatureTypeOf } from "./enchantments"

/**
 * Spells that decide by the hit points their target has now: the Power Words and Divine Word. Each is settled on its
 * target at once (`settles`), and what the data holds is passed by.
 */

const currentOf = (target: Castee) => hitPointsOf(target)?.current

/**
 * One the spell would kill outright with no damage. A spell that wards them against death (Death Ward) negates it and
 * ends. Otherwise they die, or where player death is off, a hero is left Stable at 0.
 */
function slain(cast: CastContext, target: Castee, why: string): void {
  const warded = withDeathWardSpent(target)
  if (warded) {
    cast.put(warded.character)
    cast.facts.push(`${why} ${target.name} would die, but ${warded.name} negates ${cast.spell.name}, and ends.`)
    return
  }
  const done = afterHarm(killed(target, cast.rules))
  cast.put(done)
  cast.facts.push(`${why} ${target.name} ${done.dead ? "dies" : "is left Unconscious and Stable at 0 hit points, out of the fight"}.`)
}

/** Power Word Kill: "If the target has 100 Hit Points or fewer, it dies. Otherwise, it takes 12d12 Psychic damage", its data's. */
export const powerWordKill: SpellRules = {
  spells: ["power-word-kill"],
  settles: (cast, target) => {
    const current = currentOf(target)
    if (target.dead || current === undefined) return !!target.dead
    if (current > 100) {
      cast.facts.push(`${target.name} has more than 100 hit points, so ${cast.caster.name}'s Power Word Kill does not slay them outright.`)
      return false
    }
    slain(cast, target, `${target.name} has ${current} hit points, 100 or fewer, as ${cast.caster.name} speaks Power Word Kill.`)
    return true
  },
}

/**
 * Power Word Stun: "If the target has 150 Hit Points or fewer, it has the Stunned condition. Otherwise, its Speed is 0
 * until the start of your next turn." The Speed of 0 lasts through the target's next turn, as the engine runs a
 * round's turns together. "The Stunned target makes a Constitution saving throw at the end of each of its turns, ending
 * the condition on itself on a success": made here, by the one stunned alone, and not by the data's repeated save,
 * which would end the Speed of 0 too.
 */
export const powerWordStun: SpellRules = {
  spells: ["power-word-stun"],
  held: { speedZero: true, placed: true },
  repeatsSave: false,
  round: (round, was) => {
    const stun = was.conditions?.find((entry) => entry.id === "stunned" && entry.spell === "power-word-stun")
    const spell = spellById.get("power-word-stun")
    const target = round.find(was.id)
    const caster = spell && stun && round.holds(spell, stun.source)
    if (!spell || !caster || !target || target.dead) return
    const thrown = round.save(target, "con", caster, spell, ["stunned"])
    round.tell(target.id, spell.name, `${round.verdict(target, thrown, spell, caster)}${thrown.success ? ", and is no longer Stunned" : ""}.`)
    if (!thrown.success) return
    const now = round.find(was.id)
    if (!now) return
    round.put(withoutCondition(now, "stunned").character)
    round.conditions.push({ target: was.id, condition: "stunned", ends: true })
  },
  settles: (cast, target) => {
    const current = currentOf(target)
    if (target.dead) return true
    if (current !== undefined && current > 150) {
      cast.put(withSpellEffect(target, { spell: cast.spell.id, by: cast.caster.id, turns: CONDITION_SPANS.turn + (target.isComplete ? 1 : 0) }))
      cast.facts.push(`${target.name} has more than 150 hit points, so ${cast.caster.name}'s Power Word Stun does not stun them: their Speed is 0 until the start of ${cast.caster.name}'s next turn.`)
      return true
    }
    cast.facts.push(`${target.name} has ${current ?? "few"} hit points, 150 or fewer, as ${cast.caster.name} speaks Power Word Stun.`)
    // Until a save at the end of one of its turns ends it.
    cast.give(target.id, "stunned", "lasting")
    return true
  },
}

// The Divine Word Effects table, by the target's hit points now: what each row gives, and for how long.
const ROWS: readonly { upTo: number; dies?: true; conditions?: readonly ConditionId[]; span?: ConditionSpan; words?: string }[] = [
  { upTo: 20, dies: true },
  { upTo: 30, conditions: ["blinded", "deafened", "stunned"], span: "lasting", words: "for 1 hour" },
  { upTo: 40, conditions: ["blinded", "deafened"], span: "lasting", words: "for 10 minutes" },
  { upTo: 50, conditions: ["deafened"], span: "minute", words: "for 1 minute" },
]

// "a Celestial, an Elemental, a Fey, or a Fiend target that fails its save is forced back to its plane of origin".
const BANISHED = ["celestial", "elemental", "fey", "fiend"]

/**
 * Divine Word: "Each creature of your choice in range makes a Charisma saving throw. On a failed save, a target that
 * has 50 Hit Points or fewer suffers an effect based on its current Hit Points" by its table, and "a Celestial, an
 * Elemental, a Fey, or a Fiend target that fails its save is forced back to its plane of origin": the engine takes the
 * fight to be on the Material Plane, so that one leaves it, and does not return within the adventure's day.
 */
export const divineWord: SpellRules = {
  spells: ["divine-word"],
  count: 20,
  settles: (cast, target) => {
    if (target.dead) return true
    const current = currentOf(target) ?? 0
    const row = ROWS.find((each) => current <= each.upTo)
    const banished = BANISHED.includes(creatureTypeOf(target))
    // What failing would cost, for Legendary Resistance: its life, or the fight, or the conditions of its row.
    const stakes = row?.dies || banished ? { damage: current } : { conditions: row?.conditions ?? [] }
    const thrown = cast.save(target, "cha", stakes)
    const verdict = `${target.name} ${thrown.success ? "SUCCEEDS on" : "FAILS"} the saving throw against ${cast.caster.name}'s Divine Word (${thrown.total} against DC ${thrown.dc})`
    if (thrown.success) {
      cast.facts.push(`${verdict}.`)
      return true
    }
    if (!row) cast.facts.push(`${verdict}, but has ${current} hit points, more than 50, so the word does not harm them.`)
    else if (row.dies) slain(cast, target, `${verdict} with ${current} hit points, 20 or fewer.`)
    else {
      cast.facts.push(`${verdict} with ${current} hit points, and is struck ${row.words}.`)
      for (const condition of row.conditions ?? []) cast.give(target.id, condition, row.span)
    }
    const now = cast.find(target.id)
    if (banished && now && !now.dead) {
      cast.put({ ...now, fled: true })
      cast.facts.push(`${target.name} is forced back to its plane of origin and leaves the fight, and cannot return to this plane for 24 hours.`)
    }
    return true
  },
}
