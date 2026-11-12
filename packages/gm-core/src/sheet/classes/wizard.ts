import type { ClassRules } from "../class-rules"
import { deriveSheet } from "../derive"
import type { Sheet } from "../sheet"

/**
 * The Wizard's features in play. Arcane Recovery: as a Short Rest ends, once a Long Rest, the Wizard takes back spent
 * spell slots. Memorize Spell is chosen as a Short Rest ends (../rest `memorizeSpell`).
 */

const ARCANE_RECOVERY = "wizard-arcane-recovery"

/**
 * The spell slots a Wizard's Arcane Recovery takes back, by level, the first for level 1: expended slots with a
 * combined level of at most half the Wizard level rounded up, none of level 6 or higher. The engine takes the most
 * levels it can, and of equal totals the higher slots. A level 4 Wizard with one level 2 and two level 1 slots spent
 * may recover 2 levels: the level 2 slot, [0, 1].
 */
export function arcaneRecoveryOf(character: { sheet?: Sheet; spellSlots?: readonly number[] }): number[] {
  const sheet = character.sheet
  if (!sheet || !deriveSheet(sheet).classFeatures.includes(ARCANE_RECOVERY)) return []
  const budget = Math.ceil(sheet.level / 2)
  const spent = (character.spellSlots ?? []).slice(0, 5)
  let best: number[] = []
  let bestTotal = 0
  // Every way to take back some of the spent slots of each level, few enough to try them all.
  const tryFrom = (level: number, taken: number[], total: number) => {
    if (level < 1) {
      if (total > bestTotal) {
        best = [...taken]
        bestTotal = total
      }
      return
    }
    for (let count = Math.min(spent[level - 1] ?? 0, Math.floor((budget - total) / level)); count >= 0; count--) {
      taken[level - 1] = count
      tryFrom(level - 1, taken, total + count * level)
    }
  }
  tryFrom(spent.length, [], 0)
  return bestTotal > 0 ? best.map((count) => count ?? 0) : []
}

export const wizard: ClassRules = {
  class: "wizard",
  shortRest: (character) => {
    const recovered = (character.featureUses?.[ARCANE_RECOVERY] ?? 0) > 0 ? [] : arcaneRecoveryOf(character)
    if (!recovered.length) return { character, facts: [] }
    const spellSlots = (character.spellSlots ?? []).map((used, index) => used - (recovered[index] ?? 0))
    const { spellSlots: _, ...rest } = character
    const words = recovered.flatMap((count, index) => (count ? [`${count} level ${index + 1}`] : [])).join(" and ")
    return {
      character: { ...rest, featureUses: { ...character.featureUses, [ARCANE_RECOVERY]: 1 }, ...(spellSlots.some((used) => used > 0) ? { spellSlots } : {}) } as unknown as typeof character,
      facts: [`${character.name ?? "The character"} uses Arcane Recovery and recovers ${words} spell ${recovered.reduce((sum, count) => sum + count, 0) === 1 ? "slot" : "slots"}.`],
    }
  },
}
