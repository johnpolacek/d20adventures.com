import { type AbilityId, abilityIds, classIdSchema, idSchema, type SkillId, skillIdSchema } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { z } from "zod"
import { deriveSheet } from "./derive"
import { hitPointsOf, withHitPoints } from "./hit-points"
import { type Levelling, levelOwed, withLevelDue } from "./level-owed"
import { type LevelUpChoices, levelUp, levelUpOptions, type PicksOffer } from "./level-up"
import { type FeaturePick, featurePickSchema, type Sheet } from "./sheet"
import { isEngineSpell, spellById } from "./spells"

/**
 * Levelling by milestone. Each adventure is played at a level (its manifest's `level`, 1 where it gives none), and a
 * hero below the level of their adventure is owed the levels up to it: `levelDue` on the hero. The end of an adventure
 * raises what is due to the level of the adventure that follows. An AI companion takes what is due at once, and a
 * player chooses theirs on the level-up screen.
 */

const raise = z.number().int().min(1).max(2)
/** A player's choices for a level, as a host receives them. `levelUp` checks what they mean. */
export const levelUpChoicesSchema = z.strictObject({
  subclass: idSchema.optional(),
  feat: idSchema.optional(),
  abilities: z.strictObject({ str: raise, dex: raise, con: raise, int: raise, wis: raise, cha: raise }).partial().optional(),
  featPicks: z
    .strictObject({ spellList: classIdSchema, spellAbility: z.enum(abilityIds), cantrips: z.array(idSchema), spell: idSchema, skills: z.array(skillIdSchema) })
    .partial()
    .optional(),
  expertise: z.array(skillIdSchema).optional(),
  skills: z.array(skillIdSchema).optional(),
  featureChoices: z.record(idSchema, idSchema).optional(),
  featurePicks: z.record(idSchema, z.array(featurePickSchema)).optional(),
  cantrips: z.array(idSchema).optional(),
  spells: z.array(idSchema).optional(),
  spellbook: z.array(idSchema).optional(),
  weaponMasteries: z.array(idSchema).optional(),
}) satisfies z.ZodType<LevelUpChoices>

/** Spells the engine resolves before those it only tells, then the highest level, then those that harm or heal. */
export const spellOrder = (a: { id: string; level?: number }, b: { id: string; level?: number }) => {
  const runs = (id: string) => (spellById.get(id) && isEngineSpell(spellById.get(id) as Parameters<typeof isEngineSpell>[0]) ? 0 : 1)
  const strikes = (id: string) => (spellById.get(id)?.damage || spellById.get(id)?.healing ? 0 : 1)
  return runs(a.id) - runs(b.id) || (b.level ?? 0) - (a.level ?? 0) || strikes(a.id) - strikes(b.id)
}

/**
 * Metamagic in the order a pick that needs no player takes it. The engine runs no Metamagic option yet, so the order is
 * by how often each changes a fight: an action's spell as a Bonus Action, a second target, better damage.
 */
const METAMAGIC_ORDER = [
  "quickened-spell",
  "twinned-spell",
  "empowered-spell",
  "careful-spell",
  "extended-spell",
  "heightened-spell",
  "distant-spell",
  "seeking-spell",
  "subtle-spell",
  "transmuted-spell",
]

/**
 * The picks of a feature that takes several, filled to its count with picks that need no player: those kept, then the
 * options whose prerequisite the hero meets, an option that casts a spell the engine runs with no slot first, then one
 * that works with a cantrip the hero knows (with the first such cantrip), then the rest in the data's order (Metamagic
 * by `METAMAGIC_ORDER`). An option that gives a feat gives the first the hero lacks. `known` is the hero's cantrips,
 * `held` their feats, and `level` the class level.
 */
