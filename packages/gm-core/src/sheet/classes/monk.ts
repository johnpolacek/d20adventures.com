import type { DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { z } from "zod"
import { isDown } from "../../utils/turn-actors"
import { takeAction } from "../actions"
import { type Attack, attacksOf, parseDice, type Target, UNARMED_STRIKE } from "../attack"
import { attackable, nearestEnemy } from "../attack-roll"
import { type Check, checkBonus, combineModes, type Roller, resolveCheck } from "../check"
import { type BonusActionRule, type ClassRules, type Featured, type FollowRule, type HitRider, withTurnEffect } from "../class-rules"
import { checkModesFrom, saveFailedBy, withCondition } from "../conditions"
import { withHealing } from "../death"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed } from "../feature-rules"
import { canReact } from "../reactions"
import type { Sheet } from "../sheet"
import { checkAdds, saveBonusFor, saveModesFor } from "../spell-effects"
import type { TurnEffect } from "../turn-effect"

/**
 * The Monk's features in play, levels 1 to 5. Unarmored Defense and Unarmored Movement are the sheet's (../derive), and
 * Extra Attack is read from the data by ../feature-rules.
 *
 * Martial Arts (level 1), while the Monk wears no armor and holds no Shield: an Unarmed Strike or a Monk weapon (a
 * Simple Melee weapon, or a Martial Melee weapon with the Light property) rolls the Martial Arts die in place of its
 * own when that is better, and uses Dexterity in place of Strength when that is higher. The engine holds no hands, so
 * the weapon attacked with is taken to be the one wielded. A Bonus Unarmed Strike follows the turn's attack. The
 * engine has no Grapple or Shove, so their save DC is not read.
 * Monk's Focus (level 2): Focus Points are the feature's uses, back on a Short or Long Rest (../rest). Flurry of Blows
 * spends one on two Unarmed Strikes after the turn's attack. Patient Defense is a Disengage, or with a point a Disengage
 * and a Dodge. Step of the Wind is a Dash, or with a point a Dash and a Disengage. The engine has no jumping, so the
 * doubled jump is told.
 * Uncanny Metabolism (level 2): the engine uses it as Initiative is rolled at an encounter's start, once a Long Rest,
 * the first time a Focus Point is spent: every point comes back, and the Monk regains the Martial Arts die plus the
 * Monk level in hit points.
 * Deflect Attacks (level 3): a Reaction to a hit with Bludgeoning, Piercing or Slashing damage that cuts it by 1d10 plus
 * the Dexterity modifier and the Monk level. Redirecting the force at 0 damage is left told: a reaction to damage hands
 * back only what the one hit takes, and cannot spend their Focus Point or harm another.
 * Slow Fall (level 4) is told: the engine has no falling.
 * Stunning Strike (level 5): once a turn, on a hit with a Monk weapon or an Unarmed Strike, a Focus Point for a
 * Constitution save. A failure is Stunned until the Monk's next turn. A success halves the target's Speed and gives the
 * next attack on it Advantage until then.
 * Open Hand Technique (Warrior of the Open Hand, level 3): each hit of a Flurry of Blows may Addle (no Opportunity
 * Attacks) or Topple (a Dexterity save or Prone). Push is left told: a hit is resolved with no floor to push across.
 */

const FOCUS = "monk-monks-focus"

/** A Monk's Martial Arts die at their level, by the class table's column: "1d6", and "1d8" from level 5. */
export const martialArtsDie = (sheet: Sheet): string | undefined => (classById.get(sheet.class)?.levels[sheet.level - 1] as Record<string, unknown> | undefined)?.martialArts as string | undefined

/** The Difficulty Class of a save against a Monk's Focus feature: 8, the Wisdom modifier and the Proficiency Bonus. */
export function focusSaveDc(sheet: Sheet): number {
  const derived = deriveSheet(sheet)
  return 8 + derived.abilityModifiers.wis + derived.proficiencyBonus
}

// Martial Arts holds while the Monk wears no armor and holds no Shield.
const unarmored = (character: Roller): boolean => !!character.sheet && !character.sheet.armor && !character.sheet.shield

