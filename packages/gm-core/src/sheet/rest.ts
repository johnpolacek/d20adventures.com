import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import type { Recharge } from "@d20/srd/schema/common"
import { spellById } from "@d20/srd/spells"
import { isDead } from "../utils/turn-actors"
import { turnEffectsAtEncounterEnd } from "./actions"
import type { Roller } from "./check"
import type { ConditionEntry } from "./condition-entry"
import { conditionsAtEncounterEnd, exhaustionOf, withoutCondition } from "./conditions"
import { type DeathSaves, withHealing } from "./death"
import { deriveSheet, sheetProblems } from "./derive"
import { hitPointsOf, withHitPoints } from "./hit-points"
import type { Sheet } from "./sheet"
import { spellcastingOf } from "./spells"
import type { Concentration, Inspiration, SpellEffect, TurnEffect } from "./turn-effect"

/**
 * Short and Long Rests by the SRD 5.2.1, as pure functions. A rest is a stretch of downtime: a Short Rest is 1 hour and
 * a Long Rest at least 8. To start either the character needs at least 1 Hit Point, so a hero at 0 gains nothing from
 * it, and the dead are not restored. Nothing comes back with a new encounter: only a rest gives back what was spent.
 */

type Rester = Roller & {
  type: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  deathSaves?: DeathSaves
  hitDiceUsed?: number
  featureUses?: Record<string, number>
  spellSlots?: readonly number[]
  tempHitPoints?: number
  inspiration?: Inspiration
  concentration?: Concentration
  turnEffects?: readonly TurnEffect[]
  conditions?: readonly ConditionEntry[]
  spellEffects?: readonly SpellEffect[]
}

/** A rest as it went: the character after it, and what it gave in words for the game master. */
export type RestResult<T> = { character: T; facts: string[] }

/**
 * A hero's Hit Point Dice: as many as their level, each the class's die, less those spent. A level 3 Fighter who has
 * spent one has 2 of 3 d10s. A character with no sheet has none.
 */
export function hitDiceOf(character: Pick<Rester, "sheet" | "hitDiceUsed">): { die: number; total: number; left: number } | undefined {
  if (!character.sheet) return undefined
  const total = character.sheet.level
  return { die: deriveSheet(character.sheet).hitDie, total, left: Math.max(0, total - (character.hitDiceUsed ?? 0)) }
}

/** How many Hit Point Dice a hero has left to spend. */
export const hitDiceLeft = (character: Pick<Rester, "sheet" | "hitDiceUsed">): number => hitDiceOf(character)?.left ?? 0

/**
 * How a class feature's uses come back at a class level, by its data: `recharge`, or the step of `rechargeByLevel`
 * the level has reached. A level 1 Bard's Bardic Inspiration comes back on a Long Rest, and from level 5 on a Short or
 * Long Rest (Font of Inspiration). A feature with no uses has none.
 */
export function featureRecharge(featureId: string, level: number): Recharge | undefined {
  const uses = classFeatureById.get(featureId)?.uses
  if (!uses) return undefined
  return uses.rechargeByLevel?.filter((step) => step.level <= level).at(-1)?.recharge ?? uses.recharge
}

const SHORT: readonly Recharge[] = ["short-rest", "short-or-long-rest", "initiative-or-short-or-long-rest"]

/**
 * The spell slots a Wizard's Arcane Recovery takes back, by level, the first for level 1: expended slots with a
 * combined level of at most half the Wizard level rounded up, none of level 6 or higher. The engine takes the most
 * levels it can, and of equal totals the higher slots. A level 4 Wizard with one level 2 and two level 1 slots spent
 * may recover 2 levels: the level 2 slot, [0, 1].
 */
export function arcaneRecoveryOf(character: Rester): number[] {
  const sheet = character.sheet
  if (!sheet || !deriveSheet(sheet).classFeatures.includes("wizard-arcane-recovery")) return []
  const budget = Math.ceil(sheet.level / 2)
  const spent = (character.spellSlots ?? []).slice(0, 5)
  let best: number[] = []
  let bestTotal = 0
  // Every way to take back some of the spent slots of each level, few enough to try them all.
  const tryFrom = (level: number, taken: number[], total: number) => {
    if (level < 1) {
      if (total > bestTotal) {
        best = [...taken]
        bestTotal = total
      }
      return
    }
    for (let count = Math.min(spent[level - 1] ?? 0, Math.floor((budget - total) / level)); count >= 0; count--) {
      taken[level - 1] = count
      tryFrom(level - 1, taken, total + count * level)
    }
  }
  tryFrom(spent.length, [], 0)
  return bestTotal > 0 ? best.map((count) => count ?? 0) : []
}

