import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { monsters } from "@d20/srd/monsters"
import { attacksOf, gateOf, strike } from "../../src/sheet/attack"
import { attackAfter, attackRequirement, followingRoll, type InScene } from "../../src/sheet/attack-roll"
import { multiattackOf, readMultiattack } from "../../src/sheet/multiattack"
import type { Sheet } from "../../src/sheet/sheet"
import type { RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 stat blocks, not copied from the function's output.

const hero = (path: string) => (JSON.parse(readFileSync(new URL(`../../../../content/settings/realm-of-myr/adventures/${path}`, import.meta.url), "utf8")) as { sheet: Sheet }).sheet
// Branka: Breastplate and Shield, Armor Class 17, and 14 hit points.
const branka = hero("welcome-to-kordavos/characters/branka-stoneveil.json")
const falls =
  (...dice: number[]) =>
  () =>
    dice.shift() as number
const at = (x: number, y = 0) => ({ position: { x, y } })
const npc = (id: string, statBlock: string, more: object = {}) => ({ id, name: id, type: "npc", statBlock, ...more }) as InScene & { type: string }
const pc = (id: string, more: object = {}) => ({ id, name: id, type: "pc", sheet: branka, ...more }) as InScene & { type: string }
const floor = { solids: [], doors: [] }

// The attacks an NPC makes in one turn, each "weapon at target": the read's first, then each the rules ask for next.
function turnOf(attacker: InScene, target: InScene, weapon: string, present: readonly InScene[], after: readonly InScene[] = present): string[] {
  const attack = attacksOf(attacker).find((entry) => entry.id === weapon)
  assert.ok(attack, `${attacker.name} has no ${weapon}`)
  const first = attackRequirement({ character: attacker, target, attack, present, floor, after: attackAfter(attacker, { weapon }) })
  assert.ok("roll" in first)
  const made: string[] = []
  let roll: RequiredRoll | undefined = first.roll
  while (roll && "attack" in roll) {
    made.push(`${roll.attack.weapon} at ${roll.attack.target}`)
    // The scene as the first attack left it: the one it dropped is down for the rest.
    roll = followingRoll({ character: attacker, made: roll, present: after, floor })
  }
  return made
}

test("every Multiattack in the SRD is read but the Hydra's", () => {
  const read = monsters.flatMap((monster) => {
    const found = readMultiattack(monster)
    return found ? [{ monster, found }] : []
  })
  assert.equal(read.length, 178)
  // The Hydra makes "as many Bite attacks as it has heads", and the engine keeps no count of heads.
  assert.deepEqual(
    read.flatMap(({ monster, found }) => ("unread" in found ? [monster.id] : [])),
    ["hydra"]
  )
  // Each attack it names is one of the block's own.
  for (const { monster, found } of read) {
    if (!("options" in found)) continue
    const own = new Set(attacksOf({ type: "npc", statBlock: monster.id }).map((attack) => attack.id))
    for (const option of found.options) {
      assert.ok(option.attacks.length || option.uses?.length, monster.id)
      for (const ids of option.attacks) for (const id of ids) assert.ok(own.has(id), `${monster.id} ${id}`)
    }
  }
  // "one Bite attack and one Claw attack".
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "brown-bear" }), { options: [{ attacks: [["bite"], ["claw"]] }] })
  // "one Claws attack and one Tail attack, or it makes two Hurl Flame attacks".
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "barbed-devil" }), {
    options: [{ attacks: [["claws"], ["tail"]] }, { attacks: [["hurl-flame"], ["hurl-flame"]] }],
  })
  // "two attacks, using Scimitar and Pistol in any combination".
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "bandit-captain" }), {
    options: [
      {
        attacks: [
          ["scimitar", "pistol"],
          ["scimitar", "pistol"],
        ],
      },
    ],
  })
  // "two Tentacle attacks, uses Reel, and makes two Bite attacks".
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "roper" }), {
    options: [{ attacks: [["tentacle"], ["tentacle"], ["bite"], ["bite"]], uses: [{ actions: ["reel"], times: 1, afterAttacks: 2 }] }],
  })
  // "three Rend attacks. It can replace one attack with a use of (A) Sleep Breath or (B) Spellcasting to cast Scorching Ray", the spell as the data types it.
  assert.deepEqual(multiattackOf({ type: "npc", statBlock: "adult-brass-dragon" })?.replace, {
    count: 1,
    with: [{ id: "sleep-breath" }, { id: "spellcasting", spells: ["scorching-ray"] }],
  })
  // A Wolf has none, and a hero never has one.
  assert.equal(multiattackOf({ type: "npc", statBlock: "wolf" }), undefined)
  assert.equal(multiattackOf({ type: "pc", statBlock: "owlbear" }), undefined)
})

