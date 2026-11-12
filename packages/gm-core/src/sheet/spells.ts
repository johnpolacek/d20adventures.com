import type { AbilityId, ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { monsterById } from "@d20/srd/monsters"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { attackModesFromActions, checkModesFromActions } from "./actions"
import { type AttackResult, type DamagePart, type DamageRoll, damageTaken, defensesOf, resolveAttack, rollDamage } from "./attack"
import { type Check, checkBonus, combineModes, type Roller, type RollMode } from "./check"
import { classCheckModes } from "./class-rules"
import { CONDITION_SPANS, type ConditionEntry, type ConditionSpan } from "./condition-entry"
import { attackModesFrom, checkModesFrom, conditionName, d20Penalty, saveFailedBy, withCondition } from "./conditions"
import { afterHarm, type DeathRules, type DeathSaves, enduredWords, type Fate, revived, withDamage, withHealing } from "./death"
import { deriveSheet, featuresOf, slotsAt } from "./derive"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { magicSaveModes, typesTaken } from "./monster-traits"
import { type Cover, coverBonus, isNear } from "./space"
import { speciesSaveModes } from "./species-traits"
import {
  CASTER_HELD,
  healsMost,
  lasts,
  mirrorImage,
  type RollAdd,
  rollAdds,
  saveBonusFromSpells,
  saveModesFromSpells,
  spellEnded,
  turnsMagicMissile,
  withConcentration,
  withSpellEffect,
} from "./spell-effects"
import { endsBySpell } from "./spell-ends"
import { combatStatsOf, DEFAULT_STAT_BLOCK } from "./stat-block"
import type { Concentration, SpellEffect, TurnEffect } from "./turn-effect"

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
  /** Spell slots by spell level, the first for level 1. A Warlock's Pact Magic slots are all at their one level (./derive slotsAt). */
  slots: number[]
  /** How many cantrips and prepared spells the class gives at this level. */
  cantrips: number
  prepared: number
}

// An NPC's stat block, and its Spellcasting action if it has one.
function statBlockCasting(character: Roller) {
  const monster = !character.sheet && character.type === "npc" ? monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) : undefined
  const casting = monster?.actions?.find((action) => action.spellcasting?.ability)?.spellcasting
  return monster && casting?.ability ? { monster, casting, ability: casting.ability } : undefined
}

/**
 * A character's spellcasting. A hero's comes from its class and level. An NPC's comes from the Spellcasting action of
 * its stat block: the save DC and attack bonus it prints, or 8 and its Proficiency Bonus with the ability's modifier.
 * A class or a stat block with no Spellcasting, and a hero with no sheet, has none.
 */
export function spellcastingOf(character: Roller): Spellcasting | undefined {
  const block = statBlockCasting(character)
  if (block) {
    const modifier = block.monster.abilities[block.ability].mod
    const saveDc = block.casting.saveDc ?? 8 + block.monster.pb + modifier
    return { ability: block.ability, saveDc, attackBonus: block.casting.attackBonus ?? saveDc - 8, modifier, slots: [], cantrips: 0, prepared: 0 }
  }
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
    slots: slotsAt(cls, sheet.level),
    cantrips: row?.cantrips ?? 0,
    prepared: row?.preparedSpells ?? 0,
  }
}

/**
 * The spellcasting a character casts one spell with: their class's, or for a spell a feat gave them (Magic Initiate)
 * the ability that feat names, with the Proficiency Bonus, for its save DC and attack bonus. A Fighter with Magic
 * Initiate (Wizard) and Intelligence 10 casts its spells at DC 10 and +2.
 */
export function spellcastingFor(character: Slotted, spellId: string): Spellcasting | undefined {
  const own = spellcastingOf(character)
  const ability = spellsOf(character).find((known) => known.spell.id === spellId)?.ability
  if (!ability || !character.sheet) return own
  const derived = deriveSheet(character.sheet)
  const modifier = derived.abilityModifiers[ability]
  return {
    ability,
    saveDc: 8 + derived.proficiencyBonus + modifier,
    attackBonus: derived.proficiencyBonus + modifier,
    modifier,
    slots: own?.slots ?? [],
    cantrips: own?.cantrips ?? 0,
    prepared: own?.prepared ?? 0,
  }
}

/** The spells on a class's list up to a spell level, by id. */
export function classSpells(classId: string, upToLevel: number): string[] {
  return (classById.get(classId)?.spellcasting?.spellList ?? []).filter((entry) => entry.level <= upToLevel).flatMap((entry) => entry.spells)
}

/**
 * Spells of levels 2 and 3 whose typed effects the engine does not run at all yet: what they do turns on a choice the
 * read does not carry, a creature or a thing the engine does not keep (a wall, a sphere, a pack of spirits, a glyph), a
 * place it cannot measure, or a thing it has no rule for (flight, sight, speech). Cast, the engine spends what they cost
 * and holds their Concentration, and the game master tells them from their text.
 */
const TOLD = new Set([
  "alter-self",
  "animal-messenger",
  "calm-emotions",
  "detect-thoughts",
  "dragons-breath",
  "enlarge-reduce",
  "flaming-sphere",
  "gust-of-wind",
  "levitate",
  "silence",
  "spike-growth",
  "zone-of-truth",
  "conjure-animals",
  "glyph-of-warding",
  "magic-circle",
  "meld-into-stone",
])

/**
 * Spells the engine runs in part. It rolls and applies what its rules hold, and the game master is given the spell's
 * text for the rest, which changes no one's hit points or conditions.
 */
const PARTLY = new Set([
  "enthrall",
  "heat-metal",
  "magic-weapon",
  "pass-without-trace",
  "phantasmal-force",
  "prayer-of-healing",
  "ray-of-enfeeblement",
  "suggestion",
  "warding-bond",
  "web",
  "bestow-curse",
  "fear",
  "haste",
  "hypnotic-pattern",
  "sleet-storm",
  "slow",
  "spirit-guardians",
  "stinking-cloud",
  "wind-wall",
  "beacon-of-hope",
  "remove-curse",
  "dispel-magic",
])

/** Spells with no typed effect that the engine runs by rules it holds from their text (./spell-effects and below). */
const BUILT = new Set(["blur", "mirror-image", "lesser-restoration", "remove-curse", "dispel-magic", "beacon-of-hope"])

