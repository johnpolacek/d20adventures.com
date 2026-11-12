import { monsterById } from "@d20/srd/monsters"
import type { Monster } from "@d20/srd/schema/monsters"
import { actionId } from "./attack"
import type { Roller } from "./check"
import { shapeOf } from "./shape"

/**
 * A stat block's Multiattack, read from its words. The SRD types no part of it but the spells a replacement casts, so
 * the words are read against the block's own action names, and a word left over leaves the block unread.
 */

/** Something the Multiattack takes beside its attacks: "uses Constrict", "uses Pummel or Spellcasting", "uses Antennae twice". */
export type MultiattackUse = {
  /** The actions it may take, by id, one of them for each time. */
  actions: string[]
  times: number
  /** "can use": it may leave this out. */
  optional?: true
  /** "if available": only while the action has a use left. */
  ifAvailable?: true
  /** The spells it casts with Spellcasting, by SRD id. */
  spells?: string[]
  /** How many of the attacks come before it, when it falls between them. With none it comes after them all. */
  afterAttacks?: number
}

/** One way of making the Multiattack. Most blocks have one, a Barbed Devil two. */
export type MultiattackOption = {
  /** Each attack, in the order the block gives it: the ids of the block's attacks it may be made with. One for a fixed attack, several for "in any combination". */
  attacks: string[][]
  /** What it takes beside the attacks. The engine does not run these yet. */
  uses?: MultiattackUse[]
  /** The printed words this way holds under: "if it used Hasten this turn". */
  when?: string
}

/** What may take the place of attacks: "It can replace one attack with a use of Spellcasting to cast Shatter." */
export type MultiattackReplacement = {
  /** How many attacks it replaces: 1, 2, or "any". */
  count: number | "any"
  /** The one attack it may replace, when the block names it: the Chimera's Claw. */
  of?: string
  /** What may replace them, any one of these, by id. `attack` marks one of the block's attacks. */
  with: { id: string; attack?: true; spells?: string[]; ifAvailable?: true }[]
}

export type Multiattack = { options: MultiattackOption[]; replace?: MultiattackReplacement }

const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
const COUNT = "(one|two|three|four|five|six)"
// A printed action name: capitalised words, "Channel Negative Energy", "Tail Stinger".
const NAME = "[A-Z][\\w'’-]*(?: [A-Z][\\w'’-]*)*"
// A list of names: "Fling, Lightning Strike, or Swallow", "Scimitar and Pistol", "Javelin or Morningstar".
const NAMES = `${NAME}(?:(?:,? or |,? and |, )${NAME})*`
const split = (names: string) => names.split(/,? or |,? and |, /)

