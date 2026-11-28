import assert from "node:assert/strict"
import { test } from "node:test"
import {
  heldRollOf,
  initialPlaybackState,
  isPausedOf,
  isReadingOf,
  isStorySynced,
  levellingHeroIdOf,
  playbackReducer,
  prowlingKeyOf,
  viewingTurnIdOf,
  type HeldRoll,
} from "./playback-machine"

const sampleRoll = (turnId = "t1"): HeldRoll => ({
  turnId,
  actor: { id: "branka", name: "Branka", role: "Dwarf Fighter" },
  roll: { kind: "check", skill: "Athletics", dc: 12, modifier: 3 },
  dice: [14],
  at: 1000,
  fromBeatCount: 2,
})

test("SYNC_STORY transitions from initial state into reading or interactive depending on paragraph count", () => {
  let s = initialPlaybackState("adv-1")
  assert.equal(isStorySynced(s.seen, "t1", ["Opening"]), false)

  // Empty turn goes straight to interactive with synced snapshot.
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: [], isPast: false, rollBeatIndex: -1 })
  assert.equal(s.phase, "interactive")
  assert.equal(s.onScreenTurnId, "t1")
  assert.equal(isStorySynced(s.seen, "t1", []), true)

  // Arriving narration starts reading at index 0.
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: ["First.", "Second."], isPast: false, rollBeatIndex: -1 })
  assert.equal(s.phase, "reading")
  assert.equal(s.paragraph, 0)
  assert.equal(isStorySynced(s.seen, "t1", ["First.", "Second."]), true)
})

test("appended narration while reading an earlier paragraph preserves cursor, pause, and prowling", () => {
  let s = initialPlaybackState("adv-1")
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: ["P0", "P1"], isPast: false, rollBeatIndex: -1 })
  s = playbackReducer(s, { type: "SET_PAUSED", paused: true })
  s = playbackReducer(s, { type: "SET_PROWLING", key: "owlbear:0" })

  // New paragraph arrives at index 2 while reader is on index 0.
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: ["P0", "P1", "P2"], isPast: false, rollBeatIndex: -1 })
  assert.equal(s.phase, "reading")
  assert.equal(s.paragraph, 0)
  assert.equal(isPausedOf(s), true)
  assert.equal(prowlingKeyOf(s), "owlbear:0")

  // Advancing clears prowling and eventually transitions to interactive (dropping pause).
  s = playbackReducer(s, { type: "ADVANCE", paragraphCount: 3 })
  assert.equal(s.phase, "reading")
  assert.equal(s.paragraph, 1)
  assert.equal(prowlingKeyOf(s), null)

  s = playbackReducer(s, { type: "ADVANCE", paragraphCount: 3 })
  s = playbackReducer(s, { type: "ADVANCE", paragraphCount: 3 })
  assert.equal(s.phase, "interactive")
  assert.equal(isPausedOf(s), false)

  // Appended narration arriving while interactive starts reading at the first new paragraph (index 3).
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: ["P0", "P1", "P2", "P3"], isPast: false, rollBeatIndex: -1 })
  assert.equal(s.phase, "reading")
  assert.equal(s.paragraph, 3)
})

test("roll lifecycle: interactive -> roll_resolving -> roll_verdict -> reading / interactive", () => {
  let s = initialPlaybackState("adv-1")
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: ["Intro", "Attempt"], isPast: false, rollBeatIndex: -1 })
  s = playbackReducer(s, { type: "SKIP_READING" })
  assert.equal(s.phase, "interactive")

  // Start roll -> roll_resolving
  const roll = sampleRoll("t1")
  s = playbackReducer(s, { type: "START_ROLL", roll })
  assert.equal(s.phase, "roll_resolving")
  assert.equal(heldRollOf(s), roll)

  // Rejected roll returns to interactive and increments rollTries.
  const rejected = playbackReducer(s, { type: "ROLL_REJECTED" })
  assert.equal(rejected.phase, "interactive")
  assert.equal(rejected.rollTries, 1)
  assert.equal(heldRollOf(rejected), null)

  // Verdict arrives: roll beat is at index 2, outcome narrative at index 3.
  s = playbackReducer(s, {
    type: "SYNC_STORY",
    adventureId: "adv-1",
    turnId: "t1",
    paragraphs: ["Intro", "Attempt", "Branka rolls 17.", "The gate swings open."],
    isPast: false,
    rollBeatIndex: 2,
  })
  assert.equal(s.phase, "roll_verdict")
  assert.equal(s.phase === "roll_verdict" && s.resumeParagraph, 3)
  assert.equal(isReadingOf(s), false)

  // Leaving the roll card enters reading at paragraph 3 (after the roll beat) and bumps rollTries.
  const left = playbackReducer(s, { type: "LEAVE_ROLL", paragraphCount: 4 })
  assert.equal(left.phase, "reading")
  assert.equal(left.paragraph, 3)
  assert.equal(left.rollTries, 1)
  assert.equal(heldRollOf(left), null)

  // If no paragraphs followed the roll beat, LEAVE_ROLL enters interactive directly.
  const leftEmpty = playbackReducer(s, { type: "LEAVE_ROLL", paragraphCount: 3 })
  assert.equal(leftEmpty.phase, "interactive")
  assert.equal(leftEmpty.rollTries, 1)
})

