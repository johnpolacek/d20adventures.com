import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import type { ConditionEntry } from "../../src/sheet/condition-entry"
import { cannotMove, d20Penalty } from "../../src/sheet/conditions"
import type { DeathSaves } from "../../src/sheet/death"
import { hitPointsOf } from "../../src/sheet/hit-points"
import { longRest, shortRest } from "../../src/sheet/rest"
import type { Sheet } from "../../src/sheet/sheet"
import { spellsAtRoundEnd } from "../../src/sheet/spell-rounds"
import { spellRule } from "../../src/sheet/spell-rules"
import { castSpell, spellById, spellLabel } from "../../src/sheet/spells"
import type { SpellEffect, TurnEffect } from "../../src/sheet/turn-effect"

// Every expected value below was worked out by hand from the SRD 5.2.1 spell texts, not copied from the function's output.

const spell = (id: string) => spellById.get(id) as NonNullable<ReturnType<typeof spellById.get>>
const sheet = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
type Character = {
  id: string
  name: string
  type: string
  sheet?: Sheet
  statBlock?: string
  hitPoints?: number
  dead?: true
  fled?: true
  deathSaves?: DeathSaves
  spellEffects?: SpellEffect[]
  conditions?: ConditionEntry[]
  turnEffects?: TurnEffect[]
}
// Lyra, a level 1 Wizard with Intelligence 16: spell save DC 13. Branka, a level 1 Fighter with 14 hit points.
const lyra: Character = { id: "lyra", name: "Lyra", type: "pc", sheet: sheet("covert-cargo/characters/1749159962941.json"), hitPoints: 6 }
const branka: Character = { id: "branka", name: "Branka", type: "pc", sheet: sheet("welcome-to-kordavos/characters/branka-stoneveil.json"), hitPoints: 14 }
// Stat blocks: a Bandit has 11 hit points (Con +1, Cha +0, Dex +1), an Owlbear 59 (Con +3, Cha −2), an Ogre 68 (Cha
// −2), a Hill Giant 105, an Adult Red Dragon 256, a Goblin Warrior 10 and is a Fey (Cha −1), an Imp 21 and is a Fiend
// with Magic Resistance (Cha +2), a Zombie is Undead.
const npc = (id: string, statBlock: string, hitPoints: number): Character => ({ id, name: id, type: "npc", statBlock, hitPoints })
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const ones = (count: number) => Array.from({ length: count }, () => 1)
const find = (characters: readonly Character[], id: string) => characters.find((character) => character.id === id) as Character
const cast = (id: string, characters: Character[], targets: string[], d20: number[] = [], roll: number[] = []) =>
  castSpell({ characters: [lyra, ...characters], casterId: "lyra", spell: spell(id), targets, d20: falls(...d20), roll: falls(...roll) })

test("Power Word Kill slays at 100 hit points or fewer, deals 12d12 above, and Death Ward negates it", () => {
  // It takes one creature. The Bandit's 11 is 100 or fewer: it dies. The Hill Giant's 105 is more: twelve 1s deal 12
  // Psychic, 93 left.
  const slain = cast("power-word-kill", [npc("bandit", "bandit", 11)], ["bandit"])
  const giant = cast("power-word-kill", [npc("giant", "hill-giant", 105)], ["giant"], [], ones(12))
  assert.deepEqual([find(slain.characters, "bandit").dead, find(giant.characters, "giant").hitPoints], [true, 93])
  // A warded Bandit lives on at 11, and its ward is spent.
  const warded = cast("power-word-kill", [{ ...npc("bandit", "bandit", 11), spellEffects: [{ spell: "death-ward", by: "lyra" }] }], ["bandit"])
  assert.deepEqual([find(warded.characters, "bandit").dead, find(warded.characters, "bandit").hitPoints, find(warded.characters, "bandit").spellEffects], [undefined, 11, undefined])
  assert.equal(spellLabel(spell("power-word-kill")), "run")
})

