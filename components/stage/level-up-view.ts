// What the level-up screen keeps while a player chooses, and how it becomes the choices the engine checks. Only types
// come from the engine here, so the screen's own code carries none of the rules data: that loads with `useLevelUp`.

import type { FeatOffer, LevelUpChoices, LevelUpOptions, Named, PickOffer, PicksOffer } from "@d20/gm-core/sheet/level-up"
import type { FeaturePick } from "@d20/gm-core/sheet/sheet"

export type AbilityId = "str" | "dex" | "con" | "int" | "wis" | "cha"
export const ABILITY_NAMES: Record<AbilityId, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }

/** A player's picks so far. Lists that belong to one feature are kept by the feature's id. */
export type Picks = {
  subclass?: string
  feat?: string
  abilities: Partial<Record<AbilityId, number>>
  featList?: string
  featAbility?: AbilityId
  featCantrips: string[]
  featSpell?: string
  featSkills: string[]
  expertise: Record<string, string[]>
  skills: string[]
  featureChoices: Record<string, string>
  optionCantrips: Record<string, string[]>
  /** All the picks of a feature that takes several, by the feature's id: those kept, and those added. */
  featurePicks: Record<string, FeaturePick[]>
  cantrips: string[]
  spellbook: string[]
  spells: string[]
  weaponMasteries: string[]
}

/** Nothing picked, but what the level leaves no choice in: a class's one subclass. */
export function emptyPicks(options: LevelUpOptions): Picks {
  return {
    subclass: options.subclass?.length === 1 ? options.subclass[0].id : undefined,
    abilities: {},
    featCantrips: [],
    featSkills: [],
    expertise: {},
    skills: [],
    featureChoices: {},
    optionCantrips: {},
    featurePicks: Object.fromEntries((options.featurePicks ?? []).map((offer) => [offer.feature.id, offer.picked.map((pick) => ({ ...pick }))])),
    cantrips: [],
    spellbook: [],
    spells: [],
    weaponMasteries: [],
  }
}

/** The points a feat's ability raise gives in all, and the most one score may take: 2 and 2 for an Ability Score Improvement. */
export function raiseOf(feat: FeatOffer | undefined): { total: number; most: number } | undefined {
  const increase = feat?.abilityScoreIncrease
  if (!increase) return undefined
  return { total: Math.max(...increase.choices.map((choice) => choice.count * choice.amount)), most: Math.max(...increase.choices.map((choice) => choice.amount)) }
}

const featOf = (options: LevelUpOptions, picks: Picks) => options.feat?.feats.find((feat) => feat.id === picks.feat)
const optionOf = (options: LevelUpOptions, picks: Picks, feature: string) =>
  options.featureChoices?.find((entry) => entry.feature.id === feature)?.options.find((option) => option.id === picks.featureChoices[feature])

/** The spells a Wizard may prepare from: those of the level's list that are in the spellbook, with what this level writes into it. */
export function preparable(options: LevelUpOptions, book: readonly string[] | undefined, picks: Picks): (Named & { level: number; list?: string })[] {
  const from = options.spells?.from ?? []
  if (!book) return from
  const pages = new Set([...book, ...picks.spellbook])
  return from.filter((spell) => pages.has(spell.id))
}

/**
 * Prepared spells at this level, with a land chosen now: the land's spells are not picked, and one of them already
 * prepared leaves the list, so one more is picked.
 */
export function spellsToPick(options: LevelUpOptions, picks: Picks, prepared: readonly string[] | undefined): { count: number; kept: Set<string> } {
  const kept = new Set((options.featureChoices ?? []).flatMap((entry) => optionOf(options, picks, entry.feature.id)?.prepares ?? []).map((spell) => spell.id))
  return { count: (options.spells?.count ?? 0) + (prepared ?? []).filter((id) => kept.has(id)).length, kept }
}

/**
 * Why an option of a feature that takes several cannot be picked now, in its printed words, or nothing when it can: a
 * class level not reached, another option not picked, or no cantrip the hero knows of the kind it names. `known` is the
 * hero's cantrips with those chosen now.
 */
export function unmet(option: PickOffer, picked: readonly FeaturePick[], level: number, known: readonly string[]): string | undefined {
  const need = option.prerequisite
  if (!need) return undefined
  const short = (need.level ?? 0) > level || (need.option && !picked.some((pick) => pick.option === need.option)) || (option.cantrips && !option.cantrips.some((cantrip) => known.includes(cantrip.id)))
  return short ? need.text : undefined
}

