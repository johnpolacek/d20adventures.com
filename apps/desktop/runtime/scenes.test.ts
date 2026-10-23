import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { castIdFor, portraitFor, SCENES, sceneFor, spatialContext } from "../src/scenes"
import { game, type Packs } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["march-of-davos"]
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "d20-scenes-"))
  const path = join(dir, "save.sqlite")
  let store = new LocalStore(path, pack.artifacts.graph.encounterTransitions)
  await game(store, packs, { generateText: unused, generateObject: unused })({ kind: "start", provider: "claude" })
  return {
    get store() {
      return store
    },
    reopen() {
      store.close()
      store = new LocalStore(path, pack.artifacts.graph.encounterTransitions)
    },
    close() {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
// The real core advances the round to `encounter`; returns the GM prompt so map staging can be checked.
async function advance(store: LocalStore, encounter: string) {
  store.current().characters.forEach((c) => {
    c.hasReplied = true
    c.isComplete = true
  })
  store.save()
  let prompt = ""
  const llm: Llm = {
    generateText: unused,
    async generateObject({ schema, prompt: text }) {
      prompt = text
      return { object: schema.parse({ nextEncounterId: encounter, beats: [{ kind: "narration", text: "The party moves on." }], adventurePatch: {} }) }
    },
  }
  await game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
  return prompt
}
const positions = (store: LocalStore, value: Record<string, { x: number; z: number; ry: number }>, appliedMovement?: string, turnId = store.current()._id) =>
  game(store, packs, { generateText: unused, generateObject: unused })({ kind: "positions", turnId, positions: value, appliedMovement })

test("every authored scene is a real encounter, and every festival character has its own figure and portrait", async () => {
  for (const id of Object.keys(SCENES))
    assert.ok(
      Object.values(packs).some((p) => p.artifacts.encounters[id]),
      `${id} is an encounter`
    )
  const run = await setup()
  try {
    await advance(run.store, "the-front-of-the-line")
    await advance(run.store, "the-harvest-festival")
    const turn = run.store.current()
    const scene = sceneFor(turn.encounterId)
    assert.ok(scene)
    assert.equal(turn.characters.length, 9)
    // Content ids, so "Liora the Spice Merchant" can never resolve to the unrelated `liora` assassin.
    assert.deepEqual(
      turn.characters.map((c) => castIdFor(scene.staging.cast, c)),
      turn.characters.map((c) => c.id)
    )
    assert.equal(castIdFor(scene.staging.cast, { id: "liora", name: "Cowled Assassin" }), undefined)
    for (const c of turn.characters) assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/march-of-davos\/.+-portrait\.jpg$/)
  } finally {
    run.close()
  }
})

test("the gate keeps first-name figures, Clan Conflict and the Dragonbone Inn have their scenes, and an encounter without one falls back to story view", async () => {
  const run = await setup()
  try {
    // The heroes wait in the line alone, then meet Garlan at the front.
    for (const [encounter, cast] of [
      ["the-gates-of-kordavos", ["branka", "cassia", "milos", "yeva"]],
      ["the-front-of-the-line", ["branka", "cassia", "garlan", "milos", "yeva"]],
    ] as const) {
      if (run.store.current().encounterId !== encounter) await advance(run.store, encounter)
      const gate = sceneFor(run.store.current().encounterId)
      assert.ok(gate)
      assert.deepEqual(
        run.store
          .current()
          .characters.map((c) => castIdFor(gate.staging.cast, c))
          .sort(),
        cast
      )
    }
    await advance(run.store, "the-harvest-festival")
    await advance(run.store, "clan-conflict")
    // The two leaders stand on the festival square with figures of their own.
    const conflict = run.store.current()
    const scene = sceneFor(conflict.encounterId)
    assert.ok(scene)
    const leaders = conflict.characters.filter((c) => c.type === "npc")
    assert.deepEqual(leaders.map((c) => c.id).sort(), ["barok-redbeard", "larya-halloway"])
    for (const c of leaders) {
      assert.equal(castIdFor(scene.staging.cast, c), c.id)
      assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/march-of-davos\/.+-portrait\.jpg$/)
    }
    // The inn's three scenes: Bram, then Beric and Eamon, then Elara, each with a figure and a portrait of their own.
    for (const [encounter, npcs] of [
      ["the-dragonbone-inn", ["bram"]],
      ["an-unsolicited-opportunity", ["beric", "eamon"]],
      ["morning-at-the-dragonbone", ["bram", "elara"]],
    ] as const) {
      await advance(run.store, encounter)
      const inn = run.store.current()
      const scene = sceneFor(inn.encounterId)
      assert.ok(scene, encounter)
      const people = inn.characters.filter((c) => c.type === "npc")
      assert.deepEqual(people.map((c) => c.id).sort(), npcs)
      for (const c of people) {
        assert.equal(castIdFor(scene.staging.cast, c), c.id)
        assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/march-of-davos\/.+-portrait\.jpg$/)
      }
      assert.match(spatialContext(inn.encounterId, inn.characters, {}) ?? "", /Dragonbone Inn[\s\S]*the corner table/)
    }
    await advance(run.store, "the-old-grand-library")
    const turn = run.store.current()
    assert.equal(turn.encounterId, "the-old-grand-library")
    assert.equal(sceneFor(turn.encounterId), undefined)
    assert.equal(spatialContext(turn.encounterId, turn.characters, {}), undefined)
    // Story view keeps the party's faces from the authored scenes.
    for (const pc of turn.characters.filter((c) => c.type === "pc")) assert.ok(portraitFor(undefined, pc))
  } finally {
    run.close()
  }
})