const MAGICAL_CUNNING = "warlock-magical-cunning"

/**
 * The Pact Magic slots a Warlock's Magical Cunning gives back, by level, the first for level 1: expended slots, no more
 * than half the maximum rounded up, or all of them with Eldritch Master (level 20). None without the feature or with
 * its use spent. A level 5 Warlock with both level 3 slots spent regains one: [0, 0, 1].
 */
export function magicalCunningOf(character: Rester): number[] {
  const sheet = character.sheet
  const features = sheet ? deriveSheet(sheet).classFeatures : []
  if (!features.includes(MAGICAL_CUNNING) || (character.featureUses?.[MAGICAL_CUNNING] ?? 0) > 0) return []
  const total = spellcastingOf(character)?.slots ?? []
  let budget = features.includes("warlock-eldritch-master") ? Number.POSITIVE_INFINITY : Math.ceil(total.reduce((sum, count) => sum + count, 0) / 2)
  const back = total.map((_, index) => {
    const taken = Math.min(budget, character.spellSlots?.[index] ?? 0)
    budget -= taken
    return taken
  })
  return back.some((count) => count > 0) ? back : []
}

/**
 * Magical Cunning (Warlock, level 2): a rite of 1 minute, so not made in a fight, after which the Warlock regains
 * expended Pact Magic slots (./magicalCunningOf). It is used once a Long Rest. The Warlock after it with what it gave
 * in words, or the reason it cannot be made.
 */
export function withMagicalCunning<T extends Rester>(character: T, options: { inFight: boolean }): RestResult<T> | { problem: string } {
  const name = character.name ?? "The character"
  if (!character.sheet || !deriveSheet(character.sheet).classFeatures.includes(MAGICAL_CUNNING)) return { problem: `${name} does not have Magical Cunning.` }
  if (options.inFight) return { problem: "Magical Cunning is a rite of 1 minute, and is not made in a fight." }
  if ((character.featureUses?.[MAGICAL_CUNNING] ?? 0) > 0) return { problem: `${name} has used Magical Cunning, and can use it again after a Long Rest.` }
  const back = magicalCunningOf(character)
  if (!back.length) return { problem: `${name} has no expended Pact Magic spell slots.` }
  const spellSlots = (character.spellSlots ?? []).map((used, index) => used - (back[index] ?? 0))
  const featureUses: Record<string, number> = { ...character.featureUses, [MAGICAL_CUNNING]: 1 }
  const { spellSlots: _, featureUses: __, ...rest } = character
  const count = back.reduce((sum, each) => sum + each, 0)
  return {
    character: { ...rest, featureUses, ...(spellSlots.some((used) => used > 0) ? { spellSlots } : {}) } as T,
    facts: [`${name} performs Magical Cunning and regains ${count} Pact Magic spell ${count === 1 ? "slot" : "slots"}.`],
  }
}

const HOURS = { round: 1 / 600, minute: 1 / 60, hour: 1, day: 24 } as const

// Whether a spell is over after `hours` of rest: one counted in turns, or one whose stated duration runs out within the rest.
const overWithin = (spellId: string, hours: number, turns?: number): boolean => {
  if (turns !== undefined) return true
  const duration = spellById.get(spellId)?.duration
  if (!duration || duration.kind === "instantaneous") return true
  return duration.kind === "timed" && (duration.amount ?? 1) * HOURS[duration.unit as keyof typeof HOURS] <= hours
}

// What the hours of a rest end: a fight's moment, the actions of turns, a held Bardic Inspiration die (it lasts an
// hour), and the spells that run out, with the conditions they gave. `asleep` ends Concentration, as a Long Rest's
// sleep leaves the hero Unconscious.
function timePasses<T extends Rester>(character: T, hours: number, asleep: boolean): T {
  const { inspiration: _, ...rest } = turnEffectsAtEncounterEnd(conditionsAtEncounterEnd(character))
  const spellEffects = (rest.spellEffects ?? []).filter((effect) => !overWithin(effect.spell, hours, effect.turns))
  const conditions = (rest.conditions ?? []).filter((entry) => entry.spell === undefined || !overWithin(entry.spell, hours, entry.turns))
  const held = rest.concentration && !asleep && !overWithin(rest.concentration.spell, hours) ? rest.concentration : undefined
  const { spellEffects: __, conditions: ___, concentration: ____, ...bare } = rest
  return { ...bare, ...(spellEffects.length ? { spellEffects } : {}), ...(conditions.length ? { conditions } : {}), ...(held ? { concentration: held } : {}) } as T
}

