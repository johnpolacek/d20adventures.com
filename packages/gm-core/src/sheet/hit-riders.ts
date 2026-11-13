import type { AbilityId, ConditionId, DamageTypeId, Size } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import type { Monster, MonsterFeature } from "@d20/srd/schema/monsters"
import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import { type Attack, actionId, attacksOf, damageTaken, defensesOf, rollDamage, type Target } from "./attack"
import { type CheckResult, checkBonus, combineModes, type Roller, resolveCheck } from "./check"
import type { HitRider } from "./class-rules"
import type { ConditionEntry, ConditionSpan } from "./condition-entry"
import { checkModesFrom, conditionName, saveFailedBy, withCondition, withoutCondition } from "./conditions"
import { afterHarm, type DeathRules, withDamage } from "./death"
import { deriveSheet } from "./derive"
import type { ConditionChange } from "./harm"
import { hitPointsOf } from "./hit-points"
import { typesTaken } from "./monster-traits"
import { shapeOf } from "./shape"
import { attackReach, feetBetween, type Point, type Standing, sizeOf } from "./space"
import { checkAdds, saveBonusFor, saveModesFor } from "./spell-effects"
import { DEFAULT_STAT_BLOCK } from "./stat-block"
import type { TurnEffect } from "./turn-effect"

/**
 * What a stat block's attack does on a hit beyond its damage, read from the action's text and checked against its typed
 * data (`readRiders`), and run as the hit lands (`blockRidersOnHit`, in ./attack `landBlow`).
 *
 * - A condition, with or without a save, for the span the text gives: a Wolf's Bite knocks a Medium or smaller target
 *   Prone, a Ghoul's Claw Paralyzes one who fails a DC 10 Constitution save until the end of its next turn. "Until the
 *   start of the attacker's next turn" and "until the end of its next turn" are both the span of one turn, counted in
 *   the bearer's own turns, as the engine runs a round's turns together.
 * - A grapple: Grappled, with the escape DC kept on the stat block and read again when it is needed, and what lasts until
 *   the grapple ends. A grappler holds one creature with each part it grapples with: a Giant Crab's two claws hold two,
 *   a griffon's "both claws" one, and a Bite one. While every part is holding, the attack cannot be made at another.
 * - A charge: a part or a condition that falls only when the attacker moved 20 feet (or as printed) straight toward the
 *   target immediately before the hit, as the move the read gave it measures.
 * - An attachment: a Stirge's Proboscis attaches, after which it makes no Proboscis attacks and drains its target as
 *   each round turns. Kept as the turn effect "attached" on the target, by the attacker, renewed while it holds.
 *
 * A grapple and an attachment end when the holder is down, gone or Incapacitated, or the two are farther apart than the
 * attack reaches (`releasedHolds`), and by the held creature's own action (`escapeFrom`, `detached`). A rider whose
 * text holds a word the engine does not run is left unread, with the reason, and the game master tells it.
 */
export type BlockRider =
  | { kind: "condition"; conditions: ConditionId[]; span: ConditionSpan; gate?: Gate; save?: { ability: AbilityId; dc: number } }
  | {
      kind: "grapple"
      escape: number
      /** How many creatures it can hold at once: one for each part it grapples with. */
      parts: number
      gate?: Gate
      /** Conditions that last until the grapple ends: a crocodile's Restrained. */
      with?: ConditionId[]
      /** Ability checks made to escape it have Disadvantage. */
      hinders?: true
      /** The attack, by id, that cannot be made at the one held: a crocodile's Tail. */
      spares?: string
    }
  | { kind: "attach"; drain: { dice: string; type: DamageTypeId }; bars: string }

/** The gates a rider's text puts on it: the target no larger than a size, a charge, and the creature types it spares. */
export type Gate = { size?: Size; charge?: number; notTypes?: string[]; notElf?: true }

