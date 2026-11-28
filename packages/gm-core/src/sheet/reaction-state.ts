// Pure, zero-import reaction suspend/replay state machine: safe in browser, Node, and Convex.

export type ReactionPhase = "idle" | "offered" | "answered" | "expired"

export type ReactionGuardResult =
  | { ok: true }
  | { ok: false; reason: "none" | "wrong_character" | "already_answered" | "expired" }

/** Derive the explicit reaction phase, accepting both tagged (`status`) and legacy untagged reaction docs. */
export function reactionPhaseOf(
  reaction: { answer?: boolean; expiresAt: number; status?: "offered" | "answered" } | null | undefined,
  now = Date.now()
): ReactionPhase {
  if (!reaction) return "idle"
  if (reaction.status === "answered" || reaction.answer !== undefined) return "answered"
  return now < reaction.expiresAt ? "offered" : "expired"
}

/** Whether the round is currently paused waiting on a player's answer to this reaction offer. */
export function isReactionWaiting(
  reaction: { answer?: boolean; expiresAt: number; status?: "offered" | "answered" } | null | undefined,
  now = Date.now()
): boolean {
  return reactionPhaseOf(reaction, now) === "offered"
}

/**
 * Shared guard for answering a pending reaction (used by gm-core `answerReaction`,
 * hosted `queueAction`, and desktop host worker). Rejects missing, wrong-character,
 * already-answered, and expired offers.
 */
export function canAnswerReaction(
  reaction: { offer?: { to?: string }; answer?: boolean; expiresAt?: number; status?: "offered" | "answered" } | null | undefined,
  characterId: string,
  now = Date.now()
): ReactionGuardResult {
  if (!reaction || !reaction.offer) return { ok: false, reason: "none" }
  if (reaction.offer.to !== characterId) return { ok: false, reason: "wrong_character" }
  if (reaction.status === "answered" || reaction.answer !== undefined) return { ok: false, reason: "already_answered" }
  if (typeof reaction.expiresAt === "number" && now >= reaction.expiresAt) return { ok: false, reason: "expired" }
  return { ok: true }
}

export function reactionGuardMessage(reason: Exclude<ReactionGuardResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "expired":
      return "This reaction offer has expired."
    case "already_answered":
      return "This reaction has already been answered."
    case "none":
    case "wrong_character":
      return "No reaction is offered to this character."
  }
}

/** Guarded transition `offered -> answered`, stamping `status: "answered"` and `answer: take`. */
export function answerPendingReaction<T extends { offer: { to: string }; expiresAt: number; answer?: boolean; status?: "offered" | "answered" }>(
  reaction: T | null | undefined,
  characterId: string,
  take: boolean,
  now = Date.now()
): Omit<T, "status" | "answer"> & { status: "answered"; answer: boolean } {
  const check = canAnswerReaction(reaction, characterId, now)
  if (!check.ok) throw new Error(reactionGuardMessage(check.reason))
  return { ...(reaction as T), status: "answered", answer: take }
}
