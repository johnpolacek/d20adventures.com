import type { ConditionId } from "@d20/srd"
import { isDown } from "../../utils/turn-actors"
import type { Afflicted } from "../conditions"
import { floorAreas, inFloorArea, touchedThisTurn } from "../floor-areas"
import { damageOnSave } from "../save-rules"
import { areEnemies } from "../sides"
import { between, sizeOf } from "../space"
import { endConcentration } from "../spell-effects"
import type { AreaTouch, SpellRules } from "../spell-rules"

/**
 * The areas that stay on the floor where their caster put them (../floor-areas, ../spell-rules `stays`). Each is held
 * on its caster with the slot it was cast at, and touches a creature at the moments its text names: as it enters the
 * area on a move (../spell-rounds `areasWalked`), and as a round turns, which stands for every turn's end and the next
 * turn's start at once (./floor-rounds).
 */

// Dice with those a higher slot adds: "2d10" and "1d10" two levels up make "4d10".
const raised = (dice: string, perSlot: string | undefined, above: number): string => {
  const base = /^(\d+)d(\d+)$/.exec(dice)
  const more = /^(\d+)d(\d+)$/.exec(perSlot ?? "")
  return base && more && above > 0 && base[2] === more[2] ? `${Number(base[1]) + Number(more[1]) * above}d${base[2]}` : dice
}

/**
 * The save an area's data times for later turns (`timing`), made by one it touches: the damage linked to it, all on a
 * failure and half on a success where it says so, through Evasion, and its conditions on a failure, for a turn or as
 * the spell lasts. `save` is which of the data's saves.
 */
export function laterSave(touch: AreaTouch, options: { save?: number; span?: "turn" | "lasting" } = {}): boolean | undefined {
  const { round, area, creature } = touch
  const { spell } = area
  const index = options.save ?? 0
  const save = spell.saves?.[index]
  const caster = round.find(area.by)
  const target = round.find(creature.id)
  if (!save || !caster || !target || target.dead) return undefined
  const later = <E extends { trigger?: string; save?: number; timing?: string }>(entries: readonly E[] | undefined) =>
    (entries ?? []).filter((entry) => entry.trigger === "failed-save" && entry.save === index && entry.timing)
  const conditions = later(spell.conditions).map((link) => link.condition as ConditionId)
  const thrown = round.save(target, save.ability, caster, spell, conditions)
  const verdict = round.verdict(target, thrown, spell, caster)
  const [part] = later(spell.damage)
  if (part?.dice) {
    const half = (part.onSuccess ?? save.onSuccess) === "half"
    const lost = round.hurt(
      target.id,
      raised(part.dice, part.perSlot, area.slot - spell.level),
      part.types[0],
      (taken) => damageOnSave(target, { ability: save.ability, success: thrown.success, half }, taken).amount
    )
    round.tell(target.id, spell.name, `${verdict} and takes ${lost} ${part.types[0]} damage.${round.standing(target.id)}`)
  } else round.tell(target.id, spell.name, `${verdict}.`)
  if (!thrown.success) for (const condition of conditions) round.give(round.find(target.id) ?? target, condition, spell, caster, options.span ?? "lasting")
  return thrown.success
}

/**
 * Web: a 20-foot Cube of webs, Difficult Terrain. "The first time a creature enters the webs on a turn or starts its
 * turn there, it must succeed on a Dexterity saving throw or have the Restrained condition while in the webs or until
 * it breaks free." One already Restrained by them makes no save.
 */
export const web: SpellRules = {
  spells: ["web"],
  held: { byCaster: true },
  stays: {
    rough: 2,
    when: ["enter", "start"],
    touches: (touch) => {
      const target = touch.round.find(touch.creature.id)
      if (!target || isDown(target) || target.conditions?.some((entry) => entry.id === "restrained" && entry.spell === "web")) return
      laterSave(touch)
    },
  },
}

/**
 * Stinking Cloud: a 20-foot-radius Sphere, Heavily Obscured. "Each creature that starts its turn in the Sphere must
 * succeed on a Constitution saving throw or have the Poisoned condition until the end of the current turn. While
 * Poisoned in this way, the creature can't take an action or a Bonus Action."
 */
export const stinkingCloud: SpellRules = {
  spells: ["stinking-cloud"],
  held: { byCaster: true },
  stays: {
    obscures: true,
    when: ["start"],
    touches: (touch) => {
      const target = touch.round.find(touch.creature.id)
      if (!target || isDown(target)) return
      if (laterSave(touch, { span: "turn" }) === false) touch.round.tell(target.id, touch.area.spell.name, `${target.name} can take no action or Bonus Action this turn.`)
    },
  },
}

