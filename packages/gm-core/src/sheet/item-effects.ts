import type { AbilityId, ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import { abilities } from "@d20/srd/abilities"
import { conditions } from "@d20/srd/conditions"
import { damageTypes } from "@d20/srd/damage-types"
import { equipment } from "@d20/srd/equipment"
import type { MagicItem } from "@d20/srd/schema/magic-items"
import { skills } from "@d20/srd/skills"
import type { Check } from "./check"
import { isActive, itemOf } from "./items"
import type { OwnedItem, Sheet } from "./sheet"

/**
 * The standing effects of a magic item that its typed data has no field for, read from its text sentence by sentence
 * (`readItem`), and what the hero's working items give by them. Only an effect that holds while the item is worn or
 * held, and attuned where it needs Attunement, is read: nothing activated, nothing with charges or uses, nothing cast.
 *
 * A sentence is read only when every clause of it is one the reader knows, word for word, after a lead such as "While
 * you wear these boots," or a trail such as "while wearing this ring". Any other sentence is told to the game master,
 * and once a sentence that is told opens a list (a colon, "the following"), every sentence after it is told too, since
 * what follows may hold only for a kind of the item or under a condition (a Ring of Elemental Command's plane, a Belt
 * of Dwarvenkind's wearer who is no dwarf). A consumable item is drunk or read, never worn, so none of it is read.
 *
 * Each effect goes where the engine keeps that kind of thing for a hero:
 *
 * - Resistance and Immunity to damage: ./derive `resistances` and `immunities`, which ./attack `defensesOf` reads. A
 *   Ring or Armor of Resistance gives the type the GM chose, kept on the entry as `damageType`.
 * - Immunity to a condition: ./conditions `immuneTo`, which `withCondition` asks.
 * - A set ability score (Gauntlets of Ogre Power's 19, a Belt of Giant Strength's typed score) and a raised one: the
 *   scores ./derive works from, so the modifier and all that follows from it move with it.
 * - Speed: a walking Speed the item raises to, and a Swim or Climb Speed, in ./derive.
 * - Senses: ./derive `senses`. Goggles of Night lengthen a Darkvision the hero has by 60 feet.
 * - Advantage on a skill's checks and on Initiative: ./check `sheetModes` and ./initiative `rollInitiative`.
 * - Advantage on saving throws against spells, or to avoid or end a condition: ./spells `rollSave` and ./spell-effects
 *   `saveModesFor`.
 * - Bracers of Defense's typed 2 to Armor Class with no armor and no Shield: ./items `itemBonus`.
 * - Bracers of Archery's training with the Longbow and Shortbow and 2 to their damage: ./attack.
 */

export type SaveAgainst = "spells" | "magic" | ConditionId

export type ItemEffect =
  | { kind: "resistance"; types: DamageTypeId[] }
  /** Resistance to the one type the GM chooses from `options`, kept on the owned entry. */
  | { kind: "chosen-resistance"; options: DamageTypeId[] }
  | { kind: "immunity"; types: DamageTypeId[] }
  | { kind: "condition-immunity"; conditions: ConditionId[] }
  /** The score is this while the item works, unless the hero's own is higher. "variant" is the variant's typed Strength. */
  | { kind: "score"; ability: AbilityId; score: number | "variant" }
  /** The score rises by `by`, to no more than `maximum`. */
  | { kind: "raise"; ability: AbilityId; by: number; maximum: number }
  /** The walking Speed is this many feet unless it is already higher. */
  | { kind: "walk"; feet: number }
  /** Heavy Armor whose Strength the hero lacks does not slow them. */
  | { kind: "unslowed" }
  /** A Swim or Climb Speed of so many feet, or "walk" for one equal to the walking Speed. */
  | { kind: "speed"; mode: "swim" | "climb"; feet: number | "walk" }
  /** A sense out to `range` feet. `lengthens` is how far it lengthens one of that sense the hero already has. */
  | { kind: "sense"; type: "darkvision" | "truesight" | "blindsight" | "tremorsense"; range: number; lengthens?: number }
  | { kind: "check-advantage"; skill: SkillId }
  | { kind: "initiative-advantage" }
  | { kind: "save-advantage"; against: SaveAgainst }
  /** A bonus to Armor Class while the hero wears no armor and carries no Shield. */
  | { kind: "unarmored-armor-class"; value: number }
  /** Training with these weapons, by equipment id, and a bonus to their damage rolls. */
  | { kind: "weapons"; weapons: string[]; damage: number }

/** What the reader made of an item's text: the effects it read, and the sentences it did not, which are told. */
export type ItemReading = { effects: ItemEffect[]; told: string[] }

const byName = <T extends { id: string; name: string }>(list: readonly T[]) => new Map(list.map((entry) => [entry.name.toLowerCase(), entry.id]))
const DAMAGE_TYPES = byName(damageTypes)
const CONDITIONS = byName(conditions)
const ABILITIES = byName(abilities)
const SKILLS = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]))
const WEAPONS = byName(equipment.filter((entry) => entry.kind === "weapon"))

