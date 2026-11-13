import type { DamageTypeId } from "@d20/srd"
import { equipmentById } from "@d20/srd/equipment"
import { z } from "zod"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { type Attack, defensesOf, parseDice } from "../attack"
import { attackable, nearestEnemy } from "../attack-roll"
import type { Roller } from "../check"
import type { ClassRules } from "../class-rules"
import { withCondition } from "../conditions"
import { deriveSheet, trainedWith } from "../derive"
import { hasFeature, usedThisTurn } from "../feature-rules"
import { magicalCunningOf, withMagicalCunning } from "../rest"
import { areEnemies } from "../sides"
import { feetBetween, pushed, sizeOf, walkOver } from "../space"
import { slotsLeft, withCastSpent } from "../spells"

/**
 * The Warlock's features in play, levels 1 to 5. Pact Magic's slots and their return on a Short Rest are the sheet's
 * and ../rest's, and a Warlock casts through the same path as any caster (../spells), every spell at the Pact slot's
 * level. Eldritch Blast's beams are its own data: one at levels 1 to 4 and two at level 5, each its own attack roll,
 * falling on the targets named in turn (../spells `castSpell`).
 *
 * Magical Cunning (level 2): a rite of 1 minute, the turn's whole action, never while a fight is on, once a Long Rest.
 * It gives back expended Pact Magic slots, up to half the maximum rounded up (../rest `withMagicalCunning`).
 *
 * Eldritch Invocations, as the sheet's `featurePicks` hold them, each with the cantrip it is taken for:
 * Agonizing Blast adds the Charisma modifier to each hit of its cantrip, beam by beam. Repelling Blast pushes a Large
 * or smaller creature its cantrip hits 10 feet straight away, over the encounter's floor and stopped by what is solid
 * there, and only where there is a floor. Eldritch Spear lengthens its cantrip's range by 30 feet a Warlock level.
 * Eldritch Mind gives Advantage on the Constitution save to keep Concentration. The free casts (Armor of Shadows,
 * Fiendish Vigor, Mask of Many Faces, Misty Visions, Otherworldly Leap, Ascendant Step, Master of Myriad Forms, Gift of
 * the Depths, Pact of the Chain's Find Familiar) are spells the hero knows (../spells `spellsOf`), Fiendish Vigor's
 * Temporary Hit Points at the die's highest. Pact of the Blade: the pact weapon is the first Melee weapon on the sheet,
 * since the sheet keeps no other word of which weapon is bonded. It is attacked with proficiency and with Charisma in
 * place of Strength or Dexterity where that is higher, and deals Necrotic, Psychic or Radiant damage in place of its
 * own where that harms the target more. Thirsting Blade (level 5) gives a second attack with the pact weapon. Eldritch
 * Smite (level 5) spends a Pact Magic slot on a pact weapon hit, once a turn, for 1d8 Force damage and 1d8 more a slot
 * level, and knocks a Huge or smaller target Prone.
 * Left told: Devil's Sight and One with Shadows (the engine knows no light), Gaze of Two Minds (senses), Gift of the
 * Depths' swimming and breathing, Pact of the Tome (the sheet keeps no word of the book's cantrips and rituals), Pact
 * of the Chain's familiar and Investment of the Chain Master (no familiar joins the encounter).
 *
 * Fiend Patron (level 3): the Fiend Spells are always prepared (../derive). Dark One's Blessing gives Temporary Hit
 * Points equal to the Charisma modifier plus the Warlock level, at least 1, when the Warlock drops an enemy to 0 hit
 * points, or another does within 10 feet of them (../class-rules `afterFelled`).
 */

const INVOCATIONS = "warlock-eldritch-invocations"
const CUNNING = "magical-cunning"
const SMITE = "eldritch-smite"
const BLESSING = "fiend-patron-dark-ones-blessing"

