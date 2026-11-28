import assert from "node:assert/strict"
import test from "node:test"
import { primaryReadingOf, type TurnReading } from "../../src/services/roll-requirement-service"
import { followRules } from "../../src/sheet/class-rules"
import { FOLLOW_KEYS, type RequiredCast, type RequiredFeature, rollRequirementSchema } from "../../src/validations/roll-requirement-schema"

const SKILL_ROLL = {
  check: { kind: "skill" as const, skill: "stealth" as const },
  rollType: "Stealth",
  difficulty: 15,
  modifier: 4,
  mode: "normal" as const,
}

const QUIET_CAST: RequiredCast = {
  cast: { spell: "magic-missile", targets: ["goblin"] },
  rollType: "Magic Missile",
  difficulty: 0,
  modifier: 0,
  mode: "normal",
}

const QUIET_FEATURE: RequiredFeature = {
  feature: { id: "turn-undead", targets: ["zombie"] },
  rollType: "Turn Undead",
  difficulty: 13,
  modifier: 0,
  mode: "normal",
}

test("primaryReadingOf derives the single canonical outcome from TurnReading", () => {
  assert.deepEqual(primaryReadingOf({ roll: null }), { kind: "none" })
  assert.deepEqual(primaryReadingOf({ roll: null, ruling: { name: "Out of Reach", text: "Too far." } }), {
    kind: "ruling",
    ruling: { name: "Out of Reach", text: "Too far." },
  })
  // Orthogonal ruling + Dash (e.g. Fear's ruled turn) resolves primary as action while keeping ruling on reading.
  assert.deepEqual(primaryReadingOf({ roll: null, action: { action: "dash" }, ruling: { name: "Fear", text: "Flees." } }), {
    kind: "action",
    action: { action: "dash" },
  })
  // Rogue Disengage + Cunning Action Hide resolves primary as roll while keeping action on reading.
  const disengageHide: TurnReading = { roll: SKILL_ROLL, action: { action: "disengage" } }
  assert.deepEqual(primaryReadingOf(disengageHide), { kind: "roll", roll: SKILL_ROLL })
  assert.deepEqual(primaryReadingOf({ roll: null, cast: QUIET_CAST }), { kind: "cast", cast: QUIET_CAST })
  assert.deepEqual(primaryReadingOf({ roll: null, feature: QUIET_FEATURE }), { kind: "feature", feature: QUIET_FEATURE })
  assert.deepEqual(primaryReadingOf({ roll: null, rest: "short" }), { kind: "rest", rest: "short" })
})

test("RollRequirement.after schema accepts every registered FollowRule key and drops unknown keys", () => {
  const known = new Set<string>(FOLLOW_KEYS)
  for (const rule of followRules()) {
    assert.ok(known.has(rule.key), `FollowRule key "${rule.key}" must be listed in FOLLOW_KEYS`)
  }

  const parsed = rollRequirementSchema.parse({
    ...SKILL_ROLL,
    after: {
      attacks: 1,
      struck: ["bandit"],
      hide: true,
      horde: true,
      "devouring-blade": true,
      "flurry-topple-again": true,
      bogusUnknownFlag: true,
    },
  })
  assert.ok(parsed && "after" in parsed && parsed.after)
  assert.equal(parsed.after.horde, true)
  assert.equal(parsed.after["devouring-blade"], true)
  assert.equal(parsed.after["flurry-topple-again"], true)
  assert.equal("bogusUnknownFlag" in parsed.after, false)
})
