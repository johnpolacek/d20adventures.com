import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { completeTurn } from "./complete-turn.mjs"

// Replay saved model outputs through the real services. No CLI or API calls.
// Exact prompt equality guards against attributing a different flow to the run.
const file = new URL("../results/complete-turn.json", import.meta.url)
const report = JSON.parse(readFileSync(file))
for (const row of report.results) {
  if (row.status !== "completed") continue
  const queue = row.calls.flatMap((call) => {
    let prompt =
      call.prompt + (call.schema ? `\n\nReturn one bare JSON object matching this schema:\n${JSON.stringify(call.schema)}` : "\n\nReturn prose only, as requested above. Do not wrap prose in JSON.")
    return call.attempts.map((response) => {
      const entry = { prompt, response }
      prompt = `Your previous answer failed validation. ${response.issue ?? "Return the requested format."}\n\n${prompt}`
      return entry
    })
  })
  let cursor = 0
  const result = await completeTurn({
    ask: async (prompt) => {
      const next = queue[cursor++]
      assert.ok(next, "Unexpected replay inference request")
      assert.equal(prompt, next.prompt, "Replay prompt differs from live prompt")
      return { text: next.response.text, failed: next.response.failed }
    },
  })
  assert.equal(result.status, "completed", result.failure)
  assert.equal(cursor, queue.length)
  row.replayAudit = {
    note: "Offline replay of saved responses, no new inference. Every service prompt matched the live run exactly.",
    matchedRequests: cursor,
    patchCommit: result.writes.find((write) => write.operation === "adventure:commitWikiTurnAdvance"),
  }
}
report.auditedAt = new Date().toISOString()
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify(
    report.results.map((row) => ({ provider: row.provider, status: row.status, patchSchemaValid: row.replayAudit?.patchCommit.patchSchemaValid })),
    null,
    2
  )
)
