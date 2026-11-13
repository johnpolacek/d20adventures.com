import { type AbilityId, type ConditionId, conditionIds } from "@d20/srd"
import { conditionById } from "@d20/srd/conditions"
import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import { blockOf } from "./blocks"
import type { Check } from "./check"
import { CONDITION_SPANS, type ConditionEntry, type ConditionSpan } from "./condition-entry"
import { itemConditionImmunities } from "./item-effects"
import { featureImmunities } from "./late-rules"
import { packTacticsModes } from "./monster-traits"
import type { Sheet } from "./sheet"
import type { Side as Mark } from "./sides"
import type { Point } from "./space"
import { d20PenaltyFromSpells, shutOutBySpell, spellImmunities, stillBySpell } from "./spell-effects"
import type { SpellEffect } from "./turn-effect"

type Side = "advantage" | "disadvantage"

/**
 * What a condition does to rolls, typed from the SRD's text. Rules that turn on distance are told whether the attacker
 * is within 5 feet (`isNear` in ./space).
 */
type ConditionRules = {
  /** Conditions the bearer has with it: Paralyzed carries Incapacitated. */
  includes?: readonly ConditionId[]
  /** The bearer's own attack rolls. */
  attacks?: Side
  /** Attack rolls against the bearer, or one side for an attacker within 5 feet and another from farther. */
  attacked?: Side | { near: Side; far: Side }
  /** The bearer's own ability checks. */
  checks?: Side
  /** The bearer's saving throws: those failed outright, and those rolled with Disadvantage. */
  saves?: { fail?: readonly AbilityId[]; disadvantage?: readonly AbilityId[] }
  /** A hit on the bearer from within 5 feet is a Critical Hit. */
  criticalWhenHitNear?: true
  /** The bearer's Speed is 0, so one who is Prone cannot stand. */
  speedZero?: true
  /** Resistance to all damage. */
  resistsAllDamage?: true
  /** Conditions the bearer cannot be given while they have this one. */
  immuneTo?: readonly ConditionId[]
  /**
   * How who it comes from narrows it. "in-sight": it holds while the source is here and up. "others": it bears on
   * attacks against anyone but the source. "source": the bearer cannot attack the source.
   */
  source?: "in-sight" | "others" | "source"
  /** How long it lasts when the game master names no span. */
  span: ConditionSpan
  /** Ends when the bearer stands, at the start of their own turn, whatever span is named. One who cannot stand keeps it. */
  stands?: true
  /** Ends when the story moves on to another encounter. The rest stay until their time runs out or something ends them. */
  passes: boolean
}

const STRENGTH_AND_DEXTERITY = ["str", "dex"] as const

export const CONDITION_RULES: Record<ConditionId, ConditionRules> = {
  blinded: { attacks: "disadvantage", attacked: "advantage", span: "turn", passes: true },
  charmed: { source: "source", span: "lasting", passes: true },
  deafened: { span: "turn", passes: true },
  exhaustion: { span: "lasting", passes: false },
  frightened: { attacks: "disadvantage", checks: "disadvantage", source: "in-sight", span: "turn", passes: true },
  grappled: { attacks: "disadvantage", source: "others", speedZero: true, span: "lasting", passes: true },
  incapacitated: { span: "turn", passes: true },
  invisible: { attacks: "advantage", attacked: "disadvantage", span: "lasting", passes: true },
  paralyzed: { includes: ["incapacitated"], attacked: "advantage", saves: { fail: STRENGTH_AND_DEXTERITY }, criticalWhenHitNear: true, speedZero: true, span: "turn", passes: true },
  petrified: {
    includes: ["incapacitated"],
    attacked: "advantage",
    saves: { fail: STRENGTH_AND_DEXTERITY },
    speedZero: true,
    resistsAllDamage: true,
    immuneTo: ["poisoned"],
    span: "lasting",
    passes: false,
  },
  poisoned: { attacks: "disadvantage", checks: "disadvantage", span: "lasting", passes: false },
  prone: { attacks: "disadvantage", attacked: { near: "advantage", far: "disadvantage" }, span: "turn", stands: true, passes: true },
  restrained: { attacks: "disadvantage", attacked: "advantage", saves: { disadvantage: ["dex"] }, speedZero: true, span: "lasting", passes: true },
  stunned: { includes: ["incapacitated"], attacked: "advantage", saves: { fail: STRENGTH_AND_DEXTERITY }, span: "turn", passes: true },
  unconscious: {
    includes: ["incapacitated", "prone"],
    attacked: "advantage",
    saves: { fail: STRENGTH_AND_DEXTERITY },
    criticalWhenHitNear: true,
    speedZero: true,
    span: "turn",
    passes: true,
  },
}

