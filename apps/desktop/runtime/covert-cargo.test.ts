import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { storyText } from "@d20/gm-core/story/render"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { buildLocalWikiTurnCharacters } from "@d20/gm-core/wiki-adventures/characters"
import { castIdFor, partyScene, portraitFor, sceneFor, spatialContext } from "../src/scenes"
import { game, type Packs, suggest, transitionsOf } from "./game"
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
      // Thalbern, the third hero, brings his art from The Midnight Summons.
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
          return { object: schema.parse({ nextEncounterId: next, beats: [{ kind: "narration", text: `On to ${next}.` }], adventurePatch: {} }) }
        },
      }
      await game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
      assert.equal(store.current().encounterId, next)
      const where = spatialContext(next, store.current().characters, {})
      assert.match(where ?? "", /Lyra Silvanus \(/)
      assert.match(where ?? "", /Poppen Quickfoot \(/)
      assert.match(where ?? "", /Thalbern \(/)
    }
    // The GM saw the pier's places while deciding the first move.
    assert.match(prompts[0], /the cabin door/)
    // And who knows whom: the rule every adventure gets, and this adventure's premise.
    assert.match(prompts[0], /WHO KNOWS WHAT:/)
    assert.match(prompts[0], /ADVENTURE PREMISE[^\n]*\nLyra, Poppen and Thalbern have never met/)
    // The two watchers are apart, each unknown to the other until a check passes, and the elves leave when paid.
    assert.match(prompts[0], /Poppen and Thalbern do not know of each other/)
    assert.match(prompts[0], /Perception check, DC 15/)
    assert.match(prompts[0], /Once Silas hands over the payment they leave the boat/)
    assert.match(prompts[0], /Poppen Quickfoot \(-5\.0, 4\.3\)/)
    assert.match(prompts[0], /Thalbern \(-1\.4, -6\.4\)/)
    assert.match(prompts[0], /the thicket on the bank below the stern/)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the premise that the three heroes are strangers reaches the replies offered to a player", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-cargo-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(store, packs, { generateText: unused, generateObject: unused })({ kind: "start", provider: "claude", adventure: "covert-cargo" })
    const turn = store.current()
    const actor = findCurrentActor(turn.characters)!
    let prompt = ""
    const llm: Llm = {
      generateText: unused,
      generateObject: async (args) => {
        prompt = args.prompt
        return { object: args.schema.parse({ suggestions: [{ label: "Wait", text: `${actor.name} waits.` }] }) }
      },
    }
    await suggest(store.state, packs, llm, { kind: "suggest", turnId: turn._id, characterId: actor.id })
    assert.match(prompt, /ADVENTURE PREMISE[^\n]*\nLyra, Poppen and Thalbern have never met/)
    assert.match(prompt, /does not say a stranger's name/)
    // Still nothing from the GM's own notes.
    assert.ok(!prompt.includes("Verodynian Oath Stone"))
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// A model that answers each of the core's requests by its schema. `advance` is the GM's answer on turn advance.
function stubLlm(
  advance: () => Record<string, unknown>,
  lethalTo?: string,
  npcAction: Record<string, unknown> = { actionSummary: "Cuts at the mage.", beats: [{ kind: "narration", text: "The blade comes down." }], actionType: "attack" }
): Llm {
  return {
    generateText: async () => ({ text: "Steel rings in the saloon." }),
    generateObject: async ({ schema }) => {
      const answers = [
        advance(),
        npcAction,
        { beats: [{ kind: "narration", text: "The blade bites deep." }], effects: lethalTo ? [{ targetId: lethalTo, healthPercentDelta: -100, status: "dead" }] : [] },
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
      await play(stubLlm(() => ({ nextEncounterId: next, beats: [{ kind: "narration", text: `On to ${next}.` }], adventurePatch: {} })))
    }
    done((c) => c.type === "pc")
    await run(store, play)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
const lyra = (store: LocalStore) => store.current().characters.find((c) => c.name === "Lyra Silvanus")!

test("a killing blow leaves a hero alive, and nobody comes to the rescue: Thalbern is one of the heroes", async () => {
  await inTheBattle(async (store, play) => {
    assert.deepEqual(
      store
        .current()
        .characters.filter((c) => c.type === "pc")
        .map((c) => c.name)
        .sort(),
      ["Lyra Silvanus", "Poppen Quickfoot", "Thalbern"]
    )
    const fightGoesOn = () => ({ nextEncounterId: "battle-on-the-boat", beats: [{ kind: "narration", text: "Reinhard raises his sword again." }], adventurePatch: {} })
    await play(stubLlm(fightGoesOn, lyra(store).id))
    assert.equal(store.current().encounterId, "battle-on-the-boat")
    assert.equal(lyra(store).healthPercent, 1)
    assert.notEqual(lyra(store).status, "dead")
    assert.deepEqual(
      store
        .current()
        .characters.filter((c) => c.type === "npc")
        .map((c) => c.name)
        .sort(),
      ["Reinhard", "Silas"]
    )

    // A patch that kills is floored too.
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    const dying = () => ({
      nextEncounterId: "battle-on-the-boat",
      beats: [{ kind: "narration", text: "Lyra goes down on one knee." }],
      adventurePatch: { characterUpdates: [{ characterId: lyra(store).id, healthPercent: 0, status: "dead" }] },
    })
    await play(stubLlm(dying))
    assert.equal(store.current().encounterId, "battle-on-the-boat")
    assert.equal(lyra(store).healthPercent, 1)
    assert.notEqual(lyra(store).status, "dead")

    // Silas runs on his turn and is out of the encounter, and the fight ends at the crate.
    for (const c of store.current().characters) if (c.name !== "Silas") c.hasReplied = c.isComplete = true
    store.save()
    const runs = { actionSummary: "Silas runs.", beats: [{ kind: "narration", text: "Silas goes over the bow rail." }], actionType: "flee" }
    const round = store.current()._id
    const toTheCrate = stubLlm(() => ({ nextEncounterId: "the-crate", beats: [{ kind: "narration", text: "The river takes him." }], adventurePatch: {} }), undefined, runs)
    await play(toTheCrate)
    assert.equal(store.state!.turns.find((t) => t._id === round)!.characters.find((c) => c.name === "Silas")!.status, "fled")
    // His run is read before the round ends, on a Continue of its own.
    assert.equal(store.current()._id, round)
    await play(toTheCrate)
    assert.equal(store.current().encounterId, "the-crate")
  })
})

test("the stage sends the elves off when they are paid, and lays out the fight's losers", () => {
  const exits = (id: string) => (sceneFor(id)!.staging as { exits?: { cast: string; when?: string; to?: string; via?: unknown[]; lands?: unknown; shot?: string }[] }).exits ?? []
  const paid = exits("the-transaction")
  assert.deepEqual(paid.map((e) => e.cast).sort(), ["npcs-1749184389465", "npcs-1749243735467", "npcs-1749243869357"])
  const intro = pack.artifacts.encounters["the-transaction"].sections.intro ?? ""
  for (const e of paid) {
    assert.ok(intro.includes(e.when!), "the cue is a line of the intro")
    assert.equal(e.to, "trail")
    assert.ok(e.via?.length, "by the gangway, not through the hull")
  }
  assert.deepEqual(
    exits("battle-on-the-boat").map((e) => [e.cast, e.when, e.to]),
    [
      ["npcs-1749163978757", undefined, undefined],
      ["npcs-1749181492795", undefined, "bow"],
    ]
  )
})

test("the fight is written to end with Lyra in the river, on a pier the tug has left", async () => {
  await inTheBattle(async (store, play) => {
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    const stub = stubLlm(() => ({ nextEncounterId: "overboard", beats: [{ kind: "narration", text: "Reinhard heaves her over the rail." }], adventurePatch: {} }))
    const prompts: string[] = []
    await play({
      ...stub,
      generateObject: async (args) => {
        prompts.push(args.prompt)
        return stub.generateObject(args)
      },
    })
    const asked = prompts.find((p) => p.includes("most likely")) ?? ""
    assert.match(asked, /throw her over the side into the river and cast off with the crate for Kordavos\. This is the most likely way the fight ends/)
    assert.equal(store.current().encounterId, "overboard")
    assert.match(storyText(store.current().story), /The river closes over Lyra/)
    assert.deepEqual(
      store.current().characters.map((c) => c.type),
      ["pc", "pc", "pc"]
    )
    const scene = sceneFor("overboard")!
    assert.equal(scene.set.title, "The pier after the tug has gone")
    for (const gone of ["saloon", "crate", "cabinDoor", "bow", "stern"]) assert.equal(gone in scene.set.marks, false, gone)
    const where = spatialContext("overboard", store.current().characters, {}) ?? ""
    assert.match(where, /Lyra Silvanus \(-0\.9, 5\.6\)/)
    assert.match(where, /Thalbern \(-1\.4, -6\.4\)/)
    assert.doesNotMatch(where, /the tug's saloon/)
  })
})

test("a fight the heroes win follows its own transition, however hurt they are", async () => {
  await inTheBattle(async (store, play) => {
    lyra(store).healthPercent = 30
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    await play(stubLlm(() => ({ nextEncounterId: "the-crate", beats: [{ kind: "narration", text: "Reinhard falls." }], adventurePatch: {} })))
    assert.equal(store.current().encounterId, "the-crate")
  })
})
