import { equipmentById } from "@d20/srd/equipment"
import { magicItemById } from "@d20/srd/magic-items"
import type { MagicItem } from "@d20/srd/schema/magic-items"
import { z } from "zod"
import { casterOf, deriveSheet, trainedWith } from "./derive"
import { itemTrainsWith } from "./item-effects"
import { article, countOf } from "./item-use"
import { bonusesRun, endAttunement, entryProblems, itemName, itemProblems, prerequisiteProblem } from "./items"
import type { OwnedItem, Sheet } from "./sheet"

/**
 * Loot: the magic items an adventure gives, by its own words, and the plain rule the engine gives them by. The game
 * master invents no magic item. An encounter's frontmatter lists its loot, each an SRD item with its variant and base
 * where it has them, a count for a consumable or one for each hero, and when it is given:
 *
 * - `on: enter`, as the party comes to the encounter the first time. Never the start encounter, which no one enters.
 * - `on: leave`, as the party leaves it the first time, by any transition, or with `to` by the one to that encounter.
 *
 * The moment is known from the adventure's turns alone, which both hosts keep: a turn is written once, so a reload or a
 * retried turn cannot give loot twice.
 */

export const LOOT_MOMENTS = ["enter", "leave"] as const

export const lootSchema = z.strictObject({
  id: z.string().min(1),
  variant: z.string().min(1).optional(),
  base: z.string().min(1).optional(),
  count: z.number().int().min(2).optional(),
  /** One for each living hero of the party, in place of a count: a potion pressed into every hand. */
  each: z.literal(true).optional(),
  on: z.enum(LOOT_MOMENTS),
  /** For loot given on leaving: the encounter the transition it is given by leads to. */
  to: z.string().min(1).optional(),
})
export type Loot = z.infer<typeof lootSchema>

/**
 * What is wrong with an encounter's loot entry: an item the SRD lacks, a variant or base it does not take, a count on
 * an item that is not used up, a moment the engine never comes to, or a transition the encounter does not have.
 */
export function lootProblems(loot: Loot, encounter: { isStart: boolean; transitions: readonly { toEncounterId: string }[] }): string[] {
  const problems = entryProblems(loot)
  const item = magicItemById.get(loot.id)
  if (item && loot.count && !item.consumable) problems.push(`${item.name} is not used up, so it is given one at a time`)
  if (item && loot.each && !item.consumable) problems.push(`${item.name} is not used up, so it is not given to each hero`)
  if (loot.each && loot.count) problems.push("loot is given to each hero or in a count, not both")
  if (loot.on === "enter" && encounter.isStart) problems.push("the adventure opens in its start encounter and never enters it, so its loot is given on leaving it")
  if (loot.on === "enter" && loot.to) problems.push("a transition is named only for loot given on leaving")
  if (loot.on === "leave" && !encounter.transitions.length) problems.push("the encounter has no transition, so it is never left")
  if (loot.on === "leave" && loot.to && !encounter.transitions.some((transition) => transition.toEncounterId === loot.to)) problems.push(`the encounter has no transition to "${loot.to}"`)
  return problems
}

type Row = { encounterId: string; order: number }

// The moves from one encounter to another the turns show, in order.
const moves = (turns: readonly Row[]) => {
  const rows = [...turns].sort((a, b) => a.order - b.order)
  return rows.slice(1).flatMap((row, at) => (row.encounterId !== rows[at].encounterId ? [{ from: rows[at].encounterId, to: row.encounterId }] : []))
}

/**
 * The loot due as the party moves from one encounter to the next, given the turns played so far, the one they leave
 * among them. Loot of the encounter left is due the first time it is left, or the first time by its named transition.
 * Loot of the encounter entered is due the first time the party comes to it.
 */
export function lootDue(args: { from: { id: string; loot?: readonly Loot[] }; to: { id: string; loot?: readonly Loot[] }; turns: readonly Row[] }): { leaving: Loot[]; entering: Loot[] } {
  const before = moves(args.turns)
  const leaving = (args.from.loot ?? []).filter(
    (loot) => loot.on === "leave" && (!loot.to || loot.to === args.to.id) && !before.some((move) => move.from === args.from.id && (!loot.to || move.to === loot.to))
  )
  const entering = args.turns.some((row) => row.encounterId === args.to.id) ? [] : (args.to.loot ?? []).filter((loot) => loot.on === "enter")
  return { leaving, entering }
}

type Hero = { id: string; name: string; type?: string; sheet?: Sheet; dead?: true; fled?: true }

