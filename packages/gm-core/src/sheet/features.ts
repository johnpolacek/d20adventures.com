import { classFeatureById } from "@d20/srd/class-features"
import type { CheckResult, Roller } from "./check"
import { type BonusAction, type BonusActionRule, bonusActionRule, bonusActionRules, type ChoiceRule, effectChoice, type Featured, type FeatureUse } from "./class-rules"
import { deriveSheet } from "./derive"
import { featureUseCount } from "./feature-rules"
import { potionRule } from "./item-spend"
import { potionActionsOf } from "./item-use"
import { blockBonusActions, blockBonusRule, resolveBlockAction } from "./stat-block-actions"
import type { Inspiration } from "./turn-effect"

export type { BonusAction, FeatureUse }

/**
 * The class features a hero spends a Bonus Action on, which the engine applies. A turn has one Bonus Action beside its
 * action: the game master reads which of the hero's own is used, off this menu. Each class names its own in its class
 * file (./classes), with what it does: Second Wind, Bardic Inspiration, Cunning Action, Steady Aim.
 *
 * Uses come back only with a rest, as each feature's data says (./rest). A new encounter gives nothing back.
 */

/** One whose Bonus Actions are read: a hero by the sheet and any Beast's shape held, an NPC by its stat block. */
type Holder = Pick<Roller, "sheet" | "type" | "statBlock" | "shape"> & { hitPoints?: number; healthPercent?: number; dead?: true; conditions?: Roller["conditions"] }

/** Whether a Bonus Action can be used now: a use left, a slot to buy one, or no count at all. */
export const usable = (action: BonusAction): boolean => action.left === undefined || action.left > 0 || action.slot !== undefined

/**
 * A character's Bonus Actions the engine applies, each with its uses: a hero's class features, and those of a stat
 * block that take an action of a turn (Cunning Action, Nimble Escape), an NPC's own or a Beast's a hero holds with Wild
 * Shape, whose game statistics are the Beast's (./stat-block-actions). A hero with no sheet has none.
 */
export function bonusActionsOf(character: Pick<Featured, "featureUses" | "spellSlots"> & Holder): BonusAction[] {
  const block = blockBonusActions(character).map((entry) => entry.action)
  const sheet = character.sheet
  if (!sheet) return block
  const derived = deriveSheet(sheet)
  const own = bonusActionRules().flatMap((rule): BonusAction[] => {
    const feature = classFeatureById.get(rule.feature)
    if (!feature || !derived.classFeatures.includes(feature.id) || (rule.offer && !rule.offer(character))) return []
    const targeted = !!rule.targeted
    // A pool's points count as uses: Lay on Hands' 25 at level 5 (./feature-rules `featureUseCount`).
    if ((rule.name && !rule.spends) || (!feature.uses && !feature.pool)) return [{ id: rule.id, name: rule.name ?? feature.name, targeted }]
    const uses = featureUseCount(sheet, feature.id)
    const left = Math.max(0, uses - (character.featureUses?.[feature.id] ?? 0))
    const bought = left === 0 ? rule.buys?.(character) : undefined
    return [{ id: rule.id, name: rule.name ?? feature.name, uses, left, targeted, ...(bought ? { slot: bought } : {}) }]
  })
  // The potions the hero has, each drunk or given as a Bonus Action (./item-use).
  return [...own, ...block, ...potionActionsOf(character)]
}

/** The rule of one of a character's Bonus Actions, by its id: its stat block's, a potion's, or a class's. */
export const bonusRuleFor = (character: Holder, id: string | undefined): BonusActionRule | undefined => blockBonusRule(character, id) ?? potionRule(character, id) ?? bonusActionRule(id)

/**
 * How a feature used as the turn's action (`RequiredFeature`) is resolved, by its effect's id: a class's (Channel
 * Divinity), or else an action of the user's stat block that is a save (./stat-block-actions), which tells why when
 * the user has no such action ready.
 */
export const featureResolver = (id: string): NonNullable<ChoiceRule["resolve"]> => effectChoice(id)?.resolve ?? resolveBlockAction

/** Whether a move taken with a Bonus Action draws no Opportunity Attacks, by the Bonus Action's own rule and the feet moved. */
export function bonusDisengages(character: (Featured & { position?: { x: number; y: number } }) | undefined, bonus: string | undefined, feet: number): boolean {
  return !!character && !!bonusRuleFor(character, bonus)?.disengages?.(character, feet)
}

/**
 * Use one of a character's Bonus Actions. Everyone comes back as it left them, with what happened for the story. `roll`
 * throws one die of the given size. A feature the hero lacks, or one with no uses left, changes nothing and returns no
 * use, and so does one its class file cannot apply (Bardic Inspiration with no one else here to give it to). Some
 * change no one here: the read of the turn applies them to its move and its roll (Cunning Action, Steady Aim).
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
  const rule = actor && bonusRuleFor(actor, action?.id)
  if (!actor || !action || !rule || !usable(action)) return { characters }
  return rule.use({ characters, actor, action, target: args.target, roll: args.roll }) as { characters: T[]; use?: FeatureUse }
}

/**
 * Whether a Bardic Inspiration die is rolled on a failed d20, a held one or Peerless Skill's (./class-rules
 * `failedRollDie`): only when the roll failed by no more than the die could add. `short` is how far the total fell below
 * its target.
 */
export const inspirationHelps = <D extends { die: number }>(inspiration: D | undefined, short: number): inspiration is D => !!inspiration && short > 0 && short <= inspiration.die

/**
 * A failed check or save with a Bardic Inspiration die rolled and added. `roll` throws the die. A roll a condition
 * fails outright cannot be saved, so the caller does not ask.
 */
export function inspiredCheck(result: CheckResult, inspiration: { die: number }, roll: (sides: number) => number): CheckResult {
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
