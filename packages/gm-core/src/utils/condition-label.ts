import { isDead, isDown } from "./turn-actors"

// Browser-safe: it imports no rules data, only ./turn-actors. The game master's own words for conditions come from
// ../sheet/conditions.

type Bearer = {
  type?: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  conditions?: readonly { id: string; level?: number }[]
  turnEffects?: readonly { id: string }[]
  spellEffects?: readonly { spell: string }[]
  concentration?: { spell: string }
}

/** A condition's or a turn effect's id as a word for the screen: "poisoned" is "Poisoned". */
export const conditionWord = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

/** The spell names an id cannot spell: a possessive, or two names in one. */
const SPELL_NAMES: Record<string, string> = {
  "antipathy-sympathy": "Antipathy/Sympathy",
  "arcanists-magic-aura": "Arcanist’s Magic Aura",
  "blindness-deafness": "Blindness/Deafness",
  "dragons-breath": "Dragon’s Breath",
  "enlarge-reduce": "Enlarge/Reduce",
  "heroes-feast": "Heroes’ Feast",
  "hunters-mark": "Hunter’s Mark",
}

/** A spell's SRD id as a name for the screen, with no spell data: "mage-armor" is "Mage Armor". */
export const spellWord = (id: string) =>
  SPELL_NAMES[id] ??
  id
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

/**
 * A character's conditions in words for the screen: "Prone, Poisoned, Exhaustion 2", and Unconscious at 0 hit points,
 * then what the actions of a turn left on them: "Dodging", "Helped", "Distracted", "Vexed", then the spells that last
 * on them, "Bless, Mage Armor", and the one they concentrate on: "Concentrating On Bless".
 */
export function conditionLabel(character: Bearer): string {
  const words = (character.conditions ?? []).map((entry) => (entry.id === "exhaustion" ? `${conditionWord(entry.id)} ${entry.level ?? 1}` : conditionWord(entry.id)))
  if (isDown(character) && !isDead(character) && !character.conditions?.some((entry) => entry.id === "unconscious")) words.push("Unconscious")
  for (const effect of character.turnEffects ?? []) {
    const word = conditionWord(effect.id)
    if (!words.includes(word)) words.push(word)
  }
  for (const effect of character.spellEffects ?? []) {
    const word = spellWord(effect.spell)
    if (!words.includes(word)) words.push(word)
  }
  if (character.concentration) words.push(`Concentrating On ${spellWord(character.concentration.spell)}`)
  return words.join(", ")
}
