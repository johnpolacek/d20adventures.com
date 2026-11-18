import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { GmPorts } from "../../src/ports"
import { handleSkipPassNpcTurn } from "../../src/services/npc-turn-branch-service"
import { npcWays } from "../../src/services/npc-turn-generation-service"
import { createNpcTurnService, npcHadTurn } from "../../src/services/npc-turn-service"
import { type EncounterFloor, type FloorPlanInMetres, floorFromMetres } from "../../src/sheet/placement"
import type { Sheet } from "../../src/sheet/sheet"
import { between } from "../../src/sheet/space"
import type { Turn, TurnCharacter } from "../../src/types/adventure"
import { buildWikiEncounterProgressionPrompt } from "../../src/wiki-adventures/runtime-context"

// An NPC's turn moves it where its own turn says it goes, and one that goes on its way leaves the encounter for good.

const plan = (path: string) => JSON.parse(readFileSync(new URL(`../../../stage/src/plans/${path}`, import.meta.url), "utf8"))
// The Owlbear Prowls: the Owlbear staged at (2 m, -5.4 m) on the forest trail, Thalbern hidden in the ferns.
const prowl = (): EncounterFloor => floorFromMetres({ ...plan("sets/realm-of-myr-valkarr-forest-trail.json"), ...plan("encounters/the-owlbear-prowls.json") } as FloorPlanInMetres)
const place = (floor: EncounterFloor, id: string) => floor.places.find((entry) => entry.id === id)?.at as { x: number; y: number }
const sheet = (JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")) as { sheet: Sheet })
  .sheet

function scene(floor: EncounterFloor): Turn {
  const owlbear = { id: "owlbear", name: "Owlbear", type: "npc", statBlock: "owlbear", hitPoints: 59, position: floor.cast[1].at, behavior: "Has not noticed Thalbern." }
  const thalbern = { id: "thalbern", name: "Thalbern", type: "pc", sheet, hitPoints: 11, position: place(floor, "ferns"), isComplete: true, hasReplied: true }
  return { id: "turn", adventureId: "a", encounterId: "the-owlbear-prowls", title: "", order: 2, story: [], characters: [thalbern, owlbear] as unknown as TurnCharacter[] } as Turn
}

// The model's answers in order: the NPC's turn, then the read of it when the turn is read.
function play(floor: EncounterFloor, answers: unknown[]) {
  const prompts: string[] = []
  const ports = {
    llm: {
      generateObject: async (args: { prompt: string }) => {
        prompts.push(args.prompt)
        return { object: answers.shift() }
      },
    },
    content: { floor: async () => floor, isWikiAdventure: () => true, loadWikiRuntime: async () => ({}), loadPlan: async () => ({}) },
  } as unknown as GmPorts
  return { prompts, ...createNpcTurnService(ports) }
}

const beat = (text: string) => ({ kind: "action", who: "owlbear", text })
const owlbearOf = (characters: readonly TurnCharacter[]) => characters.find((character) => character.id === "owlbear") as TurnCharacter & { fled?: true }

test("an NPC that prowls with no roll walks to the place its turn names, within its Speed", async () => {
  const floor = prowl()
  const turn = scene(floor)
  const from = owlbearOf(turn.characters).position!
  const { prompts, processNpcTurnWithLLM } = play(floor, [
    { actionSummary: "The owlbear pads along the trail to the ferns.", beats: [beat("It pads toward the ferns.")], actionType: "pass", moveTo: "ferns" },
  ])
  const result = await processNpcTurnWithLLM({ turn, npcId: "owlbear", firstTurn: true })
  const owlbear = owlbearOf(result.updatedCharacters)
  // The ferns are 53 feet off, past its 40: it walks 40 toward them and stops.
  assert.ok(Math.abs(between(from, owlbear.position!) - 40) < 1)
  assert.ok(between(owlbear.position!, place(floor, "ferns")) < between(from, place(floor, "ferns")))
  assert.equal(owlbear.fled, undefined)
  assert.equal(owlbear.isComplete, true)
  assert.match(prompts[0], /set "moveTo" to where it goes: [^\n]*ferns \(the thick ferns beside the trail, 53 feet away\)/)
  assert.match(prompts[0], /This is Owlbear's first turn in this scene\. Short of running away, the NPC does not go on its way and leave on it/)
})

test("an NPC that goes on its way after its first turn walks off and is gone for good", async () => {
  const floor = prowl()
  const turn = scene(floor)
  const from = owlbearOf(turn.characters).position!
  const { prompts, processNpcTurnWithLLM } = play(floor, [
    { actionSummary: "The owlbear loses interest and lumbers off.", beats: [beat("It lumbers off into the trees.")], actionType: "leave", moveTo: "treeLine" },
  ])
  const result = await processNpcTurnWithLLM({ turn, npcId: "owlbear", firstTurn: false })
  const owlbear = owlbearOf(result.updatedCharacters)
  assert.equal(owlbear.fled, true)
  assert.ok(between(owlbear.position!, place(floor, "treeLine")) < between(from, place(floor, "treeLine")))
  assert.match(prompts[0], /set actionType to "leave"/)
})

test("an NPC that would go on its way on its first turn in the scene stays", async () => {
  const floor = prowl()
  const { processNpcTurnWithLLM } = play(floor, [{ actionSummary: "The owlbear lumbers off.", beats: [], actionType: "leave" }])
  const result = await processNpcTurnWithLLM({ turn: scene(floor), npcId: "owlbear", firstTurn: true })
  assert.equal(owlbearOf(result.updatedCharacters).fled, undefined)
})

test("a turn the read names no move for walks where the NPC's own turn said it goes", async () => {
  const floor = prowl()
  const turn = scene(floor)
  const from = owlbearOf(turn.characters).position!
  const { processNpcTurnWithLLM } = play(floor, [
    { actionSummary: "The owlbear pads to the great oak and sniffs the air.", beats: [beat("It pads to the great oak.")], actionType: "other", moveTo: "greatOak" },
    { check: "none" },
  ])
  const result = await processNpcTurnWithLLM({ turn, npcId: "owlbear", firstTurn: true })
  const owlbear = owlbearOf(result.updatedCharacters)
  // The great oak is 29 feet off, within its 40.
  assert.ok(between(owlbear.position!, place(floor, "greatOak")) < between(from, place(floor, "greatOak")) - 20)
})

test("one that leaves with no move named is gone for good where it stands", () => {
  const floor = prowl()
  const turn = scene(floor)
  const npc = owlbearOf(turn.characters)
  const left = handleSkipPassNpcTurn({ turn, npc, actionResult: { actionSummary: "", beats: [], actionType: "leave" }, scene: { cast: [], places: [] } as never })
  assert.equal(owlbearOf(left.updatedCharacters).fled, true)
})

test("an NPC has had a turn in the scene once it was in an earlier round of it, played in a row", () => {
  const rows = [
    { order: 1, encounterId: "broken-silence", characters: [{ id: "thalbern" }] },
    { order: 2, encounterId: "the-owlbear-prowls", characters: [{ id: "thalbern" }, { id: "owlbear" }] },
  ]
  assert.equal(npcHadTurn(rows, { order: 2, encounterId: "the-owlbear-prowls" }, "owlbear"), false)
  assert.equal(npcHadTurn(rows, { order: 3, encounterId: "the-owlbear-prowls" }, "owlbear"), true)
  assert.equal(npcHadTurn(rows, { order: 3, encounterId: "owlbear-confrontation" }, "owlbear"), false)
})

test("the round end tells no NPC leaving that its own turn did not take away", () => {
  const packet = (fled: boolean) =>
    ({
      contentRef: { contentVersion: 1, contentHash: "h" },
      adventure: { title: "The Midnight Summons" },
      currentEncounter: { id: "the-owlbear-prowls", title: "The Owlbear Prowls", intro: "", gmNotes: "" },
      graph: { legalTransitions: [], nextEncounterIntros: {} },
      characters: { live: [{ id: "owlbear", name: "Owlbear", type: "npc", ...(fled ? { fled: true } : {}) }] },
      session: { recentTurnHistory: "", rollInfo: "" },
      outputContract: { allowedNextEncounterIds: ["the-owlbear-prowls"], playerCharacterNames: ["Thalbern"] },
    }) as unknown as Parameters<typeof buildWikiEncounterProgressionPrompt>[0]
  assert.match(buildWikiEncounterProgressionPrompt(packet(false)), /No NPC leaves the scene in your telling: one goes only on its own turn\./)
  assert.doesNotMatch(buildWikiEncounterProgressionPrompt(packet(false)), /Gone for good/)
  assert.match(buildWikiEncounterProgressionPrompt(packet(true)), /Gone for good this round: Owlbear\./)
})

test("an NPC is not offered the way to a hero who is hidden from it", () => {
  const turn = scene(prowl())
  const [thalbern, owlbear] = turn.characters as TurnCharacter[]
  assert.ok(npcWays(owlbear, turn.characters as TurnCharacter[], prowl())?.ids.includes("thalbern"))
  const hidden = { ...thalbern, conditions: [{ id: "invisible" }] } as TurnCharacter
  const ways = npcWays(owlbear, [hidden, owlbear], prowl())
  assert.equal(ways?.ids.includes("thalbern"), false)
  assert.ok(ways?.ids.includes("ferns"))
})