/** Whether an attack is an Unarmed Strike or one with a Monk weapon: a Simple Melee weapon, or a Martial Melee weapon with the Light property. */
export function isMonkAttack(attackId: string): boolean {
  if (attackId === UNARMED_STRIKE) return true
  const weapon = equipmentById.get(attackId)
  if (weapon?.kind !== "weapon" || weapon.attackType !== "melee") return false
  return weapon.category === "simple" || (weapon.category === "martial" && (weapon.properties ?? []).includes("light"))
}

const average = (dice: string) => {
  const { count, sides } = parseDice(dice)
  return (count * (sides + 1)) / 2
}

/**
 * An attack as Martial Arts changes it: the Martial Arts die in place of the weapon's own when its average is higher
 * (an Unarmed Strike's flat 1 always), and the higher of Strength and Dexterity for the attack and damage rolls. A
 * Monk with Strength +1 and Dexterity +3 strikes unarmed at +5 for 1d6 + 3 at level 1.
 */
export function martialArtsAttack(character: Roller, attack: Attack): Attack {
  const sheet = character.sheet
  if (!sheet || !hasFeature(character, "monk-martial-arts") || !unarmored(character) || !isMonkAttack(attack.id)) return attack
  const die = martialArtsDie(sheet)
  const [part, ...rest] = attack.damage
  if (!die || !part) return attack
  const mods = deriveSheet(sheet).abilityModifiers
  // What ./attack `weaponAttack` used: Strength for an Unarmed Strike and a Melee weapon, the higher for a Finesse one.
  const weapon = equipmentById.get(attack.id)
  const finesse = weapon?.kind === "weapon" && (weapon.properties ?? []).includes("finesse")
  const used = finesse ? Math.max(mods.str, mods.dex) : mods.str
  const best = Math.max(mods.str, mods.dex)
  const own = part.dice ? parseDice(part.dice) : undefined
  const rolled = own && average(`${own.count}d${own.sides}`) > average(die) ? `${own.count}d${own.sides}` : die
  const dice = best === 0 ? rolled : `${rolled} ${best < 0 ? "-" : "+"} ${Math.abs(best)}`
  return { ...attack, bonus: attack.bonus - used + best, damage: [{ dice, type: part.type, ...(part.floor ? { floor: part.floor } : {}) }, ...rest] }
}

// A Focus Point spent, told in the story.
const spendFocus = (characters: Featured[], actor: Featured) => characters.map((character) => (character.id === actor.id ? withFeatureUsed(character, FOCUS) : character))

// One line of the read's prompt for every Focus feature, given once.
const FOCUS_NOTE =
  "Flurry of Blows, Patient Defense and Step of the Wind draw on the Monk's Focus Points, and the count beside one is the points left. Flurry of Blows is two Unarmed Strikes after the turn's attack, and goes only with an attack. Patient Defense backs away without drawing Opportunity Attacks, and with a point the character also Dodges. Step of the Wind is a Dash, and with a point also a Disengage."

// A Focus feature as a Bonus Action. One that `spends` costs a Focus Point.
const focus = (rule: Omit<BonusActionRule, "feature" | "note">): BonusActionRule => ({ ...rule, feature: FOCUS, note: FOCUS_NOTE })

// Flurry of Blows, and an Open Hand Monk's with Addle or Topple on each hit.
const flurry = (technique?: "addle" | "topple"): BonusActionRule =>
  focus({
    id: technique ? `flurry-of-blows-${technique}` : "flurry-of-blows",
    name: technique ? `Flurry of Blows with ${technique === "addle" ? "Addle" : "Topple"}` : "Flurry of Blows",
    spends: true,
    follow: technique ? `flurry-${technique}` : "flurry",
    ...(technique ? { offer: (character: Roller) => hasFeature(character, "warrior-of-the-open-hand-open-hand-technique") } : {}),
    use: ({ characters, actor, action }) => ({
      characters: spendFocus(characters, actor),
      use: { feature: action.id, name: "Flurry of Blows", fact: `${actor.name} spends a Focus Point on Flurry of Blows: two Unarmed Strikes after the attack.` },
    }),
  })

