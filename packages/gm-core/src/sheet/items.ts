import type { ClassId } from "@d20/srd"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { magicItemRules } from "@d20/srd/magic-item-rules"
import { magicItemById } from "@d20/srd/magic-items"
import type { Bonus, MagicItem, MagicItemVariant } from "@d20/srd/schema/magic-items"
import { skillById } from "@d20/srd/skills"
import { damageTypeProblem, effectWords, itemArmorClass, readItem, toldText } from "./item-effects"
import { chargesOf, itemUseProblems, itemUseWords, usedParts } from "./item-use"
import type { OwnedItem, Sheet } from "./sheet"

type BonusTarget = Bonus["to"]

/**
 * Magic items a hero owns, by the SRD 5.2.1, as pure functions: what each is, whether it works now, the bonuses the
 * engine adds for it, Attunement and its limit, and the words the sheet and the game master are given.
 *
 * An item works while it is worn or wielded, and while the hero is attuned to it where it needs Attunement. A magic
 * weapon, armor or Shield is wielded or worn when the sheet's `weapons`, `armor` or `shield` holds its base equipment:
 * the magic one stands in place of the plain one, by that one path. Other items are worn whenever they are owned.
 *
 * The engine adds an item's typed bonuses to Armor Class, saving throws, ability checks, Initiative, spell attack rolls
 * and spell save DC, and a magic weapon's to its attack and damage rolls. What else an item does is told to the game
 * master by its text and changes no number. A potion's count and a wand's charges are kept on its entry when they come.
 */

const attunementRule = magicItemRules.find((rule) => rule.kind === "attunement")
/** "You can be attuned to no more than three magic items at a time." */
export const ATTUNEMENT_LIMIT = attunementRule && "maxItems" in attunementRule ? attunementRule.maxItems : 3

/** The item an entry names, with the variant it is where the item comes in several. None for an id the SRD lacks. */
export function itemOf(owned: OwnedItem): { item: MagicItem; variant?: MagicItemVariant } | undefined {
  const item = magicItemById.get(owned.id)
  if (!item) return undefined
  return { item, variant: item.variants?.find((variant) => variant.name === owned.variant) }
}

/**
 * An owned item's name: "Longsword +1", "Shield +2", "Wand of the War Mage +1", "Flame Tongue (Longsword)",
 * "Potion of Healing (greater)", "Feather Token (Anchor)".
 */
export function itemName(owned: OwnedItem): string {
  const found = itemOf(owned)
  if (!found) return owned.id
  const { item } = found
  const base = owned.base ? equipmentById.get(owned.base)?.name : undefined
  if (owned.variant && /^\+\d$/.test(owned.variant)) {
    const stem = item.name.replace(/, \+1, \+2, or \+3$/, "")
    return `${base && ["Weapon", "Armor", "Shield", "Ammunition"].includes(stem) ? base : stem} ${owned.variant}`
  }
  if (owned.variant) return owned.variant.includes(" of ") ? owned.variant : `${item.name} (${owned.variant})`
  return base && base !== item.name ? `${item.name} (${base})` : item.name
}

/** Whether an item asks for Attunement before its magic works. */
export const needsAttunement = (owned: OwnedItem): boolean => !!magicItemById.get(owned.id)?.attunement

// The equipment kind an item's base must be: ammunition, a weapon, or armor (a Shield among it).
const baseKind = (item: MagicItem) => (item.base?.any?.includes("ammunition") ? "ammunition" : item.category === "weapon" ? "weapon" : "armor")

/** Whether an item is a magic weapon a hero attacks with: one built on a weapon. Ammunition is not. */
const isWeapon = (item: MagicItem) => !!item.base && baseKind(item) === "weapon"

/**
 * Whether an owned item is worn or wielded: a magic weapon whose base is among the sheet's weapons, magic armor whose
 * base is the armor worn, a magic Shield while the sheet carries a Shield. Any other item is worn while owned.
 */
export function isWorn(sheet: Sheet, owned: OwnedItem): boolean {
  const item = magicItemById.get(owned.id)
  if (!item?.base || !owned.base) return true
  const entry = equipmentById.get(owned.base)
  if (entry?.kind === "weapon") return (sheet.weapons ?? []).includes(owned.base)
  if (entry?.kind === "armor") return entry.category === "shield" ? !!sheet.shield : sheet.armor === owned.base
  return true
}

/** Whether an owned item's magic works now: it is worn or wielded, and attuned where it needs Attunement. */
export const isActive = (sheet: Sheet, owned: OwnedItem): boolean => !!itemOf(owned) && (!needsAttunement(owned) || !!owned.attuned) && isWorn(sheet, owned)