test("the five Multiattacks in play make the attacks the SRD says", () => {
  const branka5 = pc("branka", at(5))
  const branka30 = pc("branka", at(30))
  const turn = (statBlock: string, weapon: string, target: InScene) => turnOf(npc("foe", statBlock, at(0)), target, weapon, [npc("foe", statBlock, at(0)), target])
  // Bandit Captain, beside her: two Scimitars. The Pistol beside an enemy has Disadvantage.
  assert.deepEqual(turn("bandit-captain", "scimitar", branka5), ["scimitar at branka", "scimitar at branka"])
  // Priest, beside her: two Maces, Radiant Flame being ranged.
  assert.deepEqual(turn("priest", "mace", branka5), ["mace at branka", "mace at branka"])
  // Druid, 30 feet off: two Verdant Wisps. The Vine Staff does not reach.
  assert.deepEqual(turn("druid", "verdant-wisp", branka30), ["verdant-wisp at branka", "verdant-wisp at branka"])
  // Guard Captain, beside her: a thrown Javelin as read, then the Longsword, 2d10 + 4 (15) over the Javelin's 3d6 + 4 (14.5).
  assert.deepEqual(turn("guard-captain", "javelin", branka5), ["javelin at branka", "longsword at branka"])
  // From 30 feet only the Javelin reaches.
  assert.deepEqual(turn("guard-captain", "javelin", branka30), ["javelin at branka", "javelin at branka"])
  // Scout, 30 feet off: two Longbow shots.
  assert.deepEqual(turn("scout", "longbow", branka30), ["longbow at branka", "longbow at branka"])
})

test("a Bandit Captain's two Scimitars take Branka from 14 to 2", () => {
  const captain = npc("captain", "bandit-captain", at(0))
  const target = pc("branka", { ...at(5), hitPoints: 14 })
  // Scimitar +5 against Armor Class 17. A 14 makes 19 and hits for 1d6 + 3: a 5 is 8, and she has 6 left.
  const first = strike({ attacker: captain, target, weapon: "scimitar", dice: [14], roll: falls(5) })
  assert.deepEqual([first.roll.total, first.taken, first.hitPoints.after], [19, 8, 6])
  // A 12 makes 17 and hits: a 1 is 4, and she has 2 left.
  const second = strike({ attacker: captain, target: first.target, weapon: "scimitar", dice: [12], roll: falls(1) })
  assert.deepEqual([second.roll.total, second.taken, second.hitPoints.after], [17, 4, 2])
})

test("a Multiattack whose first target drops goes on at the nearest enemy its weapon reaches, or stops", () => {
  // An Owlbear (Large, at 0) beside Branka, with Wrenna 5 feet past its other side and Poppen 40 feet off.
  const owlbear = npc("owlbear", "owlbear", at(0))
  const first = pc("branka", at(7.5))
  const near = pc("wrenna", at(-7.5))
  const far = pc("poppen", at(0, 40))
  const present = [owlbear, first, near, far]
  // Both Rends at Branka while she stands.
  assert.deepEqual(turnOf(owlbear, first, "rend", present), ["rend at branka", "rend at branka"])
  // The first drops her: the second goes at Wrenna, never at Poppen out of reach.
  const dropped = [owlbear, { ...first, hitPoints: 0 }, near, far]
  assert.deepEqual(turnOf(owlbear, first, "rend", present, dropped), ["rend at branka", "rend at wrenna"])
  // With Wrenna gone too, no one is in reach: the second Rend is not made.
  assert.deepEqual(turnOf(owlbear, first, "rend", present, [owlbear, { ...first, hitPoints: 0 }, far]), ["rend at branka"])
  // A Bandit Captain whose first Scimitar drops Branka shoots Poppen, 40 feet off, with the Pistol at long range.
  const captain = npc("captain", "bandit-captain", at(0))
  const beside = pc("branka", at(5))
  assert.deepEqual(turnOf(captain, beside, "scimitar", [captain, beside, far], [captain, { ...beside, hitPoints: 0 }, far]), ["scimitar at branka", "pistol at poppen"])
})

