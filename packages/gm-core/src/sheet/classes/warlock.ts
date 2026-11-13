import type { DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { equipmentById } from "@d20/srd/equipment"
import { z } from "zod"
import type { RequiredFeature } from "../../validations/roll-requirement-schema"
import { type Attack, damageTaken, defensesOf, parseDice, rollDamage } from "../attack"
import { attackable, nearestEnemy } from "../attack-roll"
import { ownBlockOf } from "../blocks"
import type { Roller } from "../check"
import type { CastChoice, ClassRules, DieHolder, FollowRule, HitRider, SaveRule } from "../class-rules"
import { CONDITION_SPANS } from "../condition-entry"
import { withCondition } from "../conditions"
import { withDamage, withHealing } from "../death"
import { deriveSheet, trainedWith } from "../derive"
import { featureUseCount, hasFeature, usedThisTurn, usesLeft, withFeatureUsed, withUsedThisTurn } from "../feature-rules"
import { shovedTo } from "../floor-areas"
import type { Harm } from "../harm"
import { hitPointsOf } from "../hit-points"
import { withLegendaryResistanceSpent } from "../legendary-resistance"
import { hitDiceOf, magicalCunningOf, withMagicalCunning } from "../rest"
import { withRescueSpent } from "../save-rules"
import { areEnemies } from "../sides"
import { feetBetween, sizeOf } from "../space"
import { withSpellEffect } from "../spell-effects"
import { type Castee, rollSave, type SaveRoll, slotsLeft, spellcastingOf, withCastSpent } from "../spells"
import type { TurnEffect } from "../turn-effect"

/**
 * The Warlock's features in play, levels 1 to 20. Pact Magic's slots and their return on a Short Rest are the sheet's
 * and ../rest's, and a Warlock casts through the same path as any caster (../spells), every spell at the Pact slot's
 * level: three slots from 11 and four from 17, of level 5 from 9. Eldritch Blast's beams are its own data: one at
 * levels 1 to 4, two at 5, three at 11 and four at 17, each its own attack roll, falling on the targets named in turn
 * (../spells `castSpell`).
 *
 * Magical Cunning (level 2): a rite of 1 minute, the turn's whole action, never while a fight is on, once a Long Rest.
 * It gives back expended Pact Magic slots, up to half the maximum rounded up, and all of them with Eldritch Master
 * (level 20) (../rest `withMagicalCunning`).
 *
 * Contact Patron (level 9): Contact Other Plane always prepared, with one cast a Long Rest that takes no slot, read
 * from the data (../derive, ../spells `spellsOf`). The spell itself is told, its save among it.
 *
 * Mystic Arcanum (levels 11, 13, 15, 17): the spells picked are kept in `featurePicks` (../derive `SPELL_PICKS`), and
 * each is cast once a Long Rest with no slot, at its own level, counted under "warlock-mystic-arcanum:<spell>"
 * (../derive `pickedFreeCasts`). A spell the engine labels told stays told.
 *
 * Eldritch Invocations, as the sheet's `featurePicks` hold them, each with the cantrip it is taken for:
 * Agonizing Blast adds the Charisma modifier to each hit of its cantrip, beam by beam. Repelling Blast pushes a Large
 * or smaller creature its cantrip hits 10 feet straight away, over the encounter's floor and stopped by what is solid
 * there, and only where there is a floor. Eldritch Spear lengthens its cantrip's range by 30 feet a Warlock level.
 * Eldritch Mind gives Advantage on the Constitution save to keep Concentration. The free casts (Armor of Shadows,
 * Fiendish Vigor, Mask of Many Faces, Misty Visions, Otherworldly Leap, Ascendant Step, Master of Myriad Forms, Gift of
 * the Depths, Whispers of the Grave, Visions of Distant Realms, Pact of the Chain's Find Familiar) are spells the hero
 * knows (../spells `spellsOf`), Fiendish Vigor's Temporary Hit Points at the die's highest. Pact of the Blade: the pact
 * weapon is the first Melee weapon on the sheet, since the sheet keeps no other word of which weapon is bonded. It is
 * attacked with proficiency and with Charisma in place of Strength or Dexterity where that is higher, and deals
 * Necrotic, Psychic or Radiant damage in place of its own where that harms the target more. Thirsting Blade (level 5)
 * gives a second attack with the pact weapon, and Devouring Blade (level 12) a third. Eldritch Smite (level 5) spends a
 * Pact Magic slot on a pact weapon hit, once a turn, for 1d8 Force damage and 1d8 more a slot level, and knocks a Huge
 * or smaller target Prone. Lifedrinker (level 9) adds 1d6 Necrotic, Psychic or Radiant damage to a pact weapon hit
 * once a turn, the type that harms the target most, and spends a Hit Point Die to heal the Warlock by its roll plus
 * the Constitution modifier, at least 1, when they are missing at least the die's average. Witch Sight's Truesight is
 * on the sheet (../derive). Pact of the Tome's Book of Shadows is the sheet's too: its three cantrips are known and its
 * two Ritual spells always prepared, kept on the invocation's pick, and cast by the same path as any spell (../derive).
 * Left told: Devil's Sight, One with Shadows and Witch Sight in play (the engine knows no light, and its areas that
 * hide do not tell darkness from fog), Gaze of Two Minds (senses), Gift of the Depths' swimming and breathing, the
 * book as a Spellcasting Focus, Gift of the Protectors (it needs the book's page of names), Pact of the Chain's
 * familiar and Investment of the Chain Master (no familiar joins the encounter).
 *
 * Fiend Patron (level 3): the Fiend Spells are always prepared (../derive). Dark One's Blessing gives Temporary Hit
 * Points equal to the Charisma modifier plus the Warlock level, at least 1, when the Warlock drops an enemy to 0 hit
 * points, or another does within 10 feet of them (../class-rules `afterFelled`), after a hero's own roll.
 * Dark One's Own Luck (level 6): 1d10 added to a failed ability check or saving throw the die could turn, by a plain
 * rule as a player would, once a roll, as many times a Long Rest as the Charisma modifier: on the read's own roll
 * (`failedRollDie`, a held Bardic Inspiration die first) and on a save the engine rolls against harm (`saves`).
 * Fiendish Resilience (level 10): the damage type kept on the sheet is resisted (../derive).
 * Hurl Through Hell (level 14): once a turn on a hit with an attack roll, chosen with the attack (a weapon's, or a
 * spell attack's with "cast"), the target makes a Charisma save against the spell save DC. On a failure it takes 8d10
 * Psychic damage if it is not a Fiend and is Incapacitated through its next turn. Once a Long Rest, or by a Pact Magic
 * slot when the use is spent. While Incapacitated so it is away, out of the encounter, and it returns to the space it
 * left as that ends. Coming back to a space someone now holds is the game master's to tell.
 */

const INVOCATIONS = "warlock-eldritch-invocations"
const CUNNING = "magical-cunning"
const SMITE = "eldritch-smite"
const BLESSING = "fiend-patron-dark-ones-blessing"
const OWN_LUCK = "fiend-patron-dark-ones-own-luck"
const HURL = "fiend-patron-hurl-through-hell"
// The choice of Hurl Through Hell with a spell attack, beside the one that rides a weapon's.
const HURL_CAST = "hurl-through-hell-cast"
const LIFEDRINKER = "lifedrinker"

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

// An Eldritch Invocation's data, by id.
const optionOf = (id: string) => classFeatureById.get(INVOCATIONS)?.options?.find((option) => option.id === id)

// Magical Cunning used as the action, resolved with no throw.
const cunningFeature = (): RequiredFeature => ({ feature: { id: CUNNING, targets: [] }, rollType: "Magical Cunning", difficulty: 0, modifier: 0, mode: "normal" })

// Dark One's Own Luck's die, from its data: 1d10.
const luckDie = (): number => Number(/d(\d+)/.exec(classFeatureById.get(OWN_LUCK)?.dice ?? "1d10")?.[1] ?? 10)

/**
 * Dark One's Own Luck on the read's own failed ability check or saving throw (`failedRollDie`): its d10, while a use is
 * left, spent once it is rolled. Not on an attack roll.
 */
function ownLuckDie(character: DieHolder, test: "attack" | "check" | "save"): ReturnType<NonNullable<ClassRules["failedRollDie"]>> {
  if (test === "attack" || !hasFeature(character, OWN_LUCK) || usesLeft(character, OWN_LUCK) < 1) return undefined
  return { die: luckDie(), spend: (holder) => withFeatureUsed(holder, OWN_LUCK) }
}

/**
 * Dark One's Own Luck on a failed save against harm the engine rolls (../save-rules `rescuedSave`): the d10 is added
 * where it could turn the failure, while a use is left. A 6 on the die lifts a 12 against DC 15 to 18, a success.
 */
const ownLuckSave: SaveRule = ({ character, result, roll }) => {
  const die = luckDie()
  if (!roll || !hasFeature(character, OWN_LUCK) || usesLeft(character, OWN_LUCK) < 1 || result.dc - result.total > die) return undefined
  const amount = roll(die)
  const total = result.total + amount
  const name = classFeatureById.get(OWN_LUCK)?.name ?? "Dark One's Own Luck"
  return { result: { ...result, total, success: total >= result.dc, adds: [...(result.adds ?? []), { from: name, amount }] }, feature: OWN_LUCK, name }
}

/** The damage type of three that harms a target most, by its defenses: Necrotic first where they harm alike. */
const harshest = (target: Roller | undefined, first: DamageTypeId = "necrotic"): DamageTypeId =>
  target ? (["necrotic", "psychic", "radiant"] as const).reduce<DamageTypeId>((found, type) => (share(target, type) > share(target, found) ? type : found), first) : first

// Whether a Warlock may hurl one through hell now: a use left, or a Pact Magic slot to restore it with, beyond `keep`
// slots of a level held back for a cast (the slot of the spell it rides, not yet spent).
function hurlReady(character: Roller & { featureUses?: Record<string, number>; spellSlots?: readonly number[] }, keep?: number): boolean {
  if (!hasFeature(character, HURL)) return false
  if (usesLeft(character, HURL) > 0) return true
  const left = slotsLeft(character).map((count, index) => count - (keep === index + 1 ? 1 : 0))
  return left.some((count) => count > 0)
}

/**
 * A Warlock who has hurled one through hell with no use left, as the Pact Magic slot that restored it leaves them: the
 * use spent past the count is paid for with the highest slot left, and the use is spent once.
 */
export function withHurlPaid<T extends Roller & { featureUses?: Record<string, number>; spellSlots?: readonly number[] }>(character: T): T {
  const used = character.featureUses?.[HURL] ?? 0
  if (!character.sheet || used <= featureUseCount(character.sheet, HURL)) return character
  const slot = pactSlot(character)
  if (!slot) return character
  return { ...withCastSpent(character, { kind: "slot", level: slot }), featureUses: { ...character.featureUses, [HURL]: used - 1 } }
}

/** A creature hurled through hell, as it comes back: the save, the damage it took, and whether it was Incapacitated. */
type Hurled<T> = { target: T; save: SaveRoll; taken: number; given: boolean; legendary: boolean }

/**
 * Hurl Through Hell on one hit: a Charisma save against the Warlock's spell save DC. On a failure 8d10 Psychic damage,
 * none on a Fiend, and Incapacitated through the target's next turn. A Legendary creature that fails may choose to
 * succeed, and spends the use. `d20` and `roll` throw the dice. An 8d10 of all 4s is 32.
 */
export function hurled<T extends Castee>(warlock: Roller & { id: string }, target: T, d20: () => number, roll: (sides: number) => number): Hurled<T> {
  const feature = classFeatureById.get(HURL)
  const kind = target.type === "npc" && !target.sheet ? ownBlockOf(target)?.type : undefined
  const fiend = !!kind && (feature?.damage?.notCreatureTypes ?? ["fiend"]).includes(kind)
  const dice = feature?.damage?.dice ?? "8d10"
  const rolled = fiend ? undefined : rollDamage([{ dice, type: "psychic" }], roll)
  const dc = spellcastingOf(warlock)?.saveDc ?? 10
  const stakes = { conditions: ["incapacitated" as const], ...(rolled ? { damage: rolled.total } : {}) }
  const save = rollSave({ target, ability: "cha", dc, d20, roll, characters: [target], stakes, against: ["incapacitated"], spell: false })
  if (save.legendary) return { target: withLegendaryResistanceSpent(target), save, taken: 0, given: false, legendary: true }
  // A rescue of the target's own is spent (Indomitable).
  const saver = save.rescued ? withRescueSpent(target, save.rescued) : target
  if (save.success) return { target: saver, save, taken: 0, given: false, legendary: false }
  const taken = rolled ? damageTaken(rolled, defensesOf(target)) : 0
  const struck = taken ? withDamage(saver, taken, { types: ["psychic"] }).character : saver
  const down = struck.dead || struck.hitPoints === 0
  const incapacitated = down ? undefined : withCondition(struck, { id: "incapacitated", source: warlock.id, span: "turn", feature: HURL }, { acted: !!target.isComplete })
  // "The target disappears": it is out of the encounter as long as it is Incapacitated, and returns to its space as that
  // ends (../../utils/turn-actors `isAway`).
  const gone = incapacitated?.given ? withSpellEffect(incapacitated.character, { spell: HURL, by: warlock.id, turns: CONDITION_SPANS.turn + (target.isComplete ? 1 : 0), away: true }) : undefined
  return { target: gone ?? struck, save, taken, given: !!incapacitated?.given, legendary: false }
}

// Hurl Through Hell in the story's words, after the hit's.
const hurlWords = (warlock: string, target: string, done: { success: boolean; total: number; dc: number; taken: number; given: boolean; legendary?: boolean }): string =>
  done.success
    ? ` ${warlock} tries to hurl ${target} through the Lower Planes, and ${target} ${done.legendary ? "chooses to succeed on the Charisma save (Legendary Resistance)" : `makes the Charisma save (${done.total} against DC ${done.dc})`} and stays.`
    : ` ${warlock} hurls ${target} through the Lower Planes: ${target} fails the Charisma save (${done.total} against DC ${done.dc}), vanishes${done.taken ? `, takes ${done.taken} psychic damage` : ""}${done.given ? `, and is Incapacitated until the end of ${warlock}'s next turn, when they return to the space they left` : ""}.`

/**
 * Hurl Through Hell on a spell attack that hits, chosen with the cast (`HURL_CAST`): the first creature the spell's
 * attacks hit, once the spell is resolved. It spends the use, or with none left the Pact Magic slot that restores it,
 * beyond the slot the cast itself spends.
 */
const hurlCast: CastChoice = {
  fits: (caster, { spell, slot }) => !!spell.attack && hurlReady(caster, slot),
  around: ({ input, slot, resolve }) => {
    const cast = resolve(input)
    const caster = cast.characters.find((character) => character.id === input.casterId)
    const hit = (cast.rays ?? (cast.attack ? [cast.attack] : [])).find((ray) => {
      const struck = cast.characters.find((character) => character.id === ray.target)
      return ray.roll.hit && struck && !struck.dead && struck.hitPoints !== 0
    })
    const target = hit && cast.characters.find((character) => character.id === hit.target)
    if (!caster || !target || !hurlReady(caster, slot) || usedThisTurn(caster, HURL, caster.id)) return cast
    const done = hurled(caster, target, input.d20, input.roll)
    const spent = usesLeft(caster, HURL) > 0 ? withFeatureUsed(caster, HURL) : withCastSpent(caster, { kind: "slot", level: pactSlot(caster) ?? 1 })
    const paid = withUsedThisTurn(spent, HURL, caster.id)
    const harm: Harm[] = done.taken ? [{ target: target.id, kind: "damage", dice: [], bonus: 0, type: "psychic", amount: done.taken }] : []
    return {
      ...cast,
      characters: cast.characters.map((character) => (character.id === caster.id ? paid : character.id === target.id ? done.target : character)),
      saves: [...cast.saves, done.save],
      harm: [...cast.harm, ...harm],
      conditions: [...cast.conditions, ...(done.given ? [{ target: target.id, condition: "incapacitated" as const }] : [])],
      facts: [...cast.facts, hurlWords(caster.name, target.name, { ...done.save, taken: done.taken, given: done.given, legendary: done.legendary }).trim()],
    }
  },
}

// The pact weapon's next attack of the Attack action, at the one just attacked where it still can be, else the nearest
// enemy in reach: Thirsting Blade's second attack, and Devouring Blade's third.
const pactFollow = (key: string, option: string): FollowRule => ({
  key,
  attack: true,
  offer: (character) => hasInvocation(character, option) && !!pactWeaponOf(character),
  next: ({ character, made, attack, struck, present, ask, rest }) => {
    if (!attack || !("attack" in made) || attack.id !== pactWeaponOf(character)) return undefined
    const reached = (other: (typeof present)[number]) => attackable(character, other) && ask(attack, other, {}) !== undefined
    const same = present.find((other) => other.id === made.attack.target)
    const target = same && reached(same) ? same : nearestEnemy(character, present.filter(reached))
    return target && ask(attack, target, rest({ struck: [...new Set([...struck, target.id])] }))
  },
})

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
    {
      key: HURL,
      offer: (character) => (hurlReady(character) ? ["hurl"] : undefined),
      prompt: () =>
        `   - HURL THROUGH HELL: with an attack, "${HURL}" is "hurl" when the player's words try to send the target through the Lower Planes. The game rolls the target's save only if the attack hits, once a turn, and spends the feature's use or a Pact Magic spell slot. Leave it out otherwise.
`,
      field: () => z.enum(["hurl"]).optional().describe("For an attack: Hurl Through Hell on the target if it hits"),
      rides: "attack",
    },
    {
      key: HURL_CAST,
      offer: (character) => (hurlReady(character) ? true : undefined),
      prompt: () =>
        `   - HURL THROUGH HELL WITH A SPELL: with "cast" of a spell that makes an attack roll, "${HURL_CAST}" is true when the player's words try to send the one it hits through the Lower Planes. The game rolls the save only on a hit, once a turn. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("For a cast of a spell attack: Hurl Through Hell on the first creature it hits"),
      rides: "cast",
      cast: hurlCast,
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
    {
      id: LIFEDRINKER,
      // "Once per turn when you hit a creature with your pact weapon, you can deal an extra 1d6 Necrotic, Psychic, or Radiant damage (your choice)".
      damage: ({ attacker, attack, target, turnOf }) => {
        if (attack.id !== pactWeaponOf(attacker) || !hasInvocation(attacker, LIFEDRINKER) || usedThisTurn(attacker, LIFEDRINKER, turnOf)) return undefined
        const dice = optionOf(LIFEDRINKER)?.damage?.dice ?? "1d6"
        return { name: "Lifedrinker", damage: { dice, type: harshest(target) }, once: LIFEDRINKER }
      },
      // "And you can expend one of your Hit Point Dice to roll it and regain a number of Hit Points equal to the roll plus
      // your Constitution modifier (minimum of 1 Hit Point)": spent by a plain rule, as a Short Rest spends one, while the
      // Warlock is missing at least the die's average.
      spills: ({ characters, attackerId, added, roll }) => {
        const warlock = characters.find((character) => character.id === attackerId) as ((typeof characters)[number] & { hitDiceUsed?: number }) | undefined
        const dice = warlock && hitDiceOf(warlock)
        const now = warlock && hitPointsOf(warlock)
        if (!warlock?.sheet || !added.includes("Lifedrinker") || !dice?.left || !now || now.maximum - now.current < (dice.die + 1) / 2) return undefined
        const healed = Math.max(1, roll(dice.die) + deriveSheet(warlock.sheet).abilityModifiers.con)
        const after = { ...withHealing(warlock, healed), hitDiceUsed: (warlock.hitDiceUsed ?? 0) + 1 }
        const left = hitPointsOf(after)
        return {
          characters: characters.map((character) => (character.id === attackerId ? after : character)),
          told: {
            by: attackerId,
            id: LIFEDRINKER,
            name: "Lifedrinker",
            text: `${warlock.name} spends a Hit Point Die with Lifedrinker and regains ${(left?.current ?? 0) - now.current} hit points, now ${left?.current} of ${left?.maximum}.`,
          },
        }
      },
    },
    {
      id: HURL,
      // On a hit with an attack roll, chosen with the attack, once a turn: the save, the damage and the condition. The use is
      // spent, or with none left the Pact Magic slot that restores it is spent as the roll is settled (`attackRolled`).
      after: ({ attacker, target, choices, roll }) => {
        const warlock = attacker as Roller & { id?: string; featureUses?: Record<string, number>; spellSlots?: readonly number[]; turnEffects?: readonly TurnEffect[] }
        if (!choices?.[HURL] || !hurlReady(warlock) || usedThisTurn(warlock, HURL, undefined) || target.dead || target.hitPoints === 0) return undefined
        const done = hurled({ ...warlock, id: warlock.id ?? "" }, target as unknown as Castee, () => roll(20), roll)
        const rider: HitRider = { id: HURL, effect: done.legendary ? "legendary" : `hurled:${done.taken}:${done.given ? 1 : 0}`, save: done.save, took: !done.save.success }
        return {
          target: done.target as unknown as typeof target,
          rider,
          conditions: done.given ? [{ target: target.id ?? "", condition: "incapacitated" }] : [],
          spends: HURL,
          once: HURL,
        }
      },
      words: (attacker, target, rider) => {
        const [, taken, given] = rider.effect.split(":")
        const save = rider.save ?? { success: true, total: 0, dc: 0 }
        return hurlWords(attacker, target, { success: !rider.took, total: save.total, dc: save.dc, taken: Number(taken ?? 0), given: given === "1", legendary: rider.effect === "legendary" })
      },
    },
  ],
  turnEffects: [
    { id: SMITE, span: 1 },
    { id: LIFEDRINKER, span: 1 },
    { id: HURL, span: 1 },
  ],
  follows: [
    // Thirsting Blade: "you can attack twice with the weapon instead of once when you take the Attack action". Devouring
    // Blade: "The Extra Attack of your Thirsting Blade invocation confers two extra attacks rather than one."
    pactFollow("thirsting-blade", "thirsting-blade"),
    pactFollow("devouring-blade", "devouring-blade"),
  ],
  // A Hurl Through Hell made with no use left is paid for with a Pact Magic slot once the roll is settled.
  attackRolled: (attacker) => withHurlPaid(attacker),
  failedRollDie: ownLuckDie,
  saves: [ownLuckSave],
  spellRange: (caster, spell) =>
    spell.level === 0 && spell.range.kind === "feet" && (spell.range.distance ?? 0) >= 10 && hasInvocation(caster, "eldritch-spear", spell.id)
      ? (spell.range.distance ?? 0) + SPEAR_FEET * (caster.sheet?.level ?? 1)
      : undefined,
  spellHit: ({ caster, spell, target, floor }) => {
    const hits = []
    if (hasInvocation(caster, "agonizing-blast", spell.id)) hits.push({ name: "Agonizing Blast", bonus: charisma(caster) })
    // A push needs a floor to be walked over: with none, what stands in the way is unknown, and it is told. The floor is
    // the one in play, its walls raised by spells among its solid things (../spells `castSpell`).
    if (hasInvocation(caster, "repelling-blast", spell.id) && floor && caster.position && target.position && REPELLED.includes(sizeOf(target))) {
      hits.push({ name: "Repelling Blast", to: shovedTo(floor, [], target.position, caster.position, REPEL_FEET) })
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
