import assert from "node:assert/strict"
import { test } from "node:test"
import { autoCreate, type CreationPick, createSheet, creationOptions } from "../../src/sheet/create"
import { deriveSheet, pickedFreeCasts, sheetProblems } from "../../src/sheet/derive"
import { levelUp, levelUpOptions } from "../../src/sheet/level-up"
import { autoChoices } from "../../src/sheet/milestone"
import type { FeaturePick, Sheet } from "../../src/sheet/sheet"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules, not copied from the function's output.
// The Warlock Features table's Invocations column: 1 at level 1, 3 at levels 2 to 4, 5 at level 5. Metamagic: "you
// gain two Metamagic options of your choice" at Sorcerer level 2.

// A level 1 Human Warlock, Criminal. The creation maths take any SRD class: the creator's own list is lifted here.
const pick = { class: "warlock", species: "human", background: "criminal" } as unknown as CreationPick
const ok = (result: ReturnType<typeof levelUp>): Sheet => {
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
const made = (): Sheet => {
  const result = createSheet(pick, autoCreate(pick))
  if ("problems" in result) assert.fail(result.problems.join("; "))
  return result.sheet
}
const INVOCATIONS = "warlock-eldritch-invocations"
const invocations = (sheet: Sheet) => sheet.featurePicks?.[INVOCATIONS] ?? []
const problemsOf = (result: ReturnType<typeof levelUp>) => ("problems" in result ? result.problems : [])

test("a level 1 Warlock takes one invocation, one with no prerequisite", () => {
  const options = creationOptions(pick)
  const offer = options.featurePicks?.find((entry) => entry.feature.id === INVOCATIONS)
  assert.equal(offer?.count, 1)
  assert.equal(offer?.replace, false)
  // Agonizing Blast names its level and a damage cantrip: Eldritch Blast, Chill Touch and Poison Spray of the list.
  const agonizing = offer?.options.find((option) => option.id === "agonizing-blast")
  assert.deepEqual(agonizing?.prerequisite, { text: "Level 2+ Warlock, a Warlock Cantrip That Deals Damage", level: 2 })
  assert.deepEqual(
    agonizing?.cantrips?.map((cantrip) => cantrip.id),
    ["chill-touch", "eldritch-blast", "poison-spray"]
  )
  assert.equal(offer?.options.find((option) => option.id === "eldritch-smite")?.prerequisite?.option, "pact-of-the-blade")

  // Choose For Me takes Armor of Shadows, whose Mage Armor the engine runs, cast on oneself at will.
  const sheet = made()
  assert.deepEqual(invocations(sheet), [{ option: "armor-of-shadows" }])
  assert.deepEqual(pickedFreeCasts(sheet), [{ spell: "mage-armor", option: "armor-of-shadows", feature: INVOCATIONS, selfOnly: true }])

  const chosen = (picks: FeaturePick[]) => {
    const result = createSheet(pick, { ...autoCreate(pick), featurePicks: { [INVOCATIONS]: picks } })
    return "problems" in result ? result.problems : []
  }
  assert.deepEqual(chosen([{ option: "pact-of-the-tome" }]), [])
  assert.deepEqual(chosen([]), ["Eldritch Invocations lists no picks", "Eldritch Invocations takes 1 options at level 1, and the sheet has 0"])
  assert.deepEqual(chosen([{ option: "agonizing-blast", cantrip: "eldritch-blast" }]), ["Agonizing Blast needs level 2, and the sheet is level 1"])
  assert.deepEqual(chosen([{ option: "pact-of-the-tome" }, { option: "eldritch-mind" }]), ["Eldritch Invocations takes 1 options at level 1, and the sheet has 2"])
})

test("a Warlock at level 2 takes two more, may replace one, and is refused an unmet prerequisite", () => {
  const sheet = made()
  const options = levelUpOptions(sheet)
  const offer = options.featurePicks?.find((entry) => entry.feature.id === INVOCATIONS)
  assert.deepEqual([offer?.count, offer?.replace, offer?.picked], [3, true, [{ option: "armor-of-shadows" }]])

  const taking = (picks: FeaturePick[]) => levelUp(sheet, { ...autoChoices(sheet), featurePicks: { [INVOCATIONS]: picks } })
  const two = ok(taking([{ option: "armor-of-shadows" }, { option: "devils-sight" }, { option: "agonizing-blast", cantrip: "eldritch-blast" }]))
  assert.equal(invocations(two).length, 3)
  // Eldritch Smite needs level 5 and Pact of the Blade; Witch Sight level 15.
  assert.deepEqual(problemsOf(taking([{ option: "armor-of-shadows" }, { option: "devils-sight" }, { option: "eldritch-smite" }])), [
    "Eldritch Smite needs level 5, and the sheet is level 2",
    "Eldritch Smite needs Pact of the Blade, and the sheet has not picked it",
  ])
  // Agonizing Blast works with a damage cantrip the hero knows: Mage Hand deals none.
  assert.deepEqual(problemsOf(taking([{ option: "armor-of-shadows" }, { option: "devils-sight" }, { option: "agonizing-blast", cantrip: "mage-hand" }])), [
    "Agonizing Blast works with Mage Hand, which the hero does not know",
  ])
  // One kept from before is replaced, and only one.
  assert.equal(invocations(ok(taking([{ option: "eldritch-mind" }, { option: "devils-sight" }, { option: "otherworldly-leap" }]))).length, 3)
  const refused = problemsOf(levelUp(two, { ...autoChoices(two), featurePicks: { [INVOCATIONS]: [{ option: "armor-of-shadows" }, { option: "pact-of-the-tome" }, { option: "pact-of-the-chain" }] } }))
  assert.deepEqual(refused, ["Eldritch Invocations may replace one option at level 3, and the choices replace 2"])
  // An invocation is not taken twice unless it is repeatable.
  assert.deepEqual(problemsOf(taking([{ option: "armor-of-shadows" }, { option: "devils-sight" }, { option: "devils-sight" }])), ["Devil’s Sight is picked twice, and it is not repeatable"])
})

test("a Warlock at level 5 holds five: a repeatable one twice with two cantrips, Pact of the Blade before Eldritch Smite", () => {
  let sheet = made()
  while (sheet.level < 4) sheet = ok(levelUp(sheet, autoChoices(sheet)))
  const options = levelUpOptions(sheet)
  const offer = options.featurePicks?.find((entry) => entry.feature.id === INVOCATIONS)
  assert.deepEqual([offer?.count, offer?.picked.length], [5, 3])
  // Level 4 adds a cantrip by the table (2 to 3), and Choose For Me fills the two new invocations.
  const auto = ok(levelUp(sheet, autoChoices(sheet)))
  assert.equal(invocations(auto).length, 5)
  assert.deepEqual(sheetProblems(auto), [])

  const base = autoChoices(sheet)
  const known = deriveSheet(sheet).cantrips
  assert.ok(known.includes("eldritch-blast") && known.includes("chill-touch"))
  const kept = offer?.picked ?? []
  const taking = (picks: FeaturePick[]) => levelUp(sheet, { ...base, featurePicks: { [INVOCATIONS]: [...kept, ...picks] } })
  const replaced = (picks: FeaturePick[]) => levelUp(sheet, { ...base, featurePicks: { [INVOCATIONS]: [...kept.slice(1), ...picks] } })
  // Pact of the Blade in place of one, then Eldritch Smite and Thirsting Blade on top of it.
  assert.equal(invocations(ok(replaced([{ option: "pact-of-the-blade" }, { option: "eldritch-smite" }, { option: "thirsting-blade" }]))).length, 5)
  assert.deepEqual(problemsOf(taking([{ option: "eldritch-smite" }, { option: "ascendant-step" }])), ["Eldritch Smite needs Pact of the Blade, and the sheet has not picked it"])
  // Repelling Blast twice, with Eldritch Blast and with Chill Touch, but not twice with one cantrip.
  const twice = kept.filter((each) => each.option !== "repelling-blast")
  const twiceOver = (picks: FeaturePick[]) => levelUp(sheet, { ...base, featurePicks: { [INVOCATIONS]: [...twice, ...picks].slice(-5) } })
  assert.deepEqual(
    problemsOf(
      twiceOver([
        { option: "repelling-blast", cantrip: "eldritch-blast" },
        { option: "repelling-blast", cantrip: "chill-touch" },
      ])
    ).filter((problem) => problem.includes("Repelling")),
    []
  )
  assert.deepEqual(
    problemsOf(
      twiceOver([
        { option: "repelling-blast", cantrip: "eldritch-blast" },
        { option: "repelling-blast", cantrip: "eldritch-blast" },
      ])
    ).filter((problem) => problem.includes("Repelling")),
    ["Repelling Blast is picked twice with the same cantrip"]
  )
  // Lessons of the First Ones gives an Origin feat the hero lacks and that asks for no picks.
  assert.deepEqual(problemsOf(taking([{ option: "lessons-of-the-first-ones", feat: "savage-attacker" }, { option: "ascendant-step" }])), [])
  assert.deepEqual(problemsOf(taking([{ option: "lessons-of-the-first-ones", feat: "alert" }, { option: "ascendant-step" }])), ["Alert is taken twice, and it is not repeatable"])
  assert.deepEqual(problemsOf(taking([{ option: "lessons-of-the-first-ones", feat: "magic-initiate" }, { option: "ascendant-step" }])), [
    "Magic Initiate asks for picks that have no home when Lessons of the First Ones gives it",
  ])
  assert.deepEqual(problemsOf(taking([{ option: "lessons-of-the-first-ones", feat: "archery" }, { option: "ascendant-step" }])), [
    'Lessons of the First Ones gives origin feat, and "archery" is not one',
  ])
})

test("a Sorcerer takes two Metamagic options at level 2, and may replace one at level 3", () => {
  const sorcerer = { class: "sorcerer", species: "human", background: "criminal" } as unknown as CreationPick
  const level1 = createSheet(sorcerer, autoCreate(sorcerer))
  if ("problems" in level1) assert.fail(level1.problems.join("; "))
  assert.equal(level1.sheet.featurePicks, undefined)
  const options = levelUpOptions(level1.sheet)
  const offer = options.featurePicks?.find((entry) => entry.feature.id === "sorcerer-metamagic")
  assert.deepEqual([offer?.count, offer?.replace, offer?.picked, offer?.options.length], [2, false, [], 10])
  const taking = (picks: FeaturePick[]) => levelUp(level1.sheet, { ...autoChoices(level1.sheet), featurePicks: { "sorcerer-metamagic": picks } })
  const level2 = ok(taking([{ option: "careful-spell" }, { option: "subtle-spell" }]))
  assert.deepEqual(level2.featurePicks?.["sorcerer-metamagic"], [{ option: "careful-spell" }, { option: "subtle-spell" }])
  assert.deepEqual(problemsOf(taking([{ option: "careful-spell" }])), ["Metamagic takes 2 options at level 2, and the sheet has 1"])
  assert.deepEqual(problemsOf(taking([{ option: "careful-spell" }, { option: "careful-spell" }])), ["Careful Spell is picked twice, and it is not repeatable"])
  assert.deepEqual(problemsOf(taking([{ option: "careful-spell" }, { option: "fireball" }])), ['"fireball" is not an option of Metamagic'])
  // Choose For Me takes Quickened and Twinned Spell.
  assert.deepEqual(autoChoices(level1.sheet).featurePicks?.["sorcerer-metamagic"], [{ option: "twinned-spell" }, { option: "heightened-spell" }])
  // At level 3 one may be replaced, keeping two.
  const level3 = ok(levelUp(level2, { ...autoChoices(level2), featurePicks: { "sorcerer-metamagic": [{ option: "careful-spell" }, { option: "twinned-spell" }] } }))
  assert.deepEqual(level3.featurePicks?.["sorcerer-metamagic"], [{ option: "careful-spell" }, { option: "twinned-spell" }])
})
