import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { featureResolver } from "../../src/sheet/features"
import { holdBarred, resolveHold } from "../../src/sheet/holds"
import { escapeFrom, strengthAndProficiency } from "../../src/sheet/hit-riders"
import type { Sheet } from "../../src/sheet/sheet"
import { createRollRequirementService } from "../../src/services/roll-requirement-service"

// Every expected value below was worked out by hand from SRD 5.2.1, Unarmed Strike: the target saves with Strength or
// Dexterity, its choice, against 8 plus the striker's Strength modifier and Proficiency Bonus. Thalbern is a level 1
// human Ranger, Medium, Strength +1 and Proficiency Bonus +2, so DC 11. A Bandit is Medium, Strength save +0 and
// Dexterity save +1. An Owlbear is Large, Strength save +5 and Dexterity save +1. A Cloud Giant is Huge.

type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints: number
  position?: { x: number; y: number }
  conditions?: ConditionEntry[]
}
const sheetAt = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
const thalbern: Character = { id: "thalbern", name: "Thalbern", type: "pc", sheet: sheetAt("the-midnight-summons/characters/thalbern.json"), hitPoints: 11 }
const npc = (id: string, statBlock: string, hitPoints = 10): Character => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "npc", statBlock, hitPoints })
const at = <T extends Character>(one: T, x: number, y = 0): T => ({ ...one, position: { x, y } })
const find = (characters: readonly unknown[], id: string) => (characters as Character[]).find((character) => character.id === id) as Character
const falls =
  (...dice: number[]) =>
  () => {
    if (!dice.length) throw new Error("no die left")
    return dice.shift() as number
  }
const none = falls()
const use = (id: string, target: Character, d20: number, characters: Character[] = [thalbern, target]) =>
  resolveHold({ characters, actorId: "thalbern", feature: { id, targets: [target.id] }, d20: falls(d20), roll: none })

test("a Grapple is a save against 8 plus Strength and Proficiency, and a failure leaves the target Grappled by the strike", () => {
  const bandit = npc("bandit", "bandit")
  // The Bandit's better save is Dexterity +1. A 9 makes 10 against DC 11 and fails.
  const failed = use("unarmed-grapple", bandit, 9)
  assert.equal(failed.problem, undefined)
  assert.deepEqual([failed.saves[0].ability, failed.saves[0].total, failed.saves[0].dc, failed.saves[0].success], ["dex", 10, 11, false])
  assert.deepEqual(find(failed.characters, "bandit").conditions, [{ id: "grappled", source: "thalbern", attack: "unarmed-strike" }])
  assert.deepEqual(failed.conditions, [{ target: "bandit", condition: "grappled" }])
  assert.deepEqual(failed.facts, ["Bandit FAILS the Dexterity saving throw against Thalbern's Grapple (10 against DC 11), and is now Grappled by Thalbern (escape DC 11)."])
  // The escape DC is the same number, read from the one who holds.
  assert.equal(escapeFrom(find(failed.characters, "bandit") as never, failed.characters as never)?.dc, 11)
  // A 10 makes 11 and holds.
  const held = use("unarmed-grapple", bandit, 10)
  assert.equal(find(held.characters, "bandit").conditions, undefined)
  assert.deepEqual(held.facts, ["Bandit SUCCEEDS on the Dexterity saving throw against Thalbern's Grapple (11 against DC 11), and is not Grappled."])
})

test("the target chooses the better of Strength and Dexterity", () => {
  // The Owlbear's Strength save is +5: a 5 makes 10 and fails. Dexterity +1 would have made 6.
  const owlbear = npc("owlbear", "owlbear", 59)
  const used = use("unarmed-shove-prone", owlbear, 5)
  assert.deepEqual([used.saves[0].ability, used.saves[0].total], ["str", 10])
  assert.deepEqual(find(used.characters, "owlbear").conditions, [{ id: "prone", source: "thalbern", turns: 1 }])
})

test("a Shove either knocks the target Prone or pushes it 5 feet straight away", () => {
  const bandit = at(npc("bandit", "bandit"), 5)
  const pushed = use("unarmed-shove-push", bandit, 1, [at(thalbern, 0), bandit])
  assert.deepEqual(find(pushed.characters, "bandit").position, { x: 10, y: 0 })
  assert.equal(find(pushed.characters, "bandit").conditions, undefined)
  assert.deepEqual(pushed.facts, ["Bandit FAILS the Dexterity saving throw against Thalbern's Shove (2 against DC 11), and is pushed 5 feet away."])
  const stood = use("unarmed-shove-push", bandit, 15, [at(thalbern, 0), bandit])
  assert.deepEqual(find(stood.characters, "bandit").position, { x: 5, y: 0 })
  // A pillar 2 feet behind the Bandit stops the push where it stands: 5 feet out, its near edge is at 6.
  const walled = resolveHold({
    characters: [at(thalbern, 0), bandit],
    actorId: "thalbern",
    feature: { id: "unarmed-shove-push", targets: ["bandit"] },
    d20: falls(1),
    roll: none,
    floor: { solids: [{ kind: "circle", x: 7, y: 0, radius: 1, top: 8 }], doors: [] },
  })
  assert.ok((find(walled.characters, "bandit").position?.x ?? 99) <= 6)
})

