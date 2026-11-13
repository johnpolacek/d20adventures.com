import type { AbilityId } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { spellById } from "@d20/srd/spells"
import { spellEnded, withSpellEffect } from "../spell-effects"
import type { RoundBearer, RoundContext, SpellRules } from "../spell-rules"
import type { SpellEffect } from "../turn-effect"
import { creatureTypeOf } from "./enchantments"

/**
 * Saves repeated at the end of each of the bearer's turns until three of a kind: three successes end the spell on them,
 * and three failures settle it. The count is kept on the effect as its `tally`.
 */

// One save of the count, made against the caster's DC and told with the count so far. The bearer's tally after it.
function tallied(round: RoundContext, was: RoundBearer, effect: SpellEffect, caster: RoundBearer, against: Parameters<RoundContext["save"]>[4]) {
  const spell = spellById.get(effect.spell)
  const target = round.find(was.id)
  if (!spell || !target) return undefined
  const thrown = round.save(target, "con", caster, spell, against)
  const before = effect.tally ?? { passed: 0, failed: 0 }
  const tally = thrown.success ? { ...before, passed: before.passed + 1 } : { ...before, failed: before.failed + 1 }
  round.tell(target.id, spell.name, `${round.verdict(target, thrown, spell, caster)}: ${tally.passed} of three successes and ${tally.failed} of three failures.`)
  const now = round.find(was.id)
  if (now) round.put(withSpellEffect(now, { ...effect, tally }))
  return { spell, tally }
}

/**
 * Flesh to Stone. "Constructs automatically succeed on the save." On a failed save the target is Restrained for the
 * duration. "A Restrained target makes another Constitution saving throw at the end of each of its turns. If it
 * successfully saves against this spell three times, the spell ends. If it fails its saves three times, it is turned to
 * stone and has the Petrified condition for the duration."
 */
export const fleshToStone: SpellRules = {
  spells: ["flesh-to-stone"],
  held: {},
  passes: (target) => (creatureTypeOf(target) === "construct" ? `${target.name} is a Construct, and succeeds on the save against Flesh to Stone.` : undefined),
  round: (round, was) => {
    const effect = was.spellEffects?.find((entry) => entry.spell === "flesh-to-stone")
    const spell = spellById.get("flesh-to-stone")
    const caster = spell && effect ? round.holds(spell, effect.by) : undefined
    const restrained = was.conditions?.some((entry) => entry.spell === "flesh-to-stone" && entry.id === "restrained")
    if (!effect || !spell || !caster || !restrained || was.dead || (effect.tally?.failed ?? 0) >= 3) return
    const done = tallied(round, was, effect, caster, ["restrained", "petrified"])
    const now = round.find(was.id)
    if (!done || !now) return
    if (done.tally.passed >= 3) {
      round.put(spellEnded(now, (id) => id === spell.id))
      round.conditions.push({ target: was.id, condition: "restrained", ends: true })
      round.tell(was.id, spell.name, `${spell.name} ends on ${was.name}.`)
    } else if (done.tally.failed >= 3) {
      round.tell(was.id, spell.name, `${was.name} is turned to stone.`)
      round.give(now, "petrified", spell, caster, "lasting")
    }
  },
}

/**
 * Contagion. "Choose one ability when you cast the spell. While Poisoned, the target has Disadvantage on saving throws
 * made with the chosen ability. The target must repeat the saving throw at the end of each of its turns until it gets
 * three successes or failures. If the target succeeds on three of these saves, the spell ends on the target. If the
 * target fails three of the saves, the spell lasts for 7 days on it." Once its Poisoned has ended by other means, the
 * spell holds nothing more on its bearer and leaves them.
 */
export const contagion: SpellRules = {
  spells: ["contagion"],
  choice: { values: ["str", "dex", "con", "int", "wis", "cha"], field: "spellChoice", words: "the ability whose saves have Disadvantage while Poisoned" },
  held: {
    checkModes: (effect, check) =>
      check.kind === "save" && effect.choice === check.ability ? [{ mode: "disadvantage", from: `Contagion (${abilityById.get(effect.choice as AbilityId)?.name})` }] : [],
  },
  round: (round, was) => {
    const effect = was.spellEffects?.find((entry) => entry.spell === "contagion")
    const spell = spellById.get("contagion")
    if (!effect || !spell || was.dead) return
    if (!was.conditions?.some((entry) => entry.spell === "contagion" && entry.id === "poisoned")) {
      const now = round.find(was.id)
      if (now) round.put(spellEnded(now, (id) => id === spell.id))
      return
    }
    const caster = round.find(effect.by)
    if (!caster || (effect.tally?.passed ?? 0) >= 3 || (effect.tally?.failed ?? 0) >= 3) return
    const done = tallied(round, was, effect, caster, ["poisoned"])
    const now = round.find(was.id)
    if (!done || !now) return
    if (done.tally.passed >= 3) {
      round.put(spellEnded(now, (id) => id === spell.id))
      round.conditions.push({ target: was.id, condition: "poisoned", ends: true })
      round.tell(was.id, spell.name, `${spell.name} ends on ${was.name}.`)
    } else if (done.tally.failed >= 3) round.tell(was.id, spell.name, `${spell.name} now lasts 7 days on ${was.name}.`)
  },
}