/** The rider id strike facts and beats carry for what a stat block's attack did on a hit. */
export const STAT_BLOCK_RIDER = "stat-block"

const SIZES: readonly Size[] = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]
const COND = "(Blinded|Charmed|Deafened|Frightened|Grappled|Incapacitated|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious)"
const SIZE = "(Tiny|Small|Medium|Large|Huge|Gargantuan)"
const DICE = String.raw`\d+ \(\d+d\d+(?: [+-] \d+)?\)`
const DAMAGE = String.raw`(?:${DICE}|\d+) [A-Z][a-z]+ damage`
const ABILITIES: Record<string, AbilityId> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
const COUNTS: Record<string, number> = { two: 2, four: 4, six: 6, ten: 10 }
// The words a save's gate names: who is not subjected to it.
const SPARED: Record<string, Gate> = {
  "a creature": {},
  "a non-Undead creature": { notTypes: ["undead"] },
  "a creature that isn't an Undead or elf": { notTypes: ["undead"], notElf: true },
}

const condition = (word: string) => word.toLowerCase() as ConditionId
const sizeGate = (size: string | undefined, charge: string | undefined): Gate | undefined =>
  size || charge ? { ...(size ? { size: size as Size } : {}), ...(charge ? { charge: Number(charge) } : {}) } : undefined

// One clause of a hit's text after its damage: the words it must start with, and what it reads as. A clause may change
// the rider before it (`riders` is the list so far): "While Grappled, the target has the Restrained condition".
type Clause = { pattern: RegExp; read: (match: RegExpExecArray, riders: BlockRider[], action: MonsterFeature) => BlockRider[] | string }

const lastGrapple = (riders: BlockRider[]) => [...riders].reverse().find((rider) => rider.kind === "grapple")