/**
 * Whether the engine resolves all a spell does: it has an attack, a save, damage, healing, a condition, a roll modifier
 * or an Armor Class, or a rule held from its text, and none of it is left to the story. Any other is told by the game
 * master from the spell's text: a utility spell, which the engine only checks and spends, or one it runs in part.
 */
export const isEngineSpell = (spell: Spell): boolean =>
  !TOLD.has(spell.id) &&
  !PARTLY.has(spell.id) &&
  !!(BUILT.has(spell.id) || spell.attack || spell.saves || spell.damage || spell.healing || spell.conditions || spell.rollModifier || spell.ac || spell.damageReduction || spell.hitPointMaximum)

/**
 * Whether a spell is cast on a turn, with an action or a Bonus Action. One cast as a Reaction (Shield, Counterspell,
 * Feather Fall) is only cast when its trigger is offered (./reactions, ./counterspell), so it is left off a turn's menu.
 */
export const castableOnTurn = (spell: Spell): boolean => spell.castingTime.unit !== "reaction"

/**
 * How many creatures a spell takes. On a floor an area takes whoever stands in it (./spell-space). Where there is no
 * floor it takes as many as its size allows: a cone one for each 10 feet, a cube one for each 5 feet of its side, a sphere, cylinder or emanation one
 * for each 5 feet of its radius, a line one for each 30 feet, each rounded up. Magic Missile takes one for each dart.
 * Any other spell takes one. Cast with a slot above its level (`slot`), a spell takes the creatures its text adds for
 * each level above (Bless, Charm Person), and Magic Missile its extra darts.
 */
// Spells whose text takes several creatures with no area: the count is in their words alone. Beacon of Hope takes "any
// number", a wall of wind as many as stand along its 50 feet, and Slow "up to six" in its cube.
const SEVERAL: Record<string, number> = { bless: 3, bane: 3, aid: 3, "prayer-of-healing": 5, "mass-healing-word": 6, "beacon-of-hope": 20, "wind-wall": 10, slow: 6 }

export function targetLimit(spell: Spell, slot = spell.level): number {
  const above = Math.max(0, slot - spell.level)
  const area = spell.range.area
  if (area) return Math.min(SEVERAL[spell.id] ?? Number.POSITIVE_INFINITY, Math.max(1, Math.ceil(area.size / (area.shape === "cone" ? 10 : area.shape === "line" ? 30 : 5))))
  if (spell.projectiles) return dartsOf(spell, slot)
  return (SEVERAL[spell.id] ?? 1) + (spell.extraTargetsPerSlot ?? 0) * above
}

/** How many projectiles a spell makes at a slot level: Magic Missile's three, and one more for each level above 1. */
function dartsOf(spell: Spell, slot: number): number {
  return (spell.projectiles?.count ?? 0) + (spell.projectiles?.perSlot ?? 0) * Math.max(0, slot - spell.level)
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
  /** Casts left that take no slot: a Ranger's Hunter's Mark from Favored Enemy, or an NPC's "2/Day" on its stat block. */
  free: number
  /** What those casts are counted under, in the character's `featureUses`. */
  useKey?: string
  /** The slot level an NPC's stat block casts it at, where it prints one: "Fireball (level 4 version)". */
  castLevel?: number
  /** The ability a feat's spell is cast with (Magic Initiate), in place of the class's (`spellcastingFor`). */
  ability?: AbilityId
}

type Slotted = Roller & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

/**
 * The spells a hero can cast, from the sheet: the cantrips known, the spells prepared, for a Wizard the Ritual spells
 * of the spellbook, and each Magic Initiate's two cantrips and its level 1 spell, always prepared, with one cast a Long
 * Rest that takes no slot (counted under `magic-initiate-<list>`), all cast with the ability the feat names. A cantrip
 * the species gives is cast with the sheet's `speciesSpellAbility` where it names one. A hero
 * with no sheet has none. An NPC's are its stat block's.
 */
export function spellsOf(character: Slotted): KnownSpell[] {
  const block = statBlockCasting(character)
  if (block) return statBlockSpells(character, block.monster)
  const sheet = character.sheet
  if (!sheet) return []
  const derived = deriveSheet(sheet)
  const cls = classById.get(sheet.class)
  const row = cls?.levels[sheet.level - 1] as Record<string, unknown> | undefined
  // Casts a feature gives with no slot, by spell: as many as the feature's own count, less those used.
  const free = new Map<string, { left: number; key: string }>()
  for (const id of derived.classFeatures) {
    const feature = classFeatureById.get(id)
    const count = feature?.uses?.count as { column?: string } | number | undefined
    const uses = typeof count === "number" ? count : count?.column ? Number(row?.[count.column] ?? 0) : 0
    for (const cast of feature?.freeCast ?? []) free.set(cast.spell, { left: Math.max(0, uses - (character.featureUses?.[id] ?? 0)), key: id })
  }
  const found: KnownSpell[] = []
  const add = (id: string, how: Pick<KnownSpell, "cantrip" | "prepared" | "ability">) => {
    const spell = spellById.get(id)
    const given = free.get(id)
    if (spell && !found.some((known) => known.spell.id === id)) found.push({ spell, ...how, ritual: spell.ritual, free: given?.left ?? 0, ...(given ? { useKey: given.key } : {}) })
  }
  // A cantrip the species gives, and the class does not, is cast with the ability its trait had the player pick.
  const speciesAbility = (id: string) => (sheet.speciesSpellAbility && derived.speciesCantrips.includes(id) && !(sheet.cantrips ?? []).includes(id) ? { ability: sheet.speciesSpellAbility } : {})
  for (const id of derived.cantrips) add(id, { cantrip: true, prepared: true, ...speciesAbility(id) })
  for (const id of derived.preparedSpells) add(id, { cantrip: false, prepared: true })
  if (cls?.spellcasting?.ritualFromSpellbook) for (const id of derived.spellbook) if (spellById.get(id)?.ritual) add(id, { cantrip: false, prepared: false })
  // Magic Initiate, from an Origin feat or one taken at a level: "You can cast it once without a spell slot, and you
  // regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any
  // spell slots you have." A spell the class already gives keeps the class's ability and gains the free cast.
  for (const entry of sheet.advancements ?? []) {
    if (entry.feat !== "magic-initiate" || !entry.spellList || !entry.spellAbility) continue
    const key = `magic-initiate-${entry.spellList}`
    const ability = entry.spellAbility
    for (const id of entry.cantrips ?? []) {
      const spell = spellById.get(id)
      if (spell && !found.some((known) => known.spell.id === id)) found.push({ spell, cantrip: true, prepared: true, ritual: spell.ritual, free: 0, ability })
    }
    const spell = entry.spell ? spellById.get(entry.spell) : undefined
    if (!spell) continue
    const free = Math.max(0, 1 - (character.featureUses?.[key] ?? 0))
    const held = found.findIndex((known) => known.spell.id === spell.id)
    if (held < 0) found.push({ spell, cantrip: false, prepared: true, ritual: spell.ritual, free, useKey: key, ability })
    else if (!found[held].useKey) found[held] = { ...found[held], prepared: true, free, useKey: key }
  }
  return found
}

