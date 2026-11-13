import { classFeatureById } from "@d20/srd/class-features"
import { monsterById, monsters } from "@d20/srd/monsters"
import type { Spell } from "@d20/srd/schema/spells"
import type { Shape } from "../../types/character"
import { isDead, isDown, isIncapacitated } from "../../utils/turn-actors"
import type { Roller } from "../check"
import type { BonusActionRule, Featured } from "../class-rules"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed, withUsedThisTurn } from "../feature-rules"
import { shapeOf } from "../shape"
import { slotsLeft, withCastSpent } from "../spells"
import type { TurnEffect } from "../turn-effect"

/**
 * Wild Shape (Druid, level 2) in play, by the SRD 5.2.1 (p. 42), the first part of Wild Resurgence (level 5), and Beast
 * Spells (level 18).
 *
 * Known forms: the four Beast forms of the Beast Shapes table (six from level 4, eight from 8) are picks on the sheet,
 * under the feature's id in `featurePicks`, from the Beast stat blocks of the Challenge Rating the table allows (1/4,
 * 1/2 from 4, 1 from 8) and with no Fly Speed before level 8 (../derive `pickOptions`). The read offers each known form
 * as its own Bonus Action: "wild-shape-wolf". A form's Fly Speed is a move over the flat floor at the better of it and
 * the walking Speed (../space `speedOf`), and a Swim Speed finds no water there. Replacing a known form as a Long Rest
 * ends is not built: neither host's rest asks the player anything, and the level-up screen picks forms only as levels
 * are gained.
 * Taking a form: a Bonus Action that spends a use, with uses by the class table's Wild Shape column and one back on a
 * Short Rest (../rest). The form is kept on the character (`shape`), with the hours it lasts: half the Druid level,
 * rounded down. The hero gains Temporary Hit Points equal to the Druid level, which take the place of fewer held, and
 * then has the stat block's attacks, Armor Class, Speed, size, Strength, Dexterity and Constitution (../shape). They
 * keep their own hit points and everything else, and cannot cast spells. Concentration is kept.
 * Beast Spells (level 18): in a form the Druid casts as in their own shape, but for a spell whose Material component has
 * a cost or is consumed, which is still barred (`formBarsCasting`).
 * How it ends: by using Wild Shape again, which takes the new form; as a Bonus Action by choice; with the Incapacitated
 * condition or at 0 hit points or death, as the round turns (the shape stops counting at once, ../shape `shapeOf`);
 * and when its hours run out, which only a rest counts (../rest), since the engine keeps no clock between encounters.
 * Wild Resurgence: once on each of the Druid's turns, with no use of Wild Shape left, the lowest spell slot left buys
 * one. The engine spends it as the use is spent, by Wild Shape, Land's Aid or anything else that spends one.
 * Gear: the engine holds no hands and no worn items, so the form's attacks and Armor Class replace the hero's weapons
 * and armor, and the rest of the text on objects is the game master's.
 */

export const WILD_SHAPE = "druid-wild-shape"
export const WILD_RESURGENCE = "druid-wild-resurgence"
const BEAST_SPELLS = "druid-beast-spells"
// The once-a-turn mark of Wild Resurgence's slot spent for a use.
const RESURGENCE_MARK = "wild-resurgence"

/** The prefix of the read's id for taking a form: "wild-shape-wolf". */
const FORM_PREFIX = "wild-shape-"
/** The read's id for leaving a form early. */
export const LEAVE_FORM = "leave-wild-shape"

type Druid = Pick<Featured, "sheet" | "featureUses" | "spellSlots"> & { id?: string; turnEffects?: readonly TurnEffect[] }
type Shifter = Featured & { tempHitPoints?: number; shape?: Shape; turnEffects?: readonly TurnEffect[] }

/** The forms a Druid knows, by stat block id, from the sheet's picks. */
export const knownForms = (character: Roller): string[] => (hasFeature(character, WILD_SHAPE) ? (character.sheet?.featurePicks?.[WILD_SHAPE] ?? []).map((pick) => pick.option) : [])

/**
 * How a Druid may spend a use of Wild Shape now: a use left, or with Wild Resurgence and none left a spell slot, the
 * lowest left, once on each of their turns. None when neither.
 */
export function wildShapeUse(character: Druid): { slot?: number } | undefined {
  if (!hasFeature(character, WILD_SHAPE)) return undefined
  if (usesLeft(character, WILD_SHAPE) > 0) return {}
  if (!hasFeature(character, WILD_RESURGENCE) || usedThisTurn(character, RESURGENCE_MARK, character.id)) return undefined
  const index = slotsLeft({ type: "pc", ...character }).findIndex((left) => left > 0)
  return index < 0 ? undefined : { slot: index + 1 }
}

/** A Druid with a use of Wild Shape spent, or by Wild Resurgence a spell slot spent to give one, marked for the turn. */
export function withWildShapeSpent<T extends Druid>(character: T): T {
  const use = wildShapeUse(character)
  if (!use) return character
  if (!use.slot) return withFeatureUsed(character, WILD_SHAPE)
  return withUsedThisTurn(withCastSpent(character as T & { type?: string }, { kind: "slot", level: use.slot }), RESURGENCE_MARK, character.id)
}

/** How many hours a form lasts at a Druid level: half the level, rounded down, which is at least 1 from level 2. */
export const formHours = (level: number): number => Math.max(1, Math.floor(level / 2))

/** A character with no shape held. */
export function withoutShape<T extends { shape?: Shape }>(character: T): T {
  const { shape: _, ...rest } = character
  return rest as T
}