const CLAUSES: Clause[] = [
  // ", and the target has the Poisoned condition until the start of the assassin's next turn."
  {
    pattern: new RegExp(String.raw`^, and the target has the ${COND}(?: and ${COND})? conditions? until the (?:start|end) of (?:the [a-z]+'s|its) next turn\.`),
    read: (match, riders) => [...riders, { kind: "condition", conditions: [match[1], match[2]].filter(Boolean).map(condition), span: "turn" }],
  },
  // ". If the target is a Medium or smaller creature, it has the Prone condition.", with a charge before the hit.
  {
    pattern: new RegExp(
      String.raw`^\.\s+If (?:the )?target is (?:a )?${SIZE} or smaller(?: creature)?(?: and the [a-z]+ moved (\d+)\+ feet straight toward it immediately before the hit)?, (?:it|the target) (?:takes an extra ${DAMAGE} and )?has the ${COND} condition\.`
    ),
    read: (match, riders) => [...riders, { kind: "condition", conditions: [condition(match[3])], span: "turn", gate: sizeGate(match[1], match[2]) }],
  },
  // ". If the target is a Large or smaller creature, it has the Grappled condition (escape DC 13) from one of two claws."
  {
    pattern: new RegExp(
      String.raw`^\.\s+(?:If the target is a ${SIZE} or smaller creature, it|The target) has the Grappled condition \(escape DC (\d+)\)(?: from (?:one of (two|four|six|ten) [a-z]+|both (?:of the [a-z]+'s )?[a-z ]+?|all [a-z]+ [a-z]+))?(, and it has the Restrained condition until the grapple ends)?\.`
    ),
    read: (match, riders) => [
      ...riders,
      {
        kind: "grapple",
        escape: Number(match[2]),
        parts: match[3] ? COUNTS[match[3]] : 1,
        ...(match[1] ? { gate: { size: match[1] as Size } } : {}),
        ...(match[4] ? { with: ["restrained" as const] } : {}),
      },
    ],
  },
  // " While Grappled, the target has the Restrained condition and can't be targeted by the crocodile's Tail."
  {
    pattern: /^\s+While Grappled, the target has the Restrained condition(?: and can't be targeted by the [a-z]+'s ([A-Z][a-z]+))?\./,
    read: (match, riders) => {
      const grapple = lastGrapple(riders)
      if (grapple?.kind !== "grapple") return "a condition while Grappled with no grapple"
      return riders.map((rider) => (rider === grapple ? { ...grapple, with: [...(grapple.with ?? []), "restrained"], ...(match[1] ? { spares: actionId(match[1]) } : {}) } : rider))
    },
  },
  // " Ability checks made to escape this grapple have Disadvantage."
  {
    pattern: /^\s+Ability checks made to escape this grapple have Disadvantage\./,
    read: (_match, riders) => {
      const grapple = lastGrapple(riders)
      if (grapple?.kind !== "grapple") return "an escape's Disadvantage with no grapple"
      return riders.map((rider) => (rider === grapple ? { ...grapple, hinders: true as const } : rider))
    },
  },
  // ". If the target is a creature that isn't an Undead or elf, it is subjected to the following effect. Constitution
  // Saving Throw: DC 10. Failure: The target has the Paralyzed condition until the end of its next turn."
  {
    pattern: new RegExp(
      String.raw`^\.\s+If the target is (a creature|a non-Undead creature|a creature that isn't an Undead or elf), it is subjected to the following effect\. (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)\. Failure: The target has the ${COND} condition until the end of its next turn\.`
    ),
    read: (match, riders) => {
      const gate = SPARED[match[1]]
      return [
        ...riders,
        { kind: "condition", conditions: [condition(match[4])], span: "turn", save: { ability: ABILITIES[match[2]], dc: Number(match[3]) }, ...(Object.keys(gate).length ? { gate } : {}) },
      ]
    },
  },
  // ", and the stirge attaches to the target. While attached, the stirge can't make Proboscis attacks, and the target
  // takes 5 (2d4) Necrotic damage at the start of each of the stirge's turns." and how it is detached.
  {
    pattern: new RegExp(
      String.raw`^, and the ([a-z]+) attaches to the target\. While attached, the \1 can't make ([A-Z][a-z]+) attacks, and the target takes (${DICE}) ([A-Z][a-z]+) damage at the start of each of the \1's turns\.\nThe \1 can detach itself by spending 5 feet of its movement\. The target or a creature within 5 feet of it can detach the \1 as an action\.`
    ),
    read: (match, riders, action) => {
      const drain = action.damage?.find((part) => part.timing && part.appliesWhen === "While attached")
      if (!drain?.dice || !drain.type) return "an attachment's damage that is not typed"
      return [...riders, { kind: "attach", drain: { dice: drain.dice, type: drain.type }, bars: actionId(match[2]) }]
    },
  },
]

// The damage a hit's text opens with, every part of it, typed already (./attack): "6 (1d8 + 2) Piercing damage, or 11
// (2d8 + 2) Piercing damage if the seahorse moved 20+ feet straight toward the target immediately before the hit".
const OPENING = new RegExp(String.raw`^${DAMAGE}(?:,? (?:plus|or) ${DAMAGE}(?: if [^,.]+)?)*`)

/** Whether a stat block's attack has anything typed beyond the damage it deals on a hit: a condition, a save, an escape DC, a later or a charged part. */
export function hasRiders(action: MonsterFeature): boolean {
  if (!action.attack) return false
  if (action.conditions?.length || action.saves?.length || action.escapeDc !== undefined) return true
  return (action.damage ?? []).some((part) => part.timing || (part.appliesWhen && chargeOf(part.appliesWhen)))
}

/**
 * What a stat block's attack does on a hit beyond its damage, read from its text clause by clause. A word the reader
 * does not know leaves the attack's riders unread, with the reason, and so does a reading that differs from the typed
 * conditions, escape DC or save. An attack with nothing beyond its damage has none.
 */
export function readRiders(action: MonsterFeature): Reading {
  const known = READINGS.get(action)
  if (known) return known
  const reading = readAnew(action)
  READINGS.set(action, reading)
  return reading
}

