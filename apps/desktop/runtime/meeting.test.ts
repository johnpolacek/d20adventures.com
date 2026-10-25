import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import { authoredText } from "@d20/gm-core/story/authored"
import type { StoryBeat } from "@d20/gm-core/story/beats"
import { cleanLearned, knowledgeNote, ledgerNote } from "@d20/gm-core/story/knowledge"
import { heardNames, namesHeard, namesMetBefore, namesNote, unheardNote } from "@d20/gm-core/story/names"
import { storyNames } from "@d20/gm-core/story/render"
import { game, type Packs, suggest, transitionsOf } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }
const [THALBERN, MILOS, BRANKA, GARLAN] = ["thalbern", "milos-radan", "branka-stoneveil", "garlan-ironfist"]
const gate = packs["march-of-davos"].artifacts.encounters["the-gates-of-kordavos"]

const cast = [
  { id: THALBERN, name: "Thalbern", type: "pc" },
  { id: MILOS, name: "Milos Radan", type: "pc" },
  { id: BRANKA, name: "Branka Stoneveil", type: "pc" },
  { id: GARLAN, name: "Garlan Ironfist", type: "npc" },
]
const line = (speaker: string, text: string, more: Partial<StoryBeat> = {}): StoryBeat => ({ kind: "line", by: { step: "reply", character: speaker }, speaker, text, ...more }) as StoryBeat

// A GM that plays every step it is asked for and keeps each prompt: an AI hero's move or an NPC's turn as one quiet
// action, and the end of a round that goes on to `encounter`, by default staying where it is.
function table(prompts: string[], answers: { beats?: unknown[]; encounter?: string } = {}): Llm {
  return {
    generateText: unused,
    generateObject: async ({ schema, prompt }) => {
      prompts.push(prompt)
      const who = prompt.match(/THE CURRENT NPC IS: [^(]+\(ID: ([^,]+),/)?.[1] ?? prompt.match(/an action by "([^"]+)"/)?.[1]
      for (const answer of [
        { nextEncounterId: answers.encounter, beats: answers.beats ?? [{ kind: "narration", text: "The line shuffles forward." }], knowledge: [], adventurePatch: {} },
        { actionSummary: "Waits.", beats: [{ kind: "action", who, text: "Waits and watches." }], actionType: "skip" },
        { beats: [{ kind: "action", who, text: "Waits and watches." }] },
        { suggestions: [{ label: "Wait", text: "Waits." }] },
        { rollType: "none", difficulty: 0 },
      ]) {
        const parsed = schema.safeParse(answer)
        if (parsed.success) return { object: parsed.data }
      }
      throw new Error("Unexpected model request")
    },
  }
}

async function atTheGate(run: (store: LocalStore) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "d20-meeting-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "march-of-davos",
      party: [
        { id: BRANKA, ai: false },
        { id: THALBERN, ai: true },
        { id: MILOS, ai: true },
      ],
    })
    await run(store)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

// The character `id` plays its turn with everyone else done. The prompt it was played from.
async function turnOf(store: LocalStore, id: string): Promise<string> {
  const turn = store.current()
  for (const c of turn.characters) Object.assign(c, { hasReplied: c.id !== id, isComplete: c.id !== id })
  store.save()
  const prompts: string[] = []
  await game(store, packs, table(prompts, { encounter: turn.encounterId }))({ kind: "continue", turnId: turn._id })
  const played = prompts.filter((p) => p.includes("You are the PLAYER (not the GM)") || p.includes("THE CURRENT NPC IS"))
  assert.equal(played.length, 1, `${id} played once`)
  return played[0]
}

async function endRound(store: LocalStore, beats?: unknown[], encounter = store.current().encounterId): Promise<string> {
  for (const c of store.current().characters) Object.assign(c, { hasReplied: true, isComplete: true })
  store.save()
  const prompts: string[] = []
  await game(store, packs, table(prompts, { beats, encounter }))({ kind: "continue", turnId: store.current()._id })
  return prompts.find((p) => p.includes("Available Transition Options")) ?? ""
}

