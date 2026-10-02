import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import ts from "typescript"
import { z } from "zod"
import { combinedAction } from "./combined-action.mjs"
import { root, validate } from "./fixture.mjs"
import { memoryCommit } from "./memory-commit.mjs"
import { assertPatchPreserved, strictModelSchema } from "./strict-state.mjs"
import { sourceLoader } from "./trusted-source.mjs"

export const turnSystem =
  "You are running D20 Adventures game services. Use only the fictional context supplied in the current request. Do not use tools or inspect files. Follow the current request's output format, JSON or prose."
const unavailable = () => {
  throw new Error("External storage unavailable in this fixture")
}

export async function completeTurn(session, onProgress = () => {}, options = {}) {
  const started = performance.now()
  const calls = [],
    events = [],
    writes = []
  let phase = "format-action"
  const milestones = []
  const cachedServices = []
  let preflight
  let stateAudit
  const mark = (name, text) => {
    milestones.push({ name, emittedAt: Date.now(), elapsedMs: Math.round(performance.now() - started), ...(text ? { text } : {}) })
    onProgress(calls, milestones)
  }
  async function serviceInference(args, format) {
    if (options.combined && phase === "format-action") {
      assert.equal(format, "text")
      assert.ok(!preflight, "Combined fixture expects one formatting request")
      const combined = await combinedAction({ formatting: args, input: playerInput, character: characters.find((c) => c.id === player.id), encounter, narrative: turn.narrative, sources })
      preflight = (await inference(combined, "json")).object
      return { text: preflight.formattedAction }
    }
    if (options.combined && phase === "player-reply") {
      const value = args.schema.shape.rollType ? preflight.rollRequirement : { modifier: preflight.situationalModifier }
      cachedServices.push({ phase, prompt: args.prompt, value: structuredClone(value), source: "combined-action" })
      return { object: structuredClone(args.schema.parse(value)) }
    }
    if (options.strictState && phase === "advance") {
      const patchSchema = strictModelSchema(load("@/lib/wiki-adventures/adventure-patch").adventurePatchSchema)
      args = {
        ...args,
        schema: args.schema.extend({ adventurePatch: patchSchema }).strict(),
        prompt: `${args.prompt}\n\nUse the exact nested adventurePatch field names from the response schema. Record only established changes. Omit fields with no changes. Do not invent discoveries or character changes to fill the schema. Any transition must use fromEncounterId=${turn.encounterId} and toEncounterId equal to nextEncounterId. Unknown fields and malformed nested entries will be rejected.`,
      }
    }
    return inference(args, format)
  }
  async function inference(args, format) {
    const entry = { phase, format, prompt: args.prompt, ...(args.schema ? { schema: z.toJSONSchema(args.schema) } : {}), attempts: [] }
    calls.push(entry)
    let prompt =
      args.prompt + (args.schema ? `\n\nReturn one bare JSON object matching this schema:\n${JSON.stringify(entry.schema)}` : "\n\nReturn prose only, as requested above. Do not wrap prose in JSON.")
    for (let attempt = 0; attempt < 2; attempt++) {
      const start = performance.now()
      let response
      try {
        response = await session.ask(prompt)
      } catch (error) {
        entry.attempts.push({ elapsedMs: Math.round(performance.now() - start), failure: error.message })
        onProgress(calls, milestones)
        throw error
      }
      const validity = args.schema ? validate(response.text, args.schema) : { textValid: Boolean(response.text.trim()) && !response.text.trim().startsWith("{") }
      entry.attempts.push({ elapsedMs: Math.round(performance.now() - start), ...response, ...validity })
      onProgress(calls, milestones)
      if (!response.failed && (validity.schemaValid || validity.textValid)) {
        if (phase === "roll-and-npc" && format === "text" && !milestones.some((m) => m.name === "roll-outcome-ready")) mark("roll-outcome-ready", response.text)
        return args.schema ? { object: structuredClone(validity.value) } : { text: response.text }
      }
      prompt = `Your previous answer failed validation. ${validity.issue ?? "Return the requested format."}\n\n${prompt}`
    }
    throw new Error("service_output_invalid")
  }
  const records = new Map()
  const snapshot = (value) => (value === undefined ? undefined : structuredClone(value))
  const api = new Proxy({}, { get: (_, namespace) => new Proxy({}, { get: (_, name) => `${namespace}:${name}` }) })
  let submitReply
  const store = {
    async query(name, args) {
      if (name === "adventure:getTurnById") return snapshot(records.get(args.turnId))
      if (name === "adventure:getAdventureById") return snapshot(records.get(args.adventureId))
      const turns = [...records.values()].filter((row) => row.adventureId === args.adventureId)
      if (name === "adventure:getTurnsByAdventure") return snapshot(turns)
      if (name === "adventure:getTurnByOrder") return snapshot(turns.find((row) => row.order === args.order) ?? null)
      throw new Error(`Unimplemented query ${name}`)
    },
    async mutation(name, args) {
      writes.push({ operation: name, phase })
      if (name === "adventure:submitReply")
        return submitReply.handler(
          {
            db: {
              get: async (id) => snapshot(records.get(id)),
              patch: async (id, patch) => Object.assign(records.get(id), snapshot(patch)),
            },
          },
          args
        )
      if (name === "turns:updateTurn") {
        Object.assign(records.get(args.turnId), snapshot(args.patch))
        return
      }
      if (name === "adventure:commitWikiTurnAdvance") {
        const proposedPatch = calls.at(-1)?.attempts.at(-1)?.value?.adventurePatch
        const checkedPatch = load("@/lib/wiki-adventures/adventure-patch").adventurePatchSchema.safeParse(proposedPatch ?? {})
        Object.assign(writes.at(-1), {
          patchSchemaValid: checkedPatch.success,
          patchIssues: checkedPatch.success ? [] : checkedPatch.error.issues.map(({ path, code }) => ({ path, code })),
          providedKeysAbsentAfterValidation: Object.keys(proposedPatch ?? {}).filter((key) => args.adventurePatch?.[key] === undefined),
          committedPatch: snapshot(args.adventurePatch),
        })
        if (options.strictState) {
          const result = await commit(args)
          stateAudit = assertPatchPreserved(proposedPatch, args.adventurePatch, records.get(args.adventureId), records.get(result.turnId))
          return result
        }
        const adventure = records.get(args.adventureId)
        assert.equal(adventure.currentTurnId, args.expectedCurrentTurnId)
        assert.equal(adventure.currentEncounterId, args.expectedCurrentEncounterId)
        const id = `turn-${args.order}`
        records.set(id, {
          _id: id,
          adventureId: args.adventureId,
          encounterId: args.nextEncounterId,
          title: args.title,
          narrative: args.narrative,
          characters: snapshot(args.characters),
          order: args.order,
        })
        Object.assign(adventure, { currentTurnId: id, currentEncounterId: args.nextEncounterId })
        return { turnId: id, adventureId: args.adventureId }
      }
      throw new Error(`Unimplemented mutation ${name}`)
    },
  }
  const stubs = {
    "@/lib/ai": { generateObject: (args) => serviceInference(args, "json"), generateText: (args) => serviceInference(args, "text") },
    "@/lib/convex/server": { convex: store },
    "@/convex/_generated/api": { api },
    "@clerk/nextjs/server": { auth: async () => ({ userId: "fixture-player" }) },
    "next/server": { after: () => events.push("audio_after_callback_omitted") },
    waait: async () => {},
    "@/lib/aws": { s3Client: { send: unavailable } },
    "@/lib/s3-utils": { readJsonFromS3: unavailable },
    "@/lib/adventure-plan-storage": { loadAdventurePlanFromStorage: unavailable },
    "@/lib/services/turn-audio-service": { maybeTriggerStoryviewAutoGeneration: unavailable },
    "@/lib/mapview/load": { loadEncounterMap2D: async () => null },
  }
  const { load, sources } = sourceLoader(stubs, events)
  const commit = options.strictState ? memoryCommit(records, sources) : null
  // Execute the actual submitReply mutation handler against an in-memory db.
  const dbSource = readFileSync(join(root, "convex/adventure.ts"), "utf8")
  sources["convex/adventure.ts"] = createHash("sha256").update(dbSource).digest("hex")
  const dbAst = ts.createSourceFile("adventure.ts", dbSource, ts.ScriptTarget.Latest, true)
  let declaration
  for (const statement of dbAst.statements) {
    if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((d) => d.name.getText(dbAst) === "submitReply")) declaration = statement.getText(dbAst)
  }
  assert.ok(declaration)
  const dbExports = {}
  const validators = new Proxy({}, { get: () => () => ({}) })
  vm.runInNewContext(
    ts.transpileModule(declaration, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: dbExports, mutation: (args) => args, v: validators },
    { timeout: 1000 }
  )
  submitReply = dbExports.submitReply

  const runtime = load("@/lib/wiki-adventures/local-runtime")
  const { artifacts, contentRef } = runtime.loadLocalWikiAdventureRuntime("realm-of-myr", "march-of-davos")
  const encounter = artifacts.encounters["the-gates-of-kordavos"]
  const player = {
    id: "mira",
    name: "Mira",
    type: "pc",
    userId: "fixture-player",
    controlledBy: "human",
    race: "Human",
    archetype: "Ranger",
    gender: "female",
    attributes: { strength: 12, dexterity: 15, constitution: 12, intelligence: 10, wisdom: 14, charisma: 11 },
    skills: [],
    equipment: [],
    spells: [],
    image: "",
    healthPercent: 100,
    initiative: 20,
    hasReplied: false,
    isComplete: false,
  }
  const characters = runtime.buildLocalWikiTurnCharacters({ artifacts, encounter, players: [{ userId: "fixture-player", characterId: player.id }], existingPlayerCharacters: [player] })
  for (const c of characters) {
    c.initiative = c.type === "pc" ? 20 : 10
    c.hasReplied = false
    c.isComplete = false
  }
  const adventure = {
    _id: "fixture-adventure",
    ownerId: "fixture-player",
    settingId: "realm-of-myr",
    planId: "march-of-davos",
    status: "active",
    playerIds: ["fixture-player"],
    players: [{ userId: "fixture-player", characterId: player.id }],
    currentTurnId: "turn-1",
    currentEncounterId: encounter.id,
    contentRef,
  }
  const turn = { _id: "turn-1", adventureId: adventure._id, encounterId: encounter.id, title: encounter.title, narrative: encounter.sections.intro, characters, order: 1 }
  records.set(adventure._id, adventure)
  records.set(turn._id, turn)
  const initialState = snapshot(turn)
  const playerInput = 'I try to deceive Garlan into waiving the entrance fee by falsely claiming I am an invited Harvest Festival performer. "The festival organizers are expecting me inside."'
  let result, failure
  try {
    const narrativeAction = await load("@/lib/services/narrative-generation-service").formatNarrativeAction({
      characterName: player.name,
      gender: player.gender,
      playerInput,
      narrativeContext: turn.narrative,
      characterInfo: player,
    })
    mark("action-ready", narrativeAction)
    phase = "player-reply"
    const actions = load("@/app/_actions/adventure")
    const reply = await actions.processTurnReply({ turnId: turn._id, characterId: player.id, narrativeAction, originalPlayerInput: playerInput })
    assert.ok(reply.rollRequired, "Contested deception must exercise the roll path")
    mark("dice-ready", JSON.stringify(reply.rollRequired))
    if (options.combined) assert.equal(cachedServices.length, 2, "Both preflight decisions must be consumed before rolling")
    phase = "roll-and-npc"
    mark("dice-submitted")
    await actions.resolvePlayerRollResult({ turnId: turn._id, characterId: player.id, result: 20 })
    const completed = snapshot(records.get(turn._id))
    assert.ok(
      completed.characters.every((c) => c.isComplete),
      "Every actor must complete before advance"
    )
    mark("actors-complete")
    phase = "advance"
    result = await load("@/app/_actions/advance-turn").advanceTurn({ turnId: turn._id, settingId: adventure.settingId, adventurePlanId: adventure.planId })
    assert.equal(records.get(adventure._id).currentTurnId, "turn-2")
    if (options.strictState) assert.ok(stateAudit?.allSuppliedFieldsPreserved, "Structured state must survive commit")
    mark("turn-complete")
    assert.ok(
      calls.every((c) => {
        const a = c.attempts.at(-1)
        return a.schemaValid || a.textValid
      }),
      "Service fallback must not hide invalid model output"
    )
  } catch (error) {
    failure = error.message
  }
  return {
    status: failure ? "failed" : "completed",
    ...(options.strictState ? { variant: options.combined ? "combined" : "strict", milestones, cachedServices, stateAudit } : {}),
    failure,
    elapsedMs: Math.round(performance.now() - started),
    inferenceRequests: calls.reduce((sum, c) => sum + c.attempts.length, 0),
    serviceCalls: calls.length,
    playerInput,
    fixedPlayerDie: 20,
    randomValue: 0.8,
    initialState,
    finalState: [...records.values()].map(snapshot),
    result,
    calls,
    events,
    writes,
    sourceHashes: sources,
    boundaries: [
      options.strictState ? "In-memory Convex storage, real submitReply and commitWikiTurnAdvance handlers" : "In-memory Convex storage, real submitReply handler",
      "Fixture Clerk user, real access checks",
      "Repository wiki source, no remote S3",
      "No map, audio, billing, or UI dice animation",
      "Real player formatting, reply, roll, NPC and wiki advance orchestration",
      "Single PC with encounter NPCs, no AI companion or combat coverage",
    ],
  }
}
