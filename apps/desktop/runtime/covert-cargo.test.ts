import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { buildLocalWikiTurnCharacters } from "@d20/gm-core/wiki-adventures/characters"
import { castIdFor, partyScene, portraitFor, sceneFor, spatialContext } from "../src/scenes"
import { game, type Packs, transitionsOf } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["covert-cargo"]
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}

test("every Covert Cargo encounter has a 3D scene with a figure and a portrait for everyone in it", () => {
  const players = pack.artifacts.manifest.premadeCharacterIds.map((characterId) => ({ characterId, userId: "local-player" }))
  const encounters = Object.values(pack.artifacts.encounters)
  assert.equal(encounters.length, 9)
  for (const encounter of encounters) {
    const authored = sceneFor(encounter.id)
    assert.ok(authored, `${encounter.id} has no scene`)
    const characters = buildLocalWikiTurnCharacters({ artifacts: pack.artifacts, encounter, players })
    const scene = partyScene(authored, characters)
    assert.deepEqual(scene.staging, authored.staging, `${encounter.id}: the premade party stands in its authored places`)
    for (const c of characters) {
      assert.ok(castIdFor(scene.staging.cast, c), `${encounter.id}: ${c.name} has no figure`)
      assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/covert-cargo\/[a-z-]+-portrait\.jpg$/, `${encounter.id}: ${c.name}`)
    }
  }
})

test("the real core walks Covert Cargo from the pier into the cabin and back to Kordavos, with map staging for the GM", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-cargo-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(store, packs, { generateText: unused, generateObject: unused })({ kind: "start", provider: "claude", adventure: "covert-cargo" })
    assert.equal(store.current().encounterId, "the-shipment")
    const prompts: string[] = []
    for (const next of ["the-fake", "battle-on-the-boat", "the-crate", "return-to-the-city"]) {
      store.current().characters.forEach((c) => {
        c.hasReplied = true
        c.isComplete = true
      })
      store.save()
      const llm: Llm = {
        generateText: unused,
        generateObject: async ({ schema, prompt }) => {
          prompts.push(prompt)
          return { object: schema.parse({ nextEncounterId: next, narrative: `On to ${next}.`, adventurePatch: {} }) }
        },
      }
      await game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
      assert.equal(store.current().encounterId, next)
      const where = spatialContext(next, store.current().characters, {})
      assert.match(where ?? "", /Lyra Silvanus \(/)
      assert.match(where ?? "", /Poppen Quickfoot \(/)
    }
    // The GM saw the pier's places while deciding the first move.
    assert.match(prompts[0], /the cabin door/)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
