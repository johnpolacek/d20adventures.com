import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { autoChoices } from "@d20/gm-core/sheet/milestone"
import type { Sheet } from "@d20/gm-core/sheet/sheet"
import { game, type Packs, transitionsOf } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const offline: Llm = {
  generateText: async () => {
    throw new Error("offline")
  },
  generateObject: async () => {
    throw new Error("offline")
  },
}
const [THALBERN, LYRA, POPPEN] = ["thalbern", "1749159962941", "1749307435667"]
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "d20-milestone-test-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  return {
    store,
    cleanup: () => {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
const hero = (store: LocalStore, id: string) => store.current().characters.find((c) => c.id === id)!
const sheetOf = (store: LocalStore, id: string) => hero(store, id).sheet as Sheet

test("a finished adventure gives the player's hero a level by their own choices, once, and the hero keeps it", async () => {
  const { store, cleanup } = setup()
  try {
    const run = game(store, packs, offline)
    await run({ kind: "start", provider: "claude", adventure: "the-midnight-summons", party: [{ id: THALBERN, ai: false }] })
    const turnId = store.current()._id
    const choices = autoChoices(sheetOf(store, THALBERN))
    // No level while the adventure is still being played.
    await assert.rejects(() => run({ kind: "level", turnId, characterId: THALBERN, choices }), /No level is owed/)
    store.state!.adventure.status = "completed"
    store.save()
    // A choice the level does not ask for is refused, and nothing is written.
    await assert.rejects(() => run({ kind: "level", turnId, characterId: THALBERN, choices: { ...choices, subclass: "hunter" } }), /level 2 grants no subclass/)
    assert.equal(sheetOf(store, THALBERN).level, 1)

    await run({ kind: "level", turnId, characterId: THALBERN, choices })
    assert.equal(sheetOf(store, THALBERN).level, 2)
    assert.equal(hero(store, THALBERN).hitPoints, 18)
    assert.deepEqual(hero(store, THALBERN).milestones, ["the-midnight-summons"])
    assert.equal(store.kept()[THALBERN].sheet.level, 2)
    await assert.rejects(() => run({ kind: "level", turnId, characterId: THALBERN, choices }), /No level is owed/)

    // Going on into Covert Cargo, and a game of it started afresh later: Thalbern comes as he is, at level 2.
    for (const continues of [true, false]) {
      await run({
        kind: "start",
        provider: "claude",
        adventure: "covert-cargo",
        replace: true,
        continues,
        party: [
          { id: THALBERN, ai: false },
          { id: LYRA, ai: true },
          { id: POPPEN, ai: true },
        ],
      })
      assert.equal(sheetOf(store, THALBERN).level, 2)
      assert.equal(hero(store, THALBERN).hitPoints, 18)
      assert.deepEqual(hero(store, THALBERN).milestones, ["the-midnight-summons"])
      assert.equal(sheetOf(store, LYRA).level, 1)
    }
    // The level goes on with him from one encounter into the next.
    const turn = store.current()
    for (const c of turn.characters) {
      c.isComplete = true
      c.hasReplied = true
    }
    store.save()
    const model: Llm = {
      ...offline,
      generateObject: async ({ schema }) => ({ object: schema.parse({ nextEncounterId: "the-transaction", beats: [{ kind: "narration", text: "The boat ties up at the pier." }] }) }),
    }
    await game(store, packs, model)({ kind: "continue", turnId: turn._id })
    assert.equal(store.current().encounterId, "the-transaction")
    assert.equal(sheetOf(store, THALBERN).level, 2)
    assert.deepEqual(hero(store, THALBERN).milestones, ["the-midnight-summons"])
  } finally {
    cleanup()
  }
})

test("as an adventure ends, an AI companion takes their level at once, and the player's hero waits on the player", async () => {
  const { store, cleanup } = setup()
  try {
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "covert-cargo",
      party: [
        { id: LYRA, ai: false },
        { id: POPPEN, ai: true },
        { id: THALBERN, ai: true },
      ],
    })
    const turn = store.current()
    // The last encounter before the end, the round played out.
    turn.encounterId = "the-escape"
    store.state!.adventure.currentEncounterId = "the-escape"
    for (const c of turn.characters) {
      c.isComplete = true
      c.hasReplied = true
    }
    store.save()
    const model: Llm = {
      ...offline,
      generateObject: async ({ schema }) => ({ object: schema.parse({ nextEncounterId: "return-to-the-city", beats: [{ kind: "narration", text: "They walk back toward the city." }] }) }),
    }
    await game(store, packs, model)({ kind: "continue", turnId: turn._id })
    assert.equal(store.state!.adventure.status, "completed")
    // The companions are level 2 and kept. Lyra's level waits on her player.
    for (const id of [POPPEN, THALBERN]) {
      assert.equal(sheetOf(store, id).level, 2, id)
      assert.deepEqual(hero(store, id).milestones, ["covert-cargo"])
      assert.equal(store.kept()[id].sheet.level, 2)
    }
    assert.equal(sheetOf(store, LYRA).level, 1)
    assert.equal(store.kept()[LYRA], undefined)
    await game(store, packs, offline)({ kind: "level", turnId: store.current()._id, characterId: LYRA, choices: autoChoices(sheetOf(store, LYRA)) })
    assert.equal(sheetOf(store, LYRA).level, 2)
    // An AI companion's level is not the player's to take.
    await assert.rejects(() => game(store, packs, offline)({ kind: "level", turnId: store.current()._id, characterId: POPPEN, choices: {} }), /AI companion/)
  } finally {
    cleanup()
  }
})
