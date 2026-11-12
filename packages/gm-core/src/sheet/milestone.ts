import { type AbilityId, abilityIds, classIdSchema, idSchema, type SkillId, skillIdSchema } from "@d20/srd"
import { classById } from "@d20/srd/classes"
import { z } from "zod"
import { deriveSheet } from "./derive"
import { withHitPoints } from "./hit-points"
import { LEVEL_CAP, type Levelling } from "./level-owed"
import { type LevelUpChoices, levelUp, levelUpOptions } from "./level-up"
import type { Sheet } from "./sheet"
import { isEngineSpell, spellById } from "./spells"

/**
 * Levelling by milestone: finishing an adventure gives each hero who lived through it one level, once for that
 * adventure. The hero keeps the ids of the adventures that gave them a level (`milestones`), so one played again gives
 * nothing more.
 */

const raise = z.number().int().min(1).max(2)
/** A player's choices for a level, as a host receives them. `levelUp` checks what they mean. */
export const levelUpChoicesSchema = z.strictObject({
  subclass: idSchema.optional(),
  feat: idSchema.optional(),
  abilities: z.strictObject({ str: raise, dex: raise, con: raise, int: raise, wis: raise, cha: raise }).partial().optional(),
  featPicks: z
    .strictObject({ spellList: classIdSchema, spellAbility: z.enum(abilityIds), cantrips: z.array(idSchema), spell: idSchema })
    .partial()
    .optional(),
  expertise: z.array(skillIdSchema).optional(),
  skills: z.array(skillIdSchema).optional(),
  featureChoices: z.record(idSchema, idSchema).optional(),
  cantrips: z.array(idSchema).optional(),
  spells: z.array(idSchema).optional(),
  spellbook: z.array(idSchema).optional(),
  weaponMasteries: z.array(idSchema).optional(),
}) satisfies z.ZodType<LevelUpChoices>

// Spells the engine resolves before those it only tells, then the highest level, then those that harm or heal.
const spellOrder = (a: { id: string; level?: number }, b: { id: string; level?: number }) => {
  const runs = (id: string) => (spellById.get(id) && isEngineSpell(spellById.get(id) as Parameters<typeof isEngineSpell>[0]) ? 0 : 1)
  const strikes = (id: string) => (spellById.get(id)?.damage || spellById.get(id)?.healing ? 0 : 1)
  return runs(a.id) - runs(b.id) || (b.level ?? 0) - (a.level ?? 0) || strikes(a.id) - strikes(b.id)
}

/**
 * Choices for the next level that need no player: the ones an AI companion takes, and what Choose For Me fills in. The
 * class's subclass, an Ability Score Improvement into the class's main ability, the first of each other choice, and
 * the highest spells the engine resolves.
 */
export function autoChoices(sheet: Sheet): LevelUpChoices {
  const options = levelUpOptions(sheet)
  const choices: LevelUpChoices = {}
  if (options.subclass?.length) choices.subclass = options.subclass[0].id

  const increase = options.feat?.feats.find((feat) => feat.abilityScoreIncrease)
  if (options.feat && increase?.abilityScoreIncrease) {
    const primary = classById.get(sheet.class)?.primaryAbility
    const main: AbilityId[] = primary ? ("all" in primary ? primary.all : primary.any) : []
    const allowed = increase.abilityScoreIncrease.from
    const order = [...new Set<AbilityId>([...[...main].sort((a, b) => sheet.abilityScores[b] - sheet.abilityScores[a]), "con", ...abilityIds])].filter((ability) => allowed.includes(ability))
    const raised: Partial<Record<AbilityId, number>> = {}
    let left = 2
    for (const ability of order) {
      const room = Math.min(left, increase.abilityScoreIncrease.maximum - sheet.abilityScores[ability])
      if (room > 0) raised[ability] = room
      left -= Math.max(0, room)
      if (!left) break
    }
    choices.feat = increase.id
    choices.abilities = raised
  }

  // The skills the hero is best at come first.
  const bonuses = deriveSheet(sheet).skills
  const best = <T extends { id: string }>(from: readonly T[]) => [...from].sort((a, b) => (bonuses[b.id as SkillId]?.bonus ?? 0) - (bonuses[a.id as SkillId]?.bonus ?? 0))
  const taken = new Set<string>()
  const first = <T extends { id: string }>(from: readonly T[], count: number) => {
    const picked = from.filter((entry) => !taken.has(entry.id)).slice(0, count)
    for (const entry of picked) taken.add(entry.id)
    return picked.map((entry) => entry.id)
  }
  if (options.expertise) choices.expertise = options.expertise.flatMap((entry) => first(best(entry.from), entry.count)) as LevelUpChoices["expertise"]
  if (options.skills) choices.skills = first(best(options.skills.from), options.skills.count) as LevelUpChoices["skills"]
  if (options.featureChoices)
    choices.featureChoices = Object.fromEntries(
      options.featureChoices.flatMap((entry) => (entry.options.find((option) => !option.cantrips) ? [[entry.feature.id, (entry.options.find((option) => !option.cantrips) as { id: string }).id]] : []))
    )
  if (options.cantrips) choices.cantrips = first([...options.cantrips.from].sort(spellOrder), options.cantrips.count)
  if (options.spellbook) {
    const from = [...options.spellbook.from].sort(spellOrder)
    const evocation = first(
      from.filter((entry) => entry.school === "evocation"),
      options.spellbook.evocation
    )
    choices.spellbook = [...evocation, ...first(from, options.spellbook.count - evocation.length)]
  }
  if (options.spells) {
    // A Wizard prepares from the spellbook, with what this level writes into it.
    const book = sheet.spellbook ? new Set([...sheet.spellbook, ...(choices.spellbook ?? [])]) : undefined
    const from = options.spells.from.filter((entry) => !book || book.has(entry.id)).sort(spellOrder)
    choices.spells = from.slice(0, options.spells.count).map((entry) => entry.id)
  }
  if (options.weaponMasteries) {
    const carried = new Set(sheet.weapons ?? [])
    const from = [...options.weaponMasteries.from].sort((a, b) => Number(carried.has(b.id)) - Number(carried.has(a.id)))
    choices.weaponMasteries = first(from, options.weaponMasteries.count)
  }
  return choices
}

/**
 * A hero one level on for a finished adventure, with the player's choices, or what stops it. They stand at their new
 * Hit Point maximum, as a hero does between adventures.
 */
export function takeLevel<T extends Levelling>(
  hero: T,
  adventureId: string,
  choices: LevelUpChoices
): { character: T & { sheet: Sheet; milestones: string[]; hitPoints: number; healthPercent: number } } | { problems: string[] } {
  if (!hero.sheet) return { problems: ["the hero has no rules sheet"] }
  if (hero.milestones?.includes(adventureId)) return { problems: ["this adventure has already given its level"] }
  if (hero.sheet.level >= LEVEL_CAP) return { problems: [`level ${LEVEL_CAP} is the highest for now`] }
  const result = levelUp(hero.sheet, choices)
  if ("problems" in result) return result
  return { character: withHitPoints({ ...hero, sheet: result.sheet, milestones: [...(hero.milestones ?? []), adventureId] }, Number.POSITIVE_INFINITY) }
}

export { LEVEL_CAP, levelOwed } from "./level-owed"
