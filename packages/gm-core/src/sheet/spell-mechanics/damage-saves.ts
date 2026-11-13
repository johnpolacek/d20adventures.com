import { spellById } from "@d20/srd/spells"
import { legendaryResistanceWords, withLegendaryResistanceSpent } from "../legendary-resistance"
import { rescueWords, withRescueSpent } from "../save-rules"
import { spellEnded } from "../spell-effects"
import type { SpellRules } from "../spell-rules"
import { type Castee, rollSave, spellcastingFor } from "../spells"
import { only } from "./enchantments"

// A die of any size thrown with the d20 the damage hook is handed: a throw above the largest whole number of the die's
// faces is thrown again, so each face is as likely as the next. For the dice a spell adds to a save (Bless, Bane).
const dieFrom =
  (d20: () => number) =>
  (sides: number): number => {
    if (sides >= 20) return d20()
    const top = 20 - (20 % sides)
    for (;;) {
      const thrown = d20()
      if (thrown <= top) return ((thrown - 1) % sides) + 1
    }
  }

/**
 * A spell whose bearer repeats its save each time they take damage, ending the spell on themselves on a success, read
 * from the save its data makes "on-damage". The save is made against the caster's spell save DC while the spell still
 * holds, with Advantage where the text gives it (`advantage`, the reason in words).
 */
const savedOnDamage = (id: string, advantage?: string): SpellRules["damaged"] =>
  function damaged({ bearer, d20, characters }) {
    const spell = spellById.get(id)
    const save = spell?.saves?.find((entry) => entry.when === "on-damage" && entry.onSuccess === "ends")
    const holding = (bearer.conditions ?? []).filter((entry) => entry.spell === id)
    const by = holding[0]?.source ?? bearer.spellEffects?.find((effect) => effect.spell === id)?.by
    const caster = characters.find((character) => character.id === by)
    if (!spell || !save || !caster || caster.dead || (spell.duration.concentration && caster.concentration?.spell !== id) || bearer.dead) return undefined
    const dc = spellcastingFor(caster as unknown as Castee, id)?.saveDc
    if (dc === undefined) return undefined
    const against = holding.map((entry) => entry.id)
    const thrown = rollSave({
      target: bearer as unknown as Castee,
      ability: save.ability,
      dc,
      d20,
      roll: dieFrom(d20),
      characters: characters as unknown as Castee[],
      against,
      stakes: { conditions: against },
      also: advantage ? [{ mode: "advantage" as const, from: advantage }] : [],
    })
    let after = bearer
    const facts: string[] = []
    if (thrown.legendary) {
      after = withLegendaryResistanceSpent(after)
      facts.push(legendaryResistanceWords(bearer.name ?? "They", after))
    }
    if (thrown.rescued) {
      after = withRescueSpent(after, thrown.rescued)
      facts.push(rescueWords(bearer.name ?? "They", thrown.rescued, thrown))
    }
    const name = bearer.name ?? "They"
    facts.push(
      `${name} takes damage and ${thrown.success ? "SUCCEEDS on" : "FAILS"} the saving throw against ${caster.name ?? "the caster"}'s ${spell.name} (${thrown.total} against DC ${dc})${thrown.success ? `, and ${spell.name} ends on them` : ""}.`
    )
    if (thrown.success) after = spellEnded(after, (held) => held === id)
    return { bearer: after, facts }
  }

/**
 * Hideous Laughter: "At the end of each of its turns and each time it takes damage, it makes another Wisdom saving
 * throw. The target has Advantage on the save if the save is triggered by damage. On a successful save, the spell ends."
 */
export const hideousLaughter: SpellRules = { spells: ["hideous-laughter"], damaged: savedOnDamage("hideous-laughter", "Triggered By Damage") }

/**
 * Dominate Beast, Dominate Person and Dominate Monster: "Whenever the target takes damage, it repeats the save, ending
 * the spell on itself on a success." Dominate Beast takes a Beast and Dominate Person a Humanoid. What the dominated
 * creature does on its turns is the game master's to tell.
 */
export const dominations: SpellRules[] = [
  { spells: ["dominate-beast"], takes: only("beast"), damaged: savedOnDamage("dominate-beast") },
  { spells: ["dominate-person"], takes: only("humanoid"), damaged: savedOnDamage("dominate-person") },
  { spells: ["dominate-monster"], damaged: savedOnDamage("dominate-monster") },
]

/**
 * Charm Monster takes any creature, and its Charmed holds "until the spell ends or until you or your allies damage it",
 * whoever deals it here, as Charm Person's does.
 */
export const charmMonster: SpellRules = { spells: ["charm-monster"], endsOnDamage: true }