test("a hero's name is heard by everyone present when said aloud, and only by those in it when said in private", () => {
  const story: StoryBeat[] = [
    line(GARLAN, "Branka Stoneveil. A Stoneveil at my gate, after all these years."),
    line(THALBERN, "Thalbern, of the Valkarr woods.", { to: GARLAN, private: true }),
    line(MILOS, "I am a Wayfinder. Branka, will you stand with an old priest?"),
    // A name inside another word, or the narrator's own, is no name heard.
    { kind: "narration", by: { step: "round" }, text: "Milos Radan smiles at the dwarf." },
    line(BRANKA, "Thalberns are a kind of fish where I come from."),
  ]
  assert.deepEqual(
    heardNames(story, cast).map((f) => [f.id, f.knownBy]),
    [
      ["name-branka-stoneveil", [THALBERN, MILOS, GARLAN]],
      ["name-thalbern", [GARLAN]],
    ]
  )
  const heard = namesHeard([{ id: "name-milos-radan", text: "Milos Radan's name", knownBy: [GARLAN] }], { story, characters: cast })
  assert.equal(heard(MILOS, BRANKA), true, "said in the open")
  assert.equal(heard(MILOS, THALBERN), false, "whispered to Garlan")
  assert.equal(heard(GARLAN, MILOS), true, "kept in the ledger")
  assert.equal(heard(BRANKA, MILOS), false)
  assert.equal(heard(THALBERN, THALBERN), true, "a hero knows their own")

  assert.equal(
    unheardNote(heard, cast[2], cast),
    "NAMES BRANKA STONEVEIL HAS NOT HEARD: Thalbern, Milos Radan. To Branka Stoneveil these are strangers, known only by how they look and what they have said and done. Branka Stoneveil does not say these names until the story shows them said where Branka Stoneveil could hear, and may ask them."
  )
  assert.equal(
    unheardNote(() => true, cast[2], cast),
    "",
    "nothing to say once every name is heard"
  )
  assert.match(namesNote(heard, cast), /^NAMES NOT YET HEARD\.[^\n]*\n- Thalbern: not heard by Milos Radan, Branka Stoneveil\n- Milos Radan: not heard by Thalbern, Branka Stoneveil$/)

  // Heroes who come on together know each other. A group says nothing of anyone outside it.
  assert.deepEqual(
    namesMetBefore([[THALBERN, MILOS, "gone-hero"]], cast.slice(0, 3)).map((f) => [f.id, f.knownBy]),
    [
      ["name-thalbern", [MILOS]],
      ["name-milos-radan", [THALBERN]],
    ]
  )
})

test("names live in the ledger apart from the facts, and a name the GM records is made the hero's own", () => {
  const scene = { cast }
  assert.deepEqual(
    cleanLearned(
      [
        { id: "name-Branka", text: "Milos read Branka's name in the gate book.", knownBy: ["Milos Radan"] },
        { id: "name-milos-radan", text: "Milos's name.", knownBy: [BRANKA] },
      ],
      scene
    ).map((f) => f.id),
    ["name-branka-stoneveil", "name-milos-radan"]
  )
  const known = [
    { id: "name-branka-stoneveil", text: "Branka Stoneveil's name", knownBy: [MILOS] },
    { id: "gate-shuts-at-dusk", text: "The gate shuts at dusk.", knownBy: [MILOS] },
  ]
  assert.equal(knowledgeNote(known, cast[1]).split("\n").length, 2, "Milos's note lists one fact")
  assert.ok(!/name/.test(ledgerNote(known, storyNames(cast), true)), "the GM's ledger lists no names")
})

