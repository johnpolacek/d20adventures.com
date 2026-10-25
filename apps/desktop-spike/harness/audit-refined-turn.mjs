import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { completeTurn } from "./complete-turn.mjs"

const file = new URL("../results/refined-turn.json", import.meta.url)
const report = JSON.parse(readFileSync(file))
const receiptFile = new URL("../results/private/display-receipts.jsonl", import.meta.url)
const receipts = existsSync(receiptFile)
  ? readFileSync(receiptFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : []
const stableState = (state) => JSON.parse(JSON.stringify(state, (key, value) => (["createdAt", "updatedAt"].includes(key) ? undefined : value)))
for (const row of report.results) {
  const queue = row.calls?.flatMap((call) => {
    let prompt =
      call.prompt + (call.schema ? `\n\nReturn one bare JSON object matching this schema:\n${JSON.stringify(call.schema)}` : "\n\nReturn prose only, as requested above. Do not wrap prose in JSON.")
    return call.attempts.map((response) => {
      const entry = { prompt, response }
      prompt = `Your previous answer failed validation. ${response.issue ?? "Return the requested format."}\n\n${prompt}`
      return entry
    })
  })
  if (row.status === "completed") {
    let cursor = 0
    const replay = await completeTurn(
      {
        ask: async (prompt) => {
          const next = queue[cursor++]
          assert.ok(next, "Unexpected inference request")
          assert.equal(prompt, next.prompt, "Replay prompt changed")
          return { text: next.response.text, failed: next.response.failed }
        },
      },
      undefined,
      { strictState: true, combined: row.variant === "combined" }
    )
    assert.equal(replay.status, "completed", replay.failure)
    assert.equal(cursor, queue.length)
    assert.deepEqual(replay.stateAudit, row.stateAudit)
    assert.deepEqual(stableState(replay.finalState), stableState(row.finalState))
    row.replayAudit = { matchedRequests: cursor, exactPrompts: true, sameSavedStateIgnoringTimestamps: true, noNewInference: true }
  }
  const matchingReceipts = receipts.filter((r) => r.recordedAt === report.recordedAt && r.provider === row.provider && r.variant === row.variant)
  if (matchingReceipts.length)
    row.displayTimings = matchingReceipts.map(({ name, emittedAt, displayedAt, serviceElapsedMs }) => ({
      name,
      serviceElapsedMs,
      renderDelayMs: displayedAt - emittedAt,
      visibleElapsedMs: serviceElapsedMs + displayedAt - emittedAt,
    }))
}
report.auditedAt = new Date().toISOString()
report.displayTimingMethod =
  "React render followed by two animation frames in the packaged Tauri webview, sampled through 250ms progress polling. This is a visible-render proxy, not first-token streaming or physical screen-scanout timing. Turn timers exclude human dice delay."
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify(
    report.results.map((row) => ({ provider: row.provider, variant: row.variant, status: row.status, replay: row.replayAudit?.exactPrompts, displayedMilestones: row.displayTimings?.length ?? 0 })),
    null,
    2
  )
)
