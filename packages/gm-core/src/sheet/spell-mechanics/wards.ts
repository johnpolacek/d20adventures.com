import { type DamageTypeId, damageTypeIds } from "@d20/srd"
import { rollDamage } from "../attack"
import type { Roller } from "../check"
import { withoutCondition } from "../conditions"
import { withHealing } from "../death"
import type { ConditionChange } from "../harm"
import { spellEnded } from "../spell-effects"
import type { SpellRules } from "../spell-rules"
import { creatureTypeOf } from "./enchantments"

/**
 * Spells that guard the one they are on: what they take, what they roll and what cannot be done to them, each fed where
 * the engine keeps that kind of defence for anyone.
 */

const PHYSICAL: readonly DamageTypeId[] = ["bludgeoning", "piercing", "slashing"]

/** Stoneskin: "Resistance to Bludgeoning, Piercing, and Slashing damage." */
export const stoneskin: SpellRules = { spells: ["stoneskin"], held: { resistances: () => PHYSICAL } }

/**
 * Protection from Poison: "You touch a creature and end the Poisoned condition on it. For the duration, the target has
 * Advantage on saving throws to avoid or end the Poisoned condition, and it has Resistance to Poison damage."
 */
export const protectionFromPoison: SpellRules = {
  spells: ["protection-from-poison"],
  held: { resistances: () => ["poison"], saveAdvantageAgainst: ["poisoned"] },
  ends: (args) => {
    let characters = [...args.characters]
    const conditions: ConditionChange[] = []
    const facts: string[] = []
    const target = characters.find((character) => character.id === args.targets[0])
    const freed = target && withoutCondition(target, "poisoned")
    if (target && freed?.ended) {
      characters = characters.map((character) => (character.id === target.id ? freed.character : character))
      conditions.push({ target: target.id, condition: "poisoned", ends: true })
      facts.push(`Protection from Poison ends ${target.name}'s Poisoned condition.`)
    }
    return { characters, conditions, facts }
  },
}

/**
 * Mind Blank: "Immunity to Psychic damage and the Charmed condition." What it hides from sensing, reading thoughts,
 * detecting and scrying is the game master's.
 */
export const mindBlank: SpellRules = { spells: ["mind-blank"], held: { immunities: ["charmed"], damageImmunities: ["psychic"] } }

/**
 * Heroes' Feast: each who partakes has "Resistance to Poison damage, and it has Immunity to the Frightened and Poisoned
 * conditions. Its Hit Point maximum also increases by 2d10, and it gains the same number of Hit Points", rolled for
 * each. It is cast out of a fight, so its hour of eating passes in the story. Its 24 hours end with a Long Rest, which
 * stands for the day, as the engine keeps no clock.
 */
export const heroesFeast: SpellRules = {
  spells: ["heroes-feast"],
  held: { resistances: () => ["poison"], immunities: ["frightened", "poisoned"], rested: (effect, long) => (long ? undefined : effect) },
  cast: (cast) => {
    const dice = cast.spell.hitPointMaximum?.dice ?? "2d10"
    for (const id of cast.targets.length ? cast.targets : [cast.caster.id]) {
      const target = cast.find(id)
      if (!target?.spellEffects?.some((effect) => effect.spell === cast.spell.id)) continue
      const amount = rollDamage([{ dice, type: "force" }], cast.roll).total
      const raised = { ...target, spellEffects: target.spellEffects.map((effect) => (effect.spell === cast.spell.id ? { ...effect, amount } : effect)) }
      const healed = withHealing(raised, amount)
      cast.put(healed)
      cast.facts.push(`${target.name}'s hit point maximum and hit points rise by ${amount}. ${cast.standing(healed)}`)
    }
  },
}

/**
 * Foresight: "the target has Advantage on D20 Tests, and other creatures have Disadvantage on attack rolls against it.
 * The spell ends early if you cast it again." A D20 Test is an attack roll, an ability check, Initiative among them, or a
 * saving throw, a Death Saving Throw among them.
 */