/**
 * Sleet Storm: a 20-foot-radius Cylinder, Heavily Obscured, its ground Difficult Terrain. "When a creature enters the
 * Cylinder for the first time on a turn or starts its turn there, it must succeed on a Dexterity saving throw or have
 * the Prone condition and lose Concentration."
 */
export const sleetStorm: SpellRules = {
  spells: ["sleet-storm"],
  held: { byCaster: true },
  stays: {
    obscures: true,
    rough: 2,
    when: ["enter", "start"],
    touches: (touch) => {
      const { round, creature } = touch
      const target = round.find(creature.id)
      if (!target || isDown(target) || laterSave(touch, { span: "turn" }) !== false) return
      if (!round.find(creature.id)?.concentration) return
      const ended = endConcentration(round.everyone(), creature.id)
      round.replace(ended.characters)
      if (ended.ended) round.tell(creature.id, touch.area.spell.name, `${target.name} loses Concentration, and ${ended.ended} ends.`)
    },
  },
}

/**
 * Moonbeam: a 5-foot-radius Cylinder. "A creature also makes this save when the spell's area moves into its space and
 * when it enters the spell's area or ends its turn there. A creature makes this save only once per turn." Its caster
 * moves it up to 60 feet with a Magic action on a later turn, onto the one named, who saves as it comes.
 */
export const moonbeam: SpellRules = {
  spells: ["moonbeam"],
  held: { byCaster: true },
  again: { takes: "action", reach: 60 },
  savedAtCast: () => true,
  stays: { when: ["enter", "end"], oncePerTurn: true, touches: (touch) => void laterSave(touch) },
}

/**
 * Flaming Sphere: "Any creature that ends its turn within 5 feet of the sphere makes a Dexterity saving throw, taking
 * 2d6 Fire damage on a failed save or half as much damage on a successful one." The sphere is 5 feet across, so within
 * 5 feet of it is within 7½ feet of its centre. It is put beside the one named, and rams the one named as it is used
 * again (./used-again).
 */
export const flamingSphereArea: SpellRules = {
  spells: ["flaming-sphere"],
  stays: { beside: true, area: () => ({ shape: "sphere", size: 7.5 }), when: ["end"], touches: (touch) => void laterSave(touch) },
}

/**
 * Cloudkill: a 20-foot-radius Sphere, Heavily Obscured. "A creature must also make this save when the Sphere moves into
 * its space and when it enters the Sphere or ends its turn there. A creature makes this save only once per turn. The
 * Sphere moves 10 feet away from you at the start of each of your turns."
 */
export const cloudkill: SpellRules = {
  spells: ["cloudkill"],
  held: { byCaster: true },
  stays: { obscures: true, when: ["enter", "end", "moved"], oncePerTurn: true, drifts: 10, touches: (touch) => void laterSave(touch) },
}

/**
 * Incendiary Cloud: a 20-foot-radius Sphere, Heavily Obscured, its save as Cloudkill's. "The cloud moves 10 feet away
 * from you in a direction you choose at the start of each of your turns": the engine moves it straight away.
 */
export const incendiaryCloud: SpellRules = {
  spells: ["incendiary-cloud"],
  held: { byCaster: true },
  stays: { obscures: true, when: ["enter", "end", "moved"], oncePerTurn: true, drifts: 10, touches: (touch) => void laterSave(touch) },
}

/**
 * Insect Plague: a 20-foot-radius Sphere, Difficult Terrain. "A creature also makes this save when it enters the
 * spell's area for the first time on a turn or ends its turn there. A creature makes this save only once per turn."
 */
export const insectPlague: SpellRules = {
  spells: ["insect-plague"],
  held: { byCaster: true },
  stays: { rough: 2, when: ["enter", "end"], oncePerTurn: true, touches: (touch) => void laterSave(touch) },
}

/** Fog Cloud: a Sphere of fog, Heavily Obscured, of 20 feet radius and 20 feet more for each slot level above 1. */
export const fogCloud: SpellRules = {
  spells: ["fog-cloud"],
  held: { byCaster: true },
  stays: { obscures: true, area: (slot) => ({ shape: "sphere", size: 20 + 20 * (slot - 1) }) },
}

