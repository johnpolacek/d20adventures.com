import type { DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import type { Spell } from "@d20/srd/schema/spells"
import { z } from "zod"
import { hasFled, isDead } from "../../utils/turn-actors"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { damageTaken, defensesOf, rollDamage, UNARMED_STRIKE } from "../attack"
import type { Roller } from "../check"
import { type ClassRules, classCastingBar, type Featured, type Rested } from "../class-rules"
import { afterHarm, enduredWords, type Fate, withDamage, withHealing } from "../death"
import { deriveSheet, keptChoiceOf } from "../derive"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed } from "../feature-rules"
import type { Harm } from "../harm"
import { hitPointsOf } from "../hit-points"
import { sameSide } from "../sides"
import { placedOf, within } from "../space"
import { spellRule } from "../spell-rules"
import { rangeFeet } from "../spell-space"
import { type Cast, rollSave, type SaveRoll, slotsLeft, spellcastingOf } from "../spells"
import {
  moveSanctuary,
  NATURES_SANCTUARY,
  NATURES_WARD,
  naturalRecoveryCasts,
  naturalRecoveryRest,
  naturesSanctuary,
  sanctuaryAtRoundStart,
  sanctuaryCover,
  sanctuaryResistances,
  wardType,
} from "./druid-land"
import { formAtRoundStart, formBarsCasting, inWildShape, WILD_RESURGENCE, WILD_SHAPE, wildShapeActions, wildShapeUse, withWildShapeSpent } from "./wild-shape"

/**
 * The Druid's features in play, levels 1 to 20, with the Circle of the Land. The slots and prepared spells are the
 * sheet's: a Druid casts through the same path as any caster (../spells), with Speak with Animals always prepared by
 * Druidic and a Circle of the Land's land spells by the land kept on the sheet (../derive). The later Ability Score
 * Improvements and the Epic Boon are the sheet's too.
 *
 * Primal Order is the sheet's: a Magician's extra cantrip and Wisdom modifier on Arcana and Nature checks, a Warden's
 * Martial weapons and Medium armor (../derive).
 * Wild Shape (level 2), and Wild Resurgence's slot spent for a use: ./wild-shape.
 * Land's Aid (Circle of the Land, level 3): a Magic action that spends a use of Wild Shape. A 10-foot-radius Sphere
 * within 60 feet: each creature of the Druid's choice in it makes a Constitution saving throw against the spell save
 * DC, taking 2d6 Necrotic damage on a failure and half on a success, and one creature of their choice in it regains
 * 2d6 hit points. The read names who is harmed, the first at the Sphere's centre, and who is healed. With no one named
 * to heal, the engine heals the one of the Druid's side in the Sphere who is missing the most hit points.
 * Wild Resurgence (level 5), its second part: once a Long Rest a use of Wild Shape gives a level 1 spell slot. The
 * engine takes it as a round of a fight begins, for a Druid in their own shape with no spell slot left and a use of
 * Wild Shape to spare: a Druid with slots left keeps the use for a form.
 * Wild Companion (level 2) is told only: Find Familiar's familiar is a creature the engine does not yet add to an
 * encounter (S13), so the spell is the game master's to tell, and so is a use spent on it.
 *
 * Elemental Fury (level 7), the option kept on the sheet, and Improved Elemental Fury (level 15), which follows it:
 * - Potent Spellcasting: the Wisdom modifier added to the damage of a Druid cantrip, one of the Druid list's: on a spell
 *   attack's hit (Starry Wisp, Produce Flame's hurl) and where a save's or no roll's damage is rolled. From level 15 a
 *   Druid cantrip with a range of 10 feet or more reaches 300 feet further, read where a spell is measured.
 * - Primal Strike: once on each of the Druid's own turns, a hit with a weapon or a Beast form's attack in Wild Shape
 *   deals 1d8 more, 2d8 from level 15, by the text, since the data types neither die. Of Cold, Fire, Lightning and
 *   Thunder the engine takes the one that harms the target most, Thunder first where they harm alike.
 * Beast Spells (level 18): ./wild-shape `formBarsCasting`.
 * Archdruid (level 20):
 * - Evergreen Wild Shape: as Initiative is rolled with no use of Wild Shape left, one comes back.
 * - Nature Magician: once a Long Rest, uses of Wild Shape become one spell slot, 2 levels a use. The engine takes it by
 *   a plain rule as a round of a fight begins, for a Druid with no spell slot left of any level: every use left, up to
 *   four, a level 8 slot. The slot is kept under "druid-archdruid:slot-<level>" in `featureUses` and counted beside
 *   the table's (../spells `slotsLeft`) until a Long Rest. It comes before Wild Resurgence's level 1 slot.
 * - Longevity is the story's.
 * The Circle of the Land's Natural Recovery, Nature's Ward and Nature's Sanctuary: ./druid-land.
 */

