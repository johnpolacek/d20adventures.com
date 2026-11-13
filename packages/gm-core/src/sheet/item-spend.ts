import { magicItemById } from "@d20/srd/magic-items"
import { damageTaken, defensesOf, parseDice, rollDamage } from "./attack"
import { type BonusAction, type BonusActionRule, classKeepsCharges, type Featured, type FeatureUse } from "./class-rules"
import { withDamage, withHealing } from "./death"
import type { Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { article, chargesData, chargesOf, type ItemCost, isDrunk, menuId, potionActionsOf, potionEffect, withEntry, withField, withOneUsed } from "./item-use"
import { itemName, itemOf, textLine } from "./items"
import type { Sheet } from "./sheet"
import { placedOf, within } from "./space"

/**
 * Spending a magic item, by the SRD 5.2.1: a potion drunk or given as a Bonus Action, an item's charges and uses spent,
 * and what a rest gives back to them. What the hero holds and has spent is read by ./item-use, and kept on the item's
 * entry on the sheet.
 */

const POTION_NOTE =
  'A potion is drunk as a Bonus Action, by the character or by someone beside them they give it to: "bonusTarget" is that one\'s id, and is left out when the character drinks it themselves. Drinking or giving a potion is never a check.'

// One a potion is given to: the drinker, or one within 5 feet of them where both stand on a floor. Not the dead.
function drinkerOf(actor: Featured, characters: readonly Featured[], target: string | undefined): Featured | undefined {
  const other = characters.find((character) => character.id === (target ?? actor.id))
  if (!other || other.dead) return undefined
  const from = placedOf(actor as Parameters<typeof placedOf>[0])
  const at = placedOf(other as Parameters<typeof placedOf>[0])
  return !from || !at || other.id === actor.id || within(from, at, 5) ? other : undefined
}

const standingWords = (character: Featured) => {
  const now = hitPointsOf(character)
  return now ? `, now ${now.current} of ${now.maximum}` : ""
}

/**
 * Drink a potion, or give it to one beside the drinker: one of the entry is used up, and its effect falls on whoever
 * drinks it. A Potion of Healing heals its own dice and brings one at 0 hit points back up. A Potion of Poison deals
 * its damage, and its save is told. Any other is drunk and told from its text. One the hero does not have, or one given
 * to someone dead or out of reach, is not drunk.
 */
export function drinkPotion(args: { characters: Featured[]; actor: Featured; action: BonusAction; target?: string; roll: (sides: number) => number }): {
  characters: Featured[]
  use?: FeatureUse
} {
  const { characters, actor, action } = args
  const sheet = actor.sheet
  const index = (sheet?.items ?? []).findIndex((owned) => menuId(owned) === action.id && isDrunk(magicItemById.get(owned.id)))
  const drinker = drinkerOf(actor, characters, args.target)
  if (!sheet || index < 0 || !drinker) return { characters }
  const owned = (sheet.items ?? [])[index]
  const found = itemOf(owned)
  if (!found) return { characters }
  const name = itemName(owned)
  const giver: Featured = { ...actor, sheet: withOneUsed(sheet, index) }
  const self = drinker.id === actor.id
  let after: Featured = self ? giver : drinker
  const who = self ? `${actor.name} drinks ${article(name)} ${name}` : `${actor.name} gives ${drinker.name} ${article(name)} ${name}, and ${drinker.name} drinks it`
  const effect = potionEffect(owned)
  let harm: Harm[] | undefined
  let fact: string
  if (effect.kind === "healing") {
    const rolled = rollDamage([{ dice: effect.dice, type: "force" }], args.roll)
    const [part] = rolled.parts
    const before = hitPointsOf(after)?.current ?? 0
    after = withHealing(after, rolled.total)
    const gained = (hitPointsOf(after)?.current ?? before) - before
    harm = [{ target: drinker.id, kind: "healing", dice: part?.dice ?? [], sides: part?.sides, bonus: part?.bonus ?? 0, amount: gained }]
    fact = `${who} and regains ${gained} hit points${standingWords(after)}.`
  } else if (effect.kind === "damage") {
    const rolled = rollDamage([{ dice: effect.dice, type: effect.type }], args.roll)
    const [part] = rolled.parts
    const amount = damageTaken(rolled, defensesOf(after))
    after = withDamage(after, amount, { types: [effect.type] }).character
    harm = [{ target: drinker.id, kind: "damage", dice: part?.dice ?? [], sides: part?.sides, bonus: part?.bonus ?? 0, type: effect.type, amount }]
    fact = `${who} and takes ${amount} ${effect.type} damage${standingWords(after)}. The game runs nothing more of it. Its text: "${textLine(found.item)}"`
  } else fact = `${who}. The game does not run it, so it changes no number. Its text: "${textLine(found.item)}"`
  const changed = self ? [after] : [after, giver]
  return {
    characters: characters.map((character) => changed.find((other) => other.id === character.id) ?? character),
    use: { feature: action.id, name, target: drinker.id, ...(harm ? { harm } : {}), fact },
  }
}

/** The rule of a potion on the read's menu, by its id there: drunk, or given to one beside the drinker. */
export function potionRule(character: { sheet?: Sheet }, id: string | undefined): BonusActionRule | undefined {
  const action = id ? potionActionsOf(character).find((entry) => entry.id === id) : undefined
  if (!action) return undefined
  return { id: action.id, feature: action.id, targeted: true, note: POTION_NOTE, use: drinkPotion }
}

/**
 * The sheet with an item's charges spent, by its place among the items. "If you expend the last charge, roll 1d20. On
 * a 1, the wand crumbles into ashes and is destroyed": where the data types it, the die is rolled with `roll` when the
 * last is spent, and an item destroyed or made plain is taken off the sheet. With no `roll` the die is not rolled. The
 * sheet after, and what happened in words. Spending more than are left is refused. A class feature may keep them by a
 * die rolled with `roll` (Use Magic Device).
 */
export function withChargesSpent(sheet: Sheet, index: number, charges: number, roll?: (sides: number) => number): { sheet: Sheet; facts: string[] } {
  const owned = sheet.items?.[index]
  const held = owned && chargesOf(owned)
  if (!owned || !held) throw new Error("The hero has no such item with charges.")
  if (charges > held.left) throw new Error(`${itemName(owned)} has ${held.left} charges left, fewer than ${charges}.`)
  if (charges < 1) return { sheet, facts: [] }
  // A class feature may keep the charges by a die (Use Magic Device's d6, on a 6).
  const kept = roll ? classKeepsCharges({ sheet }, roll) : undefined
  if (kept?.kept) return { sheet, facts: [kept.text] }
  const spent = withEntry(sheet, index, withField(owned, "spent", (owned.spent ?? 0) + charges))
  const last = chargesData(owned)?.lastCharge
  if (held.left > charges || !last || !roll) return { sheet: spent, facts: [] }
  const { sides } = parseDice(last.dice)
  const die = roll(sides)
  if (!Number.isInteger(die) || die < 1 || die > sides) throw new Error(`${die} is not a d${sides} roll.`)
  const outcome = last.outcomes.find((entry) => entry.on === die)
  const name = itemName(owned)
  if (!outcome) return { sheet: spent, facts: [`The last charge of the ${name} is spent. Its d${sides} rolls ${die}, and it holds.`] }
  return { sheet: withEntry(sheet, index, undefined), facts: [`The last charge of the ${name} is spent. Its d${sides} rolls ${die}: ${outcome.effect}`] }
}

const DAWN = new Set(["dawn", "long-rest", "short-or-long-rest", "initiative-or-short-or-long-rest"])
const SHORT = new Set(["short-rest", "short-or-long-rest", "initiative-or-short-or-long-rest"])

/**
 * What a rest gives back to the items a hero owns. The engine keeps no clock, so a Long Rest stands for the dawn: each
 * item regains its charges as its data says ("regains 1d6 + 1 expended charges daily at dawn"), rolled with `roll`, up
 * to its maximum, and the uses that come back at dawn or on a rest come back. A Short Rest gives back only the uses
 * that come back on one. A use with no time to come back never does (the Chime of Opening's ten). The sheet after,
 * and what came back in words.
 */
export function itemsRested(sheet: Sheet, kind: "short" | "long", roll?: (sides: number) => number): { sheet: Sheet; facts: string[] } {
  const facts: string[] = []
  let after = sheet
  for (const [index, owned] of (sheet.items ?? []).entries()) {
    const found = itemOf(owned)
    if (!found) continue
    let entry = owned
    const name = itemName(owned)
    const regains = chargesData(owned)?.regains
    const held = chargesOf(owned)
    if (kind === "long" && regains && held && owned.spent) {
      let amount = owned.spent
      if (typeof regains.amount === "number") amount = regains.amount
      else if (regains.amount !== "all") {
        if (!roll) throw new Error("A Long Rest that gives back an item's charges needs a die to roll them.")
        amount = rollDamage([{ dice: regains.amount, type: "force" }], roll).total
      }
      const back = Math.min(owned.spent, amount)
      entry = withField(entry, "spent", owned.spent - back)
      if (back > 0) facts.push(`The ${name} regains ${back} expended ${back === 1 ? "charge" : "charges"}, now ${held.left + back} of ${held.max}.`)
    }
    const used = Object.entries(owned.used ?? {}).filter(([key]) => {
      const recharge = (found.item.uses ?? []).find((use) => use.spell === key || use.label === key)?.recharge
      return !recharge || !(kind === "long" ? DAWN : SHORT).has(recharge)
    })
    if (used.length < Object.keys(owned.used ?? {}).length) {
      entry = withField(entry, "used", Object.fromEntries(used))
      facts.push(`The ${name} has its uses back.`)
    }
    if (entry !== owned) after = withEntry(after, index, entry)
  }
  return { sheet: after, facts }
}

/** The sheet with a casting from an item paid for: its charges spent, with the last charge's roll where `roll` is given, or its use. */
export function withItemCastSpent(sheet: Sheet, cost: ItemCost, roll?: (sides: number) => number): { sheet: Sheet; facts: string[] } {
  const owned = sheet.items?.[cost.index]
  if (!owned) return { sheet, facts: [] }
  if (cost.use) return { sheet: withEntry(sheet, cost.index, withField(owned, "used", { ...owned.used, [cost.use]: (owned.used?.[cost.use] ?? 0) + 1 })), facts: [] }
  if (cost.charges < 1) return { sheet, facts: [] }
  return withChargesSpent(sheet, cost.index, cost.charges, roll)
}