/** Darkness: magical Darkness fills a 15-foot-radius Sphere, which Darkvision can't see through: Heavily Obscured. */
export const darkness: SpellRules = {
  spells: ["darkness"],
  held: { byCaster: true },
  stays: { obscures: true, area: () => ({ shape: "sphere", size: 15 }) },
}

/**
 * Grease: a 10-foot square of ground, read as a 10-foot Cube, Difficult Terrain. "A creature that enters the area or
 * ends its turn there must also succeed on that save or fall Prone", each time it enters.
 */
export const grease: SpellRules = {
  spells: ["grease"],
  held: { byCaster: true },
  stays: {
    area: () => ({ shape: "cube", size: 10 }),
    rough: 2,
    when: ["enter", "end"],
    eachEntry: true,
    touches: (touch) => {
      const target = touch.round.find(touch.creature.id)
      if (target && !isDown(target)) laterSave(touch, { span: "turn" })
    },
  },
}

/** Entangle: a 20-foot square of ground, read as a 20-foot Cube, Difficult Terrain while the spell lasts. */
export const entangle: SpellRules = {
  spells: ["entangle"],
  held: { byCaster: true },
  stays: { area: () => ({ shape: "cube", size: 20 }), rough: 2 },
}

/**
 * Black Tentacles: a 20-foot square, read as a 20-foot Cube, Difficult Terrain. "A creature also makes that save if it
 * enters the area or ends it turn there. A creature makes that save only once per turn": 3d6 Bludgeoning and Restrained
 * until the spell ends on a failure.
 */
export const blackTentacles: SpellRules = {
  spells: ["black-tentacles"],
  held: { byCaster: true },
  stays: { area: () => ({ shape: "cube", size: 20 }), rough: 2, when: ["enter", "end"], oncePerTurn: true, touches: (touch) => void laterSave(touch) },
}

/**
 * Spike Growth: a 20-foot-radius Sphere, Difficult Terrain. "When a creature moves into or within the area, it takes
 * 2d4 Piercing damage for every 5 feet it travels." Each stretch of a walk counts its own whole 5 feet.
 */
export const spikeGrowth: SpellRules = {
  spells: ["spike-growth"],
  held: { byCaster: true },
  stays: {
    rough: 2,
    when: ["move"],
    touches: ({ round, area, creature, feet }) => {
      const times = Math.floor((feet ?? 0) / 5 + 1e-6)
      const target = round.find(creature.id)
      if (!times || !target || target.dead) return
      const lost = round.hurt(target.id, `${2 * times}d4`, "piercing")
      round.tell(target.id, area.spell.name, `${target.name} walks ${times * 5} feet through the spikes and takes ${lost} piercing damage.${round.standing(target.id)}`)
    },
  },
}

/**
 * Guardian of Faith: a Large guardian put beside the one named. "Any enemy that moves to a space within 10 feet of the
 * guardian for the first time on a turn or starts its turn there makes a Dexterity saving throw, taking 20 Radiant
 * damage on a failed save or half as much damage on a successful one. The guardian vanishes when it has dealt a total
 * of 60 damage." Within 10 feet of its Large space is within 15 feet of its centre. The damage it may still deal is held
 * as the effect's `amount`.
 */
export const guardianOfFaith: SpellRules = {
  spells: ["guardian-of-faith"],
  held: { byCaster: true, amount: () => 60 },
  stays: {
    beside: true,
    area: () => ({ shape: "sphere", size: 15 }),
    when: ["enter", "start"],
    touches: ({ round, area, creature }) => {
      const caster = round.find(area.by)
      const target = round.find(creature.id)
      const save = area.spell.saves?.[0]
      if (!caster || !target || target.dead || !save || !areEnemies(target, caster)) return
      const thrown = round.save(target, save.ability, caster, area.spell)
      const lost = round.hurt(target.id, "0d1 + 20", "radiant", (taken) =>
        Math.min(area.effect.amount ?? 60, damageOnSave(target, { ability: save.ability, success: thrown.success, half: true }, taken).amount)
      )
      round.tell(target.id, area.spell.name, `${round.verdict(target, thrown, area.spell, caster)} and takes ${lost} radiant damage.${round.standing(target.id)}`)
      const holder = round.find(area.by)
      if (!holder) return
      const left = (area.effect.amount ?? 60) - lost
      const effects = (holder.spellEffects ?? []).flatMap((effect) => (effect.spell !== area.spell.id || effect.by !== area.by ? [effect] : left > 0 ? [{ ...effect, amount: left }] : []))
      const { spellEffects: _, ...rest } = holder
      round.put(effects.length ? { ...rest, spellEffects: effects } : rest)
      if (left <= 0) round.tell(area.by, area.spell.name, `${caster.name}'s Guardian of Faith has dealt 60 damage, and vanishes.`)
    },
  },
}

