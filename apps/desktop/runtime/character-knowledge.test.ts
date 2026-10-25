import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import type { StoryBeat } from "@d20/gm-core/story/beats"
import { cleanLearned, type KnownFact, knowledgeNote, ledgerNote, mergeKnowledge, privateFacts } from "@d20/gm-core/story/knowledge"
import { storyNames } from "@d20/gm-core/story/render"
import { game, type Packs, transitionsOf } from "./game"
import { LocalStore } from "./store"
import { chapterOf, storyNote } from "./story"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }
const [THALBERN, MILOS, BRANKA, GARLAN] = ["thalbern", "milos-radan", "branka-stoneveil", "garlan-ironfist"]
const [LYRA, POPPEN, SILAS] = ["1749159962941", "1749307435667", "npcs-1749181492795"]

// Thalbern asks Garlan about the shipment, and Garlan answers him low. Milos and Branka see only the coins change hands.
const whisper = (garlan = GARLAN): StoryBeat[] => [
  { kind: "action", by: { step: "reply", character: THALBERN }, actor: THALBERN, target: garlan, text: "Thalbern leans toward the burly guard as he pays." },
  { kind: "line", by: { step: "reply", character: THALBERN }, speaker: THALBERN, to: garlan, delivery: "quietly", private: true, text: "Did a shipment come in off the Mordava today?" },
  { kind: "action", by: { step: "roll", character: THALBERN }, actor: garlan, target: THALBERN, text: "Garlan pockets the coins and leans in close." },
  { kind: "line", by: { step: "roll", character: THALBERN }, speaker: garlan, to: THALBERN, delivery: "low", private: true, text: "River goods came through at first light." },
]

