import type { AbilityId, ConditionId, DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { attackModesFromActions, checkModesFromActions } from "./actions"
import { type AttackResult, type DamagePart, type DamageRoll, damageTaken, defensesOf, resolveAttack, rollDamage } from "./attack"
import { type Check, checkBonus, combineModes, type Roller, type RollMode } from "./check"
import type { ConditionEntry, ConditionSpan } from "./condition-entry"
import { attackModesFrom, checkModesFrom, conditionName, d20Penalty, saveFailedBy, withCondition } from "./conditions"
import { afterHarm, type DeathRules, type DeathSaves, type Fate, withDamage, withHealing } from "./death"
import { deriveSheet } from "./derive"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { combatStatsOf } from "./stat-block"
import type { TurnEffect } from "./turn-effect"

/**
 * Spellcasting by the SRD 5.2.1 rules, as pure functions. A spell's typed data decides what it does: a spell attack
 * against Armor Class, a saving throw each target makes against the caster's spell save DC, damage and healing dice,
 * and the conditions a hit or a failed save gives. Nothing here asks a model.
 */

export type Spellcasting = {
  ability: AbilityId
  /** What a target's saving throw must reach: 8, the Proficiency Bonus and the spellcasting ability modifier. */
  saveDc: number
  /** What is added to the d20 of a spell attack: the Proficiency Bonus and the spellcasting ability modifier. */
  attackBonus: number
  modifier: number
  /** Spell slots by spell level, the first for level 1. */
  slots: number[]
  /** How many cantrips and prepared spells the class gives at this level. */
  cantrips: number
  prepared: number
}

/** A hero's spellcasting, from its class and level. A class with no Spellcasting feature, and a hero with no sheet, has none. */
export function spellcastingOf(character: Roller): Spellcasting | undefined {
  const sheet = character.sheet
  const cls = sheet && classById.get(sheet.class)
  if (!sheet || !cls?.spellcasting) return undefined
  const derived = deriveSheet(sheet)
  const row = cls.levels[sheet.level - 1]
  const modifier = derived.abilityModifiers[cls.spellcasting.ability]
  return {
    ability: cls.spellcasting.ability,
    saveDc: 8 + derived.proficiencyBonus + modifier,
    attackBonus: derived.proficiencyBonus + modifier,
    modifier,
    slots: [...(row?.spellSlots ?? [])],
    cantrips: row?.cantrips ?? 0,
    prepared: row?.preparedSpells ?? 0,
  }
}

/** The spells on a class's list up to a spell level, by id. */
export function classSpells(classId: string, upToLevel: number): string[] {
  return (classById.get(classId)?.spellcasting?.spellList ?? []).filter((entry) => entry.level <= upToLevel).flatMap((entry) => entry.spells)
}

/**
 * Whether the engine resolves a spell: it has an attack, a save, damage, healing, a condition, a roll modifier or an
 * Armor Class. Any other is a utility spell, which the engine only checks and spends, and the game master tells.
 */
export const isEngineSpell = (spell: Spell): boolean =>
  !!(spell.attack || spell.saves || spell.damage || spell.healing || spell.conditions || spell.rollModifier || spell.ac || spell.damageReduction || spell.hitPointMaximum)

/**
 * How many creatures a spell takes. An area takes as many as its size allows until stage 6 of plans/srd-rules.md gives
 * positions: a cone one for each 10 feet, a cube one for each 5 feet of its side, a sphere, cylinder or emanation one
 * for each 5 feet of its radius, a line one for each 30 feet, each rounded up. Magic Missile takes one for each dart.
 * Any other spell takes one.
 */
export function targetLimit(spell: Spell): number {
  const area = spell.range.area
  if (area) return Math.max(1, Math.ceil(area.size / (area.shape === "cone" ? 10 : area.shape === "line" ? 30 : 5)))
  return spell.projectiles?.count ?? 1
}

/** A spell a character can cast, and how. */
export type KnownSpell = {
  spell: Spell
  /** A cantrip: cast at will, with no slot. */
  cantrip: boolean
  /** Prepared, so castable with a slot of its level. A Wizard's Ritual spells in the book that are not prepared are not. */
  prepared: boolean
  /** Castable as a Ritual, with no slot, when there is time for it. */
  ritual: boolean
  /** Casts left that a feature gives with no slot: a Ranger's Hunter's Mark from Favored Enemy. */
  free: number
}

type Slotted = Roller & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

/**
 * The spells a hero can cast, from the sheet: the cantrips known, the spells prepared, and for a Wizard the Ritual
 * spells of the spellbook. A hero with no sheet, and an NPC, has none here.
 */
export function spellsOf(character: Slotted): KnownSpell[] {
  const sheet = character.sheet
  if (!sheet) return []
  const derived = deriveSheet(sheet)
  const cls = classById.get(sheet.class)
  const row = cls?.levels[sheet.level - 1] as Record<string, unknown> | undefined
  // Casts a feature gives with no slot, by spell: as many as the feature's own count, less those used.
  const free = new Map<string, number>()
  for (const id of derived.classFeatures) {
    const feature = classFeatureById.get(id)
    const count = feature?.uses?.count as { column?: string } | number | undefined
    const uses = typeof count === "number" ? count : count?.column ? Number(row?.[count.column] ?? 0) : 0
    for (const cast of feature?.freeCast ?? []) free.set(cast.spell, Math.max(0, uses - (character.featureUses?.[id] ?? 0)))
  }
  const found: KnownSpell[] = []
  const add = (id: string, how: Pick<KnownSpell, "cantrip" | "prepared">) => {
    const spell = spellById.get(id)
    if (spell && !found.some((known) => known.spell.id === id)) found.push({ spell, ...how, ritual: spell.ritual, free: free.get(id) ?? 0 })
  }
  for (const id of derived.cantrips) add(id, { cantrip: true, prepared: true })
  for (const id of derived.preparedSpells) add(id, { cantrip: false, prepared: true })
  if (cls?.spellcasting?.ritualFromSpellbook) for (const id of derived.spellbook) if (spellById.get(id)?.ritual) add(id, { cantrip: false, prepared: false })
  return found
}

/**
 * A character's spells in words, for a prompt that plays or writes them: a hero's cantrips and prepared spells with the
 * slots left, from the sheet. An NPC's magic is the names it is written with, until the game knows its spells.
 */
export function spellWords(character: Slotted & { spells?: readonly { name: string }[] }): string {
  const known = spellsOf(character)
  if (!known.length) return character.sheet ? "" : (character.spells ?? []).map((spell) => spell.name).join(", ")
  const names = (list: KnownSpell[]) => list.map((entry) => entry.spell.name).join(", ")
  const left = slotsLeft(character)
  const parts = [
    known.some((entry) => entry.cantrip) ? `Cantrips, cast at will: ${names(known.filter((entry) => entry.cantrip))}` : "",
    known.some((entry) => !entry.cantrip && entry.prepared) ? `Prepared spells: ${names(known.filter((entry) => !entry.cantrip && entry.prepared))}` : "",
    known.some((entry) => !entry.prepared) ? `Rituals from the spellbook, outside a fight: ${names(known.filter((entry) => !entry.prepared))}` : "",
    left.length ? `Level 1 spell slots left: ${left[0]}` : "",
  ]
  return parts.filter(Boolean).join(". ")
}

/** A hero's spell slots left, by spell level, the first for level 1. */
export function slotsLeft(character: Slotted): number[] {
  return (spellcastingOf(character)?.slots ?? []).map((slots, index) => Math.max(0, slots - (character.spellSlots?.[index] ?? 0)))
}

/** What casting a spell spends: nothing for a cantrip or a Ritual, a feature's free cast, or a slot of the spell's level. */
export type CastCost = { kind: "cantrip" } | { kind: "ritual" } | { kind: "free"; feature: string } | { kind: "slot"; level: number }

/**
 * Whether a hero can cast a spell now, and what it spends. A cantrip is free. A Ritual cast slowly (`ritual`) spends
 * nothing. A feature's free cast is used before a slot. Any other casting needs the spell prepared and a slot of its
 * level left. `problem` says why not, for the game master.
 */
export function castCost(character: Slotted, spellId: string, ritual = false): { cost: CastCost; known: KnownSpell } | { problem: string } {
  const known = spellsOf(character).find((entry) => entry.spell.id === spellId)
  const name = spellById.get(spellId)?.name ?? spellId
  if (!known) return { problem: `${name} is not a spell ${character.name ?? "this character"} can cast.` }
  if (known.cantrip) return { cost: { kind: "cantrip" }, known }
  if (ritual && known.ritual) return { cost: { kind: "ritual" }, known }
  if (!known.prepared) return { problem: `${name} is in the spellbook and not prepared, so it can only be cast as a Ritual.` }
  if (known.free > 0) {
    const sheet = character.sheet
    const feature = sheet && deriveSheet(sheet).classFeatures.find((id) => classFeatureById.get(id)?.freeCast?.some((cast) => cast.spell === spellId))
    if (feature) return { cost: { kind: "free", feature }, known }
  }
  const level = known.spell.level
  if ((slotsLeft(character)[level - 1] ?? 0) < 1) return { problem: `${character.name ?? "This character"} has no level ${level} spell slot left for ${name}.` }
  return { cost: { kind: "slot", level }, known }
}

/** A character with what a casting costs spent. */
export function withCastSpent<T extends Slotted>(character: T, cost: CastCost): T {
  if (cost.kind === "slot") {
    const used = [...(character.spellSlots ?? [])]
    while (used.length < cost.level) used.push(0)
    used[cost.level - 1] += 1
    return { ...character, spellSlots: used }
  }
  if (cost.kind === "free") return { ...character, featureUses: { ...character.featureUses, [cost.feature]: (character.featureUses?.[cost.feature] ?? 0) + 1 } }
  return character
}

/** A character as the story moves on to another encounter: spell slots come back, until stage 7 of plans/srd-rules.md gives rests. */
export function slotsAtEncounterEnd<T extends { spellSlots?: readonly number[] }>(character: T): T {
  if (!character.spellSlots) return character
  const { spellSlots: _, ...rest } = character
  return rest as T
}

/** A saving throw a target made against a spell, as it fell. */
export type SaveRoll = { target: string; ability: AbilityId; dice: number[]; natural: number; bonus: number; total: number; dc: number; success: boolean; mode: RollMode; failedBy?: string }
/** A spell attack as it fell: the roll, and on a hit the damage dice and what the target lost. */
export type SpellAttack = { target: string; roll: AttackResult; damage?: DamageRoll; taken: number; fate?: Fate }

type Castee = Roller & {
  id: string
  name: string
  type: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  deathSaves?: DeathSaves
  conditions?: readonly ConditionEntry[]
  turnEffects?: readonly TurnEffect[]
  isComplete?: boolean
}

export type Cast<T> = { characters: T[]; attack?: SpellAttack; saves: SaveRoll[]; harm: Harm[]; conditions: ConditionChange[]; facts: string[] }

// A cantrip's damage dice at the caster's level: the printed step at levels 5, 11 and 17.
function cantripDice(part: { dice?: string; cantrip?: Record<"5" | "11" | "17", string> }, level: number): string | undefined {
  if (!part.cantrip) return part.dice
  return level >= 17 ? part.cantrip[17] : level >= 11 ? part.cantrip[11] : level >= 5 ? part.cantrip[5] : part.dice
}

// How long a spell's condition lasts, by name: a round is the bearer's next turn, a minute the rest of a fight.
function spanOf(spell: Spell): ConditionSpan | undefined {
  const { duration } = spell
  if (duration.kind !== "timed") return duration.kind === "instantaneous" ? undefined : "lasting"
  if (duration.unit === "round") return (duration.amount ?? 1) <= 1 ? "turn" : "minute"
  return duration.unit === "minute" && (duration.amount ?? 1) <= 1 ? "minute" : "lasting"
}

// How a character stands after a spell's harm, in words for the game master.
function standing(character: Castee, fate: Fate | undefined): string {
  if (fate === "dies") return `${character.name} dies.`
  if (fate === "killed") return `${character.name} is killed outright.`
  if (fate === "stable") return `${character.name} is Unconscious and Stable, out of the fight.`
  if (fate === "dying") return `${character.name} is at 0 hit points, Unconscious and dying.`
  const hitPoints = hitPointsOf(character)
  return hitPoints ? `${character.name} has ${hitPoints.current} of ${hitPoints.maximum} hit points${hitPoints.current * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.` : ""
}

/**
 * Cast a spell at its level, on the targets named. Everyone comes back as it left them, with each roll as it fell and
 * what happened in words for the game master, who tells it and never changes it.
 *
 * A spell attack is rolled against the first target's Armor Class: `attackDice` are the d20s thrown for it and `mode`
 * the roll's Advantage or Disadvantage. A 20 on the die is a Critical Hit, which doubles the damage dice. Each target
 * makes the spell's saving throw against the caster's spell save DC with a d20 from `d20`. The damage a save guards is
 * rolled once for all of them: full on a failure, and half or none on a success as the spell says. Magic Missile's
 * darts each roll their own dice and fall on the targets in turn. Healing adds the spellcasting ability modifier where
 * the spell says so. A condition tied to a hit or a failed save is given with the caster as its source. What the spell
 * does later, on a turn's start or while it lasts, is not dealt here.
 */
export function castSpell<T extends Castee>(args: {
  characters: readonly T[]
  casterId: string
  spell: Spell
  targets: readonly string[]
  attackDice?: readonly number[]
  mode?: RollMode
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
  /** For a spell that deals one of several damage types, the one chosen. The first printed, when none is. */
  damageType?: DamageTypeId
}): Cast<T> {
  const { spell } = args
  let characters = [...args.characters]
  const caster = characters.find((character) => character.id === args.casterId)
  const casting = caster && spellcastingOf(caster)
  if (!caster || !casting) throw new Error(`${caster?.name ?? "This character"} cannot cast spells.`)
  const level = caster.sheet?.level ?? 1
  const find = (id: string) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const targets = [...new Set(args.targets)].filter((id) => find(id)).slice(0, targetLimit(spell))
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const typeOf = (types: readonly DamageTypeId[]) => (args.damageType && types.includes(args.damageType) ? args.damageType : types[0])
  const now = (part: { timing?: string; appliesWhen?: string; unless?: string }) => !part.timing && !part.appliesWhen
  const partOf = (entry: NonNullable<Spell["damage"]>[number]): DamagePart => {
    const dice = cantripDice(entry, level)
    return { ...(dice ? { dice } : { amount: entry.amount }), type: typeOf(entry.types) }
  }
  // Damage to one target, through its defenses and the rules of 0 hit points.
  const hurt = (id: string, rolled: DamageRoll, amountOf: (taken: number) => number, critical = false) => {
    const target = find(id)
    if (!target) return undefined
    const amount = amountOf(damageTaken(rolled, defensesOf(target)))
    const struck = withDamage(target, amount, { critical, rules: args.rules })
    put(afterHarm(struck.character))
    const [part] = rolled.parts
    harm.push({
      target: id,
      kind: "damage",
      dice: rolled.parts.flatMap((each) => each.dice),
      sides: part?.sides,
      bonus: rolled.parts.reduce((sum, each) => sum + each.bonus, 0),
      type: part?.type,
      amount,
    })
    return { amount, fate: struck.fate, type: part?.type ?? "" }
  }
  const give = (id: string, condition: ConditionId) => {
    const target = find(id)
    if (!target) return
    const given = withCondition(target, { id: condition, source: caster.id, span: spanOf(spell) }, { acted: !!target.isComplete })
    if (!given.given) {
      facts.push(`${target.name} cannot be ${conditionName(condition)} and is not.`)
      return
    }
    put(afterHarm(given.character))
    conditions.push({ target: id, condition })
    facts.push(`${target.name} is now ${conditionName(condition)}.`)
  }

  // The spell attack, on the first target.
  let attack: SpellAttack | undefined
  if (spell.attack && targets[0]) {
    const target = find(targets[0]) as T
    const armorClass = combatStatsOf(target)?.armorClass
    if (armorClass === undefined) throw new Error(`${target.name} has no sheet or stat block to attack.`)
    const mode = args.mode ?? "normal"
    const dice = [...(args.attackDice ?? [])]
    while (dice.length < (mode === "normal" ? 1 : 2)) dice.push(args.d20())
    const roll = resolveAttack({ dice, bonus: casting.attackBonus - d20Penalty(caster), armorClass, mode })
    attack = { target: target.id, roll, taken: 0 }
    if (roll.hit) {
      const parts = (spell.damage ?? []).filter((entry) => now(entry) && entry.trigger === "hit").map(partOf)
      if (parts.length) {
        const rolled = rollDamage(parts, args.roll, roll.critical)
        const done = hurt(target.id, rolled, (taken) => taken, roll.critical)
        attack = { ...attack, damage: rolled, taken: done?.amount ?? 0, ...(done?.fate ? { fate: done.fate } : {}) }
      }
      const after = find(target.id) as T
      facts.push(
        `${caster.name}'s ${spell.name} ${roll.critical ? "is a CRITICAL HIT on" : "HITS"} ${target.name} (${roll.total} against Armor Class ${armorClass}) for ${attack.taken} ${attack.damage?.parts[0]?.type ?? ""} damage. ${standing(after, attack.fate)}`.replace(
          "  ",
          " "
        )
      )
      for (const link of spell.conditions ?? []) if (now(link) && link.trigger === "hit") give(target.id, link.condition)
    } else facts.push(`${caster.name}'s ${spell.name} MISSES ${target.name} (${roll.total} against Armor Class ${armorClass}). ${target.name} takes no damage.`)
  }

  // Each saving throw the spell calls for as it takes effect, made by every target.
  for (const [index, save] of (spell.saves ?? []).entries()) {
    if (save.when !== "initial") continue
    const check: Check = { kind: "save", ability: save.ability }
    const guarded = (spell.damage ?? []).filter((entry) => now(entry) && entry.trigger === "failed-save" && entry.save === index)
    const rolled = guarded.length ? rollDamage(guarded.map(partOf), args.roll) : undefined
    const half = guarded.some((entry) => (entry.onSuccess ?? save.onSuccess) === "half")
    for (const id of targets) {
      const target = find(id)
      if (!target || target.dead) continue
      const failedBy = saveFailedBy(target, check)
      const sources = [...checkModesFrom(target, check, characters), ...checkModesFromActions(target, check, characters)]
      const mode = combineModes(sources.map((source) => source.mode))
      const dice = Array.from({ length: mode === "normal" ? 1 : 2 }, () => args.d20())
      const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
      const bonus = checkBonus(target, check)
      const total = natural + bonus
      const success = !failedBy && total >= casting.saveDc
      saves.push({ target: id, ability: save.ability, dice, natural, bonus, total, dc: casting.saveDc, success, mode, ...(failedBy ? { failedBy } : {}) })
      const verdict = `${target.name} ${success ? "SUCCEEDS on" : "FAILS"} the saving throw against ${caster.name}'s ${spell.name} (${total} against DC ${casting.saveDc})`
      if (rolled && (!success || half)) {
        const done = hurt(id, rolled, (taken) => (success ? Math.floor(taken / 2) : taken))
        facts.push(`${verdict} and takes ${done?.amount ?? 0} ${done?.type ?? ""} damage. ${standing(find(id) as T, done?.fate)}`.replace("  ", " "))
      } else facts.push(`${verdict}${rolled ? " and takes no damage" : ""}.`)
      if (!success) for (const link of spell.conditions ?? []) if (now(link) && link.trigger === "failed-save" && link.save === index) give(id, link.condition)
    }
  }

  // Damage that needs no roll to land. Magic Missile's darts each roll their own dice and fall on the targets in turn.
  const sure = spell.attack ? [] : (spell.damage ?? []).filter((entry) => now(entry) && !entry.trigger)
  if (sure.length && targets.length) {
    const darts = spell.projectiles?.count
    const falls = darts ? Array.from({ length: darts }, (_, index) => targets[index % targets.length]) : targets
    const lost = new Map<string, { amount: number; fate?: Fate; type: string }>()
    for (const id of falls) {
      const done = hurt(id, rollDamage(sure.map(partOf), args.roll), (taken) => taken)
      if (done) lost.set(id, { amount: (lost.get(id)?.amount ?? 0) + done.amount, fate: done.fate, type: done.type })
    }
    for (const [id, done] of lost) facts.push(`${caster.name}'s ${spell.name} strikes ${find(id)?.name} for ${done.amount} ${done.type} damage. ${standing(find(id) as T, done.fate)}`)
  }

  // Healing as the spell takes effect. Temporary hit points and healing that comes later are not dealt here.
  const healing = spell.healing
  if (healing && now(healing) && !healing.temporary) {
    for (const id of targets) {
      const target = find(id)
      if (!target || target.dead) continue
      const rolled = healing.dice ? rollDamage([{ dice: healing.dice, type: "force" }], args.roll) : undefined
      const bonus = (rolled?.parts[0]?.bonus ?? 0) + (healing.modifier ? casting.modifier : 0)
      const amount = Math.max(0, (rolled?.parts[0]?.dice.reduce((sum, die) => sum + die, 0) ?? healing.amount ?? 0) + bonus)
      const healed = withHealing(target, amount)
      put(healed)
      harm.push({ target: id, kind: "healing", dice: rolled?.parts[0]?.dice ?? [], sides: rolled?.parts[0]?.sides, bonus, amount })
      facts.push(`${target.name} regains ${amount} hit points. ${standing(healed, undefined)}`)
    }
  }

  // A condition the spell gives with no roll, as it takes effect.
  for (const link of spell.conditions ?? []) {
    if (!now(link) || link.trigger) continue
    for (const id of link.target === "caster" ? [caster.id] : targets) give(id, link.condition)
  }

  return { characters, ...(attack ? { attack } : {}), saves, harm, conditions, facts }
}

/** The modes that fall on a spell attack from the conditions and actions of the caster and the target. */
type Bearer = Parameters<typeof attackModesFrom>[0] & Parameters<typeof attackModesFromActions>[0]
export function spellAttackModes(caster: Bearer, target: Bearer, spell: Spell, present?: readonly Bearer[]) {
  return [...attackModesFrom(caster, target, spell.attack ?? "ranged", present), ...attackModesFromActions(caster, target, present)]
}

export { spellById }