/** What the engine reads of anyone who may bear a condition. */
export type Afflicted = {
  id?: string
  name?: string
  type?: string
  /** An NPC's side in the encounter, when it is marked (./sides). */
  side?: Mark
  statBlock?: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  conditions?: readonly ConditionEntry[]
  spellEffects?: readonly SpellEffect[]
  /** Whether they have taken their turn this round. */
  isComplete?: boolean
  /** A hero's rules sheet: one who has it carries no stat block's traits (./monster-traits). */
  sheet?: Sheet
  /** Where they stand, for the rules that read who is beside whom: Pack Tactics. */
  position?: Point
}

export const conditionName = (id: ConditionId): string => conditionById.get(id)?.name ?? id

/** One who cannot move: down, unable to act, or with a Speed of 0. They cannot stand from Prone, and get nothing from the Dodge action. */
export const cannotMove = (character: Afflicted): boolean =>
  isDown(character) || isIncapacitated(character) || (character.conditions ?? []).some((entry) => CONDITION_RULES[entry.id].speedZero) || stillBySpell(character)

// Whether a stored condition still holds. One that ends on standing is over once its bearer's own turn has begun: it
// has one turn left and they have acted this round, or they are acting now. One who cannot stand keeps it.
function holds(character: Afflicted, entry: ConditionEntry, acting: boolean): boolean {
  if (!CONDITION_RULES[entry.id].stands || cannotMove(character)) return true
  return !acting && ((entry.turns ?? 1) > 1 || !character.isComplete)
}

// Every condition a character has, each once: those stored, Unconscious at 0 hit points, and those they carry.
// `acting` reads them as their own turn begins.
function borne(character: Afflicted, acting = false): { id: ConditionId; source?: string }[] {
  const found = new Map<ConditionId, { id: ConditionId; source?: string }>()
  const add = (id: ConditionId, source?: string) => {
    if (!found.has(id)) found.set(id, { id, ...(source ? { source } : {}) })
    for (const carried of CONDITION_RULES[id].includes ?? []) add(carried)
  }
  for (const entry of character.conditions ?? []) if (holds(character, entry, acting)) add(entry.id, entry.source)
  if (isDown(character) && !isDead(character)) add("unconscious")
  return conditionIds.flatMap((id) => found.get(id) ?? [])
}

/** The conditions a character has now: those it bears, Unconscious at 0 hit points, and the ones those carry with them. */
export const conditionsOf = (character: Afflicted): ConditionId[] => borne(character).map((entry) => entry.id)

export const hasCondition = (character: Afflicted, id: ConditionId): boolean => conditionsOf(character).includes(id)

/** A character's Exhaustion level, 0 to 6. */
export const exhaustionOf = (character: Afflicted): number => character.conditions?.find((entry) => entry.id === "exhaustion")?.level ?? 0

/** What Exhaustion takes off every d20 a character rolls, 2 for each level, and a spell's penalty to D20 Tests (Raise Dead's). */
export const d20Penalty = (character: Afflicted): number => 2 * exhaustionOf(character) + d20PenaltyFromSpells(character)

/** A character's conditions in words, for the game master and the screen: "Prone, Poisoned, Exhaustion 2". */
export function conditionWords(character: Afflicted): string {
  return conditionsOf(character)
    .map((id) => (id === "exhaustion" ? `${conditionName(id)} ${exhaustionOf(character)}` : conditionName(id)))
    .join(", ")
}

// Whether the one a condition comes from still bears on the bearer: here, up and not fled. A condition that names no
// source, or a scene the engine is not shown, always counts.
function sourceHere(source: string | undefined, present: readonly Afflicted[] | undefined): boolean {
  if (!source || !present) return true
  const found = present.find((other) => other.id === source)
  return !!found && !isDown(found) && !hasFled(found)
}

export type ModeSource = { mode: Side; from: string }

/**
 * Advantage and Disadvantage a character's conditions put on its own ability check or saving throw, each with the
 * condition it comes from. `present` is everyone in the scene, so fear of someone who is gone does not count, and a
 * condition an aura of one near makes them immune to has no effect (Aura of Courage). The roll is made on the
 * character's own turn, so one who was Prone has stood.
 */
