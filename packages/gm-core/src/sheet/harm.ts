import { damageTaken, defensesOf, rollDamage } from "./attack"
import type { Roller } from "./check"
import { afterHarm, type DeathRules, type Fate, withDamage, withHealing } from "./death"
import { hitPointsOf } from "./hit-points"
import type { Stake } from "./stakes"

/** One stake as it fell, as the story keeps it: the dice rolled and what the target lost or regained. */
export type Harm = { target: string; kind: "damage" | "healing"; dice: number[]; sides?: number; bonus: number; type?: string; amount: number }

type Harmed = Roller & { id: string; name: string; type: string; hitPoints?: number; healthPercent?: number; status?: string }

// How a character stands after harm or healing, in words for the game master.
function standing(character: Harmed, fate: Fate | undefined): string {
  if (fate === "dies") return `${character.name} dies.`
  if (fate === "killed") return `${character.name} is killed outright.`
  if (fate === "stable") return `${character.name} is Unconscious and Stable, out of the fight.`
  if (fate === "dying") return `${character.name} is at 0 hit points, Unconscious and dying.`
  const hitPoints = hitPointsOf(character)
  if (!hitPoints) return ""
  return `${character.name} has ${hitPoints.current} of ${hitPoints.maximum} hit points${hitPoints.current * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.`
}

/**
 * Settle a roll's stakes once its outcome is known. Each stake that matches is rolled: damage meets the target's
 * Immunities, Resistances and Vulnerabilities and the rules of 0 hit points, and healing brings back one who is down.
 * `roll` throws one die of the given size. A stake on someone who is not here is dropped.
 */
export function applyStakes<T extends Harmed>(args: {
  characters: readonly T[]
  stakes: readonly Stake[] | undefined
  outcome: "success" | "failure"
  roll: (sides: number) => number
  rules?: DeathRules
}): { characters: T[]; harm: Harm[]; facts: string[] } {
  let characters = [...args.characters]
  const harm: Harm[] = []
  const facts: string[] = []
  for (const stake of args.stakes ?? []) {
    if (stake.on !== "always" && stake.on !== args.outcome) continue
    const target = characters.find((character) => character.id === stake.target)
    if (!target) continue
    const rolled = rollDamage([{ dice: stake.dice, type: stake.type ?? "bludgeoning" }], args.roll)
    const [part] = rolled.parts
    let after: T
    let fate: Fate | undefined
    let amount: number
    if (stake.kind === "healing") {
      amount = rolled.total
      after = withHealing(target, amount)
      facts.push(`${target.name} regains ${amount} hit points. ${standing(after, undefined)}`)
    } else {
      amount = damageTaken(rolled, defensesOf(target))
      const struck = withDamage(target, amount, { rules: args.rules })
      after = afterHarm(struck.character)
      fate = struck.fate
      facts.push(`${target.name} takes ${amount} ${stake.type ?? ""} damage. ${standing(after, fate)}`.replace("  ", " "))
    }
    characters = characters.map((character) => (character.id === target.id ? after : character))
    harm.push({
      target: target.id,
      kind: stake.kind,
      dice: part.dice,
      sides: part.sides,
      bonus: part.bonus,
      ...(stake.kind === "damage" && stake.type ? { type: stake.type } : {}),
      amount,
    })
  }
  return { characters, harm, facts }
}