const consumable = (owned: Pick<OwnedItem, "id">) => !!magicItemById.get(owned.id)?.consumable
const same = (a: Pick<OwnedItem, "id" | "variant" | "base">, b: Pick<OwnedItem, "id" | "variant" | "base">) => a.id === b.id && a.variant === b.variant && a.base === b.base
// How many magic items a hero holds, potions and other consumables aside.
const held = (sheet: Sheet) => (sheet.items ?? []).filter((owned) => !consumable(owned)).length
// How many of one consumable a hero holds.
const heldOf = (sheet: Sheet, owned: OwnedItem) => (sheet.items ?? []).filter((entry) => same(entry, owned)).reduce((sum, entry) => sum + countOf(entry), 0)

/**
 * The hero's sheet with one item more, held and used, or none where they cannot use it. A magic weapon needs training
 * with its base, and is carried in place of the plain one they hold, or beside their weapons where they hold none.
 * Magic armor goes only to one who wears that armor, and a magic Shield to one who carries a Shield. Ammunition needs
 * a weapon they hold and are trained with that fires it. An item with a prerequisite for Attunement needs the hero to
 * meet it. Nothing is given that would leave the sheet's items with a problem they did not have.
 */
export function withItem(sheet: Sheet, owned: OwnedItem): Sheet | undefined {
  const item = magicItemById.get(owned.id)
  if (!item || entryProblems(owned).length) return undefined
  if (item.attunement && prerequisiteProblem(sheet, item, casterOf(sheet))) return undefined
  let after: Sheet = sheet
  const base = owned.base ? equipmentById.get(owned.base) : undefined
  const trained = (weapon: NonNullable<typeof base>) => weapon.kind === "weapon" && (trainedWith(deriveSheet(sheet).weaponProficiencies, weapon) || itemTrainsWith(sheet, weapon.id))
  if (base?.kind === "weapon") {
    if (!trained(base)) return undefined
    if (!(sheet.weapons ?? []).includes(base.id)) after = { ...after, weapons: [...(sheet.weapons ?? []), base.id] }
  } else if (base?.kind === "armor") {
    if (base.category === "shield" ? !sheet.shield : sheet.armor !== base.id) return undefined
  } else if (base?.kind === "ammunition") {
    const fires = (sheet.weapons ?? []).flatMap((id) => equipmentById.get(id) ?? []).some((weapon) => weapon.kind === "weapon" && weapon.ammunition === base.id && trained(weapon))
    if (!fires) return undefined
  }
  after = { ...after, items: added(sheet.items ?? [], owned) }
  const was = new Set(itemProblems(sheet, casterOf(sheet)))
  if (itemProblems(after, casterOf(after)).some((problem) => !was.has(problem))) return undefined
  return after
}

// A sheet's items with one item more: a consumable joins the entry of its kind, and anything else is a new entry.
function added(items: readonly OwnedItem[], owned: OwnedItem): OwnedItem[] {
  const { count: _, attuned: __, ...one } = owned
  const kept = consumable(one) ? items.findIndex((entry) => same(entry, one)) : -1
  return kept >= 0 ? items.map((entry, at) => (at === kept ? withCount(entry, countOf(entry) + 1) : entry)) : [...items, one]
}

// Whether an item serves a caster: it asks for a Spellcaster, casts spells, or adds to spell attacks or save DCs.
const forCasters = (item: MagicItem, owned: OwnedItem) =>
  !!item.attunement?.spellcaster || !!item.spells?.length || bonusesRun(owned).some((bonus) => bonus.to === "spell-attack-rolls" || bonus.to === "spell-save-dc")

/**
 * How well an item suits a hero's class, for a tie: a weapon the hero holds the plain one of, then one they have
 * mastery of; an item for a caster to a hero whose class has Spellcasting. Higher suits better.
 */
function suits(sheet: Sheet, owned: OwnedItem): number {
  const item = magicItemById.get(owned.id)
  if (!item) return 0
  if (owned.base && equipmentById.get(owned.base)?.kind === "weapon") return ((sheet.weapons ?? []).includes(owned.base) ? 2 : 0) + ((sheet.weaponMasteries ?? []).includes(owned.base) ? 1 : 0)
  return forCasters(item, owned) && casterOf(sheet).spellcaster ? 1 : 0
}

/** One hero given what loot holds for them, and what they were given, as a story fact. */
export type LootGiven = { character: string; name: string; text: string }

