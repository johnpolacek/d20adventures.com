import type { SpellRules } from "../spell-rules"

/**
 * Lasting boons whose words their data does not type. Beacon of Hope: Advantage on Wisdom saves and Death Saving Throws,
 * and each die of healing counts its most. Magic Weapon is the weapon's: its bonus adds to weapon attacks and damage
 * and not to spell attacks, +2 with a level 3 to 5 slot and +3 with level 6 or higher, and the weapon is taken to be the
 * one its bearer attacks with. Pass without Trace's aura is not measured. Warding Bond's is in ./wards.
 */
export const boons: SpellRules[] = [
  { spells: ["beacon-of-hope"], held: { saveAdvantage: ["wis", "death"], healsMost: true } },
  { spells: ["magic-weapon"], held: { weapon: true, unmeasured: true, amount: (slot) => (slot >= 6 ? 3 : slot >= 3 ? 2 : 1) } },
  { spells: ["pass-without-trace"], held: { unmeasured: true } },
]
