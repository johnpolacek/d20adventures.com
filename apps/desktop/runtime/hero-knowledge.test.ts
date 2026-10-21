import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Llm } from "@d20/gm-core"
import type { StoryBeat } from "@d20/gm-core/story/beats"
import { cleanStory } from "@d20/gm-core/story/clean"
import { characterScript, turnScript } from "@d20/gm-core/story/turn"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { game, type Packs, suggest, transitionsOf } from "./game"
import { LocalStore } from "./store"

const packs: Packs = JSON.parse(readFileSync(new URL("../src-tauri/resources/packs.json", import.meta.url), "utf8"))
console.log = console.warn = console.error = () => {}
const unused = async (): Promise<never> => {
  throw new Error("Unexpected model request")
}
const offline: Llm = { generateText: unused, generateObject: unused }
const [THALBERN, LYRA, POPPEN, MILOS] = ["thalbern", "1749159962941", "1749307435667", "milos-radan"]

// A model that plays an AI hero's move with no roll, and keeps the prompt the move was written from.
function heroModel(id: string, moves: string[]): Llm {
  return {
    generateText: unused,
    generateObject: async ({ schema, prompt }) => {
      if (prompt.includes("You are the PLAYER (not the GM) roleplaying")) moves.push(prompt)
      for (const answer of [{ beats: [{ kind: "action", who: id, text: "Waits and watches." }] }, { rollType: "none", difficulty: 0 }]) {
        const parsed = schema.safeParse(answer)
        if (parsed.success) return { object: parsed.data }
      }
      throw new Error("Unexpected model request")
    },
  }
}

