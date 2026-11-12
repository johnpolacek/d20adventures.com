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
// A game master who moves the story on to one encounter.
const onTo = (nextEncounterId: string): Llm => ({
  ...offline,
  generateObject: async ({ schema }) => ({ object: schema.parse({ nextEncounterId, beats: [{ kind: "narration", text: "The story moves on." }] }) }),
})
const [THALBERN, LYRA, POPPEN] = ["thalbern", "1749159962941", "1749307435667"]
function setup(using: Packs = packs) {
  const dir = mkdtempSync(join(tmpdir(), "d20-milestone-test-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(using))
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
function roundOver(store: LocalStore) {
  for (const c of store.current().characters) {
    c.isComplete = true
    c.hasReplied = true
  }
  store.save()
}

test("a hero below their adventure's level is owed it: a companion takes it at once, a player by their own choices, and it is kept", async () => {
  const { store, cleanup } = setup()
  try {
    const run = game(store, packs, offline)
    // Welcome to Kordavos is played at level 2, and its heroes come at level 1.
    assert.equal(packs["welcome-to-kordavos"].artifacts.manifest.level, 2)
    await run({
      kind: "start",
      provider: "claude",
      adventure: "welcome-to-kordavos",
      party: [
        { id: THALBERN, ai: false },
        { id: LYRA, ai: true },
        { id: POPPEN, ai: true },
      ],
    })
    const turnId = store.current()._id
    // The companions are level 2 and whole: Lyra's 6 hit points are 10, and Poppen's 10 are 17.
    assert.deepEqual([sheetOf(store, LYRA).level, hero(store, LYRA).hitPoints, hero(store, LYRA).levelDue], [2, 10, undefined])
    assert.deepEqual([sheetOf(store, POPPEN).level, hero(store, POPPEN).hitPoints, hero(store, POPPEN).levelDue], [2, 17, undefined])
    // Thalbern waits on his player.
    assert.deepEqual([sheetOf(store, THALBERN).level, hero(store, THALBERN).hitPoints, hero(store, THALBERN).levelDue], [1, 11, 2])
    const choices = autoChoices(sheetOf(store, THALBERN))
    // A choice the level does not ask for is refused, and nothing is written.
    await assert.rejects(() => run({ kind: "level", turnId, characterId: THALBERN, choices: { ...choices, subclass: "hunter" } }), /level 2 grants no subclass/)
    assert.equal(sheetOf(store, THALBERN).level, 1)
    // An AI companion's level is not the player's to take.
    await assert.rejects(() => run({ kind: "level", turnId, characterId: POPPEN, choices: {} }), /AI companion/)

    await run({ kind: "level", turnId, characterId: THALBERN, choices })
    assert.deepEqual([sheetOf(store, THALBERN).level, hero(store, THALBERN).hitPoints, hero(store, THALBERN).levelDue], [2, 18, undefined])
    assert.equal(store.kept()[THALBERN].sheet.level, 2)
    await assert.rejects(() => run({ kind: "level", turnId, characterId: THALBERN, choices }), /No level is owed/)

    // The level goes on with him from one encounter into the next.
    roundOver(store)
    await game(store, packs, onTo("the-front-of-the-line"))({ kind: "continue", turnId })
    assert.equal(store.current().encounterId, "the-front-of-the-line")
    assert.deepEqual([sheetOf(store, THALBERN).level, hero(store, THALBERN).levelDue, sheetOf(store, LYRA).level], [2, undefined, 2])

    // A new game later, of an adventure played at level 1: he comes as he is, at level 2, and is owed nothing.
    await run({ kind: "start", provider: "claude", adventure: "the-midnight-summons", replace: true, party: [{ id: THALBERN, ai: false }] })
    assert.deepEqual([sheetOf(store, THALBERN).level, hero(store, THALBERN).hitPoints, hero(store, THALBERN).levelDue], [2, 18, undefined])
  } finally {
    cleanup()
  }
})

test("a level a player has not taken stays owed from one encounter to the next", async () => {
  const { store, cleanup } = setup()
  try {
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "welcome-to-kordavos",
      party: [
        { id: LYRA, ai: false },
        { id: THALBERN, ai: true },
        { id: POPPEN, ai: true },
      ],
    })
    roundOver(store)
    await game(store, packs, onTo("the-front-of-the-line"))({ kind: "continue", turnId: store.current()._id })
    assert.deepEqual([sheetOf(store, LYRA).level, hero(store, LYRA).levelDue, sheetOf(store, THALBERN).level], [1, 2, 2])
  } finally {
    cleanup()
  }
})

test("an adventure's end raises its heroes to the level of the adventure that follows", async () => {
  // Covert Cargo leads into The Road to Kordavos, played at level 1: its end gives no level.
  const plain = setup()
  try {
    await game(
      plain.store,
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
    plain.store.current().encounterId = "the-escape"
    plain.store.state!.adventure.currentEncounterId = "the-escape"
    roundOver(plain.store)
    await game(plain.store, packs, onTo("return-to-the-city"))({ kind: "continue", turnId: plain.store.current()._id })
    assert.equal(plain.store.state!.adventure.status, "completed")
    for (const id of [LYRA, POPPEN, THALBERN]) assert.deepEqual([sheetOf(plain.store, id).level, hero(plain.store, id).levelDue], [1, undefined], id)
    assert.deepEqual(plain.store.kept(), {})
  } finally {
    plain.cleanup()
  }

  // Were the Road played at level 2, the end of Covert Cargo would give that level: the companions take it at once
  // and it is kept, and Lyra's waits on her player.
  const raised: Packs = structuredClone(packs)
  raised["the-road-to-kordavos"].artifacts.manifest.level = 2
  const { store, cleanup } = setup(raised)
  try {
    await game(
      store,
      raised,
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
    store.current().encounterId = "the-escape"
    store.state!.adventure.currentEncounterId = "the-escape"
    roundOver(store)
    await game(store, raised, onTo("return-to-the-city"))({ kind: "continue", turnId: store.current()._id })
    assert.equal(store.state!.adventure.status, "completed")
    for (const id of [POPPEN, THALBERN]) {
      assert.deepEqual([sheetOf(store, id).level, hero(store, id).levelDue], [2, undefined], id)
      assert.equal(store.kept()[id].sheet.level, 2)
    }
    assert.deepEqual([sheetOf(store, LYRA).level, hero(store, LYRA).levelDue, store.kept()[LYRA]], [1, 2, undefined])
    // The finished adventure still lets her take it.
    await game(store, raised, offline)({ kind: "level", turnId: store.current()._id, characterId: LYRA, choices: autoChoices(sheetOf(store, LYRA)) })
    assert.deepEqual([sheetOf(store, LYRA).level, store.kept()[LYRA].sheet.level], [2, 2])
  } finally {
    cleanup()
  }
})
