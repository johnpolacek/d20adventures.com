import type { DamageTypeId } from "@d20/srd"
import { magicItemById } from "@d20/srd/magic-items"
import type { ItemSpell, MagicItem } from "@d20/srd/schema/magic-items"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import type { BonusAction } from "./class-rules"
import { isActive, itemName, itemOf } from "./items"
import type { OwnedItem, Sheet } from "./sheet"
import { spellLabel } from "./spell-labels"

/**
 * Using a magic item, by the SRD 5.2.1, as pure functions: drinking a potion, spending an item's charges and the uses it
 * has a dawn, and casting the spells an item gives. What is used is kept on the item's entry on the sheet (./sheet):
 * `count` for a consumable, `spent` for charges and `used` for uses. The engine keeps no clock, so a Long Rest stands
 * for the dawn an item's charges and uses come back at, as it does for a feature's daily uses (./rest).
 *
 * This file reads the sheet and the item data only, so ./items may use it. What rolls dice or changes hit points is in
 * ./item-spend.
 */

/** How many of an item an entry holds: its `count`, or one. */
export const countOf = (owned: OwnedItem): number => owned.count ?? 1

/** Whether an item is used up as it is used, as the data marks it: a potion, an oil, a bead, a scroll. */
export const isConsumable = (owned: OwnedItem): boolean => !!magicItemById.get(owned.id)?.consumable

/** An entry with a field set, or left out where it is empty: a count of one, no charges spent, no uses. */
export function withField<K extends "count" | "spent" | "used">(owned: OwnedItem, key: K, value: OwnedItem[K] | undefined): OwnedItem {
  const { [key]: _, ...rest } = owned
  const empty = value === undefined || (key === "count" && value === 1) || (key === "spent" && value === 0) || (key === "used" && !Object.keys(value as object).length)
  return (empty ? rest : { ...rest, [key]: value }) as OwnedItem
}

/** The sheet with one entry changed, or taken away where `entry` is none. */
export function withEntry(sheet: Sheet, index: number, entry: OwnedItem | undefined): Sheet {
  const items = (sheet.items ?? []).flatMap((owned, at) => (at !== index ? [owned] : entry ? [entry] : []))
  const { items: _, ...rest } = sheet
  return items.length ? { ...rest, items } : rest
}

/** The sheet with one of an entry used up: its count falls by one, and at none the entry goes. */
export function withOneUsed(sheet: Sheet, index: number): Sheet {
  const owned = sheet.items?.[index]
  if (!owned) return sheet
  const left = countOf(owned) - 1
  return withEntry(sheet, index, left > 0 ? withField(owned, "count", left) : undefined)
}

export const article = (name: string) => (/^[AEIOU]/.test(name) ? "an" : "a")

/** An item's id on the read's menu, from its name: "Potion of Healing (greater)" is "potion-of-healing-greater". */
export const menuId = (owned: OwnedItem) =>
  itemName(owned)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// ---------------------------------------------------------------------------------------------------------------
// Potions

/**
 * What drinking a potion does, as far as the engine runs it. "healing": the hero regains the potion's own dice, a
 * Potion of Healing's 2d4 + 2 and its greater, superior and supreme kinds'. "damage": the drinker takes typed damage, a
 * Potion of Poison's 4d6 Poison, and the rest is told. "told": the game master tells it all from its text.
 */
export type PotionEffect = { kind: "healing"; dice: string } | { kind: "damage"; dice: string; type: DamageTypeId } | { kind: "told" }

/** What a potion does when drunk, by its typed data. */
export function potionEffect(owned: OwnedItem): PotionEffect {
  const found = itemOf(owned)
  if (!found) return { kind: "told" }
  const healing = found.variant?.healing
  if (healing && !found.item.untyped?.includes("healing")) return { kind: "healing", dice: healing }
  const hurt = (found.variant?.damage ?? found.item.damage)?.find((entry) => entry.role === "to-user" && entry.dice && entry.type !== "weapon" && !entry.appliesWhen)
  if (hurt?.dice && hurt.type !== "weapon") return { kind: "damage", dice: hurt.dice, type: hurt.type }
  return { kind: "told" }
}

