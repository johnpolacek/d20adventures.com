import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createGmCore, type GmPorts, type Store } from "@d20/gm-core"
import { assertPlayerCharacterControl } from "@d20/gm-core/access"
import { buildAdventurePlanViewFromArtifacts } from "@d20/gm-core/wiki-adventures/plan-view"
import { build } from "esbuild"
import ts from "typescript"
import { z } from "zod"
import { commitWikiTurnAdvance, submitReply } from "../convex/adventure"
import { loadLocalWikiAdventureRuntime } from "../lib/wiki-adventures/local-runtime"

// Recorded from the unmodified production services at 7ff0b2d. No model calls.
const fixture = JSON.parse(readFileSync("scripts/gm-core-fixtures/turn.json", "utf8"))
const characterFixture = JSON.parse(readFileSync("scripts/gm-core-fixtures/character.json", "utf8"))
const runtime = loadLocalWikiAdventureRuntime("realm-of-myr", "march-of-davos")
const clone = <T>(value: T): T => structuredClone(value)
const unavailable = () => {
  throw new Error("Unexpected host call")
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value))

function memoryGame() {
  const adventure = { ...clone(fixture.finalState[0]), currentTurnId: "turn-1", currentEncounterId: fixture.initialState.encounterId }
  const records = new Map<string, any>([
    [adventure._id, adventure],
    ["turn-1", clone(fixture.initialState)],
  ])
  const writes: string[] = []
  const narrations: string[] = []
  const db = {
    get: async (id: string) => clone(records.get(id) ?? null),
    patch: async (id: string, patch: any) => Object.assign(records.get(id), clone(patch)),
    insert: async (table: string, value: any) => {
      assert.equal(table, "turns")
      const id = `turn-${value.order}`
      assert.ok(!records.has(id), "duplicate turn")
      records.set(id, { _id: id, ...clone(value) })
      return id
    },
    query: (table: string) => {
      assert.equal(table, "turns")
      let adventureId: string, order: number
      const query = {
        withIndex(name: string, predicate: any) {
          assert.equal(name, "by_adventure")
          predicate({
            eq: (_key: string, value: string) => {
              adventureId = value
            },
          })
          return query
        },
        filter(predicate: any) {
          predicate({
            field: (key: string) => key,
            eq: (_key: string, value: number) => {
              order = value
            },
          })
          return query
        },
        first: async () => clone([...records.values()].find((row) => row.adventureId === adventureId && row.order === order) ?? null),
      }
      return query
    },
  }
  // Exercise the actual Convex handlers. Only the database transport is replaced.
  const handler = (mutation: unknown) => (mutation as { _handler(ctx: unknown, args: unknown): Promise<any> })._handler
  const store: Store = {
    getAdventure: ({ adventureId }) => db.get(adventureId),
    getTurn: ({ turnId }) => db.get(turnId),
    getTurns: async ({ adventureId }) => clone([...records.values()].filter((row) => row.adventureId === adventureId)),
    getTurnByOrder: async ({ adventureId, order }) => clone([...records.values()].find((row) => row.adventureId === adventureId && row.order === order) ?? null),
    submitReply: async (args) => {
      writes.push("adventure:submitReply")
      return handler(submitReply)({ db }, args)
    },
    updateTurn: async ({ turnId, patch }) => {
      writes.push("turns:updateTurn")
      return db.patch(turnId, patch)
    },
    commitWikiTurnAdvance: async (args) => {
      writes.push("adventure:commitWikiTurnAdvance")
      return handler(commitWikiTurnAdvance)({ db }, args)
    },
    createTurn: unavailable,
    patchAdventure: unavailable,
    createAdventureWithFirstTurn: unavailable,
  }
  const ports: GmPorts = {
    store,
    identity: async () => "fixture-player",
    sleep: async () => {},
    narration: {
      afterTurn: (id) => {
        narrations.push(id)
      },
    },
    content: {
      isWikiAdventure: () => true,
      loadWikiRuntime: async () => runtime,
      loadPlan: async () => buildAdventurePlanViewFromArtifacts(runtime.artifacts),
      loadLegacyPlan: unavailable,
      spatialContext: async () => undefined,
    },
    llm: { generateObject: unavailable, generateText: unavailable },
  }
  return { records, writes, narrations, ports }
}

