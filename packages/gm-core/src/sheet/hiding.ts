import type { StoryBeat, StoryBy } from "../story/beats"
import { hasFled, isDown, isIncapacitated } from "../utils/turn-actors"
import type { RequiredRoll } from "../validations/roll-requirement-schema"
import { checkModesFromActions, HIDE_DC, HIDE_ROLL } from "./actions"
import { blockOf } from "./blocks"
import { type Check, combineModes, type Roller, sheetModes } from "./check"
import { classCheckBonus, classCheckModes } from "./class-rules"
import { type Afflicted, checkModesFrom, d20Penalty, hiddenEntry, isHidden } from "./conditions"
import { deriveSheet } from "./derive"
import type { ConditionChange } from "./harm"
import { areEnemies } from "./sides"

/**
 * Finding one who hides, as the rules have it (SRD 5.2.1: the Hide action, the Search action, Passive Perception).
 *
 * A Hide's Stealth total is kept on the condition it gives (`dc`): "the DC for a creature to find you with a Wisdom
 * (Perception) check". The hider stops being hidden when an enemy finds them, and an enemy finds them in two ways:
 * - Its Passive Perception, 10 plus its Perception bonus, meets the total. It notices with no roll: as the hider hides,
 *   or as it comes into a scene where they already hide.
 * - It gives its action to Search, and its Wisdom (Perception) check meets the total.
 *
 * Found by one, a hider is hidden from no one: the condition is one thing, borne or not. An attack roll and a spell
 * cast end it too (./actions `afterRoll`), and a sound louder than a whisper, which the read of a turn hears.
 *
 * Thalbern hides with a total of 15. The Owlbear's Passive Perception is 15, so it notices him at once. With 17 it
 * does not, and to find him it Searches: a d20 + 5 that needs 17.
 */

const PERCEPTION: Check = { kind: "skill", skill: "perception" }

/** The Search action's roll by name, on screen and in the story. */
export const SEARCH_ROLL = "Search (Perception)"

/** What the finding rules read of a character. */
export type Hider = Afflicted & Roller & { id: string; name: string }

/** Noticed with no roll: who noticed whom, by the Passive Perception that met the Stealth total. */
export type Noticed = { by: string; of: string; passive: number; total: number }

// Up, here and able to act: one who can notice or look.
const alert = (character: Hider): boolean => !isDown(character) && !hasFled(character) && !isIncapacitated(character)

/**
 * Passive Perception: 10 plus the Perception bonus, as the sheet or the stat block gives it, with 5 more for Advantage
 * on such checks and 5 less for Disadvantage (a Poisoned creature's), and Exhaustion's penalty taken off.
 */
export function passivePerception(character: Hider, present?: readonly Afflicted[]): number {
  const printed = character.sheet ? deriveSheet(character.sheet).passivePerception : character.type === "npc" ? blockOf(character)?.senses.passivePerception : undefined
  const mode = combineModes(checkModesFrom(character, PERCEPTION, present).map((source) => source.mode))
  return (printed ?? 10) - d20Penalty(character) + (mode === "advantage" ? 5 : mode === "disadvantage" ? -5 : 0)
}

/** The Stealth total one hidden made, which a Perception check must meet to find them. One hidden before totals were kept has the Hide's own 15. */
export const hideTotal = (character: Afflicted): number => character.conditions?.find(hiddenEntry)?.dc ?? HIDE_DC

/** Who hides from a character: its enemies here who are hidden by the Hide action. */
export const hiddenFrom = <T extends Hider>(seeker: Hider, everyone: readonly T[]): T[] =>
  everyone.filter((other) => other.id !== seeker.id && areEnemies(other, seeker) && isHidden(other) && !isDown(other) && !hasFled(other))

const withTotal = <T extends Hider>(character: T, total: number): T => ({
  ...character,
  conditions: (character.conditions ?? []).map((entry) => (hiddenEntry(entry) ? { ...entry, dc: total } : entry)),
})

/** One found: the Hide's Invisible ends, and one a spell or a feature gave stays. */
export function found<T extends Hider>(character: T): T {
  const conditions = (character.conditions ?? []).filter((entry) => !hiddenEntry(entry))
  const { conditions: _, ...rest } = character
  return (conditions.length ? { ...rest, conditions } : rest) as T
}

// The enemy whose Passive Perception meets a hider's total, the sharpest of them, or none.
function noticer<T extends Hider>(hider: T, everyone: readonly T[]): Noticed | undefined {
  const total = hideTotal(hider)
  return everyone
    .filter((other) => other.id !== hider.id && areEnemies(other, hider) && alert(other))
    .map((other) => ({ by: other.id, of: hider.id, passive: passivePerception(other, everyone), total }))
    .filter((seen) => seen.passive >= total)
    .sort((a, b) => b.passive - a.passive)[0]
}

const named = (everyone: readonly Hider[], id: string): string => everyone.find((character) => character.id === id)?.name ?? id

/** A notice in a line for the screen: "The Owlbear notices Thalbern. Passive Perception 15 against Stealth 15." */
export const noticeText = (seen: Noticed, everyone: readonly Hider[]): string =>
  `${named(everyone, seen.by)} notices ${named(everyone, seen.of)}. Passive Perception ${seen.passive} against Stealth ${seen.total}.`

/** A notice as an entry of the story, told after the roll that brought it. None when no one noticed. */
export const noticeBeats = (by: StoryBy, seen: Noticed | undefined, everyone: readonly Hider[]): StoryBeat[] =>
  seen ? [{ kind: "feature", by, character: seen.by, name: "Passive Perception", text: noticeText(seen, everyone), target: seen.of }] : []

