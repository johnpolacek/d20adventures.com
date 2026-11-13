// How a character stands, as the screens show it to players. A hero shows their hit points as numbers, any Temporary
// Hit Points beside them, their Armor Class, and Heroic Inspiration where they have it. An NPC never shows a number: one wound word instead. A hero who is down shows as dying with their Death
// Saving Throws, Stable, or Dead. It reads no rules data, so the browser does not load it.

import { conditionWord } from "@d20/gm-core/utils/condition-label"
import { type ActorLike, isDead, isDown, isDying, isIncapacitated } from "@d20/gm-core/utils/turn-actors"

export type Wound = "Unhurt" | "Hurt" | "Bloodied"
export type Standing =
  | { kind: "hero"; hitPoints: number; maximum: number; armorClass: number; temporary?: number; inspired?: true }
  | { kind: "dying"; successes: number; failures: number }
  | { kind: "stable" }
  | { kind: "dead" }
  | { kind: "wound"; word: Wound }

type Bearer = {
  type?: string
  hitPoints?: number
  healthPercent?: number
  tempHitPoints?: number
  dead?: true
  deathSaves?: { successes: number; failures: number; stable?: true }
}
// What a hero's sheet says, at their stored hit points.
type SheetNumbers = { hitPoints: { current: number; maximum: number }; armorClass: number; heroicInspiration?: true }

/** An NPC's wounds in one word, from its health: Unhurt at full, Hurt above half, Bloodied at half or less. */
export const woundOf = (healthPercent: number | undefined): Wound => ((healthPercent ?? 100) >= 100 ? "Unhurt" : (healthPercent ?? 100) > 50 ? "Hurt" : "Bloodied")

/** How a character stands. A hero up and about needs their sheet for the numbers, and has none until it is read. */
export function standingOf(character: Bearer, sheet: SheetNumbers | null | undefined): Standing | undefined {
  if (isDead(character)) return { kind: "dead" }
  if (character.type !== "pc") return { kind: "wound", word: woundOf(character.healthPercent) }
  if (isDying(character)) return { kind: "dying", successes: character.deathSaves?.successes ?? 0, failures: character.deathSaves?.failures ?? 0 }
  if (isDown(character)) return { kind: "stable" }
  if (!sheet) return undefined
  const temporary = character.tempHitPoints ?? 0
  return {
    kind: "hero",
    hitPoints: sheet.hitPoints.current,
    maximum: sheet.hitPoints.maximum,
    armorClass: sheet.armorClass,
    ...(temporary > 0 ? { temporary } : {}),
    ...(sheet.heroicInspiration ? { inspired: true as const } : {}),
  }
}

/** A hero's hit points in short, with any Temporary Hit Points beside them: "9/13", "9/13 +5". */
export const hitPointsShort = (hero: { hitPoints: number; maximum: number; temporary?: number }) => `${hero.hitPoints}/${hero.maximum}${hero.temporary ? ` +${hero.temporary}` : ""}`

/** A standing in words, for screen readers and text. */
export function standingWords(standing: Standing): string {
  switch (standing.kind) {
    case "hero":
      return `${standing.hitPoints} of ${standing.maximum} Hit Points, ${standing.temporary ? `${standing.temporary} Temporary Hit Points, ` : ""}Armor Class ${standing.armorClass}${standing.inspired ? ", Heroic Inspiration" : ""}`
    case "dying":
      return `Dying, ${standing.successes} ${standing.successes === 1 ? "success" : "successes"} and ${standing.failures} ${standing.failures === 1 ? "failure" : "failures"}`
    case "stable":
      return "Stable"
    case "dead":
      return "Dead"
    case "wound":
      return standing.word
  }
}

// The colour of a wound word, as the health bar's: green, yellow, orange, and red for the dead.
export const WOUND_TONE = { Unhurt: "#7fb069", Hurt: "#d9b44a", Bloodied: "#d98a3a", Dead: "#c8452f" } as const

type Actor = ActorLike & { id: string; name: string; isComplete?: boolean }

/**
 * Why a character is passed over, in a word or two: Dead, Stable, Unconscious, or the conditions that leave them
 * Incapacitated. Nothing for one who can act, or a dying hero, whose turn is their Death Saving Throw.
 */
export function passReason(character: Actor): string | undefined {
  if (isDying(character)) return undefined
  if (isDead(character)) return "Dead"
  if (isDown(character)) return character.deathSaves?.stable ? "Stable" : "Unconscious"
  const words = (character.conditions ?? []).filter((entry) => isIncapacitated({ conditions: [entry] })).map((entry) => conditionWord(entry.id))
  return words.length ? words.join(", ") : undefined
}

/**
 * Who the turn passed over to reach the one whose turn it is: those just before them in initiative order who cannot
 * act, with why. The round's order is the one findCurrentActor reads.
 */
export function passedOver<T extends Actor>(characters: readonly T[], actor: T | undefined): { name: string; reason: string }[] {
  if (!actor) return []
  const order = characters.slice().sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
  const out: { name: string; reason: string }[] = []
  for (let i = order.findIndex((c) => c.id === actor.id) - 1; i >= 0; i--) {
    const reason = passReason(order[i])
    if (!reason) break
    out.unshift({ name: order[i].name, reason })
  }
  return out
}

/** Who was passed over, in words: "Thalbern, Stunned · Owlbear, Dead". */
export const passedWords = (passed: readonly { name: string; reason: string }[]) => passed.map((p) => `${p.name}, ${p.reason}`).join(" · ")
