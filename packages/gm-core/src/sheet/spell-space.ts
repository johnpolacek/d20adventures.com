import type { Spell } from "@d20/srd/schema/spells"
import { BASE_REACH, between, type Cover, caughtIn, coverBetween, distance, type Floor, type Placed, placedOf, type Standing, spaceOf, within } from "./space"

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
export function castInSpace(args: { spell: Spell; caster: Here; everyone: readonly Here[]; named: readonly string[]; floor: Floor }): CastInSpace {
  const { spell, caster, floor } = args
  const from = placedOf(caster)
  if (!from) return { targets: [...args.named], cover: {}, measured: false }
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
    // The caster's own area: around them, or from them toward the one named. With no one named it points at the nearest of the other side.
    if (range.kind === "self") {
      const aim = named.find((other) => other.id !== caster.id) ?? [...others].filter((other) => other.type !== caster.type).sort((a, b) => between(from.at, a.at) - between(from.at, b.at))[0]
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
    // An area at a range, centred on the one named.
    const aim = named[0]
    if (!aim) return none("No One In The Way", `${who} has no one to aim ${spell.name} at.`)
    const apart = distance(from, aim)
    if (range.distance !== undefined && !within(from, aim, range.distance))
      return none("Out Of Range", `${who} is ${Math.round(apart)} feet from ${aim.name}, out of ${spell.name}'s range of ${range.distance} feet. The spell is not cast.`)
    const centre: Placed = { at: aim.at, size: "Tiny" }
    if (aim.id !== caster.id && coverBetween(floor.solids, from, centre) === "total")
      return none("Total Cover", `${who} has no clear line to ${aim.name}: something solid stands between them. The spell is not cast.`)
    const inside = placed.filter((other) =>
      area.shape === "cube" ? Math.abs(other.at.x - aim.at.x) <= area.size / 2 + 1e-9 && Math.abs(other.at.y - aim.at.y) <= area.size / 2 + 1e-9 : between(aim.at, other.at) <= area.size + 1e-9
    )
    const chosen = area.selective ? inside.filter((other) => args.named.includes(other.id)) : inside
    return { targets: reached(centre, chosen).map((target) => target.id), cover, measured: true }
  }

  // A spell on those named: each within its range, or the caster's touch, and not behind total cover. A melee spell
  // attack with a range of Self (Vampiric Touch, "one creature within reach") reaches as a touch does.
  const touch = range.kind === "touch" || (range.kind === "self" && spell.attack === "melee")
  if (!touch && range.kind !== "feet") return { targets: [...args.named], cover: {}, measured: false }
  const limit = touch ? BASE_REACH : (range.distance ?? 0)
  const near = named.filter((target) => target.id === caster.id || within(from, target, limit))
  if (named.length && !near.length) {
    const [first] = named
    const what = touch ? "Reach" : "Range"
    return none(
      `Out Of ${what}`,
      `${who} is ${Math.round(distance(from, first))} feet from ${first.name}, out of ${spell.name}'s ${touch ? "touch" : `range of ${limit} feet`}. The spell is not cast.`
    )
  }
  const clear = reached(from, near)
  if (near.length && !clear.length) return none("Total Cover", `${who} has no clear line to ${near[0].name}: something solid stands between them. The spell is not cast.`)
  return { targets: clear.map((target) => target.id), cover, measured: false }
}