export function checkModesFrom(character: Afflicted, check: Check, present?: readonly Afflicted[]): ModeSource[] {
  const found: ModeSource[] = []
  const shut = present ? featureImmunities(character, present) : []
  for (const entry of borne(character, true)) {
    const rules = CONDITION_RULES[entry.id]
    if (shut.includes(entry.id)) continue
    if (rules.source === "in-sight" && !sourceHere(entry.source, present)) continue
    if (check.kind !== "save" && rules.checks) found.push({ mode: rules.checks, from: conditionName(entry.id) })
    if (check.kind === "save" && rules.saves?.disadvantage?.includes(check.ability)) found.push({ mode: "disadvantage", from: conditionName(entry.id) })
  }
  return found
}

/** The condition that makes a character fail this saving throw outright, by name, or none. */
export function saveFailedBy(character: Afflicted, check: Check): string | undefined {
  if (check.kind !== "save") return undefined
  const found = borne(character).find((entry) => CONDITION_RULES[entry.id].saves?.fail?.includes(check.ability))
  return found && conditionName(found.id)
}

/**
 * Advantage and Disadvantage the conditions of the attacker and of the one attacked put on an attack roll, each with
 * where it comes from, and the attacker's Pack Tactics (./monster-traits), which reads `present` for an ally beside the
 * target. `near` is whether the attacker is within 5 feet of the target (`isNear` in ./space). The attacker is on their
 * own turn, so one who was Prone has stood.
 */
export function attackModesFrom(attacker: Afflicted, target: Afflicted, near: boolean, present?: readonly Afflicted[]): ModeSource[] {
  const found: ModeSource[] = []
  // A condition an aura of one near makes the attacker immune to has no effect while they are in it (Aura of Courage).
  const shut = present ? featureImmunities(attacker, present) : []
  for (const entry of borne(attacker, true)) {
    const rules = CONDITION_RULES[entry.id]
    if (!rules.attacks || shut.includes(entry.id)) continue
    if (rules.source === "in-sight" && !sourceHere(entry.source, present)) continue
    if (rules.source === "others" && entry.source && entry.source === target.id) continue
    found.push({ mode: rules.attacks, from: conditionName(entry.id) })
  }
  for (const entry of borne(target)) {
    const side = CONDITION_RULES[entry.id].attacked
    if (!side) continue
    found.push({ mode: typeof side === "string" ? side : near ? side.near : side.far, from: `${target.name ?? "Target"} ${conditionName(entry.id)}` })
  }
  found.push(...packTacticsModes(attacker, target, present))
  return found
}

/** Whom a character cannot attack: the one who has them Charmed, unless an aura of one in `present` makes it have no effect (Aura of Devotion). */
export function cannotAttack(attacker: Afflicted, target: Afflicted, present?: readonly Afflicted[]): boolean {
  const shut = present ? featureImmunities(attacker, present) : []
  return (attacker.conditions ?? []).some((entry) => CONDITION_RULES[entry.id].source === "source" && !!entry.source && entry.source === target.id && !shut.includes(entry.id))
}

/** Whether a hit on this target is a Critical Hit whatever the die shows: the target is Paralyzed or Unconscious and the attacker is within 5 feet. */
export const criticalWhenHit = (target: Afflicted, near: boolean): boolean => near && borne(target).some((entry) => CONDITION_RULES[entry.id].criticalWhenHitNear)

/** Whether a target's conditions give it Resistance to all damage. */
export const resistsAllDamage = (target: Afflicted): boolean => borne(target).some((entry) => CONDITION_RULES[entry.id].resistsAllDamage)

/**
 * Whether a character cannot be given a condition: its stat block is immune to it, a condition it bears shuts it out, a
 * spell on it does, a magic item it wears does (a Periapt of Proof against Poison's Poisoned), or a class feature
 * while it lasts (Mindless Rage's Charmed and Frightened), its own or an aura's of one in `present`, everyone in the
 * scene where the caller knows them (Aura of Courage's Frightened).
 */
export function immuneTo(character: Afflicted, id: ConditionId, spell?: string, present?: readonly Afflicted[]): boolean {
  const monster = character.type === "npc" ? blockOf(character) : undefined
  return (
    !!monster?.conditionImmunities?.includes(id) ||
    borne(character).some((entry) => CONDITION_RULES[entry.id].immuneTo?.includes(id)) ||
    spellImmunities(character).includes(id) ||
    shutOutBySpell(character, id, spell) ||
    (!!character.sheet && itemConditionImmunities(character.sheet).includes(id)) ||
    featureImmunities(character, present).includes(id)
  )
}