const ABILITY = "(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)"
// Who wears or holds what, after "While" or "while": "you wear these boots", "wearing this ring", "holding this Shield".
// The thing worn is at most three words, none of which starts a condition, so "the cloak in an area of Dim Light" is not one.
const WORN = "(?:you wear|wearing|you hold|holding) (?:it|them|(?:this|these|the)(?: (?!in\\b|on\\b|while\\b|if\\b|when\\b|at\\b|during\\b|under\\b)[A-Za-z-]+){1,3})"
const LEAD = new RegExp(`^(?:In addition, )?While ${WORN}, `, "i")
const TRAIL = new RegExp(` while ${WORN}$`)
const ABILITY_ID = (name: string) => ABILITIES.get(name.toLowerCase()) as AbilityId

// "Fire", "Bludgeoning, Piercing, and Slashing", "Poison and Psychic", "Bludgeoning, Piercing, or Slashing": every
// name a damage type, or none.
function damageList(words: string): DamageTypeId[] | undefined {
  const names = words.split(/,? (?:and|or) |, /)
  const types = names.map((name) => DAMAGE_TYPES.get(name.trim().toLowerCase()))
  return types.every(Boolean) ? (types as DamageTypeId[]) : undefined
}

// "Dexterity (Stealth) checks", "Initiative rolls", "Wisdom (Perception) checks": a skill's checks with its own ability.
function advantageOn(words: string): ItemEffect[] | undefined {
  const parts = words.split(/ and (?:on )?/)
  const effects: ItemEffect[] = []
  for (const part of parts) {
    if (part === "Initiative rolls") {
      effects.push({ kind: "initiative-advantage" })
      continue
    }
    const found = new RegExp(`^${ABILITY} \\(([A-Za-z ]+)\\) checks$`).exec(part)
    const skill = found && SKILLS.get(found[2].toLowerCase())
    if (!found || !skill || skill.ability !== ABILITY_ID(found[1])) return undefined
    effects.push({ kind: "check-advantage", skill: skill.id as SkillId })
  }
  return effects
}

/** The damage types a choice of the item may be: its table's damage types, the types its sentence lists, or every type. */
function tableTypes(item: MagicItem): DamageTypeId[] {
  const column = item.tables?.[0]?.columns.findIndex((name) => name === "Damage Type" || name === "Resistance") ?? -1
  if (column < 0) return damageTypes.map((type) => type.id as DamageTypeId)
  return [...new Set((item.tables?.[0]?.rows ?? []).map((row) => DAMAGE_TYPES.get(row.cells[column]?.toLowerCase() ?? "") as DamageTypeId))].filter(Boolean)
}

