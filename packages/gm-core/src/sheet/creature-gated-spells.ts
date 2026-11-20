import type { Roller } from "./check"
import { creatureTypeOf } from "./spell-mechanics/enchantments"
import { type Slotted, spellsOf } from "./spells"

// Spells that work only on one type of creature: "you can comprehend and verbally communicate with Beasts" (Speak with
// Animals), "Choose a Humanoid" (Charm Person). The ones that target are refused by their `takes` rule as they are cast
// (./spell-mechanics). This list is for what a hero is offered before that, so they are not handed a spell with
// nothing here to work on, as Speak with Animals before an Owlbear, a Monstrosity.
const WORKS_ONLY_ON: Record<string, "beast" | "humanoid"> = {
  "speak-with-animals": "beast",
  "animal-friendship": "beast",
  "animal-messenger": "beast",
  "dominate-beast": "beast",
  "charm-person": "humanoid",
  "hold-person": "humanoid",
  "dominate-person": "humanoid",
}

const TYPE_NAME = { beast: "Beasts", humanoid: "Humanoids" }

/** One of the caster's spells with no one here to work on, and why: "Speak with Animals works only on Beasts". */
export type UnworkableSpell = { spell: string; why: string }

/**
 * The caster's spells that work only on a type of creature none of the others here is. Empty when every such spell
 * has someone to work on.
 */
export function spellsWithNoOneToWorkOn(caster: Slotted & { id?: string }, others: readonly (Roller & { id?: string })[]): UnworkableSpell[] {
  const types = new Set(others.filter((other) => other.id !== caster.id).map((other) => creatureTypeOf(other)))
  return spellsOf(caster).flatMap(({ spell }) => {
    const type = WORKS_ONLY_ON[spell.id]
    return type && !types.has(type) ? [{ spell: spell.name, why: `${spell.name} works only on ${TYPE_NAME[type]}, and none is here` }] : []
  })
}

/** The line a hero's prompt carries for those spells, or nothing. */
export function noOneToWorkOnNote(caster: Slotted & { id?: string }, others: readonly (Roller & { id?: string })[]): string {
  const spells = spellsWithNoOneToWorkOn(caster, others)
  return spells.length ? `Spells with no one here to work on, so do not use them now: ${spells.map((entry) => entry.why).join(". ")}.` : ""
}
