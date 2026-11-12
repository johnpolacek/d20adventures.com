import { type AbilityId, abilityIdSchema, type SkillId, skillIdSchema } from "@d20/srd"
import { abilities, abilityById } from "@d20/srd/abilities"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { monsterById } from "@d20/srd/monsters"
import { skillById, skills } from "@d20/srd/skills"
import { z } from "zod"
import type { ConditionEntry } from "./condition-entry"
import { d20Penalty } from "./conditions"
import { deriveSheet } from "./derive"
import type { Sheet } from "./sheet"
import { DEFAULT_STAT_BLOCK } from "./stat-block"

/** What is rolled: one of the eighteen skills, a bare ability, or a saving throw. */
export const checkSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("skill"), skill: skillIdSchema }),
  z.strictObject({ kind: z.literal("ability"), ability: abilityIdSchema }),
  z.strictObject({ kind: z.literal("save"), ability: abilityIdSchema }),
])
export type Check = z.infer<typeof checkSchema>

/** The SRD's typical Difficulty Classes. A check's target is always one of these. */
export const DIFFICULTY_CLASSES = { "very-easy": 5, easy: 10, medium: 15, hard: 20, "very-hard": 25, "nearly-impossible": 30 } as const
export type Difficulty = keyof typeof DIFFICULTY_CLASSES
export const difficulties = Object.keys(DIFFICULTY_CLASSES) as [Difficulty, ...Difficulty[]]

export const rollModes = ["normal", "advantage", "disadvantage"] as const
export type RollMode = (typeof rollModes)[number]

/** Who rolls: a hero with its sheet, or an NPC with the stat block it names, and the conditions they bear. */
export type Roller = { name?: string; type?: string; sheet?: Sheet; statBlock?: string; conditions?: readonly ConditionEntry[] }

/** The ability a check uses. */
export const checkAbility = (check: Check): AbilityId => (check.kind === "skill" ? (skillById.get(check.skill)?.ability as AbilityId) : check.ability)

/** A check's name on screen and in the story: "Stealth", "Dexterity", "Dexterity Saving Throw". */
export function checkName(check: Check): string {
  if (check.kind === "skill") return skillById.get(check.skill)?.name ?? check.skill
  const ability = abilityById.get(check.ability)?.name ?? check.ability
  return check.kind === "save" ? `${ability} Saving Throw` : ability
}

/**
 * The fixed menu the game master picks a check from, by id: a skill ("stealth"), a bare ability ("strength") or a
 * saving throw ("strength-save"). Nothing off it can be rolled.
 */
export const checkMenu: readonly { id: string; check: Check; name: string; uses: string }[] = [
  ...skills.map((skill) => ({ id: skill.id, check: { kind: "skill" as const, skill: skill.id }, name: `${skill.name} (${abilityById.get(skill.ability)?.name})`, uses: skill.exampleUses })),
  ...abilities.map((ability) => ({ id: ability.name.toLowerCase(), check: { kind: "ability" as const, ability: ability.id }, name: ability.name, uses: ability.checkExamples })),
  ...abilities.map((ability) => ({
    id: `${ability.name.toLowerCase()}-save`,
    check: { kind: "save" as const, ability: ability.id },
    name: `${ability.name} Saving Throw`,
    uses: ability.saveExamples,
  })),
]
const checkByMenuId = new Map(checkMenu.map((entry) => [entry.id, entry.check]))
export const checkMenuIds = checkMenu.map((entry) => entry.id) as [string, ...string[]]
export const checkFromMenu = (id: string): Check | undefined => checkByMenuId.get(id)

/**
 * The bonus a character adds to the d20 for a check. A hero's comes from its sheet. An NPC's comes from the SRD stat
 * block it names, or the Commoner's when it names none: the skill bonus the block prints, or the ability's modifier.
 * Exhaustion takes 2 off for each level. Nothing is rolled for a hero with no sheet.
 */
export const checkBonus = (character: Roller, check: Check): number => baseBonus(character, check) - d20Penalty(character)

function baseBonus(character: Roller, check: Check): number {
  if (character.sheet) {
    const derived = deriveSheet(character.sheet)
    if (check.kind === "skill") return derived.skills[check.skill].bonus
    if (check.kind === "save") return derived.savingThrows[check.ability].bonus
    return derived.abilityModifiers[check.ability]
  }
  const monster = character.type === "npc" ? (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)) : undefined
  if (!monster) throw new Error(`${character.name ?? "This character"} has no rules sheet, so nothing can be rolled for them.`)
  const line = monster.abilities[checkAbility(check)]
  if (check.kind === "skill") return monster.skills?.[check.skill] ?? line.mod
  return check.kind === "save" ? line.save : line.mod
}

/** The ability a hero casts spells with, from its class. A class with no spellcasting has none. */
export const spellcastingAbilityOf = (character: Roller): AbilityId | undefined => (character.sheet ? classById.get(character.sheet.class)?.spellcasting?.ability : undefined)

/**
 * Advantage and Disadvantage the sheet itself settles, each with what it comes from. No model is asked: armor that
 * hinders Stealth gives Disadvantage on Dexterity (Stealth) checks. Other typed sources join here as they are needed.
 */
export function sheetModes(character: Roller, check: Check): { mode: "advantage" | "disadvantage"; from: string }[] {
  const sheet = character.sheet
  if (!sheet) return []
  const found: { mode: "advantage" | "disadvantage"; from: string }[] = []
  if (check.kind === "skill" && check.skill === "stealth" && sheet.armor && deriveSheet(sheet).stealthDisadvantage) {
    found.push({ mode: "disadvantage", from: equipmentById.get(sheet.armor)?.name ?? "Armor" })
  }
  return found
}

/** Advantage and Disadvantage together make a plain roll, however many of each there are. */
export function combineModes(modes: readonly RollMode[]): RollMode {
  const advantage = modes.includes("advantage")
  const disadvantage = modes.includes("disadvantage")
  if (advantage === disadvantage) return "normal"
  return advantage ? "advantage" : "disadvantage"
}

export type CheckResult = {
  /** Every d20 rolled: one, or two with Advantage or Disadvantage. */
  dice: number[]
  /** The die that counts. */
  natural: number
  bonus: number
  total: number
  dc: number
  success: boolean
  mode: RollMode
}

/**
 * Resolve a check: the d20 plus the bonus against the target. Advantage keeps the higher of two dice and Disadvantage
 * the lower. A 20 or a 1 on the die has no special effect on a check or a save: only the total counts. `fails` is a
 * saving throw a condition makes the roller fail outright, whatever the dice show.
 */
export function resolveCheck(args: { dice: readonly number[]; bonus: number; dc: number; mode?: RollMode; fails?: boolean }): CheckResult {
  const mode = args.mode ?? "normal"
  const needed = mode === "normal" ? 1 : 2
  const dice = args.dice.slice(0, needed)
  if (dice.length < needed) throw new Error(`A roll with ${mode === "normal" ? "no Advantage or Disadvantage" : mode} takes ${needed} d20, and ${dice.length} came.`)
  for (const die of dice) if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
  const total = natural + args.bonus
  return { dice, natural, bonus: args.bonus, total, dc: args.dc, success: !args.fails && total >= args.dc, mode }
}

export type { SkillId }