async function replayTurn() {
  const game = memoryGame()
  let index = 0
  const inference = async (args: { prompt: string; schema?: z.ZodTypeAny }) => {
    const expected = fixture.calls[index++]
    assert.ok(expected, "unexpected extra model call")
    assert.equal(args.prompt, expected.prompt, `prompt ${index} changed`)
    assert.deepEqual(args.schema ? z.toJSONSchema(args.schema) : undefined, expected.schema, `schema ${index} changed`)
    return args.schema ? { object: args.schema.parse(JSON.parse(expected.response)) } : { text: expected.response }
  }
  game.ports.llm = { generateObject: inference as GmPorts["llm"]["generateObject"], generateText: inference as GmPorts["llm"]["generateText"] }
  const core = createGmCore(game.ports)
  const initial = fixture.initialState
  const player = { ...initial.characters[0], controlledBy: "human" }
  const narrativeAction = await core.formatNarrativeAction({
    characterName: player.name,
    gender: player.gender,
    playerInput: fixture.playerInput,
    narrativeContext: initial.narrative,
    characterInfo: player,
  })
  const reply = await core.processTurnReply({ turnId: "turn-1", characterId: player.id, narrativeAction, originalPlayerInput: fixture.playerInput })
  assert.ok(reply.rollRequired)
  await core.resolvePlayerRollResult({ turnId: "turn-1", characterId: player.id, result: 20 })
  assert.ok(game.records.get("turn-1").characters.every((actor: any) => actor.isComplete))
  await core.advanceTurn({ turnId: "turn-1", settingId: "realm-of-myr", adventurePlanId: "march-of-davos" })
  assert.equal(index, 7)
  assert.deepEqual(game.writes, fixture.writes)
  assert.deepEqual(game.narrations, ["turn-1", "turn-1", "turn-2"])
  // The old spike stored a subset of commit fields. Compare every recorded field,
  // plus the durable patch now written by the real commit handler.
  for (const expected of fixture.finalState) {
    const actual = game.records.get(expected._id)
    for (const [key, value] of Object.entries(expected)) {
      if (key === "updatedAt") continue
      assert.deepEqual(json(actual[key]), value, `${expected._id}.${key}`)
    }
  }
  assert.ok(game.records.get("turn-2").adventurePatch)
  assert.equal((await core.advanceTurn({ turnId: "turn-1", settingId: "realm-of-myr", adventurePlanId: "march-of-davos" })).status, "already_advanced")
  assert.equal(index, 7, "duplicate advance must not call the model")
  await assert.rejects(
    game.ports.store.commitWikiTurnAdvance({
      adventureId: "fixture-adventure",
      expectedCurrentTurnId: "turn-1",
      expectedCurrentEncounterId: initial.encounterId,
      nextEncounterId: "the-harvest-festival",
      title: "",
      narrative: "",
      characters: [],
      order: 3,
    }),
    /Stale turn advance/
  )
}

async function characterPrompts() {
  const game = memoryGame()
  let current: any
  game.ports.llm.generateObject = async (args) => {
    assert.equal(args.prompt, current.prompt, current.name)
    assert.deepEqual(z.toJSONSchema(args.schema), current.schema, current.name)
    return { object: {} as z.infer<typeof args.schema> }
  }
  const core = createGmCore(game.ports)
  for (current of characterFixture.cases) {
    const operation = core[current.name as keyof typeof core] as (args: any) => Promise<{ success: boolean }>
    assert.equal((await operation(current.input)).success, true)
  }
  assert.deepEqual(await core.generateCharacterAction({ prompt: " ", characterType: "pc" }), { success: false, error: "Prompt is required" })
}