/**
 * An Unarmed Strike that follows the turn's attack, as a Bonus Action: at the one just attacked while they stand in
 * reach, or the nearest enemy in reach. `then` is the strike still to come after it (Flurry of Blows' second), and
 * `technique` the Open Hand Technique each hit carries.
 */
const strikeAfter = (key: string, then?: string, technique?: string): FollowRule => ({
  key,
  attack: true,
  next: ({ character, made, struck, present, ask, rest }) => {
    if (!("attack" in made)) return undefined
    const unarmed = attacksOf(character).find((entry) => entry.id === UNARMED_STRIKE)
    if (!unarmed) return undefined
    const reached = (other: (typeof present)[number]) => attackable(character, other) && ask(unarmed, other, {}) !== undefined
    const same = present.find((other) => other.id === made.attack.target)
    const target = same && reached(same) ? same : nearestEnemy(character, present.filter(reached))
    if (!target) return undefined
    const roll = ask(unarmed, target, rest({ struck: [...new Set([...struck, target.id])], ...(then ? { [then]: true } : {}) }))
    if (!roll || !technique || !("attack" in roll)) return roll
    return { ...roll, attack: { ...roll.attack, choices: { ...roll.attack.choices, "open-hand": technique } } }
  },
})

// A save against a Monk's feature, rolled for its target.
function focusSave<T extends Target>(attacker: Roller, target: T, ability: Check & { kind: "save" }, against: Parameters<typeof saveModesFor>[2], roll: (sides: number) => number) {
  const mode = combineModes([...checkModesFrom(target, ability), ...saveModesFor(target, ability, against)].map((source) => source.mode))
  return resolveCheck({
    dice: mode === "normal" ? [roll(20)] : [roll(20), roll(20)],
    bonus: checkBonus(target, ability) + saveBonusFor(target, ability),
    dc: focusSaveDc(attacker.sheet as Sheet),
    mode,
    fails: !!saveFailedBy(target, ability),
    adds: checkAdds(target, ability, roll),
  })
}

// The damage types Deflect Attacks answers below level 13.
const DEFLECTED: readonly DamageTypeId[] = ["bludgeoning", "piercing", "slashing"]

// What one bears from the turn's effects, by id.
const bears = (character: { turnEffects?: readonly TurnEffect[] }, id: string) => !!character.turnEffects?.some((effect) => effect.id === id)