test("positions reset on a new encounter, persist through rounds and reopening, and a walk from a round already ended is kept only in its encounter", async () => {
  const run = await setup()
  try {
    const gateTurn = run.store.current()._id
    await positions(run.store, { branka: { x: 1, z: 12, ry: 0 } })
    await advance(run.store, "the-front-of-the-line")
    assert.deepEqual(run.store.state!.positions, {})
    await positions(run.store, { branka: { x: 2, z: 12, ry: 0 } }, undefined, gateTurn)
    assert.deepEqual(run.store.state!.positions, {})
    await assert.rejects(() => positions(run.store, { branka: { x: 2, z: 12, ry: 0 } }, undefined, "no-such-turn"), /not in the saved adventure/)
    await advance(run.store, "the-harvest-festival")

    // A walk is saved once with its movement key, so reopening never replays it.
    const key = `${run.store.current()._id}:cassia-verane`
    await assert.rejects(() => positions(run.store, { "cassia-verane": { x: -10, z: 3.9, ry: 1 } }, key), /Unknown stage movement/)
    run.store.state!.movement[key] = { actorId: "cassia-verane", intent: { move: "place", place: "jewelStall", pace: "walk", summary: "to the jewel stall" } }
    await positions(run.store, { "cassia-verane": { x: -10, z: 3.9, ry: 1 } }, key)
    run.reopen()
    assert.deepEqual(run.store.state!.positions["cassia-verane"], { x: -10, z: 3.9, ry: 1 })
    assert.deepEqual(run.store.state!.appliedMovement, [key])

    // The next festival round keeps where everyone stands, and the GM sees it with the square's named places.
    const prompt = await advance(run.store, "the-harvest-festival")
    assert.equal(run.store.current().encounterId, "the-harvest-festival")
    assert.equal(run.store.state!.turns.length, 4)
    assert.deepEqual(run.store.state!.positions["cassia-verane"], { x: -10, z: 3.9, ry: 1 })
    assert.match(prompt, /festival square/)
    assert.match(prompt, /Karim's jewel stall \(-11\.8, 3\.9\)/)
    assert.match(prompt, /Cassia Verane \(-10\.0, 3\.9\)/)
    assert.match(prompt, /Madam Zephyra \(-12\.4, -6\.7\)/)

    // A walk read after the round's end was written is kept, since the next round is in the same square.
    const lastRound = run.store.state!.turns.at(-2)!._id
    await positions(run.store, { "cassia-verane": { x: -8, z: 3, ry: 0 } }, undefined, lastRound)
    assert.deepEqual(run.store.state!.positions["cassia-verane"], { x: -8, z: 3, ry: 0 })

    await advance(run.store, "clan-conflict")
    assert.deepEqual(run.store.state!.positions, {})
  } finally {
    run.close()
  }
})
