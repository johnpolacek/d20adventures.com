import type { AbilityId, ConditionId } from "@d20/srd"
import type { ModeSource } from "./conditions"
import { type SpeciesEntry, speciesById } from "./house-species"
import type { Sheet } from "./sheet"

/**
 * Species traits that run in play, for every species that has one, the SRD's and the game's own alike.
 *
 * - Advantage on saving throws: typed in the data as `savingThrowAdvantage`, against conditions (an Elf's Fey
 *   Ancestry and a Half-Elf's Fey Blood on Charmed, a Dwarf's Dwarven Resilience on Poisoned, a Halfling's Brave on
 *   Frightened) or with abilities (a Gnome's Gnomish Cunning on Intelligence, Wisdom and Charisma saves).
 * - Dropping to 1 hit point in place of 0, once a Long Rest: an Orc's Relentless Endurance and a Half-Orc's Hard to
 *   Fell. The data types only their uses, so they are found by name in one table.
 */

type Bearer = { sheet?: Sheet }

const speciesOf = (character: Bearer): SpeciesEntry | undefined => (character.sheet ? speciesById.get(character.sheet.species) : undefined)

/**
 * The Advantage a hero's species gives a saving throw of an ability, made to avoid or end any of `against`: the
 * conditions the save gives on a failure or ends on a success. Each with the trait's name.
 */
export function speciesSaveModes(character: Bearer, ability: AbilityId, against: readonly ConditionId[] = []): ModeSource[] {
  const species = speciesOf(character)
  const level = character.sheet?.level ?? 1
  return (species?.traits ?? []).flatMap((trait) => {
    const advantage = trait.savingThrowAdvantage
    if (!advantage || (trait.level ?? 1) > level) return []
    const applies = advantage.abilities?.includes(ability) || advantage.conditions?.some((condition) => against.includes(condition))
    return applies ? [{ mode: "advantage" as const, from: trait.name }] : []
  })
}

/** The traits that drop a hero to 1 hit point in place of 0, by name, as the SRD and the game's own species print them. */
const ENDURING = new Set(["Relentless Endurance", "Hard to Fell"])

/** The key a species trait's uses are counted under, in a character's `featureUses`: "species-relentless-endurance". */
export const speciesUseKey = (traitName: string) =>
  `species-${traitName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`

/** The trait that would drop a hero to 1 hit point in place of 0, with its use key, whether or not a use is left. */
export function enduringTraitOf(character: Bearer): { name: string; key: string; uses: number } | undefined {
  const trait = speciesOf(character)?.traits.find((entry) => ENDURING.has(entry.name) && (entry.level ?? 1) <= (character.sheet?.level ?? 1))
  if (!trait) return undefined
  return { name: trait.name, key: speciesUseKey(trait.name), uses: typeof trait.uses?.count === "number" ? trait.uses.count : 1 }
}

/** The enduring trait a hero can still use now: one with a use left. */
export function enduringTraitLeft(character: Bearer & { featureUses?: Record<string, number> }) {
  const trait = enduringTraitOf(character)
  return trait && (character.featureUses?.[trait.key] ?? 0) < trait.uses ? trait : undefined
}

/** The species trait that gives a hero Heroic Inspiration as a Long Rest ends, by name (a Human's Resourceful), or none. */
export const longRestInspiration = (character: Bearer): string | undefined =>
  speciesOf(character)?.traits.find((trait) => trait.heroicInspiration === "long-rest" && (trait.level ?? 1) <= (character.sheet?.level ?? 1))?.name