test("the gate's intro shows each hero in the party as the others see them, and no hero who is not there", async () => {
  const intro = gate.sections.intro ?? ""
  const party = authoredText(intro, storyNames(cast))
  assert.match(party, /A broad dwarf with copper braids/)
  assert.match(party, /A grey-bearded priest in undyed robes/)
  assert.match(party, /A lean, weathered man in a cloak of forest hues/)
  assert.ok(!/surveyor's glass|festival cap|patchwork waistcoat|gusle|swollen pages|strung/.test(party), "no hero who is not in the party")
  assert.ok(!/Branka|Milos|Thalbern/.test(party), "the intro names no hero")
  assert.match(authoredText(intro), /surveyor's glass/, "without a party, every paragraph")

  await atTheGate(async (store) => {
    const shown = store.current().story.filter((b) => b.kind === "action" && [BRANKA, MILOS, THALBERN].includes(b.actor))
    assert.deepEqual(
      shown.map((b) => (b.kind === "action" ? b.actor : "")),
      [BRANKA, MILOS, THALBERN]
    )
    assert.match(JSON.stringify(store.current().story), /Festival law! No one passes this gate alone\./)
  })
})

test("at the gate, each hero starts a stranger to the others, and a name said aloud is heard and kept", async () => {
  await atTheGate(async (store) => {
    // Round one, in the line: the heroes alone, and nobody knows anyone.
    assert.deepEqual(
      store
        .current()
        .characters.map((c) => c.id)
        .sort(),
      [BRANKA, MILOS, THALBERN].sort(),
      "only the heroes stand in the line"
    )
    const thalbern = await turnOf(store, THALBERN)
    assert.match(thalbern, /Milos Radan \(a stranger, name not yet heard\)/)
    assert.match(thalbern, /Branka Stoneveil \(a hero played by a person\) \(a stranger, name not yet heard\)/)
    assert.match(thalbern, /NAMES THALBERN HAS NOT HEARD: [^\n]*Branka Stoneveil/)
    assert.match(thalbern, /ADVENTURE PREMISE[^\n]*\nThe heroes come to the gates of Kordavos alone/)

    // Milos gives his name to the others, and Thalbern whispers his to Milos.
    store.current().story.push(line(MILOS, "Milos Radan, a Wayfinder come for the Festival."), line(THALBERN, "Thalbern. I track for the elves.", { to: MILOS, private: true }))
    store.save()
    const offered = await suggestFor(store, BRANKA)
    assert.match(offered, /NAMES BRANKA STONEVEIL HAS NOT HEARD: Thalbern\./, "Branka heard Milos, and not the whisper")
    assert.ok(!/Milos Radan \(a stranger/.test(offered))
    const gm = await endRound(store, undefined, "the-front-of-the-line")
    assert.match(gm, /- Thalbern: not heard by Branka Stoneveil/)
    assert.match(gm, /- Branka Stoneveil: not heard by /)
    assert.ok(!/- Milos Radan: not heard/.test(gm), "everyone heard Milos")
    assert.deepEqual(
      (store.state!.adventure.knowledge ?? []).map((f) => [f.id, [...f.knownBy].sort()]),
      [
        ["r1-private-1", [MILOS, THALBERN].sort()],
        ["name-milos-radan", [BRANKA, THALBERN].sort()],
        ["name-thalbern", [MILOS]],
      ]
    )

    // Round two, at the table: the line is gone from the story, the ledger keeps who heard it, and Garlan knows no one.
    assert.equal(store.current().encounterId, "the-front-of-the-line")
    const garlanId = store.current().characters.find((c) => c.name === "Garlan Ironfist")!.id
    const garlan = await turnOf(store, garlanId)
    assert.match(garlan, /NAMES GARLAN IRONFIST HAS NOT HEARD: [^\n]*Thalbern/)
    const next = await turnOf(store, THALBERN)
    assert.ok(!/Milos Radan \(a stranger/.test(next), "Thalbern still knows Milos's name")
    assert.match(next, /Branka Stoneveil \(a hero played by a person\) \(a stranger, name not yet heard\)/)
    assert.ok(!/WHAT THALBERN KNOWS[^\n]*\n[^\n]*name/.test(next), "names are not listed among facts")

    // Garlan reads the names back as the GM ends the round, and now everyone has heard every name.
    await endRound(store, [{ kind: "line", who: garlanId, text: "Branka Stoneveil, Milos Radan, Thalbern. Through you go." }])
    assert.ok(!/name not yet heard|HAS NOT HEARD/.test(await turnOf(store, MILOS)))
    assert.ok(!/NAMES NOT YET HEARD/.test(await endRound(store)))
  })
})

test("heroes who come on together from The Road to Kordavos already know each other at the gate, and not the others", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-meeting-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    const [sera, doran] = [await made(store, "Sera Vale"), await made(store, "Doran Pike")]
    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "the-road-to-kordavos",
      party: [
        { id: sera, ai: false },
        { id: doran, ai: true },
      ],
    })
    for (const c of store.current().characters) Object.assign(c, { hasReplied: true, isComplete: true })
    store.save()
    const road: Llm = {
      generateText: unused,
      generateObject: async ({ schema }) => {
        const parsed = schema.safeParse({ nextEncounterId: "the-gates-ahead", beats: [{ kind: "narration", text: "The gates come into view." }], knowledge: [], adventurePatch: {} })
        if (parsed.success) return { object: parsed.data }
        throw new Error("Unexpected model request")
      },
    }
    await game(store, packs, road)({ kind: "continue", turnId: store.current()._id })
    assert.equal(store.state!.adventure.status, "completed")

    await game(
      store,
      packs,
      offline
    )({
      kind: "start",
      provider: "claude",
      adventure: "march-of-davos",
      replace: true,
      continues: true,
      party: [
        { id: sera, ai: false },
        { id: doran, ai: true },
        { id: BRANKA, ai: true },
      ],
    })
    assert.deepEqual(
      (store.state!.adventure.knowledge ?? []).map((f) => [f.id, f.knownBy]).sort(),
      [
        [`name-${sera}`, [doran]],
        [`name-${doran}`, [sera]],
      ].sort()
    )
    const prompt = await turnOf(store, doran)
    assert.match(prompt, /NAMES DORAN PIKE HAS NOT HEARD: Branka Stoneveil\./)
    assert.ok(!/Sera Vale \(a hero played by a person\) \(a stranger/.test(prompt), "Doran knows Sera")
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// A hero the player made, saved to the roster. Its id.
async function made(store: LocalStore, name: string) {
  const { heroCommand } = await import("./heroes")
  const hero = {
    name,
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
  }
  await heroCommand({ kind: "saveHero", hero }, store, packs, offline)
  return store.heroes().find((h) => h.name === name)!.id
}

// The prompt the replies offered to a player's hero were written from.
async function suggestFor(store: LocalStore, id: string): Promise<string> {
  const turn = store.current()
  for (const c of turn.characters) Object.assign(c, { hasReplied: c.id !== id, isComplete: c.id !== id })
  store.save()
  const prompts: string[] = []
  await suggest(store.state, packs, table(prompts), { kind: "suggest", turnId: turn._id, characterId: id })
  return prompts[0]
}
