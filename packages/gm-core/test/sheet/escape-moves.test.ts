import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { GmPorts } from "../../src/ports"
import { createAdventureRollResultService } from "../../src/services/adventure-roll-result-service"
import { createRollRequirementService } from "../../src/services/roll-requirement-service"
import type { EncounterFloor } from "../../src/sheet/placement"
import type { Sheet } from "../../src/sheet/sheet"
import type { TurnCharacter } from "../../src/types/adventure"

// Worked out by hand from SRD 5.2.1. Grappled: Speed 0, and the grappled creature "can take an action to make a
// Strength (Athletics) or Dexterity (Acrobatics) check against the grapple's escape DC, ending the condition on
// itself on a success". Escaping is the action, and the movement of the turn is still the hero's, as BG3 runs it.
// Opportunity Attacks: a creature may strike one who leaves its reach. Unarmed Strike, Grapple: the escape DC is 8 plus
// the grappler's Strength modifier and Proficiency Bonus. A Bandit has Strength 11 (+0) and Proficiency Bonus +2: DC 10.
// Thalbern is a level 1 human Ranger, Speed 30, Strength +1, proficient in Athletics: +3.

const sheet = (JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/the-midnight-summons/characters/thalbern.json", import.meta.url), "utf8")) as { sheet: Sheet })
  .sheet
// An open floor with a stand of trees 40 feet east.
const floor: EncounterFloor = { solids: [], doors: [], places: [{ id: "trees", label: "Trees", at: { x: 40, y: 0 } }], cast: [], party: [], spare: [] }
const held = [{ id: "grappled" as const, source: "bandit" }]
const thalbern = { id: "thalbern", name: "Thalbern", type: "pc" as const, sheet, hitPoints: 11, position: { x: 0, y: 0 }, conditions: held }
const bandit = { id: "bandit", name: "Bandit", type: "npc" as const, statBlock: "bandit", hitPoints: 11, position: { x: -5, y: 0 } }
// The read of "Thalbern twists out of the bandit's grip and runs for the trees".
const breaksFree = {
  check: "athletics",
  difficulty: "medium",
  moveTo: "trees",
  harm: [{ on: "success", target: "thalbern", kind: "end-condition", condition: "grappled" }],
}
const read = async (hero: typeof thalbern, pick: Record<string, unknown> = breaksFree) => {
  const ports = { llm: { generateObject: async () => ({ object: pick }) } } as never
  return createRollRequirementService(ports).readAction("Thalbern twists out of the bandit's grip and runs for the trees.", hero as never, {
    present: [hero, bandit] as never,
    floor,
  })
}

test("a grappled hero makes no move before the escape, and the move their words ask for waits on the check", async () => {
  const reading = await read(thalbern)
  assert.equal(reading.move, undefined)
  assert.ok(reading.roll && "check" in reading.roll)
  assert.deepEqual([reading.roll.rollType, reading.roll.difficulty], ["Escape (Athletics)", 10])
  // Free, he walks his full Speed toward the trees: 30 of the 40 feet.
  const free = reading.roll.free
  assert.ok(free)
  assert.deepEqual([Math.round(free.move.feet), Math.round(free.move.at.x), Math.round(free.move.at.y)], [30, 30, 0])
  assert.equal(free.disengaged, undefined)
})

test("an escape with no move asked for, a hero not held, and one held by two, carry no move for after", async () => {
  const { moveTo: _, ...staying } = breaksFree
  const still = await read(thalbern, staying)
  assert.ok(still.roll && "check" in still.roll)
  assert.equal(still.roll.free, undefined)
  // Not grappled, the move is made before the action, as any move is.
  const loose = await read({ ...thalbern, conditions: [] })
  assert.equal(Math.round(loose.move?.feet ?? 0), 30)
  assert.ok(loose.roll && "check" in loose.roll)
  assert.equal(loose.roll.free, undefined)
  // Held by the bandit and by another, breaking the bandit's grip still leaves his Speed 0.
  const twice = await read({ ...thalbern, conditions: [...held, { id: "grappled", source: "thug" }] as never })
  assert.ok(twice.roll && "check" in twice.roll)
  assert.equal(twice.roll.free, undefined)
})

const resolve = async (d20: number) => {
  const reading = await read(thalbern)
  const character = { ...thalbern, isComplete: false, hasReplied: true, rollRequired: reading.roll } as unknown as TurnCharacter & { rollRequired: never }
  const ports = { llm: { generateObject: async () => ({ object: { beats: [] } }) }, content: { floor: async () => floor }, sleep: async () => {} } as unknown as GmPorts
  const random = Math.random
  // The Bandit's Opportunity Attack throws a 1, a miss.
  Math.random = () => 0
  try {
    return await createAdventureRollResultService(ports).resolvePlayerRollNarrativeAndCharacters({
      turn: { _id: "turn", encounterId: "here", title: "Here", story: [], characters: [character, bandit as unknown as TurnCharacter], adventureId: "adventure" },
      character,
      characterId: "thalbern",
      dice: [d20],
      encounterInstructions: "",
    })
  } finally {
    Math.random = random
  }
}

test("a hero who breaks free makes the move after, and the grappler may strike as they leave his reach", async () => {
  // 15 and +3 is 18 against DC 10.
  const done = await resolve(15)
  const after = done.characters.find((character) => character.id === "thalbern") as TurnCharacter
  assert.equal(after.conditions?.length ?? 0, 0)
  assert.deepEqual([Math.round(after.position?.x ?? 0), Math.round(after.position?.y ?? 0)], [30, 0])
  const told = done.story.map((beat) => [beat.kind, "name" in beat ? beat.name : undefined])
  const roll = told.findIndex(([kind]) => kind === "roll")
  const move = told.findIndex(([kind]) => kind === "move")
  const struck = told.findIndex(([, name]) => name === "Opportunity Attack")
  // The check comes first, then the Bandit strikes as Thalbern leaves his reach, and Thalbern walks on.
  assert.ok(roll >= 0 && struck > roll && move > roll, JSON.stringify(told))
})

test("a hero who fails to break free stays where they are, still held", async () => {
  // 2 and +3 is 5 against DC 10.
  const done = await resolve(2)
  const after = done.characters.find((character) => character.id === "thalbern") as TurnCharacter
  assert.deepEqual(after.conditions, held)
  assert.deepEqual(after.position, { x: 0, y: 0 })
  assert.equal(
    done.story.some((beat) => beat.kind === "move"),
    false
  )
})
