// Pure, zero-import turn-slot state machine: safe in browser bundles, Node, and Convex (ES2021).

/** The four persisted turn-slot flags on a character in play. */
export type TurnSlotFlags<R = unknown> = {
  hasReplied?: boolean
  isComplete?: boolean
  rollRequired?: R
  rollResult?: number
}

/**
 * A character's turn-slot state within a single round (lossless over today's four persisted flags):
 * - `pending`: has not acted yet this round
 * - `awaiting_roll`: waiting on a required roll (action check/attack/cast, follow-up roll, or round-start Death Saving Throw)
 * - `complete`: done with this round (acted without a roll, resolved their roll, or skipped/down/incapacitated/fled)
 */
export type TurnSlot<R = unknown> =
  | { phase: "pending" }
  | { phase: "awaiting_roll"; required: NonNullable<R> }
  | { phase: "complete"; rollResult?: number }

export type TurnSlotEvent<R = unknown> =
  | { type: "reset" }
  | { type: "reply"; required?: R }
  | { type: "require_roll"; required: NonNullable<R> }
  | { type: "resolve_roll"; total: number; next?: R }
  | { type: "complete" }

/** Derive the explicit TurnSlot from a character's persisted flags. */
export function slotOf<R>(character: TurnSlotFlags<R>): TurnSlot<NonNullable<R>> {
  if (character.isComplete) {
    return typeof character.rollResult === "number" ? { phase: "complete", rollResult: character.rollResult } : { phase: "complete" }
  }
  if (character.rollRequired != null && typeof character.rollResult !== "number") {
    return { phase: "awaiting_roll", required: character.rollRequired as NonNullable<R> }
  }
  return { phase: "pending" }
}

/** Convert an explicit TurnSlot back to the persisted flag fields. */
export function slotFlags(slot: { phase: "pending" }): { hasReplied: false; isComplete: false }
export function slotFlags<R>(slot: { phase: "awaiting_roll"; required: NonNullable<R> }): { hasReplied: true; isComplete: false; rollRequired: NonNullable<R> }
export function slotFlags(slot: { phase: "complete"; rollResult?: number }): { hasReplied: true; isComplete: true; rollResult?: number }
export function slotFlags<R>(slot: TurnSlot<R>): TurnSlotFlags<NonNullable<R>>
export function slotFlags<R>(slot: TurnSlot<R>): TurnSlotFlags<NonNullable<R>> {
  switch (slot.phase) {
    case "pending":
      return { hasReplied: false, isComplete: false }
    case "awaiting_roll":
      return { hasReplied: true, isComplete: false, rollRequired: slot.required }
    case "complete":
      return slot.rollResult === undefined
        ? { hasReplied: true, isComplete: true }
        : { hasReplied: true, isComplete: true, rollResult: slot.rollResult }
  }
}

/** Return a copy of `character` with its turn-slot flags replaced by `slot`. */
export function withSlot<T extends TurnSlotFlags>(character: T, slot: TurnSlot): T {
  const { rollRequired: _rollRequired, rollResult: _rollResult, ...rest } = character
  return { ...rest, ...slotFlags(slot) } as T
}

/** Apply a guarded turn-slot transition, throwing on invalid phase transitions. */
export function transitionTurnSlot<R>(slot: TurnSlot<R>, event: TurnSlotEvent<R>): TurnSlot<NonNullable<R>> {
  switch (event.type) {
    case "reset":
      return { phase: "pending" }
    case "require_roll":
      return { phase: "awaiting_roll", required: event.required }
    case "complete":
      return { phase: "complete" }
    case "reply":
      if (slot.phase !== "pending") {
        throw new Error("This character already acted or is unavailable.")
      }
      return event.required != null ? { phase: "awaiting_roll", required: event.required as NonNullable<R> } : { phase: "complete" }
    case "resolve_roll":
      if (slot.phase !== "awaiting_roll") {
        throw new Error(slot.phase === "complete" ? "Roll already completed" : "No roll required for this character")
      }
      return event.next != null ? { phase: "awaiting_roll", required: event.next as NonNullable<R> } : { phase: "complete", rollResult: event.total }
  }
}

/** Convenience helper: read `slotOf(character)`, transition it, and write the flags back. */
export function applySlotEvent<T extends TurnSlotFlags>(character: T, event: TurnSlotEvent): T {
  return withSlot(character, transitionTurnSlot(slotOf(character), event))
}
