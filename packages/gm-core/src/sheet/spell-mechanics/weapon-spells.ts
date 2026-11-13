import type { DamageTypeId } from "@d20/srd"
import { parseDice } from "../attack"
import { deriveSheet } from "../derive"
import type { SpellRules } from "../spell-rules"
import { type Castee, spellcastingFor } from "../spells"

// The weapons Shillelagh takes: "A Club or Quarterstaff you are holding".
const SHILLELAGH_WEAPONS = ["club", "quarterstaff"]

/**
 * Shillelagh: "you can use your spellcasting ability instead of Strength for the attack and damage rolls of melee
 * attacks using that weapon, and the weapon's damage die becomes a d8. If the attack deals damage, it can be Force
 * damage or the weapon's normal damage type (your choice)." The higher of the two abilities is used, and the type is
 * chosen as it is cast. "The damage die changes when you reach levels 5 (d10), 11 (d12), and 17 (2d6)."
 */
export const shillelagh: SpellRules = {
  spells: ["shillelagh"],
  choice: { values: ["bludgeoning", "force"], field: "damageType", words: "the damage type of the weapon's hits" },
  held: {
    weaponAttack: (effect, attack, bearer) => {
      const [part, ...rest] = attack.damage
      if (!SHILLELAGH_WEAPONS.includes(attack.id) || !bearer.sheet || !part?.dice) return attack
      const casting = spellcastingFor(bearer as Castee, "shillelagh")
      if (!casting) return attack
      const strength = deriveSheet(bearer.sheet).abilityModifiers.str
      const better = Math.max(0, casting.modifier - strength)
      const level = bearer.sheet.level
      const die = level >= 17 ? "2d6" : level >= 11 ? "1d12" : level >= 5 ? "1d10" : "1d8"
      const bonus = parseDice(part.dice).bonus + better
      const dice = bonus === 0 ? die : `${die} ${bonus < 0 ? "-" : "+"} ${Math.abs(bonus)}`
      return { ...attack, bonus: attack.bonus + better, damage: [{ ...part, dice, type: (effect.choice as DamageTypeId | undefined) ?? part.type }, ...rest] }
    },
  },
}