test("GO_TO_ROUND and RETURN_TO_LIVE navigate past rounds and restore exact live cursor", () => {
  let s = initialPlaybackState("adv-1")
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t2", paragraphs: ["R2-0", "R2-1"], isPast: false, rollBeatIndex: -1 })
  s = playbackReducer(s, { type: "SKIP_READING" })
  assert.equal(s.phase, "interactive")

  // Step back to past round t1 at its end.
  s = playbackReducer(s, {
    type: "GO_TO_ROUND",
    targetTurnId: "t1",
    targetParagraphs: ["R1-0", "R1-1", "R1-2"],
    where: "end",
    liveTurnId: "t2",
    liveParagraphCount: 2,
  })
  assert.equal(s.phase, "reading")
  assert.equal(s.paragraph, 2)
  assert.equal(viewingTurnIdOf(s), "t1")
  assert.equal(isStorySynced(s.seen, "t1", ["R1-0", "R1-1", "R1-2"]), true)

  // Advancing past the end of a past round does not silently drop into interactive.
  const afterAdvance = playbackReducer(s, { type: "ADVANCE", paragraphCount: 3 })
  assert.equal(afterAdvance.phase, "reading")
  assert.equal(afterAdvance.paragraph, 2)

  // Returning to live when nothing changed restores interactive.
  const backSame = playbackReducer(s, { type: "RETURN_TO_LIVE", liveTurnId: "t2", liveParagraphs: ["R2-0", "R2-1"] })
  assert.equal(backSame.phase, "interactive")
  assert.equal(viewingTurnIdOf(backSame), null)

  // Returning to live when a new paragraph arrived starts reading at the new paragraph.
  const backNew = playbackReducer(s, { type: "RETURN_TO_LIVE", liveTurnId: "t2", liveParagraphs: ["R2-0", "R2-1", "R2-2"] })
  assert.equal(backNew.phase, "reading")
  assert.equal(backNew.paragraph, 2)
  assert.equal(viewingTurnIdOf(backNew), null)
})

test("levelling phase opens/closes cleanly, defers per turn, and resets on adventure change", () => {
  let s = initialPlaybackState("adv-1")
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: [], isPast: false, rollBeatIndex: -1 })

  s = playbackReducer(s, { type: "DEFER_LEVEL", turnId: "t1" })
  assert.equal(s.levelDeferredTurnId, "t1")

  s = playbackReducer(s, { type: "OPEN_LEVEL", turnId: "t1", heroId: "branka" })
  assert.equal(s.phase, "levelling")
  assert.equal(levellingHeroIdOf(s), "branka")

  // Story sync while levelling updates seen without closing the level-up modal.
  s = playbackReducer(s, { type: "SYNC_STORY", adventureId: "adv-1", turnId: "t1", paragraphs: ["Updated"], isPast: false, rollBeatIndex: -1 })
  assert.equal(s.phase, "levelling")
  assert.equal(isStorySynced(s.seen, "t1", ["Updated"]), true)

  s = playbackReducer(s, { type: "CLOSE_LEVEL" })
  assert.equal(s.phase, "interactive")
  assert.equal(levellingHeroIdOf(s), null)

  // Switching adventures resets everything.
  s = playbackReducer(s, { type: "MARK_CONTINUED", key: "t1:npc" })
  s = playbackReducer(s, { type: "RESET_ADVENTURE", adventureId: "adv-2" })
  assert.equal(s.adventureId, "adv-2")
  assert.equal(s.levelDeferredTurnId, null)
  assert.equal(s.continuedKey, null)
  assert.equal(s.onScreenTurnId, null)
})
