import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { game, type Packs, suggest, transitionsOf } from "./game"
import { LocalStore } from "./store"
import { chapterOf, storyNote } from "./story"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }
const [THALBERN, LYRA, POPPEN] = ["thalbern", "1749159962941", "1749307435667"]

// A GM that moves to `next` and records each prompt it is sent.
function gm(next: string, patch: Record<string, unknown> = {}, prompts: string[] = []): Llm {
  return {
    generateText: async () => ({ text: "The night goes on." }),
    generateObject: async ({ schema, prompt }) => {
      prompts.push(prompt)
      const parsed = schema.safeParse({ nextEncounterId: next, beats: [{ kind: "narration", text: `On to ${next}.` }], adventurePatch: patch })
      if (parsed.success) return { object: parsed.data }
      throw new Error("Unexpected model request")
    },
  }
}
async function playing(run: (store: LocalStore, step: (next: string, patch?: Record<string, unknown>, prompts?: string[]) => Promise<void>) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "d20-story-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  const step = async (next: string, patch: Record<string, unknown> = {}, prompts: string[] = []) => {
    for (const c of store.current().characters) c.hasReplied = c.isComplete = true
    store.save()
    await game(store, packs, gm(next, patch, prompts))({ kind: "continue", turnId: store.current()._id })
  }
  try {
    await run(store, step)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
// The Midnight Summons played to its end, with a find along the way.
async function midnight(store: LocalStore, step: (next: string, patch?: Record<string, unknown>) => Promise<void>) {
  await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-midnight-summons" })
  await step("owlbear-confrontation")
  await step("timely-rescue", {
    summaryDelta: "Thalbern drove off the owlbear with fire and took a feather from its nest.",
    characterUpdates: [{ characterId: THALBERN, healthPercent: 40, status: "Clawed", inventoryChanges: [{ op: "add", name: "Owlbear Feather", description: "Long, barred and grey." }] }],
  })
  await step("meeting-at-the-stones", { summaryDelta: "Wollandora told Thalbern of relics taken from the elven vaults and a riverboat bound for Kordavos." })
  await step("preparing-for-the-city", {
    summaryDelta: "Thalbern accepted the errand and set out down the Mordava after the boat.",
    openThreads: [{ id: "the-boat", title: "The riverboat", text: "A Valkaran-made boat carried the relics downstream toward Kordavos." }],
  })
  assert.equal(store.state!.adventure.status, "completed")
}

test("a finished adventure becomes a chapter cut from what its save holds", async () => {
  await playing(async (store, step) => {
    await midnight(store, step)
    const chapter = chapterOf(store.state!)
    assert.equal(chapter.title, "The Midnight Summons")
    assert.equal(chapter.ending, "Timely Rescue, then Meeting at the Stones, then Preparing for the City")
    assert.deepEqual(chapter.heroes, [{ id: THALBERN, name: "Thalbern" }])
    assert.match(chapter.summary, /took a feather from its nest\.[\s\S]*set out down the Mordava after the boat\.$/)
    assert.deepEqual(chapter.open, ["The riverboat: A Valkaran-made boat carried the relics downstream toward Kordavos."])

    // A long summary keeps its end, in whole paragraphs.
    const long = structuredClone(store.state!)
    long.adventure.adventureSummaryMarkdown = [...Array.from({ length: 30 }, (_, i) => `Round ${i + 1}. ${"The fight went on. ".repeat(6)}`), "The tug cast off with the crate."].join("\n\n")
    const kept = chapterOf(long).summary
    assert.ok(kept.length <= 1200)
    assert.match(kept, /^Round \d+\. /)
    assert.match(kept, /The tug cast off with the crate\.$/)
  })
})

test("continuing carries the story and a hero's gear into the next adventure, and nothing else does", async () => {
  await playing(async (store, step) => {
    await midnight(store, step)
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "covert-cargo",
      replace: true,
      continues: true,
      party: [
        { id: THALBERN, ai: false },
        { id: LYRA, ai: true },
        { id: POPPEN, ai: true },
      ],
    })
    assert.deepEqual(
      store.state!.story?.map((c) => c.title),
      ["The Midnight Summons"]
    )
    // He keeps the feather, gains this adventure's herb pouch, and is whole again.
    const thalbern = store.current().characters.find((c) => c.id === THALBERN)!
    const gear = thalbern.equipment!.map((e) => e.name)
    assert.ok(gear.includes("Owlbear Feather") && gear.includes("Herb Pouch") && gear.includes("Longbow"))
    assert.equal(gear.filter((name) => name === "Longbow").length, 1)
    assert.equal(thalbern.healthPercent, 100)
    assert.ok(!thalbern.status)

    // The GM reads it with the premise, and it outranks the notes.
    const prompts: string[] = []
    await step("the-transaction", {}, prompts)
    const asked = prompts.find((p) => p.includes("THE STORY SO FAR")) ?? ""
    assert.match(asked, /ADVENTURE PREMISE[^\n]*\nLyra, Poppen and Thalbern have never met/)
    assert.match(asked, /THE STORY SO FAR\.[^\n]*what is written here wins[^\n]*A hero knows only a chapter that names them/)
    assert.match(asked, /1\. The Midnight Summons\. Its last scenes: [^\n]*Preparing for the City\. Heroes: Thalbern\.\n[\s\S]*set out down the Mordava after the boat\.\nLeft open: The riverboat: /)

    // Replies offered to a player carry only what their hero lived.
    const offered = async (id: string) => {
      const turn = store.current()
      for (const c of turn.characters) Object.assign(c, { hasReplied: c.id !== id, isComplete: c.id !== id, controlledBy: undefined })
      store.save()
      assert.equal(findCurrentActor(turn.characters)?.id, id)
      let prompt = ""
      const llm: Llm = {
        generateText: unused,
        generateObject: async (args) => {
          prompt = args.prompt
          return { object: args.schema.parse({ suggestions: [{ label: "Wait", text: "Waits." }] }) }
        },
      }
      await suggest(store.state, packs, llm, { kind: "suggest", turnId: turn._id, characterId: id })
      return prompt
    }
    assert.match(await offered(THALBERN), /THE STORY SO FAR[\s\S]*The Midnight Summons/)
    const lyras = await offered(LYRA)
    assert.match(lyras, /ADVENTURE PREMISE/)
    assert.ok(!lyras.includes("THE STORY SO FAR") && !lyras.includes("feather from its nest"))
  })
})

