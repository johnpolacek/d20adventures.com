import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { game, type Packs } from "./game"
import { LocalStore } from "./store"

test("saved adventures list newest first and resume swaps the archived one in", async () => {
  const { store, path, cleanup } = setup()
  try {
    const run = game(store, packs, failLlm)
    assert.deepEqual(store.saves(), [])
    await run({ kind: "start", provider: "claude" })
    const first = store.state!.adventure._id
    store.state!.adventure.status = "completed"
    store.save()
    await run({ kind: "start", provider: "codex", replace: true })
    const second = store.state!.adventure._id
    await run({ kind: "start", provider: "claude", replace: true })
    const third = store.state!.adventure._id

    const listed = store.saves()
    assert.deepEqual(
      listed.map((s) => s.adventureId),
      [third, second, first]
    )
    assert.equal(listed[0].archiveId, undefined)
    assert.equal(listed[2].status, "completed")
    assert.equal(listed[0].round, 1)
    assert.equal(listed[0].planId, "march-of-davos")
    assert.ok(listed[0].party.length > 0)

    await run({ kind: "resume", archiveId: listed[2].archiveId! })
    assert.equal(store.state!.adventure._id, first)
    assert.deepEqual(
      store.saves().map((s) => s.adventureId),
      [first, third, second]
    )
    await assert.rejects(() => run({ kind: "resume", archiveId: listed[2].archiveId! }), /no longer saved/)
    assert.equal(store.state!.adventure._id, first)

    const reopened = new LocalStore(path)
    assert.equal(reopened.state!.adventure._id, first)
    assert.equal(reopened.saves().length, 3)
    reopened.db.close()
  } finally {
    cleanup()
  }
})
test("removing a saved adventure deletes an archived one by id, or the current one", async () => {
  const { store, path, cleanup } = setup()
  try {
    const run = game(store, packs, failLlm)
    await run({ kind: "start", provider: "claude" })
    const first = store.state!.adventure._id
    await run({ kind: "start", provider: "claude", replace: true })
    const archived = store.saves()[1]
    assert.equal(archived.adventureId, first)
    await run({ kind: "remove", archiveId: archived.archiveId })
    assert.equal(store.saves().length, 1)
    await assert.rejects(() => run({ kind: "remove", archiveId: archived.archiveId }), /no longer saved/)
    await run({ kind: "remove" })
    assert.equal(store.state, null)
    assert.deepEqual(store.saves(), [])
    const reopened = new LocalStore(path)
    assert.equal(reopened.state, null)
    reopened.db.close()
    await run({ kind: "start", provider: "claude" })
    assert.equal(store.saves().length, 1)
  } finally {
    cleanup()
  }
})
test("archives from before summaries are listed after reopening", async () => {
  const { store, path, cleanup } = setup()
  try {
    const run = game(store, packs, failLlm)
    await run({ kind: "start", provider: "claude" })
    const first = store.state!.adventure._id
    await run({ kind: "start", provider: "claude", replace: true })
    store.db.prepare("UPDATE archive SET summary=NULL").run()
    const reopened = new LocalStore(path)
    assert.equal(reopened.saves()[1].adventureId, first)
    reopened.db.close()
  } finally {
    cleanup()
  }
})

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["march-of-davos"]
const quiet = () => {}
console.log = console.warn = console.error = quiet
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "d20-store-test-")),
    path = join(dir, "save.sqlite")
  const store = new LocalStore(path, pack.artifacts.graph.encounterTransitions)
  return {
    store,
    path,
    cleanup: () => {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
const failLlm: Llm = {
  generateText: async () => {
    throw new Error("offline")
  },
  generateObject: async () => {
    throw new Error("offline")
  },
}
test("authored start survives reopening, duplicate start and overlapping work are rejected", async () => {
  const { store, path, cleanup } = setup()
  try {
    store.acquire()
    const run = game(store, packs, failLlm)
    await run({ kind: "start", provider: "claude" })
    assert.equal(store.current().encounterId, "the-gates-of-kordavos")
    assert.equal(store.current().characters.filter((c) => c.type === "pc").length, 4)
    const second = new LocalStore(path)
    assert.equal(second.current()._id, store.current()._id)
    assert.throws(() => second.acquire(), /already|still running/)
    // Closing a non-owner connection must not release another connection's lease.
    second.close()
    const third = new LocalStore(path)
    assert.throws(() => third.acquire(), /already|still running/)
    third.close()
    await assert.rejects(() => run({ kind: "start", provider: "codex" }), /already saved/)
  } finally {
    cleanup()
  }
})
test("reply storage and real roll services keep dice across failures and reject stale input", async () => {
  const { store, path, cleanup } = setup()
  try {
    const run = game(store, packs, failLlm)
    await run({ kind: "start", provider: "claude" })
    const turn = store.current(),
      pc = turn.characters.find((c) => c.type === "pc")!
    turn.characters.forEach((c) => {
      c.isComplete = c.id !== pc.id
      c.initiative = c.id === pc.id ? 20 : 0
    })
    const good: Llm = {
      generateText: async () => ({ text: `${pc.name} argues for a lower gate fee.` }),
      generateObject: async ({ schema, prompt }) => ({ object: schema.parse(prompt.includes("situational") ? { modifier: 0 } : { rollType: "Persuasion", difficulty: 12 }) }),
    }
    // Use the storage port for the roll fixture, then the real resolution pipeline.
    await store.submitReply({
      turnId: turn._id,
      characterId: pc.id,
      narrativeAction: "She bargains for entry.",
      originalPlayerInput: "I bargain.",
      rollRequirement: { rollType: "Persuasion", difficulty: 12, modifier: 2 },
    })
    await assert.rejects(() => store.submitReply({ turnId: turn._id, characterId: pc.id, narrativeAction: "duplicate" }), /already acted/)
    await assert.rejects(() => run({ kind: "roll", turnId: turn._id, characterId: pc.id, result: 14 }), /offline/)
    const reloaded = new LocalStore(path)
    assert.equal(reloaded.state!.rolls[`${turn._id}:${pc.id}`], 14)
    reloaded.db.close()
    await game(store, packs, good)({ kind: "roll", turnId: turn._id, characterId: pc.id, result: 1 })
    assert.equal(store.current().characters.find((c) => c.id === pc.id)!.rollResult, 16)
    assert.equal(store.current().characters.find((c) => c.id === pc.id)!.isComplete, true)
    await assert.rejects(() => run({ kind: "reply", turnId: "stale", characterId: pc.id, text: "another action" }), /already advanced/)
  } finally {
    cleanup()
  }
})
test("real core advances through authored graph and atomically retains state across restart", async () => {
  const { store, path, cleanup } = setup()
  try {
    await game(store, packs, failLlm)({ kind: "start", provider: "codex" })
    const turn = store.current()
    turn.characters.forEach((c) => {
      c.isComplete = true
      c.hasReplied = true
    })
    store.save()
    const model: Llm = {
      ...failLlm,
      generateObject: async ({ schema }) => ({
        object: schema.parse({
          nextEncounterId: "the-harvest-festival",
          narrative: "The guard waves the party into the festival.",
          adventurePatch: { summaryDelta: "Paid the gate fee.", discoveries: [{ id: "fee", type: "fact", title: "Gate fee", text: "The fee is paid.", visibility: "player" }] },
        }),
      }),
    }
    await game(store, packs, model)({ kind: "continue", turnId: turn._id })
    assert.equal(store.current().encounterId, "the-harvest-festival")
    assert.equal(store.state!.turns.length, 2)
    assert.equal(store.state!.adventure.discoveries.length, 1)
    assert.equal(store.state!.adventure.adventureSummaryMarkdown, "Paid the gate fee.")
    const reopened = new LocalStore(path)
    assert.deepEqual(reopened.state, JSON.parse(JSON.stringify(store.state)))
    reopened.db.close()
    await assert.rejects(() => game(store, packs, model)({ kind: "continue", turnId: turn._id }), /already advanced/)
  } finally {
    cleanup()
  }
})
test("new game archives the saved adventure, even a finished one, and a plain start still refuses to overwrite", async () => {
  const { store, path, cleanup } = setup()
  try {
    const run = game(store, packs, failLlm)
    await run({ kind: "start", provider: "claude" })
    const first = store.state!.adventure._id
    store.state!.adventure.status = "completed"
    store.state!.positions = { branka: { x: 1, z: 12, ry: 0 } }
    store.save()
    await assert.rejects(() => run({ kind: "start", provider: "codex" }), /already saved/)
    assert.equal(store.state!.adventure._id, first)

    await run({ kind: "start", provider: "codex", replace: true })
    const second = store.state!.adventure._id
    assert.notEqual(second, first)
    assert.equal(store.state!.provider, "codex")
    assert.equal(store.state!.adventure.status, "active")
    assert.equal(store.current().encounterId, "the-gates-of-kordavos")
    assert.equal(store.state!.turns.length, 1)
    assert.deepEqual(store.state!.positions, {})

    const reopened = new LocalStore(path)
    assert.equal(reopened.state!.adventure._id, second)
    const archived = (reopened.db.prepare("SELECT json FROM archive ORDER BY id").all() as { json: string }[]).map((r) => JSON.parse(r.json))
    assert.equal(archived.length, 1)
    assert.equal(archived[0].adventure._id, first)
    assert.equal(archived[0].adventure.status, "completed")
    assert.deepEqual(archived[0].positions, { branka: { x: 1, z: 12, ry: 0 } })
    reopened.db.close()

    await run({ kind: "start", provider: "claude", replace: true })
    assert.equal((store.db.prepare("SELECT count(*) AS n FROM archive").get() as { n: number }).n, 2)
  } finally {
    cleanup()
  }
})
