import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ClaudeSession, detect } from "./cli.mjs"
import { fixture, root, spike, system, validate, wirePrompt } from "./fixture.mjs"

const kind = process.argv[2]
if (!["fixture", "detect", "gm", "images"].includes(kind)) throw new Error("Unknown trial")
const resultDir = join(spike, "results")
mkdirSync(resultDir, { recursive: true })
const cwd = mkdtempSync(join(tmpdir(), "d20-desktop-spike-"))
const save = (name, value) => writeFileSync(join(resultDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`)
const report = { recordedAt: new Date().toISOString(), nativeTauri: process.env.D20_SPIKE_NATIVE === "true" }

async function calls(session, fixtureCalls) {
  const output = []
  for (const call of fixtureCalls) {
    const attempts = []
    let prompt = wirePrompt(call)
    for (let attempt = 0; attempt < 2; attempt++) {
      const start = performance.now()
      try {
        const response = await session.ask(prompt)
        const validity = validate(response.text, call.schema)
        attempts.push({ elapsedMs: Math.round(performance.now() - start), ...response, ...validity })
        if (response.failed || validity.schemaValid) break
        prompt = `Your previous answer was rejected: ${validity.issue}. Return a corrected object only.\n\n${wirePrompt(call)}`
      } catch (error) {
        attempts.push({ elapsedMs: Math.round(performance.now() - start), failure: error.message, jsonValid: false, schemaValid: false })
        break
      }
    }
    output.push({ id: call.id, inferenceRequests: attempts.length, expected: call.expected, attempts })
    if (attempts.at(-1).failure) break
  }
  return output
}

try {
  if (kind === "images") {
    const { imageTrials } = await import("./images.mjs")
    report.results = await imageTrials(cwd, resultDir)
    save("image-run", report)
  } else {
    const data = await fixture()
    save("fixture", { ...data.metadata, system, calls: data.calls.map((call) => ({ id: call.id, prompt: wirePrompt(call), expected: call.expected })) })
    if (kind === "fixture") report.fixture = data.metadata
    else {
      report.providers = await detect(cwd)
      save("detect", report)
      if (kind === "gm") {
        report.results = []
        for (const provider of report.providers) {
          if (!provider.allowed) {
            report.results.push({ ...provider, status: "blocked", inferenceRequests: 0, latencyMs: null, jsonValidity: null, quality: "not measured" })
            continue
          }
          const session = new ClaudeSession(cwd, system)
          try {
            const results = await calls(session, data.calls)
            report.results.push({
              ...provider,
              model: session.model,
              startupMs: session.startupMs ?? null,
              lockdownVerified: Boolean(session.lockdownVerified),
              capabilities: session.capabilities,
              processCount: 1,
              requests: session.requests,
              results,
            })
          } finally {
            session.close()
          }
          save("gm", report)
        }
        // Baseline uses only the project's existing Google API key. No CLI credentials,
        // billing, Convex or app wrappers are used, and the key is never logged or saved.
        const { parse } = await import("dotenv")
        const appEnv = {}
        for (const name of [".env", ".env.local"]) {
          try {
            Object.assign(appEnv, parse(readFileSync(join(root, name))))
          } catch {}
        }
        const apiKey = appEnv.GOOGLE_GENERATIVE_AI_API_KEY
        if (apiKey) {
          const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
          const { generateText } = await import("ai")
          const google = createGoogleGenerativeAI({ apiKey })
          const results = await calls(
            {
              ask: async (prompt) => {
                try {
                  const r = await generateText({ model: google("gemini-3.5-flash-lite"), system, prompt, maxRetries: 0, abortSignal: AbortSignal.timeout(120000) })
                  return { text: r.text, failed: false, providerTurns: 1, durationApiMs: null }
                } catch {
                  throw new Error("baseline_request_failed")
                }
              },
            },
            data.calls
          )
          report.results.push({ provider: "google-api-baseline", model: "gemini-3.5-flash-lite", note: "Independent requests with identical prompt/schema/system, no CLI session context", results })
        } else report.results.push({ provider: "google-api-baseline", status: "blocked", reason: "Project Google API key not configured" })
        save("gm", report)
      }
    }
  }
  console.log(JSON.stringify(report))
} finally {
  // This directory only holds this run's prompts, never provider state or credentials.
  rmSync(cwd, { recursive: true, force: true })
}