test("Power Word Stun stuns at 150 hit points or fewer until a Constitution save, and stops one above", () => {
  // The Bandit's 11 is 150 or fewer: Stunned. The dragon's 256 is more: its Speed is 0, and it is not Stunned.
  const spoken = cast("power-word-stun", [npc("bandit", "bandit", 11)], ["bandit"])
  const bandit = find(spoken.characters, "bandit")
  const dragon = find(cast("power-word-stun", [npc("dragon", "adult-red-dragon", 256)], ["dragon"]).characters, "dragon")
  assert.deepEqual([bandit.conditions?.map((entry) => entry.id), dragon.conditions, cannotMove(dragon), cannotMove(npc("x", "adult-red-dragon", 256))], [["stunned"], undefined, true, false])
  // At the end of its turn the Bandit saves: 15 and +1 is 16 against DC 13, and the Stunned condition ends.
  const round = spellsAtRoundEnd({ characters: spoken.characters, d20: falls(15), roll: falls() })
  assert.deepEqual([find(round.characters, "bandit").conditions, round.saves.length], [undefined, 1])
})

test("Divine Word's table falls by the hit points each has now, and a Fiend that fails is sent away", () => {
  // DC 13. The Goblin Warrior rolls 5 −1 = 4 with 10 hit points: it dies. The Ogre at 25 rolls 3 −2 = 1: Blinded,
  // Deafened and Stunned for an hour. The Imp at 21 has Magic Resistance, 2 and 4 kept as 4, +2 = 6: Blinded, Deafened
  // and Stunned, and as a Fiend it leaves the fight. The Owlbear at 59 rolls 2 −2 = 0: more than 50, nothing.
  const spoken = cast(
    "divine-word",
    [npc("goblin", "goblin-warrior", 10), npc("ogre", "ogre", 25), npc("imp", "imp", 21), npc("owlbear", "owlbear", 59)],
    ["goblin", "ogre", "imp", "owlbear"],
    [5, 3, 2, 4, 2]
  )
  const conditions = (id: string) => find(spoken.characters, id).conditions?.map((entry) => entry.id)
  assert.deepEqual(
    [find(spoken.characters, "goblin").dead, conditions("ogre"), conditions("imp"), find(spoken.characters, "imp").fled, conditions("owlbear")],
    [true, ["blinded", "deafened", "stunned"], ["blinded", "deafened", "stunned"], true, undefined]
  )
  assert.equal(spoken.saves.length, 4)
})

test("Heal, Mass Heal and Power Word Heal restore hit points and end the conditions they name", () => {
  // Heal: 70 brings Branka from 1 to her 14, and ends Blinded and Poisoned.
  const hurt = { ...branka, hitPoints: 1, conditions: [{ id: "blinded" as const }, { id: "poisoned" as const }] }
  const healed = find(cast("heal", [hurt], ["branka"]).characters, "branka")
  assert.deepEqual([healed.hitPoints, healed.conditions], [14, undefined])
  // Mass Heal: Branka is missing 10 and the Bandit 10, so 20 of the 700 are spent, each healed to full.
  const mass = cast("mass-heal", [{ ...branka, hitPoints: 4 }, npc("bandit", "bandit", 1)], ["branka", "bandit"])
  assert.deepEqual([find(mass.characters, "branka").hitPoints, find(mass.characters, "bandit").hitPoints], [14, 11])
  // Power Word Heal on Branka dying at 0 and Charmed: all 14 back, Charmed ends, and she stands with her Reaction.
  const down = { ...branka, hitPoints: 0, deathSaves: { successes: 0, failures: 1 }, conditions: [{ id: "charmed" as const, source: "bandit" }] }
  const word = find(cast("power-word-heal", [down], ["branka"]).characters, "branka")
  assert.deepEqual([word.hitPoints, word.conditions, word.deathSaves, word.turnEffects?.map((effect) => effect.id)], [14, undefined, undefined, ["reacted"]])
})

test("Harm lowers the maximum by the Necrotic it dealt, through rests, until Greater Restoration", () => {
  // The Owlbear rolls 5 +3 = 8 against DC 13 and fails. Fourteen 1s deal 14 Necrotic: 45 of a maximum lowered to 45.
  const harmed = find(cast("harm", [npc("owlbear", "owlbear", 59)], ["owlbear"], [5], ones(14)).characters, "owlbear")
  assert.deepEqual(hitPointsOf(harmed), { current: 45, maximum: 45 })
  // A Long Rest restores hit points to the lowered maximum, which stays.
  const rested = longRest(harmed).character
  assert.deepEqual(hitPointsOf(rested), { current: 45, maximum: 45 })
  // Greater Restoration removes the reduction: 45 of 59.
  const restored = find(cast("greater-restoration", [rested], ["owlbear"]).characters, "owlbear")
  assert.deepEqual(hitPointsOf(restored), { current: 45, maximum: 59 })
  // With no lowered maximum it ends Charmed first, and then a level of Exhaustion.
  const charmed = find(
    cast(
      "greater-restoration",
      [
        {
          ...branka,
          conditions: [
            { id: "charmed", source: "bandit" },
            { id: "exhaustion", level: 2 },
          ],
        },
      ],
      ["branka"]
    ).characters,
    "branka"
  )
  assert.deepEqual(charmed.conditions, [{ id: "exhaustion", level: 2 }])
})

