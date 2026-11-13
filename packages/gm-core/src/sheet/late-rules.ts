import type { ConditionId } from "@d20/srd"

/**
 * Class rules that files low in the load order read without loading a class file: ./conditions `immuneTo` and
 * ./spell-effects `settleConcentration`. Importing ./class-rules there would close a load cycle through ./check. The
 * class rules register their readers here as they load (./class-rules), and this file imports nothing that runs.
 */

type ImmunityReader = (character: object, present?: readonly object[]) => readonly ConditionId[]
type Told = { by: string; name: string; text: string }
type Downed = (args: { before: readonly object[]; after: readonly object[]; d20: () => number }) => { characters: object[]; told: Told[] }

const immunities: ImmunityReader[] = []
let downed: Downed | undefined
let concentrationKept: ((character: object, spellId: string) => boolean) | undefined

/** Add a reader of conditions a character is immune to for now (Mindless Rage), and by those present (Aura of Courage). */
export function registerImmunities(reader: ImmunityReader): void {
  if (!immunities.includes(reader)) immunities.push(reader)
}

/** The conditions the registered readers make a character immune to for now. `present` is everyone in the scene, where it is known. */
export const featureImmunities = (character: object, present?: readonly object[]): ConditionId[] => immunities.flatMap((reader) => reader(character, present))

/** Set what answers the heroes a roll dropped to 0 hit points (../class-rules `afterDowned`). */
export function registerDowned(answer: Downed): void {
  downed = answer
}

/** Everyone after the registered answer to those a roll dropped to 0 hit points (Relentless Rage), or as they were. */
export function answerDowned<T extends object>(args: { before: readonly T[]; after: readonly T[]; d20: () => number }): { characters: T[]; told: Told[] } {
  return downed ? (downed(args) as { characters: T[]; told: Told[] }) : { characters: [...args.after], told: [] }
}

/** Set what says whether damage cannot break a character's Concentration on a spell (../class-rules `classKeepsConcentration`). */
export function registerConcentrationKept(reader: (character: object, spellId: string) => boolean): void {
  concentrationKept = reader
}

/** Whether damage cannot break a character's Concentration on a spell by the registered reader (Relentless Hunter), so no save is made. */
export const keepsConcentration = (character: object, spellId: string): boolean => !!concentrationKept?.(character, spellId)

let speedGiven: ((character: object) => number | undefined) | undefined

/** Set what gives the Speed a feature lends a character for now (../class-rules `classSpeed`). */
export function registerSpeed(reader: (character: object) => number | undefined): void {
  speedGiven = reader
}

/** The Speed the registered reader gives a character for now (Dragon Wings), or none. */
export const featureSpeed = (character: object): number | undefined => speedGiven?.(character)

/** A Concentration save as it fell, before what the rules may still do for it: the d20s, the one that counts, and the rest. */
type SaveThrown = { dice: number[]; natural: number; bonus: number; total: number; dc: number; success: boolean; mode: "normal" | "advantage" | "disadvantage" }
type SaveAnswers = {
  /** What the auras of those present add to one's saving throws (Aura of Protection). */
  aura: (character: object, present: readonly object[]) => number
  /** Everyone once a failed save is answered as every save is, with the save as it then stands and its words. */
  answer: (args: { characters: readonly object[]; saverId: string; name: string; result: SaveThrown; stakes: { concentration: string }; d20: () => number }) => {
    characters: object[]
    result: SaveThrown
    facts: string[]
  }
}

let saveAnswers: SaveAnswers | undefined

/** Set what answers a save rolled low in the load order (../save-rules): ./spell-effects `settleConcentration`'s. */
export function registerSaveAnswers(answers: SaveAnswers): void {
  saveAnswers = answers
}

/** What the auras of those present add to one's saving throws, by the registered reader, or nothing. */
export const auraOnSaveLate = (character: object, present: readonly object[]): number => saveAnswers?.aura(character, present) ?? 0

/** Everyone once a failed save is answered by the registered rules (Indomitable, Heroic Inspiration), or as they were. */
export function answerSaveLate<T extends object>(args: Parameters<SaveAnswers["answer"]>[0] & { characters: readonly T[] }): { characters: T[]; result: SaveThrown; facts: string[] } {
  if (!saveAnswers || args.result.success) return { characters: [...args.characters], result: args.result, facts: [] }
  return saveAnswers.answer(args) as { characters: T[]; result: SaveThrown; facts: string[] }
}
