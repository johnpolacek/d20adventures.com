import type { DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { spellById } from "@d20/srd/spells"
import { subclassById } from "@d20/srd/subclasses"
import { isDead, isIncapacitated } from "../../utils/turn-actors"
import type { BonusActionRule, Covered, Featured, Rested, RoundTurn, SpellsGiven } from "../class-rules"
import { LAND_CHOICE } from "../derive"
import { hasFeature } from "../feature-rules"
import { sameSide } from "../sides"
import { type Point, placedOf, within } from "../space"
import type { Cast } from "../spells"
import type { SpellEffect } from "../turn-effect"
import { wildShapeUse, withWildShapeSpent } from "./wild-shape"
import { recoverableSlots } from "./wizard"

/**
 * The Circle of the Land's features of levels 6 to 14, by the SRD 5.2.1 (p. 46). Land's Aid (level 3) is in ./druid.
 *
 * Natural Recovery (level 6), two parts, each once a Long Rest:
 * - One of the land's level 1+ spells the Druid has prepared by Circle of the Land Spells is cast with no slot. By a
 *   plain rule it is the first casting of such a spell, at its own level, before any slot is spent: a slot named higher
 *   is still spent (../spells `spellsOf`, `castCost`). Counted under the feature's id.
 * - As a Short Rest ends, spent slots of a combined level of at most half the Druid level, rounded up, none of level 6
 *   or higher, come back, by the same choice as a Wizard's Arcane Recovery (./wizard `recoverableSlots`): the first
 *   Short Rest with a slot spent. Counted under "circle-of-the-land-natural-recovery:slots".
 * Nature's Ward (level 10): the Resistance by the land is the sheet's (../derive). Immunity to the Poisoned condition is
 * read where a condition is given (../conditions `immuneTo`). In a Beast form the stat block's defenses stand, so the
 * Resistance the Druid keeps as a class feature is added there (./druid `resistances`).
 * Nature's Sanctuary (level 14): a Magic action that spends a use of Wild Shape: a 15-foot Cube of spectral trees on the
 * ground within 120 feet, centred where the first creature named stands, or on the Druid. It is kept on the Druid as the
 * lasting effect "natures-sanctuary" with its point `at`, for 10 rounds, and it ends early when the Druid has the
 * Incapacitated condition or dies, as a round turns, and with the encounter. A second Cube takes the place of the
 * first. The Druid and their allies whose centre is in it have Half Cover against attack rolls (./druid `cover`): the
 * engine reads a save's cover from the walls between, so a Dexterity save gains nothing from it. The Druid's allies in it
 * gain the Resistance of Nature's Ward: each hero ally in it is given the mark "natures-sanctuary-ward" as it is made or
 * moved and as each round turns, so one who walks in or out mid-round gains or keeps it until the round turns. An NPC
 * ally has no class rules to read the mark, so it gains the cover and not the Resistance. Moving the Cube up to 60
 * feet, to be centred on a creature named and still within 120 feet of the Druid, is a Bonus Action. With no floor
 * there is nowhere to put it, and it is not made.
 */

export const NATURAL_RECOVERY = "circle-of-the-land-natural-recovery"
const NATURAL_SLOTS = `${NATURAL_RECOVERY}:slots`
export const NATURES_WARD = "circle-of-the-land-natures-ward"
export const NATURES_SANCTUARY = "circle-of-the-land-natures-sanctuary"
/** The Cube's lasting effect on the Druid, and the mark of its Resistance on an ally in it. */
const SANCTUARY = "natures-sanctuary"
const WARD = "natures-sanctuary-ward"
// The Cube's rounds: "1 minute".
const SANCTUARY_ROUNDS = 10
// "move the Cube up to 60 feet", read from the text: the data types the range and the Cube alone.
const SANCTUARY_MOVE = 60

type Lasting = { id?: string; name?: string; position?: Point; spellEffects?: readonly SpellEffect[] }

/** The Druid's land, as the sheet keeps it. */
const landOf = (character: Rested): string | undefined => character.sheet?.featureChoices?.[LAND_CHOICE]

/** The damage type Nature's Ward resists by the Druid's land, or none. */
export function wardType(character: Rested): DamageTypeId | undefined {
  if (!hasFeature(character, NATURES_WARD)) return undefined
  const land = landOf(character)
  return classFeatureById.get(NATURES_WARD)?.landResistances?.find((entry) => entry.land === land)?.damageType
}

/** The land's spells of level 1 or higher the Druid has prepared by Circle of the Land Spells at their level. */
function landSpells(character: Rested): string[] {
  const land = landOf(character)
  const level = character.sheet?.level ?? 0
  return (subclassById.get("circle-of-the-land")?.alwaysPrepared ?? [])
    .filter((entry) => entry.land === land && entry.level <= level)
    .flatMap((entry) => entry.spells)
    .filter((id) => (spellById.get(id)?.level ?? 0) >= 1)
}

/** Natural Recovery's casting with no slot, while it is unspent. */
export const naturalRecoveryCasts = (character: Rested): SpellsGiven[] =>
  hasFeature(character, NATURAL_RECOVERY) && (character.featureUses?.[NATURAL_RECOVERY] ?? 0) < 1
    ? [{ feature: NATURAL_RECOVERY, name: "Natural Recovery", spells: landSpells(character), first: true }]
    : []

/** Natural Recovery's slots as a Short Rest ends, once a Long Rest. */
export function naturalRecoveryRest<T extends Rested>(character: T): { character: T; facts: string[] } {
  const sheet = character.sheet
  if (!sheet || !hasFeature(character, NATURAL_RECOVERY) || (character.featureUses?.[NATURAL_SLOTS] ?? 0) > 0) return { character, facts: [] }
  const recovered = recoverableSlots(character.spellSlots, Math.ceil(sheet.level / 2))
  if (!recovered.length) return { character, facts: [] }
  const spellSlots = (character.spellSlots ?? []).map((used, index) => used - (recovered[index] ?? 0))
  const { spellSlots: _, ...rest } = character
  const words = recovered.flatMap((count, index) => (count ? [`${count} level ${index + 1}`] : [])).join(" and ")
  const count = recovered.reduce((sum, taken) => sum + taken, 0)
  return {
    character: { ...rest, featureUses: { ...character.featureUses, [NATURAL_SLOTS]: 1 }, ...(spellSlots.some((used) => used > 0) ? { spellSlots } : {}) } as unknown as T,
    facts: [`${character.name ?? "The Druid"} uses Natural Recovery and recovers ${words} spell ${count === 1 ? "slot" : "slots"}.`],
  }
}

/** The Druid's Cube, where it stands. None once the Druid is Incapacitated or dead. */
function cubeOf(druid: Lasting & Covered): Point | undefined {
  if (isDead(druid) || isIncapacitated(druid)) return undefined
  return druid.spellEffects?.find((effect) => effect.spell === SANCTUARY && effect.by === druid.id)?.at
}

// Whether a point is in a 15-foot Cube centred on another, half a foot either way, as distances are read.
function inCube(cube: Point, at: Point): boolean {
  const half = (classFeatureById.get(NATURES_SANCTUARY)?.area?.size ?? 15) / 2 + 0.5
  return Math.abs(at.x - cube.x) <= half && Math.abs(at.y - cube.y) <= half
}

/** Whether one stands sheltered by a Druid's Cube: the Druid, or one of their side, with their centre in it. */
const shelteredBy = (druid: Covered, other: Covered): boolean => {
  const cube = cubeOf(druid as Lasting & Covered)
  return !!cube && !!other.position && (other.id === druid.id || sameSide(other, druid)) && inCube(cube, other.position)
}

/** Half Cover for one in a Cube of anyone present. */
export const sanctuaryCover = (target: Covered, present: readonly Covered[]): "half" | undefined =>
  present.some((druid) => hasFeature(druid, NATURES_SANCTUARY) && shelteredBy(druid, target)) ? "half" : undefined

/** The Resistance an ally holds by the mark of a Cube, or none. */
export const sanctuaryResistances = (character: Lasting): DamageTypeId[] =>
  (character.spellEffects ?? []).flatMap((effect) => (effect.spell === WARD && effect.by !== character.id && effect.choice ? [effect.choice as DamageTypeId] : []))

/** One with the mark of a Druid's Cube given or taken, as where they stand now says. */
function warded<T extends Lasting & Covered>(character: T, everyone: readonly (Covered & Rested)[]): T {
  const druid = everyone.find((other) => other.id !== character.id && !!wardType(other) && shelteredBy(other, character))
  const type = druid && character.sheet ? wardType(druid) : undefined
  const kept = (character.spellEffects ?? []).filter((effect) => effect.spell !== WARD)
  const had = (character.spellEffects ?? []).find((effect) => effect.spell === WARD)
  if (!type || !druid) {
    if (!had) return character
    const { spellEffects: _, ...rest } = character
    return (kept.length ? { ...rest, spellEffects: kept } : rest) as T
  }
  if (had && had.by === druid.id && had.choice === type) return character
  return { ...character, spellEffects: [...kept, { spell: WARD, by: druid.id, turns: 1, choice: type }] }
}

/** Everyone with the marks of the Cubes given or taken, as each stands now. */
const allWarded = <T extends Lasting & Covered & Rested>(characters: readonly T[]): T[] => characters.map((character) => warded(character, characters))

/**
 * As a round turns: a Druid's Cube ends once they are Incapacitated or dead, and the mark of a Cube's Resistance is
 * given to each ally in one and taken from one who has left it.
 */
export function sanctuaryAtRoundStart<T extends Lasting & Covered & Rested>(character: T, round?: RoundTurn): { character: T; told?: { name: string; text: string } } | undefined {
  const cube = character.spellEffects?.find((effect) => effect.spell === SANCTUARY && effect.by === character.id)
  if (cube && (isDead(character) || isIncapacitated(character))) {
    const spellEffects = (character.spellEffects ?? []).filter((effect) => effect !== cube)
    const { spellEffects: _, ...rest } = character
    return { character: (spellEffects.length ? { ...rest, spellEffects } : rest) as T, told: { name: "Nature's Sanctuary", text: `${character.name ?? "The Druid"}'s spectral trees fade away.` } }
  }
  if (!round) return undefined
  const now = warded(character, round.everyone as readonly (Covered & Rested)[])
  return now === character ? undefined : { character: now }
}

type Sheltering = Featured & Lasting & Covered

/**
 * Use Nature's Sanctuary: the Cube put where the first named stands, or on the Druid, within 120 feet, and a use of
 * Wild Shape spent. Everyone comes back as it left them, in the shape a spell's cast takes, with `problem` saying why
 * nothing happened.
 */
export function naturesSanctuary<T extends Sheltering>(args: { characters: readonly T[]; druidId: string; targets: readonly string[] }): Cast<T> & { problem?: string } {
  const characters = [...args.characters]
  const druid = characters.find((character) => character.id === args.druidId)
  const none = (problem: string): Cast<T> & { problem: string } => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [], problem })
  if (!druid?.sheet || !hasFeature(druid, NATURES_SANCTUARY)) return none(`${druid?.name ?? "This character"} cannot use Nature's Sanctuary.`)
  const paid = wildShapeUse(druid)
  if (!paid) return none(`${druid.name} has no use of Wild Shape left for Nature's Sanctuary.`)
  const centre = args.targets.map((id) => characters.find((character) => character.id === id)).find((other) => !!other?.position) ?? druid
  const from = placedOf(druid)
  const at = placedOf(centre)
  if (!from || !at) return none(`There is no floor to raise Nature's Sanctuary on.`)
  const range = classFeatureById.get(NATURES_SANCTUARY)?.range ?? 120
  if (!within(from, { at: at.at }, range)) return none(`${centre.name} is out of Nature's Sanctuary's range of ${range} feet from ${druid.name}.`)
  const spent = withWildShapeSpent(druid)
  const effects = (spent.spellEffects ?? []).filter((effect) => !(effect.spell === SANCTUARY && effect.by === druid.id))
  const raised = { ...spent, spellEffects: [...effects, { spell: SANCTUARY, by: druid.id, turns: SANCTUARY_ROUNDS, at: { ...at.at } }] }
  const after = allWarded(characters.map((character) => (character.id === druid.id ? raised : character)))
  const sheltered = after.filter((other) => shelteredBy(raised, other))
  const type = wardType(druid)
  const facts = [
    `Spectral trees and vines rise in a 15-foot cube around ${centre.id === druid.id ? druid.name : centre.name} for 1 minute. ${sheltered.length ? `${sheltered.map((other) => other.name).join(", ")} ${sheltered.length === 1 ? "has" : "have"} Half Cover there` : "No one of the party stands in it yet"}${type ? `, and ${druid.name}'s allies there resist ${type} damage` : ""}.`,
    ...(paid.slot ? [`${druid.name} spends a level ${paid.slot} spell slot for the use of Wild Shape, by Wild Resurgence.`] : []),
  ]
  return { characters: after, targets: sheltered.map((other) => other.id), saves: [], harm: [], conditions: [], facts }
}