/** A stat block's Multiattack, or why its words could not be read. A block with none has none. */
export function readMultiattack(monster: Monster): Multiattack | { unread: string } | undefined {
  const feature = monster.actions?.find((action) => action.name === "Multiattack")
  if (!feature) return undefined
  const features = [...(monster.actions ?? []), ...(monster.bonusActions ?? [])].filter((entry) => entry.name !== "Multiattack")
  const attacks = new Map(features.filter((entry) => entry.attack).map((entry) => [entry.name.toLowerCase(), actionId(entry.name)]))
  const others = new Map(features.filter((entry) => !entry.attack).map((entry) => [entry.name.toLowerCase(), actionId(entry.name)]))
  // The spells the Multiattack casts, as the data types them.
  const spells = feature.spellcasting?.spells?.map((spell) => spell.id)
  const missing: string[] = []
  // A name that is none of the block's leaves it unread.
  const unknown = (name: string) => {
    missing.push(name)
    return ""
  }
  const attackId = (name: string) => attacks.get(name.toLowerCase()) ?? unknown(name)
  const actionIdOf = (name: string) => others.get(name.toLowerCase()) ?? attacks.get(name.toLowerCase()) ?? unknown(name)
  const [main, ...rest] = feature.text.split(/(?<=\.) /)
  const body = /^The [^.]*? (makes .*)\.$/.exec(main)?.[1]
  if (!body) return { unread: `"${main}" names no attacks` }
  const options: MultiattackOption[] = []
  for (const way of body.split(/,? or (?:it )?(?=makes |uses )/)) {
    const read = readOption(way, attackId, actionIdOf, spells)
    if ("unread" in read) return read
    options.push(read)
  }
  let replace: MultiattackReplacement | undefined
  for (const sentence of rest) {
    const found = new RegExp(`^It can replace (one|two|any|the (${NAME})) attacks? with (.+)\\.$`).exec(sentence)
    if (!found || replace) return { unread: `"${sentence}" is not read` }
    const count = found[1] === "any" ? "any" : found[2] ? 1 : NUMBERS[found[1]]
    const choices = found[3].replace(/\([A-Z]\) /g, "").split(/ or (?=a |\w)/)
    const replacing: MultiattackReplacement["with"] = []
    for (const choice of choices) {
      const attack = new RegExp(`^an? (${NAME}) attack$`).exec(choice)
      const use = new RegExp(`^(?:a use of )?(${NAME})(?: to cast [^(]+?(?: \\([^)]*\\))?)?( if available)?$`).exec(choice)
      if (attack) replacing.push({ id: attackId(attack[1]), attack: true })
      else if (use) {
        const id = actionIdOf(use[1])
        replacing.push({ id, ...(id === "spellcasting" && spells ? { spells } : {}), ...(use[2] ? { ifAvailable: true as const } : {}) })
      } else return { unread: `"${choice}" is not read` }
    }
    replace = { count, ...(found[2] ? { of: attackId(found[2]) } : {}), with: replacing }
  }
  if (missing.length) return { unread: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not among its actions` }
  return { options, ...(replace ? { replace } : {}) }
}

// One way of making the Multiattack, from "makes one Bite attack and uses Constrict" and the like. Every word must be
// read: the attacks, the uses, and the words that join them.
function readOption(way: string, attackId: (name: string) => string, actionIdOf: (name: string) => string, spells: string[] | undefined): MultiattackOption | { unread: string } {
  const when = / (if (?!available)[^,]+)$/.exec(way)
  const text = when ? way.slice(0, when.index) : way
  const found: { at: number; end: number; attacks?: string[][]; use?: MultiattackUse }[] = []
  // "two attacks, using Scimitar and Pistol in any combination", and the Tarrasque's "three other attacks, using …".
  for (const match of text.matchAll(new RegExp(`\\b${COUNT} (?:other )?attacks, using (${NAMES}) in any combination`, "g"))) {
    const ids = split(match[2]).map(attackId)
    found.push({ at: match.index, end: match.index + match[0].length, attacks: Array.from({ length: NUMBERS[match[1]] }, () => ids) })
  }
  // "two Rend attacks", "one Vine Lash or Thorn Burst attack".
  for (const match of text.matchAll(new RegExp(`\\b${COUNT} (${NAME}(?: or ${NAME})*) attacks?\\b`, "g"))) {
    const ids = match[2].split(" or ").map(attackId)
    found.push({ at: match.index, end: match.index + match[0].length, attacks: Array.from({ length: NUMBERS[match[1]] }, () => ids) })
  }
  // "uses Constrict", "uses either Consume Memories or Dominate Mind if available", "can use Spellcasting to cast Charm Monster", "uses Antennae twice".
  for (const match of text.matchAll(new RegExp(`\\b(can )?uses? (?:either )?(${NAMES})(?: to cast ${NAME})?( twice)?( if available)?`, "g"))) {
    const actions = split(match[2]).map(actionIdOf)
    const use: MultiattackUse = {
      actions,
      times: match[3] ? 2 : 1,
      ...(match[1] ? { optional: true as const } : {}),
      ...(match[4] ? { ifAvailable: true as const } : {}),
      ...(actions.includes("spellcasting") && spells ? { spells } : {}),
    }
    found.push({ at: match.index, end: match.index + match[0].length, use })
  }
  found.sort((a, b) => a.at - b.at)
  // What is left once the parts are taken out must be only the words that join them.
  let left = ""
  let from = 0
  for (const part of found) {
    if (part.at < from) return { unread: `"${way}" reads two ways` }
    left += ` ${text.slice(from, part.at)}`
    from = part.end
  }
  left += ` ${text.slice(from)}`
  if (!/^(?:[\s,]|\b(?:makes|and|it)\b)*$/.test(left)) return { unread: `"${left.trim()}" in "${way}" is not read` }
  const attacks = found.flatMap((part) => part.attacks ?? [])
  // A use that falls between attacks says how many come before it: the Roper reels between its Tentacles and Bites.
  let made = 0
  const uses = found.flatMap((part) => {
    made += part.attacks?.length ?? 0
    return part.use ? [made > 0 && made < attacks.length ? { ...part.use, afterAttacks: made } : part.use] : []
  })
  return { attacks, ...(uses.length ? { uses } : {}), ...(when ? { when: when[1] } : {}) }
}

/**
 * An NPC's Multiattack, read from its stat block, or that of the Beast's shape a hero holds (./shape). Any other hero,
 * an NPC with a rules sheet, and a block with none or one unread have none.
 */
export function multiattackOf(character: Roller): Multiattack | undefined {
  const monster = shapeOf(character) ?? (character.type === "npc" && !character.sheet && character.statBlock ? monsterById.get(character.statBlock) : undefined)
  const read = monster ? readMultiattack(monster) : undefined
  return read && "options" in read ? read : undefined
}

/**
 * The attacks a Multiattack still holds once its first is made with `weapon`: each the ids of the attacks it may be
 * made with. The way of making it is the first that has the weapon, and the weapon takes the first attack that allows
 * it. The rest follow in the order the block gives. An attack that may replace one (a Dragon Turtle's Tail) takes the
 * place of the last. A weapon the Multiattack does not hold makes the one attack.
 */
export function multiattackAfter(character: Roller, weapon: string): string[][] {
  const read = multiattackOf(character)
  if (!read) return []
  const option = read.options.find((way) => way.attacks.some((ids) => ids.includes(weapon)))
  if (option) {
    const at = option.attacks.findIndex((ids) => ids.includes(weapon))
    return option.attacks.filter((_, index) => index !== at)
  }
  const swapped = read.replace?.count === 1 && !read.replace.of && read.replace.with.some((entry) => entry.attack && entry.id === weapon)
  return swapped ? read.options[0].attacks.slice(0, -1) : []
}