/**
 * The spells an NPC's stat block casts: those of its Spellcasting action, At Will or so many a day, and those a Bonus
 * Action of the block casts. A day's casts stay spent until a Long Rest (./rest), as a hero's slots do. A spell cast as
 * a Reaction waits for stage 6.
 */
function statBlockSpells(character: Slotted, monster: NonNullable<ReturnType<typeof monsterById.get>>): KnownSpell[] {
  const found: KnownSpell[] = []
  const used = (key: string) => character.featureUses?.[key] ?? 0
  const add = (entry: { id: string; note?: string }, how: { atWill: boolean; uses: number; key: string }) => {
    const spell = spellById.get(entry.id)
    if (!spell || found.some((known) => known.spell.id === entry.id)) return
    const level = /level (\d) version/.exec(entry.note ?? "")
    found.push({
      spell,
      cantrip: how.atWill,
      prepared: true,
      ritual: false,
      free: how.atWill ? 0 : Math.max(0, how.uses - used(how.key)),
      ...(how.atWill ? {} : { useKey: how.key }),
      ...(level ? { castLevel: Number(level[1]) } : {}),
    })
  }
  for (const action of monster.actions ?? []) {
    for (const [index, list] of (action.spellcasting?.lists ?? []).entries()) {
      for (const entry of list.spells) {
        const atWill = list.frequency === "at-will"
        // "2/Day Each" counts each spell alone. "1/Day" with no "Each" is one cast shared by the spells on the line.
        add(entry, { atWill, uses: atWill ? 0 : Number(list.frequency), key: list.each ? `${action.name}: ${entry.id}` : `${action.name}: line ${index}` })
      }
    }
  }
  for (const feature of monster.bonusActions ?? []) {
    const count = feature.uses?.count
    for (const entry of feature.spellcasting?.spells ?? []) add(entry, { atWill: count === undefined, uses: typeof count === "number" ? count : 1, key: feature.name })
  }
  return found
}

/**
 * A character's spells in words, for a prompt that plays or writes them: a hero's cantrips and prepared spells with the
 * slots left, from the sheet. An NPC's are those its stat block casts, with the casts left, and then any magic it is
 * written with in words.
 */