const LANDS_AID = "circle-of-the-land-lands-aid"
const RANGE = 60
const RADIUS = 10

// The dice of Land's Aid at a Druid level. The data types the healing's, 2d6 to level 9: "The damage and healing
// increase by 1d6 when you reach Druid levels 10 (3d6) and 14 (4d6)", so the damage's are the same.
function aidDice(level: number): string {
  const healing = classFeatureById.get(LANDS_AID)?.healing
  return healing?.diceByLevel?.filter((step) => step.level <= level).at(-1)?.dice ?? healing?.dice ?? "2d6"
}

type Aided = Parameters<typeof rollSave>[0]["target"] & Featured & { fled?: true; position?: { x: number; y: number } }

// How one stands after Land's Aid, in words.
function standing(character: Aided, fate: Fate | undefined): string {
  if (fate === "dies") return `${character.name} dies.`
  if (fate === "killed") return `${character.name} is killed outright.`
  if (fate === "stable") return `${character.name} is Unconscious and Stable, out of the fight.`
  if (fate === "endures") return enduredWords(character.name, character)
  if (fate === "dying") return `${character.name} is at 0 hit points, Unconscious and dying.`
  const hitPoints = hitPointsOf(character)
  return hitPoints ? `${character.name} has ${hitPoints.current} of ${hitPoints.maximum} hit points${hitPoints.current * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.` : ""
}

/**
 * Use Land's Aid. `targets` are those harmed, the first at the Sphere's centre, and with `heal` the first is instead
 * the one who regains hit points. Everyone comes back as it left them, with each save as it fell and what happened in
 * words, in the shape a spell's cast takes. A use of Wild Shape is spent. `problem` says why nothing happened.
 *
 * Briar, a level 3 Druid with Wisdom 16 (+3), DC 13, aims it at a Goblin: 7 on the 2d6, it rolls 9 on its save with
 * +1, 10 against 13, and takes 7 Necrotic damage, while Briar's hurt ally regains the 2d6's roll.
 */
