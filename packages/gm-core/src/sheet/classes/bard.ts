import { classById } from "@d20/srd/classes"
import { hitsAnyway } from "../attack"
import type { ClassRules, Featured } from "../class-rules"
import { hasCondition } from "../conditions"
import { hasFeature, usesLeft, withFeatureUsed } from "../feature-rules"
import { canReact, withReaction } from "../reactions"
import { areEnemies, sameSide } from "../sides"
import { distance, placedOf, type Standing } from "../space"
import { slotsLeft, withCastSpent } from "../spells"

/**
 * The Bard's features in play.
 *
 * Bardic Inspiration: a Bonus Action that gives another creature a Bardic Inspiration die. Once, when it fails a D20
 * Test, the die is rolled and added, which may turn the failure into a success. The engine rolls it on the first failed
 * roll the die could save, as a player would (../features). With Font of Inspiration (level 5) a spell slot buys a use
 * when none is left.
 * Cutting Words (College of Lore, level 3): a Reaction that takes a Bardic Inspiration die off an attack roll that hits
 * or a check that succeeds, by a creature of the other side within 60 feet the Bard can see.
 */

type Inspirer = Pick<Featured, "sheet" | "featureUses" | "spellSlots">

/**
 * Whether a Bard can spend a use of Bardic Inspiration now: a use left, or with Font of Inspiration a spell slot to
 * regain one with, the lowest left. None when neither.
 */
export function inspirationUse(character: Inspirer): { slot?: number } | undefined {
  if (usesLeft(character, "bard-bardic-inspiration") > 0) return {}
  if (!hasFeature(character, "bard-font-of-inspiration")) return undefined
  const index = slotsLeft({ type: "pc", ...character }).findIndex((left) => left > 0)
  return index < 0 ? undefined : { slot: index + 1 }
}

/** A Bard with a use of Bardic Inspiration spent, or with Font of Inspiration the lowest spell slot spent to regain and spend one. */
export function withInspirationSpent<T extends Inspirer>(character: T): T {
  const use = inspirationUse(character)
  if (!use) return character
  return use.slot ? withCastSpent(character as T & { type?: string }, { kind: "slot", level: use.slot }) : withFeatureUsed(character, "bard-bardic-inspiration")
}

// The Bardic Inspiration die at a Bard's level: a d6 to level 4, a d8 from 5.
const dieOf = (sheet: { class: string; level: number } | undefined): number | undefined =>
  sheet ? (classById.get(sheet.class)?.levels[sheet.level - 1] as { bardicDie?: number } | undefined)?.bardicDie : undefined

/** A Bard who may answer with Cutting Words, and the Bardic Inspiration die they would roll. */
export type CuttingWords = { bard: string; die: number }

type Reactor = Parameters<typeof canReact>[0] & { featureUses?: Record<string, number>; spellSlots?: readonly number[] }

/**
 * The Bards who may answer a creature's roll with Cutting Words: a College of Lore Bard who is the roller's enemy
 * (../sides), who can react, can see them, stands within 60 feet of them where both stand on a floor, and has a Bardic
 * Inspiration use left or a spell slot to buy one with (Font of Inspiration). Each comes with their die.
 */
export function cuttingWordsFrom<T extends Reactor>(characters: readonly T[], roller: Standing & { id: string }): (CuttingWords & { reactor: T })[] {
  return characters.flatMap((bard) => {
    if (bard.id === roller.id || !areEnemies(bard, roller) || !bard.sheet || !hasFeature(bard, "college-of-lore-cutting-words")) return []
    if (!canReact(bard) || hasCondition(bard, "blinded") || hasCondition(roller, "invisible") || !inspirationUse(bard)) return []
    const from = placedOf(bard)
    const at = placedOf(roller)
    if (from && at && distance(from, at) > CUTTING_WORDS_RANGE + 0.5) return []
    const die = dieOf(bard.sheet)
    return die ? [{ bard: bard.id, die, reactor: bard }] : []
  })
}

/** How far Cutting Words reaches, from its data: 60 feet. */
const CUTTING_WORDS_RANGE = 60