// Repelling Blast: "push the creature up to 10 feet straight away from you", on one "Large or smaller".
const REPEL_FEET = 10
const REPELLED: readonly string[] = ["Tiny", "Small", "Medium", "Large"]
// Eldritch Spear: "its range increases by a number of feet equal to 30 times your Warlock level", for a cantrip of "a range of 10+ feet".
const SPEAR_FEET = 30
// Dark One's Blessing: also when "someone else reduces an enemy within 10 feet of you".
const BLESSING_FEET = 10

/** The invocations a hero has picked, each with the cantrip it is taken for. */
const picksOf = (character: Roller) => (hasFeature(character, INVOCATIONS) ? (character.sheet?.featurePicks?.[INVOCATIONS] ?? []) : [])
/** Whether a hero has picked an invocation, for a cantrip where it is taken for one. */
export const hasInvocation = (character: Roller, option: string, cantrip?: string): boolean =>
  picksOf(character).some((pick) => pick.option === option && (cantrip === undefined || pick.cantrip === cantrip))

const charisma = (character: Roller): number => (character.sheet ? deriveSheet(character.sheet).abilityModifiers.cha : 0)

/** A hero's pact weapon with Pact of the Blade: the first Melee weapon on their sheet. None without the invocation. */
export function pactWeaponOf(character: Roller): string | undefined {
  if (!hasInvocation(character, "pact-of-the-blade")) return undefined
  return character.sheet?.weapons?.find((id) => {
    const weapon = equipmentById.get(id)
    return weapon?.kind === "weapon" && weapon.attackType === "melee"
  })
}

/**
 * The pact weapon's attack: with proficiency, and with Charisma for the attack and damage rolls where it is higher
 * than the Strength or Dexterity the weapon would use. A Longsword with Strength 10 and Charisma 16 at level 1 is +5,
 * 1d8 + 3.
 */
export function pactAttack(character: Roller, attack: Attack): Attack {
  const sheet = character.sheet
  const weapon = equipmentById.get(attack.id)
  if (!sheet || weapon?.kind !== "weapon" || attack.id !== pactWeaponOf(character)) return attack
  const derived = deriveSheet(sheet)
  const mods = derived.abilityModifiers
  // What ../attack `weaponAttack` used: Strength, or the higher of Strength and Dexterity for a Finesse weapon.
  const used = (weapon.properties ?? []).includes("finesse") ? Math.max(mods.str, mods.dex) : mods.str
  const best = Math.max(used, mods.cha)
  const trained = trainedWith(derived.weaponProficiencies, weapon) ? 0 : derived.proficiencyBonus
  const [part, ...rest] = attack.damage
  const own = part?.dice ? parseDice(part.dice) : undefined
  const plus = (own?.bonus ?? 0) - used + best
  const damage = own ? [{ ...part, dice: `${own.count}d${own.sides}${plus ? ` ${plus < 0 ? "-" : "+"} ${Math.abs(plus)}` : ""}` }, ...rest] : attack.damage
  return { ...attack, bonus: attack.bonus - used + best + trained, damage }
}

// How much of a damage type a target takes, by its defenses: none, half, all or double.
function share(target: Roller, type: DamageTypeId): number {
  const defenses = defensesOf(target)
  if (defenses.immunities?.includes(type)) return 0
  return (defenses.resistances?.includes(type) ? 0.5 : 1) * (defenses.vulnerabilities?.includes(type) ? 2 : 1)
}

// The Pact Magic slot level a hero has left, the highest. None with no slot left.
function pactSlot(character: Roller & { spellSlots?: readonly number[] }): number | undefined {
  const levels = slotsLeft(character).flatMap((count, index) => (count > 0 ? [index + 1] : []))
  return levels.at(-1)
}

// Magical Cunning used as the action, resolved with no throw.
const cunningFeature = (): RequiredFeature => ({ feature: { id: CUNNING, targets: [] }, rollType: "Magical Cunning", difficulty: 0, modifier: 0, mode: "normal" })

