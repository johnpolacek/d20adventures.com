import type { Bearer, Deflected, SpellRules } from "../spell-rules"
import type { SpellEffect } from "../turn-effect"

/** Shield: "and you take no damage from Magic Missile". */
export const shield: SpellRules = { spells: ["shield"], held: { wards: (spell) => spell.id === "magic-missile" } }

/** Heroism: its bearer "is immune to the Frightened condition". */
export const heroism: SpellRules = { spells: ["heroism"], held: { immunities: ["frightened"] } }

/** Invisibility: "The spell ends early immediately after the target ... casts a spell." */
export const invisibility: SpellRules = { spells: ["invisibility"], endsOnCasting: true }

/**
 * Mirror Image against a hit by an attack roll: a d6 for each duplicate left, and on any 3 or higher a duplicate is hit
 * in place of its caster and destroyed. The spell ends with the last. An attacker who is Blinded is not fooled. It
 * begins with three.
 */
function mirrorImage<T extends Bearer>(target: T, attacker: Bearer, roll: (sides: number) => number): Deflected<T> | undefined {
  const held = target.spellEffects?.find((effect) => effect.spell === "mirror-image")
  const duplicates = held?.amount ?? 0
  if (!held || duplicates < 1 || attacker.conditions?.some((entry) => entry.id === "blinded")) return { character: target, deflected: false, dice: [], duplicates }
  const dice = Array.from({ length: duplicates }, () => roll(6))
  if (!dice.some((die) => die >= 3)) return { character: target, deflected: false, dice, duplicates }
  if (duplicates > 1)
    return {
      character: { ...target, spellEffects: (target.spellEffects ?? []).map((effect): SpellEffect => (effect === held ? { ...effect, amount: duplicates - 1 } : effect)) },
      deflected: true,
      dice,
      duplicates,
    }
  // The last duplicate gone, the spell ends.
  const spellEffects = (target.spellEffects ?? []).filter((effect) => effect !== held)
  const { spellEffects: _, ...rest } = target
  return { character: (spellEffects.length ? { ...rest, spellEffects } : rest) as T, deflected: true, dice, duplicates }
}

export const mirrorImageRules: SpellRules = { spells: ["mirror-image"], held: { amount: () => 3, deflects: mirrorImage } }
