import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import ts from "typescript"
import { z } from "zod"
import promptService from "../../../lib/services/advance-turn-prompt-service.ts"

const { buildEncounterProgressionPrompt, buildTransitionsText } = promptService

export const root = fileURLToPath(new URL("../../../", import.meta.url))
export const spike = fileURLToPath(new URL("../", import.meta.url))
export const system = "You are the Game Master for D20 Adventures. Use only the supplied fictional context. Do not use tools. Return only the requested JSON, without markdown fences."
const source = (path) => readFileSync(new URL(path, `file://${root}`), "utf8")

// The progression schema is intentionally private to a server action. Extract exactly its
// trusted repository declaration so this spike cannot drift or import auth/server side effects.
function schemaDeclaration(path, name) {
  const text = source(path)
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  let initializer
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer?.getText(file)
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (!initializer) throw new Error(`Schema ${name} not found`)
  return vm.runInNewContext(initializer, { z }, { timeout: 1000 })
}

// Build the actual roll service prompt with inference intercepted. No AI, database, S3,
// billing or web imports are executed. Only this repository's trusted service is evaluated.
async function rollProbe(intro, notes) {
  const text = source("lib/services/roll-requirement-service.ts")
  const file = ts.createSourceFile("roll.ts", text, ts.ScriptTarget.Latest, true)
  const fn = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "getRollRequirementForAction")
  if (!fn) throw new Error("Roll service changed")
  const js = ts.transpileModule(fn.getText(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  let captured
  const exports = {}
  vm.runInNewContext(
    js,
    {
      exports,
      z,
      console: { log() {}, error() {} },
      formatSpellsForPrompt: () => "",
      generateObject: async (args) => {
        captured = args
        return { object: { rollType: "none", difficulty: 0 } }
      },
    },
    { timeout: 1000 }
  )
  await exports.getRollRequirementForAction(
    "I pay the posted three-mark entrance fee and state that I have come for the Harvest Festival.",
    {
      name: "Mira",
      archetype: "Ranger",
      race: "Human",
      attributes: { strength: 12, dexterity: 15, constitution: 12, intelligence: 10, wisdom: 14, charisma: 11 },
    },
    { encounterIntro: intro, encounterInstructions: notes, narrativeContext: intro }
  )
  return { id: "warm-roll-schema-probe", prompt: captured.prompt, schema: captured.schema, expected: { rollType: "none", difficulty: 0 } }
}

export async function fixture() {
  const path = "content/settings/realm-of-myr/adventures/march-of-davos/encounters/the-gates-of-kordavos.md"
  const encounter = source(path)
  const section = (title) => encounter.split(`## ${title}\n\n`)[1]?.split("\n## ")[0]?.trim() ?? ""
  const intro = section("Intro"),
    notes = section("GM Notes")
  const action = "Mira places three marks in Garlan Ironfist's hand and says, 'I have come for the Harvest Festival.' Garlan counts the coins."
  const schema = schemaDeclaration("app/_actions/advance-turn.ts", "encounterProgressionSchema")
  const prompt = buildEncounterProgressionPrompt({
    adventureOverview: "Adventure Overview: March of Davos, arrival in Kordavos during the Harvest Festival.",
    sectionContext: "Section Title: Arrival At Kordavos",
    sceneContext: "Scene Title: Arrival at Kordavos",
    currentEncounterTitle: "The Gates of Kordavos",
    currentEncounterId: "the-gates-of-kordavos",
    encounterIntro: intro,
    encounterInstructions: notes,
    recentTurnHistory: "No previous turns available.",
    narrativeContext: `${intro}\n\n${action}`,
    mostRecentNarrativeBlock: action,
    rollInfo: "No roll was required for paying the posted entrance fee.",
    transitionsText: buildTransitionsText({ transitions: [{ condition: "After resolving The Gates of Kordavos, continue to The Harvest Festival.", encounter: "the-harvest-festival" }] }),
    encounterTurnDisplay: "0",
    currentEncounterTurnNumber: 1,
    playerCharacterNames: "Mira",
    spatialContext: "Mira is beside Garlan at the inspection table. The open city gate is behind Garlan.",
  })
  const files = [path, "lib/services/advance-turn-prompt-service.ts", "app/_actions/advance-turn.ts", "lib/services/roll-requirement-service.ts"]
  return {
    metadata: {
      name: "Authored Kordavos gate, completed fee payment",
      scope: "One encounter-progression GM turn, then a separate roll-schema request in the same process. Not a full reply/dice/NPC/AI-party pipeline.",
      sources: Object.fromEntries(files.map((path) => [path, createHash("sha256").update(source(path)).digest("hex")])),
    },
    calls: [{ id: "progression-turn", prompt, schema, expected: { nextEncounterId: "the-harvest-festival" } }, await rollProbe(intro, notes)],
  }
}

export function wirePrompt(call) {
  return `${call.prompt}\n\n<result-schema>\n${JSON.stringify(z.toJSONSchema(call.schema))}\n</result-schema>\nReturn exactly one JSON object. No fences or commentary.`
}

export function validate(raw, schema) {
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    return { jsonValid: false, schemaValid: false, issue: "Reply is not a bare JSON document" }
  }
  const parsed = schema.safeParse(value)
  return {
    jsonValid: true,
    schemaValid: parsed.success,
    ...(parsed.success ? { value: parsed.data } : { issue: JSON.stringify(parsed.error.issues.map(({ path, code, message }) => ({ path, code, message }))) }),
  }
}