async function playing(adventure: string, party: { id: string; ai: boolean }[], run: (store: LocalStore) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "d20-knows-"))
  const store = new LocalStore(join(dir, "save.sqlite"), transitionsOf(packs))
  try {
    await game(store, packs, offline)({ kind: "start", provider: "claude", adventure, party })
    await run(store)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

// The AI hero `id` plays its move with everyone else done. The prompt it was written from.
async function aiMove(store: LocalStore, id: string): Promise<string> {
  const turn = store.current()
  for (const c of turn.characters) Object.assign(c, { hasReplied: c.id !== id, isComplete: c.id !== id })
  store.save()
  const moves: string[] = []
  await game(store, packs, heroModel(id, moves))({ kind: "continue", turnId: turn._id })
  assert.equal(moves.length, 1)
  return moves[0]
}

test("a whisper is private to the two in it, and a hero reads the round without it", () => {
  const scene = {
    cast: [
      { id: THALBERN, name: "Thalbern", type: "pc" },
      { id: MILOS, name: "Milos Radan", type: "pc" },
      { id: "garlan-ironfist", name: "Garlan Ironfist", type: "npc" },
    ],
  }
  const asked = cleanStory([{ kind: "action", who: THALBERN, to: "garlan-ironfist", private: true, text: 'Thalbern leans in. "Did a shipment come in off the Mordava?"' }], scene, {
    step: "reply",
    character: THALBERN,
  })
  assert.deepEqual(
    asked.map((b) => [b.kind, "private" in b && b.private]),
    [
      ["action", true],
      ["line", true],
    ]
  )
  const answered = cleanStory(
    [
      { kind: "action", who: "garlan-ironfist", to: THALBERN, text: "Garlan pockets the coins and glances toward the sergeant's table." },
      { kind: "line", who: "garlan-ironfist", to: THALBERN, private: true, delivery: "low", text: "River goods came through at first light." },
    ],
    scene,
    { step: "roll", character: THALBERN }
  )
  const story: StoryBeat[] = [
    { kind: "reply", by: { step: "reply", character: THALBERN }, character: THALBERN, text: "Thalbern quietly asks about a shipment off the Mordava." },
    ...asked,
    ...answered,
  ]
  const turn = { story, characters: scene.cast }

  // The GM reads all of it, with the whisper marked.
  assert.match(turnScript(turn), /Garlan Ironfist to Thalbern, low \(private to Garlan Ironfist and Thalbern\): "River goods came through at first light\."/)
  assert.match(turnScript(turn), /Thalbern leans in\. \(private to Thalbern and Garlan Ironfist\)/)
  // Thalbern reads it too. Milos sees Garlan glance at the table, and nothing of what was said.
  assert.match(characterScript(turn, THALBERN), /River goods/)
  const milos = characterScript(turn, MILOS)
  assert.match(milos, /Garlan pockets the coins/)
  assert.ok(!/Mordava|River goods|Thalbern leans in/.test(milos), milos)
})

test("Covert Cargo opens with each hero's hide and errand known only to that hero", async () => {
  await playing(
    "covert-cargo",
    [
      { id: LYRA, ai: false },
      { id: POPPEN, ai: true },
      { id: THALBERN, ai: true },
    ],
    async (store) => {
      const gm = turnScript(store.current())
      assert.match(gm, /Wollandora sent him [^\n]*\(private to Thalbern\)/)
      assert.match(gm, /Weeks of stakeouts [^\n]*\(private to Poppen Quickfoot\)/)
      // The premise says where each one is, and leaves their errands to their own sheets.
      const premise = packs["covert-cargo"].artifacts.manifest.premise ?? ""
      assert.ok(!/Wollandora|hope of a score/.test(premise), premise)

      const poppen = await aiMove(store, POPPEN)
      assert.match(poppen, /Weeks of stakeouts/)
      assert.ok(!/Wollandora|third watcher|Silas's instructions are explicit/.test(poppen), "Poppen reads nothing of Thalbern or Lyra's orders")
      const thalbern = await aiMove(store, THALBERN)
      assert.match(thalbern, /Wollandora sent him/)
      assert.ok(!/Weeks of stakeouts|Silas's instructions are explicit/.test(thalbern), "Thalbern reads nothing of Poppen or Lyra's orders")

      // Lyra's player is offered replies from what Lyra knows.
      const turn = store.current()
      for (const c of turn.characters) Object.assign(c, { hasReplied: c.id !== LYRA, isComplete: c.id !== LYRA })
      store.save()
      assert.equal(findCurrentActor(turn.characters)?.id, LYRA)
      let offered = ""
      const llm: Llm = {
        generateText: unused,
        generateObject: async (args) => {
          offered = args.prompt
          return { object: args.schema.parse({ suggestions: [{ label: "Wait", text: "Waits." }] }) }
        },
      }
      await suggest(store.state, packs, llm, { kind: "suggest", turnId: turn._id, characterId: LYRA })
      assert.match(offered, /Silas's instructions are explicit/)
      assert.ok(!/Weeks of stakeouts|Wollandora/.test(offered), "Lyra reads nothing of the two watchers' hides")
    }
  )
})

test("at the gate of Kordavos, what Garlan whispers to Thalbern does not reach Milos", async () => {
  await playing(
    "march-of-davos",
    [
      { id: THALBERN, ai: false },
      { id: MILOS, ai: true },
      { id: "branka-stoneveil", ai: true },
    ],
    async (store) => {
      const turn = store.current()
      const garlan = turn.characters.find((c) => c.name === "Garlan Ironfist")!.id
      turn.story.push(
        { kind: "reply", by: { step: "reply", character: THALBERN }, character: THALBERN, text: 'Thalbern leans toward the guard. "Did a shipment come in off the Mordava today?"' },
        { kind: "action", by: { step: "reply", character: THALBERN }, actor: THALBERN, target: garlan, text: "Thalbern leans toward the burly guard as he pays." },
        { kind: "line", by: { step: "reply", character: THALBERN }, speaker: THALBERN, to: garlan, delivery: "quietly", private: true, text: "Did a shipment come in off the Mordava today?" },
        { kind: "action", by: { step: "roll", character: THALBERN }, actor: garlan, target: THALBERN, text: "Garlan pockets the coins and leans in close." },
        {
          kind: "line",
          by: { step: "roll", character: THALBERN },
          speaker: garlan,
          to: THALBERN,
          delivery: "low",
          private: true,
          text: "River goods came through at first light. It's all in the sergeant's ledger.",
        }
      )
      store.save()
      const milos = await aiMove(store, MILOS)
      assert.match(milos, /Thalbern leans toward the burly guard/)
      assert.match(milos, /Garlan pockets the coins and leans in close/)
      assert.ok(!/Mordava|River goods|first light/.test(milos), "Milos heard none of it")
    }
  )
})