/**
 * Picks with one switched in or out. A plain option is one pick. An option that works with a cantrip or gives a feat is
 * one pick for each cantrip or feat (`with`), so a repeatable option is picked again by picking another. Nothing is
 * added past the feature's count.
 */
export function togglePick(offer: PicksOffer, picked: readonly FeaturePick[], option: string, withId?: string): FeaturePick[] {
  const entry = offer.options.find((each) => each.id === option)
  const pick: FeaturePick = { option, ...(withId && entry?.cantrips ? { cantrip: withId } : {}), ...(withId && entry?.feats ? { feat: withId } : {}) }
  const same = (each: FeaturePick) => each.option === pick.option && each.cantrip === pick.cantrip && each.feat === pick.feat
  if (picked.some(same)) return picked.filter((each) => !same(each))
  return picked.length < offer.count ? [...picked, pick] : [...picked]
}

/**
 * Whether a feature's spell picks fill its slots, each spell in one that takes its level (Mystic Arcanum's one of each
 * level). Each goes to the narrowest slot that takes it. True for a feature whose picks are not spells.
 */
export function fillsSlots(offer: PicksOffer, picked: readonly FeaturePick[]): boolean {
  if (!offer.slots) return true
  const free = [...offer.slots].sort((a, b) => a.length - b.length)
  for (const pick of picked) {
    const level = offer.options.find((option) => option.id === pick.option)?.level
    const index = free.findIndex((slot) => level !== undefined && slot.includes(level))
    if (index < 0) return false
    free.splice(index, 1)
  }
  return true
}

/** How many of the picks kept from before a feature's picks have dropped. */
export function replacedCount(offer: PicksOffer, picked: readonly FeaturePick[]): number {
  return offer.picked.filter((old) => !picked.some((each) => each.option === old.option && each.cantrip === old.cantrip && each.feat === old.feat)).length
}

/** What is still to choose, in the screen's own words. Empty when the level can be taken. `prepared` is the sheet's prepared spells. */
export function missing(options: LevelUpOptions, picks: Picks, prepared?: readonly string[]): string[] {
  const left: string[] = []
  const short = (have: number, need: number, one: string, many: string) => {
    if (have < need) left.push(`${need - have} more ${need - have === 1 ? one : many}`)
  }
  if (options.subclass && !picks.subclass) left.push("a subclass")
  if (options.feat) {
    const feat = featOf(options, picks)
    if (!feat) left.push("a feat")
    const raise = raiseOf(feat)
    if (raise)
      short(
        Object.values(picks.abilities).reduce((sum, amount) => sum + (amount ?? 0), 0),
        raise.total,
        "ability point",
        "ability points"
      )
    if (feat?.spellPicks) {
      if (!picks.featList) left.push("a spell list")
      if (!picks.featAbility) left.push("a spellcasting ability")
      short(picks.featCantrips.length, feat.spellPicks.cantrips, "cantrip", "cantrips")
      if (!picks.featSpell) left.push("a spell")
    }
    if (feat?.skillPicks) short(picks.featSkills.length, Math.min(feat.skillPicks.count, feat.skillPicks.from.length), "skill", "skills")
  }
  for (const entry of options.expertise ?? []) short(picks.expertise[entry.feature.id]?.length ?? 0, Math.min(entry.count, entry.from.length), "Expertise skill", "Expertise skills")
  if (options.skills) short(picks.skills.length, Math.min(options.skills.count, options.skills.from.length), "skill", "skills")
  for (const entry of options.featureChoices ?? []) {
    const option = optionOf(options, picks, entry.feature.id)
    if (!option) left.push(entry.feature.name)
    else if (option.cantrips) short(picks.optionCantrips[entry.feature.id]?.length ?? 0, option.cantrips.count, "cantrip", "cantrips")
  }
  for (const offer of options.featurePicks ?? []) {
    const picked = picks.featurePicks[offer.feature.id] ?? []
    short(picked.length, offer.count, offer.feature.name.replace(/s$/, ""), offer.feature.name)
    if (replacedCount(offer, picked) > (offer.replace ? 1 : 0)) left.push(`${offer.feature.name}: ${offer.replace ? "only one" : "none"} of those held may be replaced`)
    if (!fillsSlots(offer, picked)) left.push(`${offer.feature.name}: one spell of each level`)
  }
  if (options.cantrips) short(picks.cantrips.length, options.cantrips.count, "cantrip", "cantrips")
  if (options.spellbook) {
    short(picks.spellbook.length, options.spellbook.count, "spellbook spell", "spellbook spells")
    const evocations = options.spellbook.from.filter((spell) => picks.spellbook.includes(spell.id) && spell.school === "evocation").length
    if (picks.spellbook.length >= options.spellbook.count && evocations < options.spellbook.evocation) left.push(`${options.spellbook.evocation} Evocation spells in the spellbook`)
  }
  if (options.spells) short(picks.spells.length, spellsToPick(options, picks, prepared).count, "prepared spell", "prepared spells")
  if (options.weaponMasteries) short(picks.weaponMasteries.length, Math.min(options.weaponMasteries.count, options.weaponMasteries.from.length), "weapon mastery", "weapon masteries")
  return left
}

