import assert from "node:assert/strict"
import { test } from "node:test"
import { monsterById, monsters } from "@d20/srd/monsters"
import { autoCreate, type CreationPick, createSheet } from "../../src/sheet/create"
import { bonusActionsOf, bonusDisengages, useBonusAction } from "../../src/sheet/features"
import { raisedTo } from "../../src/sheet/milestone"
import type { Sheet } from "../../src/sheet/sheet"
import { spellsOf } from "../../src/sheet/spells"
import { blockActionsOf, readBlockAction, readBlockBonus, recharged, statBlockLines, useBlockAction } from "../../src/sheet/stat-block-actions"
import type { Character } from "../../src/types/character"

// Every expected value below was worked out by hand from the SRD 5.2.1 stat blocks, not copied from the functions' output.

type Npc = { id: string; name: string; type: string; statBlock: string; hitPoints?: number; isComplete?: boolean; featureUses?: Record<string, number> }
const npc = (id: string, statBlock: string, more: Partial<Npc> = {}): Npc => ({ id, name: id[0].toUpperCase() + id.slice(1), type: "npc", statBlock, ...more })
const block = (id: string) => monsterById.get(id) ?? assert.fail(`no ${id}`)
const feature = (id: string, name: string) => [...(block(id).actions ?? []), ...(block(id).bonusActions ?? [])].find((entry) => entry.name === name) ?? assert.fail(`${id} has no ${name}`)
// Dice that fall as given, in order.
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() ?? assert.fail("out of dice")

test("every stat block's actions and Bonus Actions are read or left unread with a reason", () => {
  const actions = monsters.flatMap((monster) => (monster.actions ?? []).flatMap((entry) => readBlockAction(entry) ?? []))
  const bonuses = monsters.flatMap((monster) => (monster.bonusActions ?? []).map(readBlockBonus))
  const unread = (list: readonly object[]) => list.filter((entry) => "unread" in entry).length
  // 146 actions are neither an attack, a Multiattack nor Spellcasting. Of them 56 read: the breaths of the 40 dragons
  // and the Behir, and 15 more that breathe, spit, roar or mock (a Hell Hound's Fire Breath, a Lion's Roar).
  assert.deepEqual([actions.length, actions.length - unread(actions), unread(actions)], [146, 56, 90])
  // 76 Bonus Actions: 22 take Dash, Disengage or Hide, or cast the block's spells.
  assert.deepEqual([bonuses.length, bonuses.length - unread(bonuses), unread(bonuses)], [76, 22, 54])
  // A read action's numbers are the data's own.
  for (const monster of monsters) {
    for (const entry of monster.actions ?? []) {
      const read = readBlockAction(entry)
      if (!read || "unread" in read) continue
      const [save] = entry.saves ?? []
      assert.deepEqual([read.ability, read.dc, read.area], [save.ability, save.dc, entry.area], `${monster.id} ${entry.name}`)
    }
  }
})

test("Poison Breath: a 15-foot Cone, a DC 11 Constitution save, 6d6 Poison and half on a success, Recharge 5–6", () => {
  assert.deepEqual(readBlockAction(feature("green-dragon-wyrmling", "Poison Breath")), {
    id: "poison-breath",
    name: "Poison Breath",
    ability: "con",
    dc: 11,
    area: { shape: "cone", size: 15 },
    damage: [{ dice: "6d6", type: "poison" }],
    half: true,
    conditions: [],
    recharge: { min: 5, max: 6 },
  })
  // "Failure: The target has the Blinded condition until the end of the mephit’s next turn."
  assert.deepEqual(readBlockAction(feature("dust-mephit", "Blinding Breath")), {
    id: "blinding-breath",
    name: "Blinding Breath",
    ability: "dex",
    dc: 10,
    area: { shape: "cone", size: 15 },
    damage: [],
    half: false,
    conditions: [{ condition: "blinded", span: "turn", lasts: "source" }],
    recharge: { min: 6, max: 6 },
  })
  // "one creature the naga can see within 60 feet. Failure: 31 (7d8) Poison damage, and the target has the Blinded
  // condition until the start of the naga’s next turn. Success: Half damage only."
  const spittle = readBlockAction(feature("guardian-naga", "Poisonous Spittle"))
  assert.ok(spittle && !("unread" in spittle))
  assert.deepEqual([spittle.range, spittle.damage, spittle.half, spittle.conditions], [60, [{ dice: "7d8", type: "poison" }], true, [{ condition: "blinded", span: "turn", lasts: "until-source" }]])
  // A Behir's Swallow carries on past its failure, so it is left told.
  assert.ok("unread" in (readBlockAction(feature("behir", "Swallow")) ?? {}))
})

