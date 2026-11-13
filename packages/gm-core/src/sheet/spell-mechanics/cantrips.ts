import type { DamageRoll } from "../attack"
import type { SpellRules } from "../spell-rules"

/** Sacred Flame: "The target gains no benefit from Half Cover or Three-Quarters Cover for this save." */
export const sacredFlame: SpellRules = { spells: ["sacred-flame"], ignoresCover: true }

/**
 * Sorcerous Burst: "If you roll an 8 on a d8 for this spell, you can roll another d8, and add it to the damage", as many
 * more d8s as the spellcasting ability modifier, and a d8 added this way that rolls an 8 adds another.
 */
function burst(rolled: DamageRoll, modifier: number, roll: (sides: number) => number): DamageRoll {
  const [first, ...rest] = rolled.parts
  if (!first) return rolled
  let owed = first.dice.filter((die) => die === 8).length
  const more: number[] = []
  while (owed > 0 && more.length < modifier) {
    const die = roll(8)
    more.push(die)
    owed += die === 8 ? 0 : -1
  }
  const added = more.reduce((sum, die) => sum + die, 0)
  return { parts: [{ ...first, dice: [...first.dice, ...more], total: first.total + added }, ...rest], total: rolled.total + added }
}

export const sorcerousBurst: SpellRules = { spells: ["sorcerous-burst"], hitDamage: (rolled, cast) => burst(rolled, cast.casting.modifier, cast.roll) }
