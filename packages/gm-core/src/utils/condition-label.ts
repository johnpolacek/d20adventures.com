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
}

/** A condition's or a turn effect's id as a word for the screen: "poisoned" is "Poisoned". */
export const conditionWord = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

/**
 * A character's conditions in words for the screen: "Prone, Poisoned, Exhaustion 2", and Unconscious at 0 hit points,
 * then what the actions of a turn left on them: "Dodging", "Helped", "Distracted", "Vexed".
 */
export function conditionLabel(character: Bearer): string {
  const words = (character.conditions ?? []).map((entry) => (entry.id === "exhaustion" ? `${conditionWord(entry.id)} ${entry.level ?? 1}` : conditionWord(entry.id)))
  if (isDown(character) && !isDead(character) && !character.conditions?.some((entry) => entry.id === "unconscious")) words.push("Unconscious")
  for (const effect of character.turnEffects ?? []) {
    const word = conditionWord(effect.id)
    if (!words.includes(word)) words.push(word)
  }
  return words.join(", ")
}