type Reading = { riders: BlockRider[] } | { unread: string }

// Each action's reading, kept: the stat blocks do not change, and attacks are listed often.
const READINGS = new WeakMap<MonsterFeature, Reading>()

function readAnew(action: MonsterFeature): Reading {
  if (!hasRiders(action)) return { riders: [] }
  const text = action.text.replace(/[’‘]/g, "'")
  const hit = text.indexOf("Hit: ")
  if (hit < 0) return { unread: "no Hit: in the text" }
  let rest = text.slice(hit + 5)
  const opening = OPENING.exec(rest)
  if (!opening) return { unread: "a hit that does not open with its damage" }
  rest = rest.slice(opening[0].length)
  let riders: BlockRider[] = []
  while (rest !== "" && rest !== ".") {
    const clause = CLAUSES.flatMap((entry) => {
      const match = entry.pattern.exec(rest)
      return match ? [{ entry, match }] : []
    })[0]
    if (!clause) return { unread: `words left over: "${rest.replace(/^[.,]?\s*/, "").slice(0, 60)}"` }
    const read = clause.entry.read(clause.match, riders, action)
    if (typeof read === "string") return { unread: read }
    riders = read
    rest = rest.slice(clause.match[0].length)
  }
  // The numbers are the typed data's: the reading must give the same conditions, escape DC and save.
  const typed = [...new Set((action.conditions ?? []).map((link) => link.condition))].sort().join(",")
  const given = [...new Set(riders.flatMap((rider) => (rider.kind === "condition" ? rider.conditions : rider.kind === "grapple" ? ["grappled" as const, ...(rider.with ?? [])] : [])))].sort().join(",")
  if (typed !== given) return { unread: `the text gives ${given || "no condition"} where the data types ${typed || "none"}` }
  const grapple = riders.find((rider) => rider.kind === "grapple")
  if ((grapple?.kind === "grapple" ? grapple.escape : undefined) !== action.escapeDc) return { unread: "an escape DC that differs from the typed one" }
  const saved = riders.flatMap((rider) => (rider.kind === "condition" && rider.save ? [rider.save] : []))
  const saves = action.saves ?? []
  if (saved.length !== saves.length || saved.some((save, index) => save.ability !== saves[index]?.ability || save.dc !== saves[index]?.dc)) return { unread: "a save that differs from the typed one" }
  return { riders }
}

/** The feet of a charge a gate's words name, and the size it is limited to: "If the target is a Large or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit". */
export function chargeOf(words: string): { feet: number; size?: Size } | undefined {
  const match = new RegExp(
    String.raw`^(?:If (?:the )?target is (?:a )?${SIZE} or smaller(?: creature)? and|if) the [a-z]+ moved (\d+)\+ feet straight toward (?:it|the target) immediately before the hit$`,
    "i"
  ).exec(words)
  return match ? { feet: Number(match[2]), ...(match[1] ? { size: match[1] as Size } : {}) } : undefined
}

/**
 * How far a move ran straight toward a target up to where it ended, in feet: the last stretch of its path that lies on
 * the line from the target through the end, within half a square of it. A path from (0, 0) through (0, 20) to (0, 40),
 * with the target at (0, 45), ran 40 feet straight at it. One that turned at (0, 20) toward a target at (20, 45) ran
 * only the stretch after the turn.
 */
export function chargedFeet(from: Point, path: readonly Point[], target: Point): number {
  const points = [from, ...path]
  const end = points[points.length - 1]
  const toward = { x: target.x - end.x, y: target.y - end.y }
  const length = Math.hypot(toward.x, toward.y)
  if (!end || length === 0) return 0
  const unit = { x: toward.x / length, y: toward.y / length }
  let feet = 0
  for (let index = points.length - 2; index >= 0; index--) {
    const back = { x: end.x - points[index].x, y: end.y - points[index].y }
    const along = back.x * unit.x + back.y * unit.y
    const aside = Math.abs(back.x * unit.y - back.y * unit.x)
    if (along <= feet || aside > 2.5) break
    feet = along
  }
  return Math.round(feet)
}