test("a hit's gated damage is dealt only when its gate holds, and a gate the engine cannot judge leaves its part out", () => {
  const goblin = npc("goblin", "goblin-warrior")
  const target = pc("branka")
  // Goblin Warrior's Scimitar, +4: "5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had
  // Advantage". With Advantage, 6 and 15: 19 hits Armor Class 17, a 3 and a 2 deal 7.
  assert.equal(strike({ attacker: goblin, target, weapon: "scimitar", dice: [6, 15], mode: "advantage", roll: falls(3, 2) }).taken, 7)
  // With none, 15 makes 19 and hits for the 3 and 2: 5.
  assert.equal(strike({ attacker: goblin, target, weapon: "scimitar", dice: [15], roll: falls(3) }).taken, 5)
  // Swarm of Rats, 14 hit points: "5 (2d4) Piercing damage, or 2 (1d4) Piercing damage if the swarm is Bloodied". At 7
  // it is Bloodied, and 18 + 2 hits: one d4, a 3. At 8 it is not: two, a 3 and a 2.
  assert.equal(strike({ attacker: npc("rats", "swarm-of-rats", { hitPoints: 7 }), target, weapon: "bites", dice: [18], roll: falls(3) }).taken, 3)
  assert.equal(strike({ attacker: npc("rats", "swarm-of-rats", { hitPoints: 8 }), target, weapon: "bites", dice: [18], roll: falls(3, 2) }).taken, 5)
  // A Boar's Gore: "4 (1d6 + 1) Piercing damage. If the target is a Medium or smaller creature and the boar moved 20+
  // feet straight toward it immediately before the hit, the target takes an extra 3 (1d6) Piercing damage". The
  // engine keeps no straight run, so the extra is left out, not added.
  assert.deepEqual(attacksOf({ type: "npc", statBlock: "boar" })[0].damage, [{ dice: "1d6 + 1", type: "piercing" }])
  assert.equal(attacksOf({ type: "npc", statBlock: "boar" })[0].gated, undefined)
  // Every gated part of a hit in the SRD: 14 given by their gates, and these 15 left out, charges and damage that comes later.
  const left: string[] = []
  let given = 0
  for (const monster of monsters)
    for (const action of monster.actions ?? []) {
      if (!action.attack) continue
      for (const part of action.damage ?? []) {
        if (part.on !== "hit" || !(part.appliesWhen || part.timing || part.alternativeTo !== undefined)) continue
        if (!part.timing && part.appliesWhen && gateOf(part.appliesWhen)) given++
        else left.push(`${monster.id} ${action.name}`)
      }
    }
  assert.equal(given, 14)
  assert.equal(
    attacksOf({ type: "npc", statBlock: "goblin-boss" }).reduce((sum, attack) => sum + (attack.gated?.length ?? 0), 0),
    2
  )
  assert.deepEqual(left, [
    "animated-rug-of-smothering Smother",
    "boar Gore",
    "elk Ram",
    "giant-boar Gore",
    "giant-elk Ram",
    "giant-goat Ram",
    "giant-seahorse Ram",
    "goat Ram",
    "minotaur-of-baphomet Gore",
    "minotaur-skeleton Gore",
    "rhinoceros Gore",
    "stirge Proboscis",
    "triceratops Gore",
    "warhorse Hooves",
    "wereboar Tusk",
  ])
})

test("a Troll down at 0 hit points struck with Fire stays down with its Regeneration stopped", () => {
  // Troll: Armor Class 15, "dies only if it starts its turn with 0 Hit Points and doesn't regenerate", and Acid or Fire
  // stops its Regeneration on its next turn. At 0 it is Unconscious, so a hit from within 5 feet is a Critical Hit. A
  // Hell Hound's Bite, +5: a 12 makes 17 and hits, 2d8 + 3 Piercing (4 and 1, 8) and 2d6 Fire (2 and 1, 3): 11.
  const troll = npc("troll", "troll", { hitPoints: 0 }) as InScene & { type: string; turnEffects?: { id: string }[] }
  const burnt = strike({ attacker: npc("hound", "hell-hound"), target: troll, weapon: "bite", dice: [12], roll: falls(4, 1, 2, 1) })
  assert.deepEqual([burnt.roll.critical, burnt.taken, burnt.hitPoints.after, burnt.target.dead], [true, 11, 0, undefined])
  assert.deepEqual(
    burnt.target.turnEffects?.map((effect) => effect.id),
    ["regeneration-stopped"]
  )
  // Branka's Warhammer deals Bludgeoning alone: a 15 makes 20 and hits, and the Troll's Regeneration is left as it was.
  const struck = strike({ attacker: pc("branka"), target: troll, weapon: "warhammer", dice: [15], roll: falls(4, 1, 2, 2) })
  assert.deepEqual([struck.hitPoints.after, struck.target.dead, struck.target.turnEffects], [0, undefined, undefined])
})

test("an NPC who attacks an NPC keeps to that one, and never turns on a hero", () => {
  // A Scout fights beside the heroes: "The scout makes two attacks, using Shortsword and Longbow in any combination."
  // Her first attack is at a Skeleton 5 feet off, and a hero stands 5 feet off on her other side.
  const scout = npc("astrid", "scout", at(0))
  const skeleton = npc("bones", "skeleton", at(5))
  const friend = pc("maren", at(-5))
  // Both attacks go at the Skeleton while it stands.
  assert.deepEqual(turnOf(scout, skeleton, "shortsword", [scout, skeleton, friend]), ["shortsword at bones", "shortsword at bones"])
  // The first drops it: the second is lost, and the hero beside her is not attacked.
  assert.deepEqual(turnOf(scout, skeleton, "shortsword", [scout, skeleton, friend], [scout, { ...skeleton, hitPoints: 0 }, friend]), ["shortsword at bones"])
})
