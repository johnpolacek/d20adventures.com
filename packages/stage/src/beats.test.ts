import assert from "node:assert/strict"
import { test } from "node:test"
import { BeatPlayer, type BeatStage } from "./beats"

function makeStage(): BeatStage & {
  shots: { which: unknown; instant?: boolean }[]
  said: { text: string }[]
  placed: { id: string; at: [number, number] }[]
} {
  const shots: { which: unknown; instant?: boolean }[] = []
  const said: { text: string }[] = []
  const placed: { id: string; at: [number, number] }[] = []
  const pos = new Map<string, { x: number; z: number; ry: number }>([["branka", { x: 0, z: 0, ry: 0 }]])
  return {
    activeShot: "opening",
    cast: [{ id: "branka" }] as never,
    loops: new Map() as never,
    shots,
    said,
    placed,
    castAt: (id) => ({ ...(pos.get(id) ?? { x: 0, z: 0, ry: 0 }), y: 0, height: 1.5 }) as never,
    faceCast: () => {},
    finishMoves: () => {},
    finishShot: () => {},
    moveCast: async (id, to) => {
      if (Array.isArray(to)) pos.set(id, { x: to[0], z: to[1], ry: 0 })
    },
    placeCast: (id, to) => {
      if (Array.isArray(to)) {
        pos.set(id, { x: to[0], z: to[1], ry: 0 })
        placed.push({ id, at: to as [number, number] })
      }
    },
    say: (opts) => {
      said.push({ text: opts.text })
      return 1
    },
    shot: (which, opts) => {
      shots.push({ which, instant: opts?.instant })
      return true
    },
    skipLoops: () => {},
    waitCue: async () => {},
  }
}

test("BeatPlayer re-entrant play() cancels the previous run even while awaiting async lineSeconds", async () => {
  const stage = makeStage()
  let resolveOldLine!: (n: number) => void
  const oldLinePromise = new Promise<number>((r) => {
    resolveOldLine = r
  })
  const narrated: number[] = []
  const player = new BeatPlayer(stage, {
    onNarrate: (n) => narrated.push(n),
    lineSeconds: (_id, text) => (text === "Old line" ? oldLinePromise : 0.001),
    narrationSeconds: () => 0,
  })

  // Start run 1; it pauses inside async lineSeconds("Old line").
  const run1 = player.play([{ line: "branka", text: "Old line" }, { narrate: 99 }])
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(player.playing, true)

  // Start run 2 before run 1 finishes -> run 1 must be cancelled cleanly.
  const run2 = player.play([{ narrate: 1 }])
  resolveOldLine(0.001)

  await Promise.all([run1, run2])
  assert.deepEqual(narrated, [1])
  assert.deepEqual(stage.said, [])
  assert.equal(player.playback.kind, "idle")
})

test("BeatPlayer step mode gates, setMode('auto') releases an active gate, and back() jumps cleanly", async () => {
  const stage = makeStage()
  const narrated: number[] = []
  const waitingEvents: boolean[] = []
  const player = new BeatPlayer(stage, {
    onNarrate: (n) => narrated.push(n),
    onWaiting: (w) => waitingEvents.push(w),
    narrationSeconds: () => 0,
  })
  player.setMode("step")

  const run = player.play([{ narrate: 0 }, { narrate: 1 }])
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(player.playback.kind, "atGate")
  assert.deepEqual(narrated, [0])
  assert.deepEqual(waitingEvents, [true])

  // Switching to auto mode while atGate releases the gate immediately and finishes.
  player.setMode("auto")
  await run
  assert.deepEqual(narrated, [0, 1])
  assert.deepEqual(waitingEvents, [true, false])
  assert.equal(player.playback.kind, "idle")
})

test("BeatPlayer next() and skip() transition through skipping and reach idle cleanly", async () => {
  const stage = makeStage()
  const narrated: number[] = []
  const player = new BeatPlayer(stage, {
    onNarrate: (n) => narrated.push(n),
    narrationSeconds: () => 10,
  })

  const run = player.play([{ narrate: 0 }, { wait: 10 }, { narrate: 1 }, { wait: 10 }, { narrate: 2 }])
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(narrated, [0])

  player.next()
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(narrated, [0, 1])

  player.skip()
  await run
  assert.deepEqual(narrated, [0, 1, 2])
  assert.equal(player.playback.kind, "idle")
})
