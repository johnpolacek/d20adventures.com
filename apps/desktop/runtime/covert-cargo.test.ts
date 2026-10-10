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
  assert.equal(encounters.length, 10)
  for (const encounter of encounters) {
    const authored = sceneFor(encounter.id)
    assert.ok(authored, `${encounter.id} has no scene`)
    const characters = buildLocalWikiTurnCharacters({ artifacts: pack.artifacts, encounter, players })
    const scene = partyScene(authored, characters)
    assert.deepEqual(scene.staging, authored.staging, `${encounter.id}: the premade party stands in its authored places`)
    for (const c of characters) {
      assert.ok(castIdFor(scene.staging.cast, c), `${encounter.id}: ${c.name} has no figure`)
      // Thalbern walks in from The Midnight Summons with his own art.
      assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/(covert-cargo|the-midnight-summons)\/[a-z-]+-portrait\.jpg$/, `${encounter.id}: ${c.name}`)
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

// A model that answers each of the core's requests by its schema. `advance` is the GM's answer on turn advance.
function stubLlm(advance: () => Record<string, unknown>, lethalTo?: string): Llm {
  return {
    generateText: async () => ({ text: "Steel rings in the saloon." }),
    generateObject: async ({ schema }) => {
      const answers = [
        advance(),
        { actionSummary: "Cuts at the mage.", narrative: "The blade comes down.", actionType: "attack" },
        { narrative: "The blade bites deep.", effects: lethalTo ? [{ targetId: lethalTo, healthPercentDelta: -100, status: "dead" }] : [] },
        { rollType: "Attack", difficulty: 5 },
        { modifier: 0 },
        { hasPhysicalEffect: false, reasoning: "Already applied.", update: null },
      ]
      for (const answer of answers) {
        const parsed = schema.safeParse(answer)
        if (parsed.success) return { object: parsed.data }
      }
      throw new Error("Unexpected model request")
    },
  }
}

async function inTheBattle(run: (store: LocalStore, play: (llm: Llm) => Promise<unknown>) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "d20-cargo-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  const done = (ids: (c: { type: string }) => boolean) => {
    for (const c of store.current().characters) if (ids(c)) c.hasReplied = c.isComplete = true
    store.save()
  }
  const play = (llm: Llm) => game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
  try {
    await game(store, packs, { generateText: unused, generateObject: unused })({ kind: "start", provider: "claude", adventure: "covert-cargo" })
    for (const next of ["the-fake", "battle-on-the-boat"]) {
      done(() => true)
      await play(stubLlm(() => ({ nextEncounterId: next, narrative: `On to ${next}.`, adventurePatch: {} })))
    }
    done((c) => c.type === "pc")
    await run(store, play)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
const lyra = (store: LocalStore) => store.current().characters.find((c) => c.name === "Lyra Silvanus")!

test("a killing blow leaves a hero alive, and Thalbern ends a fight that would go on", async () => {
  await inTheBattle(async (store, play) => {
    const fightGoesOn = () => ({ nextEncounterId: "battle-on-the-boat", narrative: "Reinhard raises his sword again.", adventurePatch: {} })
    await play(stubLlm(fightGoesOn, lyra(store).id))
    assert.equal(store.current().encounterId, "the-ranger")
    assert.equal(lyra(store).healthPercent, 1)
    assert.notEqual(lyra(store).status, "dead")
    assert.deepEqual(
      store
        .current()
        .characters.filter((c) => c.type === "npc")
        .map((c) => c.name),
      ["Thalbern"]
    )
    assert.match(store.current().narrative, /Reinhard raises his sword again\.[\s\S]*I am Thalbern/)
    assert.deepEqual(store.current().adventurePatch?.transition?.toEncounterId, "the-ranger")
    assert.match(spatialContext("the-ranger", store.current().characters, {}) ?? "", /Thalbern \(5\.2, 2\.4\)/)

    // He comes once. A patch that kills is floored too.
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    const dying = () => ({
      nextEncounterId: "the-ranger",
      narrative: "Thalbern binds the wound.",
      adventurePatch: { characterUpdates: [{ characterId: lyra(store).id, healthPercent: 0, status: "dead" }] },
    })
    await play(stubLlm(dying))
    assert.equal(store.current().encounterId, "the-ranger")
    assert.equal(store.state!.turns.filter((t) => t.encounterId === "the-ranger").length, 2)
    assert.equal(lyra(store).healthPercent, 1)
    assert.notEqual(lyra(store).status, "dead")
  })
})

test("a fight the heroes win follows its own transition, however hurt they are", async () => {
  await inTheBattle(async (store, play) => {
    lyra(store).healthPercent = 30
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    await play(stubLlm(() => ({ nextEncounterId: "the-crate", narrative: "Reinhard falls.", adventurePatch: {} })))
    assert.equal(store.current().encounterId, "the-crate")
  })
})
