import { monsterById, monsters } from "@d20/srd/monsters"
import type { Monster } from "@d20/srd/schema/monsters"
import type { Shape } from "../../types/character"
import { ownBlockOf } from "../blocks"
import { sameSide } from "../sides"
import { spellEnded } from "../spell-effects"
import { type CastContext, type SpellRules, spellRule } from "../spell-rules"
import type { Castee } from "../spells"

/**
 * Spells that change a creature's shape (../shape, ../types/character `shape`): the target's game statistics are
 * replaced by the stat block of the form the caster chooses (`choice`), by the path Wild Shape takes. The shape names its
 * spell and caster, and ends with the spell (../masters `freedFrom`), with the Temporary Hit Points it gave. A form of a
 * higher Challenge Rating than the target's, or their level, is not taken. A willing ally chooses to fail the save
 * ("If you don't want to resist the effect, you can choose to fail the save without rolling", SRD 5.2.1 p. 9), so a
 * caster, or one of their side, is shaped with no roll.
 */

type Shaped = Castee & { shape?: Shape; tempHitPoints?: number }

// Every Beast of the SRD by Challenge Rating, the weakest first, as a caster's choice of form: read from the data alone.
const byCr = (list: readonly Monster[]) => [...list].sort((a, b) => a.cr - b.cr || a.id.localeCompare(b.id)).map((monster) => monster.id)
const BEASTS = byCr(monsters.filter((monster) => monster.type === "beast"))

// A target's Challenge Rating, or a hero's level, for "a Challenge Rating equal to or less than the target's (or the
// target's level if it doesn't have a Challenge Rating)".
const crOf = (target: Castee): number => (target.sheet ? target.sheet.level : (ownBlockOf(target)?.cr ?? 0))

const crWords = (cr: number) => (cr === 0.125 ? "1/8" : cr === 0.25 ? "1/4" : cr === 0.5 ? "1/2" : `${cr}`)

/**
 * The target in the form chosen, for `hours`, with the form's Hit Points as Temporary Hit Points where they hold fewer,
 * told in a fact. Not taken, and told, where the form is beyond the target's Challenge Rating.
 */
function reshape(cast: CastContext, target: Castee, hours: number, limit?: number): boolean {
  const form = monsterById.get(cast.choice ?? "")
  if (!form) return false
  const most = limit ?? crOf(target)
  if (form.cr > most) {
    cast.facts.push(
      `A ${form.name}, of Challenge Rating ${crWords(form.cr)}, is beyond ${target.name}'s ${target.sheet ? "level" : "Challenge Rating"} of ${crWords(most)}: ${cast.spell.name} takes no shape.`
    )
    return false
  }
  const now = cast.find(target.id) as Shaped | undefined
  if (!now) return false
  const shape: Shape = { form: form.id, hours, spell: cast.spell.id, by: cast.caster.id }
  cast.put({ ...now, shape, tempHitPoints: Math.max(now.tempHitPoints ?? 0, form.hp.average) } as Castee)
  cast.facts.push(
    `${target.name} shape-shifts into a ${form.name}, with its game statistics, and gains ${form.hp.average} Temporary Hit Points. They keep their own Hit Points beneath the form${spellBars(cast) ? " and cannot cast spells" : ""}.`
  )
  return true
}

const spellBars = (cast: CastContext) => !spellRule(cast.spell.id)?.shape?.casts

// The caster, or one of their side, who chooses to fail the save and is shaped with no roll.
const willing = (cast: CastContext, target: Castee) => sameSide(target, cast.caster)

// A willing one is shaped with no save, and the rest of the cast passes them by.
const willingShape = (cast: CastContext, target: Castee): boolean => {
  if (!willing(cast, target)) return false
  reshape(cast, target, 1)
  return true
}

/**
 * Polymorph: "The target must succeed on a Wisdom saving throw or shape-shift into a Beast form for the duration. That
 * form can be any Beast you choose that has a Challenge Rating equal to or less than the target's ... The target's game
 * statistics are replaced by the stat block of the chosen Beast, but the target retains its alignment, personality,
 * creature type, Hit Points, and Hit Point Dice. The target gains a number of Temporary Hit Points equal to the Hit
 * Points of the Beast form. These Temporary Hit Points vanish if any remain when the spell ends. The spell ends early on
 * the target if it has no Temporary Hit Points left. ... it can't speak or cast spells."
 */
