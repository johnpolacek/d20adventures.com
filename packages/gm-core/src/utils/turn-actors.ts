// Whose-turn predicates shared by the client turn views and the server-side
// autonomous turn loop. Keep these pure (no "use server", no React) so both
// sides derive the current actor identically.

// Types only: these run in the browser, and the roll schema pulls in the rules data.
import type { RollRequirement } from "../validations/roll-requirement-schema"

export type ActorLike = {
  type: string
  controlledBy?: "ai"
  hasReplied?: boolean
  isComplete?: boolean
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  spellEffects?: readonly { spell?: string; away?: true }[]
  conditions?: readonly { id: string }[]
  deathSaves?: { successes?: number; failures?: number; stable?: true }
  initiative?: number
  rollRequired?: RollRequirement
  // Whom a spell binds the character to act for (../types/character `master`).
  master?: { id: string }
}

// What the three tests below read. Dead, down and dying are three things.
type Standing = {
  type?: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  spellEffects?: readonly { spell?: string; away?: true }[]
  conditions?: readonly { id: string }[]
  deathSaves?: { successes?: number; failures?: number; stable?: true }
}

// An AI-controlled companion: a PC the server plays automatically. Its userId
// is the adventure owner's, so ownership checks must use this predicate too.
export function isAiControlledPc(character: ActorLike): boolean {
  return character.type === "pc" && character.controlledBy === "ai"
}

/**
 * A hero a spell has bound to act for another (Dominate Person): the server plays their turns, as it plays an AI
 * companion's, doing their master's bidding, until the spell ends. Their player is told so in the story.
 */
export function playsForMaster(character: ActorLike): boolean {
  return character.type === "pc" && !!character.master
}

/** Dead. It is not a condition: nothing ends it. */
export function isDead(character: Standing): boolean {
  return character.dead === true
}

/**
 * Not in the encounter: fled, gone for good, or away for now (`isAway`). Neither is a condition. Every rule of who is
 * here reads this. Only the end of a round reads `fled` alone, to let go of those who left for good.
 */
export function hasFled(character: Standing): boolean {
  return character.fled === true || isAway(character)
}

/** Away for now: a spell has taken them out of the encounter until it ends (Banishment, Maze), marked on its effect as `away`. They come back to the place they left. */
export function isAway(character: Standing): boolean {
  return !!character.spellEffects?.some((effect) => effect.away)
}

/** Down: at 0 hit points, so dead, dying or Stable. A character who is down cannot act or speak, and no one attacks them by choice. */
export function isDown(character: Standing): boolean {
  return isDead(character) || character.hitPoints === 0 || character.healthPercent === 0
}

/** Dying: a hero at 0 hit points who is neither dead nor Stable, and makes a Death Saving Throw on their turn. */
export function isDying(character: Standing): boolean {
  return character.type === "pc" && isDown(character) && !isDead(character) && !character.deathSaves?.stable
}

// The conditions that carry Incapacitated, by the SRD (../sheet/conditions has every condition's rules, and a test
// holds this list to them). Kept here as plain words so the browser needs none of the rules data.
const INCAPACITATING = new Set(["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"])

/** Incapacitated by a condition they bear: they take no action. One at 0 hit points is down, which is its own test. */
export function isIncapacitated(character: Standing): boolean {
  return !!character.conditions?.some((entry) => INCAPACITATING.has(entry.id))
}

/**
 * Takes a turn this round: anyone up and able to act, and a dying hero whose Death Saving Throw is asked for. A hero who
 * drops mid-round makes theirs next round. One away takes none: what their spell lets them do there, the engine does.
 */
export function takesTurn(character: ActorLike): boolean {
  if (isAway(character)) return false
  if (isDying(character)) return !!character.rollRequired && "deathSave" in character.rollRequired
  return !isDown(character) && !isIncapacitated(character)
}

// Highest initiative, not complete, and taking a turn: a dying hero stops on their save, and the Stable, the dead and the Incapacitated are skipped.
export function findCurrentActor<T extends ActorLike>(characters: T[]): T | undefined {
  return characters
    .slice()
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
    .find((c) => !c.isComplete && takesTurn(c))
}

// True when the server should act for this character without human input.
// NPCs are pending until they reply; AI PCs are pending until their slot is
// complete — an AI PC that crashed mid-roll has hasReplied=true but still
// needs its roll resolved, so it must remain resumable.
export function hasPendingAutonomousAction(character: ActorLike): boolean {
  if (character.isComplete) return false
  if (character.type === "npc") return !character.hasReplied
  return isAiControlledPc(character) || playsForMaster(character)
}