test("Spare the Dying steadies a dying hero within its range, and Regenerate heals as each turn begins", () => {
  const steadied = find(cast("spare-the-dying", [{ ...branka, hitPoints: 0, deathSaves: { successes: 1, failures: 2 } }], ["branka"]).characters, "branka")
  assert.deepEqual(steadied.deathSaves, { successes: 1, failures: 2, stable: true })
  // Its range doubles at levels 5, 11 and 17: 15, 30, 60 and 120 feet.
  const range = spellRule("spare-the-dying")?.range
  assert.deepEqual(
    [1, 5, 11, 17].map((level) => range?.({ sheet: { ...(branka.sheet as Sheet), level } })),
    [15, 30, 60, 120]
  )
  // Regenerate: 4d8 + 15 with four 1s heals 19, from 10 to 29. As the round turns, 1 more: 30.
  const regrown = cast("regenerate", [npc("owlbear", "owlbear", 10)], ["owlbear"], [], ones(4))
  assert.equal(find(regrown.characters, "owlbear").hitPoints, 29)
  assert.equal(find(spellsAtRoundEnd({ characters: regrown.characters, d20: falls(), roll: falls() }).characters, "owlbear").hitPoints, 30)
})

test("Disintegrate leaves dust that only True Resurrection raises, and Raise Dead's ordeal eases with each Long Rest", () => {
  // The Bandit rolls 2 +1 = 3 and fails. Ten 1s and 40 deal 50 Force: it is dust.
  const struck = cast("disintegrate", [npc("bandit", "bandit", 11)], ["bandit"], [2], ones(10))
  const dust = find(struck.characters, "bandit")
  assert.deepEqual([dust.dead, dust.spellEffects?.map((effect) => effect.spell)], [true, ["disintegrate"]])
  // Raise Dead and Revivify cannot take dust. True Resurrection brings it back with all 11 hit points and no penalty.
  assert.equal(find(cast("raise-dead", [dust], ["bandit"]).characters, "bandit").dead, true)
  assert.equal(find(cast("revivify", [dust], ["bandit"]).characters, "bandit").dead, true)
  const whole = find(cast("true-resurrection", [dust], ["bandit"]).characters, "bandit")
  assert.deepEqual([whole.dead, whole.hitPoints, d20Penalty(whole)], [undefined, 11, 0])
  // Raise Dead on a Bandit that died: 1 hit point, Prone, and −4 to D20 Tests. A Long Rest makes it −3, a Short Rest
  // leaves it.
  const dead = { ...npc("bandit", "bandit", 0), dead: true as const }
  const raised = find(cast("raise-dead", [dead], ["bandit"]).characters, "bandit")
  assert.deepEqual([raised.dead, raised.hitPoints, raised.conditions?.map((entry) => entry.id), d20Penalty(raised)], [undefined, 1, ["prone"], 4])
  assert.deepEqual([d20Penalty(shortRest(raised, { roll: falls() }).character), d20Penalty(longRest(raised).character)], [4, 3])
  // Resurrection gives all 11 back, with the same penalty. A Zombie was Undead, and neither raises it.
  const risen = find(cast("resurrection", [dead], ["bandit"]).characters, "bandit")
  assert.deepEqual([risen.hitPoints, d20Penalty(risen)], [11, 4])
  assert.equal(find(cast("raise-dead", [{ ...npc("zombie", "zombie", 0), dead: true }], ["zombie"]).characters, "zombie").dead, true)
  assert.deepEqual(
    ["raise-dead", "resurrection", "true-resurrection", "disintegrate", "finger-of-death"].map((id) => spellLabel(spell(id))),
    ["partly", "partly", "partly", "partly", "partly"]
  )
})