test("the wyrmling breathes on two: the 6d6 is rolled once, all of it on a failure and half on a success, and the breath is spent until it recharges", () => {
  const drake = npc("drake", "green-dragon-wyrmling")
  // A Guard and a Bandit each have 11 hit points and +1 on a Constitution save.
  const guard = npc("guard", "guard")
  const bandit = npc("bandit", "bandit")
  // The guard rolls 5, 6 against DC 11, and fails. The bandit rolls 15, 16, and succeeds. The six d6 fall 3, 4, 2, 5,
  // 6, 1: 21 Poison. The guard takes 21 and dies at 0, an NPC. The bandit takes half, 10, and has 1 left.
  const used = useBlockAction({ characters: [drake, guard, bandit], actorId: "drake", action: "poison-breath", targets: ["guard", "bandit"], d20: falls(5, 15), roll: falls(3, 4, 2, 5, 6, 1) })
  assert.equal(used.problem, undefined)
  assert.deepEqual(
    used.saves.map((save) => [save.target, save.total, save.success]),
    [
      ["guard", 6, false],
      ["bandit", 16, true],
    ]
  )
  assert.deepEqual(
    used.harm.map((entry) => [entry.target, entry.amount]),
    [
      ["guard", 21],
      ["bandit", 10],
    ]
  )
  const after = (id: string) => used.characters.find((character) => character.id === id) as Npc & { dead?: true }
  assert.equal(after("guard").dead, true)
  assert.equal(after("bandit").hitPoints, 1)
  // Spent: offered no more, and listed no more to the model that writes its turn.
  const spent = after("drake")
  assert.deepEqual(spent.featureUses, { "Poison Breath": 1 })
  assert.deepEqual(blockActionsOf(spent), [])
  assert.ok(!statBlockLines(spent).some((line) => line.startsWith("Poison Breath")))
  assert.match(used.facts[0], /^Guard FAILS the Constitution saving throw against Drake's Poison Breath \(6 against DC 11\) and takes 21 poison damage\./)
  // As its turn starts a d6 is rolled: a 4 leaves it spent, a 5 restores it.
  assert.deepEqual(recharged(spent, () => 4).featureUses, { "Poison Breath": 1 })
  assert.equal(recharged(spent, () => 5).featureUses, undefined)
  // Used again while spent, it does nothing.
  assert.ok(useBlockAction({ characters: [spent, bandit], actorId: "drake", action: "poison-breath", targets: ["bandit"], d20: falls(1), roll: falls(1) }).problem)
})

test("a breath is not magic, so Magic Resistance gives no Advantage on the save, and a condition it gives lasts through the source's next turn", () => {
  const drake = npc("drake", "green-dragon-wyrmling")
  // A Deva has Magic Resistance: one d20 is rolled for its save, not two.
  const deva = npc("deva", "deva")
  const used = useBlockAction({ characters: [drake, deva], actorId: "drake", action: "poison-breath", targets: ["deva"], d20: falls(15), roll: falls(1, 1, 1, 1, 1, 1) })
  assert.deepEqual(used.saves[0].dice, [15])
  // A Dust Mephit's Blinding Breath on a Guard who has not yet acted this round: the Guard rolls 2 and +1, 3 against
  // DC 10, and is Blinded "until the end of the mephit’s next turn", which the engine counts as this round and the next.
  const mephit = npc("mephit", "dust-mephit")
  const blinded = useBlockAction({ characters: [mephit, npc("guard", "guard")], actorId: "mephit", action: "blinding-breath", targets: ["guard"], d20: falls(2), roll: falls() })
  assert.deepEqual((blinded.characters[1] as { conditions?: unknown }).conditions, [{ id: "blinded", source: "mephit", turns: 2 }])
})

test("Cunning Action and Nimble Escape are a stat block's Bonus Actions, and Divine Aid's spells are cast as one", () => {
  // "The spy takes the Dash, Disengage, or Hide action." "The goblin takes the Disengage or Hide action."
  assert.deepEqual(readBlockBonus(feature("spy", "Cunning Action")), { feature: feature("spy", "Cunning Action"), takes: ["dash", "disengage", "hide"] })
  const spy = npc("spy", "spy")
  assert.deepEqual(
    bonusActionsOf(spy).map((entry) => entry.id),
    ["cunning-action-dash", "cunning-action-disengage", "cunning-action-hide"]
  )
  assert.deepEqual(
    bonusActionsOf(npc("goblin", "goblin-warrior")).map((entry) => entry.id),
    ["nimble-escape-disengage", "nimble-escape-hide"]
  )
  // Disengage draws no Opportunity Attack, and its use is told.
  assert.equal(bonusDisengages(spy, "cunning-action-disengage", 30), true)
  assert.equal(bonusDisengages(spy, "cunning-action-dash", 30), false)
  assert.equal(useBonusAction({ characters: [spy], actorId: "spy", feature: "cunning-action-disengage", roll: () => 1 }).use?.fact, "Spy takes the Disengage action as a Bonus Action.")
  // A Bandit has none.
  assert.deepEqual(bonusActionsOf(npc("bandit", "bandit")), [])
  // A Priest's Divine Aid: Bless, Dispel Magic, Healing Word and Lesser Restoration, 3 a day between them, each cast as
  // a Bonus Action, Bless too, whose own casting time is an action.
  const divine = spellsOf(npc("priest", "priest")).filter((known) => known.bonusAction)
  assert.deepEqual(
    divine.map((known) => [known.spell.id, known.free, known.useKey]),
    [
      ["bless", 3, "Divine Aid"],
      ["dispel-magic", 3, "Divine Aid"],
      ["healing-word", 3, "Divine Aid"],
      ["lesser-restoration", 3, "Divine Aid"],
    ]
  )
})

test("a Druid in a Panther's shape takes its Nimble Escape, since the Beast's stat block replaces their game statistics, and loses it as they leave", () => {
  const pick = { class: "druid", species: "human", background: "sage" } as unknown as CreationPick
  const made = createSheet(pick, autoCreate(pick))
  if ("problems" in made) assert.fail(made.problems.join("; "))
  const briar = raisedTo({ id: "briar", name: "Briar", type: "pc", sheet: made.sheet } as Character & { id: string; sheet: Sheet }, 2)
  const nimble = (character: object) => bonusActionsOf(character as Npc).filter((entry) => entry.id.startsWith("nimble-escape"))
  assert.deepEqual(nimble(briar), [])
  assert.deepEqual(
    nimble({ ...briar, shape: { form: "panther", hours: 1 } }).map((entry) => entry.id),
    ["nimble-escape-disengage", "nimble-escape-hide"]
  )
})