export function autoPicks(offer: PicksOffer, level: number, known: readonly string[], held: readonly string[]): FeaturePick[] {
  const picks = [...offer.picked]
  const runs = (id: string) => {
    const spell = spellById.get(id)
    return !!spell && isEngineSpell(spell)
  }
  const casts = (id: string) => (classFeatureById.get(offer.feature.id)?.options?.find((option) => option.id === id)?.freeCast ?? []).some((cast) => runs(cast.spell))
  const rank = (id: string) => {
    const option = offer.options.find((each) => each.id === id)
    if (casts(id)) return 0
    if (option?.cantrips) return 1
    if (option?.feats) return 3
    const order = METAMAGIC_ORDER.indexOf(id)
    return 2 + (order < 0 ? 0 : order / 100)
  }
  const ranked = [...offer.options].sort((a, b) => rank(a.id) - rank(b.id))
  while (picks.length < offer.count) {
    const next = ranked.flatMap((option): FeaturePick[] => {
      const need = option.prerequisite
      if ((need?.level ?? 0) > level || (need?.option && !picks.some((pick) => pick.option === need.option))) return []
      const again = picks.filter((pick) => pick.option === option.id)
      if (again.length && !option.repeatable) return []
      if (option.cantrips) {
        // A cantrip cast from range first: the hero need not stand in reach to use it.
        const ranged = [...option.cantrips].sort((a, b) => Number(spellById.get(b.id)?.attack === "ranged") - Number(spellById.get(a.id)?.attack === "ranged"))
        const cantrip = ranged.find((each) => known.includes(each.id) && !again.some((pick) => pick.cantrip === each.id))
        return cantrip ? [{ option: option.id, cantrip: cantrip.id }] : []
      }
      if (option.feats) {
        const feat = option.feats.find((each) => !held.includes(each.id) && !picks.some((pick) => pick.feat === each.id))
        return feat ? [{ option: option.id, feat: feat.id }] : []
      }
      return [{ option: option.id }]
    })[0]
    if (!next) break
    picks.push(next)
  }
  return picks
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
  if (options.featurePicks) {
    const known = [...(sheet.cantrips ?? []), ...(choices.cantrips ?? [])]
    const held = deriveSheet(sheet).feats
    choices.featurePicks = Object.fromEntries(options.featurePicks.map((offer) => [offer.feature.id, autoPicks(offer, options.level, known, held)]))
  }
  if (options.spellbook) {
    const from = [...options.spellbook.from].sort(spellOrder)
    const evocation = first(
      from.filter((entry) => entry.school === "evocation"),
      options.spellbook.evocation
    )
    choices.spellbook = [...evocation, ...first(from, options.spellbook.count - evocation.length)]
  }
  if (options.spells) {
    // A Wizard prepares from the spellbook, with what this level writes into it. A land chosen now keeps its spells
    // prepared: they are not picked, and one already prepared is replaced.
    const book = sheet.spellbook ? new Set([...sheet.spellbook, ...(choices.spellbook ?? [])]) : undefined
    const prepares = (options.featureChoices ?? [])
      .flatMap((entry) => entry.options.find((option) => option.id === choices.featureChoices?.[entry.feature.id])?.prepares ?? [])
      .map((spell) => spell.id)
    const replaced = (sheet.spells ?? []).filter((id) => prepares.includes(id)).length
    const from = options.spells.from.filter((entry) => (!book || book.has(entry.id)) && !prepares.includes(entry.id)).sort(spellOrder)
    choices.spells = from.slice(0, options.spells.count + replaced).map((entry) => entry.id)
  }
  if (options.weaponMasteries) {
    const carried = new Set(sheet.weapons ?? [])
    const from = [...options.weaponMasteries.from].sort((a, b) => Number(carried.has(b.id)) - Number(carried.has(a.id)))
    choices.weaponMasteries = first(from, options.weaponMasteries.count)
  }
  return choices
}

/**
 * A hero one level on, with the player's choices, or what stops it. Their hit points rise by what the level adds to
 * their maximum, and one at 0 stays there. The level due to them is kept while they are still below it.
 */
export function takeLevel<T extends Levelling>(hero: T, choices: LevelUpChoices): { character: T & { sheet: Sheet; hitPoints: number; healthPercent: number } } | { problems: string[] } {
  if (!hero.sheet) return { problems: ["the hero has no rules sheet"] }
  if (!levelOwed(hero)) return { problems: ["no level is owed to this hero"] }
  const result = levelUp(hero.sheet, choices)
  if ("problems" in result) return result
  const before = hitPointsOf(hero)
  const levelled = withLevelDue({ ...hero, sheet: result.sheet }, hero.levelDue ?? result.sheet.level)
  const maximum = hitPointsOf(levelled)?.maximum ?? 0
  const current = before && before.current > 0 ? before.current + maximum - before.maximum : (before?.current ?? maximum)
  return { character: withHitPoints(levelled, current) as T & { sheet: Sheet; hitPoints: number; healthPercent: number } }
}

/**
 * A hero brought to the level due to them. One an AI plays takes every level at once, by the choices that need no
 * player. A player's hero is marked as owed it, and chooses on the level-up screen.
 */
export function raisedTo<T extends Levelling & { controlledBy?: "ai" }>(hero: T, level: number): T {
  let raised = withLevelDue(hero, level)
  while (raised.controlledBy === "ai" && raised.sheet && levelOwed(raised)) {
    const taken = takeLevel(raised, autoChoices(raised.sheet))
    if ("problems" in taken) break
    raised = taken.character
  }
  return raised
}

export { LEVEL_CAP, levelOwed, withLevelDue } from "./level-owed"
