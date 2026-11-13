import type { ConditionId } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import { type Afflicted, immuneTo } from "./conditions"
import { hitPointsOf } from "./hit-points"

/**
 * Legendary Resistance, from the SRD 5.2.1 stat blocks: "If the dragon fails a saving throw, it can choose to succeed
 * instead." Its uses a day are typed on the trait ("3/Day, or 4/Day in Lair"). The engine knows no lair, so it counts
 * the plain number, and the uses spent are kept on the character in `featureUses` under the trait's name, as a stat
 * block's Protective Magic is (./reactions). A Long Rest gives them back, and an NPC takes none in play.
 *
 * Only an NPC's own stat block has it. A hero's sheet has none, and no Beast a Druid can take the shape of is Legendary.
 */

export const LEGENDARY_RESISTANCE = "Legendary Resistance"

type Resister = Afflicted & { featureUses?: Record<string, number> }

/** A creature's Legendary Resistance: its uses a day, the more it has in its lair (told only), and how many are left. */
export type LegendaryResistance = { uses: number; inLair?: number; left: number }

export function legendaryResistanceOf(character: Resister): LegendaryResistance | undefined {
  if (character.type !== "npc" || character.sheet || !character.statBlock) return undefined
  const trait = monsterById.get(character.statBlock)?.traits?.find((entry) => entry.name === LEGENDARY_RESISTANCE)
  const uses = trait?.uses?.count
  if (typeof uses !== "number") return undefined
  return { uses, ...(trait?.uses?.countInLair ? { inLair: trait.uses.countInLair } : {}), left: Math.max(0, uses - (character.featureUses?.[LEGENDARY_RESISTANCE] ?? 0)) }
}

/** What a failed save would cost: the conditions it would give, and the damage it would deal after defenses. */
export type SaveStakes = { conditions?: readonly ConditionId[]; damage?: number }

// The conditions that take a creature's turns or actions away: Incapacitated and those that carry it, and Restrained,
// which holds it in place and takes Advantage from its attacks. Banishment gives Incapacitated.
const DISABLING: readonly ConditionId[] = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "restrained"]

/**
 * Whether a creature spends a use of Legendary Resistance on a save it failed. The rule is a game master's plain one,
 * so no model is asked: spend one against what would end the fight for it, and keep them for that. That is a condition
 * that takes its turns or actions away and that it is not immune to (Hold Monster's Paralyzed), or damage of at least a
 * quarter of the hit points it has now. Never on a small harm: a Sacred Flame's 1d8 against an Adult Red Dragon's 256.
 * The uses are few, a day's worth, and a dragon that spends them on cantrips has none for the spell that would hold it.
 */
export function spendsLegendaryResistance(character: Resister, stakes: SaveStakes): boolean {
  if (!legendaryResistanceOf(character)?.left) return false
  if ((stakes.conditions ?? []).some((id) => DISABLING.includes(id) && !immuneTo(character, id))) return true
  const current = hitPointsOf(character)?.current
  return current !== undefined && current > 0 && (stakes.damage ?? 0) * 4 >= current
}

/** The creature with one use of Legendary Resistance spent. */
export const withLegendaryResistanceSpent = <T extends Resister>(character: T): T => ({
  ...character,
  featureUses: { ...character.featureUses, [LEGENDARY_RESISTANCE]: (character.featureUses?.[LEGENDARY_RESISTANCE] ?? 0) + 1 },
})

/** The use spent, in the story's words: "The dragon fails the save and chooses to succeed (Legendary Resistance, 2 of 3 left today)." */
export function legendaryResistanceWords(name: string, character: Resister): string {
  const held = legendaryResistanceOf(character)
  return `${name} fails the saving throw and chooses to succeed instead (${LEGENDARY_RESISTANCE}${held ? `, ${held.left} of ${held.uses} left today` : ""}).`
}
