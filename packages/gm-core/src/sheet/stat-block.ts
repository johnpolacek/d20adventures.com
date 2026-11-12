import { monsterById } from "@d20/srd/monsters"
import { deriveSheet } from "./derive"
import { type HitPoints, hitPointsAt } from "./hit-points"
import type { Sheet } from "./sheet"

/** The stat block an NPC uses when it names none: the SRD's Commoner. */
export const DEFAULT_STAT_BLOCK = "commoner"

export type CombatStats = { hitPointMaximum: number; armorClass: number /** Where the numbers come from: "Guard", "Chain Mail", "Unarmored Defense". */; from: string }

/**
 * A character's hit point maximum and Armor Class. A hero's come from its sheet. An NPC's come from the SRD stat
 * block it names, or the Commoner's when it names none. A hero with no sheet has none yet.
 */
export function combatStatsOf(character: { type?: string; sheet?: Sheet; statBlock?: string }): CombatStats | undefined {
  if (character.sheet) {
    const derived = deriveSheet(character.sheet)
    return { hitPointMaximum: derived.hitPointMaximum, armorClass: derived.armorClass, from: derived.armorClassFrom }
  }
  if (character.type !== "npc") return undefined
  const monster = monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)
  if (!monster) return undefined
  return { hitPointMaximum: monster.hp.average, armorClass: monster.ac, from: monster.name }
}

/** Whether an id names an SRD stat block. */
export const isStatBlock = (id: string) => monsterById.has(id)

/** A character's hit points now: its maximum from its sheet or stat block, at its health percent. */
export function hitPointsOf(character: { type?: string; sheet?: Sheet; statBlock?: string; healthPercent?: number }): HitPoints | undefined {
  const maximum = combatStatsOf(character)?.hitPointMaximum
  return maximum === undefined ? undefined : hitPointsAt(maximum, character.healthPercent)
}
