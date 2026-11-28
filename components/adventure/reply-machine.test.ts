import assert from "node:assert/strict"
import test from "node:test"
import { initialReplyPhase, replyReducer } from "./reply-machine"

test("replyReducer prevents simultaneous roll/loading, preserves errors in composing and awaitingRoll, and ignores stale chunks after submit", () => {
  let state = initialReplyPhase(false)
  assert.deepEqual(state, { kind: "composing", input: "", error: null })

  // Generate chunks then submit mid-generation -> late chunks are ignored
  state = replyReducer(state, { type: "generate_started" })
  state = replyReducer(state, { type: "generate_chunk", value: "She draws her dagger" })
  state = replyReducer(state, { type: "submit_started", mode: "reply" })
  assert.deepEqual(state, { kind: "submitting", input: "She draws her dagger", mode: "reply" })

  // Stale chunk arriving after submit must not overwrite submitting state
  state = replyReducer(state, { type: "generate_chunk", value: "stale chunk" })
  assert.equal(state.kind, "submitting")

  // Submit failure returns to composing with input intact and error visible
  state = replyReducer(state, { type: "submit_failed", error: "Network error" })
  assert.deepEqual(state, { kind: "composing", input: "She draws her dagger", error: "Network error" })

  // Server requests a roll -> transitions to awaitingRoll
  state = replyReducer(state, { type: "submit_started", mode: "reply" })
  state = replyReducer(state, { type: "submit_succeeded" })
  assert.equal(state.kind, "awaitingServer")

  state = replyReducer(state, { type: "sync_server", needsRoll: true })
  assert.equal(state.kind, "awaitingRoll")

  // Submitting roll moves to submittingRoll (mutually exclusive with awaitingRoll)
  state = replyReducer(state, { type: "roll_submit_started" })
  assert.equal(state.kind, "submittingRoll")

  // Failed roll submission returns to awaitingRoll WITH error visible
  state = replyReducer(state, { type: "roll_submit_failed", error: "Token limit reached" })
  assert.deepEqual(state, { kind: "awaitingRoll", input: "", error: "Token limit reached" })

  // Retry succeeds -> awaitingServer
  state = replyReducer(state, { type: "roll_submit_started" })
  state = replyReducer(state, { type: "roll_submit_succeeded" })
  assert.equal(state.kind, "awaitingServer")
})
