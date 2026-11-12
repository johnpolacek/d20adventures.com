import { isDead, isDown } from "@d20/gm-core/utils/turn-actors"

type Bearer = { type?: string; hitPoints?: number; healthPercent?: number; dead?: true; conditions?: readonly { id: string; level?: number }[] }

const word = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)

/**
 * A character's conditions in words for the screen: "Prone, Poisoned, Exhaustion 2", and Unconscious at 0 hit points.
 * It reads no rules data, so the browser does not load it. The game master's words come from @d20/gm-core/sheet/conditions.
 */
export function conditionLabel(character: Bearer): string {
  const words = (character.conditions ?? []).map((entry) => (entry.id === "exhaustion" ? `${word(entry.id)} ${entry.level ?? 1}` : word(entry.id)))
  if (isDown(character) && !isDead(character) && !character.conditions?.some((entry) => entry.id === "unconscious")) words.push("Unconscious")
  return words.join(", ")
}