const without = <T extends Afflicted>(character: T, keep: (entry: ConditionEntry) => boolean): T => {
  const conditions = (character.conditions ?? []).filter(keep)
  const { conditions: _, ...rest } = character
  return (conditions.length ? { ...rest, conditions } : rest) as T
}

/**
 * Give a character a condition. One it is immune to is not given. Exhaustion adds a level each time, and the sixth
 * kills: the caller sees `level` and applies the death. Any other condition is borne once, and a second giving renews
 * it. `span` is how long it lasts, by name, or the condition's usual span. A span is counted in the bearer's own
 * turns, so one who has already acted this round (`acted`) keeps it through their next turn. Prone takes no span: it
 * lasts until the bearer's own turn begins, when they stand. `present` is everyone in the scene, for an aura that
 * makes one near immune (Aura of Courage).
 */
export function withCondition<T extends Afflicted>(
  character: T,
  give: { id: ConditionId; source?: string; span?: ConditionSpan; spell?: string; attack?: string; feature?: string },
  options: { acted?: boolean; present?: readonly Afflicted[] } = {}
): { character: T; given: boolean; level?: number } {
  if (isDead(character) || immuneTo(character, give.id, give.spell, options.present)) return { character, given: false }
  const rules = CONDITION_RULES[give.id]
  const others = (character.conditions ?? []).filter((entry) => entry.id !== give.id)
  if (give.id === "exhaustion") {
    const level = Math.min(6, exhaustionOf(character) + 1)
    return { character: { ...character, conditions: [...others, { id: give.id, level: level as 1 }] }, given: true, level }
  }
  const span = CONDITION_SPANS[rules.stands ? rules.span : (give.span ?? rules.span)]
  const turns = span === undefined ? undefined : span + (options.acted ? 1 : 0)
  const entry: ConditionEntry = {
    id: give.id,
    ...(give.source ? { source: give.source } : {}),
    ...(turns ? { turns } : {}),
    ...(give.spell ? { spell: give.spell } : {}),
    ...(give.attack ? { attack: give.attack } : {}),
    ...(give.feature ? { feature: give.feature } : {}),
  }
  return { character: { ...character, conditions: [...others, entry] }, given: true }
}

/**
 * End a condition a character bears. Exhaustion loses one level. Unconscious at 0 hit points ends only with healing. A
 * grapple a stat block's attack gave ends with what that attack gave until the grapple ends: a crocodile's Restrained.
 */
export function withoutCondition<T extends Afflicted>(character: T, id: ConditionId): { character: T; ended: boolean } {
  const held = character.conditions?.find((entry) => entry.id === id)
  if (!held) return { character, ended: false }
  if (id === "exhaustion" && (held.level ?? 1) > 1) {
    return { character: { ...character, conditions: (character.conditions ?? []).map((entry) => (entry === held ? { ...entry, level: (held.level ?? 1) - 1 } : entry)) }, ended: true }
  }
  const tied = (entry: ConditionEntry) => id === "grappled" && held.attack !== undefined && entry.attack === held.attack && entry.source === held.source
  return { character: without(character, (entry) => entry.id !== id && !tied(entry)), ended: true }
}

/**
 * A character's conditions as a round begins: each with a count of turns loses one, and one that runs out ends. One
 * that ends on standing stays with a bearer who cannot stand.
 */
export function conditionsAtRoundStart<T extends Afflicted>(character: T): T {
  if (!character.conditions?.some((entry) => entry.turns !== undefined)) return character
  const conditions = character.conditions.flatMap((entry): ConditionEntry[] => {
    if (entry.turns === undefined) return [entry]
    if (entry.turns > 1) return [{ ...entry, turns: entry.turns - 1 }]
    return CONDITION_RULES[entry.id].stands && cannotMove(character) ? [entry] : []
  })
  const { conditions: _, ...rest } = character
  return (conditions.length ? { ...rest, conditions } : rest) as T
}

/**
 * A character as the story moves on to another encounter: the conditions of a fight's moment are over, and the lasting
 * ones stay. So does one given by a spell that lasts longer than a minute: Charm Person's hour goes on into the next scene.
 */
export const conditionsAtEncounterEnd = <T extends Afflicted>(character: T): T =>
  character.conditions?.length ? without(character, (entry) => !CONDITION_RULES[entry.id].passes || (entry.spell !== undefined && entry.turns === undefined)) : character
