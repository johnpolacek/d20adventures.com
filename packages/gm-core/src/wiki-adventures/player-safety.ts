import type { ConditionEntry } from "../sheet/condition-entry"
import { revived } from "../sheet/death"
import type { Sheet } from "../sheet/sheet"
import { isDead, isDown } from "../utils/turn-actors"
import type { RuntimeArtifacts, RuntimeManifest, RuntimeTransition } from "./types"

// Authored adventure rules the core enforces itself, because the model cannot be trusted to judge them:
// `playerDeath: false` leaves a hero who would die Stable at 0 hit points instead (../sheet/death), and `rescue`
// moves a party with a hero down to a rescue encounter.
export type SafetyRules = Pick<RuntimeManifest, "playerDeath" | "premise">
type Health = {
  type: string
  name?: string
  sheet?: Sheet
  hitPoints?: number
  healthPercent?: number
  dead?: true
  conditions?: readonly ConditionEntry[]
  isComplete?: boolean
  deathSaves?: { successes: number; failures: number; stable?: true }
}

const NO_DEATH_NOTE = "Player characters cannot die in this adventure. One who falls to 0 hit points is unconscious and out of the fight, and lives. Never describe a player character as dead."

// A trinket seller gave the Black Market's location in a scene whose notes make it atmosphere only, and Thaddeus
// confessed to a murder no note let him confess.
const NOTES_BIND =
  "These GM notes bind every outcome. What they say does not happen, or that no one knows, says or gives, holds. No one gives a clue, location, secret, confession or reveal the notes and the story so far do not provide."

/**
 * The adventure's premise as a prompt block, or nothing. The story's own text cannot be trusted to carry it: the
 * narrator names every hero, so a hero nobody had met was greeted by name.
 */
export function premiseNote(premise?: string): string {
  return premise?.trim() ? `ADVENTURE PREMISE (true when the adventure starts, and it holds until the story shows it change):\n${premise.trim()}` : ""
}

/**
 * Adds the adventure's standing rules to an encounter's GM notes: that the notes bind, the premise, and that player
 * death is off, so the GM's prose does not kill a character the rules keep alive.
 */
export function gmNotesWithRules(rules: SafetyRules | undefined, gmNotes?: string): string | undefined {
  const added = [gmNotes?.trim() ? NOTES_BIND : "", rules?.playerDeath === false ? NO_DEATH_NOTE : "", premiseNote(rules?.premise)].filter(Boolean)
  return added.length ? [gmNotes, ...added].filter(Boolean).join("\n\n") : gmNotes
}

/**
 * The rescue transition to take now: the adventure has a rescue it has not played yet, the current encounter authors
 * a transition to it, and a hero is at 0 hit points and not dead. The model never sees this transition.
 */
export function pendingRescue(args: {
  artifacts: Pick<RuntimeArtifacts, "manifest" | "graph">
  encounterId: string
  characters: Health[]
  playedEncounterIds: string[]
}): RuntimeTransition | undefined {
  const rescue = args.artifacts.manifest.rescue
  if (!rescue || args.encounterId === rescue.encounterId || args.playedEncounterIds.includes(rescue.encounterId)) return undefined
  if (!args.characters.some((c) => c.type === "pc" && isDown(c) && !isDead(c))) return undefined
  return args.artifacts.graph.encounterTransitions.find((t) => t.fromEncounterId === args.encounterId && t.toEncounterId === rescue.encounterId && t.publishResolved)
}

/** The party as the rescue reaches it: every hero at 0 hit points and not dead is back at 1 hit point, conscious. */
export function rescuedCharacters<T extends Health>(characters: T[]): T[] {
  return characters.map((c) => (c.type === "pc" && isDown(c) && !isDead(c) ? revived(c, 1) : c))
}