// One clause of a standing sentence, with its lead and trail taken off: "you have Resistance to Fire damage". The
// effects it gives, or none when it is not one the reader knows.
function readClause(clause: string, item: MagicItem): ItemEffect[] | undefined {
  const text = clause.replace(/^(you|your) /i, (word) => word.toLowerCase()).replace(/^you also /, "you ")
  let found: RegExpExecArray | null
  if (/^you have Resistance to one (?:damage type|type of damage)(?: determined by the kind of dragon that provided the scales \(see the accompanying table\))?$/.test(text))
    return [{ kind: "chosen-resistance", options: tableTypes(item) }]
  if ((found = /^you have Resistance to one of the following damage types: (.+)$/.exec(text))) {
    const options = damageList(found[1])
    return options && [{ kind: "chosen-resistance", options }]
  }
  if ((found = /^you have Resistance to (.+) damage$/.exec(text))) {
    const types = damageList(found[1])
    return types && [{ kind: "resistance", types }]
  }
  if ((found = /^you have Immunity to (?:the (\w+) condition and )?(.+) damage$/.exec(text))) {
    const types = damageList(found[2])
    const condition = found[1] && CONDITIONS.get(found[1].toLowerCase())
    if (!types || (found[1] && !condition)) return undefined
    return [...(condition ? [{ kind: "condition-immunity" as const, conditions: [condition as ConditionId] }] : []), { kind: "immunity", types }]
  }
  if ((found = /^you have Immunity to the (\w+) condition$/.exec(text))) {
    const condition = CONDITIONS.get(found[1].toLowerCase())
    return condition ? [{ kind: "condition-immunity", conditions: [condition as ConditionId] }] : undefined
  }
  if ((found = new RegExp(`^your ${ABILITY} is (\\d+)$`).exec(text))) return [{ kind: "score", ability: ABILITY_ID(found[1]), score: Number(found[2]) }]
  if ((found = new RegExp(`^your ${ABILITY} changes to a score granted by the \\w+$`).exec(text)))
    return item.variants?.every((variant) => variant.strength !== undefined) && found[1] === "Strength" ? [{ kind: "score", ability: "str", score: "variant" }] : undefined
  if ((found = new RegExp(`^your ${ABILITY} increases by (\\d+), to a maximum of (\\d+)$`).exec(text)))
    return [{ kind: "raise", ability: ABILITY_ID(found[1]), by: Number(found[2]), maximum: Number(found[3]) }]
  if ((found = /^your Speed becomes (\d+) feet unless your Speed is higher$/.exec(text))) return [{ kind: "walk", feet: Number(found[1]) }]
  if (text === "your Speed isn’t reduced by you carrying weight in excess of your carrying capacity or wearing Heavy Armor") return [{ kind: "unslowed" }]
  if ((found = /^you have an? (Swim|Climb) Speed of (\d+) feet$/.exec(text))) return [{ kind: "speed", mode: found[1].toLowerCase() as "swim", feet: Number(found[2]) }]
  if ((found = /^you have an? (Swim|Climb) Speed(?: and an? (Swim|Climb) Speed)? equal to your Speed$/.exec(text)))
    return found
      .slice(1)
      .filter(Boolean)
      .map((mode) => ({ kind: "speed", mode: mode.toLowerCase() as "swim", feet: "walk" }))
  if ((found = /^you have (Darkvision|Truesight|Blindsight|Tremorsense) (?:out to|with a range of) (\d+) feet$/.exec(text)))
    return [{ kind: "sense", type: found[1].toLowerCase() as "darkvision", range: Number(found[2]) }]
  if ((found = /^you have (Darkvision|Truesight|Blindsight|Tremorsense) and (Darkvision|Truesight|Blindsight|Tremorsense), both with a range of (\d+) feet$/.exec(text)))
    return [found[1], found[2]].map((type) => ({ kind: "sense", type: type.toLowerCase() as "darkvision", range: Number(found?.[3]) }))
  if ((found = /^you have Advantage on saving throws (?:made |you make )?to avoid or end the (\w+) condition$/.exec(text))) {
    const condition = CONDITIONS.get(found[1].toLowerCase())
    return condition ? [{ kind: "save-advantage", against: condition as ConditionId }] : undefined
  }
  if ((found = /^you have Advantage on saving throws against spells( and other magical effects)?$/.exec(text))) return [{ kind: "save-advantage", against: found[1] ? "magic" : "spells" }]
  if ((found = /^you have Advantage on (.+)$/.exec(text))) return advantageOn(found[1])
  return undefined
}

// A typed Armor Class bonus that holds under a condition the sheet can judge, by the data's words for it.
const JUDGED_ARMOR_CLASS = new Set(["if you are wearing no armor and using no Shield"])

// Sentences that state no rule, by their exact words: what the item looks like.
const NO_RULE = new Set(["This delicate silver chain has a brilliant-cut black gem pendant.", "The Shield is emblazoned with a symbol of an eye."])
// The sentence that opens a list of properties: "This rod has the following properties."
const PROPERTIES = /^This \w+ has the following properties\.$/