/** Whether a target is no larger than a size. */
export const noLargerThan = (target: Roller, size: Size): boolean => SIZES.indexOf(sizeOf(target)) <= SIZES.indexOf(size)

// A creature's type: a hero is a Humanoid, and keeps their type in a Beast's shape. An NPC is its stat block's type.
function creatureTypeOf(character: Roller): string {
  if (character.sheet || character.type !== "npc") return "humanoid"
  return monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK)?.type ?? "humanoid"
}

/** Whether a rider's gate holds for this target as the hit lands, with the feet the attacker charged. */
function gateHolds(gate: Gate | undefined, target: Roller, charged: number): boolean {
  if (!gate) return true
  if (gate.size && !noLargerThan(target, gate.size)) return false
  if (gate.charge !== undefined && charged < gate.charge) return false
  if (gate.notTypes?.includes(creatureTypeOf(target))) return false
  // An elf is a hero of the Elf species, who stays one in a Beast's shape.
  if (gate.notElf && target.sheet?.species === "elf") return false
  return true
}

type Holder = Standing & { id?: string; name?: string; turnEffects?: readonly TurnEffect[] }
/** One in the scene a hold may be on. */
export type RiderHeld = Target & { id: string; name: string; isComplete?: boolean; conditions?: readonly ConditionEntry[] }
type Held = RiderHeld

/** Who holds a creature with a grapple, by id, through which attack: none for one not Grappled by anyone. */
const grappleOn = (character: { conditions?: readonly ConditionEntry[] }) => character.conditions?.find((entry) => entry.id === "grappled" && entry.source)

/** The creatures a holder grapples with one attack, by id. */
const heldWith = (holder: string, attack: string, present: readonly { id?: string; conditions?: readonly ConditionEntry[] }[]) =>
  present.flatMap((other) => (other.conditions?.some((entry) => entry.id === "grappled" && entry.source === holder && entry.attack === attack) && other.id ? [other.id] : []))

/** Whom an attached creature holds: the one bearing its "attached" mark. */
const attachedTo = (holder: string, present: readonly { id?: string; name?: string; turnEffects?: readonly TurnEffect[] }[]) =>
  present.find((other) => other.turnEffects?.some((effect) => effect.id === "attached" && effect.by === holder))

/**
 * Why an attack a stat block's riders bar cannot be made at a target, or none: every part it grapples with is holding
 * another, the attacker is attached and the attack is the one it cannot make while attached, or the target is held by a
 * grapple whose words spare it from this attack.
 */
export function riderBars(
  attacker: Holder,
  target: { id?: string; name?: string; conditions?: readonly ConditionEntry[] },
  attack: Attack,
  present: readonly { id?: string; name?: string; conditions?: readonly ConditionEntry[]; turnEffects?: readonly TurnEffect[] }[]
): string | undefined {
  if (!attacker.id) return undefined
  const name = attacker.name ?? "The attacker"
  for (const rider of attack.riders ?? []) {
    if (rider.kind !== "grapple") continue
    const held = heldWith(attacker.id, attack.id, present)
    if (held.length >= rider.parts && !held.includes(target.id ?? ""))
      return `${name}'s ${attack.name} is holding ${held.map((id) => present.find((other) => other.id === id)?.name ?? id).join(" and ")}, and cannot strike another.`
  }
  for (const own of attacksOf(attacker)) {
    for (const rider of own.riders ?? []) {
      if (rider.kind === "attach" && rider.bars === attack.id && attachedTo(attacker.id, present))
        return `${name} is attached to ${attachedTo(attacker.id, present)?.name ?? "its prey"}, and cannot make ${attack.name} attacks.`
      if (rider.kind === "grapple" && rider.spares === attack.id && heldWith(attacker.id, own.id, present).includes(target.id ?? ""))
        return `${name} holds ${target.name ?? "its target"} in its ${own.name}, and its ${attack.name} cannot reach them.`
    }
  }
  return undefined
}

