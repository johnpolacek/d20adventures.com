import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { attacksOf } from "../../src/sheet/attack"
import { attackAfter, attackRequirement, followingRoll, type InScene } from "../../src/sheet/attack-roll"
import { packTacticsModes } from "../../src/sheet/monster-traits"
import { opportunityAttacks } from "../../src/sheet/reactions"
import type { Sheet } from "../../src/sheet/sheet"
import { areEnemies, sameSide, sidesWords } from "../../src/sheet/sides"
import type { RequiredRoll } from "../../src/validations/roll-requirement-schema"

// Every expected value below was worked out by hand from the SRD 5.2.1 rules and stat blocks, and from where each one
// is placed, not copied from the functions' output. Astrid Blackthorn fights beside the heroes in Welcome to Kordavos,
// so the encounter marks her `side: party`.

const heroSheet = (
  JSON.parse(readFileSync(new URL("../../../../content/settings/realm-of-myr/adventures/welcome-to-kordavos/characters/branka-stoneveil.json", import.meta.url), "utf8")) as { sheet: Sheet }
).sheet
const at = (x: number, y = 0) => ({ position: { x, y } })
type One = InScene & { type: string }
const npc = (id: string, statBlock: string, more: object = {}) => ({ id, name: id, type: "npc", statBlock, ...more }) as One
const pc = (id: string, more: object = {}) => ({ id, name: id, type: "pc", sheet: heroSheet, ...more }) as One
const floor = { solids: [], doors: [] }

// The attacks of one turn, each "weapon at target": the first, then each the rules ask for next, with the scene as
// the first attack left it.
function turnOf(attacker: One, target: One, weapon: string, after: RequiredRoll["after"], scene: readonly One[], left: readonly One[] = scene): string[] {
  const attack = attacksOf(attacker).find((entry) => entry.id === weapon)
  assert.ok(attack, `${attacker.name} has no ${weapon}`)
  const first = attackRequirement({ character: attacker, target, attack, present: scene, floor, after })
  assert.ok("roll" in first)
  const made: string[] = []
  let roll: RequiredRoll | undefined = first.roll
  while (roll && "attack" in roll) {
    made.push(`${roll.attack.weapon} at ${roll.attack.target}`)
    roll = followingRoll({ character: attacker, made: roll, present: left, floor })
  }
  return made
}

test("an NPC with the party gives and takes no Opportunity Attack with a hero, and a foe still does", () => {
  // The SRD's Opportunity Attack is made "when a creature that you can see leaves your reach", and the rules here make
  // it at an enemy. Branka and Astrid stand 5 feet apart, each within the other's 5-foot reach.
  const branka = pc("branka", at(0))
  const astrid = npc("astrid", "scout", { side: "party", ...at(5) })
  // Branka walks 20 feet away from Astrid, out of her reach: Astrid makes none.
  assert.deepEqual(opportunityAttacks({ mover: branka, from: { x: 0, y: 0 }, to: { x: -20, y: 0 }, everyone: [branka, astrid] }), [])
  // Astrid walks 20 feet away from Branka: Branka makes none.
  assert.deepEqual(opportunityAttacks({ mover: astrid, from: { x: 5, y: 0 }, to: { x: 25, y: 0 }, everyone: [branka, astrid] }), [])
  // Unmarked, the same Scout is a foe and takes hers with her Shortsword, her one melee attack.
  const foe = npc("astrid", "scout", at(5))
  assert.deepEqual(
    opportunityAttacks({ mover: branka, from: { x: 0, y: 0 }, to: { x: -20, y: 0 }, everyone: [branka, foe] }).map(({ attacker, weapon }) => [attacker.id, weapon]),
    [["astrid", "shortsword"]]
  )
})

test("a hero's second attack passes over an ally to the foe", () => {
  // Branka with a Glaive, which reaches 10 feet, attacks a Skeleton 5 feet off with one attack still to come (Extra
  // Attack). The Skeleton drops. Astrid stands 5 feet off on her other side and a second Skeleton 10 feet off.
  const branka = pc("branka", { ...at(0), sheet: { ...heroSheet, weapons: ["glaive"] } })
  const bones = npc("bones", "skeleton", at(5))
  const astrid = npc("astrid", "scout", { side: "party", ...at(0, 5) })
  const rattle = npc("rattle", "skeleton", at(0, -10))
  const scene = [branka, bones, astrid, rattle]
  const dropped = [branka, { ...bones, hitPoints: 0 }, astrid, rattle]
  // The second attack goes at the nearest enemy in reach: the Skeleton 10 feet off, not Astrid 5 feet off.
  assert.deepEqual(turnOf(branka, bones, "glaive", { attacks: 1 }, scene, dropped), ["glaive at bones", "glaive at rattle"])
  // Unmarked, the nearer Astrid would have been taken: the fault the mark mends.
  const unmarked = { ...astrid, side: undefined }
  assert.deepEqual(turnOf(branka, bones, "glaive", { attacks: 1 }, [branka, bones, unmarked, rattle], [branka, { ...bones, hitPoints: 0 }, unmarked, rattle]), ["glaive at bones", "glaive at astrid"])
})

