import { monsterById } from "@d20/srd/monsters"
import type { Shape } from "../types/character"
import { deriveSheet } from "./derive"
import { itemBonus } from "./items"
import { shapeOf } from "./shape"
import type { Sheet } from "./sheet"
import { armorClassWithSpells, hitPointMaximumFromSpells } from "./spell-effects"
import type { SpellEffect } from "./turn-effect"

/** The stat block an NPC uses when it names none: the SRD's Commoner. */
export const DEFAULT_STAT_BLOCK = "commoner"

export type CombatStats = { hitPointMaximum: number; armorClass: number /** Where the numbers come from: "Guard", "Chain Mail", "Unarmored Defense". */; from: string }

/**
 * A character's hit point maximum and Armor Class. A hero's come from its sheet. An NPC's come from the SRD stat
 * block it names, or the Commoner's when it names none. A hero with no sheet has none yet. A spell that raises the
 * maximum (Aid) raises it while it lasts.
 */
export function combatStatsOf(character: { type?: string; sheet?: Sheet; statBlock?: string; spellEffects?: readonly SpellEffect[]; shape?: Shape }): CombatStats | undefined {
  if (character.sheet) {
    const derived = deriveSheet(character.sheet)
    // In a Beast's shape the hero keeps their own hit points and takes the stat block's Armor Class (./shape).
    const shape = shapeOf(character)
    if (shape) return { hitPointMaximum: derived.hitPointMaximum + hitPointMaximumFromSpells(character), armorClass: armorClassWithSpells(character, shape.ac), from: shape.name }
    // Spells that last change Armor Class: Shield of Faith adds 2, and Mage Armor sets 13 and Dexterity for one in no
    // armor. What worn items add (a Ring of Protection's 1) stays on top of Mage Armor's.
    const unarmored = { dexterityModifier: derived.abilityModifiers.dex + itemBonus(character.sheet, "armor-class") }
    const armorClass = armorClassWithSpells(character, derived.armorClass, character.sheet.armor ? undefined : unarmored)
    return { hitPointMaximum: derived.hitPointMaximum + hitPointMaximumFromSpells(character), armorClass, from: derived.armorClassFrom }
  }
  if (character.type !== "npc") return undefined
  const monster = monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)
  if (!monster) return undefined
  return { hitPointMaximum: monster.hp.average + hitPointMaximumFromSpells(character), armorClass: armorClassWithSpells(character, monster.ac), from: monster.name }
}

/** Whether an id names an SRD stat block. */
export const isStatBlock = (id: string) => monsterById.has(id)

/**
 * What a character adds to its Initiative roll: a hero's Dexterity modifier and anything its sheet adds (the Alert
 * feat's Proficiency Bonus), or the modifier an NPC's stat block prints.
 */
export function initiativeBonusOf(character: { name?: string; type?: string; sheet?: Sheet; statBlock?: string; shape?: Shape }): number {
  if (character.sheet) {
    // In a Beast's shape its Dexterity modifier takes the place of the hero's, beside what their feats add (./shape).
    const derived = deriveSheet(character.sheet)
    const shape = shapeOf(character)
    return shape ? derived.initiative - derived.abilityModifiers.dex + shape.abilities.dex.mod : derived.initiative
  }
  const monster = character.type === "npc" ? (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)) : undefined
  if (!monster) throw new Error(`${character.name ?? "This character"} has no rules sheet, so no Initiative can be rolled for them.`)
  return monster.initiative.modifier
}