// A rider's words for the story, with the attacker's and the target's names put in as the facts are written.
const told = (effect: string, save?: CheckResult, took = true): HitRider => ({ id: STAT_BLOCK_RIDER, effect, ...(save ? { save } : {}), took })

/** A stat block rider's words at the end of a hit's facts, with the names put in. */
export const blockRiderWords = (attacker: string, target: string, rider: HitRider): string => ` ${rider.effect.replaceAll("{attacker}", attacker).replaceAll("{target}", target)}`

/**
 * What a stat block's attack does once its damage is dealt (./attack `landBlow`), to a target the blow left up. Each
 * rider whose gate holds falls: its save is rolled, its conditions given for their span, a grapple held while the
 * attacker has a part free, an attachment made. `charged` is the feet the attacker moved straight toward the target
 * immediately before the hit. `present` is everyone in the scene, for who the attacker already holds.
 */
export function blockRidersOnHit<T extends Target>(args: {
  attacker: Holder
  target: T
  attack: Attack
  roll: (sides: number) => number
  present?: readonly Held[]
  charged?: number
}): { target: T; riders: HitRider[]; conditions: ConditionChange[] } {
  let target = args.target
  const riders: HitRider[] = []
  const conditions: ConditionChange[] = []
  const by = args.attacker.id ?? ""
  if (!args.attack.riders?.length || isDown(target) || isDead(target)) return { target, riders, conditions }
  const acted = !!(target as { isComplete?: boolean }).isComplete
  const give = (id: ConditionId, span: ConditionSpan, attack?: string) => {
    const given = withCondition(target, { id, source: by, span, ...(attack ? { attack } : {}) }, { acted })
    if (!given.given) return false
    target = given.character
    conditions.push({ target: target.id ?? "", condition: id })
    return true
  }
  const names = (ids: readonly ConditionId[]) => ids.map(conditionName).join(" and ")
  for (const rider of args.attack.riders) {
    if (rider.kind === "attach") {
      if (target.turnEffects?.some((effect) => effect.id === "attached" && effect.by === by)) continue
      target = { ...target, turnEffects: [...(target.turnEffects ?? []), { id: "attached", by, turns: 2 }] }
      riders.push(told(`{attacker} attaches to {target}, and drains them of ${rider.drain.dice} ${rider.drain.type} damage as each round turns while it holds on.`))
      continue
    }
    if (!gateHolds(rider.gate, target, args.charged ?? 0)) continue
    if (rider.kind === "grapple") {
      if (
        heldWith(
          by,
          args.attack.id,
          (args.present ?? []).filter((other) => other.id !== target.id)
        ).length >= rider.parts
      )
        continue
      if (!give("grappled", "lasting", args.attack.id)) {
        riders.push(told(`{target} cannot be Grappled.`, undefined, false))
        continue
      }
      const also = (rider.with ?? []).filter((id) => give(id, "lasting", args.attack.id))
      riders.push(told(`{target} has the Grappled condition from {attacker} (escape DC ${rider.escape})${also.length ? `, and the ${names(also)} condition until the grapple ends` : ""}.`))
      continue
    }
    if (rider.save) {
      const check = { kind: "save" as const, ability: rider.save.ability }
      const mode = combineModes([...checkModesFrom(target, check), ...saveModesFor(target, check, rider.conditions)].map((source) => source.mode))
      const save = resolveCheck({
        dice: mode === "normal" ? [args.roll(20)] : [args.roll(20), args.roll(20)],
        bonus: checkBonus(target, check) + saveBonusFor(target, check),
        dc: rider.save.dc,
        mode,
        fails: !!saveFailedBy(target, check),
        adds: checkAdds(target, check, args.roll),
      })
      const ability = Object.entries(ABILITIES).find(([, id]) => id === rider.save?.ability)?.[0] ?? rider.save.ability
      if (save.success) {
        riders.push(told(`{target} succeeds on the ${ability} saving throw (${save.total} against DC ${save.dc}) and is not ${names(rider.conditions)}.`, save, false))
        continue
      }
      const given = rider.conditions.filter((id) => give(id, rider.span))
      riders.push(
        told(
          given.length
            ? `{target} fails the ${ability} saving throw (${save.total} against DC ${save.dc}) and has the ${names(given)} condition until the end of their next turn.`
            : `{target} fails the ${ability} saving throw, and cannot be ${names(rider.conditions)}.`,
          save,
          given.length > 0
        )
      )
      continue
    }
    const given = rider.conditions.filter((id) => give(id, rider.span))
    if (given.length) riders.push(told(`{target} has the ${names(given)} condition${rider.conditions.includes("prone") ? "" : " until their next turn is over"}.`))
  }
  return { target, riders, conditions }
}