export function spellWords(character: Slotted & { spells?: readonly { name: string }[] }): string {
  const known = spellsOf(character)
  const written = character.sheet ? [] : (character.spells ?? []).map((spell) => spell.name)
  if (!known.length) return written.join(", ")
  if (!character.sheet) {
    // An NPC casts by its stat block: some spells at will, and the rest so many times.
    const counted = known.filter((entry) => !entry.cantrip && entry.free > 0)
    return [
      known.some((entry) => entry.cantrip)
        ? `At will: ${known
            .filter((entry) => entry.cantrip)
            .map((entry) => entry.spell.name)
            .join(", ")}`
        : "",
      counted.length ? `With casts left: ${counted.map((entry) => `${entry.spell.name} (${entry.free})`).join(", ")}` : "",
      written.length ? `Other magic, in the story's words: ${written.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". ")
  }
  const names = (list: KnownSpell[]) => list.map((entry) => entry.spell.name).join(", ")
  const left = slotsLeft(character)
  const parts = [
    known.some((entry) => entry.cantrip) ? `Cantrips, cast at will: ${names(known.filter((entry) => entry.cantrip))}` : "",
    known.some((entry) => !entry.cantrip && entry.prepared) ? `Prepared spells: ${names(known.filter((entry) => !entry.cantrip && entry.prepared))}` : "",
    known.some((entry) => !entry.prepared) ? `Rituals from the spellbook, outside a fight: ${names(known.filter((entry) => !entry.prepared))}` : "",
    left.length ? `Spell slots left: ${slotWords(character)}` : "",
  ]
  return parts.filter(Boolean).join(". ")
}

/** A hero's spell slots left, by spell level, the first for level 1. */
export function slotsLeft(character: Slotted): number[] {
  return (spellcastingOf(character)?.slots ?? []).map((slots, index) => Math.max(0, slots - (character.spellSlots?.[index] ?? 0)))
}

/** A hero's slots left in words, for each spell level they have slots of: "3 of level 1, 0 of level 2". */
export function slotWords(character: Slotted): string {
  const total = spellcastingOf(character)?.slots ?? []
  return slotsLeft(character)
    .flatMap((left, index) => ((total[index] ?? 0) > 0 ? [`${left} of level ${index + 1}`] : []))
    .join(", ")
}

/**
 * The slot level a hero's casting of a spell spends: the one named, when they have it left and it is not below the
 * spell's level, and otherwise the lowest that can pay, the spell's own level first and then higher. None when no slot
 * of the spell's level or higher is left.
 */
export function slotFor(character: Slotted, spellLevel: number, slot?: number): number | undefined {
  const left = slotsLeft(character)
  if (slot !== undefined && slot >= spellLevel && (left[slot - 1] ?? 0) > 0) return slot
  const index = left.findIndex((count, at) => at + 1 >= spellLevel && count > 0)
  return index < 0 ? undefined : index + 1
}

/** What casting a spell spends: nothing for a cantrip or a Ritual, a feature's free cast, or a slot of the spell's level. */
export type CastCost = { kind: "cantrip" } | { kind: "ritual" } | { kind: "free"; feature: string } | { kind: "slot"; level: number }

/**
 * Whether a hero can cast a spell now, and what it spends. A cantrip is free. A Ritual cast slowly (`ritual`) spends
 * nothing. A feature's free cast is used before a slot, unless a higher slot is named. Any other casting needs the
 * spell prepared and a slot: the level named in `slot` (upcasting), or the lowest left that can pay, its own level
 * first and then higher (./slotFor). `problem` says why not, for the game master.
 */
export function castCost(character: Slotted, spellId: string, ritual = false, slot?: number): { cost: CastCost; known: KnownSpell } | { problem: string } {
  const known = spellsOf(character).find((entry) => entry.spell.id === spellId)
  const name = spellById.get(spellId)?.name ?? spellId
  if (!known) return { problem: `${name} is not a spell ${character.name ?? "this character"} can cast.` }
  if (known.cantrip) return { cost: { kind: "cantrip" }, known }
  if (ritual && known.ritual) return { cost: { kind: "ritual" }, known }
  if (!known.prepared) return { problem: `${name} is in the spellbook and not prepared, so it can only be cast as a Ritual.` }
  const upcast = character.sheet && slot !== undefined && slot > known.spell.level && slotFor(character, known.spell.level, slot) === slot
  if (known.free > 0 && known.useKey && !upcast) return { cost: { kind: "free", feature: known.useKey }, known }
  // An NPC casts by its stat block's counts, and has no slots to fall back on.
  if (!character.sheet) return { problem: `${character.name ?? "This character"} has no casting of ${name} left.` }
  const level = slotFor(character, known.spell.level, slot)
  if (level === undefined) return { problem: `${character.name ?? "This character"} has no spell slot of level ${known.spell.level} or higher left for ${name}.` }
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

/** A saving throw a target made against a spell, as it fell. */
export type SaveRoll = {
  target: string
  ability: AbilityId
  dice: number[]
  natural: number
  bonus: number
  total: number
  dc: number
  success: boolean
  mode: RollMode
  failedBy?: string
  adds?: RollAdd[]
}
/** A spell attack as it fell: the roll, and on a hit the damage dice and what the target lost. */
export type SpellAttack = { target: string; roll: AttackResult; damage?: DamageRoll; taken: number; fate?: Fate; deflected?: true }

export type Castee = Roller & {
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
  spellEffects?: readonly SpellEffect[]
  concentration?: Concentration
  tempHitPoints?: number
  isComplete?: boolean
}

export type Cast<T> = {
  characters: T[]
  /** Everyone the spell took, of those named: as many as it takes, and only those who are here. */
  targets: string[]
  /** The spell attack, or the first of several rays. */
  attack?: SpellAttack
  /** Every ray, in order, where the spell makes more than one attack (Scorching Ray). */
  rays?: SpellAttack[]
  saves: SaveRoll[]
  harm: Harm[]
  conditions: ConditionChange[]
  facts: string[]
}

// A cantrip's damage dice at the caster's level: the printed step at levels 5, 11 and 17.
function cantripDice(part: { dice?: string; cantrip?: Record<"5" | "11" | "17", string> }, level: number): string | undefined {
  if (!part.cantrip) return part.dice
  return level >= 17 ? part.cantrip[17] : level >= 11 ? part.cantrip[11] : level >= 5 ? part.cantrip[5] : part.dice
}

// Dice with those a higher slot adds: "8d6" and "1d6" for one level above make "9d6". Dice of another size are left as they are.
function raised(dice: string | undefined, perSlot: string | undefined, above: number): string | undefined {
  const base = /^(\d+)d(\d+)(.*)$/.exec(dice ?? "")
  const more = /^(\d+)d(\d+)$/.exec(perSlot ?? "")
  if (!base || !more || above < 1 || base[2] !== more[2]) return dice
  return `${Number(base[1]) + Number(more[1]) * above}d${base[2]}${base[3]}`
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
  if (fate === "endures") return enduredWords(character.name, character)
  if (fate === "dying") return `${character.name} is at 0 hit points, Unconscious and dying.`
  const hitPoints = hitPointsOf(character)
  // Down at 0 and not dead: a Troll, whose Regeneration settles it as its turn begins.
  if (hitPoints?.current === 0) return `${character.name} is at 0 hit points and down, not dead.`
  return hitPoints ? `${character.name} has ${hitPoints.current} of ${hitPoints.maximum} hit points${hitPoints.current * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.` : ""
}

/**
 * Cast a spell at its level, on the targets named. Everyone comes back as it left them, with each roll as it fell and
 * what happened in words for the game master, who tells it and never changes it.
 *
 * A spell attack is rolled against the target's Armor Class: `attackDice` are the d20s thrown for it and `mode` the
 * roll's Advantage or Disadvantage. A 20 on the die is a Critical Hit, which doubles the damage dice. Scorching Ray's
 * rays are each an attack of their own, falling on the targets in turn: the first takes the dice thrown, and the engine
 * rolls the rest. Each target makes the spell's saving throw against the caster's spell save DC with a d20 from `d20`.
 * The damage a save guards is rolled once for all of them: full on a failure, and half or none on a success as the
 * spell says. Magic Missile's darts each roll their own dice and fall on the targets in turn. Healing adds the
 * spellcasting ability modifier where the spell says so. A condition tied to a hit or a failed save is given with the
 * caster as its source. A spell that lasts leaves its effect (./spell-effects), and what it does at a round's turn is
 * dealt by ./spell-rounds. A spell the engine only tells (`isEngineSpell`) spends its cost and holds its Concentration,
 * and does nothing more here.
 *
 * `again` is a spell used again on a later turn (`castAgain`): only what its text deals then, with no new Concentration.
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
  /** For a spell cast for one skill (Guidance), the skill. */
  skill?: SkillId
  /** The slot level it is cast at, when above the spell's own: a hero's higher slot, or a Mage's "Fireball (level 4 version)". */
  level?: number
  /** The cover each target has from where the spell comes: it adds to Armor Class against the spell attack and to a Dexterity save. */
  cover?: Readonly<Record<string, Cover>>
  /** An area was measured on the floor (./spell-space): the spell takes everyone named, however many. */
  measured?: boolean
  /** The spell used again on a later turn, not cast: ./spells `castAgain`. */
  again?: boolean
}): Cast<T> {
  const { spell } = args
  let characters = [...args.characters]
  const caster = characters.find((character) => character.id === args.casterId)
  const casting = caster && spellcastingFor(caster, spell.id)
  if (!caster || !casting) throw new Error(`${caster?.name ?? "This character"} cannot cast spells.`)
  const level = caster.sheet?.level ?? 1
  const features = new Set(caster.sheet ? featuresOf(caster.sheet).map((feature) => feature.id) : [])
  const find = (id: string) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const slot = Math.max(spell.level, args.level ?? spell.level)
  const targets = [...new Set(args.targets)].filter((id) => find(id)).slice(0, args.measured && spell.range.area ? SEVERAL[spell.id] : targetLimit(spell, slot))
  const covered = (id: string) => coverBonus(args.cover?.[id] ?? "none")
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const attacks: SpellAttack[] = []
  const done = (): Cast<T> => ({ characters, targets, ...(attacks[0] ? { attack: attacks[0] } : {}), ...(attacks.length > 1 ? { rays: attacks } : {}), saves, harm, conditions, facts })

  // Casting a spell ends Invisibility on its caster: "The spell ends early immediately after the target ... casts a spell."
  if (!args.again && caster.conditions?.some((entry) => entry.spell === "invisibility")) {
    put(spellEnded(caster, (id) => id === "invisibility"))
    facts.push(`${caster.name} casts a spell, and Invisibility ends on them.`)
  }
  // A spell that takes Concentration is the one its caster now holds, and one held before ends.
  if (spell.duration.concentration && !args.again) characters = withConcentration(characters, caster.id, spell.id)
  // A spell the engine only tells does nothing more here.
  if (TOLD.has(spell.id)) return done()

  const typeOf = (types: readonly DamageTypeId[]) => (args.damageType && types.includes(args.damageType) ? args.damageType : types[0])
  // What the spell does as it takes effect, or, used again, what it does on a later turn. What it does under a stated
  // condition, or as one option of several (Command's Grovel), is not dealt here. Heat Metal's burn falls on the one
  // named, who is taken to hold or wear the metal. Blindness/Deafness gives Blinded, the caster's usual choice.
  const now = (part: { timing?: string; appliesWhen?: string; unless?: string; label?: string; condition?: ConditionId }) =>
    args.again
      ? !!part.timing && !part.label
      : !part.timing && !part.label && (!part.appliesWhen || (spell.id === "heat-metal" && !("condition" in part)) || (spell.id === "blindness-deafness" && part.condition === "blinded"))
  // A spell with a second save to come holds its first condition only until that save: the bearer's next turn (Sleep).
  const span = spell.saves?.some((save) => save.when === "later") ? "turn" : spanOf(spell)
  // A spell cast with a slot above its own level adds what its text gives for each level above: damage and healing
  // dice, fixed healing, creatures (in `targets` above) and darts.
  const above = slot - spell.level
  const partOf = (entry: NonNullable<Spell["damage"]>[number]): DamagePart => {
    const dice = raised(cantripDice(entry, level), entry.perSlot, above)
    // Damage "plus your spellcasting ability modifier" (Spiritual Weapon).
    const plus = entry.modifier ? casting.modifier : 0
    return { ...(dice ? { dice: plus ? `${dice} ${plus < 0 ? "-" : "+"} ${Math.abs(plus)}` : dice } : { amount: (entry.amount ?? 0) + plus }), type: typeOf(entry.types) }
  }
  // Damage to one target, through its defenses and the rules of 0 hit points.
  const hurt = (id: string, rolled: DamageRoll, amountOf: (taken: number) => number, critical = false) => {
    const target = find(id)
    if (!target) return undefined
    const defenses = defensesOf(target)
    const amount = amountOf(damageTaken(rolled, defenses))
    const struck = withDamage(target, amount, { critical, rules: args.rules, types: typesTaken(rolled, defenses) })
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
    const given = withCondition(target, { id: condition, source: caster.id, span, spell: spell.id }, { acted: !!target.isComplete })
    if (!given.given) {
      facts.push(`${target.name} cannot be ${conditionName(condition)} and is not.`)
      return
    }
    put(afterHarm(given.character))
    conditions.push({ target: id, condition })
    facts.push(`${target.name} is now ${conditionName(condition)}.`)
  }
  // Potent Cantrip: a damaging cantrip that misses, or is saved against, still deals half its damage and nothing more.
  const potent = spell.level === 0 && features.has(POTENT_CANTRIP)

  // A creature the spell cannot take: Hold Person takes a Humanoid.
  const takes = (id: string) => {
    const target = find(id)
    if (!target || !HUMANOID_ONLY.has(spell.id) || isHumanoid(target)) return true
    facts.push(`${target.name} is not a Humanoid, so ${spell.name} does not take them.`)
    return false
  }
  const taking = targets.filter(takes)

  // The spell attacks: one, or Scorching Ray's rays on the targets in turn.
  if (spell.attack && taking.length) {
    const rays = spell.projectiles ? dartsOf(spell, slot) : 1
    const parts = (spell.damage ?? []).filter((entry) => now(entry) && entry.trigger === "hit").map(partOf)
    for (let ray = 0; ray < rays; ray++) {
      const target = find(taking[ray % taking.length]) as T
      if (target.dead) continue
      const bare = combatStatsOf(target)?.armorClass
      if (bare === undefined) throw new Error(`${target.name} has no sheet or stat block to attack.`)
      const armorClass = bare + covered(target.id)
      const mode = args.mode ?? "normal"
      const dice = ray === 0 ? [...(args.attackDice ?? [])] : []
      while (dice.length < (mode === "normal" ? 1 : 2)) dice.push(args.d20())
      const roll = resolveAttack({ dice, bonus: casting.attackBonus - d20Penalty(caster), armorClass, mode, adds: rollAdds(caster, "attack-rolls", args.roll, undefined, { spell: true }) })
      let attack: SpellAttack = { target: target.id, roll, taken: 0 }
      const what = `${caster.name}'s ${spell.name}${rays > 1 ? ` (ray ${ray + 1} of ${rays})` : ""}`
      // Mirror Image: a duplicate may take the hit.
      const imaged = roll.hit ? mirrorImage(target, caster, args.roll) : undefined
      if (imaged?.deflected) {
        put(imaged.character)
        attacks.push({ ...attack, deflected: true })
        facts.push(
          `${what} hits, ${roll.total} against Armor Class ${armorClass}, but strikes one of ${target.name}'s illusory duplicates, which is destroyed. ${target.name} takes no damage. ${imaged.duplicates - 1} duplicates are left.`
        )
        continue
      }
      if (roll.hit) {
        if (parts.length) {
          const rolled = rollDamage(parts, args.roll, roll.critical)
          const dealt = hurt(target.id, rolled, (taken) => taken, roll.critical)
          attack = { ...attack, damage: rolled, taken: dealt?.amount ?? 0, ...(dealt?.fate ? { fate: dealt.fate } : {}) }
        }
        const after = find(target.id) as T
        facts.push(
          `${what} ${roll.critical ? "is a CRITICAL HIT on" : "HITS"} ${target.name} (${roll.total} against Armor Class ${armorClass}) for ${attack.taken} ${attack.damage?.parts[0]?.type ?? ""} damage. ${standing(after, attack.fate)}`.replace(
            "  ",
            " "
          )
        )
        for (const link of spell.conditions ?? []) if (now(link) && link.trigger === "hit") give(target.id, link.condition)
        // Vampiric Touch: "you regain Hit Points equal to half the amount of Necrotic damage dealt".
        if (spell.id === "vampiric-touch" && attack.taken > 1) {
          const healer = find(caster.id) as T
          const amount = Math.floor(attack.taken / 2)
          put(withHealing(healer, amount))
          harm.push({ target: caster.id, kind: "healing", dice: [], bonus: amount, amount })
          facts.push(`${caster.name} regains ${amount} hit points. ${standing(find(caster.id) as T, undefined)}`)
        }
      } else if (parts.length && (HALF_ON_MISS.has(spell.id) || potent)) {
        // Acid Arrow's splash on a miss, "half as much of the initial damage only", and a Potent Cantrip's half.
        const rolled = rollDamage(parts, args.roll)
        const dealt = hurt(target.id, rolled, (taken) => Math.floor(taken / 2))
        attack = { ...attack, damage: rolled, taken: dealt?.amount ?? 0, ...(dealt?.fate ? { fate: dealt.fate } : {}) }
        facts.push(
          `${what} MISSES ${target.name} (${roll.total} against Armor Class ${armorClass}), and still deals half its damage: ${attack.taken} ${rolled.parts[0]?.type ?? ""}. ${standing(find(target.id) as T, attack.fate)}`.replace(
            "  ",
            " "
          )
        )
      } else facts.push(`${what} MISSES ${target.name} (${roll.total} against Armor Class ${armorClass}). ${target.name} takes no damage.`)
      attacks.push(attack)
    }
  }

  // Damage that needs no roll to land. Magic Missile's darts each roll their own dice and fall on the targets in turn.
  // Heat Metal burns before the save it calls for. Shield keeps Magic Missile's darts off its bearer.
  const sure = spell.attack ? [] : (spell.damage ?? []).filter((entry) => now(entry) && !entry.trigger)
  if (sure.length && taking.length) {
    const darts = spell.projectiles ? dartsOf(spell, slot) : undefined
    const falls = darts ? Array.from({ length: darts }, (_, index) => taking[index % taking.length]) : taking
    const lost = new Map<string, { amount: number; fate?: Fate; type: string }>()
    for (const id of falls) {
      const target = find(id)
      if (spell.id === "magic-missile" && target && turnsMagicMissile(target)) continue
      const dealt = hurt(id, rollDamage(sure.map(partOf), args.roll), (taken) => taken)
      if (dealt) lost.set(id, { amount: (lost.get(id)?.amount ?? 0) + dealt.amount, fate: dealt.fate, type: dealt.type })
    }
    for (const id of new Set(falls)) if (!lost.has(id)) facts.push(`${find(id)?.name}'s Shield turns ${caster.name}'s ${spell.name} aside: no damage.`)
    for (const [id, dealt] of lost) facts.push(`${caster.name}'s ${spell.name} strikes ${find(id)?.name} for ${dealt.amount} ${dealt.type} damage. ${standing(find(id) as T, dealt.fate)}`)
  }

  // Each saving throw the spell calls for as it takes effect, made by every target. A save made only when a creature
  // enters an area or starts or ends its turn there is not made at the cast (Web, Spirit Guardians): ./spell-rounds
  // makes it. Heat Metal's save follows its burn.
  let rolledSaves = false
  for (const [index, save] of (spell.saves ?? []).entries()) {
    const linked = [...(spell.damage ?? []), ...(spell.conditions ?? [])].filter((entry) => entry.trigger === "failed-save" && entry.save === index)
    const later = !!save.timing || (linked.length > 0 && linked.every((entry) => entry.timing) && !SAVE_AT_CAST.has(spell.id))
    const made = args.again ? spell.id === "heat-metal" : (save.when === "initial" && !later) || (spell.id === "heat-metal" && save.when === "on-damage")
    if (!made) continue
    rolledSaves = true
    const guarded = (spell.damage ?? []).filter((entry) => now(entry) && entry.trigger === "failed-save" && entry.save === index)
    const rolled = guarded.length ? rollDamage(guarded.map(partOf), args.roll) : undefined
    const half = guarded.some((entry) => (entry.onSuccess ?? save.onSuccess) === "half") || potent
    for (const id of taking) {
      const target = find(id)
      if (!target || target.dead) continue
      const against = (spell.conditions ?? []).filter((link) => link.trigger === "failed-save" && link.save === index).map((link) => link.condition)
      const thrown = rollSave({ target, ability: save.ability, dc: casting.saveDc, d20: args.d20, roll: args.roll, characters, cover: covered(id), also: modesAgainst(spell, target), against })
      saves.push(thrown)
      const { success } = thrown
      const verdict = `${target.name} ${success ? "SUCCEEDS on" : "FAILS"} the saving throw against ${caster.name}'s ${spell.name} (${thrown.total} against DC ${casting.saveDc})`
      if (rolled && (!success || half)) {
        const dealt = hurt(id, rolled, (taken) => (success ? Math.floor(taken / 2) : taken))
        facts.push(`${verdict} and takes ${dealt?.amount ?? 0} ${dealt?.type ?? ""} damage. ${standing(find(id) as T, dealt?.fate)}`.replace("  ", " "))
      } else facts.push(`${verdict}${rolled ? " and takes no damage" : ""}.`)
      if (!success) for (const link of spell.conditions ?? []) if (now(link) && link.trigger === "failed-save" && link.save === index) give(id, link.condition)
      if (!success && spell.id === "heat-metal")
        facts.push(`${target.name} must drop the burning metal if they can. If they do not, they have Disadvantage on attack rolls and ability checks until the start of ${caster.name}'s next turn.`)
    }
  }

  // Healing as the spell takes effect. Temporary hit points and healing that comes later are not dealt here. Disciple
  // of Life adds 2 and the slot's level to a spell of level 1 or higher. Beacon of Hope makes each die count its most.
  const healing = spell.healing
  if (healing && now(healing) && !healing.temporary && !args.again) {
    for (const id of taking) {
      const target = find(id)
      if (!target) continue
      // Revivify: "a creature that has died within the last minute ... revives with 1 Hit Point."
      if (spell.id === "revivify") {
        if (!target.dead) {
          facts.push(`${target.name} is not dead, so Revivify does nothing.`)
          continue
        }
        const { dead: _, ...alive } = target
        put(revived({ ...alive, hitPoints: 0 } as T, healing.amount ?? 1))
        harm.push({ target: id, kind: "healing", dice: [], bonus: healing.amount ?? 1, amount: healing.amount ?? 1 })
        facts.push(`${target.name} returns to life with ${healing.amount ?? 1} hit point.`)
        continue
      }
      if (target.dead) continue
      const dice = raised(healing.dice, healing.perSlot, above)
      const most = healsMost(target)
      const rolled = dice ? rollDamage([{ dice, type: "force" }], most ? (sides) => sides : args.roll) : undefined
      const disciple = features.has(DISCIPLE_OF_LIFE) && spell.level >= 1 ? 2 + slot : 0
      const bonus = (rolled?.parts[0]?.bonus ?? 0) + (healing.modifier ? casting.modifier : 0) + (healing.perSlotAmount ?? 0) * above + disciple
      const amount = Math.max(0, (rolled?.parts[0]?.dice.reduce((sum, die) => sum + die, 0) ?? healing.amount ?? 0) + bonus)
      const healed = withHealing(target, amount)
      put(healed)
      harm.push({ target: id, kind: "healing", dice: rolled?.parts[0]?.dice ?? [], sides: rolled?.parts[0]?.sides, bonus, amount })
      facts.push(`${target.name} regains ${amount} hit points. ${standing(healed, undefined)}`)
    }
  }

  // Spells that end what other spells or conditions do (./spell-ends).
  if (!args.again) {
    const ended = endsBySpell({ spell, slot, caster, targets: taking, characters, d20: args.d20, modifier: casting.modifier })
    if (ended) {
      characters = ended.characters
      conditions.push(...ended.conditions)
      facts.push(...ended.facts)
    }
  }

  // A condition the spell gives with no roll, as it takes effect.
  for (const link of spell.conditions ?? []) {
    if (!now(link) || link.trigger) continue
    for (const id of link.target === "caster" ? [caster.id] : taking) give(id, link.condition)
  }

  // Temporary Hit Points as the spell takes effect (False Life). They do not stack: the higher stands.
  if (healing?.temporary && !healing.timing && !args.again) {
    for (const id of taking.length ? taking : [caster.id]) {
      const target = find(id)
      if (!target || target.dead) continue
      const dice = raised(healing.dice, healing.perSlot, above)
      const rolled = dice ? rollDamage([{ dice, type: "force" }], args.roll).total : (healing.amount ?? 0)
      const amount = rolled + (healing.modifier ? casting.modifier : 0) + (healing.perSlotAmount ?? 0) * above
      if (amount > (target.tempHitPoints ?? 0)) put({ ...target, tempHitPoints: amount })
      facts.push(`${target.name} gains ${amount} Temporary Hit Points.`)
    }
  }

  // A spell that lasts stays on those it took: everyone named, or only those who failed its save, or the one its spell
  // attack hit. Spirit Guardians and the spells used again on later turns stay on their caster alone, with the slot.
  if (lasts(spell) && !args.again) {
    const first = attacks[0]
    const taken = CASTER_HELD.has(spell.id)
      ? [caster.id]
      : rolledSaves
        ? saves.filter((save) => !save.success).map((save) => save.target)
        : spell.attack
          ? first?.roll.hit && !first.deflected
            ? [first.target]
            : []
          : taking.length
            ? taking
            : [caster.id]
    const turns = span ? CONDITION_SPANS[span] : undefined
    for (const id of taken) {
      const target = find(id)
      if (!target || target.dead) continue
      // Heroism's Temporary Hit Points are the caster's spellcasting ability modifier, at the start of each of the target's turns.
      const amount = healing?.temporary && healing.timing ? casting.modifier : effectAmount(spell, slot)
      put(
        withSpellEffect(target, {
          spell: spell.id,
          by: caster.id,
          ...(turns ? { turns: turns + (target.isComplete ? 1 : 0) } : {}),
          ...(amount !== undefined ? { amount } : {}),
          ...(args.skill ? { skill: args.skill } : {}),
        })
      )
      facts.push(`${spell.name} is now on ${target.name}.`)
      // Aid raises the current hit points with the maximum.
      if (spell.hitPointMaximum && amount) {
        const raisedUp = withHealing(find(id) as T, amount)
        put(raisedUp)
        facts.push(`${target.name}'s hit point maximum and hit points rise by ${amount}. ${standing(raisedUp, undefined)}`)
      }
    }
  }

  // Acid Arrow burns again at the end of the target's next turn (./spell-rounds), with the slot it was cast at.
  if (spell.id === "acid-arrow" && attacks[0]?.roll.hit && !args.again) {
    const target = find(attacks[0].target)
    if (target && !target.dead) put(withSpellEffect(target, { spell: spell.id, by: caster.id, turns: target.isComplete ? 2 : 1, amount: slot }))
  }

  return done()
}

// The spells a caster uses again on later turns while they last, and with what: "As a Bonus Action on your later turns"
// (Spiritual Weapon, Heat Metal), "on each of your turns as a Magic action" (Vampiric Touch).
const AGAIN: Record<string, "action" | "bonus-action"> = { "spiritual-weapon": "bonus-action", "heat-metal": "bonus-action", "vampiric-touch": "action" }

/**
 * The spells a character may use again this turn, with no new slot: those they cast and still hold, each with the slot
 * it was cast at and what it takes, an action or a Bonus Action. For the turn's menu, beside the spells they can cast.
 */
export function againOf(character: { id?: string; spellEffects?: readonly SpellEffect[]; concentration?: Concentration }): { spell: Spell; slot: number; takes: "action" | "bonus-action" }[] {
  return (character.spellEffects ?? []).flatMap((effect) => {
    const spell = spellById.get(effect.spell)
    const takes = AGAIN[effect.spell]
    if (!spell || !takes || effect.by !== character.id || character.concentration?.spell !== effect.spell) return []
    return [{ spell, slot: effect.amount ?? spell.level, takes }]
  })
}

/**
 * A spell used again on a later turn: Spiritual Weapon's attack, Heat Metal's burn and its save, Vampiric Touch's
 * attack and the healing it brings. It spends nothing, and deals what the text gives at the slot it was cast at.
 * Spiritual Weapon's force is not placed on the floor, so the one it strikes is not measured from it.
 */
export function castAgain<T extends Castee>(args: Omit<Parameters<typeof castSpell<T>>[0], "spell" | "level" | "again"> & { spellId: string }): Cast<T> {
  const caster = args.characters.find((character) => character.id === args.casterId)
  const held = caster && againOf(caster).find((entry) => entry.spell.id === args.spellId)
  if (!held) throw new Error(`${caster?.name ?? "This character"} holds no ${spellById.get(args.spellId)?.name ?? args.spellId} to use again.`)
  const { spellId: _, ...rest } = args
  return castSpell({ ...rest, spell: held.spell, level: held.slot, again: true })
}

// The engine's own holdings of spell text, for the rules above.
const POTENT_CANTRIP = "evoker-potent-cantrip"
const DISCIPLE_OF_LIFE = "life-domain-disciple-of-life"
// "On a miss, the arrow splashes the target with acid for half as much of the initial damage only."
const HALF_ON_MISS = new Set(["acid-arrow"])
// "Choose a Humanoid": Hold Person takes no other creature.
const HUMANOID_ONLY = new Set(["hold-person"])
// Phantasmal Force's save decides at the cast whether the phantasm takes hold, though the damage it guards comes later.
const SAVE_AT_CAST = new Set(["phantasmal-force"])

// A hero is of a playable species, every one of them a Humanoid. An NPC is of its stat block's type.
function isHumanoid(character: Roller): boolean {
  if (character.sheet || character.type !== "npc") return true
  return (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK)?.type ?? "humanoid") === "humanoid"
}

