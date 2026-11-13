import type { ConditionId } from "@d20/srd"

/**
 * Class rules that files low in the load order read without loading a class file: ./conditions `immuneTo` and
 * ./spell-effects `settleConcentration`. Importing ./class-rules there would close a load cycle through ./check. The
 * class rules register their readers here as they load (./class-rules), and this file imports nothing that runs.
 */

type ImmunityReader = (character: object) => readonly ConditionId[]
type Told = { by: string; name: string; text: string }
type Downed = (args: { before: readonly object[]; after: readonly object[]; d20: () => number }) => { characters: object[]; told: Told[] }

const immunities: ImmunityReader[] = []
let downed: Downed | undefined

/** Add a reader of conditions a character is immune to for now (Mindless Rage). */
export function registerImmunities(reader: ImmunityReader): void {
  if (!immunities.includes(reader)) immunities.push(reader)
}

/** The conditions the registered readers make a character immune to for now. */
export const featureImmunities = (character: object): ConditionId[] => immunities.flatMap((reader) => reader(character))

/** Set what answers the heroes a roll dropped to 0 hit points (../class-rules `afterDowned`). */
export function registerDowned(answer: Downed): void {
  downed = answer
}

/** Everyone after the registered answer to those a roll dropped to 0 hit points (Relentless Rage), or as they were. */
export function answerDowned<T extends object>(args: { before: readonly T[]; after: readonly T[]; d20: () => number }): { characters: T[]; told: Told[] } {
  return downed ? (downed(args) as { characters: T[]; told: Told[] }) : { characters: [...args.after], told: [] }
}
