import type { AbilityId, DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { monsterById } from "@d20/srd/monsters"
import { isDead } from "../utils/turn-actors"
import { damageTaken, defensesOf, parseDice, rollDamage } from "./attack"
import { conditionName, withCondition } from "./conditions"
import { afterHarm, enduredWords, type Fate, withDamage, withHealing } from "./death"
import { deriveSheet } from "./derive"
import { hasFeature, usesLeft, withFeatureUsed } from "./feature-rules"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import type { Sheet } from "./sheet"
import { placedOf, within } from "./space"
import { type Cast, rollSave, type SaveRoll, spellcastingOf } from "./spells"
import { DEFAULT_STAT_BLOCK } from "./stat-block"

/**
 * A Cleric's Channel Divinity by the SRD 5.2.1, as pure functions. Each use is a Magic action that spends one of the
 * feature's uses (2 from level 2, one back on a Short Rest and all on a Long Rest, ./rest). A save it calls for is
 * against the Cleric's spell save DC.
 *
 * Divine Spark: one other creature within 30 feet. Roll 1d8 and add the Wisdom modifier: restore that many hit points,
 * or the creature makes a Constitution save, taking that much Necrotic or Radiant damage on a failure and half on a
 * success.
 * Turn Undead: each Undead of the Cleric's choice within 30 feet makes a Wisdom save, and on a failure is Frightened
 * and Incapacitated for a minute. With Sear Undead (level 5) the Cleric rolls as many d8s as their Wisdom modifier, at
 * least one, and each Undead that fails takes that much Radiant damage. The engine does not end the turning early when
 * the creature takes damage, nor make it flee: the game master tells that.
 * Preserve Life (Life Domain, level 3): five times the Cleric level in hit points, divided among Bloodied creatures
 * within 30 feet, the Cleric among them, none raised above half its hit point maximum.
 */

export const DIVINITY_FEATURE = "cleric-channel-divinity"
const RANGE = 30

/** The ways a Cleric can Channel Divinity, as the read of a turn names them. */
export const divinityPicks = ["divine-spark-heal", "divine-spark-harm", "turn-undead", "preserve-life"] as const
export type DivinityPick = (typeof divinityPicks)[number]
export type DivinityEffect = "divine-spark" | "turn-undead" | "preserve-life"

const NAMES: Record<DivinityEffect, string> = { "divine-spark": "Divine Spark", "turn-undead": "Turn Undead", "preserve-life": "Preserve Life" }
export const divinityName = (effect: DivinityEffect): string => NAMES[effect]

/** The ways a hero can Channel Divinity now: none without a use left. Preserve Life only for a Life Domain Cleric. */
export function divinityPicksOf(character: { sheet?: Sheet; featureUses?: Record<string, number> }): DivinityPick[] {
  if (!hasFeature(character, DIVINITY_FEATURE) || usesLeft(character, DIVINITY_FEATURE) < 1) return []
  return divinityPicks.filter((pick) => pick !== "preserve-life" || hasFeature(character, "life-domain-preserve-life"))
}

/** Whether a creature is Undead: an NPC whose stat block says so. A hero, or an NPC with a rules sheet, is not. */
export function isUndead(character: { type?: string; sheet?: unknown; statBlock?: string }): boolean {
  if (character.type !== "npc" || character.sheet) return false
  return monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK)?.type === "undead"
}

// The Divine Spark option's dice at a Cleric level: 1d8, 2d8 from 7, 3d8 from 13, 4d8 from 18.
function sparkDice(level: number): string {
  const option = classFeatureById.get(DIVINITY_FEATURE)?.options?.find((entry) => entry.id === "divine-spark") as { dice?: string; diceByLevel?: { level: number; dice: string }[] } | undefined
  return option?.diceByLevel?.filter((step) => step.level <= level).at(-1)?.dice ?? option?.dice ?? "1d8"
}

// How one who fell stands, in words.
function standing(character: Parameters<typeof hitPointsOf>[0], name: string, fate: Fate | undefined): string {
  if (fate === "dies") return `${name} dies.`
  if (fate === "killed") return `${name} is killed outright.`
  if (fate === "stable") return `${name} is Unconscious and Stable, out of the fight.`
  if (fate === "endures") return enduredWords(name, character)
  if (fate === "dying") return `${name} is at 0 hit points, Unconscious and dying.`
  const hitPoints = hitPointsOf(character)
  return hitPoints ? `${name} has ${hitPoints.current} of ${hitPoints.maximum} hit points${hitPoints.current * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.` : ""
}

