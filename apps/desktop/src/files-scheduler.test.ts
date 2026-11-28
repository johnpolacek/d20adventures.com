import assert from "node:assert/strict"
import { test } from "node:test"
import { batchFiles, DownloadScheduler, type DownloadTransport, type FileEntry } from "./files-scheduler"

test("batchFiles splits files once cumulative bytes reach threshold", () => {
  const files: FileEntry[] = [
    { path: "a", bytes: 60 },
    { path: "b", bytes: 50 },
    { path: "c", bytes: 30 },
  ]
  const batches = batchFiles(files, 100)
  assert.deepEqual(
    batches.map((b) => b.map((f) => f.path)),
    [["a", "b"], ["c"]]
  )
})

test("foreground tasks preempt queued background tasks without polling", async () => {
  const scheduler = new DownloadScheduler()
  const order: string[] = []
  let releaseFirst!: () => void
  const firstHeld = new Promise<void>((r) => {
    releaseFirst = r
  })

  // Start a background task that is currently in-flight.
  const bg1 = scheduler.enqueue("background", async () => {
    order.push("bg1")
    await firstHeld
    return "bg1"
  })
  // Queue a second background task, then a foreground task.
  const bg2 = scheduler.enqueue("background", async () => {
    order.push("bg2")
    return "bg2"
  })
  const fg = scheduler.enqueue("foreground", async () => {
    order.push("fg")
    return "fg"
  })

  releaseFirst()
  await Promise.all([bg1, bg2, fg])
  assert.deepEqual(order, ["bg1", "fg", "bg2"])
})

test("aborting loadScene on encounter switch cancels remaining batches immediately", async () => {
  const scheduler = new DownloadScheduler()
  const fetched: string[][] = []
  let releaseBatch1!: () => void
  const batch1Held = new Promise<void>((r) => {
    releaseBatch1 = r
  })

  const transport: DownloadTransport = {
    plan: async () => ({
      need: [
        { path: "b1.glb", bytes: 100 },
        { path: "b2.glb", bytes: 100 },
        { path: "b3.glb", bytes: 100 },
      ],
      rest: [],
    }),
    fetch: async (_adv, files) => {
      fetched.push(files.map((f) => f.path))
      if (fetched.length === 1) await batch1Held
      return { done: files.map((f) => f.path), failed: [] }
    },
  }

  const ac = new AbortController()
  let readyCalls = 0
  const progressCalls: (number | null)[] = []

  const run = scheduler.loadScene({
    adventureId: "adv-1",
    encounterId: "enc-1",
    signal: ac.signal,
    transport,
    onProgress: (p) => progressCalls.push(p),
    onReady: () => {
      readyCalls++
    },
    showBarMs: 5000,
    batchBytes: 100,
  })

  // Wait for batch 1 to begin, then switch encounters (abort).
  await new Promise((r) => setTimeout(r, 10))
  ac.abort()
  releaseBatch1()

  const completed = await run
  assert.equal(completed, false)
  assert.deepEqual(fetched, [["b1.glb"]])
  assert.equal(readyCalls, 0)
  assert.deepEqual(progressCalls, [])
})

test("fillIn pauses while foreground loadScene runs and resumes immediately when foreground finishes", async () => {
  const scheduler = new DownloadScheduler()
  const order: string[] = []
  const remaining: FileEntry[] = [{ path: "bg-a.glb", bytes: 100 }]
  let releaseFg!: () => void
  const fgHeld = new Promise<void>((r) => {
    releaseFg = r
  })

  const transport: DownloadTransport = {
    plan: async (_adv, enc) =>
      enc
        ? { need: [{ path: "fg-a.glb", bytes: 100 }], rest: [] }
        : { need: [], rest: remaining.slice() },
    fetch: async (_adv, files) => {
      const name = files[0].path
      order.push(name)
      if (name === "fg-a.glb") await fgHeld
      if (name === "bg-a.glb") remaining.length = 0
      return { done: [name], failed: [] }
    },
  }

  const ac = new AbortController()
  const fg = scheduler.loadScene({
    adventureId: "adv-1",
    encounterId: "enc-1",
    signal: ac.signal,
    transport,
    onProgress: () => {},
    onReady: () => {},
    batchBytes: 100,
  })
  // Start background fillIn while foreground is active — must wait without polling.
  const bg = scheduler.fillIn("adv-1", transport, { batchBytes: 100 })

  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(order, ["fg-a.glb"])

  releaseFg()
  await Promise.all([fg, bg])
  assert.deepEqual(order, ["fg-a.glb", "bg-a.glb"])
})