/** The bonus targets the engine adds an item's bonus to. Attack and damage rolls count only for a magic weapon. */
const RUN_TARGETS = new Set<string>(["armor-class", "saving-throws", "ability-checks", "initiative", "spell-attack-rolls", "spell-save-dc"])
const runs = (item: MagicItem, to: BonusTarget): boolean =>
  RUN_TARGETS.has(to) || (to.endsWith("-checks") && skillById.has(to.slice(0, -7))) || ((to === "attack-rolls" || to === "damage-rolls") && isWeapon(item))

// An item's plain bonuses: its variant's, or its own. None where the data marks its bonuses as not fully typed (Defender).
function typedBonuses(item: MagicItem, variant: MagicItemVariant | undefined): { to: BonusTarget; value: number }[] {
  if (item.untyped?.includes("bonuses")) return []
  return variant?.bonuses ?? item.bonuses ?? item.variants?.[0]?.bonuses ?? []
}

/** The bonuses of an owned item the engine adds, whether or not the item works now. */
export function bonusesRun(owned: OwnedItem): { to: BonusTarget; value: number }[] {
  const found = itemOf(owned)
  return found ? typedBonuses(found.item, found.variant).filter((bonus) => runs(found.item, bonus.to)) : []
}

/**
 * What the hero's working items add to a roll or number, other than a magic weapon's own attack and damage rolls:
 * a Ring of Protection's 1 to Armor Class and to every saving throw, Plate Armor +1's 1 to Armor Class, a Stone of Good
 * Luck's 1 to ability checks.
 */
export function itemBonus(sheet: Sheet, to: BonusTarget): number {
  if (to === "attack-rolls" || to === "damage-rolls") return 0
  const typed = (sheet.items ?? [])
    .filter((owned) => isActive(sheet, owned))
    .reduce((sum, owned) => sum + bonusesRun(owned).reduce((total, bonus) => total + (bonus.to === to ? bonus.value : 0), 0), 0)
  // Bracers of Defense's 2 to Armor Class with no armor and no Shield, a bonus the data types under a condition (./item-effects).
  return typed + (to === "armor-class" ? itemArmorClass(sheet) : 0)
}

/**
 * The working magic weapon a hero wields as one of their weapons, by its equipment id, with its name and its bonuses to
 * attack and damage rolls: a Longsword +1 is `{ name: "Longsword +1", attack: 1, damage: 1 }`. None for a plain one.
 */
export function magicWeaponOf(sheet: Sheet, weaponId: string): { name: string; attack: number; damage: number } | undefined {
  const owned = (sheet.items ?? []).find((entry) => {
    const item = magicItemById.get(entry.id)
    return entry.base === weaponId && !!item && isWeapon(item) && isActive(sheet, entry)
  })
  if (!owned) return undefined
  const bonus = (to: BonusTarget) => bonusesRun(owned).reduce((sum, each) => sum + (each.to === to ? each.value : 0), 0)
  return { name: itemName(owned), attack: bonus("attack-rolls"), damage: bonus("damage-rolls") }
}

/** Whether every effect of an item is a bonus the engine adds: the fields beyond them hold effects it does not run. */
const OTHER_EFFECTS = ["conditionalBonuses", "charges", "saves", "checks", "damage", "spells", "spellEffects", "uses", "statBlocks", "tables", "activation", "untyped", "cursed", "consumable"] as const

/**
 * Items whose typed fields are only bonuses, and whose text gives them more: Elven Chain's training, the Gloves of
 * Thievery being unseen, the Robe of the Archmagi's Armor Class, the Wand of the War Mage's
 * ignoring Half Cover.
 */
const MORE_IN_TEXT = new Set(["elven-chain", "gloves-of-thievery", "robe-of-the-archmagi", "wand-of-the-war-mage-1-2-or-3"])

/**
 * How much of an item the engine runs. "run": every effect is a bonus it adds (Weapon +1, Ring of Protection). "partly
 * run": it adds the item's bonuses and the game master is told the rest (Dragon Slayer's +1 is run, its 3d6 against
 * a Dragon is told). "told": the game master is told it all by its text, and it changes no number (Bag of Holding).
 */