export const foresight: SpellRules = {
  spells: ["foresight"],
  held: { attacked: "disadvantage", attacks: "advantage", saveAdvantage: ["death"], checkModes: () => [{ mode: "advantage", from: "Foresight" }] },
  cast: (cast) => {
    for (const other of cast.everyone()) {
      if (cast.targets.includes(other.id) || !other.spellEffects?.some((effect) => effect.spell === cast.spell.id && effect.by === cast.caster.id)) continue
      cast.put(spellEnded(other, (id) => id === cast.spell.id))
      cast.facts.push(`${cast.caster.name} casts Foresight again, and it ends on ${other.name}.`)
    }
  },
}

/**
 * Fire Shield: "The warm shield grants you Resistance to Cold damage, and the chill shield grants you Resistance to
 * Fire damage", as its caster chooses. Its flames on one who hits it in melee, and its light, are the game master's.
 */
export const fireShield: SpellRules = {
  spells: ["fire-shield"],
  choice: { values: ["warm", "chill"], field: "spellChoice", words: "the warm shield, which resists Cold, or the chill shield, which resists Fire" },
  held: { resistances: (effect) => (effect.choice === "chill" ? ["fire"] : ["cold"]) },
}

// "Aberrations, Celestials, Elementals, Fey, Fiends, or Undead", and Dispel Evil and Good's five without Aberrations.
const OTHERWORLDLY = ["aberration", "celestial", "elemental", "fey", "fiend", "undead"]
const kindOf = (attacker: Parameters<typeof creatureTypeOf>[0]) => creatureTypeOf(attacker as Roller)

/**
 * Protection from Evil and Good: "Creatures of those types have Disadvantage on attack rolls against the target." That
 * it cannot be possessed, Charmed or Frightened by them, and its Advantage on a new save against such an effect, are
 * the game master's: the engine does not know what kind of creature gave a condition.
 */
export const protectionFromEvilAndGood: SpellRules = {
  spells: ["protection-from-evil-and-good"],
  held: { attackedFrom: (attacker) => (OTHERWORLDLY.includes(kindOf(attacker)) ? "disadvantage" : undefined) },
}

/**
 * Dispel Evil and Good: "Celestials, Elementals, Fey, Fiends, and Undead have Disadvantage on attack rolls against
 * you." Break Enchantment and Dismissal, which end it, are the game master's.
 */
export const dispelEvilAndGood: SpellRules = {
  spells: ["dispel-evil-and-good"],
  held: { attackedFrom: (attacker) => (OTHERWORLDLY.slice(1).includes(kindOf(attacker)) ? "disadvantage" : undefined) },
  savedAtCast: () => false,
}

/**
 * Freedom of Movement: "spells and other magical effects can neither reduce the target's Speed nor cause the target to
 * have the Paralyzed or Restrained conditions." A condition a spell gives is shut out. Difficult Terrain, the Swim
 * Speed, a Speed lowered by magic and the escape from restraints are the game master's.
 */
export const freedomOfMovement: SpellRules = {
  spells: ["freedom-of-movement"],
  held: { shutsOut: (condition, spell) => !!spell && (condition === "paralyzed" || condition === "restrained") },
}

/**
 * Death Ward: "The first time the target would drop to 0 Hit Points before the spell ends, the target instead drops to
 * 1 Hit Point, and the spell ends" (./death `withDamage`). An effect that would kill it outright without damage, Power
 * Word Kill or Divine Word, is negated by `deathWarded`, and the spell ends.
 */
export const deathWard: SpellRules = { spells: ["death-ward"], held: { wardsDeath: true } }

/** Warding Bond: "it has Resistance to all damage" while within 60 feet of its caster, which is not measured. */
export const wardingBond: SpellRules = {
  spells: ["warding-bond"],
  held: {
    unmeasured: true,
    resistances: () => damageTypeIds,
  },
}