export const warlock: ClassRules = {
  class: "warlock",
  choices: [
    {
      key: CUNNING,
      check: CUNNING,
      offer: (character) => (magicalCunningOf(character).length ? true : undefined),
      prompt: () =>
        `   - MAGICAL CUNNING: when the character performs their patron's rite for a minute to win back spent spell slots, and no fight is on, "check" is "magical-cunning" and "fight" is false. It cannot be done while a fight is on.
`,
      field: () => z.boolean().optional().describe('With "magical-cunning": true'),
      // The rite takes a minute, so it is not performed while a fight is on: the game master says whether one is, as for a long casting.
      act: (_, { character, pick, also }) => {
        if (pick.fight === true) {
          console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: CUNNING, refused: "a fight is on" })
          return { roll: null, ...also, ruling: { name: "Too Long For A Fight", text: "Magical Cunning is a rite of 1 minute, and cannot be performed while a fight is on." } }
        }
        console.log("[LLM] Roll requirement decision:", { character: character.name, requiresRoll: false, feature: CUNNING })
        return { roll: null, feature: cunningFeature(), ...also }
      },
      effects: [CUNNING],
      resolve: ({ characters, actorId }) => {
        const actor = characters.find((character) => character.id === actorId)
        const done = actor ? withMagicalCunning(actor, { inFight: false }) : { problem: "No one performs Magical Cunning." }
        const base = { targets: [], saves: [], harm: [], conditions: [], name: "Magical Cunning" }
        if ("problem" in done) return { ...base, characters, facts: [done.problem], problem: done.problem }
        return { ...base, characters: characters.map((character) => (character.id === actorId ? done.character : character)), facts: done.facts }
      },
    },
    {
      key: SMITE,
      offer: (character) => (hasInvocation(character, SMITE) && pactWeaponOf(character) && pactSlot(character) ? ["smite"] : undefined),
      prompt: () =>
        `   - ELDRITCH SMITE: with an attack with the pact weapon, "eldritch-smite" is "smite" when the player's words pour eldritch power into the blow or name the smite. It spends a Pact Magic spell slot only if the attack hits. Leave it out otherwise.
`,
      field: () => z.enum(["smite"]).optional().describe("For an attack with the pact weapon: Eldritch Smite, spent if it hits"),
      rides: "attack",
    },
  ],
  attack: pactAttack,
  hits: [
    {
      id: "pact-of-the-blade",
      // "You can cause the weapon to deal Necrotic, Psychic, or Radiant damage or its normal damage type": the engine takes the one that harms the target most.
      retype: ({ attacker, attack, target }) => {
        const own = attack.damage[0]?.type
        if (!target || !own || attack.id !== pactWeaponOf(attacker)) return undefined
        const best = (["necrotic", "psychic", "radiant"] as const).reduce<DamageTypeId>((found, type) => (share(target, type) > share(target, found) ? type : found), own)
        return best === own ? undefined : best
      },
    },
    {
      id: SMITE,
      // "An extra 1d8 Force damage to the target, plus another 1d8 per level of the spell slot": 4d8 with a level 3 slot.
      damage: ({ attacker, attack, choices, turnOf }) => {
        const slot = pactSlot(attacker as Roller & { spellSlots?: readonly number[] })
        if (!choices?.[SMITE] || !slot || attack.id !== pactWeaponOf(attacker) || !hasInvocation(attacker, SMITE) || usedThisTurn(attacker, SMITE, turnOf)) return undefined
        return { name: "Eldritch Smite", damage: { dice: `${1 + slot}d8`, type: "force" }, once: SMITE }
      },
      // "You can give the target the Prone condition if it is Huge or smaller."
      after: ({ target, added }) => {
        if (!added.includes("Eldritch Smite") || target.dead || target.hitPoints === 0 || sizeOf(target) === "Gargantuan") return undefined
        const given = withCondition(target, { id: "prone" })
        return {
          target: given.given ? given.character : target,
          rider: { id: SMITE, effect: "prone", took: given.given },
          conditions: given.given ? [{ target: target.id ?? "", condition: "prone" }] : [],
        }
      },
      words: (attacker, target, rider) => (rider.took ? ` ${attacker}'s Eldritch Smite knocks ${target} Prone.` : ""),
      // The Pact Magic slot is spent once the smite has landed.
      landed: ({ characters, attackerId, added }) => {
        const attacker = characters.find((character) => character.id === attackerId)
        const slot = attacker && pactSlot(attacker)
        if (!attacker || !slot || !added.includes("Eldritch Smite")) return characters
        return characters.map((character) => (character.id === attackerId ? withCastSpent(character, { kind: "slot", level: slot }) : character))
      },
    },
  ],
  turnEffects: [{ id: SMITE, span: 1 }],
  follows: [
    {
      // Thirsting Blade: "you can attack twice with the weapon instead of once when you take the Attack action".
      key: "thirsting-blade",
      attack: true,
      offer: (character) => hasInvocation(character, "thirsting-blade") && !!pactWeaponOf(character),
      next: ({ character, made, attack, struck, present, ask, rest }) => {
        if (!attack || !("attack" in made) || attack.id !== pactWeaponOf(character)) return undefined
        const reached = (other: (typeof present)[number]) => attackable(character, other) && ask(attack, other, {}) !== undefined
        const same = present.find((other) => other.id === made.attack.target)
        const target = same && reached(same) ? same : nearestEnemy(character, present.filter(reached))
        return target && ask(attack, target, rest({ struck: [...new Set([...struck, target.id])] }))
      },
    },
  ],
  spellRange: (caster, spell) =>
    spell.level === 0 && spell.range.kind === "feet" && (spell.range.distance ?? 0) >= 10 && hasInvocation(caster, "eldritch-spear", spell.id)
      ? (spell.range.distance ?? 0) + SPEAR_FEET * (caster.sheet?.level ?? 1)
      : undefined,
  spellHit: ({ caster, spell, target, floor }) => {
    const hits = []
    if (hasInvocation(caster, "agonizing-blast", spell.id)) hits.push({ name: "Agonizing Blast", bonus: charisma(caster) })
    // A push needs a floor to be walked over: with none, what stands in the way is unknown, and it is told.
    if (hasInvocation(caster, "repelling-blast", spell.id) && floor && caster.position && target.position && REPELLED.includes(sizeOf(target))) {
      const to = pushed(target.position, caster.position, REPEL_FEET)
      hits.push({ name: "Repelling Blast", to: walkOver(floor.solids, target.position, to, REPEL_FEET).at })
    }
    if (!hits.length) return undefined
    return {
      name: hits.map((hit) => hit.name).join(" and "),
      bonus: hits.reduce((sum, hit) => sum + (hit.bonus ?? 0), 0),
      ...(hits.find((hit) => hit.to)?.to ? { to: hits.find((hit) => hit.to)?.to } : {}),
    }
  },
  concentrationModes: (character) => (hasInvocation(character, "eldritch-mind") ? [{ mode: "advantage", from: "Eldritch Mind" }] : []),
  felled: ({ character, felled, by }) => {
    if (!hasFeature(character, BLESSING) || !areEnemies(felled, character)) return undefined
    const near = feetBetween(character, felled)
    if (by !== character.id && (near === undefined || near > BLESSING_FEET)) return undefined
    const amount = Math.max(1, charisma(character) + (character.sheet?.level ?? 1))
    // Temporary Hit Points do not stack: the higher stand.
    if (amount <= (character.tempHitPoints ?? 0)) return undefined
    return {
      character: { ...character, tempHitPoints: amount },
      name: "Dark One's Blessing",
      text: `${character.name ?? "The Warlock"} draws on the Dark One's Blessing as ${felled.name ?? "the enemy"} falls, and gains ${amount} Temporary Hit Points.`,
    }
  },
}