// A property's name standing as its own sentence: "Cold Resistance.", "All-Around Vision.".
const HEADING = /^[A-Z][\w’'-]*(?: (?:of|the|and|[A-Z][\w’'-]*)){0,3}\.$/
// The sentence that opens a list of benefits: "While wearing them, you gain the following benefits."
const BENEFITS = new RegExp(`^(?:While ${WORN}, )?you gain (?:the following|these) benefits(?: while ${WORN})?(?:: [A-Z][\\w’'-]*(?: [A-Z][\\w’'-]*)*)?\\.$`, "i")
// The sentence that says the GM chooses the type an item resists, after the one that gives the Resistance.
const CHOSEN =
  /^(?:The gemstone in the ring indicates the type, which the GM chooses or determines randomly by rolling on the following table|The GM chooses the type or determines it randomly(?: by rolling on the following table)?)\.$/
// The sentence after a set score: the item does nothing for one whose own score is as high.
const FLOOR = new RegExp(
  `^(?:They have|It has|The item has) no effect on you if your ${ABILITY} (?:is (\\d+) or higher without (?:them|it)|without the \\w+ is equal to or greater than the \\w+’s score)\\.$`
)
// The sentence after a score the variants type: "The type of giant determines the score (see the table below)."
const BY_VARIANT = /^The type of \w+ determines the score \(see the table below\)\.$/
// "you have proficiency with the Longbow and Shortbow, and you gain a +2 bonus to damage rolls made with such weapons"
const WEAPONS_CLAUSE = /^you have proficiency with the (.+?), and you gain a \+(\d+) bonus to damage rolls made with such weapons$/

// A sentence's body, with its lead or trail taken off, and whether it had a lead. None for one said of no one who wears
// the item ("In an area of Dim Light", "As long as the helm has at least one ruby").
function bodyOf(sentence: string): { body: string; led: boolean } | undefined {
  const plain = sentence.replace(/^In addition, (?=you |your |while )/, "").replace(/\.$/, "")
  const body = plain.replace(LEAD, "").replace(TRAIL, "")
  const led = LEAD.test(plain)
  return led || /^(?:you|your) /i.test(body) ? { body, led } : undefined
}

type SentenceReading = { effects: ItemEffect[]; whole: boolean; lengthens?: number }
const unread: SentenceReading = { effects: [], whole: false }

// One sentence: the effects of the clauses read, and whether every clause was. `last` is what the sentence before gave.
function readSentence(sentence: string, item: MagicItem, last: ItemEffect[] | undefined): SentenceReading {
  const said = (holds: boolean | undefined): SentenceReading => (holds ? { effects: [], whole: true } : unread)
  if (NO_RULE.has(sentence) || HEADING.test(sentence) || BENEFITS.test(sentence) || PROPERTIES.test(sentence)) return said(true)
  if (CHOSEN.test(sentence)) return said(last?.some((effect) => effect.kind === "chosen-resistance"))
  const floor = FLOOR.exec(sentence)
  if (floor) {
    const score = last?.find((effect) => effect.kind === "score")
    return said(score?.kind === "score" && score.ability === ABILITY_ID(floor[1]) && (floor[2] === undefined ? score.score === "variant" : score.score === Number(floor[2])))
  }
  if (BY_VARIANT.test(sentence)) return said(last?.some((effect) => effect.kind === "score" && effect.score === "variant"))
  const lengthens = /^If you already have Darkvision, wearing the \w+ increases its range by (\d+) feet\.$/.exec(sentence)
  if (lengthens) return last?.some((effect) => effect.kind === "sense" && effect.type === "darkvision") ? { effects: [], whole: true, lengthens: Number(lengthens[1]) } : unread
  const typed = item.conditionalBonuses?.find((bonus) => bonus.text === sentence)
  if (typed?.to === "armor-class" && JUDGED_ARMOR_CLASS.has(typed.appliesWhen)) return { effects: [{ kind: "unarmored-armor-class", value: typed.value }], whole: true }
  const found = bodyOf(sentence)
  if (!found) return unread
  const weapons = WEAPONS_CLAUSE.exec(found.body.replace(/^You /, "you "))
  if (weapons) {
    const ids = weapons[1].split(/ and (?:the )?/).map((name) => WEAPONS.get(name.toLowerCase()))
    return ids.every(Boolean) ? { effects: [{ kind: "weapons", weapons: ids as string[], damage: Number(weapons[2]) }], whole: true } : unread
  }
  // Clauses are joined by "and" before "you" or "your", or before a lowercase word after a comma ("and spell attack
  // rolls have"): a list of names ("Piercing, and Slashing") is never split.
  const clauses = found.body.split(/,? and (?=you |your )|, and (?=[a-z])|, (?=you |your )/)
  // Without a lead, a clause that does not begin with "you" or "your" is not said of the one who wears the item.
  const effects: ItemEffect[] = []
  let whole = true
  for (const clause of clauses) {
    const read = found.led || /^(?:you|your) /i.test(clause) ? readClause(clause, item) : undefined
    if (read) effects.push(...read)
    else whole = false
  }
  return { effects, whole }
}

