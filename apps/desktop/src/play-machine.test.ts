import assert from "node:assert/strict"
import { test } from "node:test"
import {
  CommandQueue,
  escapeUserRoute,
  HostedPollController,
  resolveAppRoute,
  type CommandQueueState,
} from "./play-machine"

test("resolveAppRoute enforces booting and gate over hosted/local_play routes", () => {
  assert.deepEqual(
    resolveAppRoute({ kind: "hosted", adventureId: "adv-1" }, { accountReady: false, gated: false, loaded: false }),
    { kind: "booting" }
  )
  // Gated account immediately preempts hosted play so host polling stops.
  assert.deepEqual(
    resolveAppRoute({ kind: "hosted", adventureId: "adv-1" }, { accountReady: true, gated: true, loaded: true }),
    { kind: "gate" }
  )
  assert.deepEqual(
    resolveAppRoute({ kind: "hosted", adventureId: "adv-1" }, { accountReady: true, gated: false, loaded: true }),
    { kind: "hosted", adventureId: "adv-1" }
  )
})

test("escapeUserRoute steps back cleanly from setup -> adventures -> home -> local_play", () => {
  assert.deepEqual(escapeUserRoute({ kind: "setup" }, true), { kind: "menu", page: "adventures" })
  assert.deepEqual(escapeUserRoute({ kind: "menu", page: "characters" }, true), { kind: "menu", page: "home" })
  assert.deepEqual(escapeUserRoute({ kind: "menu", page: "home" }, true), { kind: "local_play" })
  assert.equal(escapeUserRoute({ kind: "menu", page: "home" }, false), null)
  assert.equal(escapeUserRoute({ kind: "hosted", adventureId: "adv-1" }, true), null)
  assert.equal(escapeUserRoute({ kind: "gate" }, true), null)
})

test("CommandQueue serializes commands, drops duplicate shown clicks, and transitions phases cleanly", async () => {
  const states: CommandQueueState[] = []
  const order: string[] = []
  const queue = new CommandQueue((s) => states.push(s))

  let releaseWriting!: () => void
  const heldWriting = new Promise<void>((r) => {
    releaseWriting = r
  })

  const w = queue.run("writing", async () => {
    order.push("writing-start")
    await heldWriting
    order.push("writing-end")
    return "w"
  })
  const s1 = queue.run("shown", async () => {
    order.push("shown-1")
    return "s1"
  })
  // Duplicate shown while first shown is queued must be dropped immediately.
  const s2 = queue.run("shown", async () => {
    order.push("shown-2-should-drop")
    return "s2"
  })
  const q = queue.run("quiet", async () => {
    order.push("quiet")
    return "q"
  })

  assert.equal(await s2, undefined)
  assert.equal(queue.state.shown, true)

  releaseWriting()
  assert.deepEqual(await Promise.all([w, s1, q]), ["w", "s1", "q"])
  assert.deepEqual(order, ["writing-start", "writing-end", "shown-1", "quiet"])
  assert.deepEqual(queue.state, { phase: "idle", shown: false, writing: false })
  assert.ok(states.some((s) => s.phase === "shown"))
  assert.ok(states.some((s) => s.phase === "quiet"))
})

test("HostedPollController runs sequentially, aborts on stop, and discards polls superseded by a mutation", async () => {
  const controller = new HostedPollController<{ v: number }, string>()
  const applied: number[] = []
  let inFlight = 0
  let maxInFlight = 0
  let pollNum = 0
  let releasePoll1!: () => void
  const poll1Held = new Promise<void>((r) => {
    releasePoll1 = r
  })

  controller.start("adv-1", {
    intervalMs: 15,
    poll: async () => {
      const n = ++pollNum
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        if (n === 1) await poll1Held
        return { state: { v: n }, worker: `w-${n}` }
      } finally {
        inFlight--
      }
    },
    onState: (s) => applied.push(s.v),
    onWorker: () => {},
    onError: () => {},
  })

  // Wait for poll #1 to be in flight, then record a mutation (simulating act()).
  await new Promise((r) => setTimeout(r, 10))
  controller.beginMutation()
  applied.push(100)
  releasePoll1()

  // Wait for poll #2 to complete after poll #1 was discarded.
  await new Promise((r) => setTimeout(r, 40))
  controller.stop()
  const countAtStop = pollNum
  await new Promise((r) => setTimeout(r, 40))

  // Sequential: never more than 1 poll in flight at once.
  assert.equal(maxInFlight, 1)
  // Poll #1 was discarded because beginMutation() happened while it was in flight; poll #2 applied after 100.
  assert.equal(applied[0], 100)
  assert.ok(!applied.includes(1), "stale poll #1 must not overwrite mutation state")
  assert.ok(applied.includes(2), "fresh poll #2 after mutation should apply")
  // Stopped loop does not fire further polls.
  assert.equal(pollNum, countAtStop)
})
