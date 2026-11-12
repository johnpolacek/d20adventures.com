import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { parseDice, rollDamage } from "./attack"
import type { Check, CheckResult, Roller } from "./check"
import { withHealing } from "./death"
import { deriveSheet } from "./derive"
import { featureUseCount, hasFeature, usesLeft, withFeatureUsed } from "./feature-rules"
import type { Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { slotsLeft, withCastSpent } from "./spells"
import type { Inspiration } from "./turn-effect"

/**
 * The class features a hero spends a Bonus Action on, which the engine applies. A turn has one Bonus Action beside its
 * action: the game master reads which of the hero's own is used, off this menu.
 *
 * Second Wind (Fighter): regain 1d10 plus the Fighter level in hit points. With Tactical Shift (level 5) the hero may
 * move up to half their Speed without drawing Opportunity Attacks as they use it.
 * Bardic Inspiration (Bard): another creature gains a Bardic Inspiration die. Once, when it fails a D20 Test, the die
 * is rolled and added, which may turn the failure into a success. The engine rolls it on the first failed roll the
 * die could save, as a player would. With Font of Inspiration (level 5) a spell slot buys a use when none is left.
 * Cunning Action (Rogue, level 2): the Dash, Disengage or Hide action as a Bonus Action.
 * Steady Aim (Rogue, level 3): Advantage on the next attack roll this turn, for one who has not moved this turn. Their
 * Speed is then 0 for the rest of it.
 *
 * Uses come back only with a rest, as each feature's data says (./rest). A new encounter gives nothing back.
 */
const BONUS_ACTIONS = ["fighter-second-wind", "bard-bardic-inspiration", "cunning-action-dash", "cunning-action-disengage", "cunning-action-hide", "rogue-steady-aim"] as const
export type BonusActionId = (typeof BONUS_ACTIONS)[number]

/** The class feature each Bonus Action comes from: Cunning Action's three are one feature. */
const FROM: Record<BonusActionId, string> = {
  "fighter-second-wind": "fighter-second-wind",
  "bard-bardic-inspiration": "bard-bardic-inspiration",
  "cunning-action-dash": "rogue-cunning-action",
  "cunning-action-disengage": "rogue-cunning-action",
  "cunning-action-hide": "rogue-cunning-action",
  "rogue-steady-aim": "rogue-steady-aim",
}
const CUNNING: Partial<Record<BonusActionId, string>> = { "cunning-action-dash": "Dash", "cunning-action-disengage": "Disengage", "cunning-action-hide": "Hide" }

export type BonusAction = {
  id: BonusActionId
  name: string
  /** How many uses the hero has, and how many are left. None for one used as often as the hero likes. */
  uses?: number
  left?: number
  /** Whether it is given to someone else. */
  targeted: boolean
  /** The level of the spell slot a use costs when none is left (Font of Inspiration). */
  slot?: number
}

type Featured = Roller & {
  id: string
  name: string
  type: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  featureUses?: Record<string, number>
  spellSlots?: readonly number[]
  inspiration?: Inspiration
}

/** Whether a Bonus Action can be used now: a use left, a slot to buy one, or no count at all. */
export const usable = (action: BonusAction): boolean => action.left === undefined || action.left > 0 || action.slot !== undefined

/** A hero's Bonus Actions the engine applies, each with its uses. An NPC and a hero with no sheet have none. */
export function bonusActionsOf(character: Pick<Featured, "sheet" | "featureUses" | "spellSlots">): BonusAction[] {
  const sheet = character.sheet
  if (!sheet) return []
  const derived = deriveSheet(sheet)
  return BONUS_ACTIONS.flatMap((id): BonusAction[] => {
    const feature = classFeatureById.get(FROM[id])
    if (!feature || !derived.classFeatures.includes(feature.id)) return []
    const cunning = CUNNING[id]
    if (cunning) return [{ id, name: `Cunning Action: ${cunning}`, targeted: false }]
    if (!feature.uses) return [{ id, name: feature.name, targeted: false }]
    const uses = featureUseCount(sheet, feature.id)
    const left = Math.max(0, uses - (character.featureUses?.[feature.id] ?? 0))
    const bought = id === "bard-bardic-inspiration" && left === 0 ? inspirationUse(character)?.slot : undefined
    return [{ id, name: feature.name, uses, left, targeted: id === "bard-bardic-inspiration", ...(bought ? { slot: bought } : {}) }]
  })
}

/**
 * Whether a Bard can spend a use of Bardic Inspiration now: a use left, or with Font of Inspiration a spell slot to
 * regain one with, the lowest left. None when neither.
 */
export function inspirationUse(character: Pick<Featured, "sheet" | "featureUses" | "spellSlots">): { slot?: number } | undefined {
  if (usesLeft(character, "bard-bardic-inspiration") > 0) return {}
  if (!hasFeature(character, "bard-font-of-inspiration")) return undefined
  const index = slotsLeft({ type: "pc", ...character }).findIndex((left) => left > 0)
  return index < 0 ? undefined : { slot: index + 1 }
}

/** A Bard with a use of Bardic Inspiration spent, or with Font of Inspiration the lowest spell slot spent to regain and spend one. */
export function withInspirationSpent<T extends Pick<Featured, "sheet" | "featureUses" | "spellSlots">>(character: T): T {
  const use = inspirationUse(character)
  if (!use) return character
  return use.slot ? withCastSpent(character as T & { type?: string }, { kind: "slot", level: use.slot }) : withFeatureUsed(character, "bard-bardic-inspiration")
}

export type FeatureUse = { feature: BonusActionId; name: string; target?: string; harm?: Harm[]; fact: string }

/**
 * Use one of a hero's Bonus Actions. Everyone comes back as it left them, with what happened for the story. `roll`
 * throws one die of the given size. A feature the hero lacks, one with no uses left, or Bardic Inspiration with no one
 * else here to give it to, changes nothing and returns no use. Cunning Action and Steady Aim change no one here: the
 * read of the turn applies them to its move and its roll.
 */
export function useBonusAction<T extends Featured>(args: {
  characters: readonly T[]
  actorId: string
  feature: string
  target?: string
  roll: (sides: number) => number
}): { characters: T[]; use?: FeatureUse } {
  const characters = [...args.characters]
  const actor = characters.find((character) => character.id === args.actorId)
  const action = actor && bonusActionsOf(actor).find((entry) => entry.id === args.feature)
  if (!actor || !action || !usable(action)) return { characters }
  const spent = (character: T): T => withFeatureUsed(character, action.id)
  const put = (...changed: T[]) => characters.map((character) => changed.find((other) => other.id === character.id) ?? character)
  const cunning = CUNNING[action.id]
  if (cunning) return { characters, use: { feature: action.id, name: "Cunning Action", fact: `${actor.name} takes the ${cunning} action as a Bonus Action.` } }
  if (action.id === "rogue-steady-aim") return { characters, use: { feature: action.id, name: action.name, fact: `${actor.name} holds still and takes Steady Aim.` } }
  if (action.id === "fighter-second-wind") {
    const feature = classFeatureById.get(action.id)
    const level = actor.sheet?.level ?? 1
    const rolled = rollDamage([{ dice: feature?.healing?.dice ?? "1d10", type: "force" }], args.roll)
    const [part] = rolled.parts
    const amount = rolled.total + level
    const healed = spent(withHealing(actor, amount))
    const now = hitPointsOf(healed)
    return {
      characters: put(healed),
      use: {
        feature: action.id,
        name: action.name,
        harm: [{ target: actor.id, kind: "healing", dice: part.dice, sides: part.sides, bonus: level, amount }],
        fact: `${actor.name} uses Second Wind and regains ${amount} hit points${now ? `, now ${now.current} of ${now.maximum}` : ""}.`,
      },
    }
  }
  // Bardic Inspiration goes to another creature on the bard's side who is not dead. One who holds a die takes the new one in its place.
  const target = characters.find((character) => character.id === args.target && character.id !== actor.id && character.type === actor.type && !character.dead)
  const die = (classById.get(actor.sheet?.class ?? "bard")?.levels[(actor.sheet?.level ?? 1) - 1] as { bardicDie?: number } | undefined)?.bardicDie
  if (!target || !die) return { characters }
  const bought = action.slot ? ` with a level ${action.slot} spell slot` : ""
  return {
    characters: put(withInspirationSpent(actor), { ...target, inspiration: { die, by: actor.id } }),
    use: { feature: action.id, name: action.name, target: target.id, fact: `${actor.name} gives ${target.name} a Bardic Inspiration die${bought}.` },
  }
}

/**
 * Tactical Mind (Fighter, level 2): when a Fighter fails an ability check, they may spend a use of Second Wind to roll
 * 1d10 and add it. The use is spent only when the check then succeeds. The engine uses it on a failure the d10 could
 * turn, short by 10 or less, as a player would. A saving throw is no ability check. The check comes back as it now
 * stands, with the d10 among its adds, and whether the use is spent. None when it is not used.
 */
export function tacticalMind(
  character: Pick<Featured, "sheet" | "featureUses">,
  check: Check,
  result: CheckResult,
  roll: (sides: number) => number
): { result: CheckResult; spent: boolean } | undefined {
  if (check.kind === "save" || result.success || !hasFeature(character, "fighter-tactical-mind") || usesLeft(character, "fighter-second-wind") < 1) return undefined
  const sides = parseDice(classFeatureById.get("fighter-tactical-mind")?.dice ?? "1d10").sides
  if (result.dc - result.total > sides) return undefined
  const rolled = roll(sides)
  if (!Number.isInteger(rolled) || rolled < 1 || rolled > sides) throw new Error(`${rolled} is not a d${sides} roll.`)
  const total = result.total + rolled
  const success = total >= result.dc
  return { result: { ...result, total, success, adds: [...(result.adds ?? []), { from: "Tactical Mind", amount: rolled }] }, spent: success }
}

/**
 * Whether a held Bardic Inspiration die is rolled on a failed d20: only when the roll failed by no more than the die
 * could add. `short` is how far the total fell below its target.
 */
export const inspirationHelps = (inspiration: Inspiration | undefined, short: number): inspiration is Inspiration => !!inspiration && short > 0 && short <= inspiration.die

/**
 * A failed check or save with a Bardic Inspiration die rolled and added. `roll` throws the die. A roll a condition
 * fails outright cannot be saved, so the caller does not ask.
 */
export function inspiredCheck(result: CheckResult, inspiration: Inspiration, roll: (sides: number) => number): CheckResult {
  const inspired = roll(inspiration.die)
  if (!Number.isInteger(inspired) || inspired < 1 || inspired > inspiration.die) throw new Error(`${inspired} is not a d${inspiration.die} roll.`)
  const total = result.total + inspired
  return { ...result, total, success: total >= result.dc, inspired }
}

/** A character with their Bardic Inspiration die spent. */
export function withoutInspiration<T extends { inspiration?: Inspiration }>(character: T): T {
  const { inspiration: _, ...rest } = character
  return rest as T
}

/**
 * A character as the story moves on to another encounter: an unspent Bardic Inspiration die is gone. The SRD gives the
 * die an hour, and the engine keeps no clock, so the encounter's end stands in for that hour. This is the one thing a
 * new encounter takes from the features: their uses stay spent until a rest (./rest).
 */
export function inspirationAtEncounterEnd<T extends { inspiration?: Inspiration }>(character: T): T {
  if (!character.inspiration) return character
  const { inspiration: _, ...rest } = character
  return rest as T
}
