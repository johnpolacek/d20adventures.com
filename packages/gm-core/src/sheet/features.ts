import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { rollDamage } from "./attack"
import type { CheckResult, Roller } from "./check"
import { withHealing } from "./death"
import { deriveSheet } from "./derive"
import type { Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import type { Inspiration } from "./turn-effect"

/**
 * The class features a hero spends a Bonus Action on, which the engine applies. A turn has one Bonus Action beside its
 * action: the game master reads which of the hero's own is used, off this menu.
 *
 * Second Wind (Fighter): regain 1d10 plus the Fighter level in hit points.
 * Bardic Inspiration (Bard): another creature gains a Bardic Inspiration die. Once, when it fails a D20 Test, the die
 * is rolled and added, which may turn the failure into a success. The engine rolls it on the first failed roll the
 * die could save, as a player would.
 *
 * Uses come back only with a rest, as each feature's data says (./rest). A new encounter gives nothing back.
 */
const BONUS_ACTIONS = ["fighter-second-wind", "bard-bardic-inspiration"] as const
export type BonusActionId = (typeof BONUS_ACTIONS)[number]

export type BonusAction = {
  id: BonusActionId
  name: string /** How many uses the hero has, and how many are left. */
  uses: number
  left: number /** Whether it is given to someone else. */
  targeted: boolean
}

type Featured = Roller & { id: string; name: string; type: string; hitPoints?: number; healthPercent?: number; dead?: true; featureUses?: Record<string, number>; inspiration?: Inspiration }

/** A hero's Bonus Actions the engine applies, each with its uses. An NPC and a hero with no sheet have none. */
export function bonusActionsOf(character: Pick<Featured, "sheet" | "featureUses">): BonusAction[] {
  const sheet = character.sheet
  if (!sheet) return []
  const derived = deriveSheet(sheet)
  const row = classById.get(sheet.class)?.levels[sheet.level - 1] as Record<string, unknown> | undefined
  return BONUS_ACTIONS.flatMap((id) => {
    const feature = classFeatureById.get(id)
    if (!feature || !derived.classFeatures.includes(id)) return []
    const count = feature.uses?.count as { column?: string; ability?: keyof typeof derived.abilityModifiers; minimum?: number } | undefined
    const uses = count?.column ? Number(row?.[count.column] ?? 0) : count?.ability ? Math.max(count.minimum ?? 0, derived.abilityModifiers[count.ability]) : 0
    return [{ id, name: feature.name, uses, left: Math.max(0, uses - (character.featureUses?.[id] ?? 0)), targeted: id === "bard-bardic-inspiration" }]
  })
}

export type FeatureUse = { feature: BonusActionId; name: string; target?: string; harm?: Harm[]; fact: string }

/**
 * Use one of a hero's Bonus Actions. Everyone comes back as it left them, with what happened for the story. `roll`
 * throws one die of the given size. A feature the hero lacks, one with no uses left, or Bardic Inspiration with no one
 * else here to give it to, changes nothing and returns no use.
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
  if (!actor || !action || action.left < 1) return { characters }
  const spent = (character: T): T => ({ ...character, featureUses: { ...character.featureUses, [action.id]: (character.featureUses?.[action.id] ?? 0) + 1 } })
  const put = (...changed: T[]) => characters.map((character) => changed.find((other) => other.id === character.id) ?? character)
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
  return {
    characters: put(spent(actor), { ...target, inspiration: { die, by: actor.id } }),
    use: { feature: action.id, name: action.name, target: target.id, fact: `${actor.name} gives ${target.name} a Bardic Inspiration die.` },
  }
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