test("an ally's Multiattack goes on to the next foe when the first drops", () => {
  // The Scout: "The scout makes two attacks, using Shortsword and Longbow in any combination." Astrid's first is at a
  // Skeleton 5 feet off, which drops. Branka stands 5 feet off on her other side and a second Skeleton 5 feet off
  // ahead. The Shortsword has no Disadvantage there, and the Longbow has, with an enemy within 5 feet, so the second
  // attack is the Shortsword at the second Skeleton, never at Branka.
  const astrid = npc("astrid", "scout", { side: "party", ...at(0) })
  const bones = npc("bones", "skeleton", at(5))
  const branka = pc("branka", at(-5))
  const rattle = npc("rattle", "skeleton", at(0, 5))
  const scene = [astrid, bones, branka, rattle]
  assert.deepEqual(turnOf(astrid, bones, "shortsword", attackAfter(astrid, { weapon: "shortsword" }), scene, [astrid, { ...bones, hitPoints: 0 }, branka, rattle]), [
    "shortsword at bones",
    "shortsword at rattle",
  ])
  // With no foe left in reach, the second attack is lost.
  assert.deepEqual(turnOf(astrid, bones, "shortsword", attackAfter(astrid, { weapon: "shortsword" }), [astrid, bones, branka], [astrid, { ...bones, hitPoints: 0 }, branka]), ["shortsword at bones"])
})

test("a bystander is no one's enemy and no one's ally", () => {
  const branka = pc("branka", at(0))
  const merchant = npc("merchant", "commoner", { side: "none", ...at(5) })
  const bandit = npc("bandit", "bandit", at(-5))
  const astrid = npc("astrid", "scout", { side: "party" })
  assert.deepEqual([areEnemies(merchant, branka), areEnemies(merchant, bandit), sameSide(merchant, branka), sameSide(merchant, bandit)], [false, false, false, false])
  assert.deepEqual([areEnemies(astrid, branka), sameSide(astrid, branka), areEnemies(astrid, bandit), areEnemies(branka, bandit), sameSide(bandit, bandit)], [false, true, true, true, true])
  // Branka walks away from the merchant beside her: no Opportunity Attack either way. The Bandit 5 feet off on her
  // other side takes one with its Scimitar.
  assert.deepEqual(
    opportunityAttacks({ mover: branka, from: { x: 0, y: 0 }, to: { x: 0, y: 20 }, everyone: [branka, merchant, bandit] }).map(({ attacker }) => attacker.id),
    ["bandit"]
  )
  assert.deepEqual(opportunityAttacks({ mover: merchant, from: { x: 5, y: 0 }, to: { x: 25, y: 0 }, everyone: [branka, merchant] }), [])
  // Branka's second attack, once the Bandit drops, does not fall on the merchant: with no enemy left it is lost.
  assert.deepEqual(turnOf(branka, bandit, "warhammer", { attacks: 1 }, [branka, merchant, bandit], [branka, merchant, { ...bandit, hitPoints: 0 }]), ["warhammer at bandit"])
  // A hero who names the merchant still attacks them, and the second attack stays on them while they stand.
  assert.deepEqual(turnOf(branka, merchant, "warhammer", { attacks: 1 }, [branka, merchant]), ["warhammer at merchant", "warhammer at merchant"])
  // The model is told who is with the party and who is a bystander, and nothing where no one is marked.
  assert.equal(sidesWords([branka, merchant, bandit, astrid]), "astrid is with the party. merchant is a bystander, in no one's fight.")
  assert.equal(sidesWords([branka, bandit]), undefined)
})

test("Pack Tactics counts an ally of the attacker's side beside the target, and only that", () => {
  // "The tough has Advantage on an attack roll against a creature if at least one of the tough's allies is within 5
  // feet of the creature and the ally doesn't have the Incapacitated condition."
  const branka = pc("branka", at(5))
  const astrid = npc("astrid", "scout", { side: "party", ...at(5, 5) })
  // A Tough with the party attacks a Bandit, and Branka stands 5 feet from the Bandit: she is its ally, so Advantage.
  const ally = npc("tough", "tough", { side: "party", ...at(0) })
  const bandit = npc("bandit", "bandit", at(10))
  assert.deepEqual(packTacticsModes(ally, bandit, [ally, bandit, branka]), [{ mode: "advantage", from: "Pack Tactics" }])
  // A foe Tough attacks Branka, and Astrid stands 5 feet from her: Astrid is with the party, not the Tough's ally, so
  // none. Before the mark she counted as one.
  const foe = npc("tough", "tough", at(0))
  assert.deepEqual(packTacticsModes(foe, branka, [foe, branka, astrid]), [])
  // The Bandit beside Branka is the foe Tough's ally: Advantage.
  assert.deepEqual(packTacticsModes(foe, branka, [foe, branka, { ...bandit, ...at(5, -5) }]), [{ mode: "advantage", from: "Pack Tactics" }])
  // A bystander beside the target is no one's ally.
  assert.deepEqual(packTacticsModes(foe, branka, [foe, branka, npc("merchant", "commoner", { side: "none", ...at(5, -5) })]), [])
})
