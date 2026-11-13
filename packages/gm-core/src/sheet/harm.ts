import type { ConditionId } from "@d20/srd"
import { damageTaken, defensesOf, rollDamage } from "./attack"
import type { Roller } from "./check"
import { conditionName, exhaustionOf, withCondition, withoutCondition } from "./conditions"
import { afterHarm, type DeathRules, enduredWords, type Fate, killed, wardedWords, withDamage, withHealing } from "./death"
import { hitPointsOf } from "./hit-points"
import { typesTaken } from "./monster-traits"
import type { Stake } from "./stakes"

/** One stake as it fell, as the story keeps it: the dice rolled and what the target lost or regained. */
export type Harm = { target: string; kind: "damage" | "healing"; dice: number[]; sides?: number; bonus: number; type?: string; amount: number }

/** A condition a roll gave someone, or ended for them, as the story keeps it. */
export type ConditionChange = { target: string; condition: ConditionId; ends?: true }

type Harmed = Roller & { id: string; name: string; type: string; hitPoints?: number; healthPercent?: number; dead?: true; fled?: true; isComplete?: boolean }

// How a character stands after harm or healing, in words for the game master.
function standing(character: Harmed, fate: Fate | undefined): string {
  if (fate === "dies") return `${character.name} dies.`
  if (fate === "killed") return `${character.name} is killed outright.`
  if (fate === "stable") return `${character.name} is Unconscious and Stable, out of the fight.`
  if (fate === "endures") return enduredWords(character.name, character)
  if (fate === "warded") return wardedWords(character.name)
  if (fate === "dying") return `${character.name} is at 0 hit points, Unconscious and dying.`
  const hitPoints = hitPointsOf(character)
  if (!hitPoints) return ""
  // Down at 0 and not dead: a Troll, whose Regeneration settles it as its turn begins.
  if (hitPoints.current === 0) return `${character.name} is at 0 hit points and down, not dead.`
  return `${character.name} has ${hitPoints.current} of ${hitPoints.maximum} hit points${hitPoints.current * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.`
}

/**
 * Settle a roll's stakes once its outcome is known. Each stake that matches is applied. Damage is rolled and meets the
 * target's Immunities, Resistances and Vulnerabilities and the rules of 0 hit points, and healing brings back one who
 * is down. A condition is given unless the target is immune to it, or ended. `roll` throws one die of the given size.
 * A stake on someone who is not here is dropped.
 */
export function applyStakes<T extends Harmed>(args: {
  characters: readonly T[]
  stakes: readonly Stake[] | undefined
  outcome: "success" | "failure"
  roll: (sides: number) => number
  rules?: DeathRules
}): { characters: T[]; harm: Harm[]; conditions: ConditionChange[]; facts: string[] } {
  let characters = [...args.characters]
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  for (const stake of args.stakes ?? []) {
    if (stake.on !== "always" && stake.on !== args.outcome) continue
    const target = characters.find((character) => character.id === stake.target)
    if (!target) continue
    if (stake.kind === "condition") {
      const name = conditionName(stake.condition)
      if (stake.ends) {
        const freed = withoutCondition(target, stake.condition)
        if (!freed.ended) continue
        put(freed.character)
        conditions.push({ target: target.id, condition: stake.condition, ends: true })
        facts.push(stake.condition === "exhaustion" && exhaustionOf(freed.character) ? `${target.name} loses a level of Exhaustion.` : `${target.name} is no longer ${name}.`)
        continue
      }
      const given = withCondition(target, { id: stake.condition, source: stake.source, span: stake.span }, { acted: !!target.isComplete, present: characters })
      if (!given.given) {
        facts.push(`${target.name} cannot be ${name} and is not.`)
        continue
      }
      // The sixth level of Exhaustion kills.
      const dies = given.level === 6
      put(afterHarm(dies ? killed(given.character, args.rules) : given.character))
      conditions.push({ target: target.id, condition: stake.condition })
      facts.push(
        stake.condition === "exhaustion"
          ? `${target.name} gains a level of Exhaustion, now ${given.level}.${dies ? ` ${standing(target, args.rules?.playerDeath === false && target.type === "pc" ? "stable" : "dies")}` : ""}`
          : `${target.name} is now ${name}.`
      )
      continue
    }
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
      const defenses = defensesOf(target)
      amount = damageTaken(rolled, defenses)
      const struck = withDamage(target, amount, { rules: args.rules, types: typesTaken(rolled, defenses) })
      after = afterHarm(struck.character)
      fate = struck.fate
      facts.push(`${target.name} takes ${amount} ${stake.type ?? ""} damage. ${standing(after, fate)}`.replace("  ", " "))
    }
    put(after)
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
  return { characters, harm, conditions, facts }
}
