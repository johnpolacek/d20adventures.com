/**
 * Dice that remember what they rolled. A turn that stops to ask a player something is played again from its start when
 * the answer comes, and must roll the same dice it rolled the first time: `replaying` gives back the rolls kept, in
 * order, and rolls afresh once they run out. Every roll is added to `log`.
 */
export type Dice = { d20(): number; roll(sides: number): number; log: number[] }

/** Dice that give back `kept` first, then roll with `fresh`, which takes a die's size. A d20 is a roll of 20. */
export function replaying(kept: readonly number[] = [], fresh: (sides: number) => number = (sides) => Math.floor(Math.random() * sides) + 1): Dice {
  const log: number[] = []
  const roll = (sides: number) => {
    const value = log.length < kept.length ? kept[log.length] : fresh(sides)
    log.push(value)
    return value
  }
  return { d20: () => roll(20), roll, log }
}

/** The d20s for a roll made with these dice: one, or two with Advantage or Disadvantage. */
export const d20sOf = (dice: Dice, mode: "normal" | "advantage" | "disadvantage" = "normal"): number[] => (mode === "normal" ? [dice.d20()] : [dice.d20(), dice.d20()])
