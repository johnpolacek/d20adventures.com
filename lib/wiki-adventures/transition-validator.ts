import type { LlmGameplayContextPacket } from "./runtime-context"
import type { RuntimeTransition } from "./types"

export type TransitionValidationInput = {
  expectedContentHash: string
  expectedCurrentEncounterId: string
  liveCurrentEncounterId: string
  proposedNextEncounterId?: string
  liveContentHash: string
  legalTransitions: RuntimeTransition[]
  allowCurrentEncounter?: boolean
}

export type TransitionValidationResult =
  | {
      allowed: true
      kind: "continue" | "transition"
      nextEncounterId: string
      transition?: RuntimeTransition
    }
  | {
      allowed: false
      rejectedReason: "missing_target" | "stale_content" | "stale_encounter" | "illegal_target" | "unresolved_target"
      nextEncounterId: string
    }

export function validateRuntimeTransition(input: TransitionValidationInput): TransitionValidationResult {
  const proposed = input.proposedNextEncounterId ?? ""
  if (!proposed) return { allowed: false, rejectedReason: "missing_target", nextEncounterId: proposed }
  if (input.expectedContentHash !== input.liveContentHash) return { allowed: false, rejectedReason: "stale_content", nextEncounterId: proposed }
  if (input.expectedCurrentEncounterId !== input.liveCurrentEncounterId) return { allowed: false, rejectedReason: "stale_encounter", nextEncounterId: proposed }
  if ((input.allowCurrentEncounter ?? true) && proposed === input.liveCurrentEncounterId) {
    return { allowed: true, kind: "continue", nextEncounterId: proposed }
  }
  const transition = input.legalTransitions.find((entry) => entry.fromEncounterId === input.liveCurrentEncounterId && entry.toEncounterId === proposed)
  if (!transition) return { allowed: false, rejectedReason: "illegal_target", nextEncounterId: proposed }
  if (!transition.publishResolved) return { allowed: false, rejectedReason: "unresolved_target", nextEncounterId: proposed }
  return { allowed: true, kind: "transition", nextEncounterId: proposed, transition }
}

export function validatePacketTransition(packet: LlmGameplayContextPacket, proposedNextEncounterId?: string): TransitionValidationResult {
  return validateRuntimeTransition({
    expectedContentHash: packet.contentRef.contentHash,
    liveContentHash: packet.contentRef.contentHash,
    expectedCurrentEncounterId: packet.contentRef.currentEncounterId,
    liveCurrentEncounterId: packet.contentRef.currentEncounterId,
    proposedNextEncounterId,
    legalTransitions: packet.graph.legalTransitions,
  })
}