test("chapters add up along the chain, whoever the heroes are, and only through Continue", async () => {
  await playing(async (store, step) => {
    await midnight(store, step)
    // A game started from the Adventures page is fresh.
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "covert-cargo", replace: true })
    assert.equal(store.state!.story, undefined)
    assert.ok(
      !store
        .current()
        .characters.find((c) => c.id === THALBERN)!
        .equipment!.some((e) => e.name === "Owlbear Feather")
    )
  })
  await playing(async (store, step) => {
    await midnight(store, step)
    // Nor does the story go to an adventure the finished one does not lead to.
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "march-of-davos", replace: true, continues: true })
    assert.equal(store.state!.story, undefined)
  })
  await playing(async (store, step) => {
    await midnight(store, step)
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "covert-cargo", replace: true, continues: true })
    // An unfinished adventure hands nothing on.
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-road-to-kordavos", replace: true, continues: true, party: [{ id: await hero(store), ai: false }] })
    assert.equal(store.state!.story, undefined)
  })
  await playing(async (store, step) => {
    await midnight(store, step)
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "covert-cargo", replace: true, continues: true })
    for (const next of ["the-fake", "battle-on-the-boat"]) await step(next)
    await step("the-crate", { summaryDelta: "The heroes took the boat. The crate never left the pier." })
    await step("return-to-the-city")
    assert.equal(store.state!.adventure.status, "completed")
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure: "the-road-to-kordavos", replace: true, continues: true, party: [{ id: await hero(store), ai: false }] })
    assert.deepEqual(
      store.state!.story?.map((c) => [
        c.title,
        c.heroes
          .map((h) => h.name)
          .sort()
          .join(", "),
      ]),
      [
        ["The Midnight Summons", "Thalbern"],
        ["Covert Cargo", "Lyra Silvanus, Poppen Quickfoot, Thalbern"],
      ]
    )
    // The Road's GM knows the crate never left the pier, though none of its heroes were there.
    const note = storyNote(store.state!.story)
    assert.match(note, /2\. Covert Cargo\. Its last scenes: Battle on the Boat, then The Crate, then Return to the City\./)
    assert.match(note, /The crate never left the pier\./)
    assert.equal(storyNote(store.state!.story, store.current().characters.find((c) => c.type === "pc")!.id), "")
    const prompts: string[] = []
    await step("the-gates-ahead", {}, prompts)
    assert.ok(prompts.some((p) => p.includes("The crate never left the pier.") && p.includes("the gossip follows what happened there")))
  })
})

// A roster hero the Road and March of Davos both accept.
async function hero(store: LocalStore) {
  const { heroCommand } = await import("./heroes")
  await heroCommand(
    {
      kind: "saveHero",
      hero: {
        name: "Sera Vale",
        race: "Elf",
        archetype: "Wizard",
        gender: "Female",
        image: "",
        appearance: "A tall elf in a grey cloak.",
        personality: "Curious.",
        background: "A scholar from the coast.",
        motivation: "Old lore.",
        behavior: "Asks questions.",
        healthPercent: 100,
        type: "pc" as const,
        attributes: { strength: 9, dexterity: 13, constitution: 11, intelligence: 16, wisdom: 12, charisma: 11 },
        equipment: [{ name: "Staff", description: "Ash." }],
        skills: ["Arcana"],
        spells: [],
        specialAbilities: [],
        effects: [],
        figure: "elf-b",
      },
    },
    store,
    packs,
    offline
  )
  return store.heroes()[0].id
}
