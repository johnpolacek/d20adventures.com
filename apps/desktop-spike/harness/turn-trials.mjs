import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { providers } from "./cli.mjs"
import { completeTurn, turnSystem } from "./complete-turn.mjs"
import { root } from "./fixture.mjs"
import { createSession, sessionReport } from "./sessions.mjs"

export async function turnTrials(resultDir, report, refinement = false) {
  const results = []
  const runs = refinement
    ? ["claude", "codex", "grok", "google-api-baseline"].flatMap((provider) => ["strict", "combined"].map((variant) => ({ provider, variant })))
    : [...providers, "google-api-baseline"].map((provider) => ({ provider }))
  mkdirSync(join(resultDir, "private"), { recursive: true })
  for (const { provider, variant } of runs) {
    const cwd = mkdtempSync(join(tmpdir(), "d20-full-turn-"))
    let session
    try {
      if (provider === "google-api-baseline") {
        const { parse } = await import("dotenv")
        const appEnv = {}
        for (const file of [".env", ".env.local"]) {
          try {
            Object.assign(appEnv, parse(readFileSync(join(root, file))))
          } catch {}
        }
        if (!appEnv.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("baseline_not_configured")
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
        const { generateText } = await import("ai")
        const google = createGoogleGenerativeAI({ apiKey: appEnv.GOOGLE_GENERATIVE_AI_API_KEY })
        session = {
          requests: 0,
          model: "gemini-3.5-flash-lite",
          async ask(prompt) {
            this.requests++
            try {
              const result = await generateText({ model: google(this.model), system: turnSystem, prompt, maxRetries: 0, abortSignal: AbortSignal.timeout(120000) })
              return { text: result.text, failed: false, providerTurns: 1 }
            } catch {
              throw new Error("baseline_request_failed")
            }
          },
          close() {},
        }
      } else session = createSession(provider, cwd, turnSystem)
      const result = await completeTurn(
        session,
        (calls, milestones) => {
          const progress = { recordedAt: report.recordedAt, provider, variant, completedCalls: calls.length, phase: calls.at(-1)?.phase, milestones }
          writeFileSync(join(resultDir, "private", "turn-progress.json"), JSON.stringify(progress, null, 2))
        },
        refinement ? { strictState: true, combined: variant === "combined" } : {}
      )
      results.push({
        provider,
        variant,
        ...sessionReport(session),
        ...result,
        inferenceRequests: session.requests,
        ...(provider === "google-api-baseline"
          ? { processCount: null, note: "Independent API calls with identical service code and starting state. Later prompts depend on each model's earlier output." }
          : {}),
      })
    } catch (error) {
      results.push({ provider, variant, ...(session ? sessionReport(session) : {}), status: "failed", failure: error.message })
    } finally {
      session?.close()
      rmSync(cwd, { recursive: true, force: true })
    }
    writeFileSync(join(resultDir, refinement ? "refined-turn.json" : "complete-turn.json"), JSON.stringify({ ...report, results }, null, 2))
  }
  return results
}