const readings = new Map<string, ItemReading>()

/**
 * An item's standing effects read from its text, and the sentences told: each one with a clause the reader does not
 * know, whole. A set score's sentence is read only with the one after it that says the item does nothing for a higher
 * score.
 */
export function readItem(item: MagicItem): ItemReading {
  const known = readings.get(item.id)
  if (known) return known
  const sentences = (
    item.description
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []
  ).map((sentence) => sentence.trim())
  let effects: ItemEffect[] = []
  const told: string[] = []
  let last: ItemEffect[] | undefined
  let closed = !!item.consumable
  for (const sentence of sentences) {
    const read = closed ? unread : readSentence(sentence, item, last)
    effects.push(...read.effects)
    if (read.lengthens) effects = effects.map((effect) => (effect.kind === "sense" && effect.type === "darkvision" ? { ...effect, lengthens: read.lengthens } : effect))
    // A sentence that says no more than the one before it (a score's floor, the GM's choice) keeps what that one gave.
    last = !read.whole ? undefined : read.effects.length ? read.effects : last
    if (read.whole) continue
    told.push(sentence)
    // A list opened by a sentence the reader does not know may hold only for a kind of the item or under a condition.
    if (/:|the following/.test(sentence)) closed = true
  }
  // A set score without the sentence that spares a higher one is not read.
  const scored = effects.some((effect) => effect.kind === "score")
  const floored = sentences.some((sentence) => FLOOR.test(sentence.trim()))
  const reading = scored && !floored ? { effects: effects.filter((effect) => effect.kind !== "score"), told: [...told] } : { effects, told }
  readings.set(item.id, reading)
  return reading
}

/**
 * What an owned item gives by its text, whether or not it works now: a variant's typed score in place of "variant", and
 * a chosen Resistance as the type the entry keeps. A chosen Resistance with no type kept gives nothing.
 */
export function effectsOf(owned: OwnedItem): ItemEffect[] {
  const found = itemOf(owned)
  if (!found) return []
  return readItem(found.item).effects.flatMap((effect): ItemEffect[] => {
    if (effect.kind === "score" && effect.score === "variant") return found.variant?.strength ? [{ ...effect, score: found.variant.strength }] : []
    if (effect.kind === "chosen-resistance") return owned.damageType && effect.options.includes(owned.damageType) ? [{ kind: "resistance", types: [owned.damageType] }] : []
    return [effect]
  })
}

/** The effects of the hero's working items, each with the item's name. */
export function standingEffects(sheet: Sheet): { effect: ItemEffect; from: string }[] {
  return (sheet.items ?? []).filter((owned) => isActive(sheet, owned)).flatMap((owned) => effectsOf(owned).map((effect) => ({ effect, from: itemOf(owned)?.item.name ?? owned.id })))
}

const kinds = <K extends ItemEffect["kind"]>(sheet: Sheet, kind: K) =>
  standingEffects(sheet).flatMap((entry) => (entry.effect.kind === kind ? [entry as { effect: Extract<ItemEffect, { kind: K }>; from: string }] : []))

/**
 * The ability scores the hero's items leave: a set score where it is higher than the hero's own, and a raise up to its
 * maximum. Gauntlets of Ogre Power make a Strength of 10 into 19, and leave one of 20 as it is.
 */
export function scoresWithItems(sheet: Sheet): Record<AbilityId, number> {
  const scores = { ...sheet.abilityScores }
  for (const { effect } of kinds(sheet, "raise")) scores[effect.ability] = Math.max(scores[effect.ability], Math.min(effect.maximum, scores[effect.ability] + effect.by))
  for (const { effect } of kinds(sheet, "score")) if (typeof effect.score === "number") scores[effect.ability] = Math.max(scores[effect.ability], effect.score)
  return scores
}

