import assert from "node:assert/strict"
import test from "node:test"
import { answerPendingReaction, canAnswerReaction, isReactionWaiting, reactionPhaseOf } from "../../src/sheet/reaction-state"
import type { PendingReaction } from "../../src/sheet/reactions"

const baseOffer = {
  id: "opportunity-attack" as const,
  to: "lyra",
  from: "reinhard",
  matters: true,
}

const makeReaction = (overrides: Partial<PendingReaction> = {}): PendingReaction =>
  ({
    offer: baseOffer,
    text: "Reinhard leaves Lyra's reach.",
    expiresAt: 10_000,
    npc: "reinhard",
    resume: { action: null, reading: null, dice: [], answers: [] },
    ...overrides,
  }) as PendingReaction

test("reactionPhaseOf handles idle, legacy untagged, tagged, answered, and expired offers", () => {
  assert.equal(reactionPhaseOf(undefined, 5_000), "idle")
  assert.equal(reactionPhaseOf(null, 5_000), "idle")

  // Legacy untagged offered doc
  const untagged = makeReaction()
  assert.equal(reactionPhaseOf(untagged, 5_000), "offered")
  assert.equal(isReactionWaiting(untagged, 5_000), true)
  assert.equal(reactionPhaseOf(untagged, 10_000), "expired")
  assert.equal(isReactionWaiting(untagged, 10_000), false)

  // Tagged offered doc
  const tagged = makeReaction({ status: "offered" })
  assert.equal(reactionPhaseOf(tagged, 5_000), "offered")
  assert.equal(reactionPhaseOf(tagged, 12_000), "expired")

  // Legacy untagged answered doc stays answered even past expiresAt
  const legacyAnswered = makeReaction({ answer: true })
  assert.equal(reactionPhaseOf(legacyAnswered, 20_000), "answered")
  assert.equal(isReactionWaiting(legacyAnswered, 5_000), false)

  // Tagged answered doc
  const taggedAnswered = makeReaction({ status: "answered", answer: false })
  assert.equal(reactionPhaseOf(taggedAnswered, 5_000), "answered")
})

test("canAnswerReaction and answerPendingReaction reject wrong character, double answers, and expired offers", () => {
  const offered = makeReaction({ status: "offered", expiresAt: 10_000 })

  assert.deepEqual(canAnswerReaction(undefined, "lyra", 5_000), { ok: false, reason: "none" })
  assert.deepEqual(canAnswerReaction(offered, "silas", 5_000), { ok: false, reason: "wrong_character" })
  assert.deepEqual(canAnswerReaction(offered, "lyra", 10_000), { ok: false, reason: "expired" })
  assert.deepEqual(canAnswerReaction(offered, "lyra", 5_000), { ok: true })

  const answered = answerPendingReaction(offered, "lyra", true, 5_000)
  assert.equal(answered.status, "answered")
  assert.equal(answered.answer, true)

  // Double-answer is rejected even before expiry
  assert.deepEqual(canAnswerReaction(answered, "lyra", 5_000), { ok: false, reason: "already_answered" })
  assert.throws(() => answerPendingReaction(answered, "lyra", false, 5_000), /already been answered/)

  // Late answer after expiry is rejected
  assert.throws(() => answerPendingReaction(offered, "lyra", true, 10_000), /expired/)
  // Wrong character is rejected
  assert.throws(() => answerPendingReaction(offered, "silas", true, 5_000), /No reaction is offered/)
})
