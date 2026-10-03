import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { castIdFor, portraitFor, sceneFor } from "../src/scenes"
import { adventureList, game, type Packs, transitionsOf } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }

test("both adventures are bundled, share no encounter ids, and start with their own heroes", async () => {
  assert.deepEqual(
    adventureList(packs).map((a) => [a.id, a.title, a.start]),
    [
      ["march-of-davos", "March of Davos", "the-gates-of-kordavos"],
      ["the-midnight-summons", "The Midnight Summons", "broken-silence"],
    ]
  )
  const [march, midnight] = [packs["march-of-davos"], packs["the-midnight-summons"]].map((p) => new Set(Object.keys(p.artifacts.encounters)))
  assert.deepEqual(
    [...midnight].filter((id) => march.has(id)),
    []
  )

  const dir = mkdtempSync(join(tmpdir(), "d20-adventures-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    const run = game(store, packs, offline)
    await run({ kind: "start", provider: "claude", adventure: "the-midnight-summons" })
    assert.equal(store.state!.adventure.planId, "the-midnight-summons")
    assert.equal(store.state!.adventure.title, "The Midnight Summons")
    assert.equal(store.current().encounterId, "broken-silence")
    assert.deepEqual(
      store
        .current()
        .characters.filter((c) => c.type === "pc")
        .map((c) => c.id),
      ["thalbern"]
    )
    await run({ kind: "start", provider: "claude", replace: true })
    assert.equal(store.state!.adventure.planId, "march-of-davos")
    assert.equal(store.current().characters.filter((c) => c.type === "pc").length, 4)
    await assert.rejects(() => run({ kind: "start", provider: "claude", adventure: "not-installed", replace: true }), /not installed/)
    assert.equal(store.state!.adventure.planId, "march-of-davos")
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the real core plays The Midnight Summons through the owlbear to its ending", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-midnight-"))
  const path = join(dir, "save.sqlite")
  const store = new LocalStore(path, transitionsOf(packs))
  try {
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-midnight-summons" })
    const route = ["owlbear-confrontation", "timely-rescue", "meeting-at-the-stones", "preparing-for-the-city"]
    for (const next of route) {
      store.current().characters.forEach((c) => {
        c.hasReplied = true
        c.isComplete = true
      })
      store.save()
      const llm: Llm = {
        generateText: unused,
        generateObject: async ({ schema }) => ({ object: schema.parse({ nextEncounterId: next, narrative: `Thalbern goes on to ${next}.`, adventurePatch: {} }) }),
      }
      await game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
      assert.equal(store.current().encounterId, next)
      if (next === "owlbear-confrontation") assert.ok(store.current().characters.some((c) => c.type === "npc" && /owlbear/i.test(c.name)))
      // The forest encounters have a figure for every character in the turn. The meeting and the ending play in story view.
      const scene = sceneFor(next)
      assert.equal(Boolean(scene), ["owlbear-confrontation", "timely-rescue"].includes(next))
      for (const c of store.current().characters) {
        if (scene) assert.equal(castIdFor(scene.staging.cast, c), c.id)
        assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/the-midnight-summons\/.+-portrait\.jpg$/)
      }
    }
    assert.equal(store.state!.adventure.status, "completed")
    assert.equal(store.current().isFinalEncounter, true)
    assert.deepEqual(
      store.state!.turns.map((t) => t.encounterId),
      ["broken-silence", ...route]
    )
    await assert.rejects(() => game(store, packs, offline)({ kind: "continue", turnId: store.current()._id }), /complete/)
    const reopened = new LocalStore(path)
    assert.equal(reopened.state!.adventure.status, "completed")
    reopened.db.close()
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
