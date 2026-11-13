import type { Spell } from "@d20/srd/schema/spells"
import { classSpellRange } from "./class-rules"
import { areEnemies } from "./sides"
import { BASE_REACH, between, type Cover, caughtIn, coverBetween, distance, type Floor, type Placed, placedOf, type Standing, spaceOf, within } from "./space"
import { spellRule } from "./spell-rules"

type Here = Standing & { id: string }

/** A spell as space lets it be cast: who it falls on, the cover each has, or why it cannot be cast at all. */
export type CastInSpace = {
  targets: string[]
  /** The cover each target has from where the spell comes: it adds to Armor Class against a spell attack and to a Dexterity save. */
  cover: Record<string, "half" | "three-quarters">
  /** Whether an area was measured: the spell then takes everyone in it, however many. */
  measured: boolean
  /** Why no one can be cast on, for the story: "Out Of Range". */
  problem?: { name: string; text: string }
}

/**
 * Who a spell falls on, by where everyone stands. A spell with a range in feet reaches no farther, a touch needs the
 * caster within 5 feet, and neither passes total cover. A spell with an area takes everyone in it. A cone, cube or
 * line of the caster's own starts at the edge of their space and points at the first one named. An area at a range
 * is centred on the first one named, and reaches friend and foe alike: one that picks its creatures (Sleep) takes
 * those named among them. What stands in total cover from where the area starts is not caught. `named` are the ids the
 * game master read, the aim first. A caster with no position is not measured, and the named stand.
 *
 * Burning Hands, a 15-foot cone, aimed at a Bandit 10 feet off, catches the Bandit and the ally standing beside him.
 */
/** What falls where a spell would that is no spell: a stat block's breath, by its name and where it reaches (./stat-block-actions). */
export type Aimed = { name: string; range: Spell["range"]; attack?: undefined }

const FEET_IN_A_MILE = 5280

/** How far a range reaches in feet: a range in feet, or in miles at 5,280 feet each. None for a range not measured so (Sight, Unlimited). */
export const rangeFeet = (range: Spell["range"]): number | undefined =>
  range.distance === undefined ? undefined : range.kind === "feet" ? range.distance : range.kind === "miles" ? range.distance * FEET_IN_A_MILE : undefined

// A range in words: "60 feet", "1 mile".
const rangeWords = (range: Spell["range"], feet: number): string =>
  range.kind === "miles" && range.distance !== undefined ? `${range.distance} mile${range.distance === 1 ? "" : "s"}` : `${feet} feet`