/**
 * Give an encounter's loot to the party by a plain rule, with no model call. Each item goes to a living hero who can
 * use it (./loot `withItem`). An item that is not used up goes to the one who holds the fewest magic items, potions
 * aside, ties going to the one whose class it suits best and then to the first in the party's order. A consumable is
 * given one at a time, each to the one who holds the fewest of it, ties to the first in order. The party's order is
 * the order `characters` lists them in. Each hero's share is told as a story fact: "Branka takes the Longsword +1."
 * An item no one can use is left, and told.
 */
export function giveLoot<T extends Hero>(characters: readonly T[], loot: readonly Loot[]): { characters: T[]; given: LootGiven[]; left: string[] } {
  let party = [...characters]
  const given: LootGiven[] = []
  const left: string[] = []
  for (const entry of loot) {
    const { on: _on, to: _to, count, each, ...owned } = entry
    const name = itemName(owned)
    const shares = new Map<string, number>()
    // One for each living hero is as many as there are, given by the same rule: each to the one who holds the fewest.
    const many = each ? party.filter((hero) => hero.type === "pc" && hero.sheet && !hero.dead && !hero.fled).length : (count ?? 1)
    for (let one = 0; one < many; one++) {
      const options = party.flatMap((hero, place) => {
        if (hero.type !== "pc" || !hero.sheet || hero.dead || hero.fled) return []
        const after = withItem(hero.sheet, owned)
        return after ? [{ hero, place, after, sheet: hero.sheet }] : []
      })
      const ranked = options.sort((a, b) =>
        consumable(owned) ? heldOf(a.sheet, owned) - heldOf(b.sheet, owned) || a.place - b.place : held(a.sheet) - held(b.sheet) || suits(b.sheet, owned) - suits(a.sheet, owned) || a.place - b.place
      )
      const taker = ranked[0]
      if (!taker) {
        left.push(`No one here can use the ${name}, so it is left behind.`)
        break
      }
      party = party.map((hero) => (hero.id === taker.hero.id ? { ...hero, sheet: taker.after } : hero))
      shares.set(taker.hero.id, (shares.get(taker.hero.id) ?? 0) + 1)
    }
    for (const [id, many] of shares) {
      const hero = party.find((each) => each.id === id) as T
      const what = many > 1 ? `${many} ${plural(name)}` : consumable(owned) ? `${article(name)} ${name}` : `the ${name}`
      given.push({ character: id, name, text: `${hero.name} takes ${what}.` })
    }
  }
  return { characters: party, given, left }
}

// An item's name for more than one: "Potions of Healing", "Feather Tokens (Anchor)", "Arrows +1".
function plural(name: string): string {
  const head = name.match(/^(.*?)( of .*| \(.*| [+−-]\d.*)?$/)
  if (!head) return `${name}s`
  const [, stem, rest = ""] = head
  return `${stem}${/s$/.test(stem) ? "" : "s"}${rest}`
}

/**
 * A hero hands one of their magic items, by its place in their items, to another hero. The read offers it only toward
 * a hero within 5 feet. Attunement to it ends for the giver, and the one given it attunes on a Short Rest as anyone
 * does. One of a consumable passes at a time. Nothing changes where either has no sheet, the item is not held, or it
 * is a cursed item the giver is attuned to, whose Attunement they cannot end.
 */
export function handOver<T extends Hero>(characters: readonly T[], fromId: string, toId: string, index: number): { characters: T[]; fact?: string } {
  const from = characters.find((each) => each.id === fromId)
  const to = characters.find((each) => each.id === toId && each.id !== fromId)
  const owned = from?.sheet?.items?.[index]
  if (!from?.sheet || !to?.sheet || !owned) return { characters: [...characters] }
  const released = owned.attuned ? endAttunement(from.sheet, index) : { sheet: from.sheet }
  if (!("sheet" in released)) return { characters: [...characters] }
  const left = released.sheet.items ?? []
  const giver: Sheet = { ...released.sheet, items: countOf(owned) > 1 ? left.map((entry, at) => (at === index ? withCount(entry, countOf(owned) - 1) : entry)) : left.filter((_, at) => at !== index) }
  const taker: Sheet = { ...to.sheet, items: added(to.sheet.items ?? [], owned) }
  const name = itemName(owned)
  return {
    characters: characters.map((each) => (each.id === from.id ? { ...each, sheet: giver } : each.id === to.id ? { ...each, sheet: taker } : each)),
    fact: `${from.name} hands ${consumable(owned) ? `${article(name)} ${name}` : `the ${name}`} to ${to.name}.`,
  }
}

const withCount = (owned: OwnedItem, count: number): OwnedItem => {
  const { count: _, ...rest } = owned
  return count > 1 ? { ...rest, count } : rest
}
