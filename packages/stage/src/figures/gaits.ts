// Which gait a figure moves in, and how fast each plays: a sneak when the story says so, else a walk, a run or a
// sprint by speed, two of them blended where one gives way to the next (plans/gaits.md).
//
// Each gait's clip is made in place, so its planted foot goes back under the figure at the speed the clip was made for
// (`speed`, measured by asset-library/pipeline/gait.ts). A walk or a sneak is played faster or slower to keep its feet
// on the ground. A run or a sprint is played near its own rate and may skate: slowed to a hurry it hangs in the air
// between steps (the owner, 2026-11-24, chose a little skating over that).

export type Gait = "sneak" | "walk" | "run" | "sprint"
export type Pace = "sneak"
export type FigureGaits = Partial<Record<Gait, { clip: string; speed: number }>>

// The speeds where one gait gives way to the next, in metres a second, and how far either side of it the two blend.
const BETWEEN: Record<string, number> = { "walk|run": 1.8, "run|sprint": 3.6, "walk|sprint": 2.6 }
const BLEND = 0.25
// How far from its own rate a gait may be played.
const RATE: Record<Gait, [number, number]> = { sneak: [0.4, 2.2], walk: [0.4, 2.2], run: [0.7, 1.3], sprint: [0.7, 1.3] }
// A walk with no speed measured, as every walk was taken to be.
export const STRIDE = 1.2

const smooth = (x: number) => x * x * (3 - 2 * x)

// The share of each gait the figure has, for a speed and a pace: shares add to one.
export function gaitShares(have: Gait[], speed: number, pace?: Pace): Partial<Record<Gait, number>> {
  if (pace === "sneak" && have.includes("sneak")) return { sneak: 1 }
  const ladder = (["walk", "run", "sprint"] as const).filter((g) => have.includes(g))
  if (!ladder.length) return have.includes("sneak") ? { sneak: 1 } : {}
  for (let i = 0; i < ladder.length - 1; i++) {
    const at = BETWEEN[`${ladder[i]}|${ladder[i + 1]}`]
    if (speed >= at + BLEND) continue
    if (speed <= at - BLEND) return { [ladder[i]]: 1 }
    const t = smooth((speed - (at - BLEND)) / (2 * BLEND))
    return { [ladder[i]]: 1 - t, [ladder[i + 1]]: t }
  }
  return { [ladder[ladder.length - 1]]: 1 }
}

// How fast a gait's clip plays, for the speed the figure moves at.
export function gaitRate(gait: Gait, own: number, speed: number) {
  const [least, most] = RATE[gait]
  return Math.min(most, Math.max(least, speed / (own || STRIDE)))
}