/** The escape DC of the grapple a creature is held in, and whether checks to escape it have Disadvantage. None for one not Grappled. */
export function escapeFrom(character: Roller & { conditions?: readonly ConditionEntry[] }, present: readonly Roller[]): { dc: number; hinders: boolean; holder: Roller } | undefined {
  const entry = grappleOn(character)
  const holder = entry && present.find((other) => other.id === entry.source)
  if (!entry || !holder) return undefined
  const rider = attacksOf(holder)
    .find((attack) => attack.id === entry.attack)
    ?.riders?.find((each) => each.kind === "grapple")
  if (rider?.kind === "grapple") return { dc: rider.escape, hinders: !!rider.hinders, holder }
  // A grapple by an Unarmed Strike, or one a check put on: 8 plus the grappler's Strength modifier and Proficiency Bonus.
  return { dc: 8 + strengthAndProficiency(holder), hinders: false, holder }
}

function strengthAndProficiency(holder: Roller): number {
  const shape = shapeOf(holder)
  if (holder.sheet && !shape) {
    const derived = deriveSheet(holder.sheet)
    return derived.abilityModifiers.str + derived.proficiencyBonus
  }
  const monster: Monster | undefined = shape ?? monsterById.get(holder.statBlock ?? DEFAULT_STAT_BLOCK)
  return monster ? monster.abilities.str.mod + monster.pb : 0
}

/** A creature freed of what is attached to it: the "attached" mark of the one named ends, or every one. */
export const detached = <T extends { turnEffects?: readonly TurnEffect[] }>(character: T, by?: string): T => {
  const turnEffects = (character.turnEffects ?? []).filter((effect) => effect.id !== "attached" || (by !== undefined && effect.by !== by))
  const { turnEffects: _, ...rest } = character
  return (turnEffects.length ? { ...rest, turnEffects } : rest) as T
}

// Whether a holder still holds: here, up, not Incapacitated, and within the attack's reach of the one held.
function stillHolds(holder: (Holder & { dead?: true; fled?: true }) | undefined, held: Standing, attack: string | undefined): boolean {
  if (!holder || isDead(holder) || hasFled(holder) || isDown(holder) || isIncapacitated(holder)) return false
  const apart = feetBetween(holder, held)
  if (apart === undefined) return true
  const reach = attacksOf(holder).find((entry) => entry.id === attack)?.reach ?? 5
  return attackReach({ distance: apart, reach }) !== "out"
}

/**
 * Everyone with the holds that have ended let go: a grapple whose grappler is down, gone or Incapacitated, or farther
 * from the one held than its attack reaches, and an attachment the same. What lasted until the grapple ends ends with
 * it. Each release in words.
 */
