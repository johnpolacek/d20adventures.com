import { equipmentById } from "@d20/srd/equipment"
import type { Attack } from "./attack"
import { shapeOf } from "./shape"
import type { Sheet, Stock } from "./sheet"
import { type Point, placedOf, within } from "./space"

/**
 * Ammunition and thrown weapons, by the SRD 5.2.1. A weapon with the Ammunition property spends one piece each time it
 * attacks, and a hero with none left cannot attack with it. After a fight, half the pieces spent in it are gathered,
 * rounded down. A Thrown weapon leaves the hand when it is thrown and lands by its target, where it can be picked up
 * again: one within 5 feet of the hero is picked up as they attack, with the turn's free object interaction. A hero
 * with none in hand cannot attack with it at all. Those left lying are gathered once the fight is won, and lost when
 * the party leaves while foes still stand.
 *
 * What the hero starts with is read from the character's equipment, which is free text: "Two Daggers", "Pouch with 20
 * Sling Bullets", "Quiver". What they have once one is spent is kept on the sheet (`Sheet.stock`).
 */

/** One with a sheet whose stock is counted: a hero, with the equipment they carry and where they stand. */
export type Stocked = { name?: string; sheet?: Sheet; equipment?: readonly { name: string; description?: string }[]; position?: Point }

/** What an attack uses up: a piece of ammunition, or the thrown weapon itself. */
export type Use = { kind: "ammunition" | "thrown"; id: string; name: string; plural: string }

const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  pair: 2,
  brace: 2,
  couple: 2,
  twin: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
}
const COUNT = `(\\d+|${Object.keys(NUMBERS).join("|")})`
// A count for ammunition takes no "a": "a quiver of arrows" is a quiver's worth, not one arrow.
const PIECES = `(\\d+|${Object.keys(NUMBERS)
  .filter((word) => NUMBERS[word] !== 1)
  .join("|")})`
// "A pair of daggers" is two, and not "a" dagger.
const plainCounts = (text: string) =>
  text
    .replace(/\ba (?:pair|brace|couple) of\b/gi, "two")
    .replace(/\ba dozen\b/gi, "twelve")
const countOf = (word: string): number => (/^\d+$/.test(word) ? Number(word) : (NUMBERS[word.toLowerCase()] ?? 1))

// What equipment names call each kind of ammunition, and what holds it.
const AMMUNITION_WORDS: Record<string, { words: string; holder?: string }> = {
  arrows: { words: "arrows?", holder: "quiver" },
  bolts: { words: "(?:crossbow )?bolts?", holder: "(?:bolt )?case" },
  "bullets-sling": { words: "(?:sling )?(?:bullets?|stones?|shot)" },
  "bullets-firearm": { words: "(?:bullets?|shot|rounds?)" },
  needles: { words: "(?:blowgun )?needles?" },
}

const PLURALS: Record<string, string> = { arrows: "Arrows", bolts: "Bolts", "bullets-sling": "Sling Bullets", "bullets-firearm": "Bullets", needles: "Needles" }

/**
 * What an attack with a hero's weapon uses up, made from where it is made: a piece of ammunition for a weapon with the
 * Ammunition property, and the weapon itself for one with the Thrown property when it is thrown. Thrown is unset for a
 * weapon held in hand, which needs one in hand but spends none. A stat block's attack and an Unarmed Strike use none.
 */
export function useOf(weaponId: string): Use | undefined {
  const weapon = equipmentById.get(weaponId)
  if (weapon?.kind !== "weapon") return undefined
  const properties: readonly string[] = weapon.properties ?? []
  if (properties.includes("ammunition") && weapon.ammunition) {
    const ammunition = equipmentById.get(weapon.ammunition)
    return { kind: "ammunition", id: weapon.ammunition, name: ammunition?.name ?? weapon.ammunition, plural: PLURALS[weapon.ammunition] ?? ammunition?.name ?? weapon.ammunition }
  }
  if (properties.includes("thrown")) return { kind: "thrown", id: weapon.id, name: weapon.name, plural: `${weapon.name}s` }
  return undefined
}

