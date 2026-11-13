import { type DamageTypeId, damageTypeIds } from "@d20/srd"
import type { MonsterFeature } from "@d20/srd/schema/monsters"
import { hasFled, isDown, isIncapacitated } from "../utils/turn-actors"
import type { DamageRoll, Defenses } from "./attack"
import { blockOf } from "./blocks"
import type { ConditionEntry } from "./condition-entry"
import type { ModeSource } from "./conditions"
import { shapeOf } from "./shape"
import type { Sheet } from "./sheet"
import { sameSide } from "./sides"
import { type Point, placedOf, within } from "./space"
import type { TurnEffect } from "./turn-effect"

/**
 * The stat block traits that change a roll or hit points, read off the character's own stat block. A hero's sheet
 * carries none of them, so a hero has none but those of a Beast's shape they hold (a Wolf's Pack Tactics): nothing
 * here asks whether a character is an NPC.
 *
 * None of these is typed in the data: each trait is a name and its text. So they are found by name in one table, and
 * Regeneration's numbers are read from its text (the hit points it gives, the damage types that stop it, and what it
 * does at 0 hit points), since the data gives no typed number for them.
 *
 * - Pack Tactics: Advantage on an attack roll against a creature when an ally of the attacker is within 5 feet of it
 *   and does not have the Incapacitated condition (./conditions `attackModesFrom`).
 * - Magic Resistance: Advantage on saving throws against spells and other magical effects (./spells `rollSave`).
 * - Sunlight Sensitivity: Disadvantage on ability checks and attack rolls while in sunlight. Found, and not run: the
 *   engine is told nothing true of daylight.
 * - Regeneration: hit points at the start of each of its turns (./death `regenerate`, run as a round turns).
 */

export type MonsterTraitId = "pack-tactics" | "magic-resistance" | "sunlight-sensitivity" | "regeneration"

/** The traits by the name the SRD prints. */
const BY_NAME: Readonly<Record<string, MonsterTraitId>> = {
  "Pack Tactics": "pack-tactics",
  "Magic Resistance": "magic-resistance",
  "Sunlight Sensitivity": "sunlight-sensitivity",
  Regeneration: "regeneration",
}

type Bearer = { type?: string; sheet?: Sheet; statBlock?: string }

// The stat block a character carries: an NPC's own, or the Beast's shape a hero holds (./shape). Another with a rules sheet has none.
const traitsOf = (character: Bearer): readonly MonsterFeature[] => (shapeOf(character) ?? (character.sheet || !character.statBlock ? undefined : blockOf(character)))?.traits ?? []

const traitOf = (character: Bearer, id: MonsterTraitId): MonsterFeature | undefined => traitsOf(character).find((trait) => BY_NAME[trait.name] === id)

/** The traits of the table a character has, each once. */
export const monsterTraitsOf = (character: Bearer): MonsterTraitId[] => [...new Set(traitsOf(character).flatMap((trait) => BY_NAME[trait.name] ?? []))]

export const hasMonsterTrait = (character: Bearer, id: MonsterTraitId): boolean => !!traitOf(character, id)

/** Magic Resistance's Advantage on a saving throw against a spell or other magical effect, with the trait's name. */
export function magicSaveModes(character: Bearer): ModeSource[] {
  const trait = traitOf(character, "magic-resistance")
  return trait ? [{ mode: "advantage", from: trait.name }] : []
}

type Packed = Bearer & { id?: string; hitPoints?: number; healthPercent?: number; dead?: true; fled?: true; conditions?: readonly ConditionEntry[]; position?: Point }

/**
 * Pack Tactics' Advantage on an attack roll: "if at least one of the [attacker]'s allies is within 5 feet of the
 * creature and the ally doesn't have the Incapacitated condition". An ally is one on the attacker's side (./sides), as
 * Sneak Attack reads it (./attack): a hero or an NPC with the party for a party's wolf, a foe for a foe's. One at 0 hit points is Unconscious, so Incapacitated. Distance is read from
 * positions: with no floor, no ally is known to be beside the target and the trait gives nothing.
 */
export function packTacticsModes(attacker: Packed, target: Packed, present: readonly Packed[] | undefined): ModeSource[] {
  const trait = traitOf(attacker, "pack-tactics")
  const beside = placedOf(target)
  if (!trait || !beside) return []
  const ally = (present ?? []).some((other) => {
    const at = placedOf(other)
    return !!at && other.id !== attacker.id && other.id !== target.id && sameSide(other, attacker) && !isDown(other) && !hasFled(other) && !isIncapacitated(other) && within(at, beside, 5)
  })
  return ally ? [{ mode: "advantage", from: trait.name }] : []
}

/**
 * Regeneration as its text gives it. `amount`: the hit points regained at the start of each of its turns. `stoppedBy`:
 * damage types that keep it from working on the creature's next turn (a Troll's Acid and Fire). `needsHitPoint`: it
 * works only with at least 1 hit point (Oni, Shield Guardian). `diesAtTurnStart`: the creature "dies only if it starts
 * its turn with 0 Hit Points and doesn't regenerate" (Troll, Troll Limb), so damage that takes it to 0 leaves it down
 * and not dead.
 */
export type Regeneration = { name: string; amount: number; stoppedBy: DamageTypeId[]; needsHitPoint: boolean; diesAtTurnStart: boolean }

/** A character's Regeneration, read from its text. A trait of that name whose text does not read is an error in the data. */
export function regenerationOf(character: Bearer): Regeneration | undefined {
  const trait = traitOf(character, "regeneration")
  if (!trait) return undefined
  const amount = /regains (\d+) Hit Points at the start of each of its turns/.exec(trait.text)
  if (!amount) throw new Error(`${character.statBlock}'s ${trait.name} names no hit points at the start of its turns.`)
  const stop = /takes ([A-Za-z, ]+?) damage, this trait doesn[’']t function/.exec(trait.text)
  const stoppedBy = (stop?.[1] ?? "")
    .split(/,\s*|\s+or\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
  for (const type of stoppedBy) if (!(damageTypeIds as readonly string[]).includes(type)) throw new Error(`${character.statBlock}'s ${trait.name} is stopped by "${type}", which is no damage type.`)
  return {
    name: trait.name,
    amount: Number(amount[1]),
    stoppedBy: stoppedBy as DamageTypeId[],
    needsHitPoint: /if it has at least 1 Hit Point/.test(trait.text),
    diesAtTurnStart: /dies only if it starts its turn with 0 Hit Points and doesn[’']t regenerate/.test(trait.text),
  }
}

/** The damage types a roll dealt to a target through its defenses: each part not shrugged off by Immunity and above 0. */
export const typesTaken = (damage: DamageRoll, defenses: Defenses): DamageTypeId[] => [
  ...new Set(damage.parts.filter((part) => part.total > 0 && !defenses.immunities?.includes(part.type)).map((part) => part.type)),
]

/** Whether damage of these types stops a character's Regeneration on its next turn. */
export const stopsRegeneration = (character: Bearer, types: readonly DamageTypeId[]): boolean => !!regenerationOf(character)?.stoppedBy.some((type) => types.includes(type))

/** The turn effect that marks Regeneration stopped until the creature's next turn has begun. */
export const regenerationStopped = (character: { id?: string }): TurnEffect => ({ id: "regeneration-stopped", by: character.id ?? "", turns: 1 })

export const isRegenerationStopped = (character: { turnEffects?: readonly TurnEffect[] }): boolean => !!character.turnEffects?.some((effect) => effect.id === "regeneration-stopped")