async function accessAndInstanceIsolation() {
  const a = memoryGame(),
    b = memoryGame()
  a.ports.identity = async () => "outsider"
  const coreA = createGmCore(a.ports)
  const coreB = createGmCore(b.ports)
  await assert.rejects(coreA.processTurnReply({ turnId: "turn-1", characterId: "mira", narrativeAction: "Hello" }), /Forbidden/)
  await assert.rejects(coreB.assertAdventureAccess(null, "fixture-adventure"), /Unauthorized/)
  const turn = b.records.get("turn-1")
  assert.throws(() => assertPlayerCharacterControl("fixture-player", turn, "garlan-ironfist"), /Only player/)
  turn.characters[0].controlledBy = "ai"
  assert.throws(() => assertPlayerCharacterControl("fixture-player", turn, "mira"), /AI companion/)
  b.records.get("fixture-adventure").runType = "practice"
  b.records.get("fixture-adventure").playerIds.push("outsider")
  await assert.rejects(coreB.assertAdventureAccess("outsider", "fixture-adventure"), /Forbidden/)
  assert.deepEqual(a.writes, [])
  assert.deepEqual(b.writes, [])

  // An automatic companion consumes its own model and store, without a human roll.
  const c = memoryGame()
  c.records.get("turn-1").characters[0].controlledBy = "ai"
  const statefulModel = {
    calls: 0,
    async generateText() {
      this.calls++
      return { text: "Mira waits by the gate." }
    },
    async generateObject() {
      this.calls++
      return { object: { rollType: "none", difficulty: 0 } as any }
    },
  }
  c.ports.llm = statefulModel
  c.ports.content.isWikiAdventure = function () {
    assert.equal(this, c.ports.content, "content method lost its receiver")
    return true
  }
  c.ports.content.loadWikiRuntime = async function () {
    assert.equal(this, c.ports.content, "content loader lost its receiver")
    return runtime
  }
  await createGmCore(c.ports).processAiPcTurn({ turnId: "turn-1", characterId: "mira", adventure: c.records.get("fixture-adventure") })
  assert.equal(statefulModel.calls, 2)
  assert.equal(c.records.get("turn-1").characters[0].isComplete, true)
  assert.equal(b.records.get("turn-1").characters[0].isComplete, false)

  c.ports.content.loadPlan = async function () {
    assert.equal(this, c.ports.content, "plan loader lost its receiver")
    return buildAdventurePlanViewFromArtifacts(runtime.artifacts)
  }
  c.ports.store.createAdventureWithFirstTurn = async (args) => {
    assert.equal(args.ownerId, "fixture-player", "ownership must come from authenticated identity")
    assert.equal(args.turn.title, "The Gates of Kordavos")
    return { adventureId: "new-adventure", turnId: "new-turn" }
  }
  await createGmCore(c.ports).createAdventureWithFirstTurn({
    planId: "march-of-davos",
    settingId: "realm-of-myr",
    ownerId: "forged-owner",
    playerIds: ["fixture-player"],
    title: "New game",
    startedAt: 0,
    playerInput: "",
    turn: { encounterId: fixture.initialState.encounterId, narrative: "", characters: [], order: 1 },
  })

  const d = memoryGame()
  d.ports.llm.generateObject = async () => ({ object: { nextEncounterId: "invented-encounter", narrative: "No." } as any })
  await assert.rejects(createGmCore(d.ports).advanceTurn({ turnId: "turn-1", settingId: "realm-of-myr", adventurePlanId: "march-of-davos" }), /transition rejected/i)
  assert.deepEqual(d.writes, [])

  const drift = memoryGame()
  await drift.ports.store.commitWikiTurnAdvance({
    adventureId: "fixture-adventure",
    expectedCurrentTurnId: "turn-1",
    expectedCurrentEncounterId: fixture.initialState.encounterId,
    expectedContentHash: "new-content-hash",
    currentContentVersion: "new-version",
    currentVersionId: "new-version-id",
    nextEncounterId: "the-harvest-festival",
    title: "Festival",
    narrative: "The party enters the city.",
    characters: [],
    order: 2,
    isFinalEncounter: true,
  })
  const completed = drift.records.get("fixture-adventure")
  assert.equal(completed.contentRef.contentHash, "new-content-hash")
  assert.equal(completed.contentRef.contentVersion, "new-version")
  assert.equal(completed.status, "completed")
  assert.equal(typeof completed.endedAt, "number")
}

async function packageBoundary() {
  const sourceRoot = resolve("packages/gm-core/src")
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!path.endsWith(".ts")) continue
      const source = readFileSync(path, "utf8")
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
      function check(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text
          assert.ok(specifier === "zod" || (specifier.startsWith(".") && resolve(dir, specifier).startsWith(`${sourceRoot}/`)), `${path}: forbidden dependency ${specifier}`)
        }
        if (ts.isIdentifier(node)) assert.ok(!["process", "Buffer", "require", "__dirname"].includes(node.text), `${path}: forbidden host global ${node.text}`)
        ts.forEachChild(node, check)
      }
      check(file)
    }
  }
  visit(sourceRoot)
  const bundle = await build({ entryPoints: ["packages/gm-core/src/index.ts"], bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent" })
  assert.ok(bundle.outputFiles[0].text.includes("createGmCore"))
}

async function main() {
  const originalRandom = Math.random
  const originalConsole = { ...console }
  Math.random = () => 0.8
  console.log = console.warn = console.error = () => {}
  try {
    await packageBoundary()
    await replayTurn()
    await characterPrompts()
    await accessAndInstanceIsolation()
  } finally {
    Math.random = originalRandom
    Object.assign(console, originalConsole)
  }
  console.log(
    "GM core: browser bundle, dependency boundary, 7-call prompt/schema/write parity, 9 character prompts, access, AI companion, instance isolation, duplicate/stale/invalid transitions passed."
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
