import { featById } from "@d20/srd/feats"
import { isDown, isIncapacitated } from "../../utils/turn-actors"
import { parseDice } from "../attack"
import type { CheckResult } from "../check"
import type { CheckRule, ClassRules, SaveRule } from "../class-rules"
import { hasFeat } from "../feature-rules"
import { failureCosts } from "../save-rules"
import { sameSide } from "../sides"
import { feetBetween } from "../space"

/**
 * Boon of Fate (SRD 5.2.1 p. 88), Improve Fate: when the hero or another creature within 60 feet succeeds on or fails a
 * D20 Test, the hero may roll 2d4 and apply it as a bonus or a penalty, once until they roll Initiative or finish a
 * Short or Long Rest. The use is kept in `featureUses` under the feat's id.
 *
 * The engine uses it by a plain rule, as a careful player would: as a bonus on a failed saving throw of the hero's or of
 * one of their side within 60 feet, where the failure costs harm and the 8 the dice may bring could turn it, and on the
 * hero's own failed check where the read put something at stake. A penalty on a foe's success is not used.
 */

const BOON = "boon-of-fate"
const improve = () => featById.get(BOON)?.benefits?.find((benefit) => benefit.dice)

type Holder = { featureUses?: Record<string, number> }
const ready = (character: Parameters<typeof hasFeat>[0] & Holder): boolean => hasFeat(character, BOON) && !character.featureUses?.[BOON]
const dice = () => parseDice(improve()?.dice ?? "2d4")
const reach = () => improve()?.range ?? 60

// The roll with the 2d4 added, where at most 8 short: none where even the most the dice bring would not turn it.
function lifted(result: CheckResult, roll: (sides: number) => number): CheckResult | undefined {
  const { count, sides } = dice()
  if (result.dc - result.total > count * sides) return undefined
  const amount = Array.from({ length: count }, () => roll(sides)).reduce((sum, die) => sum + die, 0)
  const total = result.total + amount
  return { ...result, total, success: total >= result.dc, adds: [...(result.adds ?? []), { from: improve()?.name ?? "Improve Fate", amount }] }
}

const fateSave: SaveRule = ({ character, result, stakes, roll, present = [] }) => {
  if (!roll || !failureCosts(character, stakes)) return undefined
  const everyone = present.some((other) => other.id === character.id) ? present : [character as (typeof present)[number], ...present]
  const holder = everyone.find((one) => {
    if (!ready(one) || isDown(one) || isIncapacitated(one) || !sameSide(one, character)) return false
    const apart = feetBetween(one, character as (typeof present)[number])
    return one.id === character.id || apart === undefined || apart <= reach()
  })
  const now = holder && lifted(result, roll)
  if (!holder?.id || !now) return undefined
  const name = improve()?.name ?? "Improve Fate"
  return { result: now, feature: BOON, name: holder.id === character.id ? name : `${holder.name}'s ${name}`, by: holder.id }
}

const fateCheck: CheckRule = ({ character, check, result, roll, staked }) => {
  // A save is answered by `fateSave`.
  if (!staked || check.kind === "save" || !ready(character)) return undefined
  const now = lifted(result, roll)
  return now && { result: now, after: (spender) => ({ ...spender, featureUses: { ...spender.featureUses, [BOON]: 1 } }) }
}

// The use given back, as Initiative is rolled and as a Short Rest ends.
function renewed<T extends Holder>(character: T): T {
  if (!character.featureUses?.[BOON]) return character
  const { [BOON]: _, ...uses } = character.featureUses
  const { featureUses: __, ...rest } = character
  return (Object.keys(uses).length ? { ...rest, featureUses: uses } : rest) as T
}

export const fate: ClassRules = {
  class: BOON,
  saves: [fateSave],
  checks: [fateCheck],
  initiative: (character) => renewed(character),
  shortRest: (character) => ({ character: renewed(character), facts: [] }),
}
