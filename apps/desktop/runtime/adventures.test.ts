import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { conditionWords } from "@d20/gm-core/sheet/conditions"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { castIdFor, portraitFor, sceneFor } from "../src/scenes"
import { adventureList, game, type Packs, transitionsOf } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }

test("all four Myr adventures are bundled, share no encounter ids, and start with their own heroes", async () => {
  assert.deepEqual(
    adventureList(packs).map((a) => [a.id, a.title, a.start, a.players]),
    [
      ["welcome-to-kordavos", "Welcome to Kordavos", "the-gates-of-kordavos", [3, 5]],
      ["the-midnight-summons", "The Midnight Summons", "broken-silence", [1, 1]],
      ["covert-cargo", "Covert Cargo", "the-shipment", [3, 3]],
      ["the-road-to-kordavos", "The Road to Kordavos", "well-met", [1, 3]],
    ]
  )
  const ids = Object.values(packs).flatMap((p) => Object.keys(p.artifacts.encounters))
  assert.equal(new Set(ids).size, ids.length)

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
    assert.equal(store.state!.adventure.planId, "welcome-to-kordavos")
    assert.equal(store.current().characters.filter((c) => c.type === "pc").length, 3)
    await assert.rejects(() => run({ kind: "start", provider: "claude", adventure: "not-installed", replace: true }), /not installed/)
    assert.equal(store.state!.adventure.planId, "welcome-to-kordavos")
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the real core plays The Midnight Summons through the owlbear to its ending, and Wollandora's rescue", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-midnight-"))
  const path = join(dir, "save.sqlite")
  const store = new LocalStore(path, transitionsOf(packs))
  const thalbern = () => store.current().characters.find((c) => c.id === "thalbern")!
  // The GM's answer at the round's end: the encounter to go on to, and the round's patch.
  const gm = (next: string, adventurePatch: Record<string, unknown> = {}): Llm => ({
    generateText: unused,
    generateObject: async ({ schema }) => ({ object: schema.parse({ nextEncounterId: next, beats: [{ kind: "narration", text: `Thalbern goes on to ${next}.` }], adventurePatch }) }),
  })
  const everyoneDone = () => {
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
  }
  const staged = (encounterId: string) => {
    // Every Midnight Summons encounter has a scene with a figure for every character in the turn.
    const scene = sceneFor(encounterId)
    assert.ok(scene, encounterId)
    for (const c of store.current().characters) {
      if (scene) assert.equal(castIdFor(scene.staging.cast, c), c.id)
      assert.match(portraitFor(scene, c) ?? "", /^\/stage\/fixtures\/the-midnight-summons\/.+-portrait\.jpg$/)
    }
  }
  try {
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-midnight-summons" })
    // Thalbern fails a Constitution save that puts 1d4 + 10 Bludgeoning at stake. The engine rolls 11 to 14, at
    // least his 11 hit points and short of 11 more, so he drops to 0, Unconscious and dying, not killed outright.
    for (const c of store.current().characters) if (c.id !== "thalbern") c.hasReplied = c.isComplete = true
    Object.assign(thalbern(), {
      hasReplied: true,
      rollRequired: {
        check: { kind: "save", ability: "con" },
        rollType: "Constitution Saving Throw",
        difficulty: 30,
        modifier: 0,
        mode: "normal",
        stakes: [{ on: "failure", target: "thalbern", kind: "damage", dice: "1d4 + 10", type: "bludgeoning" }],
      },
    })
    store.save()
    const told: Llm = {
      generateText: unused,
      generateObject: async ({ schema }) => ({ object: schema.parse({ beats: [{ kind: "narration", text: "The Owlbear is upon him." }] }) }),
    }
    await game(store, packs, told)({ kind: "roll", turnId: store.current()._id, characterId: "thalbern", result: 2 })
    const fell = store.current().story.find((beat) => beat.kind === "roll")
    const harm = fell?.kind === "roll" ? fell.harm : undefined
    assert.deepEqual(
      harm?.map((h) => [h.target, h.kind, h.bonus, h.type]),
      [["thalbern", "damage", 10, "bludgeoning"]]
    )
    assert.ok(harm![0].amount >= 11 && harm![0].amount <= 14)
    assert.deepEqual([thalbern().hitPoints, thalbern().dead, conditionWords(thalbern()).includes("Unconscious")], [0, undefined, true])
    // The round ends with the Owlbear upon him, and he is still dying.
    everyoneDone()
    await game(store, packs, gm("owlbear-confrontation"))({ kind: "continue", turnId: store.current()._id })
    assert.equal(store.current().encounterId, "owlbear-confrontation")
    assert.ok(store.current().characters.some((c) => c.type === "npc" && /owlbear/i.test(c.name)))
    staged("owlbear-confrontation")
    assert.deepEqual([thalbern().hitPoints, conditionWords(thalbern()).includes("Unconscious"), thalbern().deathSaves], [0, true, { successes: 0, failures: 0 }])
    // His turn is a Death Saving Throw against 10, with no bonus, which the player throws. The Owlbear has acted.
    for (const c of store.current().characters) if (c.type === "npc") c.hasReplied = c.isComplete = true
    store.save()
    assert.equal(findCurrentActor(store.current().characters)?.id, "thalbern")
    assert.deepEqual(thalbern().rollRequired, { deathSave: true, rollType: "Death Saving Throw", difficulty: 10, modifier: 0, mode: "normal" })
    // A 12 is a success. No model is asked.
    await game(store, packs, offline)({ kind: "roll", turnId: store.current()._id, characterId: "thalbern", result: 12 })
    const save = store.current().story.at(-1)
    assert.deepEqual(save?.kind === "roll" && [save.check, save.natural, save.modifier, save.total, save.dc, save.success], ["Death Saving Throw", 12, 0, 12, 10, true])
    assert.deepEqual([thalbern().deathSaves, thalbern().isComplete, thalbern().rollRequired], [{ successes: 1, failures: 0 }, true, undefined])
    // The fight would go on, so Wollandora comes, and Thalbern is back at 1 hit point, conscious.
    await game(store, packs, gm("owlbear-confrontation"))({ kind: "continue", turnId: store.current()._id })
    assert.equal(store.current().encounterId, "timely-rescue")
    staged("timely-rescue")
    assert.deepEqual([thalbern().hitPoints, conditionWords(thalbern()).includes("Unconscious"), thalbern().deathSaves, thalbern().rollRequired], [1, false, undefined, undefined])
    for (const next of ["meeting-at-the-stones", "preparing-for-the-city"]) {
      everyoneDone()
      await game(store, packs, gm(next))({ kind: "continue", turnId: store.current()._id })
      assert.equal(store.current().encounterId, next)
      staged(next)
    }
    assert.equal(store.state!.adventure.status, "completed")
    assert.equal(store.current().isFinalEncounter, true)
    assert.deepEqual(
      store.state!.turns.map((t) => t.encounterId),
      ["broken-silence", "owlbear-confrontation", "timely-rescue", "meeting-at-the-stones", "preparing-for-the-city"]
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
