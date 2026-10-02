import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { completeTurn } from "./complete-turn.mjs"
import { root } from "./fixture.mjs"
import { memoryCommit } from "./memory-commit.mjs"
import { strictModelSchema } from "./strict-state.mjs"
import { sourceLoader } from "./trusted-source.mjs"

process.chdir(root)

const saved = JSON.parse(readFileSync(new URL("../results/complete-turn.json", import.meta.url))).results.find((row) => row.provider === "claude")
const patch = {
  summaryDelta: "Mira gains entry after deceiving Garlan.",
  discoveries: [{ id: "gate-fee", type: "fact", title: "Entry fee", text: "Garlan collects three marks.", visibility: "player" }],
  entityUpdates: [{ entityType: "npc", entityId: "garlan-ironfist", patchText: "Allows Mira through.", visibility: "player" }],
  characterUpdates: [{ characterId: "mira", healthPercent: 90, status: "alert", inventoryChanges: ["Test change retained for later application."] }],
  openThreads: [{ id: "festival", title: "Festival", text: "Explore the festival." }],
  resolvedThreadIds: ["gate-entry"],
  transition: { fromEncounterId: "the-gates-of-kordavos", toEncounterId: "the-harvest-festival", reason: "Entry resolved." },
}

test("strict model schema rejects dropped fields, malformed entries and legacy coercion", () => {
  const { load } = sourceLoader({}, [])
  const current = load("@/lib/wiki-adventures/adventure-patch").adventurePatchSchema
  const strict = strictModelSchema(current)
  assert.deepEqual(strict.parse(patch), patch)
  for (const bad of [{ summary: "wrong key" }, { discoveries: ["known fact"] }, { openThreads: ["legacy string"] }, { transition: { from: "a", to: "b" } }]) {
    assert.equal(strict.safeParse(bad).success, false)
  }
  assert.deepEqual(current.parse(patch), patch)
})

function recordedSession(combined, invalidAttempts = 0, onPrompt = () => {}) {
  let cursor = combined ? 3 : 0
  let preflight = combined
  const advance = { ...saved.calls.at(-1).attempts[0].value, adventurePatch: patch }
  return {
    async ask(prompt) {
      onPrompt(prompt)
      if (preflight) {
        preflight = false
        assert.ok(prompt.startsWith("Perform these three pre-roll tasks"))
        assert.ok(!prompt.includes("Result: 20"))
        const { rollType, difficulty } = saved.calls[1].attempts[0].value
        return {
          text: JSON.stringify({ formattedAction: saved.calls[0].attempts[0].text, rollRequirement: { rollType, difficulty }, situationalModifier: saved.calls[2].attempts[0].value.modifier }),
          failed: false,
        }
      }
      if (cursor === saved.calls.length - 1) {
        if (invalidAttempts-- > 0) return { text: JSON.stringify({ ...advance, adventurePatch: { ...patch, discoveries: ["bad shape"] } }), failed: false }
        cursor++
        return { text: JSON.stringify(advance), failed: false }
      }
      assert.ok(cursor < saved.calls.length)
      return { text: saved.calls[cursor++].attempts[0].text, failed: false }
    },
  }
}

test("full turn corrects invalid nested output and retains every state field through real commit", async () => {
  const result = await completeTurn(recordedSession(false, 1), undefined, { strictState: true })
  assert.equal(result.status, "completed", result.failure)
  assert.equal(result.inferenceRequests, 8)
  assert.equal(result.stateAudit.allSuppliedFieldsPreserved, true)
  const next = result.finalState.find((row) => row._id === "turn-2")
  assert.deepEqual(next.adventurePatch, patch)
  // Explicitly expose the existing difference between retained and applied updates.
  assert.equal(next.characters.find((row) => row.id === "mira").healthPercent, 100)
})

test("two invalid nested outputs stop advancement instead of silently using a summary", async () => {
  const result = await completeTurn(recordedSession(false, 2), undefined, { strictState: true })
  assert.equal(result.status, "failed")
  assert.equal(result.failure, "service_output_invalid")
  assert.ok(!result.finalState.some((row) => row._id === "turn-2"))
})

test("combined action removes two requests and preserves the dice boundary", async () => {
  let milestones = []
  let prompts = 0
  const session = recordedSession(true, 0, () => {
    if (prompts++ === 1) assert.ok(milestones.some((mark) => mark.name === "dice-submitted"))
  })
  const result = await completeTurn(
    session,
    (_, marks) => {
      milestones = marks
    },
    { strictState: true, combined: true }
  )
  assert.equal(result.status, "completed", result.failure)
  assert.equal(result.inferenceRequests, 5)
  assert.equal(result.cachedServices.length, 2)
  assert.deepEqual(result.finalState.find((row) => row._id === "turn-2").adventurePatch, patch)
})

test("real commit resolves existing threads, preserves unrelated state and rejects stale or duplicate advances", async () => {
  const records = new Map([["adventure", { currentTurnId: "turn-1", currentEncounterId: "the-gates-of-kordavos", openThreads: [{ id: "gate-entry" }, { id: "keep" }], discoveries: [{ id: "old" }] }]])
  const commit = memoryCommit(records, {})
  const args = {
    adventureId: "adventure",
    expectedCurrentTurnId: "turn-1",
    expectedCurrentEncounterId: "the-gates-of-kordavos",
    nextEncounterId: "the-harvest-festival",
    order: 2,
    adventurePatch: patch,
    characters: [],
  }
  await commit(args)
  assert.deepEqual(
    records.get("adventure").openThreads.map((t) => t.id),
    ["keep", "festival"]
  )
  assert.equal(records.get("adventure").discoveries[0].id, "old")
  await assert.rejects(commit(args), /Stale turn advance/)
  await assert.rejects(commit({ ...args, expectedCurrentTurnId: "turn-2", expectedCurrentEncounterId: "the-harvest-festival" }), /already exists/)
})