export function landsAid<T extends Aided>(args: {
  characters: readonly T[]
  druidId: string
  targets: readonly string[]
  heal?: boolean
  d20: () => number
  roll: (sides: number) => number
  rules?: { playerDeath?: boolean }
}): Cast<T> & { problem?: string } {
  let characters = [...args.characters]
  const druid = characters.find((character) => character.id === args.druidId)
  const none = (problem: string): Cast<T> & { problem: string } => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [], problem })
  if (!druid?.sheet || !hasFeature(druid, LANDS_AID)) return none(`${druid?.name ?? "This character"} cannot use Land's Aid.`)
  const paid = wildShapeUse(druid)
  if (!paid) return none(`${druid.name} has no use of Wild Shape left for Land's Aid.`)
  const dc = spellcastingOf(druid)?.saveDc ?? 0
  const find = (id: string) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const here = (other: T | undefined): other is T => !!other && !isDead(other) && !hasFled(other)
  const named = args.targets.map(find).filter(here)
  const healedNamed = args.heal ? named[0] : undefined
  const harmedNamed = (args.heal ? named.slice(1) : named).filter((other) => other.id !== healedNamed?.id)
  const centre = harmedNamed[0] ?? healedNamed
  if (!centre) return none(`${druid.name} names no one for Land's Aid to fall on.`)
  // The Sphere's centre within 60 feet of the Druid, and everyone caught within 10 feet of it, where all stand on a floor.
  const from = placedOf(druid)
  const at = placedOf(centre)
  if (from && at && !within(from, at, RANGE)) return none(`${centre.name} is out of Land's Aid's range of ${RANGE} feet from ${druid.name}.`)
  const inSphere = (other: T) => {
    const there = placedOf(other)
    return !at || !there || within(at, there, RADIUS)
  }
  const harmed = harmedNamed.filter(inSphere)
  // One named to heal, or else the one of the Druid's side in the Sphere missing the most hit points.
  const missing = (other: T) => {
    const hitPoints = hitPointsOf(other)
    return hitPoints ? hitPoints.maximum - hitPoints.current : 0
  }
  const healed =
    healedNamed && inSphere(healedNamed)
      ? healedNamed
      : healedNamed
        ? undefined
        : characters.filter((other) => here(other) && sameSide(other, druid) && at && placedOf(other) && inSphere(other) && missing(other) > 0).sort((a, b) => missing(b) - missing(a))[0]

  const dice = aidDice(druid.sheet.level)
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const facts: string[] = []
  if (harmed.length) {
    // One roll of the damage for everyone caught, as an area's damage is rolled once.
    const rolled = rollDamage([{ dice, type: "necrotic" }], args.roll)
    const [part] = rolled.parts
    for (const target of harmed) {
      const now = find(target.id) as T
      const saved = rollSave({ target: now, ability: "con", dc, d20: args.d20, roll: args.roll, characters, spell: false })
      saves.push(saved)
      const dealt = saved.success ? Math.floor(rolled.total / 2) : rolled.total
      const taken = damageTaken({ parts: [{ type: "necrotic", dice: [], bonus: dealt, total: dealt }], total: dealt }, defensesOf(now))
      const struck = withDamage(now, taken, { rules: args.rules })
      put(afterHarm(struck.character))
      harm.push({ target: now.id, kind: "damage", dice: part.dice, sides: part.sides, bonus: 0, type: "necrotic", amount: taken })
      facts.push(
        `${now.name} ${saved.success ? "SUCCEEDS on" : "FAILS"} the Constitution saving throw against ${druid.name}'s Land's Aid (${saved.total} against DC ${dc}) and takes ${taken} necrotic damage from its thorns. ${standing(find(now.id) as T, struck.fate)}`
      )
    }
  }
  if (healed) {
    // Healing dice are thrown as damage dice are; the type is not dealt.
    const rolled = rollDamage([{ dice, type: "force" }], args.roll)
    const [part] = rolled.parts
    const now = withHealing(find(healed.id) as T, rolled.total)
    put(now)
    harm.push({ target: healed.id, kind: "healing", dice: part.dice, sides: part.sides, bonus: 0, amount: rolled.total })
    facts.push(`${druid.name}'s Land's Aid flowers restore ${rolled.total} hit points to ${healed.id === druid.id ? "them" : healed.name}. ${standing(now, undefined)}`)
  }
  if (!harmed.length && !healed) return none(`No one ${druid.name} named stands within ${RADIUS} feet of where Land's Aid falls.`)
  characters = characters.map((character) => (character.id === druid.id ? withWildShapeSpent(character) : character))
  if (paid.slot) facts.push(`${druid.name} spends a level ${paid.slot} spell slot for the use of Wild Shape, by Wild Resurgence.`)
  return { characters, targets: [...harmed.map((other) => other.id), ...(healed ? [healed.id] : [])], saves, harm, conditions: [], facts }
}

// Wild Resurgence's second part, once a Long Rest, kept as a use under the feature's own id.
const resurgenceSpent = (character: Featured): boolean => (character.featureUses?.[WILD_RESURGENCE] ?? 0) > 0

