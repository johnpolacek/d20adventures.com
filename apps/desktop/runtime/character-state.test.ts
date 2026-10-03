import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { adventurePatchSchema } from "@d20/gm-core/wiki-adventures/adventure-patch"
import { z } from "zod"
import { strictModelSchema } from "../../desktop-spike/harness/strict-state.mjs"
import { characterInfo } from "../src/character-info"
import { applyCharacterUpdates, desktopPatchSchema, nextCharacterState } from "./characters"
import { game, type Packs } from "./game"
import { schemaLlm } from "./llm"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
const pack = packs["march-of-davos"]
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "d20-character-state-"))
  const path = join(dir, "save.sqlite")
  let store = new LocalStore(path, pack.artifacts.graph.encounterTransitions)
  await game(store, packs, offline)({ kind: "start", provider: "claude" })
  const pc = store.current().characters.find((c) => c.name.startsWith("Cassia"))!
  const giver = store.current().characters.find((c) => c.name.startsWith("Branka"))!
  const npc = store.current().characters.find((c) => c.type === "npc")!
  pc.equipment = [{ name: "Potion" }, { name: "Potion" }]
  pc.effects = [
    { name: "Fatigue", description: "Tired", duration: 1 },
    { name: "Ward", description: "Protected", duration: 3 },
  ]
  pc.spells = [{ name: "Light", isUsed: false }]
  pc.rollRequired = { rollType: "Persuasion", difficulty: 10 }
  pc.rollResult = 14
  giver.equipment = [{ name: "Rope", description: "Ten metres" }]
  store.save()
  return {
    get store() {
      return store
    },
    path,
    pc: structuredClone(pc),
    giver: structuredClone(giver),
    npc: structuredClone(npc),
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

function complete(store: LocalStore) {
  store.current().characters.forEach((c) => {
    c.hasReplied = true
    c.isComplete = true
  })
  store.save()
}
async function advance(store: LocalStore, patch: unknown, encounter = store.current().encounterId) {
  complete(store)
  let prompt = ""
  const llm: Llm = {
    generateText: unused,
    async generateObject({ schema, prompt: text }) {
      prompt = text
      return { object: schema.parse({ nextEncounterId: encounter, narrative: "The party continues.", adventurePatch: patch }) }
    },
  }
  await game(store, packs, llm)({ kind: "continue", turnId: store.current()._id })
  return prompt
}
const byId = (store: LocalStore, id: string) => store.current().characters.find((c) => c.id === id)!

test("real turns transfer items, apply conditions/spell use, preserve history and resume without duplication", async () => {
  const t = await setup()
  try {
    complete(t.store)
    const before = structuredClone(t.store.current())
    const prompt = await advance(t.store, {
      characterUpdates: [
        {
          characterId: t.pc.id,
          healthPercent: 65,
          status: "Wounded",
          inventoryChanges: [
            { op: "remove", name: "potion" },
            { op: "add", name: "Rope", description: "Ten metres" },
            { op: "add", name: "Gate token" },
          ],
          effectChanges: [{ op: "set", name: "Blessing", description: "Steady hands", duration: 2 }],
          spellUseChanges: [{ name: "Light", isUsed: true }],
        },
        { characterId: t.giver.id, inventoryChanges: [{ op: "remove", name: "Rope" }] },
        { characterId: t.npc.id, healthPercent: 20, status: "Injured", inventoryChanges: [{ op: "add", name: "Ribbon" }] },
      ],
    })
    assert.match(prompt, /CURRENT SAVED CHARACTER STATE/)
    assert.match(prompt, /"name":"Potion"/)
    assert.deepEqual(t.store.state!.turns[0], before)
    const c = byId(t.store, t.pc.id)
    assert.equal(c.healthPercent, 65)
    assert.equal(c.status, "Wounded")
    assert.deepEqual(
      c.equipment!.map((e) => e.name),
      ["Potion", "Rope", "Gate token"]
    )
    assert.deepEqual(byId(t.store, t.giver.id).equipment, [])
    assert.deepEqual(
      c.effects!.map((e) => [e.name, e.duration]),
      [
        ["Ward", 2],
        ["Blessing", 2],
      ]
    )
    assert.equal(c.spells![0].isUsed, true)
    assert.equal(c.rollRequired, undefined)
    assert.equal(c.rollResult, undefined)
    const snapshot = JSON.stringify(t.store.state)
    await assert.rejects(() => game(t.store, packs, offline)({ kind: "continue", turnId: before._id }), /already advanced/)
    assert.equal(JSON.stringify(t.store.state), snapshot)
    t.reopen()
    assert.equal(JSON.stringify(t.store.state), snapshot)

    const cardText = characterInfo(byId(t.store, t.pc.id))
      .details!.flatMap((section) => section.items)
      .join("\n")
    for (const text of ["Health: 65%", "Wounded", "Gate token", "Rope. Ten metres", "Blessing, 2 rounds left", "Light, used"]) assert.ok(cardText.includes(text), text)

    await advance(t.store, { characterUpdates: [{ characterId: t.pc.id, status: "", effectChanges: [{ op: "remove", name: "Blessing" }] }] }, "the-harvest-festival")
    const festival = byId(t.store, t.pc.id)
    assert.equal(festival.healthPercent, 65, "premade health must not replace live health")
    assert.equal(festival.status, undefined)
    assert.deepEqual(festival.equipment, c.equipment, "equipment must survive the encounter change")
    assert.deepEqual(
      festival.effects!.map((e) => [e.name, e.duration]),
      [["Ward", 1]]
    )
    assert.equal(festival.spells![0].isUsed, false, "spells recharge on an encounter change")
    assert.equal(
      t.store.current().characters.some((c) => c.id === t.npc.id),
      false
    )
    assert.equal(t.store.state!.characterStates![t.npc.id].healthPercent, 20)
    t.reopen()
    await advance(t.store, {})
    assert.deepEqual(byId(t.store, t.pc.id).effects, [])
    assert.equal(byId(t.store, t.pc.id).healthPercent, 65)
    const returned = nextCharacterState({ current: t.store.current().characters, next: [t.npc], remembered: t.store.state!.characterStates!, updates: [], encounterChanged: true })
    assert.equal(returned.characters[0].healthPercent, 20)
    assert.ok(returned.characters[0].equipment!.some((e) => e.name === "Ribbon"))
  } finally {
    t.close()
  }
})

test("refreshes do not stack effects, fallen PCs stay on the sheet, and later healing clears death", async () => {
  const t = await setup()
  try {
    await advance(t.store, { characterUpdates: [{ characterId: t.pc.id, healthPercent: 0, status: "dead", effectChanges: [{ op: "set", name: "Ward", description: "Stronger ward", duration: 4 }] }] })
    assert.equal(byId(t.store, t.pc.id).isComplete, true)
    await advance(t.store, {})
    assert.equal(byId(t.store, t.pc.id).healthPercent, 0)
    assert.deepEqual(byId(t.store, t.pc.id).effects, [{ name: "Ward", description: "Stronger ward", duration: 3 }])
    await advance(t.store, { characterUpdates: [{ characterId: t.pc.id, healthPercent: 40, status: "", spellUseChanges: [{ name: "Light", isUsed: false }] }] })
    assert.equal(byId(t.store, t.pc.id).isComplete, false)
    assert.equal(byId(t.store, t.pc.id).status, undefined)
    assert.equal(byId(t.store, t.pc.id).healthPercent, 40)
  } finally {
    t.close()
  }
})

test("invalid character patches cannot partly advance, mutate the save, or fall back to summary-only", async () => {
  const t = await setup()
  try {
    complete(t.store)
    const before = JSON.stringify(t.store.state)
    const invalid = [
      [{ characterId: "unknown", healthPercent: 50 }],
      [{ characterId: t.pc.id, inventoryChanges: ["receives a shield"] }],
      [
        {
          characterId: t.pc.id,
          inventoryChanges: [
            { op: "add", name: "Shield" },
            { op: "remove", name: "Missing sword" },
          ],
        },
      ],
      [{ characterId: t.pc.id, spellUseChanges: [{ name: "Unknown spell", isUsed: true }] }],
      [{ characterId: t.pc.id, effectChanges: [{ op: "remove", name: "Absent" }] }],
      [{ characterId: t.pc.id, effectChanges: [{ op: "set", name: "Ward", description: "Invalid", duration: 0 }] }],
      [{ characterId: t.pc.id, healthPercent: 101 }],
      [{ characterId: t.pc.id, status: "Fine", unrecognizedField: true }],
      [
        { characterId: t.pc.id, status: "Fine" },
        { characterId: t.pc.id, status: "Wounded" },
      ],
    ]
    for (const characterUpdates of invalid) {
      await assert.rejects(() => advance(t.store, { summaryDelta: "Must not commit", characterUpdates }))
      assert.equal(JSON.stringify(t.store.state), before)
      t.reopen()
      assert.equal(JSON.stringify(t.store.state), before)
    }
  } finally {
    t.close()
  }
})

test("CLI correction retains every typed operation and rejects invented references before persistence", async () => {
  const t = await setup()
  try {
    const valid = {
      characterUpdates: [
        {
          characterId: t.pc.id,
          inventoryChanges: [
            { op: "add", name: "Token" },
            { op: "remove", name: "Potion" },
          ],
          effectChanges: [
            { op: "set", name: "Blessing", description: "Calm", duration: 2 },
            { op: "remove", name: "Fatigue" },
          ],
          spellUseChanges: [{ name: "Light", isUsed: true }],
        },
      ],
    }
    assert.deepEqual(strictModelSchema(adventurePatchSchema).parse(valid), valid)
    assert.deepEqual(adventurePatchSchema.parse(desktopPatchSchema.parse(valid)), valid)
    const prompts: string[] = []
    const llm = schemaLlm(
      async (prompt) => {
        prompts.push(prompt)
        return JSON.stringify({ adventurePatch: prompts.length === 1 ? { characterUpdates: [{ characterId: t.pc.id, inventoryChanges: [{ op: "remove", name: "Missing sword" }] }] } : valid })
      },
      (patch) => {
        applyCharacterUpdates(t.store.current().characters, patch.characterUpdates)
      }
    )
    const result = await llm.generateObject({ prompt: "Resolve the turn", schema: z.object({ adventurePatch: z.unknown() }) })
    assert.equal(prompts.length, 2)
    assert.match(prompts[1], /does not have Missing sword/)
    assert.deepEqual(result.object.adventurePatch, valid)
    assert.deepEqual(t.store.current().characters.find((c) => c.id === t.pc.id)!.equipment, t.pc.equipment)
    const legacy = { characterUpdates: [{ characterId: t.pc.id, inventoryChanges: ["gained a token"] }] }
    assert.deepEqual(adventurePatchSchema.parse(legacy), legacy, "historical prose remains readable")
    assert.throws(() => desktopPatchSchema.parse(legacy), "new desktop writes require explicit changes")
    let omitted = 0
    const incomplete = schemaLlm(async () => {
      omitted++
      return JSON.stringify({ adventurePatch: { summaryDelta: "Forgot the state review" } })
    })
    await assert.rejects(() => incomplete.generateObject({ prompt: "Resolve the turn", schema: z.object({ adventurePatch: z.unknown().optional() }) }), /invalid response twice/)
    assert.equal(omitted, 2, "even a no-change response must explicitly review character updates")
  } finally {
    t.close()
  }
})

test("storage validates the whole patch before writing and a duplicate commit cannot replay changes", async () => {
  const t = await setup()
  try {
    complete(t.store)
    const turn = t.store.current()
    const args = {
      adventureId: turn.adventureId,
      expectedCurrentTurnId: turn._id,
      expectedCurrentEncounterId: turn.encounterId,
      nextEncounterId: turn.encounterId,
      title: turn.title,
      narrative: "The guard gives Cassia a token.",
      characters: turn.characters,
      order: turn.order + 1,
    }
    const before = JSON.stringify(t.store.state)
    await assert.rejects(
      () =>
        t.store.commitWikiTurnAdvance({
          ...args,
          adventurePatch: {
            characterUpdates: [
              { characterId: t.pc.id, healthPercent: 45, inventoryChanges: [{ op: "add", name: "Token" }] },
              { characterId: t.giver.id, inventoryChanges: [{ op: "remove", name: "Absent" }] },
            ],
          },
        }),
      /does not have/
    )
    assert.equal(JSON.stringify(t.store.state), before)
    t.reopen()
    assert.equal(JSON.stringify(t.store.state), before)
    const patch = { characterUpdates: [{ characterId: t.pc.id, inventoryChanges: [{ op: "add" as const, name: "Token" }] }] }
    await t.store.commitWikiTurnAdvance({ ...args, adventurePatch: patch })
    const accepted = JSON.stringify(t.store.state)
    await assert.rejects(() => t.store.commitWikiTurnAdvance({ ...args, adventurePatch: patch }), /already advanced/)
    assert.equal(JSON.stringify(t.store.state), accepted)
    assert.equal(byId(t.store, t.pc.id).equipment!.filter((e) => e.name === "Token").length, 1)
  } finally {
    t.close()
  }
})
