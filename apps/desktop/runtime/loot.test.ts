import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { withOneUsed } from "@d20/gm-core/sheet/item-use"
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
const onTo = (nextEncounterId: string): Llm => ({
  ...offline,
  generateObject: async ({ schema }) => ({ object: schema.parse({ nextEncounterId, beats: [{ kind: "narration", text: "The story moves on." }] }) }),
})
const [THALBERN, LYRA, POPPEN] = ["thalbern", "1749159962941", "1749307435667"]
const sword = { id: "weapon-1-2-or-3", variant: "+1", base: "shortsword" }
const potion = { id: "potions-of-healing", variant: "Potion of Healing" }

test("loot an adventure gives is given once, and what a hero gains and drinks goes on with them to the next adventure", async () => {
  // Covert Cargo, with a Shortsword +1 given on leaving the shipment for the fake, and three potions on coming to it.
  const looted: Packs = structuredClone(packs)
  const encounters = looted["covert-cargo"].artifacts.encounters
  encounters["the-shipment"].loot = [{ ...sword, on: "leave", to: "the-fake" }]
  encounters["the-fake"].loot = [{ ...potion, count: 3, on: "enter" }]
  const dir = mkdtempSync(join(tmpdir(), "d20-loot-test-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(looted))
  const sheetOf = (id: string) => store.current().characters.find((c) => c.id === id)?.sheet as Sheet
  const roundOver = () => {
    for (const c of store.current().characters) Object.assign(c, { isComplete: true, hasReplied: true })
    store.save()
  }
  try {
    await game(
      store,
      looted,
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
    const first = store.current()._id
    roundOver()
    await game(store, looted, onTo("the-fake"))({ kind: "continue", turnId: first })
    assert.equal(store.current().encounterId, "the-fake")
    // Each hero holds none, and Thalbern holds a plain Shortsword: the sword is his. The potions go one to each.
    assert.deepEqual(sheetOf(THALBERN).items, [sword, potion])
    for (const id of [LYRA, POPPEN]) assert.deepEqual(sheetOf(id).items, [potion], id)
    const facts = store
      .current()
      .story.filter((beat) => beat.kind === "feature")
      .map((beat) => beat.text)
    assert.ok(facts.includes("Thalbern takes the Shortsword +1."))
    assert.equal(facts.filter((text) => text.endsWith("takes a Potion of Healing.")).length, 3)
    // Kept at once, on the store a level is kept in.
    assert.deepEqual(store.kept()[THALBERN].sheet.items, [sword, potion])
    // The turn that gave it cannot advance again.
    await assert.rejects(() => game(store, looted, onTo("the-fake"))({ kind: "continue", turnId: first }))
    assert.equal(store.state!.turns.length, 2)

    // Thalbern drinks his potion, and the round ends.
    const turn = store.current()
    const thalbern = turn.characters.find((c) => c.id === THALBERN)!
    thalbern.sheet = withOneUsed(thalbern.sheet as Sheet, 1)
    roundOver()
    await game(store, looted, onTo("the-transaction"))({ kind: "continue", turnId: turn._id })
    assert.deepEqual(store.kept()[THALBERN].sheet.items, [sword])

    // A new game of The Midnight Summons: he comes with the sword and without the potion.
    await game(store, looted, offline)({ kind: "start", provider: "claude", adventure: "the-midnight-summons", replace: true, party: [{ id: THALBERN, ai: false }] })
    assert.deepEqual(sheetOf(THALBERN).items, [sword])
    assert.ok(sheetOf(THALBERN).weapons?.includes("shortsword"))
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