// A notice as a fact for the one who tells the story.
const noticeFact = (seen: Noticed, everyone: readonly Hider[]): string =>
  `${named(everyone, seen.by)} notices ${named(everyone, seen.of)} without searching: a Passive Perception of ${seen.passive} meets the Stealth total of ${seen.total}. ${named(everyone, seen.of)} is not hidden.`

/**
 * The roll the Search action asks for: a Wisdom (Perception) check against the lowest Stealth total among those who
 * hide from the searcher. None when no one hides from them. What it finds is settled by `hidingAfterRoll`: everyone
 * whose total the check meets.
 */
export function searchRoll<T extends Hider>(character: T, everyone: readonly T[]): Extract<RequiredRoll, { check: Check }> | undefined {
  const hidden = hiddenFrom(character, everyone)
  if (!hidden.length) return undefined
  // Every source the read of a turn counts for a check: the sheet, the class, the conditions borne, an ally's Help.
  const sources = [
    ...sheetModes(character, PERCEPTION),
    ...classCheckModes(character, PERCEPTION),
    ...checkModesFrom(character, PERCEPTION, everyone),
    ...checkModesFromActions(character, PERCEPTION, everyone),
  ]
  return {
    check: PERCEPTION,
    rollType: SEARCH_ROLL,
    difficulty: Math.min(...hidden.map(hideTotal)),
    modifier: classCheckBonus(character, PERCEPTION),
    mode: combineModes(sources.map((source) => source.mode)),
    ...(sources.length ? { reasons: sources.map((source) => source.from) } : {}),
  }
}

/**
 * Everyone after a check that hides or finds, with what the roll's stakes had already settled (`conditions`, `facts`)
 * put right.
 *
 * A Hide that succeeds keeps its total on the hider. An enemy whose Passive Perception meets it notices at once: the
 * hider is not hidden, and the condition the stakes gave is taken back with its fact.
 *
 * A Search finds every enemy hidden from the searcher whose total the check meets. Each stops being hidden.
 *
 * Any other roll changes nothing here.
 */
export function hidingAfterRoll<T extends Hider>(args: {
  characters: readonly T[]
  rollerId: string
  roll: RequiredRoll
  result: { total: number; success: boolean }
  conditions?: readonly ConditionChange[]
  facts?: readonly string[]
}): { characters: T[]; conditions: ConditionChange[]; facts: string[]; noticed?: Noticed } {
  const same = { characters: [...args.characters], conditions: [...(args.conditions ?? [])], facts: [...(args.facts ?? [])] }
  const roller = args.characters.find((character) => character.id === args.rollerId)
  if (!roller || !("check" in args.roll)) return same
  const put = (changed: readonly T[]) => args.characters.map((character) => changed.find((after) => after.id === character.id) ?? character)
  if (args.roll.rollType === HIDE_ROLL) {
    if (!args.result.success || !isHidden(roller)) return same
    const hider = withTotal(roller, args.result.total)
    const seen = noticer(hider, args.characters)
    if (!seen) return { ...same, characters: put([hider]) }
    return {
      characters: put([found(hider)]),
      conditions: same.conditions.filter((change) => !(change.target === roller.id && change.condition === "invisible" && !change.ends)),
      facts: [...same.facts.filter((fact) => fact !== `${roller.name} is now Invisible.`), noticeFact(seen, args.characters)],
      noticed: seen,
    }
  }
  if (args.roll.rollType !== SEARCH_ROLL) return same
  const hidden = hiddenFrom(roller, args.characters)
  const reached = hidden.filter((other) => hideTotal(other) <= args.result.total)
  if (!reached.length) {
    return hidden.length
      ? {
          ...same,
          facts: [
            ...same.facts,
            `${roller.name} finds no one. ${hidden.map((other) => other.name).join(" and ")} stay${hidden.length > 1 ? "" : "s"} hidden, and ${roller.name} does not learn where.`,
          ],
        }
      : same
  }
  return {
    characters: put(reached.map(found)),
    conditions: [...same.conditions, ...reached.map((other): ConditionChange => ({ target: other.id, condition: "invisible", ends: true }))],
    facts: [...same.facts, ...reached.map((other) => `${roller.name} finds ${other.name}, who is no longer hidden.`)],
  }
}

/**
 * One who is hidden and makes a sound louder than a whisper stops being hidden. Everyone after it, with the line that
 * tells it, or no line when they were not hidden.
 */
export function heard<T extends Hider>(everyone: readonly T[], id: string): { characters: T[]; text?: string } {
  const loud = everyone.find((character) => character.id === id)
  if (!loud || !isHidden(loud)) return { characters: [...everyone] }
  return { characters: everyone.map((character) => (character.id === id ? found(character) : character)), text: `${loud.name} makes a sound louder than a whisper and is hidden no more.` }
}

/**
 * Everyone as a scene opens round those already hidden: an enemy whose Passive Perception meets a hider's Stealth
 * total notices them as it comes in, and they are hidden no more. With each notice made.
 */
export function noticedOnArrival<T extends Hider>(everyone: readonly T[]): { characters: T[]; noticed: Noticed[] } {
  const noticed = everyone.flatMap((character) => (isHidden(character) && !isDown(character) && !hasFled(character) ? (noticer(character, everyone) ?? []) : []))
  const seen = new Set(noticed.map((notice) => notice.of))
  return { characters: everyone.map((character) => (seen.has(character.id) ? found(character) : character)), noticed }
}
