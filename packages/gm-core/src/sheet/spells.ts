import type { AbilityId, ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { monsterById } from "@d20/srd/monsters"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { attackModesFromActions, checkModesFromActions } from "./actions"
import { type AttackResult, type DamagePart, type DamageRoll, damageTaken, defensesOf, resolveAttack, rollDamage } from "./attack"
import { type Check, checkBonus, combineModes, type Roller, type RollMode } from "./check"
import { CONDITION_SPANS, type ConditionEntry, type ConditionSpan } from "./condition-entry"
import { attackModesFrom, checkModesFrom, conditionName, d20Penalty, saveFailedBy, withCondition } from "./conditions"
import { afterHarm, type DeathRules, type DeathSaves, type Fate, withDamage, withHealing } from "./death"
import { deriveSheet } from "./derive"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { type Cover, coverBonus, isNear } from "./space"
import { lasts, type RollAdd, rollAdds, withConcentration, withSpellEffect } from "./spell-effects"
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
  /** Spell slots by spell level, the first for level 1. */
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
 * How many creatures a spell takes. On a floor an area takes whoever stands in it (./spell-space). Where there is no
 * floor it takes as many as its size allows: a cone one for each 10 feet, a cube one for each 5 feet of its side, a sphere, cylinder or emanation one
 * for each 5 feet of its radius, a line one for each 30 feet, each rounded up. Magic Missile takes one for each dart.
 * Any other spell takes one. Cast with a slot above its level (`slot`), a spell takes the creatures its text adds for
 * each level above (Bless, Charm Person), and Magic Missile its extra darts.
 */
// Spells whose text takes "up to three creatures" with no area: the count is in their words alone.
const SEVERAL: Record<string, number> = { bless: 3, bane: 3 }

export function targetLimit(spell: Spell, slot = spell.level): number {
  const above = Math.max(0, slot - spell.level)
  const area = spell.range.area
  if (area) return Math.max(1, Math.ceil(area.size / (area.shape === "cone" ? 10 : area.shape === "line" ? 30 : 5)))
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
}

type Slotted = Roller & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

/**
 * The spells a hero can cast, from the sheet: the cantrips known, the spells prepared, and for a Wizard the Ritual
 * spells of the spellbook. A hero with no sheet, and an NPC, has none here.
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
  const add = (id: string, how: Pick<KnownSpell, "cantrip" | "prepared">) => {
    const spell = spellById.get(id)
    const given = free.get(id)
    if (spell && !found.some((known) => known.spell.id === id)) found.push({ spell, ...how, ritual: spell.ritual, free: given?.left ?? 0, ...(given ? { useKey: given.key } : {}) })
  }
  for (const id of derived.cantrips) add(id, { cantrip: true, prepared: true })
  for (const id of derived.preparedSpells) add(id, { cantrip: false, prepared: true })
  if (cls?.spellcasting?.ritualFromSpellbook) for (const id of derived.spellbook) if (spellById.get(id)?.ritual) add(id, { cantrip: false, prepared: false })
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
  spellEffects?: readonly SpellEffect[]
  concentration?: Concentration
  tempHitPoints?: number
  isComplete?: boolean
}

export type Cast<T> = {
  characters: T[]
  /** Everyone the spell took, of those named: as many as it takes, and only those who are here. */
  targets: string[]
  attack?: SpellAttack
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
  /** For a spell cast for one skill (Guidance), the skill. */
  skill?: SkillId
  /** The slot level it is cast at, when above the spell's own: a hero's higher slot, or a Mage's "Fireball (level 4 version)". */
  level?: number
  /** The cover each target has from where the spell comes: it adds to Armor Class against the spell attack and to a Dexterity save. */
  cover?: Readonly<Record<string, Cover>>
  /** An area was measured on the floor (./spell-space): the spell takes everyone named, however many. */
  measured?: boolean
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
  const slot = Math.max(spell.level, args.level ?? spell.level)
  const targets = [...new Set(args.targets)].filter((id) => find(id)).slice(0, args.measured && spell.range.area ? undefined : targetLimit(spell, slot))
  const covered = (id: string) => coverBonus(args.cover?.[id] ?? "none")
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const typeOf = (types: readonly DamageTypeId[]) => (args.damageType && types.includes(args.damageType) ? args.damageType : types[0])
  // What the spell does as it takes effect. What it does later, under a stated condition, or as one option of several
  // (Command's Grovel) is not dealt here.
  const now = (part: { timing?: string; appliesWhen?: string; unless?: string; label?: string }) => !part.timing && !part.appliesWhen && !part.label
  // A spell with a second save to come holds its first condition only until that save: the bearer's next turn (Sleep).
  const span = spell.saves?.some((save) => save.when === "later") ? "turn" : spanOf(spell)
  // A spell cast with a slot above its own level adds what its text gives for each level above: damage and healing
  // dice, fixed healing, creatures (in `targets` above) and darts.
  const above = slot - spell.level
  const partOf = (entry: NonNullable<Spell["damage"]>[number]): DamagePart => {
    const dice = raised(cantripDice(entry, level), entry.perSlot, above)
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
    const given = withCondition(target, { id: condition, source: caster.id, span, spell: spell.id }, { acted: !!target.isComplete })
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
    const bare = combatStatsOf(target)?.armorClass
    if (bare === undefined) throw new Error(`${target.name} has no sheet or stat block to attack.`)
    const armorClass = bare + covered(target.id)
    const mode = args.mode ?? "normal"
    const dice = [...(args.attackDice ?? [])]
    while (dice.length < (mode === "normal" ? 1 : 2)) dice.push(args.d20())
    const roll = resolveAttack({ dice, bonus: casting.attackBonus - d20Penalty(caster), armorClass, mode, adds: rollAdds(caster, "attack-rolls", args.roll) })
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
      // Cover adds to a Dexterity save.
      const bonus = checkBonus(target, check) + (save.ability === "dex" ? covered(id) : 0)
      // A lasting spell on the target adds its dice to the save, or takes them away.
      const adds = rollAdds(target, "saving-throws", args.roll)
      const total = natural + bonus + adds.reduce((sum, add) => sum + add.amount, 0)
      const success = !failedBy && total >= casting.saveDc
      saves.push({ target: id, ability: save.ability, dice, natural, bonus, total, dc: casting.saveDc, success, mode, ...(failedBy ? { failedBy } : {}), ...(adds.length ? { adds } : {}) })
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
    const darts = spell.projectiles ? dartsOf(spell, slot) : undefined
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
      const dice = raised(healing.dice, healing.perSlot, above)
      const rolled = dice ? rollDamage([{ dice, type: "force" }], args.roll) : undefined
      const bonus = (rolled?.parts[0]?.bonus ?? 0) + (healing.modifier ? casting.modifier : 0) + (healing.perSlotAmount ?? 0) * above
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

  // Temporary Hit Points as the spell takes effect (False Life). They do not stack: the higher stands.
  if (healing?.temporary && !healing.timing) {
    for (const id of targets.length ? targets : [caster.id]) {
      const target = find(id)
      if (!target || target.dead) continue
      const dice = raised(healing.dice, healing.perSlot, above)
      const rolled = dice ? rollDamage([{ dice, type: "force" }], args.roll).total : (healing.amount ?? 0)
      const amount = rolled + (healing.modifier ? casting.modifier : 0) + (healing.perSlotAmount ?? 0) * above
      if (amount > (target.tempHitPoints ?? 0)) put({ ...target, tempHitPoints: amount })
      facts.push(`${target.name} gains ${amount} Temporary Hit Points.`)
    }
  }

  // A spell that lasts stays on those it took: everyone named, or only those who failed its save, or the one its
  // spell attack hit. A spell that takes Concentration is the one its caster now holds, and one held before ends.
  if (spell.duration.concentration) characters = withConcentration(characters, caster.id, spell.id)
  if (lasts(spell)) {
    const saved = spell.saves?.some((save) => save.when === "initial")
    const taken = saved ? saves.filter((save) => !save.success).map((save) => save.target) : spell.attack ? (attack?.roll.hit ? [attack.target] : []) : targets.length ? targets : [caster.id]
    const turns = span ? CONDITION_SPANS[span] : undefined
    for (const id of taken) {
      const target = find(id)
      if (!target || target.dead) continue
      // Heroism's Temporary Hit Points are the caster's spellcasting ability modifier, at the start of each of the target's turns.
      const each = healing?.temporary && healing.timing ? { amount: casting.modifier } : {}
      put(withSpellEffect(target, { spell: spell.id, by: caster.id, ...(turns ? { turns: turns + (target.isComplete ? 1 : 0) } : {}), ...each, ...(args.skill ? { skill: args.skill } : {}) }))
      facts.push(`${spell.name} is now on ${target.name}.`)
    }
  }

  return { characters, targets, ...(attack ? { attack } : {}), saves, harm, conditions, facts }
}

/** The modes that fall on a spell attack from the conditions and actions of the caster and the target. */
type Bearer = Parameters<typeof attackModesFrom>[0] & Parameters<typeof attackModesFromActions>[0]
export function spellAttackModes(caster: Bearer, target: Bearer, spell: Spell, present?: readonly Bearer[]) {
  return [...attackModesFrom(caster, target, isNear(caster, target, spell.attack ?? "ranged"), present), ...attackModesFromActions(caster, target, present)]
}

export { spellById }
