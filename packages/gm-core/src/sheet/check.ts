import { type AbilityId, abilityIdSchema, type SkillId, skillIdSchema } from "@d20/srd"
import { abilities, abilityById } from "@d20/srd/abilities"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { monsterById } from "@d20/srd/monsters"
import { skillById, skills } from "@d20/srd/skills"
import { z } from "zod"
import type { Shape } from "../types/character"
import type { ConditionEntry } from "./condition-entry"
import { d20Penalty } from "./conditions"
import { deriveSheet } from "./derive"
import { itemBonus } from "./items"
import { shapedModifiers, shapeOf } from "./shape"
import type { Sheet } from "./sheet"
import type { Side } from "./sides"
import { DEFAULT_STAT_BLOCK } from "./stat-block"
import type { SpellEffect } from "./turn-effect"

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

/** Who rolls: a hero with its sheet, or an NPC with the stat block it names, and the conditions they bear. A hero may hold a Beast's shape (./shape). */
export type Roller = {
  id?: string
  name?: string
  type?: string
  /** An NPC's side in the encounter, when it is marked (./sides). */
  side?: Side
  sheet?: Sheet
  statBlock?: string
  conditions?: readonly ConditionEntry[]
  spellEffects?: readonly SpellEffect[]
  shape?: Shape
}

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
export const checkBonus = (character: Roller, check: Check, instead?: AbilityId): number => baseBonus(character, check, instead) - d20Penalty(character)

function baseBonus(character: Roller, check: Check, instead?: AbilityId): number {
  if (character.sheet) {
    const derived = deriveSheet(character.sheet)
    // In a Beast's shape its Strength, Dexterity and Constitution take the place of the hero's, who keeps their
    // proficiencies, and a skill or save the stat block prints higher is used instead (./shape).
    const shape = shapeOf(character)
    const mods = shapedModifiers(derived.abilityModifiers, shape)
    // A skill made with another ability, where a class feature allows it (`instead`, ./class-rules `classCheckBonus`):
    // the skill's training stays, and that ability's modifier takes the place of its own.
    const own =
      check.kind === "skill"
        ? derived.skills[check.skill].bonus - derived.abilityModifiers[checkAbility(check)] + mods[instead ?? checkAbility(check)]
        : check.kind === "save"
          ? derived.savingThrows[check.ability].bonus - derived.abilityModifiers[check.ability] + mods[check.ability]
          : // A worn item's bonus to every ability check: a Stone of Good Luck's 1.
            mods[check.ability] + itemBonus(character.sheet, "ability-checks")
    const printed = !shape ? undefined : check.kind === "skill" ? shape.skills?.[check.skill] : check.kind === "save" ? shape.abilities[check.ability].save : undefined
    return Math.max(own, printed ?? own)
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
 * hinders Stealth gives Disadvantage on Dexterity (Stealth) checks. A class's own follow them (./class-rules
 * `classCheckModes`): a Champion's Remarkable Athlete gives Advantage on Strength (Athletics) checks. Other typed
 * sources join here as they are needed.
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
  /** A Bardic Inspiration die rolled and added to a roll that had failed (./features). `total` includes it. */
  inspired?: number
  /** Dice that lasting spells added or took away, each as it fell (./spell-effects). `total` includes them. */
  adds?: { from: string; amount: number }[]
}

/**
 * Resolve a check: the d20 plus the bonus against the target. Advantage keeps the higher of two dice and Disadvantage
 * the lower. A 20 or a 1 on the die has no special effect on a check or a save: only the total counts. `fails` is a
 * saving throw a condition makes the roller fail outright, whatever the dice show. `adds` are dice a lasting spell
 * adds or takes away, already rolled: Bless's d4.
 */
export function resolveCheck(args: { dice: readonly number[]; bonus: number; dc: number; mode?: RollMode; fails?: boolean; adds?: readonly { from: string; amount: number }[] }): CheckResult {
  const mode = args.mode ?? "normal"
  const needed = mode === "normal" ? 1 : 2
  const dice = args.dice.slice(0, needed)
  if (dice.length < needed) throw new Error(`A roll with ${mode === "normal" ? "no Advantage or Disadvantage" : mode} takes ${needed} d20, and ${dice.length} came.`)
  for (const die of dice) if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error(`${die} is not a d20 roll.`)
  const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
  const total = natural + args.bonus + (args.adds ?? []).reduce((sum, add) => sum + add.amount, 0)
  return { dice, natural, bonus: args.bonus, total, dc: args.dc, success: !args.fails && total >= args.dc, mode, ...(args.adds?.length ? { adds: [...args.adds] } : {}) }
}

export type { SkillId }