export function itemLabel(item: MagicItem): "run" | "partly run" | "told" {
  // A potion drunk, and an item's spells cast with its charges and uses, are labelled by what the engine runs of them
  // (./item-use), and the rest of the item by what follows, without the fields they account for.
  const used = usedParts(item)
  if (used) {
    const rest = Object.fromEntries(Object.entries(item).filter(([key]) => !used.fields.includes(key as keyof MagicItem))) as MagicItem
    const more = ["bonuses", "variants", ...OTHER_EFFECTS].some((field) => rest[field as keyof MagicItem] !== undefined) || MORE_IN_TEXT.has(item.id) || readItem(item).effects.length > 0
    const labels = [used.label, ...(more ? [itemLabel(rest)] : [])]
    return labels.every((label) => label === "run") ? "run" : labels.every((label) => label === "told") ? "told" : "partly run"
  }
  const bonuses = typedBonuses(item, undefined)
  const ran = bonuses.filter((bonus) => runs(item, bonus.to))
  // An item with no typed bonus whose text gives standing effects (./item-effects) is run in full when every sentence of
  // its text is read: Gauntlets of Ogre Power. A sentence left unread is told: a Cloak of Elvenkind's Perception.
  const read = readItem(item)
  if (!ran.length && read.effects.length) return read.told.length ? "partly run" : "run"
  if (!ran.length) return "told"
  const more =
    ran.length < bonuses.length ||
    MORE_IN_TEXT.has(item.id) ||
    OTHER_EFFECTS.some((field) => item[field] !== undefined) ||
    (item.variants ?? []).some((variant) => Object.keys(variant).some((key) => !["name", "rarity", "bonuses"].includes(key)))
  return more ? "partly run" : "run"
}

const TARGET_WORDS: Partial<Record<string, string>> = {
  "armor-class": "Armor Class",
  "attack-rolls": "Attack Rolls",
  "damage-rolls": "Damage Rolls",
  "saving-throws": "Saving Throws",
  "ability-checks": "Ability Checks",
  initiative: "Initiative",
  "spell-attack-rolls": "Spell Attack Rolls",
  "spell-save-dc": "Spell Save DC",
}
const targetWords = (to: string) => TARGET_WORDS[to] ?? `${skillById.get(to.replace(/-checks$/, ""))?.name ?? to} Checks`

/** An owned item's bonuses the engine adds, in words: "+1 to Armor Class and Saving Throws". None when it adds none. */
export function bonusWords(owned: OwnedItem): string | undefined {
  const byValue = new Map<number, string[]>()
  for (const bonus of bonusesRun(owned)) byValue.set(bonus.value, [...(byValue.get(bonus.value) ?? []), targetWords(bonus.to)])
  const parts = [...byValue].map(([value, targets]) => `${value < 0 ? "−" : "+"}${Math.abs(value)} to ${targets.length > 1 ? `${targets.slice(0, -1).join(", ")} and ${targets.at(-1)}` : targets[0]}`)
  return parts.length ? parts.join(", ") : undefined
}

/** Whether a sheet's hero can cast a spell by their traits or features, as the SRD's "a Spellcaster" asks for Attunement. */
export type Caster = { spellcaster: boolean }

/** Why a hero cannot attune to an item, by what its data types: a class, or a spellcaster. None when they can. */
function prerequisiteProblem(sheet: Sheet, item: MagicItem, caster: Caster): string | undefined {
  const attunement = item.attunement
  if (attunement?.classes && !attunement.classes.includes(sheet.class as ClassId))
    return `${item.name} is attuned only by ${attunement.restriction ?? attunement.classes.join(", ")}, and ${classById.get(sheet.class)?.name ?? sheet.class} is not one`
  if (attunement?.spellcaster && !caster.spellcaster) return `${item.name} is attuned only by a Spellcaster, and the hero casts no spell by their traits or features`
  return undefined
}

// Whether a base fits an item's base: its kind, the named equipment, the kinds it allows, and those it leaves out.
function baseProblem(item: MagicItem, baseId: string): string | undefined {
  const entry = equipmentById.get(baseId)
  const spec = item.base
  if (!spec) return `${item.name} is built on no other item, so takes no base`
  if (!entry) return `"${baseId}" is not equipment`
  const kind = baseKind(item)
  const fitsKind = (any: string) => {
    if (any === "ammunition") return entry.kind === "ammunition"
    if (entry.kind === "weapon") return any === "melee" ? entry.attackType === "melee" : entry.category === any
    return entry.kind === "armor" && entry.category === any
  }
  if (entry.kind !== kind || (spec.items && !spec.items.includes(baseId)) || spec.except?.includes(baseId) || (spec.any && !spec.any.some(fitsKind)))
    return `${entry.name} is not an item ${item.name} can be`
  return undefined
}

