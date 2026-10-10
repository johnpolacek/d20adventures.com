import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { game, type Packs } from "./game"
import { type HostEvent, type HostJob, type HostPost, hostLoop, remoteStore } from "./host"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}

const failLlm: Llm = {
  generateText: async () => {
    throw new Error("offline")
  },
  generateObject: async () => {
    throw new Error("offline")
  },
}

// A hosted game stands in for the website: a local save as the store, and a job queue the loop drains.
async function hosted() {
  const dir = mkdtempSync(join(tmpdir(), "d20-host-test-"))
  const store = new LocalStore(join(dir, "save.sqlite"), packs["march-of-davos"].artifacts.graph.encounterTransitions)
  await game(store, packs, failLlm)({ kind: "start", provider: "claude" })
  const turn = store.current()
  const pc = turn.characters.find((c) => c.type === "pc")!
  // The guest acts first, and the rest of the round is done.
  for (const c of turn.characters) {
    c.isComplete = c.id !== pc.id
    c.initiative = c.id === pc.id ? 20 : 0
    if (c.type === "pc") c.userId = c.id === pc.id ? "guest" : "host"
  }
  Object.assign(store.state!.adventure, { ownerId: "host", playerIds: ["host", "guest"] })
  store.save()
  return {
    store,
    turn,
    pc,
    adventureId: store.state!.adventure._id,
    cleanup: () => {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

async function drain(store: LocalStore, jobs: HostJob[], llm: Llm) {
  const finished: { jobId: string; error?: string }[] = []
  const events: HostEvent[] = []
  const post: HostPost = async (path, body) => {
    const b = body as { op: string; jobId: string; error?: string }
    assert.match(path, /^\/api\/desktop\/host\/[^/]+\/jobs$/)
    if (b.op === "claim") return { job: jobs.shift() ?? null }
    finished.push({ jobId: b.jobId, error: b.error })
    return { ok: true }
  }
  let stop = false
  await hostLoop({ adventureId: store.state!.adventure._id, post, store, packs, llm, emit: (e) => events.push(e), stopped: () => stop, wait: async () => void (stop = true) })
  return { finished, events }
}

const job = (base: Omit<HostJob, "_id">, id = "job-1"): HostJob => ({ _id: id, ...base })

test("a guest's reply and roll run through the host's GM and finish their jobs", async () => {
  const { store, turn, pc, adventureId, cleanup } = await hosted()
  try {
    const model: Llm = {
      generateText: async () => ({ text: `${pc.name} argues for a lower gate fee.` }),
      generateObject: async ({ schema, prompt }) => ({ object: schema.parse(prompt.includes("situational") ? { modifier: 0 } : { rollRequired: true, rollType: "Persuasion", difficulty: 12 }) }),
    }
    const reply = job({ adventureId, turnId: turn._id, kind: "reply", userId: "guest", characterId: pc.id, text: "I bargain with the guard." })
    const first = await drain(store, [reply], model)
    assert.deepEqual(first.finished, [{ jobId: "job-1", error: undefined }])
    assert.deepEqual(
      first.events.map((e) => e.type),
      ["working", "done", "idle"]
    )
    const replied = store.current().characters.find((c) => c.id === pc.id)!
    assert.equal(replied.hasReplied, true)
    assert.match(store.current().narrative, /\[OriginalReply: I bargain with the guard\.\]/)
    assert.ok(replied.rollRequired, "the model asked for a roll")
    const roll = job({ adventureId, turnId: turn._id, kind: "roll", userId: "guest", characterId: pc.id, result: 15 }, "job-2")
    const second = await drain(store, [roll], model)
    assert.equal(second.finished[0].error, undefined)
    assert.equal(store.current().characters.find((c) => c.id === pc.id)!.isComplete, true)
  } finally {
    cleanup()
  }
})

test("jobs for someone else's character, a stale turn, or a failed model fail without changing the game", async () => {
  const { store, turn, pc, adventureId, cleanup } = await hosted()
  try {
    const before = JSON.stringify(store.state)
    const { finished, events } = await drain(
      store,
      [
        job({ adventureId, turnId: turn._id, kind: "reply", userId: "host", characterId: pc.id, text: "I act for the guest." }, "a"),
        job({ adventureId, turnId: "stale", kind: "reply", userId: "guest", characterId: pc.id, text: "Too late." }, "b"),
        job({ adventureId, turnId: turn._id, kind: "reply", userId: "guest", characterId: pc.id, text: "I bargain." }, "c"),
        job({ adventureId, turnId: turn._id, kind: "continue", userId: "guest" }, "d"),
      ],
      failLlm
    )
    assert.deepEqual(
      finished.map((f) => [f.jobId, f.error]),
      [
        ["a", "It is another character's turn."],
        ["b", "This turn has already advanced."],
        ["c", "offline"],
        ["d", "A player character still needs to act."],
      ]
    )
    assert.equal(events.filter((e) => e.type === "failed").length, 4)
    assert.equal(JSON.stringify(store.state), before)
  } finally {
    cleanup()
  }
})

test("continue advances a finished round to the next encounter", async () => {
  const { store, turn, adventureId, cleanup } = await hosted()
  try {
    for (const c of store.current().characters) Object.assign(c, { isComplete: true, hasReplied: true })
    store.save()
    const model: Llm = {
      ...failLlm,
      generateObject: async ({ schema }) => ({
        object: schema.parse({ nextEncounterId: "the-harvest-festival", narrative: "The guard waves the party into the festival.", adventurePatch: { summaryDelta: "Paid the gate fee." } }),
      }),
    }
    const { finished } = await drain(store, [job({ adventureId, turnId: turn._id, kind: "continue", userId: "guest" })], model)
    assert.equal(finished[0].error, undefined)
    assert.equal(store.current().encounterId, "the-harvest-festival")
  } finally {
    cleanup()
  }
})

test("the website store sends each operation to the host store route", async () => {
  const calls: unknown[] = []
  const store = remoteStore(async (path, body) => {
    calls.push([path, body])
    return { result: { _id: "t1" } }
  })
  assert.deepEqual(await store.getTurn({ turnId: "t1" }), { _id: "t1" })
  assert.deepEqual(calls, [["/api/desktop/host/store", { op: "getTurn", args: { turnId: "t1" } }]])
  await assert.rejects(() => store.createTurn({} as never), /authored adventures only/)
})
