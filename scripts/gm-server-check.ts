import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import { z } from "zod"
import { composeSystemPrompt } from "../lib/ai/style"
import { sanitizeUserVisibleProse } from "../lib/utils/narrative-utils"

// Execute the actual server adapters with only transport/auth/time stubbed.
// No Clerk session, model API, or live token ledger is touched by these checks.
function load(path: string, stubs: Record<string, unknown>, delays: number[]) {
  const exports: any = {}
  const source = readFileSync(path, "utf8")
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    {
      exports,
      Error,
      require: (name: string) => {
        assert.ok(Object.hasOwn(stubs, name), `Unexpected dependency: ${name}`)
        return stubs[name]
      },
      console: { log() {}, warn() {}, error() {} },
      setTimeout: (fn: () => void, ms: number) => {
        delays.push(ms)
        fn()
      },
    },
    { filename: path, timeout: 1000 }
  )
  return exports
}

async function main() {
  const charges: any[] = [],
    requests: any[] = [],
    delays: number[] = []
  let chargeResult: any = { success: true }
  let responses: any[] = []
  const billing = load(
    "lib/gm-server/billing.ts",
    {
      "@/app/_actions/tokens": {
        decrementUserTokensAction: async (args: unknown) => {
          charges.push(args)
          return chargeResult
        },
      },
    },
    delays
  )
  const provider = async (args: unknown) => {
    requests.push(args)
    const response = responses.shift()
    assert.ok(response, "unexpected provider request")
    if (response instanceof Error) throw response
    return structuredClone(response)
  }
  const chargeUsage = billing.serverBilling.chargeUsage
  billing.serverBilling.chargeUsage = function (...args: unknown[]) {
    assert.equal(this, billing.serverBilling, "billing adapter lost its receiver")
    return chargeUsage(...args)
  }
  const adapter = load(
    "lib/gm-server/llm.ts",
    {
      "@clerk/nextjs/server": { auth: async () => ({ userId: "test-user" }) },
      ai: { generateObject: provider, generateText: provider, streamObject: provider },
      "@/lib/utils/narrative-utils": { sanitizeUserVisibleProse },
      "../ai/llm": { currentModel: { modelId: "fixture-model" } },
      "../ai/style": { composeSystemPrompt },
      "./billing": billing,
    },
    delays
  ).createServerLlm()
  const args = { prompt: "test", system: "extra rule", schema: z.object({ text: z.string(), characterId: z.string() }) }
  responses = [{ object: { text: "**Bold**", characterId: "literal-key" }, usage: { totalTokens: 17 } }]
  const result = await adapter.generateObject(args)
  assert.equal(result.object.text, sanitizeUserVisibleProse("**Bold**"))
  assert.equal(result.object.characterId, "literal-key")
  assert.equal(charges[0].tokensUsed, 17)
  assert.equal(requests[0].system, composeSystemPrompt("extra rule"))

  responses = [new Error("rate exceeded"), { text: "Recovered.", usage: { totalTokens: 9 } }]
  assert.equal((await adapter.generateText({ prompt: "retry" })).text, "Recovered.")
  assert.equal(delays.at(-1), 10000)
  assert.equal(charges.length, 2)

  responses = [new Error("temporary failure"), { object: { text: "Recovered.", characterId: "pc" }, usage: { totalTokens: 4 } }]
  await adapter.generateObject(args)
  assert.equal(delays.at(-1), 2000)
  assert.equal(charges.length, 3)

  responses = [Object.assign(new Error("JSON parsing failed"), { text: '```json\n{"text":"Cleaned.","characterId":"pc"}\n```', usage: { totalTokens: 3 } })]
  assert.equal((await adapter.generateObject(args)).object.text, "Cleaned.")
  assert.equal(charges.length, 4)

  for (const code of ["INSUFFICIENT_TOKENS", "CHARGE_FAILED"]) {
    chargeResult = { success: false, errorCode: code }
    for (const method of ["generateText", "generateObject"]) {
      const count = requests.length
      responses = [{ text: "Charged output.", object: { text: "Charged output.", characterId: "pc" }, usage: { totalTokens: 5 } }]
      await assert.rejects(adapter[method](args), (error: any) => error.name === "TokenChargeError" && error.code === code)
      assert.equal(requests.length, count + 1, "billing failure must not trigger another model call")
    }
  }
  const count = charges.length
  await billing.serverBilling.chargeUsage(0, "usage_generate_text", "empty")
  assert.equal(charges.length, count)
  console.log("GM server: style, sanitation, successful charges, retry delays, cleaned JSON, and non-retried billing errors passed.")
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