/** The damage types the hero's items give Resistance to. */
export const itemResistances = (sheet: Sheet): DamageTypeId[] => kinds(sheet, "resistance").flatMap(({ effect }) => effect.types)

/** The damage types the hero's items give Immunity to. */
export const itemImmunities = (sheet: Sheet): DamageTypeId[] => kinds(sheet, "immunity").flatMap(({ effect }) => effect.types)

/** The conditions the hero's items give Immunity to: a Periapt of Proof against Poison's Poisoned. */
export const itemConditionImmunities = (sheet: Sheet): ConditionId[] => kinds(sheet, "condition-immunity").flatMap(({ effect }) => effect.conditions)

/** The senses the hero's items give, each with how far it lengthens one the hero already has. */
export const itemSenses = (sheet: Sheet) => kinds(sheet, "sense").map(({ effect }) => effect)

/**
 * The hero's walking Speed with their items: raised to the most any item gives unless it is higher, and with no slowing
 * by Heavy Armor where an item says so. `own` is the Speed without them and `slowed` the feet heavy armor takes off.
 */
export function walkWithItems(sheet: Sheet, own: number, slowed: number): number {
  const unslowed = kinds(sheet, "unslowed").length > 0
  return Math.max(own - (unslowed ? 0 : slowed), ...kinds(sheet, "walk").map(({ effect }) => effect.feet))
}

/** The Swim and Climb Speeds the hero's items give, at a walking Speed: the most of each. */
export function speedsWithItems(sheet: Sheet, walk: number): { swim?: number; climb?: number } {
  const speeds: { swim?: number; climb?: number } = {}
  for (const { effect } of kinds(sheet, "speed")) speeds[effect.mode] = Math.max(speeds[effect.mode] ?? 0, effect.feet === "walk" ? walk : effect.feet)
  return speeds
}

/** What the hero's items add to Armor Class as the sheet stands: Bracers of Defense's 2 with no armor and no Shield. */
export const itemArmorClass = (sheet: Sheet): number => (sheet.armor || sheet.shield ? 0 : kinds(sheet, "unarmored-armor-class").reduce((sum, { effect }) => sum + effect.value, 0))

/** Whether the hero's items train them with a weapon, by equipment id: Bracers of Archery's Longbow and Shortbow. */
export const itemTrainsWith = (sheet: Sheet, weaponId: string): boolean => kinds(sheet, "weapons").some(({ effect }) => effect.weapons.includes(weaponId))

/** What the hero's items add to the damage rolls of a weapon, by equipment id: Bracers of Archery's 2 with a Longbow. */
export const itemWeaponDamage = (sheet: Sheet, weaponId: string): number => kinds(sheet, "weapons").reduce((sum, { effect }) => sum + (effect.weapons.includes(weaponId) ? effect.damage : 0), 0)

/** Advantage the hero's items give an ability check with a skill, each with the item: a Cloak of Elvenkind's on Stealth. */
export function itemCheckModes(sheet: Sheet | undefined, check: Check): { mode: "advantage"; from: string }[] {
  if (!sheet || check.kind !== "skill") return []
  return kinds(sheet, "check-advantage").flatMap(({ effect, from }) => (effect.skill === check.skill ? [{ mode: "advantage" as const, from }] : []))
}

/** Whether the hero's items give Advantage on Initiative: a Sentinel Shield. */
export const itemInitiativeAdvantage = (sheet: Sheet | undefined): boolean => !!sheet && kinds(sheet, "initiative-advantage").length > 0

/**
 * Advantage the hero's items give a saving throw, each with the item. `against` names the conditions it is made to
 * avoid or end (a Periapt of Health's Poisoned). `from` is what forces it: a spell, which a Mantle of Spell Resistance
 * and a Robe of the Archmagi answer, another magical effect, which only the Robe does, or anything else, which neither does.
 */
export function itemSaveModes(sheet: Sheet | undefined, against: readonly ConditionId[] = [], from: "spell" | "magic" | "other" = "other"): { mode: "advantage"; from: string }[] {
  if (!sheet) return []
  return kinds(sheet, "save-advantage").flatMap(({ effect, from: item }) => {
    const applies = effect.against === "spells" ? from === "spell" : effect.against === "magic" ? from !== "other" : against.includes(effect.against)
    return applies ? [{ mode: "advantage" as const, from: item }] : []
  })
}