/**
 * Whether an item is a potion drunk as a Bonus Action: "Drinking a potion or administering it to another creature
 * requires a Bonus Action." An oil that takes minutes to apply is not.
 */
export const isDrunk = (item: MagicItem | undefined): boolean => item?.category === "potion" && !!item.activation?.includes("bonus-action")

/** How much of a potion the engine runs, by its typed data: the label ./items gives it. */
export function potionLabel(item: MagicItem): "run" | "partly run" | "told" | undefined {
  if (item.category !== "potion") return undefined
  const variants = item.variants?.length ? item.variants.map((variant) => variant.name) : [undefined]
  const effects = variants.map((variant) => potionEffect({ id: item.id, ...(variant ? { variant } : {}) }).kind)
  if (effects.every((kind) => kind === "healing")) return "run"
  return effects.some((kind) => kind !== "told") ? "partly run" : "told"
}

/** The potions a hero has that can be drunk now, each a Bonus Action on the read's menu with how many are left. */
export function potionActionsOf(character: { sheet?: Sheet }): BonusAction[] {
  const sheet = character.sheet
  const seen = new Set<string>()
  return (sheet?.items ?? []).flatMap((owned): BonusAction[] => {
    const id = menuId(owned)
    if (!sheet || !isDrunk(magicItemById.get(owned.id)) || !isActive(sheet, owned) || seen.has(id)) return []
    seen.add(id)
    return [{ id, name: itemName(owned), uses: countOf(owned), left: countOf(owned), targeted: true }]
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Charges and uses

/** An item's typed charges: its variant's, or its own. */
export const chargesData = (owned: OwnedItem) => {
  const found = itemOf(owned)
  return found?.variant?.charges ?? found?.item.charges
}

/**
 * An owned item's charges: how many it has and how many are left. None for an item with no charges, and for one whose
 * number of charges is rolled when it is found (a Luck Blade's 1d3), which the sheet does not keep.
 */
export function chargesOf(owned: OwnedItem): { max: number; left: number } | undefined {
  const charges = chargesData(owned)
  if (!charges || typeof charges.max !== "number") return undefined
  return { max: charges.max, left: Math.max(0, charges.max - (owned.spent ?? 0)) }
}

// The limit on a spell an item casts a number of times, from the item's typed uses: how many, and what brings them back.
export const useOf = (item: MagicItem, spellId: string) => item.uses?.find((use) => use.spell === spellId)

/**
 * What is wrong with what the sheet keeps of items used: a count on an item that is not used up, two entries of one
 * consumable that one entry with a count should hold, charges spent on an item with none or more than it has, and a
 * use spent of something the item does not limit.
 */
export function itemUseProblems(sheet: Sheet): string[] {
  const problems: string[] = []
  const items = sheet.items ?? []
  for (const [index, owned] of items.entries()) {
    const found = itemOf(owned)
    if (!found) continue
    const name = itemName(owned)
    if (owned.count && !found.item.consumable) problems.push(`${name} is not used up as it is used, so an entry holds one`)
    if (found.item.consumable && items.findIndex((other) => other.id === owned.id && other.variant === owned.variant) < index)
      problems.push(`two entries hold ${name}, which one entry with a count keeps`)
    const held = chargesOf(owned)
    if (owned.spent && (!held || owned.spent > held.max))
      problems.push(held ? `${name} has ${held.max} charges, and the sheet spends ${owned.spent}` : `${name} has no charges the sheet keeps, and the sheet spends ${owned.spent}`)
    for (const key of Object.keys(owned.used ?? {})) if (!(found.item.uses ?? []).some((use) => use.spell === key || use.label === key)) problems.push(`${name} has no use of "${key}" to spend`)
  }
  return problems
}

// ---------------------------------------------------------------------------------------------------------------
// Spells cast from an item

/**
 * A spell a hero can cast from an item they own, and how it is paid for. "charges": a set number of the item's charges
 * (a Wand of Web's 1). "upcast": its charges, and one more for each level above `level`, up to `maxCharges` (a Wand of
 * Magic Missiles: 1 charge for level 1, 3 for level 3). "per-level": 1 charge a spell level, up to `maxCharges` (a Staff
 * of Healing's Cure Wounds). "use": one of the uses the item has for it a dawn (a Circlet of Blasting's Scorching Ray).
 * "at-will": no cost (Boots of Levitation, a Staff of the Magi's Light).
 */
export type ItemCasting = {
  /** The item's place among the sheet's items, and its name. */
  index: number
  item: string
  spell: string
  cost: "charges" | "upcast" | "per-level" | "use" | "at-will"
  /** The charges a cast at `level` takes. */
  charges: number
  maxCharges?: number
  /** The level it is cast at for `charges`: the one the item names, or the spell's own. */
  level: number
  /** The charges or uses left, for a cost that has them. */
  left?: number
  /** The save DC and spell attack bonus the item states. Without them the caster's own are used (./spells `spellcastingFor`). */
  saveDc?: number
  attackBonus?: number
  /** It may be cast on the caster alone. */
  selfOnly?: true
}

/**
 * The spells a hero can cast from the items they own, each with what it costs, in the order owned. Only an item that
 * works now gives any: worn, and attuned where it needs Attunement. A spell is left out where the data says the item
 * casts it only under a condition the engine cannot know (`appliesWhen`, an Air spell of a Ring of Elemental Command), or
 * marks the item's spells as not fully typed. One whose number of charges is rolled when found gives none that cost
 * charges.
 */
export function itemSpellsOf(sheet: Sheet | undefined): ItemCasting[] {
  if (!sheet) return []
  return (sheet.items ?? []).flatMap((owned, index): ItemCasting[] => {
    const found = itemOf(owned)
    // A consumable's spell comes with using it up (a Potion of Animal Friendship's), so it is not cast from the entry.
    if (!found || !isActive(sheet, owned) || found.item.consumable || found.item.untyped?.includes("spells")) return []
    const held = chargesOf(owned)
    const name = itemName(owned)
    return (found.variant?.spells ?? found.item.spells ?? []).flatMap((entry: ItemSpell): ItemCasting[] => {
      const spell = spellById.get(entry.id)
      if (!spell || entry.group || entry.appliesWhen) return []
      const base = {
        index,
        item: name,
        spell: spell.id,
        ...(entry.saveDc ? { saveDc: entry.saveDc } : {}),
        ...(entry.attackBonus !== undefined ? { attackBonus: entry.attackBonus } : {}),
        ...(entry.selfOnly ? { selfOnly: true as const } : {}),
      }
      const level = entry.level ?? spell.level
      const priced = entry.chargesPerSpellLevel || (entry.charges ?? 0) > 0
      if (priced && !held) return []
      if (entry.chargesPerSpellLevel) return [{ ...base, cost: "per-level", charges: spell.level, ...(entry.maxCharges ? { maxCharges: entry.maxCharges } : {}), level: spell.level, left: held?.left }]
      if (entry.charges && entry.upcastsWithCharges)
        return [{ ...base, cost: "upcast", charges: entry.charges, ...(entry.maxCharges ? { maxCharges: entry.maxCharges } : {}), level, left: held?.left }]
      if (entry.charges) return [{ ...base, cost: "charges", charges: entry.charges, level, left: held?.left }]
      const use = useOf(found.item, spell.id)
      if (use) {
        if (use.count !== undefined && typeof use.count !== "number") return []
        return [{ ...base, cost: "use", charges: 0, level, left: Math.max(0, (use.count ?? 1) - (owned.used?.[spell.id] ?? 0)) }]
      }
      return [{ ...base, cost: "at-will", charges: 0, level }]
    })
  })
}

/** What casting a spell from an item spends: so many of its charges, or one of its uses, and the level it is cast at. */
export type ItemCost = { kind: "item"; index: number; charges: number; use?: string; level: number }

/**
 * What a casting from an item costs at the level asked for (`level`), or why it cannot be made. A level above what the
 * item allows falls to the most it allows, and one below the spell's own to the least. Too few charges or no use left
 * refuses the cast.
 */
export function itemCastCost(casting: ItemCasting, spell: Spell, level?: number): ItemCost | { problem: string } {
  const at = (wanted: number, least: number, most: number) => Math.min(most, Math.max(least, wanted))
  let charges = casting.charges
  let castAt = casting.level
  if (casting.cost === "upcast") {
    castAt = at(level ?? casting.level, casting.level, casting.level + (casting.maxCharges ?? casting.charges) - casting.charges)
    charges = casting.charges + castAt - casting.level
  }
  if (casting.cost === "per-level") {
    castAt = at(level ?? spell.level, spell.level, casting.maxCharges ?? 9)
    charges = castAt
  }
  const cost: ItemCost = { kind: "item", index: casting.index, charges, level: castAt, ...(casting.cost === "use" ? { use: spell.id } : {}) }
  if (casting.cost === "use" && (casting.left ?? 0) < 1) return { problem: `The ${casting.item} cannot cast ${spell.name} again until a Long Rest.` }
  if (charges > 0 && (casting.left ?? 0) < charges)
    return {
      problem: `The ${casting.item} has ${casting.left ?? 0} ${casting.left === 1 ? "charge" : "charges"} left, and ${spell.name}${castAt > spell.level ? ` at level ${castAt}` : ""} takes ${charges}.`,
    }
  return cost
}

/** How a casting from an item is paid for, in words for the read's spell list: "from the Wand of Magic Missiles, 1 charge a level up to level 3, 7 charges left". */
export function itemCastingWords(casting: ItemCasting): string {
  const left = casting.left === undefined ? "" : `, ${casting.left} ${casting.cost === "use" ? (casting.left === 1 ? "use" : "uses") : casting.left === 1 ? "charge" : "charges"} left`
  const how =
    casting.cost === "at-will"
      ? "at will"
      : casting.cost === "use"
        ? "once a dawn"
        : casting.cost === "per-level"
          ? `1 charge a spell level, up to level ${casting.maxCharges ?? 9}`
          : casting.cost === "upcast"
            ? `${casting.charges} ${casting.charges === 1 ? "charge" : "charges"} at level ${casting.level} and 1 more a level, up to level ${casting.level + (casting.maxCharges ?? casting.charges) - casting.charges}`
            : `${casting.charges} ${casting.charges === 1 ? "charge" : "charges"}${casting.level > (spellById.get(casting.spell)?.level ?? 0) ? `, at level ${casting.level}` : ""}`
  return `from the ${casting.item}, ${how}${left}${casting.selfOnly ? ", on themselves" : ""}`
}

/** An owned item's charges and how many are left, in words: "5 of 7 charges left". None for an item with none. */
export function chargeWords(owned: OwnedItem): string | undefined {
  const held = chargesOf(owned)
  return held ? `${held.left} of ${held.max} ${held.max === 1 ? "charge" : "charges"} left` : undefined
}

// ---------------------------------------------------------------------------------------------------------------
// Labels and words

// Whether the engine casts a spell an item gives, by the item's typed data (`itemSpellsOf`): not under a condition it
// cannot know, not from a consumable, not where the item's spells are not fully typed, and not for charges whose
// number is rolled when found.
function castable(item: MagicItem, entry: ItemSpell): boolean {
  if (!spellById.has(entry.id) || entry.group || entry.appliesWhen || item.consumable || item.untyped?.includes("spells")) return false
  const priced = entry.chargesPerSpellLevel || (entry.charges ?? 0) > 0
  const use = useOf(item, entry.id)
  return (!priced || typeof item.charges?.max === "number") && (!use || use.count === undefined || typeof use.count === "number")
}

/**
 * What the engine runs of an item's use, for its label (./items `itemLabel`): a potion drunk, by what it does, and an
 * item's spells cast from it with its charges and uses. `fields` are the item's typed fields it accounts for, and the
 * rest of the item is labelled without them. None for an item that is neither.
 *
 * A potion is "run" when drinking it runs in full (a Potion of Healing), "partly run" when some of it does (a Potion of
 * Poison's damage), and "told" otherwise. An item that casts is "run" when it casts every spell it gives and the engine
 * runs each of them, and "partly run" when it casts some, or casts one the engine tells. Its charges are accounted for
 * when only its spells spend them, and its uses when each is a spell's.
 */
// The fields of an item that say what it is, not what it does.
const ENTRY_KEYS = new Set<string>(["id", "name", "page", "category", "base", "rarity", "attunement", "description"])

export function usedParts(item: MagicItem): { label: "run" | "partly run" | "told"; fields: (keyof MagicItem)[] } | undefined {
  // A potion is labelled whole by what drinking it does: what it does beyond that is told with it.
  const potion = potionLabel(item)
  if (potion && item.consumable) return { label: potion, fields: (Object.keys(item) as (keyof MagicItem)[]).filter((key) => !ENTRY_KEYS.has(key)) }
  const spells = item.spells ?? []
  const cast = spells.filter((entry) => castable(item, entry))
  if (!cast.length) return undefined
  const chargesRun =
    !!item.charges &&
    typeof item.charges.max === "number" &&
    !item.untyped?.includes("charges") &&
    !(item.damage ?? []).some((entry) => entry.charges) &&
    !(item.saves ?? []).some((entry) => entry.charges) &&
    spells.every((entry) => !(entry.chargesPerSpellLevel || (entry.charges ?? 0) > 0) || castable(item, entry))
  const usesRun = !!item.uses && item.uses.every((use) => !!use.spell && cast.some((entry) => entry.id === use.spell))
  const every = cast.length === spells.length && cast.every((entry) => spellById.get(entry.id) && spellLabel({ id: entry.id }) === "run")
  // A table that only prints the spells and their charges (a Staff of Healing's) says nothing more.
  const names = new Set(spells.flatMap((entry) => spellById.get(entry.id)?.name ?? []))
  const tablesOfSpells = !!item.tables && item.tables.every((table) => table.rows.every((row) => row.cells.some((cell) => names.has(cell))))
  return {
    label: every ? "run" : "partly run",
    fields: ["spells", "activation", ...(chargesRun ? (["charges"] as const) : []), ...(usesRun ? (["uses"] as const) : []), ...(tablesOfSpells ? (["tables"] as const) : [])],
  }
}

/**
 * What the game runs of an owned item's use, in words for the game master, after its name: how many of a potion are
 * left and what drinking one does, the charges left, and that its spells are among the character's. Empty for an item
 * with none of these.
 */
export function itemUseWords(sheet: Sheet, owned: OwnedItem): string {
  const found = itemOf(owned)
  if (!found) return ""
  const parts: string[] = []
  if (owned.count) parts.push(`${owned.count} of them.`)
  if (isDrunk(found.item)) {
    const effect = potionEffect(owned)
    parts.push(
      effect.kind === "healing"
        ? `Drunk or given as a Bonus Action, it restores ${effect.dice} hit points, which the game rolls.`
        : effect.kind === "damage"
          ? `Drunk or given as a Bonus Action, it deals ${effect.dice} ${effect.type} damage to the drinker, which the game rolls.`
          : "Drunk or given as a Bonus Action, it is used up."
    )
  }
  const charges = chargeWords(owned)
  if (charges) parts.push(`${charges[0].toUpperCase()}${charges.slice(1)}.`)
  const index = (sheet.items ?? []).indexOf(owned)
  if (itemSpellsOf(sheet).some((casting) => casting.index === index)) parts.push("Its spells are among the character's spells, cast from it.")
  return parts.join(" ")
}
