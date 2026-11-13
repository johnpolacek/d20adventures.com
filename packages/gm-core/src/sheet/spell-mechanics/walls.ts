import { floorAreas, wallSide } from "../floor-areas"
import { type Point, sizeOf, spaceOf } from "../space"
import type { AreaTouch, SpellRules } from "../spell-rules"
import type { Castee } from "../spells"
import { laterSave } from "./lasting-areas"

/**
 * Walls that stand on the floor in play (../floor-areas, ../spell-rules `stays.wall`). The engine builds the straight
 * wall: as long as its spell allows, across the line from its caster to the one named, through them for a wall that
 * harms and just before them for one that blocks (../spell-space). A ring, a dome, panels at angles, and a wall's
 * height are the game master's to tell.
 */

// Dice with those a higher slot adds: "5d8" and "1d8" one level up make "6d8".
const raised = (dice: string, perSlot: string | undefined, above: number): string => {
  const base = /^(\d+)d(\d+)$/.exec(dice)
  const more = /^(\d+)d(\d+)$/.exec(perSlot ?? "")
  return base && more && above > 0 && base[2] === more[2] ? `${Number(base[1]) + Number(more[1]) * above}d${base[2]}` : dice
}

// Wall of Fire's burn on one it touches, with no save: the data's damage timed for later turns.
function burns(touch: AreaTouch) {
  const { round, area, creature } = touch
  const target = round.find(creature.id)
  const part = area.spell.damage?.find((entry) => entry.timing && !entry.trigger)
  if (!target || target.dead || !part?.dice) return
  const lost = round.hurt(target.id, raised(part.dice, part.perSlot, area.slot - area.spell.level), part.types[0])
  const how = touch.moment === "enter" ? "enters the wall of fire" : "ends their turn in or beside the wall of fire's burning side"
  round.tell(target.id, area.spell.name, `${target.name} ${how} and takes ${lost} fire damage.${round.standing(target.id)}`)
}

/**
 * Wall of Fire: a straight wall up to 60 feet long and 1 foot thick, opaque. "One side of the wall, selected by you when
 * you cast this spell, deals 5d8 Fire damage to each creature that ends its turn within 10 feet of that side or inside
 * the wall. A creature takes the same damage when it enters the wall for the first time on a turn or ends its turn
 * there." The side that burns faces away from its caster.
 */
export const wallOfFire: SpellRules = {
  spells: ["wall-of-fire"],
  held: { byCaster: true },
  stays: {
    wall: { length: 60, thickness: 1, across: "through" },
    obscures: true,
    when: ["enter", "end"],
    near: (area, at, size) => {
      const side = wallSide(area, at)
      const half = (area.area.width ?? 1) / 2
      return Math.abs(side.along) <= area.area.size / 2 && side.aside > 0 && side.aside <= half + 10 + spaceOf(size) / 2 + 0.5
    },
    touches: burns,
  },
}

/**
 * Wall of Force: a flat surface of ten 10-foot panels, read as a straight wall 100 feet long, as thin as nothing. Nothing
 * can pass through it, so it is solid for a walk and Total Cover. "If the wall cuts through a creature's space when it
 * appears, the creature is pushed to one side of the wall": the side its centre is on, or away from the caster.
 */
export const wallOfForce: SpellRules = {
  spells: ["wall-of-force"],
  held: { byCaster: true },
  stays: { wall: { length: 100, thickness: 1 / 48, across: "before" }, solid: true },
  cast: (cast) => {
    const caster = cast.find(cast.caster.id)
    const area = caster && floorAreas([caster]).find((each) => each.spell.id === cast.spell.id)
    if (!area) return
    for (const id of cast.targets) {
      // Everyone the cast reaches stands on the floor, where it has one.
      const one = cast.find(id) as (Castee & { position?: Point }) | undefined
      if (!one?.position) continue
      const side = wallSide(area, one.position)
      const clear = (area.area.width ?? 0) / 2 + spaceOf(sizeOf(one)) / 2 + 0.5
      if (Math.abs(side.aside) >= clear) continue
      const away = side.aside >= 0 ? 1 : -1
      const length = Math.hypot((area.to?.x ?? area.at.x) - area.at.x, (area.to?.y ?? area.at.y) - area.at.y) || 1
      const ux = ((area.to?.x ?? area.at.x) - area.at.x) / length
      const uy = ((area.to?.y ?? area.at.y) - area.at.y) / length
      const push = away * clear - side.aside
      cast.put({ ...one, position: { x: one.position.x - uy * push, y: one.position.y + ux * push } } as Castee)
      cast.facts.push(`The wall cuts through ${one.name}'s space, and pushes them to one side of it.`)
    }
  },
}

/**
 * Blade Barrier: a straight wall up to 100 feet long and 5 feet thick, its space Difficult Terrain. "Any creature in the
 * wall's space makes a Dexterity saving throw ... A creature also makes that save if it enters the wall's space or ends
 * it turn there. A creature makes that save only once per turn."
 */
export const bladeBarrier: SpellRules = {
  spells: ["blade-barrier"],
  held: { byCaster: true },
  stays: { wall: { length: 100, thickness: 5, across: "through" }, rough: 2, when: ["enter", "end"], oncePerTurn: true, touches: (touch) => void laterSave(touch) },
}

/**
 * Wall of Thorns: a straight wall up to 60 feet long and 5 feet thick, which blocks line of sight. "For every 1 foot a
 * creature moves through the wall, it must spend 4 feet of movement. Furthermore, the first time a creature enters a
 * space in the wall on a turn or ends its turn there, the creature makes a Dexterity saving throw, taking 7d8 Slashing
 * damage ... A creature makes this save only once per turn."
 */
export const wallOfThorns: SpellRules = {
  spells: ["wall-of-thorns"],
  held: { byCaster: true },
  stays: {
    wall: { length: 60, thickness: 5, across: "through" },
    obscures: true,
    rough: 4,
    when: ["enter", "end"],
    oncePerTurn: true,
    touches: (touch) => void laterSave(touch, { save: 1 }),
  },
}

/** The walls, each spell's own. */
export const walls: readonly SpellRules[] = [wallOfFire, wallOfForce, bladeBarrier, wallOfThorns]