// Advantage and Disadvantage a spell itself puts on a target's save: "A Construct has Disadvantage on the save" (Shatter).
function modesAgainst(spell: Spell, target: Roller): { mode: "advantage" | "disadvantage"; from: string }[] {
  if (spell.id !== "shatter" || target.sheet || target.type !== "npc") return []
  return monsterById.get(target.statBlock ?? DEFAULT_STAT_BLOCK)?.type === "construct" ? [{ mode: "disadvantage", from: "Construct" }] : []
}

// The number a lasting effect holds: Aid's rise in hit points, Mirror Image's three duplicates, Magic Weapon's bonus
// (+2 with a level 3 to 5 slot, +3 with level 6 or higher), and the slot of a spell its caster holds.
function effectAmount(spell: Spell, slot: number): number | undefined {
  if (spell.hitPointMaximum) return (spell.hitPointMaximum.amount ?? 0) + (spell.hitPointMaximum.perSlotAmount ?? 0) * (slot - spell.level)
  if (spell.id === "mirror-image") return 3
  if (spell.id === "magic-weapon") return slot >= 6 ? 3 : slot >= 3 ? 2 : 1
  if (CASTER_HELD.has(spell.id)) return slot
  return undefined
}

/**
 * A saving throw a creature makes against a spell or another magical effect: every caller's is one (a spell's save, a
 * save a lasting spell has repeated, the caster's save against Counterspell, a Channel Divinity's). So Magic
 * Resistance gives it Advantage. The d20 or two, the save bonus, cover on a Dexterity save, the dice
 * of spells on them (Bless, Bane), Slow's −2 on Dexterity, and the Advantage and Disadvantage of their conditions,
 * actions and spells (Haste, Beacon of Hope), of their species against the conditions at stake (`against`: Fey
 * Ancestry on Charmed), and of the spell itself (`also`). A condition may fail it outright.
 */
