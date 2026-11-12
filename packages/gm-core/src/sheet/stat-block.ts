import { monsterById } from "@d20/srd/monsters"
import { deriveSheet } from "./derive"
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

/**
 * What a character adds to its Initiative roll: a hero's Dexterity modifier and anything its sheet adds (the Alert
 * feat's Proficiency Bonus), or the modifier an NPC's stat block prints.
 */
export function initiativeBonusOf(character: { name?: string; type?: string; sheet?: Sheet; statBlock?: string }): number {
  if (character.sheet) return deriveSheet(character.sheet).initiative
  const monster = character.type === "npc" ? (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)) : undefined
  if (!monster) throw new Error(`${character.name ?? "This character"} has no rules sheet, so no Initiative can be rolled for them.`)
  return monster.initiative.modifier
}

/** A character's Initiative for an encounter: the d20 it rolled as the encounter began, plus its bonus. It is kept until the encounter ends. */
export const rollInitiative = (character: Parameters<typeof initiativeBonusOf>[0], die: number): number => die + initiativeBonusOf(character)
