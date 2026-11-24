import type { AbilityId, ConditionId, Size } from "@d20/srd"
import { isDead } from "../utils/turn-actors"
import { UNARMED_STRIKE } from "./attack"
import { blockOf } from "./blocks"
import { type Check, checkBonus, type Roller } from "./check"
import type { ConditionEntry } from "./condition-entry"
import { conditionName, saveFailedBy, withCondition } from "./conditions"
import { afterHarm } from "./death"
import { shovedTo } from "./floor-areas"
import type { ConditionChange } from "./harm"
import { heldWith, strengthAndProficiency } from "./hit-riders"
import { legendaryResistanceWords, withLegendaryResistanceSpent } from "./legendary-resistance"
import { rescueWords, withRescueSpent } from "./save-rules"
import { shapeOf } from "./shape"
import { type Floor, sizeOf } from "./space"
import { type Cast, type Castee, rollSave, type SaveRoll } from "./spells"

/**
 * The Grapple and the Shove of an Unarmed Strike, the options that take the place of its damage (SRD 5.2.1, Unarmed
 * Strike). No attack roll is made. The target makes a Strength or Dexterity saving throw, its choice, against 8 plus
 * the striker's Strength modifier and Proficiency Bonus (./hit-riders `strengthAndProficiency`). On a failure a Grapple
 * gives the Grappled condition, held by the striker's Unarmed Strike with the same number as its escape DC
 * (./hit-riders `escapeFrom`), and a Shove either pushes the target 5 feet away or gives it the Prone condition. Either
 * works only on a target no more than one size larger than the striker, and a Grapple only while a hand is free.
 *
 * They are used as the turn's action, as a stat block's action that is a save is (`RequiredFeature`), under these ids.
 * A hero or a humanoid NPC may use them. A creature whose stat block grapples with its own attack does as that says.
 */
export const HOLD_IDS = ["unarmed-grapple", "unarmed-shove-push", "unarmed-shove-prone"] as const
export type HoldId = (typeof HOLD_IDS)[number]
export const isHold = (id: string | undefined): id is HoldId => HOLD_IDS.some((hold) => hold === id)

// A creature grapples with a hand each, and holds one creature with it.
const HANDS = 2
const PUSH_FEET = 5
const SIZES: readonly Size[] = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]

type Holding = Castee & { position?: { x: number; y: number }; isComplete?: boolean }

const NAMES: Record<HoldId, string> = { "unarmed-grapple": "Grapple", "unarmed-shove-push": "Shove", "unarmed-shove-prone": "Shove" }
const ABILITY_NAMES: Partial<Record<AbilityId, string>> = { str: "Strength", dex: "Dexterity" }

/** Whether a creature can use an Unarmed Strike's options: a hero not in a Beast's shape, or an NPC whose stat block is a humanoid's. */
export function canHold(character: Roller): boolean {
  if (shapeOf(character)) return false
  if (character.sheet) return true
  return character.type === "npc" && blockOf(character)?.type === "humanoid"
}

/** Why one cannot take hold of or shove another, or none: more than one size larger, or no hand free for a Grapple. */
export function holdBarred(
  id: HoldId,
  actor: Roller & { id?: string },
  target: Roller,
  present: readonly { id?: string; conditions?: readonly ConditionEntry[] }[]
): string | undefined {
  if (SIZES.indexOf(sizeOf(target)) > SIZES.indexOf(sizeOf(actor)) + 1) return "is more than one size larger"
  if (id === "unarmed-grapple" && heldWith(actor.id ?? "", UNARMED_STRIKE, present).length >= HANDS) return "has no hand free to grab with"
  return undefined
}

// The save a target makes, since it chooses: the better of its Strength and Dexterity, one not failed outright first.
function bestSave(target: Castee): AbilityId {
  const abilities: AbilityId[] = ["str", "dex"]
  const open = abilities.filter((ability) => !saveFailedBy(target, { kind: "save", ability }))
  const bonus = (ability: AbilityId) => checkBonus(target, { kind: "save", ability } satisfies Check)
  return (open.length ? open : abilities).reduce((best, ability) => (bonus(ability) > bonus(best) ? ability : best))
}

/**
 * Use the Grapple or Shove of an Unarmed Strike on the one target named, whom the read has found within 5 feet.
 * Everyone comes back as they left, with the save as it fell and what happened in words, in the shape a cast takes, so
 * it is told by the same path. `problem` says why nothing happened.
 *
 * Thalbern (Strength +3, Proficiency Bonus +2) grapples a bandit: DC 13. The bandit's better save is Dexterity +1, and
 * a 9 makes 10, so it fails and has the Grappled condition from Thalbern.
 */
