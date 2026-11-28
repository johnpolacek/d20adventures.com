import assert from "node:assert/strict"
import test from "node:test"
import { buildNpcInitiativeOrder } from "../../src/services/npc-turn-intent-service"
import { afterHarm, atRoundStart } from "../../src/sheet/death"
import { applySlotEvent, slotFlags, slotOf, transitionTurnSlot, withSlot } from "../../src/sheet/turn-slot"
import type { TurnCharacter } from "../../src/types/adventure"
import { DEATH_SAVE, type RollRequirement } from "../../src/validations/roll-requirement-schema"

const SKILL_ROLL: RollRequirement = {
  check: { kind: "skill", skill: "persuasion" },
  rollType: "Persuasion",
  difficulty: 12,
  modifier: 3,
  mode: "normal",
}

const FOLLOWUP_ROLL: RollRequirement = {
  check: { kind: "skill", skill: "stealth" },
  rollType: "Stealth",
  difficulty: 15,
  modifier: 5,
  mode: "normal",
}

test("slotOf and withSlot round-trip pending, awaiting_roll, and complete slots losslessly", () => {
  const base = { id: "hero", name: "Lyra", hasReplied: false, isComplete: false }
  assert.deepEqual(slotOf(base), { phase: "pending" })
  assert.deepEqual(slotFlags({ phase: "pending" }), { hasReplied: false, isComplete: false })

  const awaiting = withSlot(base, { phase: "awaiting_roll", required: SKILL_ROLL })
  assert.deepEqual(slotOf(awaiting), { phase: "awaiting_roll", required: SKILL_ROLL })
  assert.equal(awaiting.hasReplied, true)
  assert.equal(awaiting.isComplete, false)
  assert.deepEqual(awaiting.rollRequired, SKILL_ROLL)

  const done = withSlot(awaiting, { phase: "complete", rollResult: 17 })
  assert.deepEqual(slotOf(done), { phase: "complete", rollResult: 17 })
  assert.equal(done.hasReplied, true)
  assert.equal(done.isComplete, true)
  assert.equal("rollRequired" in done, false)
  assert.equal(done.rollResult, 17)

  // Legacy fled characters stored as hasReplied: false, isComplete: true still read as complete.
  assert.deepEqual(slotOf({ hasReplied: false, isComplete: true }), { phase: "complete" })
})

test("transitionTurnSlot enforces valid phase transitions and rejects overwrites", () => {
  // Pending -> awaiting_roll -> awaiting_roll (follow-up) -> complete.
  const awaiting = transitionTurnSlot({ phase: "pending" }, { type: "reply", required: SKILL_ROLL })
  assert.deepEqual(awaiting, { phase: "awaiting_roll", required: SKILL_ROLL })

  const followup = transitionTurnSlot(awaiting, { type: "resolve_roll", total: 15, next: FOLLOWUP_ROLL })
  assert.deepEqual(followup, { phase: "awaiting_roll", required: FOLLOWUP_ROLL })

  const done = transitionTurnSlot(followup, { type: "resolve_roll", total: 19 })
  assert.deepEqual(done, { phase: "complete", rollResult: 19 })

  // Reply without a roll goes directly to complete.
  assert.deepEqual(transitionTurnSlot({ phase: "pending" }, { type: "reply" }), { phase: "complete" })

  // Guard: cannot reply once awaiting_roll or complete.
  assert.throws(() => transitionTurnSlot(awaiting, { type: "reply" }), /already acted/)
  assert.throws(() => transitionTurnSlot(done, { type: "reply" }), /already acted/)

  // Guard: cannot resolve_roll from pending or complete.
  assert.throws(() => transitionTurnSlot({ phase: "pending" }, { type: "resolve_roll", total: 10 }), /No roll required/)
  assert.throws(() => transitionTurnSlot(done, { type: "resolve_roll", total: 10 }), /Roll already completed/)
})

test("atRoundStart and afterHarm drive TurnSlot transitions cleanly", () => {
  const dyingPc = atRoundStart({ id: "h1", type: "pc", hitPoints: 0, healthPercent: 0, hasReplied: false, isComplete: false })
  const dyingSlot = slotOf(dyingPc)
  assert.equal(dyingSlot.phase, "awaiting_roll")
  assert.ok("deathSave" in dyingSlot.required)

  // Mid-round harm preserves a round-start Death Saving Throw, but completes a non-death-save roll.
  assert.equal(slotOf(afterHarm(dyingPc)).phase, "awaiting_roll")

  const midRollDowned = afterHarm({
    id: "h2",
    type: "pc",
    hitPoints: 0,
    healthPercent: 0,
    ...slotFlags({ phase: "awaiting_roll", required: SKILL_ROLL }),
  })
  assert.deepEqual(slotOf(midRollDowned), { phase: "complete" })
  assert.equal("rollRequired" in midRollDowned, false)
})

test("buildNpcInitiativeOrder includes dominated heroes awaiting a roll and excludes mid-roll humans", () => {
  const base = {
    name: "Hero",
    type: "pc" as const,
    hitPoints: 20,
    healthPercent: 100,
    initiative: 15,
  } as TurnCharacter

  const midRollHuman = withSlot({ ...base, id: "human", initiative: 20 }, { phase: "awaiting_roll", required: SKILL_ROLL })
  const midRollDominated = withSlot(
    { ...base, id: "dominated", initiative: 18, master: { id: "mage", spell: "dominate-person", side: "foe" } },
    { phase: "awaiting_roll", required: SKILL_ROLL }
  )
  const midRollAi = withSlot({ ...base, id: "ai", initiative: 16, controlledBy: "ai" }, { phase: "awaiting_roll", required: SKILL_ROLL })
  const dyingHuman = withSlot({ ...base, id: "dying", initiative: 14, hitPoints: 0, healthPercent: 0 }, { phase: "awaiting_roll", required: DEATH_SAVE })
  const pendingNpc = applySlotEvent({ ...base, id: "npc", type: "npc", initiative: 12 } as TurnCharacter, { type: "reset" })
  const completeNpc = applySlotEvent({ ...base, id: "done-npc", type: "npc", initiative: 25 } as TurnCharacter, { type: "complete" })

  const order = buildNpcInitiativeOrder([midRollHuman, midRollDominated, midRollAi, dyingHuman, pendingNpc, completeNpc])
  assert.deepEqual(
    order.map((c) => c.id),
    ["dominated", "ai", "dying", "npc"]
  )
})