export const polymorph: SpellRules = {
  spells: ["polymorph"],
  choice: { values: BEASTS, field: "spellChoice", words: "the Beast form, no higher in Challenge Rating than the target's or their level" },
  shape: {},
  settles: willingShape,
  failedSave: (cast, target) => {
    reshape(cast, target, 1)
  },
  damaged: ({ bearer }) => {
    const held = (bearer as { shape?: Shape }).shape
    if (held?.spell !== "polymorph" || (bearer.tempHitPoints ?? 0) > 0) return undefined
    return {
      bearer: spellEnded(bearer, (spell) => spell === "polymorph"),
      facts: [`${bearer.name ?? "They"} has no Temporary Hit Points left, and Polymorph ends on them: they return to their own shape.`],
    }
  },
}

/**
 * True Polymorph, Creature into Creature: "An unwilling creature can make a Wisdom saving throw, and if it succeeds,
 * it isn't affected ... the new form can be any kind you choose that has a Challenge Rating equal to or less than the
 * target's Challenge Rating or level. The target's game statistics are replaced by the stat block of the new form, but
 * it retains its Hit Points, Hit Point Dice, alignment, and personality. The target gains a number of Temporary Hit
 * Points equal to the Hit Points of the new form." The transformation lasts until the spell ends or the target dies.
 * The engine offers Beasts as the new form.
 */
export const truePolymorph: SpellRules = {
  spells: ["true-polymorph"],
  choice: { values: BEASTS, field: "spellChoice", words: "the Beast form, no higher in Challenge Rating than the target's or their level" },
  shape: {},
  settles: willingShape,
  failedSave: (cast, target) => {
    reshape(cast, target, 1)
  },
}

// "a Large or smaller Beast of your choice that has a Challenge Rating of 4 or lower".
const ANIMAL_SHAPES = byCr(monsters.filter((monster) => monster.type === "beast" && monster.cr <= 4 && !monster.size.every((size) => size === "Huge" || size === "Gargantuan")))

/**
 * Animal Shapes: "Choose any number of willing creatures ... Each target shape-shifts into a Large or smaller Beast of
 * your choice that has a Challenge Rating of 4 or lower. ... A target's game statistics are replaced by the chosen
 * Beast's statistics, but the target retains its creature type; Hit Points; Hit Point Dice; alignment; ability to
 * communicate; and Intelligence, Wisdom, and Charisma scores. ... it can't cast spells. ... The target gains a number of
 * Temporary Hit Points equal to the Hit Points of the first form". It lasts 24 hours. The engine gives each the one form
 * chosen, and takes only those on the caster's side.
 */
export const animalShapes: SpellRules = {
  spells: ["animal-shapes"],
  choice: { values: ANIMAL_SHAPES, field: "spellChoice", words: "the Beast form each target takes" },
  shape: { keepsMind: true },
  cast: (cast) => {
    for (const id of cast.targets) {
      const target = cast.find(id)
      if (!target) continue
      if (sameSide(target, cast.caster)) reshape(cast, target, 24, 4)
      else cast.facts.push(`${target.name} is not willing, and ${cast.spell.name} does not take them.`)
    }
  },
}

// Every creature that is neither a Construct nor an Undead, for "it can't be a Construct or an Undead".
const SHAPECHANGE = byCr(monsters.filter((monster) => monster.type !== "construct" && monster.type !== "undead"))

/**
 * Shapechange: "You shape-shift into another creature ... The new form must be of a creature that has a Challenge
 * Rating no higher than your level or Challenge Rating ... it can't be a Construct or an Undead. When you cast the spell,
 * you gain a number of Temporary Hit Points equal to the Hit Points of the first form ... Your game statistics are
 * replaced by the stat block of the chosen form, but you retain your creature type; alignment; personality;
 * Intelligence, Wisdom, and Charisma scores; Hit Points; Hit Point Dice; proficiencies; and ability to communicate. If
 * you have the Spellcasting feature, you retain it too."
 */
export const shapechange: SpellRules = {
  spells: ["shapechange"],
  choice: { values: SHAPECHANGE, field: "spellChoice", words: "the creature whose shape the caster takes, no higher in Challenge Rating than their level" },
  shape: { keepsMind: true, casts: true },
  cast: (cast) => {
    reshape(cast, cast.caster, 1)
  },
}

export const forms: SpellRules[] = [polymorph, truePolymorph, animalShapes, shapechange]
