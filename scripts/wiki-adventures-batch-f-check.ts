import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { applyAdventurePatchToWikiState, validateAdventurePatch, validateWikiTurnAdvanceGuard, type WikiAdventureSessionState } from "@/lib/wiki-adventures"

function main() {
  const schema = readFileSync("convex/schema.ts", "utf8")
  const adventure = readFileSync("convex/adventure.ts", "utf8")
  const turns = readFileSync("convex/turns.ts", "utf8")
  const finalization = readFileSync("lib/services/advance-turn-finalization-service.ts", "utf8")

  for (const required of ["currentEncounterId", "contentRef", "adventureSummaryMarkdown", "discoveries", "entityUpdates", "openThreads", "resolvedThreadIds"]) {
    assert.ok(schema.includes(required), `schema missing ${required}`)
  }
  for (const required of ["adventurePatch", "transition", "generatedBy"]) {
    assert.ok(schema.includes(required), `turn schema missing ${required}`)
  }
  assert.ok(adventure.includes("commitWikiTurnAdvance"), "guarded commit mutation missing")
  assert.ok(adventure.includes("Stale turn advance: current turn changed"), "stale current turn guard missing")
  assert.ok(adventure.includes("Stale turn advance: current encounter changed"), "stale current encounter guard missing")
  assert.ok(adventure.includes("Stale turn advance: content hash changed"), "stale content hash guard missing")
  assert.ok(turns.includes("contentRef"), "turns patchAdventure does not allow contentRef")
  assert.ok(finalization.includes("currentEncounterId: args.newTurn.encounterId"), "legacy finalization does not maintain currentEncounterId")

  const state: WikiAdventureSessionState = {
    currentTurnId: "turn-1",
    currentEncounterId: "gatehouse-entry",
    contentRef: {
      source: "published",
      settingId: "myr",
      planId: "the-old-road",
      contentVersion: "2026-05-22T04-15-00Z-batche001",
      contentHash: "hash-1",
      versionId: "2026-05-22T04-15-00Z-batche001",
      schemaVersion: "1",
    },
    adventureSummaryMarkdown: "The party reached the gatehouse.",
    discoveries: [],
    entityUpdates: [],
    openThreads: [{ id: "road-trouble", title: "Road Trouble", text: "Something is wrong on the old road." }],
    resolvedThreadIds: [],
  }

  assert.deepEqual(
    validateWikiTurnAdvanceGuard(state, {
      expectedCurrentTurnId: "turn-1",
      expectedCurrentEncounterId: "gatehouse-entry",
      expectedContentHash: "hash-1",
    }),
    { ok: true }
  )
  assertGuardReason(
    validateWikiTurnAdvanceGuard(state, {
      expectedCurrentTurnId: "turn-0",
      expectedCurrentEncounterId: "gatehouse-entry",
      expectedContentHash: "hash-1",
    }),
    "stale_turn"
  )
  assertGuardReason(
    validateWikiTurnAdvanceGuard(state, {
      expectedCurrentTurnId: "turn-1",
      expectedCurrentEncounterId: "market-square-arrival",
      expectedContentHash: "hash-1",
    }),
    "stale_encounter"
  )
  assertGuardReason(
    validateWikiTurnAdvanceGuard(state, {
      expectedCurrentTurnId: "turn-1",
      expectedCurrentEncounterId: "gatehouse-entry",
      expectedContentHash: "hash-2",
    }),
    "stale_content"
  )

  const patch = validateAdventurePatch(
    {
      summaryDelta: "Captain Vala grants passage.",
      discoveries: [{ id: "vala-worry", type: "fact", title: "Vala is worried", text: "She is hiding concern.", visibility: "gm" }],
      entityUpdates: [{ entityType: "npc", entityId: "captain-vala", patchText: "Vala now trusts the party.", visibility: "gm" }],
      openThreads: [{ id: "market-rumors", title: "Market Rumors", text: "The market knows more." }],
      resolvedThreadIds: ["road-trouble"],
    },
    { allowed: true, kind: "continue", nextEncounterId: "gatehouse-entry" }
  )
  const nextState = applyAdventurePatchToWikiState(state, patch)
  assert.match(nextState.adventureSummaryMarkdown ?? "", /Captain Vala grants passage/)
  assert.equal(nextState.discoveries?.length, 1)
  assert.equal(nextState.entityUpdates?.length, 1)
  assert.equal(nextState.openThreads?.some((thread) => thread.id === "road-trouble"), false)
  assert.equal(nextState.openThreads?.some((thread) => thread.id === "market-rumors"), true)
  assert.deepEqual(nextState.resolvedThreadIds, ["road-trouble"])

  console.log("Batch F Convex adventure session checks passed")
}

main()

function assertGuardReason(result: ReturnType<typeof validateWikiTurnAdvanceGuard>, reason: "stale_turn" | "stale_encounter" | "stale_content") {
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, reason)
}
