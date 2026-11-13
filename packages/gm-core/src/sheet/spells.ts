import type { AbilityId, ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { monsterById } from "@d20/srd/monsters"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { attackModesFromActions, checkModesFromActions } from "./actions"
import { type AttackResult, type DamagePart, type DamageRoll, damageTaken, defensesOf, parseDice, resolveAttack, rollDamage } from "./attack"
import { type Check, checkBonus, combineModes, type Roller, type RollMode } from "./check"
import {
  afterClassCast,
  classCastingBar,
  classCheckModes,
  classCreatedSlots,
  classHalvesAvoided,
  classMoreTargets,
  classSpellAttackModes,
  classSpellDamage,
  classSpellDamageMost,
  classSpellDamageRolled,
  classSpellHealing,
  classSpellHits,
  classSpellSaveDc,
  classSpellSpares,
  classSpellsGiven,
  classTotalFloor,
} from "./class-rules"
import { CONDITION_SPANS, type ConditionEntry, type ConditionSpan } from "./condition-entry"
import { attackModesFrom, checkModesFrom, conditionName, d20Penalty, saveFailedBy, withCondition } from "./conditions"
import { afterHarm, type DeathRules, type DeathSaves, enduredWords, type Fate, wardedWords, withDamage, withHealing } from "./death"
import { deriveSheet, pickedFreeCasts, slotsAt } from "./derive"
import { obscuredModes } from "./floor-areas"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { itemSaveModes } from "./item-effects"
import { withItemCastSpent } from "./item-spend"
import { type ItemCasting, type ItemCost, itemCastCost, itemCastingWords, itemSpellsOf } from "./item-use"
import { itemBonus } from "./items"
import { legendaryResistanceWords, type SaveStakes, spendsLegendaryResistance, withLegendaryResistanceSpent } from "./legendary-resistance"
import { magicSaveModes, typesTaken } from "./monster-traits"
import { auraSaveBonus, damageOnSave, rescuedSave, rescueWords, withRescueSpent } from "./save-rules"
import { type Cover, coverBonus, type Floor, isNear, type Point } from "./space"
import { speciesSaveModes } from "./species-traits"
import {
  deflectedHit,
  healsMost,
  heldByCaster,
  lasts,
  type RollAdd,
  rollAdds,
  saveBonusFromSpells,
  saveModesFromSpells,
  spellEnded,
  wardedFrom,
  withConcentration,
  withSpellEffect,
} from "./spell-effects"
import { endsBySpell } from "./spell-ends"
import { spellLabel } from "./spell-labels"
import { areaOfSpell, type CastContext, heldRule, spellRule } from "./spell-rules"
import { combatStatsOf, DEFAULT_STAT_BLOCK } from "./stat-block"
import type { Concentration, SpellEffect, TurnEffect } from "./turn-effect"
// Every spell mechanism file's rules, handed to ./spell-rules as they load. Last of the imports, so the files load once
// the shared code they read has.
import "./spell-mechanics"

/**
 * Spellcasting by the SRD 5.2.1 rules, as pure functions. A spell's typed data decides what it does: a spell attack
 * against Armor Class, a saving throw each target makes against the caster's spell save DC, damage and healing dice,
 * and the conditions a hit or a failed save gives. Nothing here asks a model.
 */

export type Spellcasting = {
  /** None for a spell cast from an item by one who has no spellcasting ability. */
  ability?: AbilityId
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
    // A feature may raise it while it lasts (Innate Sorcery), and a worn item raises both (the Robe of the Archmagi's 2).
    saveDc: 8 + derived.proficiencyBonus + modifier + classSpellSaveDc(character) + itemBonus(sheet, "spell-save-dc"),
    attackBonus: derived.proficiencyBonus + modifier + itemBonus(sheet, "spell-attack-rolls"),
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
 *
 * A spell cast from a magic item (`fromItem`, or one the hero has only from an item) takes the save DC and attack bonus
 * the item states, and otherwise the caster's own: "If the user doesn't have a spellcasting ability, their spellcasting
 * ability modifier is +0 for the item, and the user's Proficiency Bonus applies." A Fighter with Proficiency Bonus +2
 * casts a Staff's spell at DC 10 and +2.
 */
export function spellcastingFor(character: Slotted, spellId: string, fromItem = false): Spellcasting | undefined {
  const own = spellcastingOf(character)
  const known = spellsOf(character).find((entry) => entry.spell.id === spellId)
  if (known?.item && (known.itemOnly || fromItem) && character.sheet) {
    const proficiency = deriveSheet(character.sheet).proficiencyBonus
    const modifier = own?.modifier ?? 0
    return {
      ...(own ? { ability: own.ability } : {}),
      saveDc: known.item.saveDc ?? own?.saveDc ?? 8 + proficiency,
      attackBonus: known.item.attackBonus ?? own?.attackBonus ?? proficiency,
      modifier,
      slots: own?.slots ?? [],
      cantrips: own?.cantrips ?? 0,
      prepared: own?.prepared ?? 0,
    }
  }
  const ability = known?.ability
  if (!ability || !character.sheet) return own
  const derived = deriveSheet(character.sheet)
  const modifier = derived.abilityModifiers[ability]
  return {
    ability,
    saveDc: 8 + derived.proficiencyBonus + modifier + itemBonus(character.sheet, "spell-save-dc"),
    attackBonus: derived.proficiencyBonus + modifier + itemBonus(character.sheet, "spell-attack-rolls"),
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

// How much of each spell the engine runs (./spell-labels).
export { isEngineSpell, namedSpellIds, type SpellLabel, spellLabel } from "./spell-labels"

/** The time a spell takes to cast when it is a minute or more, in words: "1 minute", "10 minutes", "1 hour". */
export function longCasting(spell: Spell): string | undefined {
  const { unit, amount = 1 } = spell.castingTime
  return unit === "minute" || unit === "hour" ? `${amount} ${unit}${amount === 1 ? "" : "s"}` : undefined
}

/**
 * Whether a spell is cast on a turn, with an action or a Bonus Action. One cast as a Reaction (Shield, Counterspell,
 * Feather Fall) is only cast when its trigger is offered (./reactions, ./counterspell), so it is left off a turn's menu.
 * So is a Bonus Action spell cast right after a hit (Divine Smite, Ensnaring Strike): it is cast with the attack
 * (./classes/paladin, ./classes/ranger). One of those the game only tells has no hit to ride, so it stays on the menu,
 * cast as a Bonus Action, and the game master rules on it from its text.
 */
export const castableOnTurn = (spell: Spell): boolean => spell.castingTime.unit !== "reaction" && (!spell.castingTime.trigger || spellLabel(spell) === "told")

/**
 * How many creatures a spell takes. On a floor an area takes whoever stands in it (./spell-space). Where there is no
 * floor it takes as many as its size allows: a cone one for each 10 feet, a cube one for each 5 feet of its side, a sphere, cylinder or emanation one
 * for each 5 feet of its radius, a line one for each 30 feet, each rounded up. Magic Missile takes one for each dart.
 * Any other spell takes one. A spell whose words count its creatures takes that many, and an area no more (./spell-rules
 * `count`). Cast with a slot above its level (`slot`), a spell takes the creatures its text adds for each level above
 * (Bless, Charm Person), and Magic Missile its extra darts. A class feature of the `caster`'s may add more (Words of
 * Creation, ./class-rules `moreTargets`).
 */
export function targetLimit(spell: Spell, slot = spell.level, casterLevel = 1, caster?: Roller): number {
  const above = Math.max(0, slot - spell.level)
  const area = spell.range.area
  const rule = spellRule(spell.id)
  const count = rule?.count
  // A spell that makes several areas (Meteor Swarm's four) takes as many as each holds, for each.
  if (area) return Math.min(count ?? Number.POSITIVE_INFINITY, Math.max(1, Math.ceil(area.size / (area.shape === "cone" ? 10 : area.shape === "line" ? 30 : 5))) * (rule?.areas ?? 1))
  if (spell.projectiles) return dartsOf(spell, slot, casterLevel)
  return (count ?? 1) + (spell.extraTargetsPerSlot ?? 0) * above + ((caster && classMoreTargets(caster, spell)?.count) ?? 0)
}

/** How many areas a spell makes, each centred on one named: one, or Meteor Swarm's four (./spell-rules `areas`). */
export const areasOf = (spell: Spell): number => spellRule(spell.id)?.areas ?? 1

/**
 * How many projectiles a spell makes: Magic Missile's three, and one more for each slot level above 1. A cantrip's
 * count grows with its caster's level: Eldritch Blast's two beams at level 5, three at 11 and four at 17.
 */
function dartsOf(spell: Spell, slot: number, casterLevel = 1): number {
  const step = spell.projectiles?.cantrip
  const base = step ? (casterLevel >= 17 ? step[17] : casterLevel >= 11 ? step[11] : casterLevel >= 5 ? step[5] : spell.projectiles?.count) : spell.projectiles?.count
  return (base ?? 0) + (spell.projectiles?.perSlot ?? 0) * Math.max(0, slot - spell.level)
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
  /** Cast as often as the hero likes with no slot, as a cantrip is: an Eldritch Invocation's spell (Armor of Shadows' Mage Armor). */
  atWill?: true
  /** Its casting with no slot is on the caster alone: "on yourself". */
  selfOnly?: true
  /** The option of a class feature its casting with no slot comes from, by id: "fiendish-vigor". */
  from?: string
  /** A stat block casts it as a Bonus Action, whatever its own casting time: a Priest's Bless by Divine Aid. */
  bonusAction?: true
  /** A magic item the hero owns casts it, with what that costs (./item-use). The first item that does, in the order owned. */
  item?: ItemCasting
  /** The hero casts it only from that item, by no feature or slot of their own. */
  itemOnly?: true
  /**
   * A feature casts it with no slot, counted under `feature` (Divine Intervention, ./class-rules `spellsGiven`): the
   * only way for one not prepared, and for one prepared, the way when no slot is left.
   */
  given?: { feature: string; name: string }
}

type Slotted = Roller & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

/**
 * The spells a hero can cast, from the sheet: the cantrips known, the spells prepared, for a Wizard the Ritual spells
 * of the spellbook, and each Magic Initiate's two cantrips and its level 1 spell, always prepared, with one cast a Long
 * Rest that takes no slot (counted under `magic-initiate-<list>`), all cast with the ability the feat names. A cantrip
 * the species gives is cast with the sheet's `speciesSpellAbility` where it names one. The spells the hero's working
 * magic items cast (./item-use `itemSpellsOf`), each with its item, beside or in place of their own casting. A hero
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
  // An Eldritch Invocation's spell cast with no slot (./derive pickedFreeCasts): at will, or as many times as the
  // option's uses give, counted under its id (Gift of the Depths' Water Breathing, once a Long Rest), and then not at
  // all, nor as a Ritual. A spell the hero also has prepared keeps its slots. One cast only in Dim Light or Darkness
  // (One with Shadows) is left out: the engine knows no light.
  for (const cast of pickedFreeCasts(sheet)) {
    const spell = spellById.get(cast.spell)
    if (!spell || cast.usableWhen) continue
    const counted = typeof cast.uses?.count === "number" ? cast.uses.count : undefined
    const how = {
      ...(counted === undefined ? { atWill: true as const } : { free: Math.max(0, counted - (character.featureUses?.[cast.option] ?? 0)), useKey: cast.option }),
      ...(cast.selfOnly ? { selfOnly: true as const } : {}),
      from: cast.option,
    }
    const held = found.findIndex((known) => known.spell.id === spell.id)
    if (held < 0) found.push({ spell, cantrip: false, prepared: counted === undefined, ritual: false, free: 0, ...how })
    else if (!found[held].useKey && !found[held].atWill) found[held] = { ...found[held], ...how }
  }
  // Spells a class feature casts with no slot while it has a use left (Divine Intervention): one the hero has prepared
  // keeps its slots and gains the feature's casting.
  for (const given of classSpellsGiven(character)) {
    for (const id of given.spells) {
      const spell = spellById.get(id)
      const held = found.findIndex((known) => known.spell.id === id)
      const by = { feature: given.feature, name: given.name }
      if (!spell) continue
      if (held < 0) found.push({ spell, cantrip: false, prepared: false, ritual: false, free: 0, given: by })
      else if (!found[held].cantrip && !found[held].given) found[held] = { ...found[held], given: by }
    }
  }
  // A spell a magic item casts: one the hero also casts by their own means keeps those, and gains the item's.
  for (const casting of itemSpellsOf(sheet)) {
    const spell = spellById.get(casting.spell)
    const held = found.findIndex((known) => known.spell.id === casting.spell)
    if (!spell) continue
    if (held < 0) found.push({ spell, cantrip: false, prepared: false, ritual: false, free: 0, item: casting, itemOnly: true, ...(casting.selfOnly ? { selfOnly: true as const } : {}) })
    else if (!found[held].item) found[held] = { ...found[held], item: casting }
  }
  return found
}

/**
 * The spells an NPC's stat block casts: those of its Spellcasting action, At Will or so many a day, and those a Bonus
 * Action of the block casts, as a Bonus Action. A day's casts stay spent until a Long Rest (./rest), as a hero's slots
 * do. A spell cast as a Reaction waits for stage 6.
 */
function statBlockSpells(character: Slotted, monster: NonNullable<ReturnType<typeof monsterById.get>>): KnownSpell[] {
  const found: KnownSpell[] = []
  const used = (key: string) => character.featureUses?.[key] ?? 0
  const add = (entry: { id: string; note?: string }, how: { atWill: boolean; uses: number; key: string; bonusAction?: true }) => {
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
      ...(how.bonusAction ? { bonusAction: true as const } : {}),
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
    for (const entry of feature.spellcasting?.spells ?? []) add(entry, { atWill: count === undefined, uses: typeof count === "number" ? count : 1, key: feature.name, bonusAction: true })
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
    known.some((entry) => !entry.cantrip && entry.prepared && !entry.atWill) ? `Prepared spells: ${names(known.filter((entry) => !entry.cantrip && entry.prepared && !entry.atWill))}` : "",
    known.some((entry) => entry.atWill)
      ? `At will with no slot: ${known
          .filter((entry) => entry.atWill)
          .map((entry) => `${entry.spell.name}${entry.selfOnly ? " (on themselves)" : ""}`)
          .join(", ")}`
      : "",
    known.some((entry) => !entry.prepared && !entry.from && !entry.itemOnly && !entry.given)
      ? `Rituals from the spellbook, outside a fight: ${names(known.filter((entry) => !entry.prepared && !entry.from && !entry.itemOnly && !entry.given))}`
      : "",
    ...[...new Set(known.flatMap((entry) => (entry.given ? [entry.given.name] : [])))].map(
      (by) => `By ${by}, once, with no slot, beside the spells above: ${names(known.filter((entry) => entry.given?.name === by && !entry.prepared))}`
    ),
    known.some((entry) => !entry.prepared && entry.from)
      ? `Cast with no slot: ${known
          .filter((entry) => !entry.prepared && entry.from)
          .map((entry) => `${entry.spell.name} (${entry.free} left)`)
          .join(", ")}`
      : "",
    known.some((entry) => entry.item) ? `From magic items, with no slot: ${known.flatMap((entry) => (entry.item ? [`${entry.spell.name} (${itemCastingWords(entry.item)})`] : [])).join(", ")}` : "",
    left.length ? `Spell slots left: ${slotWords(character)}` : "",
  ]
  return parts.filter(Boolean).join(". ")
}

/** A hero's spell slots left, by spell level, the first for level 1. */
export function slotsLeft(character: Slotted): number[] {
  // Slots a feature has made beyond the table's count too, until they are spent (Font of Magic).
  const made = classCreatedSlots(character)
  return (spellcastingOf(character)?.slots ?? []).map((slots, index) => Math.max(0, slots + (made[index] ?? 0) - (character.spellSlots?.[index] ?? 0)))
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

/**
 * What casting a spell spends: nothing for a cantrip or a Ritual, a feature's free cast, a slot of the spell's level, or
 * a magic item's charges or use, at the level the item casts it (./item-use).
 */
export type CastCost = { kind: "cantrip" } | { kind: "ritual" } | { kind: "free"; feature: string } | { kind: "slot"; level: number } | ItemCost

/**
 * Whether a hero can cast a spell now, and what it spends. A cantrip is free. A Ritual cast slowly (`ritual`) spends
 * nothing. A feature's free cast is used before a slot, unless a higher slot is named. Any other casting needs the
 * spell prepared and a slot: the level named in `slot` (upcasting), or the lowest left that can pay, its own level
 * first and then higher (./slotFor). A spell cast from a magic item (`fromItem`, or one the hero casts only from an
 * item) spends the item's charges or use in place of a slot, and `slot` is then the level asked for, where the item
 * casts it at more than one. `problem` says why not, for the game master.
 */
export function castCost(character: Slotted, spellId: string, ritual = false, slot?: number, fromItem = false): { cost: CastCost; known: KnownSpell } | { problem: string } {
  const known = spellsOf(character).find((entry) => entry.spell.id === spellId)
  const name = spellById.get(spellId)?.name ?? spellId
  if (!known) return { problem: `${name} is not a spell ${character.name ?? "this character"} can cast.` }
  // A class feature that bars casting while it lasts (Rage) bars every spell, a cantrip too.
  const barred = classCastingBar(character) ?? spellRule(known.spell.id)?.barred?.(character, known.spell)
  if (barred) return { problem: barred }
  if (known.item && (known.itemOnly || fromItem)) {
    const paid = itemCastCost(known.item, known.spell, slot)
    return "problem" in paid ? paid : { cost: paid, known }
  }
  if (known.cantrip) return { cost: { kind: "cantrip" }, known }
  // An invocation's spell cast at will spends nothing, as a cantrip does, unless a higher slot is named.
  if (known.atWill && !(character.sheet && slot !== undefined && slot > known.spell.level && slotFor(character, known.spell.level, slot) === slot)) return { cost: { kind: "cantrip" }, known }
  if (ritual && known.ritual) return { cost: { kind: "ritual" }, known }
  if (!known.prepared && known.from) return known.free > 0 && known.useKey ? { cost: { kind: "free", feature: known.useKey }, known } : { problem: `${name} has no casting left that takes no slot.` }
  // A feature's casting with no slot (Divine Intervention): the only one of a spell not prepared, and of one prepared
  // when no slot of its level or higher is left.
  const given = known.given && { cost: { kind: "free" as const, feature: known.given.feature }, known }
  if (!known.prepared && given) return given
  if (!known.prepared) return { problem: `${name} is in the spellbook and not prepared, so it can only be cast as a Ritual.` }
  const upcast = character.sheet && slot !== undefined && slot > known.spell.level && slotFor(character, known.spell.level, slot) === slot
  if (known.free > 0 && known.useKey && !upcast) return { cost: { kind: "free", feature: known.useKey }, known }
  // An NPC casts by its stat block's counts, and has no slots to fall back on.
  if (!character.sheet) return { problem: `${character.name ?? "This character"} has no casting of ${name} left.` }
  const level = slotFor(character, known.spell.level, slot)
  if (level === undefined) return given ?? { problem: `${character.name ?? "This character"} has no spell slot of level ${known.spell.level} or higher left for ${name}.` }
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
  if (cost.kind === "item" && character.sheet) return { ...character, sheet: withItemCastSpent(character.sheet, cost).sheet }
  return character
}

/**
 * A character with what a casting costs paid, and what happened in words: an item's last charge spent rolls its die
 * with `roll`, and may destroy it (./item-spend `withChargesSpent`). Any other cost is `withCastSpent`.
 */
export function withCastPaid<T extends Slotted>(character: T, cost: CastCost, roll: (sides: number) => number): { character: T; facts: string[] } {
  if (cost.kind !== "item" || !character.sheet) return { character: withCastSpent(character, cost), facts: [] }
  const paid = withItemCastSpent(character.sheet, cost, roll)
  return { character: { ...character, sheet: paid.sheet }, facts: paid.facts }
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
  /** The save failed, and the creature chose to succeed by Legendary Resistance (./legendary-resistance). The caller spends the use. */
  legendary?: true
  /**
   * The save failed, and a class feature of the hero's rerolled it (Indomitable, ./save-rules `rescuedSave`): the dice
   * and total above are the new roll's, `first` the failed total. The caller spends the feature's use, or where another
   * answered it (`by`, Countercharm) that one's Reaction.
   */
  rescued?: { feature: string; name: string; first: number; by?: string }
  /** What auras of those near added to the save (Aura of Protection), already in `bonus`. */
  auras?: string[]
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

// The words after a condition's name that say how long a spell gives it for, and the span each is. "For the duration"
// is the spell's own (`spanOf`). "Until the end of your next turn" falls at the end of the bearer's next turn, as the
// engine runs a round's turns together.
const SPAN_WORDS: readonly (readonly [RegExp, ConditionSpan | "duration"])[] = [
  [/^until the (end|start) of (its|their|the target’s|your) next turn/i, "turn"],
  [/^until the end of the current turn/i, "turn"],
  [/^for 1 minute\b/i, "minute"],
  [/^for (\d+|ten) minutes|^for \d+ (hours?|days?)|^for 1 hour|^until you finish a (Long|Short) Rest/i, "lasting"],
  [/^(\(your choice\) )?(for the duration|until the spell ends)/i, "duration"],
]

/**
 * How long a spell's text gives one of its conditions for, where it says so beside the condition: Sunburst's Blinded
 * "for 1 minute", Color Spray's "until the end of your next turn". None where the text says "for the duration" or
 * nothing, and the spell's own duration holds.
 */
export function conditionSpanOf(spell: Spell, condition: ConditionId): ConditionSpan | undefined {
  const name = conditionName(condition)
  for (const sentence of spell.description.split(/(?<=\.)\s+/)) {
    const named = new RegExp(`\\b${name}\\b[^.]*?\\bconditions?\\b\\s*`).exec(sentence)
    if (!named) continue
    const after = sentence.slice(named.index + named[0].length)
    const found = SPAN_WORDS.find(([words]) => words.test(after))?.[1]
    return found === "duration" ? undefined : found
  }
  return undefined
}

// How a character stands after a spell's harm, in words for the game master.
function standing(character: Castee, fate: Fate | undefined): string {
  if (fate === "dies") return `${character.name} dies.`
  if (fate === "killed") return `${character.name} is killed outright.`
  if (fate === "stable") return `${character.name} is Unconscious and Stable, out of the fight.`
  if (fate === "endures") return enduredWords(character.name, character)
  if (fate === "warded") return wardedWords(character.name)
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
  /** The encounter's floor, for what a hit moves (Repelling Blast's push). */
  floor?: Floor
  /** The spell used again on a later turn, not cast: ./spells `castAgain`. */
  again?: boolean
  /** Cast from a magic item, with the item's save DC and attack bonus where it states them (`spellcastingFor`). */
  item?: boolean
  /**
   * Cast with no spell slot spent, though the spell has a level: a feature's casting that takes none, a Ritual, an
   * invocation's at will. A feature for a spell cast with a spell slot does not reach it (Disciple of Life).
   */
  noSlot?: boolean
  /** What the caster chose for a spell that asks a choice (./spell-rules `choice`). Its first value, when none is. */
  choice?: string
  /** Where a spell whose area stays on the floor is put (./spell-rules `stays`, ./spell-space): its point, and a wall's other end. */
  at?: Point
  to?: Point
}): Cast<T> {
  const { spell } = args
  let characters = [...args.characters]
  const caster = characters.find((character) => character.id === args.casterId)
  const casting = caster && spellcastingFor(caster, spell.id, args.item)
  if (!caster || !casting) throw new Error(`${caster?.name ?? "This character"} cannot cast spells.`)
  const level = caster.sheet?.level ?? 1
  const find = (id: string) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const slot = Math.max(spell.level, args.level ?? spell.level)
  const rule = spellRule(spell.id)
  // What the caster chose, of the values the spell offers, or the first.
  const choice = rule?.choice ? (args.choice && rule.choice.values.includes(args.choice) ? args.choice : rule.choice.values[0]) : undefined
  const targets = [...new Set(args.targets)].filter((id) => find(id)).slice(0, args.measured && (areaOfSpell(spell) || rule?.stays?.wall) ? rule?.count : targetLimit(spell, slot, level, caster))
  // A spell whose one taken gains no benefit from cover (Sacred Flame).
  const covered = (id: string) => (rule?.ignoresCover ? 0 : coverBonus(args.cover?.[id] ?? "none"))
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const attacks: SpellAttack[] = []
  // The slot the cast spends, none for one that spends none: a cantrip, a casting from an item or one with no slot.
  const spent = spell.level >= 1 && !args.item && !args.noSlot && !args.again ? slot : undefined
  const done = (): Cast<T> => {
    // What the caster's class features do once the cast is dealt (Blessed Healer).
    if (!args.again) {
      const after = afterClassCast({ caster: find(caster.id) as T, spell, slot: spent, item: !!args.item, harm, characters, roll: args.roll })
      characters = after.characters
      facts.push(...after.facts)
      harm.push(...after.harm)
    }
    return { characters, targets, ...(attacks[0] ? { attack: attacks[0] } : {}), ...(attacks.length > 1 ? { rays: attacks } : {}), saves, harm, conditions, facts }
  }

  // Casting a spell ends a spell on its caster that ends so (./spell-rules `endsOnCasting`): Invisibility, "The spell
  // ends early immediately after the target ... casts a spell."
  for (const id of args.again ? [] : [...new Set((caster.conditions ?? []).flatMap((entry) => entry.spell ?? []))].filter((id) => spellRule(id)?.endsOnCasting)) {
    put(spellEnded(find(caster.id) as T, (held) => held === id))
    facts.push(`${caster.name} casts a spell, and ${spellById.get(id)?.name ?? id} ends on them.`)
  }
  // A spell that takes Concentration is the one its caster now holds, and one held before ends.
  if (spell.duration.concentration && !args.again) characters = withConcentration(characters, caster.id, spell.id)
  // A spell the engine only tells does nothing more here.
  if (spellLabel(spell) === "told") return done()

  const typeOf = (types: readonly DamageTypeId[]) => (args.damageType && types.includes(args.damageType) ? args.damageType : types[0])
  // What the spell does as it takes effect, or, used again, what it does on a later turn. What it does under a stated
  // condition, or as one option of several (Command's Grovel), is not dealt here, unless the spell's own rules take it
  // (./spell-rules `applies`). Used again, a spell's own rules may name the parts it deals (`again.parts`: Flaming Sphere's ram).
  const usedAgain = rule?.again?.parts
  const now = (part: { timing?: string; appliesWhen?: string; unless?: string; label?: string; condition?: ConditionId }) =>
    args.again ? (usedAgain ? usedAgain(part) : !!part.timing && !part.label) : !part.timing && !part.label && (!part.appliesWhen || !!rule?.applies?.(part, choice))
  // A spell with a second save to come that gives a condition of its own holds its first condition only until that
  // save: the bearer's next turn (Sleep). A later save that gives nothing leaves the span alone (Contagion's).
  const span = spell.saves?.some((save, index) => save.when === "later" && (spell.conditions ?? []).some((link) => link.save === index)) ? "turn" : spanOf(spell)
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
  const give = (id: string, condition: ConditionId, lasting?: ConditionSpan) => {
    const target = find(id)
    if (!target) return
    // A condition lasts as long as the text gives it for (Sunburst's Blinded "for 1 minute"), or the spell's duration.
    // One from a spell that is over at once lasts a turn: Ray of Sickness's Poisoned and Color Spray's Blinded, "until
    // the end of your next turn". A spell's own rules may give the span (`lasting`).
    const given = withCondition(
      target,
      { id: condition, source: caster.id, span: lasting ?? conditionSpanOf(spell, condition) ?? span ?? "turn", spell: spell.id },
      { acted: !!target.isComplete, present: characters }
    )
    if (!given.given) {
      facts.push(`${target.name} cannot be ${conditionName(condition)} and is not.`)
      return
    }
    put(afterHarm(given.character))
    conditions.push({ target: id, condition })
    facts.push(`${target.name} is now ${conditionName(condition)}.`)
  }
  // A spell that misses, or is saved against, still deals half its damage and nothing more, where the caster's class
  // says so (Potent Cantrip).
  const potent = classHalvesAvoided(caster, spell)
  // What the caster's class adds to damage that lands by a save or with no roll (Potent Spellcasting), on its first part.
  const added = args.again ? 0 : classSpellDamage({ caster, spell, item: !!args.item })
  // The dice its damage rolls as it is cast, at their highest where the caster's class says so (Overchannel).
  const damageRoll = !args.again && classSpellDamageMost({ caster, spell, slot: spent }) ? (sides: number) => sides : args.roll
  // A damage roll once its dice have fallen, as the caster's class features change it before it is dealt (Elemental
  // Affinity, Empowered Spell): the first roll of the cast is told so.
  let damageRolls = 0
  const damageOf = (parts: readonly DamagePart[], critical = false): DamageRoll => {
    const rolled = rollDamage(parts, damageRoll, critical)
    if (args.again) return rolled
    const changed = classSpellDamageRolled({ caster: find(caster.id) ?? caster, spell, rolled, first: damageRolls++ === 0, roll: damageRoll })
    facts.push(...changed.facts)
    return changed.rolled
  }
  const plus = (rolled: DamageRoll): DamageRoll => {
    const [first, ...rest] = rolled.parts
    if (!added || !first) return rolled
    const total = Math.max(0, first.total + added)
    return { parts: [{ ...first, bonus: first.bonus + added, total }, ...rest], total: rolled.total - first.total + total }
  }
  // The cast as the spell's own rules see it (./spell-rules).
  const context: CastContext = {
    spell,
    caster,
    casting,
    slot,
    again: !!args.again,
    ...(choice ? { choice } : {}),
    ...(args.at ? { at: args.at } : {}),
    ...(args.to ? { to: args.to } : {}),
    find: (id) => find(id),
    put: (after) => put(after as T),
    harm,
    facts,
    attacks,
    roll: args.roll,
    standing: (character) => standing(character, undefined),
    ...(args.rules ? { rules: args.rules } : {}),
    targets: [],
    everyone: () => characters,
    conditions,
    give,
    save: (target, ability, stakes) => {
      const thrown = rollSave({ target, ability, dc: casting.saveDc, d20: args.d20, roll: args.roll, characters, stakes, ...(stakes.conditions ? { against: stakes.conditions } : {}) })
      saves.push(thrown)
      if (thrown.legendary) {
        const spent = withLegendaryResistanceSpent(find(target.id) ?? (target as T))
        put(spent)
        facts.push(legendaryResistanceWords(target.name, spent))
      }
      if (thrown.rescued) {
        put(withRescueSpent(find(thrown.rescued.by ?? target.id) ?? (target as T), thrown.rescued))
        facts.push(rescueWords(target.name, thrown.rescued, thrown))
      }
      return thrown
    },
  }

  // A creature the spell cannot take: Hold Person takes a Humanoid (./spell-rules `takes`).
  const takes = (id: string) => {
    const target = find(id)
    const refused = target && rule?.takes?.(target, spell)
    if (!refused) return true
    facts.push(refused)
    return false
  }
  // A spell that does nothing to anyone as it is cast takes no one until it is used again (`again.onlyLater`: Flame Blade).
  // The rest of the spell passes by one it settles by how they stand (./spell-rules `settles`: Power Word Kill).
  const taking = rule?.again?.onlyLater && !args.again ? [] : targets.filter(takes).filter((id) => args.again || !rule?.settles?.(context, find(id) as T))
  context.targets = taking

  // The spell attacks: one, or Scorching Ray's rays on the targets in turn.
  if (spell.attack && taking.length) {
    const rays = spell.projectiles ? dartsOf(spell, slot, level) : 1
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
      // A spell on the target may take the hit in their place (Mirror Image's duplicates).
      const imaged = roll.hit ? deflectedHit(target, caster, args.roll) : undefined
      if (imaged?.deflected) {
        put(imaged.character)
        attacks.push({ ...attack, deflected: true })
        facts.push(
          `${what} hits, ${roll.total} against Armor Class ${armorClass}, but strikes one of ${target.name}'s illusory duplicates, which is destroyed. ${target.name} takes no damage. ${imaged.duplicates - 1} duplicates are left.`
        )
        continue
      }
      if (roll.hit) {
        // What a class adds to this hit, beam by beam: a bonus to its damage (Agonizing Blast), a push (Repelling Blast).
        const riders = classSpellHits({ caster: find(caster.id) as T, spell, target, floor: args.floor })
        const bonus = riders.reduce((sum, rider) => sum + (rider.bonus ?? 0), 0)
        if (parts.length) {
          const [first, ...others] = parts
          const given = first.dice ? parseDice(first.dice) : undefined
          const plus = (given?.bonus ?? 0) + bonus
          const added = given && bonus ? `${given.count}d${given.sides}${plus ? ` ${plus < 0 ? "-" : "+"} ${Math.abs(plus)}` : ""}` : undefined
          const thrown = damageOf(added ? [{ ...first, dice: added }, ...others] : parts, roll.critical)
          const rolled = rule?.hitDamage ? rule.hitDamage(thrown, context) : thrown
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
        for (const rider of riders) {
          const struck = find(target.id) as T
          if (!rider.to || struck.dead) continue
          put({ ...struck, position: rider.to })
          facts.push(`${caster.name}'s ${rider.name} pushes ${struck.name} straight away from them.`)
        }
        // What the hit does once its damage is dealt (Vampiric Touch's healing).
        rule?.hit?.(context, attack)
      } else if (parts.length && (rule?.halfOnMiss || potent)) {
        // Half on a miss by the spell's words (Acid Arrow's splash), and a Potent Cantrip's half.
        const rolled = damageOf(parts)
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
  // Heat Metal burns before the save it calls for. A spell on a target may keep it off them (Shield against Magic Missile).
  const sure = spell.attack ? [] : (spell.damage ?? []).filter((entry) => now(entry) && !entry.trigger)
  if (sure.length && taking.length) {
    const darts = spell.projectiles ? dartsOf(spell, slot) : undefined
    const falls = darts ? Array.from({ length: darts }, (_, index) => taking[index % taking.length]) : taking
    const lost = new Map<string, { amount: number; fate?: Fate; type: string }>()
    for (const id of falls) {
      const target = find(id)
      if (target && wardedFrom(target, spell)) continue
      const dealt = hurt(id, plus(damageOf(sure.map(partOf))), (taken) => taken)
      if (dealt) lost.set(id, { amount: (lost.get(id)?.amount ?? 0) + dealt.amount, fate: dealt.fate, type: dealt.type })
    }
    for (const id of new Set(falls)) if (!lost.has(id)) facts.push(`${find(id)?.name}'s Shield turns ${caster.name}'s ${spell.name} aside: no damage.`)
    for (const [id, dealt] of lost) facts.push(`${caster.name}'s ${spell.name} strikes ${find(id)?.name} for ${dealt.amount} ${dealt.type} damage. ${standing(find(id) as T, dealt.fate)}`)
  }

  // Each saving throw the spell calls for as it takes effect, made by every target. A save made only when a creature
  // enters an area or starts or ends its turn there is not made at the cast (Web, Spirit Guardians): ./spell-rounds
  // makes it. A spell's own rules may say otherwise (./spell-rules `savedAtCast`): Heat Metal's save follows its burn.
  let rolledSaves = false
  // Those the caster's class spares succeed at once and take none of its damage (Sculpt Spells).
  const spared = spell.saves?.length && !args.again ? classSpellSpares({ caster, spell, level: slot, taken: taking.flatMap((id) => find(id) ?? []) }) : undefined
  for (const [index, save] of (spell.saves ?? []).entries()) {
    const linked = [...(spell.damage ?? []), ...(spell.conditions ?? [])].filter((entry) => entry.trigger === "failed-save" && entry.save === index)
    const later = !!save.timing || (linked.length > 0 && linked.every((entry) => entry.timing))
    const made = rule?.savedAtCast ? rule.savedAtCast(save, !!args.again, later) : !args.again && save.when === "initial" && !later
    if (!made) continue
    rolledSaves = true
    const guarded = (spell.damage ?? []).filter((entry) => now(entry) && entry.trigger === "failed-save" && entry.save === index)
    const rolled = guarded.length ? plus(damageOf(guarded.map(partOf))) : undefined
    const half = guarded.some((entry) => (entry.onSuccess ?? save.onSuccess) === "half") || potent
    for (const id of taking) {
      const target = find(id)
      if (!target || target.dead) continue
      if (spared?.ids.includes(id)) {
        facts.push(`${caster.name}'s ${spared.name} spares ${target.name}, who succeeds on the saving throw at once${rolled ? " and takes no damage" : ""}.`)
        rule?.passedSave?.(context, target)
        continue
      }
      // One who succeeds with no roll, by the spell's words (Sleep's creatures that don't sleep).
      const passed = rule?.passes?.(target)
      if (passed) {
        facts.push(passed)
        continue
      }
      const against = (spell.conditions ?? []).filter((link) => link.trigger === "failed-save" && link.save === index).map((link) => link.condition)
      // What failing would cost: the conditions, and the damage beyond what a success still takes.
      const full = rolled ? damageTaken(rolled, defensesOf(target)) : 0
      const stakes = { conditions: against, damage: full - (half ? Math.floor(full / 2) : 0) }
      const thrown = rollSave({
        target,
        ability: save.ability,
        dc: casting.saveDc,
        d20: args.d20,
        roll: args.roll,
        characters,
        cover: covered(id),
        also: rule?.saveModes?.(target) ?? [],
        against,
        stakes,
      })
      saves.push(thrown)
      // A Legendary creature that chose to succeed has spent a use of Legendary Resistance, told before the rest.
      if (thrown.legendary) {
        const spent = withLegendaryResistanceSpent(target)
        put(spent)
        facts.push(legendaryResistanceWords(target.name, spent))
      }
      if (thrown.rescued) {
        put(withRescueSpent(find(thrown.rescued.by ?? id) ?? target, thrown.rescued))
        facts.push(rescueWords(target.name, thrown.rescued, thrown))
      }
      const { success } = thrown
      const verdict = `${target.name} ${success ? "SUCCEEDS on" : "FAILS"} the saving throw against ${caster.name}'s ${spell.name} (${thrown.total} against DC ${casting.saveDc})`
      // All, half or none, as the save and Evasion leave it (./save-rules).
      const settled = (taken: number) => damageOnSave(target, { ability: save.ability, success, half }, taken)
      const evaded = rolled ? settled(0).evaded : undefined
      if (rolled && (!success || half) && !(success && evaded)) {
        const dealt = hurt(id, rolled, (taken) => settled(taken).amount)
        facts.push(`${verdict} and takes ${dealt?.amount ?? 0} ${dealt?.type ?? ""} damage${evaded ? `, halved by ${evaded}` : ""}. ${standing(find(id) as T, dealt?.fate)}`.replace("  ", " "))
      } else facts.push(`${verdict}${rolled ? ` and takes no damage${evaded ? ` (${evaded})` : ""}` : ""}.`)
      if (!success) for (const link of spell.conditions ?? []) if (now(link) && link.trigger === "failed-save" && link.save === index) give(id, link.condition)
      // What the save does beyond the data, by the spell's own rules (Heat Metal's drop).
      if (success) rule?.passedSave?.(context, target)
      else rule?.failedSave?.(context, target)
    }
  }

  // Healing as the spell takes effect. Temporary hit points and healing that comes later are not dealt here. The
  // caster's class may add to it (Disciple of Life) or count its dice at their most (Supreme Healing), as Beacon of Hope
  // on the one healed does.
  const healing = spell.healing
  if (healing && now(healing) && !healing.temporary && !args.again) {
    const classed = classSpellHealing({ caster, spell, slot: spent })
    for (const id of taking) {
      const target = find(id)
      if (!target) continue
      // Healing in the spell's own words, in place of the data's (Revivify's return to life).
      if (rule?.heals?.(context, target)) continue
      if (target.dead) continue
      const dice = raised(healing.dice, healing.perSlot, above)
      const most = healsMost(target) || classed.most
      const rolled = dice ? rollDamage([{ dice, type: "force" }], most ? (sides) => sides : args.roll) : undefined
      const bonus = (rolled?.parts[0]?.bonus ?? 0) + (healing.modifier ? casting.modifier : 0) + (healing.perSlotAmount ?? 0) * above + classed.bonus
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
      // Fiendish Vigor: cast with no slot, "you automatically get the highest number on the die".
      const most = slot === spell.level && spellsOf(caster).find((known) => known.spell.id === spell.id)?.from === "fiendish-vigor"
      const rolled = dice ? rollDamage([{ dice, type: "force" }], most ? (sides) => sides : args.roll).total : (healing.amount ?? 0)
      const amount = rolled + (healing.modifier ? casting.modifier : 0) + (healing.perSlotAmount ?? 0) * above
      if (amount > (target.tempHitPoints ?? 0)) put({ ...target, tempHitPoints: amount })
      facts.push(`${target.name} gains ${amount} Temporary Hit Points.`)
    }
  }

  // A spell that lasts stays on those it took: everyone named, or only those who failed its save, or the one its spell
  // attack hit. One its caster holds alone (Spirit Guardians, the spells used again on later turns) stays on them, with the slot.
  if (lasts(spell) && !args.again) {
    const first = attacks[0]
    const taken = heldByCaster(spell.id)
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
          ...(choice ? { choice } : {}),
          // An area that stays on the floor stands where it was put, held on its caster (./floor-areas).
          ...(args.at && rule?.stays && id === caster.id ? { at: args.at } : {}),
          ...(args.to && rule?.stays && id === caster.id ? { to: args.to } : {}),
        })
      )
      facts.push(args.at && rule?.stays && id === caster.id ? `${caster.name}'s ${spell.name} now stands on the floor.` : `${spell.name} is now on ${target.name}.`)
      // Aid raises the current hit points with the maximum.
      if (spell.hitPointMaximum && amount) {
        const raisedUp = withHealing(find(id) as T, amount)
        put(raisedUp)
        facts.push(`${target.name}'s hit point maximum and hit points rise by ${amount}. ${standing(raisedUp, undefined)}`)
      }
    }
  }

  // An area on the floor used again moves to where it is put now (Moonbeam's beam, Flaming Sphere's ram).
  if (args.again && args.at && rule?.stays) {
    const holder = find(caster.id) as T
    const moved = (holder.spellEffects ?? []).map((effect) => (effect.spell === spell.id && effect.by === caster.id && effect.at ? { ...effect, at: args.at as Point } : effect))
    put({ ...holder, spellEffects: moved })
  }

  // What the spell's own rules leave once the rest is done (Acid Arrow's later burn).
  if (!args.again) rule?.cast?.(context)

  return done()
}

/**
 * The spells a character may use again this turn, with no new slot: those they cast and still hold, each with the slot
 * it was cast at and what it takes, an action or a Bonus Action (./spell-rules `again`). For the turn's menu, beside the
 * spells they can cast. `unplaced` is one whose force the floor does not hold, so it is not measured (Spiritual Weapon).
 * `reach` is how far from them it reaches, where its range does not say (Produce Flame). A spell with no Concentration
 * is held while its effect lasts.
 */
export function againOf(character: { id?: string; spellEffects?: readonly SpellEffect[]; concentration?: Concentration }): HeldAgain[] {
  return (character.spellEffects ?? []).flatMap((effect) => {
    const spell = spellById.get(effect.spell)
    const again = spellRule(effect.spell)?.again
    if (!spell || !again || effect.by !== character.id || (spell.duration.concentration && character.concentration?.spell !== effect.spell)) return []
    return heldAgain(spell, effect.amount ?? spell.level) ?? []
  })
}

/** A spell its caster may use again, at the slot it was cast at (`againOf`). */
export type HeldAgain = { spell: Spell; slot: number; takes: "action" | "bonus-action"; unplaced?: true; reach?: number }

/**
 * A spell as it is used again at a slot, by its own rules (./spell-rules `again`): for one held, and for one cast with a
 * Bonus Action and used with the action the same turn (Flame Blade). None for a spell that is not used again.
 */
export function heldAgain(spell: Spell, slot: number): HeldAgain | undefined {
  const again = spellRule(spell.id)?.again
  if (!again) return undefined
  return { spell, slot, takes: again.takes, ...(again.unplaced ? { unplaced: true as const } : {}), ...(again.reach ? { reach: again.reach } : {}) }
}

/** Whether a spell makes its spell attack as it is cast: not one whose attack comes only as it is used again (Flame Blade). */
export const attacksWhenCast = (spell: Spell): boolean => !!spell.attack && !spellRule(spell.id)?.again?.onlyLater

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

// The number a lasting effect holds: Aid's rise in hit points, the number its own rules give by the slot (./spell-rules
// `amount`: Mirror Image's three duplicates), and the slot of a spell its caster holds.
function effectAmount(spell: Spell, slot: number): number | undefined {
  if (spell.hitPointMaximum) return (spell.hitPointMaximum.amount ?? 0) + (spell.hitPointMaximum.perSlotAmount ?? 0) * (slot - spell.level)
  const held = heldRule(spell.id)
  if (held?.amount) return held.amount(slot)
  if (held?.byCaster) return slot
  return undefined
}

/**
 * A saving throw a creature makes against a spell or another magical effect: every caller's is one (a spell's save, a
 * save a lasting spell has repeated, the caster's save against Counterspell, a Channel Divinity's). So Magic
 * Resistance gives it Advantage. The d20 or two, the save bonus, cover on a Dexterity save, the dice
 * of spells on them (Bless, Bane), Slow's −2 on Dexterity, and the Advantage and Disadvantage of their conditions,
 * actions and spells (Haste, Beacon of Hope), of their species against the conditions at stake (`against`: Fey
 * Ancestry on Charmed), and of the spell itself (`also`). A condition may fail it outright. A stat block's action
 * that is not magic (a breath weapon) passes `magical: false`, and Magic Resistance gives nothing against it. A
 * magical effect that is not a spell (a Channel Divinity) passes `spell: false`, and a hero's worn item gives Advantage
 * against spells alone gives nothing against it (./item-effects): a Mantle of Spell Resistance.
 *
 * A Legendary creature that fails may choose to succeed (./legendary-resistance), judged on `stakes`: what the failure
 * would cost it. A caller that gives no stakes is never answered so, and one that gives them spends the use when the
 * save comes back `legendary`.
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
  /** What a failure would cost the one who saves, for Legendary Resistance. */
  stakes?: SaveStakes
  /** False for an effect that is not magic, a breath weapon's: Magic Resistance gives nothing against it. */
  magical?: false
  /** False for a magical effect that is not a spell, a Channel Divinity's. */
  spell?: false
}): SaveRoll {
  const { target, ability } = args
  const check: Check = { kind: "save", ability }
  const failedBy = saveFailedBy(target, check)
  const sources = [
    ...checkModesFrom(target, check, args.characters),
    ...checkModesFromActions(target, check, args.characters),
    ...saveModesFromSpells(target, ability, args.against),
    ...speciesSaveModes(target, ability, args.against),
    ...(args.magical === false ? [] : magicSaveModes(target)),
    ...itemSaveModes(target.sheet, args.against, args.magical === false ? "other" : args.spell === false ? "magic" : "spell"),
    ...classCheckModes(target, check),
    ...(args.also ?? []),
  ]
  const mode = combineModes(sources.map((source) => source.mode))
  const dice = Array.from({ length: mode === "normal" ? 1 : 2 }, () => args.d20())
  const natural = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0]
  // Cover adds to a Dexterity save, and an aura of one near (Aura of Protection) to any save.
  const aura = auraSaveBonus(target, args.characters)
  const bonus = checkBonus(target, check) + (ability === "dex" ? (args.cover ?? 0) : 0) + saveBonusFromSpells(target, ability) + aura.amount
  // A lasting spell on the target adds its dice to the save, or takes them away.
  const adds = rollAdds(target, "saving-throws", args.roll)
  // A feature may let a score stand in for a lower total (Indomitable Might).
  const total = Math.max(classTotalFloor(target, check) ?? 0, natural + bonus + adds.reduce((sum, add) => sum + add.amount, 0))
  const passed = !failedBy && total >= args.dc
  const legendary = !passed && !!args.stakes && spendsLegendaryResistance(target, args.stakes)
  // A hero's class may still reroll a failed save against harm (Indomitable).
  const rescue =
    !passed && !legendary && !failedBy && args.stakes
      ? rescuedSave({
          character: target,
          ability,
          result: { dice, natural, bonus, total, dc: args.dc, success: false, mode, ...(adds.length ? { adds } : {}) },
          stakes: args.stakes,
          d20: args.d20,
          roll: args.roll,
          present: args.characters,
        })
      : undefined
  const success = passed || legendary || !!rescue?.result.success
  return {
    target: target.id,
    ability,
    dice: rescue?.result.dice ?? dice,
    natural: rescue?.result.natural ?? natural,
    bonus,
    total: rescue?.result.total ?? total,
    dc: args.dc,
    success,
    mode: rescue?.result.mode ?? mode,
    ...(failedBy ? { failedBy } : {}),
    ...((rescue?.result.adds ?? adds).length ? { adds: rescue?.result.adds ?? adds } : {}),
    ...(legendary ? { legendary: true as const } : {}),
    ...(rescue ? { rescued: { feature: rescue.feature, name: rescue.name, first: total, ...(rescue.by ? { by: rescue.by } : {}) } } : {}),
    ...(aura.from.length ? { auras: aura.from } : {}),
  }
}

/** The modes that fall on a spell attack from the conditions and actions of the caster and the target. */
type Bearer = Parameters<typeof attackModesFrom>[0] & Parameters<typeof attackModesFromActions>[0]
export function spellAttackModes(caster: Bearer, target: Bearer, spell: Spell, present?: readonly Bearer[]) {
  return [
    ...attackModesFrom(caster, target, isNear(caster, target, spell.attack ?? "ranged"), present),
    ...attackModesFromActions(caster, target, present),
    ...classSpellAttackModes(caster, spell),
    // An area that hides one from the other, as fog does (./floor-areas).
    ...obscuredModes(caster, target, present),
  ]
}

export { spellById }