/** The picks as the engine takes them. */
export function toChoices(options: LevelUpOptions, picks: Picks): LevelUpChoices {
  const feat = featOf(options, picks)
  const optionCantrips = (options.featureChoices ?? []).flatMap((entry) => (optionOf(options, picks, entry.feature.id)?.cantrips ? (picks.optionCantrips[entry.feature.id] ?? []) : []))
  const cantrips = [...picks.cantrips, ...optionCantrips]
  const expertise = (options.expertise ?? []).flatMap((entry) => picks.expertise[entry.feature.id] ?? [])
  const abilities = Object.fromEntries(Object.entries(picks.abilities).filter(([, amount]) => amount))
  return {
    ...(options.subclass && picks.subclass ? { subclass: picks.subclass } : {}),
    ...(feat ? { feat: feat.id } : {}),
    ...(feat?.abilityScoreIncrease && Object.keys(abilities).length ? { abilities } : {}),
    ...(feat?.spellPicks ? { featPicks: { spellList: picks.featList, spellAbility: picks.featAbility, cantrips: picks.featCantrips, spell: picks.featSpell } } : {}),
    ...(feat?.skillPicks ? { featPicks: { skills: picks.featSkills } } : {}),
    ...(expertise.length ? { expertise } : {}),
    ...(options.skills && picks.skills.length ? { skills: picks.skills } : {}),
    ...(Object.keys(picks.featureChoices).length ? { featureChoices: picks.featureChoices } : {}),
    ...(options.featurePicks?.length ? { featurePicks: picks.featurePicks } : {}),
    ...(cantrips.length ? { cantrips } : {}),
    ...(picks.spells.length ? { spells: picks.spells } : {}),
    ...(picks.spellbook.length ? { spellbook: picks.spellbook } : {}),
    ...(picks.weaponMasteries.length ? { weaponMasteries: picks.weaponMasteries } : {}),
  } as LevelUpChoices
}

/** Choices the engine made, laid out as picks: what Choose For Me fills in. */
export function fromChoices(options: LevelUpOptions, choices: LevelUpChoices): Picks {
  const picks = emptyPicks(options)
  const left = new Set<string>(choices.expertise ?? [])
  for (const entry of options.expertise ?? []) {
    const mine = entry.from.filter((skill) => left.has(skill.id)).slice(0, entry.count)
    for (const skill of mine) left.delete(skill.id)
    picks.expertise[entry.feature.id] = mine.map((skill) => skill.id)
  }
  return {
    ...picks,
    subclass: choices.subclass ?? picks.subclass,
    feat: choices.feat,
    abilities: { ...choices.abilities },
    featList: choices.featPicks?.spellList,
    featAbility: choices.featPicks?.spellAbility,
    featCantrips: [...(choices.featPicks?.cantrips ?? [])],
    featSpell: choices.featPicks?.spell,
    featSkills: [...(choices.featPicks?.skills ?? [])],
    skills: [...(choices.skills ?? [])],
    featureChoices: { ...choices.featureChoices },
    featurePicks: { ...picks.featurePicks, ...choices.featurePicks },
    cantrips: [...(choices.cantrips ?? [])],
    spellbook: [...(choices.spellbook ?? [])],
    spells: [...(choices.spells ?? [])],
    weaponMasteries: [...(choices.weaponMasteries ?? [])],
  }
}

/** A list with an id switched in or out, never longer than `most`: at the limit the oldest pick gives way. */
export function toggled(list: readonly string[], id: string, most: number): string[] {
  if (list.includes(id)) return list.filter((other) => other !== id)
  return [...list, id].slice(-Math.max(1, most))
}