/**
 * What is wrong with the magic items on a sheet: an item the SRD lacks, a version it does not come in, a base that
 * does not fit it or is missing, Attunement on an item that needs none, more than three attuned, two copies of one
 * item attuned, an attunement whose prerequisite the hero does not meet, and two items standing for one weapon,
 * armor or Shield the sheet holds.
 */
export function itemProblems(sheet: Sheet, caster: Caster): string[] {
  const problems: string[] = []
  const items = sheet.items ?? []
  for (const owned of items) {
    const item = magicItemById.get(owned.id)
    if (!item) {
      problems.push(`"${owned.id}" is not a magic item`)
      continue
    }
    if (item.variants && !item.variants.some((variant) => variant.name === owned.variant))
      problems.push(`${item.name} comes as ${item.variants.map((variant) => variant.name).join(", ")}, and the sheet names ${owned.variant ? `"${owned.variant}"` : "none"}`)
    if (!item.variants && owned.variant) problems.push(`${item.name} comes in one version only`)
    if (item.base && !owned.base) problems.push(`${item.name} needs the item it is, such as a Longsword or Plate Armor`)
    if (owned.base) {
      const wrong = baseProblem(item, owned.base)
      if (wrong) problems.push(wrong)
    }
    if (owned.attuned && !item.attunement) problems.push(`${item.name} needs no Attunement`)
    const damageType = damageTypeProblem(owned)
    if (damageType) problems.push(damageType)
    if (owned.attuned) {
      const unmet = prerequisiteProblem(sheet, item, caster)
      if (unmet) problems.push(unmet)
    }
  }
  const attuned = items.filter((owned) => owned.attuned)
  if (attuned.length > ATTUNEMENT_LIMIT) problems.push(`the hero is attuned to ${attuned.length} magic items, and can be attuned to no more than ${ATTUNEMENT_LIMIT}`)
  if (new Set(attuned.map((owned) => owned.id)).size < attuned.length) problems.push("the hero is attuned to two copies of one magic item")
  const worn = items.filter((owned) => owned.base && magicItemById.get(owned.id)?.base && isWorn(sheet, owned) && baseKind(magicItemById.get(owned.id) as MagicItem) !== "ammunition")
  if (new Set(worn.map((owned) => owned.base)).size < worn.length) problems.push("two magic items stand for one weapon, armor or Shield the sheet holds")
  // What the sheet keeps of the items used: counts, charges and uses (./item-use).
  problems.push(...itemUseProblems(sheet))
  return problems
}

/**
 * Attuning to an owned item, by its place in the sheet's items. Attunement takes a Short Rest spent with the item, so
 * this is made only as one ends. The sheet attuned, or why it cannot be: the item needs no Attunement or is attuned
 * already, three items are attuned, a copy of it is attuned, or its prerequisite is not met.
 */
export function attune(sheet: Sheet, index: number, caster: Caster): { sheet: Sheet } | { problem: string } {
  const owned = sheet.items?.[index]
  const item = owned && magicItemById.get(owned.id)
  if (!owned || !item) return { problem: "The hero owns no such item." }
  const name = itemName(owned)
  if (!item.attunement) return { problem: `${name} needs no Attunement.` }
  if (owned.attuned) return { problem: `The hero is already attuned to ${name}.` }
  const attuned = (sheet.items ?? []).filter((entry) => entry.attuned)
  if (attuned.length >= ATTUNEMENT_LIMIT) return { problem: `The hero is attuned to ${ATTUNEMENT_LIMIT} magic items already, and must end an Attunement first.` }
  if (attuned.some((entry) => entry.id === owned.id)) return { problem: `The hero is already attuned to another ${item.name}.` }
  const unmet = prerequisiteProblem(sheet, item, caster)
  if (unmet) return { problem: `${unmet}.` }
  return { sheet: { ...sheet, items: (sheet.items ?? []).map((entry, at) => (at === index ? { ...entry, attuned: true as const } : entry)) } }
}

/**
 * Ending Attunement to an owned item, by its place in the sheet's items: by the hero's choice at any time, unless the
 * item is cursed, or always where `by` is "death". The sheet with it ended, or why it cannot be.
 */
export function endAttunement(sheet: Sheet, index: number, by: "choice" | "death" = "choice"): { sheet: Sheet } | { problem: string } {
  const owned = sheet.items?.[index]
  if (!owned?.attuned) return { problem: "The hero is not attuned to that item." }
  if (by === "choice" && magicItemById.get(owned.id)?.cursed) return { problem: `${itemName(owned)} is cursed, and its Attunement cannot be ended by choice.` }
  return {
    sheet: {
      ...sheet,
      items: (sheet.items ?? []).map((entry, at) => {
        if (at !== index) return entry
        const { attuned: _, ...kept } = entry
        return kept
      }),
    },
  }
}