// Whether an attack is one a hero makes with a weapon they carry, and not in a Beast's shape (./shape).
const carries = (character: Stocked, attack: Pick<Attack, "id">): boolean => !!character.sheet?.weapons?.includes(attack.id) && !shapeOf(character as Parameters<typeof shapeOf>[0])

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * How many of an ammunition or a thrown weapon the character's equipment names, before any is spent. A number before
 * the word counts ("Two Daggers", "Pouch with 20 Sling Bullets"), a plural with none counts 2 weapons or a full bundle
 * of ammunition, and a quiver or case with no number counts the bundle it holds. A weapon named nowhere is the one the
 * sheet lists, and ammunition named nowhere is one bundle: Thalbern's Longbow comes with 20 Arrows.
 */
export function equippedCount(character: Stocked, id: string): number {
  const texts = (character.equipment ?? []).map((item) => `${item.name}. ${item.description ?? ""}`.replace(/[’']/g, "'")).map(plainCounts)
  const item = equipmentById.get(id)
  if (item?.kind === "ammunition") {
    const named = AMMUNITION_WORDS[id]
    const bundle = item.bundleSize ?? 20
    if (!named) return bundle
    const counted = new RegExp(`\\b${PIECES}\\s+(?:[\\w-]+\\s+){0,2}?(?:${named.words})\\b`, "i")
    const word = new RegExp(`\\b(?:${named.words})\\b`, "i")
    const holder = named.holder ? new RegExp(`\\b${named.holder}\\b`, "i") : undefined
    let total = 0
    let found = false
    for (const text of texts) {
      const hit = text.match(counted)
      if (hit) {
        total += countOf(hit[1] ?? "1")
        found = true
      } else if (word.test(text) || holder?.test(text)) {
        total += bundle
        found = true
      }
    }
    return found ? total : bundle
  }
  if (item?.kind !== "weapon") return 0
  const name = escaped(item.name)
  const counted = new RegExp(`\\b${COUNT}\\s+(?:of\\s+)?(?:[\\w-]+\\s+){0,2}?${name}s?\\b`, "i")
  const plural = new RegExp(`\\b${name}s\\b`, "i")
  const single = new RegExp(`\\b${name}\\b`, "i")
  let total = 0
  for (const text of texts.map((entry) => entry.split(". ")[0] ?? entry)) {
    const hit = text.match(counted)
    if (hit) total += countOf(hit[1] ?? "1")
    else if (plural.test(text)) total += 2
    else if (single.test(text)) total += 1
  }
  return Math.max(1, total)
}

/** How many of an ammunition or a thrown weapon the hero has in hand or in their quiver now. */
export function carriedCount(character: Stocked, id: string): number {
  return character.sheet?.stock?.carried?.[id] ?? equippedCount(character, id)
}

// The thrown weapons of a kind lying within 5 feet of the hero, by their index in `loose`.
function looseNear(character: Stocked, id: string, at?: Point): number[] {
  const from = at ? { at } : placedOf(character as Parameters<typeof placedOf>[0])
  return (character.sheet?.stock?.loose ?? []).flatMap((entry, index) => (entry.id === id && from && entry.at && within(from, { at: entry.at }, 5) ? [index] : []))
}

/**
 * Why a hero cannot make an attack with what they carry, or nothing when they can. An attack with a weapon that spends
 * ammunition needs a piece left. An attack with a Thrown weapon, thrown or in hand, needs one in hand or lying within
 * 5 feet. The words are told in the story, as a spell that cannot be cast is.
 */
export function attackStockRuling(character: Stocked, attack: Pick<Attack, "id" | "name">, at?: Point): { name: string; text: string } | undefined {
  if (!carries(character, attack)) return undefined
  const use = useOf(attack.id)
  if (!use || carriedCount(character, use.id) > 0 || (use.kind === "thrown" && looseNear(character, use.id, at).length > 0)) return undefined
  const who = character.name ?? "They"
  const text =
    use.kind === "ammunition"
      ? `${who} has no ${use.plural} left for the ${attack.name}. The attack is not made.`
      : `${who} has no ${use.name} in hand: every one thrown lies where it fell. The attack is not made.`
  return { name: `Out Of ${use.plural}`, text }
}

/** The words of what a hero has left, for the list of their attacks: "14 Arrows left", "1 Dagger in hand". */
export function stockWords(character: Stocked, attack: Pick<Attack, "id">): string | undefined {
  if (!carries(character, attack)) return undefined
  const use = useOf(attack.id)
  if (!use) return undefined
  const count = carriedCount(character, use.id)
  if (use.kind === "ammunition") return `${count} ${count === 1 ? use.name.replace(/s$/, "") : use.plural} left`
  return `${count} ${count === 1 ? use.name : use.plural} in hand, each thrown is gone until picked up`
}

const withStock = <T extends Stocked>(character: T, stock: Stock): T => {
  const tidy: Stock = {
    ...(stock.carried && Object.keys(stock.carried).length ? { carried: stock.carried } : {}),
    ...(stock.loose?.length ? { loose: stock.loose } : {}),
    ...(stock.shot && Object.keys(stock.shot).length ? { shot: stock.shot } : {}),
  }
  const { stock: _, ...sheet } = character.sheet as Sheet
  return { ...character, sheet: Object.keys(tidy).length ? { ...sheet, stock: tidy } : sheet }
}

/**
 * The hero once an attack is made with what they carry. A piece of ammunition is spent. A thrown weapon leaves the hand
 * and lies where the target stood. One in hand is kept. Where none is in hand, one lying within 5 feet is picked up
 * first. Any other attack changes nothing.
 */
export function withAttackSpent<T extends Stocked>(character: T, weaponId: string, options: { thrown?: boolean; landsAt?: Point } = {}): T {
  if (!character.sheet || !carries(character, { id: weaponId })) return character
  const use = useOf(weaponId)
  if (!use) return character
  const stock = character.sheet.stock ?? {}
  const carried = { ...stock.carried }
  let loose = [...(stock.loose ?? [])]
  let have = carriedCount(character, use.id)
  if (use.kind === "ammunition") {
    if (have <= 0) return character
    carried[use.id] = have - 1
    return withStock(character, { ...stock, carried, shot: { ...stock.shot, [use.id]: (stock.shot?.[use.id] ?? 0) + 1 } })
  }
  if (have <= 0) {
    const [near] = looseNear(character, use.id)
    if (near === undefined) return character
    loose = loose.filter((_, index) => index !== near)
    have = 1
  }
  carried[use.id] = options.thrown ? have - 1 : have
  if (options.thrown) loose.push({ id: use.id, ...(options.landsAt ? { at: options.landsAt } : {}) })
  return withStock(character, { ...stock, carried, loose })
}

/**
 * The hero once a fight is over. Where it was won, each thrown weapon lying is gathered and half the ammunition spent
 * comes back, rounded down, told in a line. Where the party left while foes stood, what lies there is lost.
 */
export function afterFight<T extends Stocked>(character: T, won: boolean): { character: T; told?: string } {
  const stock = character.sheet?.stock
  if (!stock || (!stock.loose?.length && !stock.shot)) return { character }
  const carried = { ...stock.carried }
  const gathered: string[] = []
  if (won) {
    const thrown = new Map<string, number>()
    for (const entry of stock.loose ?? []) thrown.set(entry.id, (thrown.get(entry.id) ?? 0) + 1)
    for (const [id, count] of thrown) {
      carried[id] = carriedCount(character, id) + count
      const use = useOf(id)
      gathered.push(`picks up ${count === 1 ? `the ${use?.name ?? id}` : `the ${count} ${use?.plural ?? id}`} thrown`)
    }
    for (const [id, count] of Object.entries(stock.shot ?? {})) {
      const back = Math.floor(count / 2)
      const name = PLURALS[id] ?? id
      if (back) carried[id] = carriedCount(character, id) + back
      gathered.push(`gathers ${back} of the ${count} ${name} spent, ${carried[id] ?? carriedCount(character, id)} now`)
    }
  }
  const after = withStock(character, { carried })
  return { character: after, ...(gathered.length ? { told: `After the fight, ${character.name ?? "the hero"} ${gathered.join(", and ")}.` } : {}) }
}