// Why a character gains nothing from a rest, if they do not: the dead, and anyone at 0 hit points, who cannot start one.
function unrested(character: Rester): string | undefined {
  const name = character.name ?? "The character"
  if (isDead(character)) return `${name} is dead, and a rest restores nothing.`
  if (hitPointsOf(character)?.current === 0) return `${name} is at 0 hit points and cannot start a rest, so gains nothing from it.`
  return undefined
}

/**
 * A Short Rest by the SRD: an hour of downtime. The hero spends Hit Point Dice, each rolled with the Constitution
 * modifier added, at least 1 hit point a die. The engine spends them one at a time while the hero is short of their
 * maximum by the die's average or more and dice remain. Each class feature regains its uses as its data says: all of
 * them when it recharges on a Short Rest (Action Surge, Bardic Inspiration from level 5), one when a Long Rest feature
 * regains one on a Short Rest (Second Wind, Channel Divinity). A Warlock regains every Pact Magic slot. A Wizard's
 * Arcane Recovery takes back slots once a Long Rest. An NPC's uses that are not a class feature's, a day's casts, stay spent. `roll` throws one die of the size given.
 *
 * Thalbern, a level 1 Ranger with Constitution 13 (+1) at 3 of 11, is 8 short, more than a d10's 5.5: a 9 and his +1
 * make 10, back to 11, "Thalbern spends 1 Hit Point Die and regains 8 hit points, now 11 of 11."
 */
export function shortRest<T extends Rester>(character: T, options: { roll: (sides: number) => number }): RestResult<T> {
  const refused = unrested(character)
  if (refused) return { character, facts: [refused] }
  const name = character.name ?? "The character"
  const facts: string[] = []
  let rested = timePasses(character, 1, false)

  const dice = hitDiceOf(rested)
  const before = hitPointsOf(rested)
  if (dice && before && rested.sheet) {
    const con = deriveSheet(rested.sheet).abilityModifiers.con
    let spent = 0
    for (let now = before; spent < dice.left && now.maximum - now.current >= (dice.die + 1) / 2; spent++) {
      const die = options.roll(dice.die)
      if (!Number.isInteger(die) || die < 1 || die > dice.die) throw new Error(`${die} is not a d${dice.die} roll.`)
      rested = withHealing(rested, Math.max(1, die + con))
      now = hitPointsOf(rested) ?? now
    }
    if (spent > 0) {
      rested = { ...rested, hitDiceUsed: (rested.hitDiceUsed ?? 0) + spent }
      const after = hitPointsOf(rested) ?? before
      facts.push(`${name} spends ${spent} Hit Point ${spent === 1 ? "Die" : "Dice"} and regains ${after.current - before.current} hit points, now ${after.current} of ${after.maximum}.`)
    }
  }

  const level = rested.sheet?.level ?? 1
  const uses: Record<string, number> = {}
  for (const [key, used] of Object.entries(rested.featureUses ?? {})) {
    const feature = classFeatureById.get(key)
    const recharge = featureRecharge(key, level)
    const regain = recharge && SHORT.includes(recharge) ? used : (feature?.uses?.shortRestRegain ?? 0)
    if (used - regain > 0) uses[key] = used - regain
    if (feature && regain > 0 && used > 0) facts.push(`${name} regains ${regain === used && regain > 1 ? "all expended uses" : regain === 1 ? "one use" : `${regain} uses`} of ${feature.name}.`)
  }

  const recovered = (rested.featureUses?.["wizard-arcane-recovery"] ?? 0) > 0 ? [] : arcaneRecoveryOf(rested)
  let spellSlots = rested.spellSlots
  // A class whose slots come back on a Short Rest (a Warlock's Pact Magic) regains them all.
  const casting = rested.sheet && classById.get(rested.sheet.class)?.spellcasting
  if (casting && SHORT.includes(casting.slotsRestore) && spellSlots?.some((used) => used > 0)) {
    spellSlots = undefined
    facts.push(`${name} regains all expended ${classFeatureById.get(casting.feature)?.name ?? "spell"} spell slots.`)
  }
  if (recovered.length) {
    spellSlots = (rested.spellSlots ?? []).map((used, index) => used - (recovered[index] ?? 0))
    uses["wizard-arcane-recovery"] = 1
    const words = recovered.flatMap((count, index) => (count ? [`${count} level ${index + 1}`] : [])).join(" and ")
    facts.push(`${name} uses Arcane Recovery and recovers ${words} spell ${recovered.reduce((sum, count) => sum + count, 0) === 1 ? "slot" : "slots"}.`)
  }

  const { featureUses: _, spellSlots: __, ...rest } = rested
  rested = { ...rest, ...(Object.keys(uses).length ? { featureUses: uses } : {}), ...(spellSlots?.some((used) => used > 0) ? { spellSlots } : {}) } as T
  if (!facts.length) facts.push(`${name} rests for an hour, and nothing spent comes back.`)
  return { character: rested, facts }
}