/**
 * Whether Cutting Words matters against a roll that succeeded: the most the die can take off would turn it into a
 * failure. A 16 against Armor Class 13 matters with a d6, and a 20 against 13 does not. A Critical Hit's die hits
 * whatever is taken off.
 */
export const cuttingWordsMatters = (total: number, target: number, die: number, anyway = false): boolean => !anyway && total - die < target

export const bard: ClassRules = {
  class: "bard",
  bonusActions: [
    {
      id: "bard-bardic-inspiration",
      feature: "bard-bardic-inspiration",
      targeted: true,
      buys: (character) => inspirationUse(character)?.slot,
      // It goes to another creature on the bard's side who is not dead. One who holds a die takes the new one in its place.
      use: ({ characters, actor, action, target: given }) => {
        const target = characters.find((character) => character.id === given && character.id !== actor.id && sameSide(character, actor) && !character.dead)
        const die = dieOf({ class: actor.sheet?.class ?? "bard", level: actor.sheet?.level ?? 1 })
        if (!target || !die) return { characters }
        const bought = action.slot ? ` with a level ${action.slot} spell slot` : ""
        const changed = [withInspirationSpent(actor), { ...target, inspiration: { die, by: actor.id } }]
        return {
          characters: characters.map((character) => changed.find((other) => other.id === character.id) ?? character),
          use: { feature: action.id, name: action.name, target: target.id, fact: `${actor.name} gives ${target.name} a Bardic Inspiration die${bought}.` },
        }
      },
    },
  ],
  reactions: [
    {
      id: "cutting-words",
      name: "Cutting Words",
      has: (character) => hasFeature(character, "college-of-lore-cutting-words"),
      // A Bard of the target's side may take their die off a roll that hits.
      onAttackRoll: ({ characters, attacker, rolled, hit, roll, ask }) => {
        if (!rolled.roll.hit) return undefined
        for (const { bard, die, reactor } of cuttingWordsFrom(characters, attacker)) {
          const matters = cuttingWordsMatters(rolled.roll.total, rolled.roll.armorClass, die, hitsAnyway(rolled.roll))
          if (!ask(bard, matters, `${hit} Cutting Words would take a d${die} off the roll.`)) continue
          const cut = roll(die)
          const total = rolled.roll.total - cut
          const still = hitsAnyway(rolled.roll) || total >= rolled.roll.armorClass
          const after = {
            ...rolled,
            roll: { ...rolled.roll, total, hit: still, critical: still && rolled.roll.critical, adds: [...(rolled.roll.adds ?? []), { from: "Cutting Words", amount: -cut }] },
          }
          const spent = withReaction(withInspirationSpent(reactor))
          return {
            characters: characters.map((character) => (character.id === spent.id ? spent : character)),
            rolled: after,
            reaction: {
              by: bard,
              id: "cutting-words",
              name: "Cutting Words",
              text: `${reactor.name} uses Cutting Words and takes ${cut} off the roll: ${total} against Armor Class ${after.roll.armorClass}.`,
            },
          }
        }
        return undefined
      },
      // A successful ability check: the die rolled comes off it, which may turn it into a failure.
      onCheck: ({ characters, roller, result, roll, ask }) => {
        for (const { bard, die, reactor } of cuttingWordsFrom(characters, roller)) {
          const matters = cuttingWordsMatters(result.total, result.dc, die)
          const text = `${roller.name}'s check succeeds: ${result.total} against ${result.dc}. Cutting Words would take a d${die} off it.`
          if (!ask(bard, matters, text)) continue
          const cut = roll(die)
          const total = result.total - cut
          return {
            characters: characters.map((character) => (character.id === bard ? withReaction(withInspirationSpent(character)) : character)),
            result: { ...result, total, success: total >= result.dc, adds: [...(result.adds ?? []), { from: "Cutting Words", amount: -cut }] },
            reaction: { by: bard, id: "cutting-words", name: "Cutting Words", text: `${reactor.name} uses Cutting Words and takes ${cut} off ${roller.name}'s check, ${total} against ${result.dc}.` },
          }
        }
        return undefined
      },
    },
  ],
}
