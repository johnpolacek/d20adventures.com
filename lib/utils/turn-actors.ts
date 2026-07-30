// Whose-turn predicates shared by the client turn views and the server-side
// autonomous turn loop. Keep these pure (no "use server", no React) so both
// sides derive the current actor identically.

export type ActorLike = {
  type: string
  controlledBy?: "ai"
  hasReplied?: boolean
  isComplete?: boolean
  healthPercent?: number
  status?: string
  initiative?: number
}

// An AI-controlled companion: a PC the server plays automatically. Its userId
// is the adventure owner's, so ownership checks must use this predicate too.
export function isAiControlledPc(character: ActorLike): boolean {
  return character.type === "pc" && character.controlledBy === "ai"
}

export function isDeadActor(character: ActorLike): boolean {
  return character.healthPercent === 0 || character.status === "dead"
}

// Highest initiative, not complete, not dead.
export function findCurrentActor<T extends ActorLike>(characters: T[]): T | undefined {
  return characters
    .slice()
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
    .find((c) => !c.isComplete && !isDeadActor(c))
}

// True when the server should act for this character without human input.
// NPCs are pending until they reply; AI PCs are pending until their slot is
// complete — an AI PC that crashed mid-roll has hasReplied=true but still
// needs its roll resolved, so it must remain resumable.
export function hasPendingAutonomousAction(character: ActorLike): boolean {
  if (character.isComplete) return false
  if (character.type === "npc") return !character.hasReplied
  return isAiControlledPc(character)
}
