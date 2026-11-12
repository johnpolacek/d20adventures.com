import { type AbilityId, abilityIdSchema, type SkillId, skillIdSchema } from "@d20/srd"
import { abilityById } from "@d20/srd/abilities"
import { skillById } from "@d20/srd/skills"
import { z } from "zod"
import { deriveSheet } from "./derive"
import type { Sheet } from "./sheet"

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

/** Who rolls: a hero with its sheet, or an NPC with the stat block it names. */
export type Roller = { name?: string; type?: string; sheet?: Sheet; statBlock?: string }

/** The ability a check uses. */
export const checkAbility = (check: Check): AbilityId => (check.kind === "skill" ? (skillById.get(check.skill)?.ability as AbilityId) : check.ability)

/** A check's name on screen and in the story: "Stealth", "Dexterity", "Dexterity Saving Throw". */
export function checkName(check: Check): string {
  if (check.kind === "skill") return skillById.get(check.skill)?.name ?? check.skill
  const ability = abilityById.get(check.ability)?.name ?? check.ability
  return check.kind === "save" ? `${ability} Saving Throw` : ability
}

/**
 * The bonus a character adds to the d20 for a check, from its sheet. Nothing is rolled for a character with no sheet:
 * every hero has one.
 */
export function checkBonus(character: Roller, check: Check): number {
  if (!character.sheet) throw new Error(`${character.name ?? "This character"} has no rules sheet, so nothing can be rolled for them.`)
  const derived = deriveSheet(character.sheet)
  if (check.kind === "skill") return derived.skills[check.skill].bonus
  if (check.kind === "save") return derived.savingThrows[check.ability].bonus
  return derived.abilityModifiers[check.ability]
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
 * the lower. A 20 or a 1 on the die has no special effect on a check or a save: only the total counts.
 */
export function resolveCheck(args: { dice: readonly number[]; bonus: number; dc: number; mode?: RollMode }): CheckResult {
  const mode = args.mode ?? "normal"
  const needed = mode === "normal" ? 1 : 2
  const dice = args.dice.slice(0, needed)
  if (dice.length < needed) throw new Error(`A roll with ${mode === "normal" ? "no Advantage or Disadvantage" : mode} takes ${needed} d20, and ${dice.length} came.`)
  for (const die of dice) if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
  const total = natural + args.bonus
  return { dice, natural, bonus: args.bonus, total, dc: args.dc, success: total >= args.dc, mode }
}

export type { SkillId }