export const monk: ClassRules = {
  class: "monk",
  attack: martialArtsAttack,
  bonusActions: [
    {
      id: "martial-arts-strike",
      feature: "monk-martial-arts",
      name: "Martial Arts: Bonus Unarmed Strike",
      offer: unarmored,
      follow: "martial-arts",
      note: "martial-arts-strike is one Unarmed Strike after the turn's attack, and goes only with an attack.",
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: "Martial Arts", fact: `${actor.name} makes an Unarmed Strike as a Bonus Action after the attack.` } }),
    },
    flurry(),
    flurry("addle"),
    flurry("topple"),
    focus({
      id: "patient-defense",
      name: "Patient Defense: Disengage",
      disengages: () => true,
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: "Patient Defense", fact: `${actor.name} takes the Disengage action as a Bonus Action.` } }),
    }),
    focus({
      id: "patient-defense-focus",
      name: "Patient Defense: Disengage and Dodge",
      spends: true,
      disengages: () => true,
      use: ({ characters, actor, action }) => {
        const dodged = takeAction(spendFocus(characters, actor) as (Featured & { name: string; type: string })[], actor.id, { action: "dodge" }).characters
        return {
          characters: dodged,
          use: { feature: action.id, name: "Patient Defense", fact: `${actor.name} spends a Focus Point on Patient Defense: the Disengage and the Dodge actions as a Bonus Action.` },
        }
      },
    }),
    focus({
      id: "step-of-the-wind",
      name: "Step of the Wind: Dash",
      dash: true,
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: "Step of the Wind", fact: `${actor.name} takes the Dash action as a Bonus Action.` } }),
    }),
    focus({
      id: "step-of-the-wind-focus",
      name: "Step of the Wind: Dash and Disengage",
      spends: true,
      dash: true,
      disengages: () => true,
      use: ({ characters, actor, action }) => ({
        characters: spendFocus(characters, actor),
        use: {
          feature: action.id,
          name: "Step of the Wind",
          fact: `${actor.name} spends a Focus Point on Step of the Wind: the Dash and Disengage actions as a Bonus Action, and their jumps go twice as far this turn.`,
        },
      }),
    }),
  ],
  follows: [
    strikeAfter("martial-arts"),
    strikeAfter("flurry", "flurry-again"),
    strikeAfter("flurry-again"),
    strikeAfter("flurry-addle", "flurry-addle-again", "addle"),
    strikeAfter("flurry-addle-again", undefined, "addle"),
    strikeAfter("flurry-topple", "flurry-topple-again", "topple"),
    strikeAfter("flurry-topple-again", undefined, "topple"),
  ],
  choices: [
    {
      key: "stun",
      offer: (character) => (hasFeature(character, "monk-stunning-strike") && usesLeft(character, FOCUS) > 0 ? true : undefined),
      prompt: () =>
        `   - STUNNING STRIKE: "stun" is true when the player's words try to stun the target with a blow, and the action is an attack. The game spends a Focus Point on the first hit this turn with an Unarmed Strike or a Monk weapon. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words try to stun the target with a blow"),
      rides: "turn",
      // Readied as the turn is taken. The Focus Point is spent on the hit (`hits`).
      apply: (characters, actorId) => ({
        characters: characters.map((character) =>
          character.id === actorId ? withTurnEffect(character as Featured & { turnEffects?: readonly TurnEffect[] }, "stunning-strike-ready", actorId) : character
        ),
      }),
    },
  ],
  reactions: [
    {
      id: "deflect-attacks",
      name: "Deflect Attacks",
      has: (character) => hasFeature(character, "monk-deflect-attacks"),
      // Once the damage is known: 1d10 plus the Dexterity modifier and the Monk level off it, to no less than 0.
      onDamage: ({ target, taken, hit, ask, types, roll }) => {
        const sheet = target.sheet
        if (!sheet || !hasFeature(target, "monk-deflect-attacks") || !canReact(target) || !types.some((type) => DEFLECTED.includes(type))) return undefined
        const { sides } = parseDice(classFeatureById.get("monk-deflect-attacks")?.dice ?? "1d10")
        const added = deriveSheet(sheet).abilityModifiers.dex + sheet.level
        if (!ask(true, `${hit} It deals ${taken} damage. Deflect Attacks would cut it by 1d${sides} + ${added}.`)) return undefined
        const rolled = roll(sides)
        if (!Number.isInteger(rolled) || rolled < 1 || rolled > sides) throw new Error(`${rolled} is not a d${sides} roll.`)
        const cut = rolled + added
        const left = Math.max(0, taken - cut)
        return {
          taken: left,
          reaction: { by: target.id, id: "deflect-attacks", name: "Deflect Attacks", text: `${target.name} uses Deflect Attacks, cutting the damage by ${cut}, and takes ${left} of ${taken}.` },
        }
      },
      damageWords: (target) => ` ${target} cuts it with Deflect Attacks.`,
    },
  ],
  hits: [
    {
      id: "stunning-strike",
      after: ({ attacker, target, roll, attack }) => {
        const striker = attacker as typeof attacker & { featureUses?: Record<string, number>; turnEffects?: readonly TurnEffect[] }
        if (!hasFeature(attacker, "monk-stunning-strike") || !bears(striker, "stunning-strike-ready") || usedThisTurn(striker, "stunning-strike", undefined)) return undefined
        if (usesLeft(striker, FOCUS) < 1 || !isMonkAttack(attack.id) || isDown(target)) return undefined
        const save = focusSave(attacker, target, { kind: "save", ability: "con" }, ["stunned"], roll)
        const by = attacker.id ?? ""
        // A failure: Stunned until the Monk's next turn, counted as a span of the target's turn (../conditions).
        const stunned = save.success ? undefined : withCondition(target, { id: "stunned", source: by, span: "turn" }, { acted: !!(target as { isComplete?: boolean }).isComplete })
        // A success: Speed halved and the next attack on it with Advantage, until the Monk's next turn.
        const after = stunned?.given ? stunned.character : save.success ? withTurnEffect(withTurnEffect(target, "stunning-strike-slowed", by), "stunning-strike-opened", by) : target
        const rider: HitRider = { id: "stunning-strike", effect: stunned?.given ? "stunned" : save.success ? "staggered" : "unmoved", save, took: !!stunned?.given || save.success }
        return { target: after, rider, conditions: stunned?.given ? [{ target: target.id ?? "", condition: "stunned" }] : [], spends: FOCUS, once: "stunning-strike" }
      },
      words: (attacker, target, rider) =>
        ` ${attacker} spends a Focus Point on a Stunning Strike: ${
          rider.effect === "stunned"
            ? `${target} fails the Constitution save and is Stunned until ${attacker}'s next turn.`
            : rider.effect === "staggered"
              ? `${target} makes the Constitution save, but their Speed is halved and the next attack on them has Advantage until ${attacker}'s next turn.`
              : `${target} fails the Constitution save, and cannot be Stunned.`
        }`,
    },
    {
      id: "open-hand",
      // On a Flurry of Blows hit: Addle bars the target's Opportunity Attacks, and Topple is a Dexterity save or Prone.
      after: ({ attacker, target, choices, roll }) => {
        const technique = choices?.["open-hand"]
        if (!technique || !hasFeature(attacker, "warrior-of-the-open-hand-open-hand-technique") || isDown(target)) return undefined
        if (technique === "addle") return { target: withTurnEffect(target, "addled", attacker.id ?? ""), rider: { id: "open-hand", effect: "addle", took: true }, conditions: [] }
        if (technique !== "topple") return undefined
        const save = focusSave(attacker, target, { kind: "save", ability: "dex" }, ["prone"], roll)
        const given = save.success ? undefined : withCondition(target, { id: "prone" })
        return {
          target: given?.given ? given.character : target,
          rider: { id: "open-hand", effect: "topple", save, took: !!given?.given },
          conditions: given?.given ? [{ target: target.id ?? "", condition: "prone" }] : [],
        }
      },
      words: (attacker, target, rider) =>
        rider.effect === "addle"
          ? ` ${attacker}'s Open Hand Technique Addles ${target}, who can make no Opportunity Attacks this round.`
          : ` ${attacker}'s Open Hand Technique tries to Topple ${target}: ${rider.took ? `${target} fails the Dexterity save and falls Prone.` : `${target} stays standing.`}`,
    },
  ],
  turnEffects: [
    // Readied with the turn's attack, for the first hit that may carry it.
    { id: "stunning-strike-ready", span: 1 },
    { id: "stunning-strike", span: 1 },
    { id: "stunning-strike-slowed", span: 2, words: () => "Speed Halved", halvesSpeed: true },
    {
      id: "stunning-strike-opened",
      span: 2,
      words: () => "Open To The Next Attack",
      against: () => [{ mode: "advantage", from: "Stunning Strike" }],
      endsWhenAttacked: true,
    },
    // Addle lasts to the start of the target's next turn. The engine counts it to the round's end.
    { id: "addled", span: 1, words: () => "Addled", barsOpportunityAttacks: true },
  ],
  // Uncanny Metabolism, the first time Initiative is rolled with a Focus Point spent.
  initiative: (character, roll) => {
    const sheet = character.sheet
    const die = sheet && martialArtsDie(sheet)
    if (!sheet || !die || !hasFeature(character, "monk-uncanny-metabolism") || usesLeft(character, "monk-uncanny-metabolism") < 1 || !character.featureUses?.[FOCUS]) return character
    const { sides } = parseDice(die)
    const rolled = roll(sides)
    if (!Number.isInteger(rolled) || rolled < 1 || rolled > sides) throw new Error(`${rolled} is not a d${sides} roll.`)
    const { [FOCUS]: _, ...uses } = character.featureUses
    const restored = { ...character, featureUses: { ...uses, "monk-uncanny-metabolism": 1 } }
    return withHealing(restored as typeof restored & { type: string }, rolled + sheet.level)
  },
}