const ELEMENTAL_FURY = "druid-elemental-fury"
const IMPROVED_FURY = "druid-improved-elemental-fury"
const PRIMAL_STRIKE = "primal-strike"
const POTENT = "potent-spellcasting"
// Improved Potent Spellcasting's 300 feet, from the text.
const POTENT_REACH = 300
const ARCHDRUID = "druid-archdruid"
// Nature Magician's slot, kept in `featureUses` until a Long Rest.
const magicianSlotKey = (level: number) => `${ARCHDRUID}:slot-${level}`
// Nature Magician makes at most a level 8 slot: four uses, 2 levels each, and slots stop at level 9.
const MAGICIAN_USES = 4

// The Elemental Fury option the hero keeps, or none.
const fury = (character: Roller): string | undefined => (character.sheet && hasFeature(character, ELEMENTAL_FURY) ? keptChoiceOf(character.sheet, ELEMENTAL_FURY) : undefined)
const wisdomOf = (character: Roller): number => (character.sheet ? deriveSheet(character.sheet).abilityModifiers.wis : 0)
// A Druid cantrip: one of level 0 on the Druid list.
const druidCantrip = (spell: Spell): boolean => spell.level === 0 && spell.classes.includes("druid")

// How much of a damage type reaches a creature through its defenses.
function share(target: Roller, type: DamageTypeId): number {
  const defenses = defensesOf(target)
  if (defenses.immunities?.includes(type)) return 0
  return (defenses.resistances?.includes(type) ? 0.5 : 1) * (defenses.vulnerabilities?.includes(type) ? 2 : 1)
}
const PRIMAL_TYPES: readonly DamageTypeId[] = ["thunder", "lightning", "cold", "fire"]

// Nature Magician: every use of Wild Shape left, up to four, turned into one slot, once a Long Rest, for a Druid with no
// slot left. None where it is not taken.
function natureMagician<T extends Featured>(druid: T): { character: T; told: { name: string; text: string } } | undefined {
  if (!hasFeature(druid, ARCHDRUID) || usesLeft(druid, ARCHDRUID) < 1 || slotsLeft(druid).some((left) => left > 0)) return undefined
  const uses = Math.min(MAGICIAN_USES, usesLeft(druid, WILD_SHAPE))
  if (uses < 1) return undefined
  const level = 2 * uses
  const spent = withFeatureUsed({ ...druid, featureUses: { ...druid.featureUses, [WILD_SHAPE]: (druid.featureUses?.[WILD_SHAPE] ?? 0) + uses } }, ARCHDRUID)
  return {
    character: { ...spent, featureUses: { ...spent.featureUses, [magicianSlotKey(level)]: (spent.featureUses?.[magicianSlotKey(level)] ?? 0) + 1 } },
    told: { name: "Nature Magician", text: `${druid.name} turns ${uses} ${uses === 1 ? "use" : "uses"} of Wild Shape into a level ${level} spell slot.` },
  }
}

// Wild Resurgence: a use of Wild Shape for a level 1 slot, once a Long Rest, when the Druid has no slot left.
function resurgence<T extends Featured>(druid: T): { character: T; told: { name: string; text: string } } | undefined {
  if (!hasFeature(druid, WILD_RESURGENCE) || resurgenceSpent(druid)) return undefined
  if (slotsLeft(druid).some((left) => left > 0) || usesLeft(druid, WILD_SHAPE) < 1) return undefined
  const spent = withFeatureUsed(druid, WILD_SHAPE)
  const slots = [...(spent.spellSlots ?? [])]
  slots[0] = Math.max(0, (slots[0] ?? 0) - 1)
  return {
    character: { ...spent, spellSlots: slots, featureUses: { ...spent.featureUses, [WILD_RESURGENCE]: 1 } },
    told: { name: "Wild Resurgence", text: `${druid.name ?? "The Druid"} spends a use of Wild Shape to regain a level 1 spell slot.` },
  }
}