export function castInSpace(args: { spell: Spell | Aimed; caster: Here; everyone: readonly Here[]; named: readonly string[]; floor: Floor }): CastInSpace {
  const { spell, caster, floor } = args
  const from = placedOf(caster)
  if (!from) return { targets: [...args.named], cover: {}, measured: false }
  // A spell's own rules on its shape (./spell-rules): Meteor Swarm's four Spheres, Chain Lightning's leaps.
  const rule = "level" in spell ? spellRule(spell.id) : undefined
  const placed = args.everyone.flatMap((other) => {
    const at = placedOf(other)
    return at ? [{ id: other.id, name: other.name ?? "them", type: other.type, ...at }] : []
  })
  const others = placed.filter((other) => other.id !== caster.id)
  const named = args.named.flatMap((id) => placed.find((other) => other.id === id) ?? [])
  const range = spell.range
  const cover: CastInSpace["cover"] = {}
  // Cover from where the spell comes to each it falls on. Total cover keeps them out of it.
  const reached = (origin: Placed, found: readonly (typeof placed)[number][]) =>
    found.filter((target) => {
      if (target.id === caster.id) return true
      const inTheWay = placed.filter((other) => other.id !== target.id && other.id !== caster.id)
      const had: Cover = coverBetween(floor.solids, origin, target, inTheWay)
      if (had === "total") return false
      if (had !== "none") cover[target.id] = had
      return true
    })
  const none = (name: string, text: string): CastInSpace => ({ targets: [], cover: {}, measured: true, problem: { name, text } })
  const who = caster.name ?? "The caster"

  if (range.area) {
    const area = range.area
    // The caster's own area: around them, or from them toward the one named. With no one named it points at the nearest enemy (./sides).
    if (range.kind === "self") {
      const aim = named.find((other) => other.id !== caster.id) ?? [...others].filter((other) => areEnemies(other, caster)).sort((a, b) => between(from.at, a.at) - between(from.at, b.at))[0]
      const directed = area.shape === "cone" || area.shape === "cube" || area.shape === "line"
      if (directed && !aim) return none("No One In The Way", `${who} has no one to aim ${spell.name} at.`)
      const caught = caughtIn(area, from.at, aim?.at ?? from.at, others, spaceOf(from.size))
      // An aura of the caster's own that takes "you and each creature you choose" (Pass without Trace) takes the caster and those named in it.
      if (area.selective && area.shape === "emanation") {
        const chosen = caught.filter((other) => args.named.includes(other.id))
        return { targets: [caster.id, ...reached(from, chosen).map((target) => target.id)], cover, measured: true }
      }
      return { targets: reached(from, caught).map((target) => target.id), cover, measured: true }
    }
    // An area at a range, centred on the one named, or one on each of the first named where the spell makes several
    // (./spell-rules `areas`). A centre out of range or past total cover makes no area. One caught by two is taken once.
    const [aim] = named
    if (!aim) return none("No One In The Way", `${who} has no one to aim ${spell.name} at.`)
    const reach = rangeFeet(range)
    const centres = named.slice(0, rule?.areas ?? 1)
    const inRange = centres.filter((centre) => reach === undefined || within(from, centre, reach))
    if (!inRange.length)
      return none("Out Of Range", `${who} is ${Math.round(distance(from, aim))} feet from ${aim.name}, out of ${spell.name}'s range of ${rangeWords(range, reach ?? 0)}. The spell is not cast.`)
    const clear = inRange.filter((centre) => centre.id === caster.id || coverBetween(floor.solids, from, { at: centre.at, size: "Tiny" }) !== "total")
    if (!clear.length) return none("Total Cover", `${who} has no clear line to ${inRange[0].name}: something solid stands between them. The spell is not cast.`)
    const taken = new Set<string>()
    for (const centre of clear) {
      const inside = placed.filter((other) =>
        area.shape === "cube"
          ? Math.abs(other.at.x - centre.at.x) <= area.size / 2 + 1e-9 && Math.abs(other.at.y - centre.at.y) <= area.size / 2 + 1e-9
          : between(centre.at, other.at) <= area.size + 1e-9
      )
      const chosen = area.selective ? inside.filter((other) => args.named.includes(other.id)) : inside
      for (const target of reached({ at: centre.at, size: "Tiny" }, chosen)) taken.add(target.id)
    }
    return { targets: [...taken], cover, measured: true }
  }

  // A spell on those named: each within its range, or the caster's touch, and not behind total cover. A melee spell
  // attack with a range of Self (Vampiric Touch, "one creature within reach") reaches as a touch does.
  const touch = range.kind === "touch" || (range.kind === "self" && spell.attack === "melee")
  if (!touch && rangeFeet(range) === undefined) return { targets: [...args.named], cover: {}, measured: false }
  // A class feature may lengthen the caster's own spell (Eldritch Spear).
  const limit = touch ? BASE_REACH : (("level" in spell ? classSpellRange(caster, spell) : undefined) ?? rangeFeet(range) ?? 0)
  // Those after the first may need to stand near the first (./spell-rules `nearFirst`: Chain Lightning's 30 feet).
  const leap = rule?.nearFirst
  const near = named.filter((target, index) => (target.id === caster.id || within(from, target, limit)) && (leap === undefined || index === 0 || within(named[0], target, leap)))
  if (named.length && !near.length) {
    const [first] = named
    const what = touch ? "Reach" : "Range"
    return none(
      `Out Of ${what}`,
      `${who} is ${Math.round(distance(from, first))} feet from ${first.name}, out of ${spell.name}'s ${touch ? "touch" : `range of ${rangeWords(range, limit)}`}. The spell is not cast.`
    )
  }
  const clear = reached(from, near)
  if (near.length && !clear.length) return none("Total Cover", `${who} has no clear line to ${near[0].name}: something solid stands between them. The spell is not cast.`)
  return { targets: clear.map((target) => target.id), cover, measured: false }
}