/** The Bonus Action that moves the Cube to be centred on a creature named. */
export const moveSanctuary: BonusActionRule = {
  id: "natures-sanctuary-move",
  feature: NATURES_SANCTUARY,
  name: "Nature's Sanctuary: Move the Trees",
  targeted: true,
  note: `natures-sanctuary-move moves the character's spectral trees up to ${SANCTUARY_MOVE} feet, to stand around the creature named as its target, when the player's words call for it.`,
  offer: (character) => !!cubeOf(character as Lasting & Covered),
  use: ({ characters, actor, action, target }) => {
    const druid = actor as Sheltering
    const cube = cubeOf(druid)
    const to = characters.find((character) => character.id === target) as Sheltering | undefined
    const from = placedOf(druid)
    const range = classFeatureById.get(NATURES_SANCTUARY)?.range ?? 120
    if (!cube || !to?.position || !from || Math.hypot(to.position.x - cube.x, to.position.y - cube.y) > SANCTUARY_MOVE + 0.5 || !within(from, { at: to.position }, range)) return { characters }
    const spellEffects = (druid.spellEffects ?? []).map((effect) => (effect.spell === SANCTUARY && effect.by === druid.id ? { ...effect, at: { ...to.position } } : effect)) as SpellEffect[]
    const moved = { ...druid, spellEffects }
    const after = allWarded(characters.map((character) => (character.id === druid.id ? moved : character)) as Sheltering[])
    return { characters: after, use: { feature: action.id, name: action.name, fact: `${druid.name}'s spectral trees move to stand around ${to.id === druid.id ? "them" : to.name}.` } }
  },
}
