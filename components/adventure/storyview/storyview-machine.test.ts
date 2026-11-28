import assert from "node:assert/strict"
import test from "node:test"
import type { TurnAudioSegmentWithUrl } from "@/types/turn-audio"
import { MAX_POLL_ATTEMPTS, storyviewReducer, type StoryviewState } from "./storyview-machine"

const mockSegment = (partIndex: number): TurnAudioSegmentWithUrl =>
  ({
    partIndex,
    speaker: "narrator",
    text: "The cavern echoes.",
    audioUrl: "https://example.com/a.mp3",
  }) as unknown as TurnAudioSegmentWithUrl

test("storyviewReducer enters playing directly on MANIFEST_READY and advances slides cleanly", () => {
  let state: StoryviewState = { kind: "closed" }
  state = storyviewReducer(state, { type: "OPEN" })
  assert.equal(state.kind, "fetching")

  state = storyviewReducer(state, { type: "MANIFEST_READY", segments: [mockSegment(0), mockSegment(1)] })
  assert.equal(state.kind, "ready")
  assert.deepEqual(state.playback, { kind: "playing", slideIndex: 0, segmentIndex: 0 })

  // Slide 0 has 2 segments, slide 1 has 0 (dice slide)
  state = storyviewReducer(state, { type: "ADVANCE", slideSegmentCounts: [2, 0] })
  assert.equal(state.kind, "ready")
  assert.deepEqual(state.playback, { kind: "playing", slideIndex: 0, segmentIndex: 1 })

  state = storyviewReducer(state, { type: "ADVANCE", slideSegmentCounts: [2, 0] })
  assert.equal(state.kind, "ready")
  assert.deepEqual(state.playback, { kind: "playing", slideIndex: 1, segmentIndex: 0 })

  state = storyviewReducer(state, { type: "ADVANCE", slideSegmentCounts: [2, 0] })
  assert.equal(state.kind, "ready")
  assert.equal(state.playback.kind, "finished")

  // Replaying from finished restarts at slide 0
  state = storyviewReducer(state, { type: "PLAY" })
  assert.equal(state.kind, "ready")
  assert.deepEqual(state.playback, { kind: "playing", slideIndex: 0, segmentIndex: 0 })
})

test("storyviewReducer bounds poll attempts and fails cleanly on timeout", () => {
  let state: StoryviewState = { kind: "fetching" }
  state = storyviewReducer(state, { type: "GENERATING" })
  assert.equal(state.kind, "generating")

  for (let i = 0; i < MAX_POLL_ATTEMPTS - 1; i++) {
    state = storyviewReducer(state, { type: "POLL_TICK" })
    assert.equal(state.kind, "generating")
  }
  state = storyviewReducer(state, { type: "POLL_TICK" })
  assert.equal(state.kind, "error")
  assert.match(state.message, /timed out/i)
})