/**
 * A Long Rest by the SRD: at least 8 hours, most of them asleep. The character regains all hit points and every spent
 * Hit Point Die, every spell slot and every feature's uses whatever its recharge, Arcane Recovery among them, and an
 * NPC its day's casts. One level of Exhaustion goes. Temporary Hit Points end, and so do Concentration, which the
 * sleep breaks, and every spell that runs out within 8 hours.
 *
 * Thalbern at 3 of 11 with 1 Hit Die spent and a Hunter's Mark cast: "Thalbern finishes a Long Rest: 11 of 11 hit
 * points, every Hit Point Die, spell slot and feature use back."
 */
export function longRest<T extends Rester>(character: T): RestResult<T> {
  const refused = unrested(character)
  if (refused) return { character, facts: [refused] }
  const name = character.name ?? "The character"
  const { tempHitPoints: _, hitDiceUsed: __, featureUses: ___, spellSlots: ____, ...rest } = timePasses(character, 8, true)
  let rested = rest as T
  const maximum = hitPointsOf(rested)?.maximum
  if (maximum !== undefined) rested = withHitPoints(rested, maximum) as T
  const back = rested.sheet ? `every Hit Point Die, ${spellcastingOf(rested)?.slots.some((slots) => slots > 0) ? "spell slot and " : ""}feature use back` : "every daily use back"
  const facts = [`${name} finishes a Long Rest${maximum !== undefined ? `: ${maximum} of ${maximum} hit points` : ""}, ${back}.`]
  if (exhaustionOf(rested) > 0) {
    rested = withoutCondition(rested, "exhaustion").character
    const left = exhaustionOf(rested)
    facts.push(left ? `${name}'s Exhaustion falls to level ${left}.` : `${name} is no longer Exhausted.`)
  }
  return { character: rested, facts }
}

/** The kinds of rest. */
export const restKinds = ["short", "long"] as const
export type RestKind = (typeof restKinds)[number]

/**
 * A party's rest: every hero takes it, and no one else. Everyone comes back as the rest left them, with what each
 * regained in words, by the hero's id. The dead and those at 0 hit points gain nothing, and are told so.
 */
export function partyRest<T extends Rester & { id: string }>(
  characters: readonly T[],
  kind: RestKind,
  roll: (sides: number) => number
): { characters: T[]; rested: { id: string; facts: string[] }[] } {
  const rested: { id: string; facts: string[] }[] = []
  const after = characters.map((character) => {
    if (character.type !== "pc") return character
    const result = kind === "long" ? longRest(character) : shortRest(character, { roll })
    rested.push({ id: character.id, facts: result.facts })
    return result.character
  })
  return { characters: after, rested }
}

/** A rest's name for the story: "Short Rest". */
export const restName = (kind: RestKind): string => (kind === "long" ? "Long Rest" : "Short Rest")

/**
 * Memorize Spell (Wizard, level 5): when a Short Rest ends, the Wizard may swap one prepared spell of level 1 or higher
 * for another of level 1 or higher from the spellbook. The sheet with the swap, or the reason it cannot be made. The
 * player chooses it as the rest ends: Lyra at level 5 may put Magic Missile away for Shield, when Shield is in her book.
 */
export function memorizeSpell(sheet: Sheet, out: string, into: string): { sheet: Sheet } | { problem: string } {
  if (!deriveSheet(sheet).classFeatures.includes("wizard-memorize-spell")) return { problem: "Only a Wizard of level 5 or higher has Memorize Spell." }
  const prepared = sheet.spells ?? []
  const name = (id: string) => spellById.get(id)?.name ?? id
  if (!prepared.includes(out) || (spellById.get(out)?.level ?? 0) < 1) return { problem: `${name(out)} is not a prepared spell of level 1 or higher.` }
  if (!(sheet.spellbook ?? []).includes(into) || (spellById.get(into)?.level ?? 0) < 1) return { problem: `${name(into)} is not a spell of level 1 or higher in the spellbook.` }
  if (prepared.includes(into)) return { problem: `${name(into)} is already prepared.` }
  const swapped: Sheet = { ...sheet, spells: prepared.map((id) => (id === out ? into : id)) }
  const faults = sheetProblems(swapped)
  return faults.length ? { problem: faults.join("; ") } : { sheet: swapped }
}