// A Druid taking a form: a use spent, the shape kept with its hours, and the Druid level in Temporary Hit Points
// where they hold fewer.
function shifted<T extends Shifter>(actor: T, form: string): T {
  const level = actor.sheet?.level ?? 1
  const spent = withWildShapeSpent(actor)
  return { ...spent, shape: { form, hours: formHours(level) }, tempHitPoints: Math.max(actor.tempHitPoints ?? 0, level) }
}

// Every Beast stat block a form may ever be taken from, by the Beast Shapes table's highest Challenge Rating. Each is
// offered only to a Druid who knows it. Read from the data alone, so it is safe as the file loads.
const highestCr = Math.max(0, ...(classFeatureById.get(WILD_SHAPE)?.forms ?? []).map((row) => row.maxCr))
const beasts = monsters.filter((monster) => monster.type === "beast" && monster.cr <= highestCr)

// What casting is left to a Druid in a form, in words.
const formCasting = (character: Roller): string =>
  hasFeature(character, BEAST_SPELLS) ? "can still cast spells, but not one whose Material component has a cost or is consumed" : "cannot cast spells"

const NOTE = (character: Roller) =>
  `${FORM_PREFIX}<form> is Wild Shape: the character shifts into that Beast's form beside the action, when the player's words call for it. In a form they fight with its attacks and ${formCasting(character)}. ${LEAVE_FORM} returns them to their own shape.`

/** Wild Shape's Bonus Actions: one for each known form, and one to leave a form. */
export const wildShapeActions: BonusActionRule[] = [
  ...beasts.map(
    (beast): BonusActionRule => ({
      id: `${FORM_PREFIX}${beast.id}`,
      feature: WILD_SHAPE,
      name: `Wild Shape: ${beast.name}`,
      spends: true,
      note: NOTE,
      // A known form other than the one held now.
      offer: (character) => knownForms(character).includes(beast.id) && character.shape?.form !== beast.id,
      buys: (character) => wildShapeUse(character as Druid)?.slot,
      // An attack read beside it is made in the form.
      becomes: (character) => ({ ...character, shape: { form: beast.id, hours: formHours(character.sheet?.level ?? 1) } }),
      use: ({ characters, actor, action }) => {
        const was = actor as Shifter
        const paid = wildShapeUse(was)
        if (!paid || !knownForms(was).includes(beast.id)) return { characters }
        const now = shifted(was, beast.id)
        const level = was.sheet?.level ?? 1
        const hours = formHours(level)
        const from = was.shape ? monsterById.get(was.shape.form)?.name : undefined
        return {
          characters: characters.map((character) => (character.id === was.id ? now : character)),
          use: {
            feature: action.id,
            name: action.name,
            fact: `${was.name} ${from ? `leaves the shape of the ${from} and ` : ""}shifts into the shape of a ${beast.name}${paid.slot ? `, spending a level ${paid.slot} spell slot for the use by Wild Resurgence` : ""}. They gain ${level} Temporary Hit Points, and for up to ${hours} ${hours === 1 ? "hour" : "hours"} they have its attacks, Armor Class, Speed, Strength, Dexterity and Constitution. They keep their own hit points, mind and voice, and ${formCasting(was)}.`,
          },
        }
      },
    })
  ),
  {
    id: LEAVE_FORM,
    feature: WILD_SHAPE,
    name: "Wild Shape: Leave the Form",
    note: NOTE,
    // A shape a spell gave (Polymorph) is the spell's to end, not Wild Shape's.
    offer: (character) => !!character.shape && !character.shape.spell,
    becomes: withoutShape,
    use: ({ characters, actor, action }) => {
      const was = actor as Shifter
      const form = was.shape ? monsterById.get(was.shape.form)?.name : undefined
      if (!form) return { characters }
      return {
        characters: characters.map((character) => (character.id === was.id ? withoutShape(was) : character)),
        use: { feature: action.id, name: action.name, fact: `${was.name} leaves the shape of the ${form} and returns to their own.` },
      }
    },
  },
]

/** Whether a hero holds a form of Wild Shape now, and not a shape a spell gave (Polymorph), whose rules are the spell's. */
export const inWildShape = (character: Roller & { shape?: Shape }): boolean => !!shapeOf(character) && !character.shape?.spell

/**
 * Why a Druid in a form cannot cast a spell. With Beast Spells, only one whose Material component has a cost or is
 * consumed is barred, and with no spell named none is.
 */
export function formBarsCasting(character: Roller, spell?: Spell): string | undefined {
  if (!hasFeature(character, WILD_SHAPE) || !inWildShape(character)) return undefined
  const name = character.name ?? "The Druid"
  if (!hasFeature(character, BEAST_SPELLS)) return `${name} cannot cast spells in Wild Shape.`
  const material = spell?.components.material
  if (!material || (!material.costs?.length && material.consumed === "none")) return undefined
  return `${name} cannot cast ${spell.name} in Wild Shape: its Material component ${material.consumed === "none" ? "has a cost" : "is consumed"}.`
}

/**
 * A form that has ended as the round turns: its bearer has the Incapacitated condition, is at 0 hit points, or is
 * dead. The shape is dropped, with its words. One still in their form is left as they are.
 */
export function formAtRoundStart<T extends Roller & { id: string; shape?: Shape; hitPoints?: number; healthPercent?: number; dead?: true }>(
  character: T
): { character: T; told?: { name: string; text: string } } | undefined {
  if (!character.shape || character.shape.spell) return undefined
  if (!isIncapacitated(character) && !isDown(character) && !isDead(character)) return undefined
  const form = monsterById.get(character.shape.form)?.name ?? character.shape.form
  return { character: withoutShape(character), told: { name: "Wild Shape", text: `${character.name ?? "The Druid"}'s Wild Shape ends: the ${form}'s shape falls away, back to their own.` } }
}