// A GM that plays every step it is asked for and keeps each prompt: an AI hero's move or an NPC's turn as one quiet
// action, and the end of a round that stays in `encounter` with `learned` as what it records.
function table(prompts: string[], encounter: string, learned: unknown[] = []): Llm {
  return {
    generateText: unused,
    generateObject: async ({ schema, prompt }) => {
      prompts.push(prompt)
      const who = prompt.match(/THE CURRENT NPC IS: [^(]+\(ID: ([^,]+),/)?.[1] ?? prompt.match(/an action by "([^"]+)"/)?.[1]
      for (const answer of [
        { nextEncounterId: encounter, beats: [{ kind: "narration", text: "The line shuffles forward." }], knowledge: learned, adventurePatch: {} },
        { actionSummary: "Waits.", beats: [{ kind: "action", who, text: "Waits and watches." }], actionType: "skip" },
        { beats: [{ kind: "action", who, text: "Waits and watches." }] },
        { rollType: "none", difficulty: 0 },
      ]) {
        const parsed = schema.safeParse(answer)
        if (parsed.success) return { object: parsed.data }
      }
      throw new Error("Unexpected model request")
    },
  }
}

async function playing(adventure: string, party: { id: string; ai: boolean }[], run: (store: LocalStore) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "d20-ledger-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure, party })
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
  await game(store, packs, table(prompts, turn.encounterId))({ kind: "continue", turnId: turn._id })
  const played = prompts.filter((p) => p.includes("You are the PLAYER (not the GM)") || p.includes("THE CURRENT NPC IS"))
  assert.equal(played.length, 1, `${id} played once`)
  return played[0]
}

// The round ends with everyone done, the GM recording `learned` and going on to `encounter`. The round-end prompt.
async function endRound(store: LocalStore, learned: unknown[] = [], encounter = store.current().encounterId): Promise<string> {
  for (const c of store.current().characters) Object.assign(c, { hasReplied: true, isComplete: true })
  store.save()
  const prompts: string[] = []
  await game(store, packs, table(prompts, encounter, learned))({ kind: "continue", turnId: store.current()._id })
  return prompts.find((p) => p.includes("Available Transition Options")) ?? ""
}

test("a round's private beats are one fact for those in them, and facts merge by id with their knowers growing", () => {
  const names = storyNames([
    { id: THALBERN, name: "Thalbern" },
    { id: GARLAN, name: "Garlan Ironfist" },
  ])
  const [fact, ...rest] = privateFacts(whisper(), names, 3)
  assert.equal(rest.length, 0, "the question and the answer are one exchange")
  assert.deepEqual(fact, {
    id: "r3-private-1",
    text: 'Thalbern to Garlan Ironfist, quietly: "Did a shipment come in off the Mordava today?" Garlan Ironfist to Thalbern, low: "River goods came through at first light."',
    knownBy: [THALBERN, GARLAN],
  })

  const told: KnownFact = { id: "r3-private-1", text: "Thalbern told Milos that river goods came through the gate at first light.", knownBy: [MILOS] }
  const merged = mergeKnowledge([fact, { id: "gate-fee", text: "The fee is three marks.", knownBy: [MILOS] }], [told])
  assert.deepEqual(
    merged.map((f) => [f.id, f.knownBy]),
    [
      ["gate-fee", [MILOS]],
      ["r3-private-1", [THALBERN, GARLAN, MILOS]],
    ],
    "a fact told again is the newest, with every knower"
  )
  assert.equal(merged[1].text, told.text)

  const scene = {
    cast: [
      { id: MILOS, name: "Milos Radan" },
      { id: GARLAN, name: "Garlan Ironfist" },
    ],
  }
  assert.deepEqual(
    cleanLearned(
      [
        { id: "Ledger Names", text: "  The sergeant's ledger names every cart.  ", knownBy: ["Milos Radan", "garlan-ironfist", "someone-else"] },
        { id: "nobody", text: "No one is in this.", knownBy: ["ghost"] },
        { id: "spread", text: "A fact from an earlier scene.", knownBy: [THALBERN] },
      ],
      scene,
      [fact]
    ),
    [
      { id: "ledger-names", text: "The sergeant's ledger names every cart.", knownBy: [MILOS, GARLAN] },
      { id: "spread", text: "A fact from an earlier scene.", knownBy: [THALBERN] },
    ],
    "knowers are resolved by name or id, and one who is neither here nor in the ledger is dropped"
  )

  assert.match(knowledgeNote(merged, { id: GARLAN, name: "Garlan Ironfist" }), /^WHAT GARLAN IRONFIST KNOWS[^\n]*\n- Thalbern told Milos/)
  assert.equal(knowledgeNote(merged, { id: BRANKA, name: "Branka" }), "", "a character who knows nothing has no note")
  assert.match(ledgerNote(merged, names, true), /- \[r3-private-1\] Thalbern told Milos [^\n]* Known to: Thalbern, Garlan Ironfist, 1 not here\./)
})

test("at the gate table, Garlan's whisper is remembered the next round by Thalbern and Garlan only, until Thalbern tells Milos", async () => {
  await playing(
    "march-of-davos",
    [
      { id: BRANKA, ai: false },
      { id: THALBERN, ai: true },
      { id: MILOS, ai: true },
    ],
    async (store) => {
      // The heroes wait out a round in the line, then reach Garlan's table.
      await endRound(store, [], "the-front-of-the-line")
      store.current().story.push(...whisper())
      store.save()
      await endRound(store, [
        { id: "gate-closes-at-dusk", text: "Garlan said the gate closes at dusk.", knownBy: [THALBERN, MILOS, BRANKA, "Garlan Ironfist"] },
        { id: "ghost-fact", text: "Someone no one has met knows this.", knownBy: ["a-ghost"] },
      ])
      assert.equal(store.current().order, 3)
      const known = store.state!.adventure.knowledge ?? []
      assert.deepEqual(
        known.map((f) => [f.id, f.knownBy]),
        [
          ["r2-private-1", [THALBERN, GARLAN]],
          ["gate-closes-at-dusk", [THALBERN, MILOS, BRANKA, GARLAN]],
        ]
      )

      // The next round: the whisper is gone from the story, and only those in it still know it.
      const thalbern = await turnOf(store, THALBERN)
      assert.match(thalbern, /WHAT THALBERN KNOWS[^\n]*\n[\s\S]*River goods came through at first light/)
      const milos = await turnOf(store, MILOS)
      assert.match(milos, /WHAT MILOS RADAN KNOWS[^\n]*\n- Garlan said the gate closes at dusk\./)
      assert.ok(!/River goods|Mordava/.test(milos), "Milos heard none of it")
      const garlan = await turnOf(store, GARLAN)
      assert.match(garlan, /WHAT GARLAN IRONFIST KNOWS[\s\S]*River goods came through at first light/)

      // A hero's prompt carries their own gear, and of the others only how they fare.
      assert.match(milos, /Bronze Compass-Star/)
      assert.ok(!/Herb Pouch|Watch Whistle/.test(milos), "Milos's prompt holds no one else's gear")

      // The GM reads every fact, with its id and who knows it, and Thalbern tells Milos.
      const gm = await endRound(store, [{ id: "r2-private-1", text: "Thalbern told Milos the river goods came through the gate at first light.", knownBy: [MILOS] }])
      assert.match(gm, /WHO KNOWS WHAT\. Facts from earlier[^\n]*\n- \[r2-private-1\] Thalbern to Garlan Ironfist, quietly: [^\n]* Known to: Thalbern, Garlan Ironfist\./)
      assert.match(store.state!.adventure.knowledge!.at(-1)!.knownBy.join(" "), /thalbern garlan-ironfist milos-radan/)
      assert.match(await turnOf(store, MILOS), /WHAT MILOS RADAN KNOWS[\s\S]*Thalbern told Milos the river goods/)
    }
  )
})

test("an NPC's turn reads the round as the NPC knows it: no whisper between heroes, and no player's own words", async () => {
  await playing(
    "march-of-davos",
    [
      { id: THALBERN, ai: false },
      { id: MILOS, ai: true },
      { id: BRANKA, ai: true },
    ],
    async (store) => {
      await endRound(store, [], "the-front-of-the-line")
      store
        .current()
        .story.push(
          { kind: "reply", by: { step: "reply", character: THALBERN }, character: THALBERN, text: "I tell Milos quietly that I am tracking stolen elven relics, so Garlan does not hear." },
          { kind: "action", by: { step: "reply", character: THALBERN }, actor: THALBERN, target: MILOS, private: true, text: "Thalbern leans close to Milos." },
          { kind: "line", by: { step: "reply", character: THALBERN }, speaker: THALBERN, to: MILOS, private: true, delivery: "quietly", text: "I am tracking relics stolen from the elves." },
          { kind: "action", by: { step: "reply", character: MILOS }, actor: MILOS, target: GARLAN, text: "Milos sets three marks on the table." }
        )
      store.save()
      const garlan = await turnOf(store, GARLAN)
      assert.match(garlan, /Milos sets three marks on the table/)
      assert.ok(!/stolen from the elves|The player wrote/.test(garlan), "Garlan reads neither the whisper nor the player's words")
    }
  )
})

test("in Covert Cargo, Silas's turn reads the intro without the hidden heroes' paragraphs, and the GM's marks them", async () => {
  await playing(
    "covert-cargo",
    [
      { id: LYRA, ai: false },
      { id: POPPEN, ai: false },
      { id: THALBERN, ai: false },
    ],
    async (store) => {
      const silas = await turnOf(store, SILAS)
      assert.match(silas, /Encounter Intro: [\s\S]*Silas glides from the shadows/)
      assert.ok(!/Weeks of stakeouts|Wollandora sent him|Silas's instructions are explicit/.test(silas), "Silas reads no one's private paragraph")
      const gm = await endRound(store)
      assert.match(gm, /Weeks of stakeouts[^\n]*\(private to Poppen Quickfoot\)/)
      // Each hidden hero's opening is now a fact for that hero alone.
      const known = store.state!.adventure.knowledge ?? []
      assert.deepEqual(
        known.map((f) => f.knownBy),
        [[LYRA], [POPPEN], [THALBERN]]
      )
      assert.match(known[1].text, /^From a tangle of undergrowth[\s\S]*Weeks of stakeouts/)
    }
  )
})

test("a finished adventure's chapter keeps what its heroes learned, and each hero reads only their own", () => {
  const chapter = chapterOf({
    version: 1,
    provider: "claude",
    rolls: {},
    movement: {},
    positions: {},
    adventure: {
      _id: "a",
      title: "Covert Cargo",
      settingId: "realm-of-myr",
      planId: "covert-cargo",
      ownerId: "local-player",
      playerIds: ["local-player"],
      currentTurnId: "t",
      currentEncounterId: "return-to-the-city",
      status: "completed",
      discoveries: [],
      entityUpdates: [],
      openThreads: [],
      resolvedThreadIds: [],
      adventureSummaryMarkdown: "The relic went to the Blackthorns.",
      knowledge: [
        { id: "hide", text: "Poppen hid in the reeds.", knownBy: [POPPEN] },
        { id: "seal", text: "The payment bore the Blackthorn seal.", knownBy: [LYRA, SILAS, POPPEN] },
      ],
    },
    turns: [
      {
        _id: "t",
        adventureId: "a",
        encounterId: "return-to-the-city",
        title: "Return to the City",
        order: 1,
        story: [],
        characters: [
          { id: LYRA, name: "Lyra Voss", type: "pc" },
          { id: POPPEN, name: "Poppen Quickfoot", type: "pc" },
        ] as never,
      },
    ],
  })
  assert.deepEqual(chapter.known, [
    { text: "Poppen hid in the reeds.", knownBy: [POPPEN] },
    { text: "The payment bore the Blackthorn seal.", knownBy: [LYRA, POPPEN] },
  ])
  const lyra = storyNote([chapter], LYRA)
  assert.match(lyra, /What Lyra Voss learned there: The payment bore the Blackthorn seal\.$/)
  assert.ok(!/reeds/.test(lyra), "Lyra reads nothing of Poppen's hide")
  assert.match(storyNote([chapter]), /Poppen hid in the reeds\. \(Poppen Quickfoot\) \| The payment bore the Blackthorn seal\. \(Lyra Voss, Poppen Quickfoot\)/)
})