export function resolveHold<T extends Holding>(args: {
  characters: readonly T[]
  actorId: string
  feature: { id: string; targets: string[] }
  d20: () => number
  roll: (sides: number) => number
  floor?: Floor
}): Cast<T> & { problem?: string; name: string } {
  let characters = [...args.characters]
  const id = args.feature.id
  const name = isHold(id) ? NAMES[id] : "Grapple"
  const actor = characters.find((character) => character.id === args.actorId)
  const none = (problem: string) => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [], problem, name })
  if (!actor || !isHold(id) || !canHold(actor)) return none(`${actor?.name ?? "This character"} cannot do that.`)
  const find = (who: string) => characters.find((character) => character.id === who)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const target = args.feature.targets.map(find).find((found) => found && found.id !== actor.id && !isDead(found))
  if (!target) return none(`${actor.name}'s ${name} catches no one.`)
  const barred = holdBarred(id, actor, target, characters)
  if (barred) return none(`${actor.name} ${barred}, and the ${name} is not made on ${target.name}.`)
  const condition: ConditionId = id === "unarmed-grapple" ? "grappled" : "prone"
  const pushes = id === "unarmed-shove-push"
  const dc = 8 + strengthAndProficiency(actor)
  const ability = bestSave(target)
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  // A Legendary creature may choose to succeed, judged on the condition at stake. A push is not worth a use.
  const thrown: SaveRoll = rollSave({
    target,
    ability,
    dc,
    d20: args.d20,
    roll: args.roll,
    characters,
    against: pushes ? [] : [condition],
    ...(pushes ? {} : { stakes: { conditions: [condition] } }),
    magical: false,
  })
  const done = (): Cast<T> & { name: string } => ({ characters, targets: [target.id], saves: [thrown], harm: [], conditions, facts, name })
  if (thrown.legendary) {
    const spent = withLegendaryResistanceSpent(target)
    put(spent)
    facts.push(legendaryResistanceWords(target.name, spent))
  }
  if (thrown.rescued) {
    put(withRescueSpent(find(thrown.rescued.by ?? target.id) ?? target, thrown.rescued))
    facts.push(rescueWords(target.name, thrown.rescued, thrown))
  }
  const verdict = `${target.name} ${thrown.success ? "SUCCEEDS on" : "FAILS"} the ${ABILITY_NAMES[ability]} saving throw against ${actor.name}'s ${name} (${thrown.total} against DC ${dc})`
  if (thrown.success) {
    facts.push(`${verdict}, and is not ${pushes ? "pushed" : id === "unarmed-grapple" ? "Grappled" : "knocked Prone"}.`)
    return done()
  }
  const now = find(target.id) as T
  if (pushes) {
    if (!now.position || !actor.position) {
      facts.push(`${verdict}, and is pushed 5 feet away.`)
      return done()
    }
    const at = shovedTo(args.floor, characters, now.position, actor.position, PUSH_FEET)
    const feet = Math.round(Math.hypot(at.x - now.position.x, at.y - now.position.y))
    put({ ...now, position: at })
    facts.push(`${verdict}, and is pushed ${feet === 0 ? "no distance, for something stands in the way" : `${feet} feet`} away.`)
    return done()
  }
  // A grapple lasts until something ends it. Prone lasts until its bearer's turn begins, and takes no span.
  const given = withCondition(now, { id: condition, source: actor.id, span: "lasting", ...(id === "unarmed-grapple" ? { attack: UNARMED_STRIKE } : {}) }, { acted: !!now.isComplete, present: characters })
  if (!given.given) {
    facts.push(`${verdict}, but cannot be ${conditionName(condition)} and is not.`)
    return done()
  }
  put(afterHarm(given.character))
  conditions.push({ target: target.id, condition })
  facts.push(`${verdict}, and is now ${conditionName(condition)}${id === "unarmed-grapple" ? ` by ${actor.name} (escape DC ${dc})` : ""}.`)
  return done()
}

/** The options of an Unarmed Strike as the read's menu words them for the game master. */
export const HOLD_LINES: Record<HoldId, string> = {
  "unarmed-grapple": "they grab hold of one enemy within reach with a free hand, who is Grappled on a failed Strength or Dexterity saving throw",
  "unarmed-shove-push": "they shove one enemy within reach 5 feet away, who is pushed on a failed Strength or Dexterity saving throw",
  "unarmed-shove-prone": "they shove one enemy within reach to the ground, who is knocked Prone on a failed Strength or Dexterity saving throw",
}
