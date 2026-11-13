import type { SpellRules } from "../spell-rules"

/**
 * Spells whose text takes several creatures with no area: the count is in their words alone, and the data adds those a
 * higher slot gives (`extraTargetsPerSlot`). "Any number" is taken as twenty (Beacon of Hope, Animal Shapes, Mass Heal),
 * a wall of wind as many as stand along its 50 feet, and Slow "up to six" in its cube, and Mass Cure Wounds "up to six". A spell that takes
 * "you and up to eight" takes nine, the caster among them. Chain Lightning takes its first target and the three its
 * bolts leap to.
 */
const COUNTS: Record<string, number> = {
  bless: 3,
  bane: 3,
  aid: 3,
  "prayer-of-healing": 5,
  "mass-healing-word": 6,
  "beacon-of-hope": 20,
  "wind-wall": 10,
  slow: 6,
  "mass-cure-wounds": 6,
  "mass-suggestion": 12,
  "chain-lightning": 4,
  "feather-fall": 5,
  "telepathic-bond": 8,
  "water-breathing": 10,
  "water-walk": 10,
  "heroes-feast": 12,
  "word-of-recall": 6,
  "wind-walk": 11,
  teleport: 9,
  "plane-shift": 9,
  "astral-projection": 9,
  "animal-shapes": 20,
  "mass-heal": 20,
}

export const counts: SpellRules[] = Object.entries(COUNTS).map(([id, count]) => ({ spells: [id], count }))