export function releasedHolds<T extends Held & { dead?: true; fled?: true }>(characters: readonly T[]): { characters: T[]; facts: { character: string; text: string }[] } {
  const facts: { character: string; text: string }[] = []
  const out = characters.map((character) => {
    let now = character
    const entry = grappleOn(now)
    const holder = entry && characters.find((other) => other.id === entry.source)
    if (entry && !stillHolds(holder, now, entry.attack)) {
      now = withoutCondition(now, "grappled").character
      facts.push({ character: now.id, text: `${now.name} is no longer Grappled${holder ? ` by ${holder.name}` : ""}.` })
    }
    for (const effect of now.turnEffects ?? []) {
      if (effect.id !== "attached") continue
      const attacher = characters.find((other) => other.id === effect.by)
      if (stillHolds(attacher, now, attachingAttack(attacher)?.id)) continue
      now = detached(now, effect.by)
      facts.push({ character: now.id, text: `${attacher?.name ?? "The creature"} is no longer attached to ${now.name}.` })
    }
    return now
  })
  return { characters: out, facts }
}

// The attack a creature attaches with, and its rider.
function attachingAttack(holder: Roller | undefined): (Attack & { drain: { dice: string; type: DamageTypeId } }) | undefined {
  if (!holder) return undefined
  for (const attack of attacksOf(holder)) for (const rider of attack.riders ?? []) if (rider.kind === "attach") return { ...attack, drain: rider.drain }
  return undefined
}

/**
 * What a stat block's holds do as one round gives way to the next (./spell-rounds `roundTurns`): the holds that have
 * ended let go, and each creature still attached drains the one it holds, at the start of its own turn, and holds on
 * through the round to come. `roll` throws each damage die. Everyone comes back as it left them, with each fact about
 * the one it is about, under the attack's name.
 */
export function ridersAtRoundEnd<T extends Held & { dead?: true; fled?: true; position?: Point }>(args: {
  characters: readonly T[]
  roll: (sides: number) => number
  rules?: DeathRules
}): { characters: T[]; told: { character: string; spell: string; text: string }[] } {
  const released = releasedHolds(args.characters)
  let characters = released.characters
  const told = released.facts.map((fact) => ({ ...fact, spell: "Released" }))
  for (const was of characters) {
    for (const effect of was.turnEffects ?? []) {
      if (effect.id !== "attached") continue
      const attacker = characters.find((other) => other.id === effect.by)
      const attack = attachingAttack(attacker)
      const target = characters.find((other) => other.id === was.id)
      if (!attacker || !attack || !target || isDead(target)) continue
      const rolled = rollDamage([{ dice: attack.drain.dice, type: attack.drain.type }], args.roll)
      const defenses = defensesOf(target)
      const amount = damageTaken(rolled, defenses)
      const hurt = afterHarm(withDamage(target, amount, { rules: args.rules, types: typesTaken(rolled, defenses) }).character)
      const renewed = { ...hurt, turnEffects: (hurt.turnEffects ?? []).map((each) => (each.id === "attached" && each.by === attacker.id ? { ...each, turns: 2 } : each)) }
      characters = characters.map((character) => (character.id === was.id ? renewed : character))
      const after = hitPointsOf(renewed)
      const standing = isDead(renewed) ? ` ${renewed.name} dies.` : after ? ` ${renewed.name} has ${after.current} of ${after.maximum} hit points.` : ""
      told.push({ character: was.id, spell: attack.name, text: `${attacker.name}'s ${attack.name} drains ${was.name} for ${amount} ${attack.drain.type} damage.${standing}` })
    }
  }
  return { characters, told }
}

/** Each stat block's attacks with something beyond their damage, as `readRiders` reads them: for the count of what runs. */
export const riderReadings = (monster: Monster): { action: string; read: ReturnType<typeof readRiders> }[] =>
  (monster.actions ?? []).flatMap((action) => (hasRiders(action) ? [{ action: action.name, read: readRiders(action) }] : []))