test("no more than one size larger, and a hand free for a Grapple", () => {
  const giant = npc("cloud-giant", "cloud-giant", 200)
  const refused = use("unarmed-grapple", giant, 1)
  assert.equal(refused.problem, "Thalbern is more than one size larger, and the Grapple is not made on Cloud-giant.")
  assert.equal(find(refused.characters, "cloud-giant").conditions, undefined)
  assert.equal(use("unarmed-shove-prone", giant, 1).saves.length, 0)
  // One size larger is allowed.
  assert.equal(use("unarmed-grapple", npc("owlbear", "owlbear", 59), 1).saves.length, 1)
  // Two hands hold two, and no third.
  const holding = (id: string): Character => ({ ...npc(id, "bandit"), conditions: [{ id: "grappled", source: "thalbern", attack: "unarmed-strike" }] })
  const present = [thalbern, holding("a"), holding("b")]
  assert.equal(holdBarred("unarmed-grapple", thalbern, npc("c", "bandit") as never, present), "has no hand free to grab with")
  assert.equal(holdBarred("unarmed-shove-prone", thalbern, npc("c", "bandit") as never, present), undefined)
  // A hold by a stat block's own attack takes no hand.
  assert.equal(holdBarred("unarmed-grapple", thalbern, npc("c", "bandit") as never, [thalbern, { ...holding("a"), conditions: [{ id: "grappled", source: "thalbern", attack: "claw" }] }]), undefined)
})

test("a humanoid NPC grapples and shoves too, and a beast does not", () => {
  const silas = { ...npc("silas", "guard"), conditions: undefined }
  const used = resolveHold({ characters: [silas, thalbern], actorId: "silas", feature: { id: "unarmed-grapple", targets: ["thalbern"] }, d20: falls(1), roll: none })
  // A Guard has Strength +1 and Proficiency Bonus +2: DC 11. Thalbern's Dexterity save is +5, and a 1 makes 6.
  assert.deepEqual([used.saves[0].ability, used.saves[0].total, used.saves[0].dc], ["dex", 6, 11])
  assert.deepEqual(find(used.characters, "thalbern").conditions, [{ id: "grappled", source: "silas", attack: "unarmed-strike" }])
  const wolf = npc("owlbear", "owlbear", 59)
  assert.equal(resolveHold({ characters: [wolf, thalbern], actorId: "owlbear", feature: { id: "unarmed-grapple", targets: ["thalbern"] }, d20: falls(1), roll: none }).problem, "Owlbear cannot do that.")
})

test("a Monk in no armor uses Dexterity in Strength's place for the Difficulty Class", () => {
  // Dexterity +3 and Proficiency Bonus +2 make 5, DC 13. In armor, Strength +1 makes 3, DC 11.
  const { armor: _, ...bare } = thalbern.sheet as Sheet
  const monk = { ...thalbern, sheet: { ...bare, class: "monk" } as Sheet }
  assert.equal(8 + strengthAndProficiency(monk), 13)
  assert.equal(8 + strengthAndProficiency({ ...monk, sheet: { ...bare, class: "monk", armor: "studded-leather-armor" } as Sheet }), 11)
  assert.equal(8 + strengthAndProficiency(thalbern), 11)
})

test("the action's own resolver is the one the turn's reading names", () => {
  assert.equal(featureResolver("unarmed-grapple"), resolveHold)
})

test("the read gives a grapple as the whole action, with the game's difficulty", async () => {
  const bandit = at(npc("bandit", "bandit"), 5)
  const ports = { llm: { generateObject: async () => ({ object: { check: "unarmed-grapple", target: "bandit" } }) } } as never
  const { readAction } = createRollRequirementService(ports)
  const read = await readAction("I grab the bandit", at(thalbern, 0) as never, { present: [bandit, { ...at(thalbern, 0), id: "thalbern" }] as never })
  assert.equal(read.roll, null)
  assert.deepEqual(read.feature?.feature, { id: "unarmed-grapple", targets: ["bandit"] })
  assert.equal(read.feature?.difficulty, 11)
})