export const druid: ClassRules = {
  class: "druid",
  bonusActions: [...wildShapeActions, moveSanctuary],
  choices: [
    {
      key: "aided",
      check: "lands-aid",
      offer: (character) => (hasFeature(character, LANDS_AID) && wildShapeUse(character) ? true : undefined),
      prompt: () =>
        `   - LAND'S AID: when the character calls up life-giving flowers and draining thorns in one spot as the action, "check" is "lands-aid". "targets" are the creatures it harms, the first at its centre and the rest within 10 feet of it, and "aided" is the id of the one creature there who regains hit points. The game rolls it and spends a use of Wild Shape. A spell is a "cast", not this.
`,
      field: () => z.string().max(80).optional().describe('For "lands-aid": the id of the one creature in the area who regains hit points'),
      // Used as the action: resolved with no throw of the hero's, as a spell that asks for none. The one healed goes
      // first among the targets, marked by `heal`.
      act: (value, { character, everyone, pick, named, also }) => {
        const idOf = (asked: string | undefined) => (asked ? everyone.find((other) => named(asked, other.name, other.id))?.id : undefined)
        const aided = idOf(value)
        const harmed = [...(pick.targets ?? []), ...(pick.target ? [pick.target] : [])].flatMap((asked) => idOf(asked) ?? []).filter((id) => id !== aided)
        const feature: RequiredFeature = {
          feature: { id: "lands-aid", targets: [...(aided ? [aided] : []), ...new Set(harmed)], ...(aided ? { heal: true as const } : {}) },
          rollType: "Land's Aid",
          difficulty: spellcastingOf(character)?.saveDc ?? 0,
          modifier: 0,
          mode: "normal",
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: feature.feature })
        return { roll: null, feature, ...also }
      },
      effects: ["lands-aid"],
      resolve: ({ characters, actorId, feature, d20, roll, rules }) => ({
        ...landsAid({ characters: characters as Aided[], druidId: actorId, targets: feature.targets, heal: feature.heal, d20, roll, rules }),
        name: "Land's Aid",
      }),
    },
    {
      key: "sanctuary",
      check: "natures-sanctuary",
      offer: (character) => (hasFeature(character, NATURES_SANCTUARY) && wildShapeUse(character) ? true : undefined),
      prompt: () =>
        `   - NATURE'S SANCTUARY: when the character calls up spectral trees and vines to shelter their allies as the action, "check" is "natures-sanctuary" and "targets" names the one the trees stand around first, the character themselves if no one else. Those of the party within the 15-foot cube have Half Cover and resist the character's land's damage. The game spends a use of Wild Shape.
`,
      field: () => z.boolean().optional().describe('For "natures-sanctuary": true'),
      act: (_value, { character, everyone, pick, named, also }) => {
        const targets = [...(pick.targets ?? []), ...(pick.target ? [pick.target] : [])].flatMap((asked) => everyone.find((other) => named(asked, other.name, other.id))?.id ?? [])
        const feature: RequiredFeature = { feature: { id: "natures-sanctuary", targets }, rollType: "Nature's Sanctuary", difficulty: 0, modifier: 0, mode: "normal" }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: feature.feature })
        return { roll: null, feature, ...also }
      },
      effects: ["natures-sanctuary"],
      resolve: ({ characters, actorId, feature }) => ({
        ...naturesSanctuary({ characters: characters as Parameters<typeof naturesSanctuary>[0]["characters"][number][], druidId: actorId, targets: feature.targets }),
        name: "Nature's Sanctuary",
      }),
    },
  ],
  hits: [
    {
      id: PRIMAL_STRIKE,
      // Once on each of the Druid's own turns, on a hit with a weapon or with a Beast form's attack.
      damage: ({ attacker, attack, weapon, turnOf, target }) => {
        if (!attacker.sheet || !attacker.id || turnOf !== attacker.id || fury(attacker) !== PRIMAL_STRIKE) return undefined
        if (!weapon && !(inWildShape(attacker) && attack.id !== UNARMED_STRIKE)) return undefined
        if (usedThisTurn(attacker, PRIMAL_STRIKE, turnOf)) return undefined
        const type = target ? PRIMAL_TYPES.reduce((best, next) => (share(target, next) > share(target, best) ? next : best)) : PRIMAL_TYPES[0]
        return { name: "Primal Strike", damage: { dice: hasFeature(attacker, IMPROVED_FURY) ? "2d8" : "1d8", type }, once: PRIMAL_STRIKE }
      },
    },
  ],
  turnEffects: [
    { id: "wild-resurgence", span: 1 },
    { id: PRIMAL_STRIKE, span: 1 },
  ],
  castingBarred: formBarsCasting,
  // Potent Spellcasting: the Wisdom modifier on a Druid cantrip's damage, by a save or no roll, and on a spell attack's hit.
  spellDamage: ({ caster, spell, item }) => (!item && druidCantrip(spell) && fury(caster) === POTENT ? wisdomOf(caster) : 0),
  spellHit: ({ caster, spell }) => (druidCantrip(spell) && fury(caster) === POTENT ? { name: "Potent Spellcasting", bonus: wisdomOf(caster) } : undefined),
  // Improved Potent Spellcasting: 300 feet more on a Druid cantrip that reaches 10 feet or more.
  spellRange: (caster, spell) => {
    if (!druidCantrip(spell) || fury(caster) !== POTENT || !hasFeature(caster, IMPROVED_FURY)) return undefined
    const reach = spellRule(spell.id)?.range?.(caster) ?? rangeFeet(spell.range)
    return reach !== undefined && reach >= 10 ? reach + POTENT_REACH : undefined
  },
  // Nature's Ward in a Beast form, whose stat block's defenses stand in place of the sheet's, and a Cube's Resistance.
  resistances: (character) => [...(inWildShape(character) ? [wardType(character as Rested) ?? []].flat() : []), ...sanctuaryResistances(character)],
  conditionImmunities: (character) => (hasFeature(character, NATURES_WARD) ? (classFeatureById.get(NATURES_WARD)?.conditionImmunities?.conditions ?? []) : []),
  cover: sanctuaryCover,
  spellsGiven: naturalRecoveryCasts,
  shortRest: naturalRecoveryRest,
  createdSlots: (character) => (hasFeature(character, ARCHDRUID) ? [1, 2, 3, 4, 5, 6, 7, 8].map((level) => character.featureUses?.[magicianSlotKey(level)] ?? 0) : []),
  // Evergreen Wild Shape: a use back as Initiative is rolled with none left.
  initiative: (character) => {
    if (!hasFeature(character, ARCHDRUID) || !hasFeature(character, WILD_SHAPE) || usesLeft(character, WILD_SHAPE) > 0) return character
    return { ...character, featureUses: { ...character.featureUses, [WILD_SHAPE]: Math.max(0, (character.featureUses?.[WILD_SHAPE] ?? 0) - 1) } }
  },
  roundStart: (character, round) => {
    let now = character
    const told: { name: string; text: string }[] = []
    const step = (done: { character: typeof character; told?: { name: string; text: string } } | undefined) => {
      if (!done) return
      now = done.character
      if (done.told) told.push(done.told)
    }
    step(formAtRoundStart(now))
    step(sanctuaryAtRoundStart(now as typeof now & Rested, round))
    // A use of Wild Shape for a slot, for a Druid up with no slot left: Nature Magician, or else Wild Resurgence. Below
    // level 18 a Druid in a form cannot cast, so keeps the use.
    const druid = now as typeof now & Featured
    const casts = !classCastingBar(druid)
    if (hasFeature(druid, WILD_SHAPE) && !isDead(druid) && druid.hitPoints !== 0 && casts)
      step((natureMagician(druid) ?? resurgence(druid)) as { character: typeof character; told: { name: string; text: string } } | undefined)
    return { character: now, ...(told.length ? { told: { name: told[0].name, text: told.map((entry) => entry.text).join(" ") } } : {}) }
  },
}