/**
 * What a Short Rest does for Attunement. A hero attunes to one item a Short Rest, since the rest is spent focused on
 * only that item: the first they own, in the order owned, that needs Attunement and can be attuned now. The sheet
 * after, and the item's name where one was attuned.
 */
export function attuneOnShortRest(sheet: Sheet, caster: Caster): { sheet: Sheet; attuned?: string } {
  const items = sheet.items ?? []
  for (let index = 0; index < items.length; index++) {
    if (items[index].attuned || !needsAttunement(items[index])) continue
    const done = attune(sheet, index, caster)
    if ("sheet" in done) return { sheet: done.sheet, attuned: itemName(items[index]) }
  }
  return { sheet }
}

/** An owned item as the sheet shows it. `attuned` is left out of an item that needs no Attunement. */
export type ItemView = {
  name: string
  /** The bonuses the engine adds for it, in words: "+1 to Armor Class and Saving Throws". */
  gives?: string
  /** Its rarity and kind, for an item the engine adds nothing for: "Uncommon Wondrous Item". */
  kind: string
  attuned?: boolean
  /** A magic weapon, armor or Shield the hero does not hold or wear now. */
  unworn?: true
  /** How many of a consumable the hero holds, where more than one. */
  count?: number
  /** An item's charges: how many it has and how many are left. */
  charges?: { left: number; max: number }
}

const titled = (id: string) => id.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => (dash ? " " : "") + letter.toUpperCase())

/** The hero's magic items as the sheet shows them, in the order owned. */
export function itemViews(sheet: Sheet): ItemView[] {
  return (sheet.items ?? []).flatMap((owned) => {
    const found = itemOf(owned)
    if (!found) return []
    const gives = [bonusWords(owned), effectWords(owned)].filter(Boolean).join(", ") || undefined
    const rarity = found.variant?.rarity ?? found.item.rarity
    return [
      {
        name: itemName(owned),
        ...(gives ? { gives } : {}),
        kind: `${titled(rarity)} ${titled(found.item.category)}`,
        ...(needsAttunement(owned) ? { attuned: !!owned.attuned } : {}),
        ...(isWorn(sheet, owned) ? {} : { unworn: true as const }),
        ...(owned.count ? { count: owned.count } : {}),
        ...(chargesOf(owned) ? { charges: chargesOf(owned) } : {}),
      },
    ]
  })
}

/** An item's text, cut to whole sentences within about 300 characters, for the game master. */
export function textLine(item: MagicItem): string {
  const flat = item.description.replace(/\s+/g, " ").trim()
  const sentences = flat.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [flat]
  let line = ""
  for (const sentence of sentences) {
    if (line && line.length + sentence.length > 300) break
    line += sentence
  }
  return line.trim()
}

/**
 * The hero's magic items for the game master, one line each: the item, whether it works now, the bonuses the game
 * adds, and for what the game does not run, a line of the item's text, so the story can use it.
 */
export function itemWords(sheet: Sheet): string[] {
  return (sheet.items ?? []).flatMap((owned) => {
    const found = itemOf(owned)
    if (!found) return []
    const state =
      needsAttunement(owned) && !owned.attuned
        ? "not attuned, so its magic does not work"
        : !isWorn(sheet, owned)
          ? "not held or worn, so its magic does not work"
          : needsAttunement(owned)
            ? "attuned"
            : ""
    const gives = [bonusWords(owned), effectWords(owned)].filter(Boolean).join(", ") || undefined
    const adds = gives ? ` ${isActive(sheet, owned) ? "The game adds" : "Once it works, the game adds"} ${gives}.` : ""
    const label = itemLabel(found.item)
    const told =
      label === "told"
        ? `The game does not run it, so it changes no number. Its text: "${textLine(found.item)}"`
        : label === "partly run"
          ? `The game runs nothing more of it. Its text: "${(typedBonuses(found.item, undefined).some((bonus) => runs(found.item, bonus.to)) ? undefined : toldText(found.item)) ?? textLine(found.item)}"`
          : ""
    // What the game runs of its use: a potion's count and what drinking it does, charges left, spells cast (./item-use).
    const use = itemUseWords(sheet, owned)
    return [`${itemName(owned)}${state ? `, ${state}` : ""}.${use ? ` ${use}` : ""}${adds}${told ? ` ${told}` : ""}`]
  })
}