/**
 * Call Lightning: the storm cloud forms over its caster, and its bolt strikes a point under it, within 60 feet of where
 * it formed. "Each creature within 5 feet of that point makes a Dexterity saving throw": a 5-foot Sphere about the
 * point, which its data does not type, as the cloud's Cylinder is the one area it states. The caster calls the bolt down
 * again with a Magic action, at a point within 60 feet of the cloud.
 */
export const callLightning: SpellRules = {
  spells: ["call-lightning"],
  held: { byCaster: true },
  range: () => 60,
  again: { takes: "action", reach: 60 },
  savedAtCast: () => true,
  stays: { overhead: true, area: () => ({ shape: "sphere", size: 5 }) },
}

/** The areas that stay on the floor, each spell's own. */
export const lastingAreas: readonly SpellRules[] = [
  web,
  stinkingCloud,
  sleetStorm,
  moonbeam,
  flamingSphereArea,
  cloudkill,
  incendiaryCloud,
  insectPlague,
  fogCloud,
  darkness,
  grease,
  entangle,
  blackTentacles,
  spikeGrowth,
  guardianOfFaith,
  callLightning,
]

// Whether one standing somewhere is touched by an area there: in it, or for an area that reaches past its own space
// (Wall of Fire's burning side), there.
const touchedAt = (area: Parameters<typeof inFloorArea>[0], creature: Afflicted & Parameters<typeof sizeOf>[0]) =>
  !!creature.position && (inFloorArea(area, creature.position, sizeOf(creature)) || !!area.rules.near?.(area, creature.position, sizeOf(creature)))

/**
 * As a round turns, the end of every creature's turn: each area it ends its turn in touches it, unless the area's save
 * is "only once per turn" and it touched them on this turn already.
 */
export const areaTurnEnds: SpellRules = {
  spells: [],
  round: (round, was) => {
    for (const area of floorAreas(round.everyone())) {
      const creature = round.find(was.id)
      if (!creature || creature.dead || !area.rules.when?.includes("end") || !area.rules.touches || !touchedAt(area, creature)) continue
      if (area.rules.oncePerTurn && touchedThisTurn(creature, area)) continue
      area.rules.touches({ round, area, creature, moment: "end" })
    }
  },
}

/**
 * As a round turns, the start of every caster's turn: an area that drifts moves its feet straight away from its caster
 * (Cloudkill's 10), and touches each creature it moves into.
 */
export const areaDrifts: SpellRules = {
  spells: [],
  round: (round, was) => {
    for (const area of floorAreas([round.find(was.id) ?? was])) {
      const caster = round.find(area.by)
      const feet = area.rules.drifts
      if (!feet || !caster?.position) continue
      const gap = between(caster.position, area.at)
      const at = gap ? { x: area.at.x + ((area.at.x - caster.position.x) * feet) / gap, y: area.at.y + ((area.at.y - caster.position.y) * feet) / gap } : { x: area.at.x + feet, y: area.at.y }
      const moved = { ...area, at }
      round.put({ ...caster, spellEffects: (caster.spellEffects ?? []).map((effect) => (effect === area.effect ? { ...effect, at } : effect)) })
      round.tell(caster.id, area.spell.name, `${caster.name}'s ${area.spell.name} drifts ${feet} feet away from them.`)
      if (!area.rules.when?.includes("moved") || !area.rules.touches) continue
      for (const other of round.everyone()) {
        if (other.dead || !other.position || touchedAt(area, other) || !touchedAt(moved, other)) continue
        area.rules.touches({ round, area: moved, creature: other, moment: "moved" })
      }
    }
  },
}

/** As a round turns, the start of every creature's next turn: each area it starts its turn in touches it. */
export const areaTurnStarts: SpellRules = {
  spells: [],
  round: (round, was) => {
    for (const area of floorAreas(round.everyone())) {
      const creature = round.find(was.id)
      if (!creature || creature.dead || !area.rules.when?.includes("start") || !area.rules.touches || !touchedAt(area, creature)) continue
      area.rules.touches({ round, area, creature, moment: "start" })
    }
  },
}