type Channeled = Parameters<typeof spellcastingOf>[0] & {
  id: string
  name: string
  type: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  isComplete?: boolean
  featureUses?: Record<string, number>
  position?: { x: number; y: number }
}

/**
 * Use Channel Divinity. Everyone comes back as it left them, with each save as it fell and what happened in words, in
 * the shape a spell's cast takes, so it is told by the same path. One use is spent. `problem` says why nothing
 * happened: no use left, no one to use it on.
 *
 * Milos, a level 2 Cleric with Wisdom 16 (+3), sparks the Owlbear: a 5 on the d8 makes 8, it rolls a 6 on its
 * Constitution save with +3, 9 against his DC 13, and takes 8 Radiant damage.
 */
export function channelDivinity<T extends Channeled>(args: {
  characters: readonly T[]
  clericId: string
  effect: DivinityEffect
  targets: readonly string[]
  heal?: boolean
  damageType?: "necrotic" | "radiant"
  d20: () => number
  roll: (sides: number) => number
  rules?: { playerDeath?: boolean }
}): Cast<T> & { problem?: string } {
  let characters = [...args.characters]
  const cleric = characters.find((character) => character.id === args.clericId)
  const none = (problem: string): Cast<T> & { problem: string } => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [], problem })
  if (!cleric?.sheet || !hasFeature(cleric, DIVINITY_FEATURE)) return none(`${cleric?.name ?? "This character"} cannot Channel Divinity.`)
  if (usesLeft(cleric, DIVINITY_FEATURE) < 1) return none(`${cleric.name} has no use of Channel Divinity left.`)
  if (args.effect === "preserve-life" && !hasFeature(cleric, "life-domain-preserve-life")) return none(`${cleric.name} cannot use Preserve Life.`)
  const derived = deriveSheet(cleric.sheet)
  const wisdom = derived.abilityModifiers.wis
  const dc = spellcastingOf(cleric)?.saveDc ?? 8 + derived.proficiencyBonus + wisdom
  const find = (id: string) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  // Within 30 feet of the Cleric, where both stand on a floor.
  const near = (other: T) => {
    const from = placedOf(cleric)
    const at = placedOf(other)
    return !from || !at || within(from, at, RANGE)
  }
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  // A save by the usual rules of one against a spell (./spells `rollSave`), against the Cleric's spell save DC.
  const save = (target: T, ability: AbilityId): SaveRoll => {
    const rolled = rollSave({ target, ability, dc, d20: args.d20, roll: args.roll, characters })
    saves.push(rolled)
    return rolled
  }
  const hurt = (target: T, amount: number, type: DamageTypeId, dice: number[], sides: number, bonus: number) => {
    const taken = damageTaken({ parts: [{ type, dice: [], bonus: amount, total: amount }], total: amount }, defensesOf(target))
    const struck = withDamage(target, taken, { rules: args.rules })
    put(afterHarm(struck.character))
    harm.push({ target: target.id, kind: "damage", dice, sides, bonus, type, amount: taken })
    return { taken, fate: struck.fate }
  }

  let targets: string[] = []
  if (args.effect === "divine-spark") {
    const target = args.targets.map(find).find((other): other is T => !!other && other.id !== cleric.id && !isDead(other) && near(other))
    if (!target) return none(`There is no one within 30 feet of ${cleric.name} to use Divine Spark on.`)
    targets = [target.id]
    const rolled = rollDamage([{ dice: sparkDice(cleric.sheet.level), type: "radiant" }], args.roll)
    const [part] = rolled.parts
    const amount = Math.max(0, rolled.total + wisdom)
    if (args.heal) {
      const healed = withHealing(target, amount)
      put(healed)
      harm.push({ target: target.id, kind: "healing", dice: part.dice, sides: part.sides, bonus: wisdom, amount })
      facts.push(`${cleric.name}'s Divine Spark restores ${amount} hit points to ${target.name}. ${standing(healed, target.name, undefined)}`)
    } else {
      const type = args.damageType ?? "radiant"
      const saved = save(target, "con")
      const dealt = saved.success ? Math.floor(amount / 2) : amount
      const done = hurt(target, dealt, type, part.dice, part.sides ?? parseDice(sparkDice(cleric.sheet.level)).sides, wisdom)
      facts.push(
        `${target.name} ${saved.success ? "SUCCEEDS on" : "FAILS"} the Constitution saving throw against ${cleric.name}'s Divine Spark (${saved.total} against DC ${dc}) and takes ${done.taken} ${type} damage. ${standing(find(target.id) as T, target.name, done.fate)}`
      )
    }
  } else if (args.effect === "turn-undead") {
    // The Undead the Cleric chooses, or every Undead within 30 feet when none are named.
    const undead = (other: T | undefined): other is T => !!other && isUndead(other) && !isDead(other) && !other.fled && near(other)
    const named = args.targets.map(find).filter(undead)
    const turned = named.length ? named : characters.filter(undead)
    targets = turned.map((other) => other.id)
    if (!turned.length) facts.push(`${cleric.name} presents a holy symbol, and no Undead within 30 feet answers it.`)
    // Sear Undead: one roll of the Wisdom modifier's d8s, at least one, for every Undead that fails.
    const sear = hasFeature(cleric, "cleric-sear-undead") && turned.length ? rollDamage([{ dice: `${Math.max(1, wisdom)}d8`, type: "radiant" }], args.roll) : undefined
    for (const target of turned) {
      const saved = save(target, "wis")
      const verdict = `${target.name} ${saved.success ? "SUCCEEDS on" : "FAILS"} the Wisdom saving throw against ${cleric.name}'s Turn Undead (${saved.total} against DC ${dc})`
      if (saved.success) {
        facts.push(`${verdict} and is not turned.`)
        continue
      }
      const words: string[] = []
      for (const condition of ["frightened", "incapacitated"] as const) {
        const now = find(target.id) as T
        const given = withCondition(now, { id: condition, source: cleric.id, span: "minute" }, { acted: !!now.isComplete })
        if (!given.given) continue
        put(given.character)
        conditions.push({ target: target.id, condition })
        words.push(conditionName(condition))
      }
      const seared = sear ? hurt(find(target.id) as T, sear.total, "radiant", sear.parts[0].dice, 8, 0) : undefined
      facts.push(
        `${verdict}${words.length ? ` and is ${words.join(" and ")} for a minute, fleeing ${cleric.name}` : ""}.${seared ? ` Sear Undead burns it for ${seared.taken} radiant damage. ${standing(find(target.id) as T, target.name, seared.fate)}` : ""}`
      )
    }
  } else {
    // Preserve Life: five times the Cleric level, to the Bloodied within 30 feet, none above half its maximum.
    let pool = 5 * cleric.sheet.level
    const bloodied = (other: T | undefined): other is T => {
      const hitPoints = other && !isDead(other) && near(other) ? hitPointsOf(other) : undefined
      return !!hitPoints && hitPoints.current * 2 <= hitPoints.maximum
    }
    const named = args.targets.map(find).filter(bloodied)
    // With none named, the Cleric's own side, the most hurt first.
    const chosen = named.length ? named : characters.filter((other) => other.type === cleric.type && bloodied(other)).sort((a, b) => (hitPointsOf(a)?.current ?? 0) - (hitPointsOf(b)?.current ?? 0))
    for (const target of chosen) {
      const hitPoints = hitPointsOf(target)
      if (!hitPoints || pool < 1) continue
      const amount = Math.min(pool, Math.max(0, Math.floor(hitPoints.maximum / 2) - hitPoints.current))
      if (amount < 1) continue
      pool -= amount
      const healed = withHealing(target, amount)
      put(healed)
      targets.push(target.id)
      harm.push({ target: target.id, kind: "healing", dice: [], bonus: amount, amount })
      facts.push(`${cleric.name}'s Preserve Life restores ${amount} hit points to ${target.name}. ${standing(healed, target.name, undefined)}`)
    }
    if (!targets.length) return none(`No one Bloodied within 30 feet of ${cleric.name} can be helped by Preserve Life.`)
  }
  characters = characters.map((character) => (character.id === cleric.id ? withFeatureUsed(character, DIVINITY_FEATURE) : character))
  return { characters, targets, saves, harm, conditions, facts }
}