export function rollSave(args: {
  target: Castee
  ability: AbilityId
  dc: number
  d20: () => number
  roll: (sides: number) => number
  characters: readonly Castee[]
  cover?: number
  also?: readonly { mode: "advantage" | "disadvantage"; from: string }[]
  /** The conditions the save is made to avoid or end, for a species trait that gives Advantage against them (Fey Ancestry). */
  against?: readonly ConditionId[]
}): SaveRoll {
  const { target, ability } = args
  const check: Check = { kind: "save", ability }
  const failedBy = saveFailedBy(target, check)
  const sources = [
    ...checkModesFrom(target, check, args.characters),
    ...checkModesFromActions(target, check, args.characters),
    ...saveModesFromSpells(target, ability),
    ...speciesSaveModes(target, ability, args.against),
    ...magicSaveModes(target),
    ...classCheckModes(target, check),
    ...(args.also ?? []),
  ]
  const mode = combineModes(sources.map((source) => source.mode))
  const dice = Array.from({ length: mode === "normal" ? 1 : 2 }, () => args.d20())
  const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
  // Cover adds to a Dexterity save.
  const bonus = checkBonus(target, check) + (ability === "dex" ? (args.cover ?? 0) : 0) + saveBonusFromSpells(target, ability)
  // A lasting spell on the target adds its dice to the save, or takes them away.
  const adds = rollAdds(target, "saving-throws", args.roll)
  const total = natural + bonus + adds.reduce((sum, add) => sum + add.amount, 0)
  const success = !failedBy && total >= args.dc
  return { target: target.id, ability, dice, natural, bonus, total, dc: args.dc, success, mode, ...(failedBy ? { failedBy } : {}), ...(adds.length ? { adds } : {}) }
}

/** The modes that fall on a spell attack from the conditions and actions of the caster and the target. */
type Bearer = Parameters<typeof attackModesFrom>[0] & Parameters<typeof attackModesFromActions>[0]
export function spellAttackModes(caster: Bearer, target: Bearer, spell: Spell, present?: readonly Bearer[]) {
  return [...attackModesFrom(caster, target, isNear(caster, target, spell.attack ?? "ranged"), present), ...attackModesFromActions(caster, target, present)]
}

export { spellById }