const titled = (id: string) => id.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => (dash ? " " : "") + letter.toUpperCase())
const listed = (words: readonly string[]) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : (words[0] ?? ""))
const nameOf = (list: readonly { id: string; name: string }[], id: string) => list.find((entry) => entry.id === id)?.name ?? titled(id)

// One effect in a few plain words.
function effectWord(effect: ItemEffect): string {
  switch (effect.kind) {
    case "resistance":
      return `Resistance to ${listed(effect.types.map(titled))}`
    case "chosen-resistance":
      return "Resistance to one damage type, not yet chosen"
    case "immunity":
      return `Immunity to ${listed(effect.types.map(titled))} Damage`
    case "condition-immunity":
      return `Immunity to ${listed(effect.conditions.map(titled))}`
    case "score":
      return `${nameOf(abilities, effect.ability)} ${effect.score}`
    case "raise":
      return `+${effect.by} to ${nameOf(abilities, effect.ability)}, to ${effect.maximum}`
    case "walk":
      return `Speed ${effect.feet} ft`
    case "unslowed":
      return "No Slowing by Heavy Armor"
    case "speed":
      return effect.feet === "walk" ? `${titled(effect.mode)} Speed equal to Speed` : `${titled(effect.mode)} Speed ${effect.feet} ft`
    case "sense":
      return effect.lengthens ? `${titled(effect.type)} ${effect.range} ft, or ${effect.lengthens} ft more` : `${titled(effect.type)} ${effect.range} ft`
    case "check-advantage":
      return `Advantage on ${nameOf(skills, effect.skill)} Checks`
    case "initiative-advantage":
      return "Advantage on Initiative"
    case "save-advantage":
      return `Advantage on Saving Throws ${effect.against === "spells" ? "against Spells" : effect.against === "magic" ? "against Spells and Magical Effects" : `against ${titled(effect.against)}`}`
    case "unarmored-armor-class":
      return `+${effect.value} to Armor Class with No Armor or Shield`
    case "weapons":
      return `Training with the ${listed(effect.weapons.map((id) => nameOf(equipment, id)))}, +${effect.damage} to Their Damage Rolls`
  }
}

/** What an owned item gives by its text, in a few plain words: "Strength 19", "Resistance to Fire". None when it gives nothing read. */
export function effectWords(owned: OwnedItem): string | undefined {
  const found = itemOf(owned)
  if (!found) return undefined
  const effects = effectsOf(owned)
  // A chosen Resistance with no type kept is named as not chosen.
  const unchosen = readItem(found.item).effects.filter((effect) => effect.kind === "chosen-resistance" && !effects.some((given) => given.kind === "resistance"))
  const words = [...effects, ...unchosen].map(effectWord)
  return words.length ? words.join(", ") : undefined
}

/**
 * Why an owned item's chosen damage type is wrong: one the item needs and the entry lacks, one it does not offer, or one
 * on an item that takes none.
 */
export function damageTypeProblem(owned: OwnedItem): string | undefined {
  const found = itemOf(owned)
  if (!found) return undefined
  const chosen = readItem(found.item).effects.find((effect) => effect.kind === "chosen-resistance")
  const name = found.item.name
  if (!chosen) return owned.damageType ? `${name} takes no damage type` : undefined
  if (!owned.damageType) return `${name} gives Resistance to one damage type the GM chooses, and the sheet names none`
  return chosen.options.includes(owned.damageType) ? undefined : `${name} gives Resistance to one of ${listed(chosen.options.map(titled))}, and not ${titled(owned.damageType)}`
}

/**
 * The words of an item's text the game master is told, where the reader settles what the game runs of it: the sentences
 * it did not read, whole, within about 300 characters. None for an item it reads nothing of, or every sentence of.
 */
export function toldText(item: MagicItem): string | undefined {
  const { effects, told } = readItem(item)
  if (!effects.length || !told.length) return undefined
  let line = ""
  for (const sentence of told) {
    if (line && line.length + sentence.length > 300) break
    line += `${line ? " " : ""}${sentence}`
  }
  return line
}
