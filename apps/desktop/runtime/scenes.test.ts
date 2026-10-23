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

test("the gate keeps first-name figures, Clan Conflict, the Dragonbone Inn, the Old Grand Library, the Silver Serpent, the docks, the Lower Districts, the Black Market, the street, cellar and tunnel kits have their scenes, and an encounter without one falls back to story view", async () => {
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
    // The authored March of Davos scenes after the square, each NPC with a figure and a portrait of their own.
    for (const [encounter, npcs, where] of [
      ["the-dragonbone-inn", ["bram"], /Dragonbone Inn[\s\S]*the corner table/],
      ["an-unsolicited-opportunity", ["beric", "eamon"], /Dragonbone Inn[\s\S]*the corner table/],
      ["morning-at-the-dragonbone", ["bram", "elara"], /Dragonbone Inn[\s\S]*the corner table/],
      ["the-old-grand-library", ["eldrin-varokich", "sister-danica"], /Old Grand Library[\s\S]*the red door/],
      ["the-silver-serpent-tavern", ["harron"], /Silver Serpent[\s\S]*the carved sea map/],
      ["arrival-at-the-docks", ["loric-windrider", "petra-velan", "tor-marros"], /Kordavos docks[\s\S]*Warehouse 14/],
      ["mystery-cargo", ["scarface-alaric", "warehouse-thug"], /Warehouse 14[\s\S]*the chained crate/],
      ["the-beast-escapes", ["astrid-blackthorn", "forest-drake"], /drake[\s\S]*the gangway/],
      ["the-aftermath", ["astrid-blackthorn", "petra-velan"], /burst open[\s\S]*the cargo hatch/],
      ["an-invitation", ["astrid-blackthorn"], /invitation[\s\S]*the quay/],
      ["welcome-to-the-lower-districts", [], /Lower Districts[\s\S]*the archway under the bridge-house/],
      ["beset-by-street-urchins", ["finn-swiftfoot", "mara-redleaf"], /urchins[\s\S]*the mouth of the side alley/],
      ["finding-the-black-market", [], /crooked dagger[\s\S]*the carved sign in the paving/],
      ["the-entrance-to-the-black-market", ["garrick"], /crumbling buildings[\s\S]*the curtained doorway/],
      ["labyrinthine-stalls", ["grendel-one-eye", "mizrith-the-cackler", "rae-the-scarred", "vera-azimov"], /Black Market[\s\S]*the auction house door/],
    ] as const) {
      await advance(run.store, encounter)
      const here = run.store.current()
      const scene = sceneFor(here.encounterId)
      assert.ok(scene, encounter)
      const people = here.characters.filter((c) => c.type === "npc")
      assert.deepEqual(people.map((c) => c.id).sort(), npcs)
      for (const c of people) {
        assert.equal(castIdFor(scene.staging.cast, c), c.id)
        assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/march-of-davos\/.+-portrait\.jpg$/)
      }
      assert.match(spatialContext(here.encounterId, here.characters, {}) ?? "", where)
    }
    await advance(run.store, "the-auction-begins")
    const turn = run.store.current()
    assert.equal(turn.encounterId, "the-auction-begins")
    assert.equal(sceneFor(turn.encounterId), undefined)
    assert.equal(spatialContext(turn.encounterId, turn.characters, {}), undefined)
    // Story view keeps the party's faces from the authored scenes.
    for (const pc of turn.characters.filter((c) => c.type === "pc")) assert.ok(portraitFor(undefined, pc))
    // The street kit's scenes, after the auction. Bram waits at the inn during the ambush, so he has no figure there.
    await advance(run.store, "a-relic-of-old-valkara")
    await advance(run.store, "the-winning-bid")
    for (const [encounter, npcs, figures, where] of [
      ["shadowing-silverhand", ["aldith", "kaelen", "silverhand", "silverhand-representative"], 4, /old lanes[\s\S]*the archway under the bridge-house/],
      ["the-hideout", ["aldith", "kaelen"], 2, /abandoned warehouse[\s\S]*the hideout's door/],
      ["face-to-face-with-silverhand", ["silverhand"], 1, /back room[\s\S]*Silverhand's end of the table/],
      ["the-ambush", ["bram", "liora", "silas"], 2, /hooded archer[\s\S]*the door with the arrow in it/],
    ] as const) {
      await advance(run.store, encounter)
      const here = run.store.current()
      const people = here.characters.filter((c) => c.type === "npc")
      assert.deepEqual(people.map((c) => c.id).sort(), npcs)
      if (!where) continue
      const scene = sceneFor(here.encounterId)
      assert.ok(scene, encounter)
      const staged = people.filter((c) => castIdFor(scene.staging.cast, c) === c.id)
      assert.equal(staged.length, figures, encounter)
      for (const c of staged) assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/march-of-davos\/.+-portrait\.jpg$/)
      assert.match(spatialContext(here.encounterId, here.characters, {}) ?? "", where)
    }
    // The endings in the great square, reached only through the final choice.
    const party = run.store.current().characters
    assert.match(spatialContext("the-new-dawn", party, {}) ?? "", /Key of Ilmarin[\s\S]*the balcony/)
    assert.match(spatialContext("vengeance-of-the-blackthorn", party, {}) ?? "", /coffin[\s\S]*the bier/)
    // The wine cellar, below the mansion.
    assert.match(spatialContext("the-wine-cellar", party, {}) ?? "", /barrel vault[\s\S]*the rack on the far wall/)
    // The catacombs, reached from the mansion's grounds.
    assert.match(spatialContext("into-the-catacombs", party, {}) ?? "", /powder kegs[\s\S]*the end of the fuse/)
    assert.match(spatialContext("through-the-labyrinth", party, {}) ?? "", /two forks[\s\S]*the crystal runes/)
    assert.match(spatialContext("the-sealed-door", party, {}) ?? "", /black iron door[\s\S]*the black iron door/)
    assert.match(spatialContext("big-empty", party, {}) ?? "", /grey dust[\s\S]*the archway at the far end/)
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
