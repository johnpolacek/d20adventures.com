import assert from "node:assert/strict"
import { test } from "node:test"
import {
  ABANDONED_MS,
  hasAllArtKinds,
  isArtKind,
  missingArtKinds,
  recordUploadedArt,
  selectNextJob,
  type SchedulableJob,
} from "@d20/gm-core/host/jobs"

const job = (id: string, kind: SchedulableJob["kind"], createdAt = 1000, startedAt?: number): SchedulableJob => ({
  _id: id,
  kind,
  createdAt,
  ...(startedAt !== undefined ? { startedAt } : {}),
})

test("selectNextJob enforces 3 priority lanes: actions > suggest > paint", () => {
  const now = 5000
  const paint = job("p1", "paint", 100)
  const suggest = job("s1", "suggest", 200)
  const reply = job("r1", "reply", 300)
  const react = job("rx1", "react", 400)

  assert.equal(selectNextJob([], [paint, suggest, reply, react], now).next?._id, "r1")
  assert.equal(selectNextJob([], [paint, suggest], now).next?._id, "s1")
  assert.equal(selectNextJob([], [paint], now).next?._id, "p1")
  assert.equal(selectNextJob([], [], now).next, null)
})

test("selectNextJob allows at most 1 non-paint job and 1 paint job concurrently", () => {
  const now = 5000
  const runningAction = job("r0", "reply", 1000, 4000)
  const runningPaint = job("p0", "paint", 1000, 4000)
  const queuedAction = job("r1", "continue", 2000)
  const queuedSuggest = job("s1", "suggest", 2100)
  const queuedPaint = job("p1", "paint", 2200)

  // A running non-paint job blocks everything, including paint.
  assert.equal(selectNextJob([runningAction], [queuedAction, queuedSuggest, queuedPaint], now).next, null)

  // A running paint job allows actions and suggestions, but blocks a second paint job.
  assert.equal(selectNextJob([runningPaint], [queuedPaint, queuedSuggest, queuedAction], now).next?._id, "r1")
  assert.equal(selectNextJob([runningPaint], [queuedPaint, queuedSuggest], now).next?._id, "s1")
  assert.equal(selectNextJob([runningPaint], [queuedPaint], now).next, null)
})

test("selectNextJob marks running jobs >= ABANDONED_MS old as abandoned and unblocks the queue", () => {
  const start = 10_000
  const runningAction = job("r0", "reply", start - 500, start)
  const runningPaint = job("p0", "paint", start - 500, start)
  const queuedPaint = job("p1", "paint", start + 1000)

  // 1ms before timeout: still running.
  const almost = selectNextJob([runningAction], [queuedPaint], start + ABANDONED_MS - 1)
  assert.deepEqual(almost.abandoned, [])
  assert.equal(almost.next, null)

  // At exact timeout: abandoned and unblocks next job.
  const timedOut = selectNextJob([runningAction, runningPaint], [queuedPaint], start + ABANDONED_MS)
  assert.deepEqual(
    timedOut.abandoned.map((j) => j._id),
    ["r0", "p0"]
  )
  assert.equal(timedOut.next?._id, "p1")
})

test("paint art upload tracking requires front, back, and portrait before completing", () => {
  assert.equal(isArtKind("front"), true)
  assert.equal(isArtKind("side"), false)
  assert.equal(hasAllArtKinds(undefined), false)
  assert.deepEqual(missingArtKinds(undefined), ["front", "back", "portrait"])

  let uploaded = recordUploadedArt(undefined, "front")
  uploaded = recordUploadedArt(uploaded, "front")
  assert.deepEqual(uploaded, ["front"])
  assert.equal(hasAllArtKinds(uploaded), false)

  uploaded = recordUploadedArt(uploaded, "back")
  assert.deepEqual(missingArtKinds(uploaded), ["portrait"])
  assert.equal(hasAllArtKinds(uploaded), false)

  uploaded = recordUploadedArt(uploaded, "portrait")
  assert.deepEqual(missingArtKinds(uploaded), [])
  assert.equal(hasAllArtKinds(uploaded), true)
})
