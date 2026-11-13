import type { AbilityId, ConditionId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { z } from "zod"
import { isDown, isIncapacitated } from "../../utils/turn-actors"
import { parseDice, type Target } from "../attack"
import { type Check, type CheckResult, checkBonus, combineModes, type Roller, resolveCheck } from "../check"
import type { BonusActionRule, ClassRules, HitRider, HitRule, SaveRule } from "../class-rules"
import { checkModesFrom, hasCondition, immuneTo, saveFailedBy, withCondition } from "../conditions"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed } from "../feature-rules"
import { spendsLegendaryResistance, withLegendaryResistanceSpent } from "../legendary-resistance"
import { canReact } from "../reactions"
import type { Sheet } from "../sheet"
import { pushed, sizeOf, speedOf, walkOver } from "../space"
import { checkAdds, saveBonusFor, saveModesFor } from "../spell-effects"
import { combatStatsOf } from "../stat-block"

/**
 * The Rogue's features in play, levels 1 to 20, with the Thief.
 *
 * Sneak Attack: its dice, of the weapon's damage type, on a hit made with a Finesse or Ranged weapon and Advantage, or
 * with an ally beside the target and no Disadvantage, once a turn.
 * Cunning Action (level 2): the Dash, Disengage or Hide action as a Bonus Action.
 * Steady Aim (level 3): a Bonus Action for Advantage on the next attack roll this turn, for one who has not moved this
 * turn. Their Speed is then 0 for the rest of it.
 * Cunning Strike (level 5): an effect added to a Sneak Attack, paid for with its dice, each effect's cost from its
 * option's data. Trip: a target no bigger than Large saves with Dexterity or falls Prone. Withdraw: the Rogue moves
 * half their Speed straight back from the one struck, over the floor's solids, drawing no Opportunity Attacks. Poison
 * is not offered: it needs a Poisoner's Kit, and the sheet carries no tools.
 * Uncanny Dodge (level 5): a Reaction to halve a hit's damage, for one who can see the attacker.
 * Evasion (level 7): a Dexterity save for half damage takes none on a success and half on a failure (../save-rules).
 * Reliable Talent (level 7): on a check with a skill the Rogue is trained in, a d20 of 9 or lower counts as a 10. The
 * engine holds no tool proficiencies, so it reads skills alone.
 * Supreme Sneak (Thief, level 9): the Stealth Attack effect, offered while the Rogue has the Hide action's Invisible.
 * The attack does not end it when the Rogue stands behind Three-Quarters Cover from the one struck as the attack is
 * made: the engine reads the cover of the attack, not of the turn's end.
 * Improved Cunning Strike (level 11): a second, different effect on the same Sneak Attack, while its dice pay for both.
 * Use Magic Device (Thief, level 13): four magic items attuned at once (../items `attunementLimitOf`), and a d6 rolled
 * as an item's charges are spent, which keeps them on a 6. Its Spell Scrolls are not built: the engine runs no Spell Scroll.
 * Devious Strikes (level 14): Obscure, a Dexterity save or Blinded until the end of the target's next turn, and Knock
 * Out, a Constitution save or Unconscious for a minute, kept on the condition by the feature's id: it ends when its
 * bearer takes any damage, or on the save they repeat as each round turns. Daze is not offered: the engine cannot hold
 * an NPC's turn to only one of a move, an action and a Bonus Action.
 * Elusive (level 18): no attack roll against the Rogue has Advantage while they are not Incapacitated.
 * Stroke of Luck (level 20): a failed D20 Test turned into a 20, once a Short or Long Rest, by a plain rule: on a
 * failed save against harm, and on a failed check or save of the read whose failure costs the Rogue something, where
 * the 20 makes it succeed. An attack roll is not turned.
 * Slippery Mind's saves, the Expertise of level 6 and the Ability Score Improvements are the sheet's. Thief's Reflexes
 * is told: a round keeps one turn for each character, so a second turn in the first round has no place.
 */

/** Reliable Talent: "you can treat a d20 roll of 9 or lower as a 10." */
const RELIABLE_TALENT = 10

const CUNNING_STRIKE = "rogue-cunning-strike"
const IMPROVED_CUNNING_STRIKE = "rogue-improved-cunning-strike"
const DEVIOUS_STRIKES = "rogue-devious-strikes"
const SUPREME_SNEAK = "thief-supreme-sneak"
const ELUSIVE = "rogue-elusive"
const STROKE_OF_LUCK = "rogue-stroke-of-luck"
const USE_MAGIC_DEVICE = "thief-use-magic-device"

/** The Cunning Strike effects the engine runs, each with the feature whose options list it, in the order offered. */
const STRIKES = { trip: CUNNING_STRIKE, withdraw: CUNNING_STRIKE, obscure: DEVIOUS_STRIKES, "knock-out": DEVIOUS_STRIKES, "stealth-attack": SUPREME_SNEAK } as const
export type CunningStrike = keyof typeof STRIKES
export const cunningStrikes = Object.keys(STRIKES) as CunningStrike[]

/** What each effect is for, in the read's words. */
const STRIKE_WORDS: Record<CunningStrike, string> = {
  trip: "to knock the target down",
  withdraw: "to slip back out of reach right after the strike",
  obscure: "to blind the target for a moment, with grit or blood in the eyes",
  "knock-out": "to knock the target out cold",
  "stealth-attack": "to strike from hiding and stay hidden",
}

/** An effect's die cost, the Sneak Attack dice it forgoes, from its option's data: Knock Out's 6d6 is 6. */
export const strikeCost = (effect: CunningStrike): number => classFeatureById.get(STRIKES[effect])?.options?.find((option) => option.id === effect)?.spend?.amount ?? 1

// Whether a character has the Invisible condition of the Hide action, which no spell gave.
const hiding = (character: Roller): boolean => !!character.conditions?.some((entry) => entry.id === "invisible" && !entry.spell)

/** The Cunning Strike effects a hero can add now: each whose feature they have, and Stealth Attack only while hidden. */
export const cunningStrikesOf = (character: Roller): CunningStrike[] => cunningStrikes.filter((effect) => hasFeature(character, STRIKES[effect]) && (effect !== "stealth-attack" || hiding(character)))

/** How many Sneak Attack dice a Rogue rolls at their level: 7 at level 14. */
export function sneakDice(character: Roller): number {
  const sheet = character.sheet
  const dice = sheet ? classById.get(sheet.class)?.levels[sheet.level - 1]?.sneakAttack : undefined
  return dice ? parseDice(dice).count : 0
}

/**
 * The Cunning Strike effects an attack carries that its Rogue can add, in order: "cunning", and with Improved Cunning
 * Strike a second, different one in "cunning2". Each is taken while the dice left pay its cost, from `dice`.
 */
export function cunningPicked(character: Roller, choices: Readonly<Record<string, string>> | undefined, dice = sneakDice(character)): CunningStrike[] {
  const offered = cunningStrikesOf(character)
  const asked = [choices?.cunning, hasFeature(character, IMPROVED_CUNNING_STRIKE) ? choices?.cunning2 : undefined]
  const picked: CunningStrike[] = []
  let left = dice
  for (const value of asked) {
    const effect = offered.find((id) => id === value)
    if (!effect || picked.includes(effect) || strikeCost(effect) > left) continue
    left -= strikeCost(effect)
    picked.push(effect)
  }
  return picked
}

/** The Difficulty Class of a Rogue's Cunning Strike save: 8, the Dexterity modifier and the Proficiency Bonus. */
export function cunningStrikeDc(sheet: Sheet): number {
  const derived = deriveSheet(sheet)
  return 8 + derived.abilityModifiers.dex + derived.proficiencyBonus
}

// The sizes a Trip can knock Prone.
const TRIPPED_SIZES: readonly string[] = ["Tiny", "Small", "Medium", "Large"]

/**
 * A save against a Rogue's Cunning Strike, rolled for its target, with what the target's conditions, spells and items
 * give it. `against` names the conditions it is made to avoid. A Legendary creature that fails it may choose to
 * succeed where it would be put out of the fight (../legendary-resistance): `resisted` says so.
 */
function strikeSave<T extends Target>(rogue: Roller, target: T, ability: AbilityId, against: readonly ConditionId[], d20: () => number, roll: (sides: number) => number) {
  const check = { kind: "save" as const, ability }
  const mode = combineModes([...checkModesFrom(target, check), ...saveModesFor(target, check, [...against])].map((source) => source.mode))
  const save = resolveCheck({
    dice: mode === "normal" ? [d20()] : [d20(), d20()],
    bonus: checkBonus(target, check) + saveBonusFor(target, check),
    dc: cunningStrikeDc(rogue.sheet as Sheet),
    mode,
    fails: !!saveFailedBy(target, check),
    adds: checkAdds(target, check, roll),
  })
  const resisted = !save.success && spendsLegendaryResistance(target, { conditions: against })
  return { save, resisted, target: resisted ? withLegendaryResistanceSpent(target) : target }
}

// The two turns a Blinded lasts "until the end of its next turn", or one before the target has acted this round.
const acted = (target: object) => !!(target as { isComplete?: boolean }).isComplete

/**
 * What one Cunning Strike effect does to the one struck, after the attack's damage. Withdraw and Stealth Attack move or
 * keep the Rogue, which ./actions `afterRoll` settles (`attackRolled`, `staysHidden`): their rider only tells it.
 */
function strikeEffect<T extends Target>(id: string, effect: CunningStrike, rogue: Roller, target: T, roll: (sides: number) => number) {
  const by = rogue.id ?? ""
  if (effect === "withdraw" || effect === "stealth-attack") return { target, rider: { id, effect, took: true }, conditions: [] }
  if (isDown(target)) return undefined
  const d20 = () => roll(20)
  if (effect === "trip") {
    const { save } = strikeSave(rogue, target, "dex", ["prone"], d20, roll)
    const given = TRIPPED_SIZES.includes(sizeOf(target)) && !save.success ? withCondition(target, { id: "prone" }) : undefined
    return {
      target: given?.given ? given.character : target,
      rider: { id, effect, save, took: !!given?.given },
      conditions: given?.given ? [{ target: target.id ?? "", condition: "prone" as const }] : [],
    }
  }
  const condition: ConditionId = effect === "obscure" ? "blinded" : "unconscious"
  const thrown = strikeSave(rogue, target, effect === "obscure" ? "dex" : "con", [condition], d20, roll)
  const given =
    thrown.save.success || thrown.resisted
      ? undefined
      : effect === "obscure"
        ? withCondition(thrown.target, { id: condition, source: by, span: "turn" }, { acted: acted(target) })
        : // Knock Out: "for 1 minute or until it takes any damage", kept by the feature's id, so its own rules end it.
          withCondition(thrown.target, { id: condition, source: by, span: "minute", feature: DEVIOUS_STRIKES }, { acted: acted(target) })
  return {
    target: given?.given ? given.character : thrown.target,
    rider: { id, effect: thrown.resisted ? `${effect}-resisted` : effect, save: thrown.save, took: !!given?.given },
    conditions: given?.given ? [{ target: target.id ?? "", condition }] : [],
  }
}

/** A Cunning Strike in the story's words, at the end of the hit's facts. */
function strikeWords(attacker: string, target: string, rider: HitRider): string {
  const save = rider.save ? ` (${rider.save.total} against DC ${rider.save.dc})` : ""
  if (rider.effect === "withdraw") return ` ${attacker} slips back with a Cunning Strike's Withdraw, half their Speed, drawing no Opportunity Attacks.`
  if (rider.effect === "stealth-attack") return ` ${attacker} makes it a Stealth Attack: they stay hidden while they keep behind Three-Quarters Cover.`
  if (rider.effect === "trip") return ` ${attacker}'s Cunning Strike tries to Trip ${target}: ${rider.took ? `${target} fails the Dexterity save and falls Prone.` : `${target} stays standing.`}`
  if (rider.effect === "obscure")
    return ` ${attacker}'s Cunning Strike tries to Obscure ${target}'s sight: ${rider.took ? `${target} fails the Dexterity save${save} and is Blinded until the end of their next turn.` : `${target} keeps their sight${save}.`}`
  if (rider.effect === "knock-out")
    return ` ${attacker}'s Cunning Strike tries to Knock Out ${target}: ${rider.took ? `${target} fails the Constitution save${save} and falls Unconscious for up to a minute, until they take any damage or shake it off.` : `${target} stays conscious${save}.`}`
  if (rider.effect === "knock-out-resisted")
    return ` ${attacker}'s Cunning Strike tries to Knock Out ${target}: ${target} fails the Constitution save${save} and chooses to succeed instead (Legendary Resistance).`
  return ""
}

// The hit rule of the first or the second Cunning Strike effect, each after the damage of a Sneak Attack.
const cunningStrike = (index: 0 | 1): HitRule => {
  const id = index === 0 ? "cunning-strike" : "cunning-strike-2"
  return {
    id,
    after: ({ attacker, target, added, choices, roll }) => {
      if (!added.includes("Sneak Attack") || !attacker.sheet) return undefined
      const effect = cunningPicked(attacker, choices)[index]
      return effect ? strikeEffect(id, effect, attacker, target, roll) : undefined
    },
    words: strikeWords,
  }
}

// Whether this turn's Sneak Attack has landed, on the Rogue's own turn: the mark it left (`sneak-attack`).
const sneakLanded = (character: Roller & { turnEffects?: Parameters<typeof usedThisTurn>[0]["turnEffects"] }): boolean => !!character.id && usedThisTurn(character, "sneak-attack", character.id)

/** Whether Uncanny Dodge matters against a hit: the damage the target would take is a quarter of their hit point
 * maximum or more, or would drop them. A hero with 12 hit points of 12 minds 3 and not 2, and with 2 left minds 2.
 */
export function uncannyDodgeMatters(target: Roller & { hitPoints?: number; tempHitPoints?: number }, damage: number): boolean {
  const maximum = combatStatsOf(target)?.hitPointMaximum
  if (!maximum) return false
  const left = Math.min(maximum, target.hitPoints ?? maximum) + (target.tempHitPoints ?? 0)
  return damage * 4 >= maximum || damage >= left
}

/** Whether a hero may halve a hit's damage with Uncanny Dodge: a Rogue of level 5 who can react and can see the attacker. */
export function uncannyDodgeOffer(target: Parameters<typeof canReact>[0], attacker: Roller): boolean {
  return hasFeature(target, "rogue-uncanny-dodge") && canReact(target) && !hasCondition(target, "blinded") && !hasCondition(attacker, "invisible")
}

/**
 * Stroke of Luck on a failed D20 Test: the d20 counts as a 20, with what was added to it kept. The engine uses it by a
 * plain rule, as a player would, only where the 20 makes the roll succeed, and never on a save the hero's conditions
 * fail outright. None when it is not used.
 */
export function strokeOfLuck(character: Roller & { featureUses?: Record<string, number> }, check: Check, result: CheckResult): CheckResult | undefined {
  if (result.success || !hasFeature(character, STROKE_OF_LUCK) || usesLeft(character, STROKE_OF_LUCK) < 1 || saveFailedBy(character, check)) return undefined
  const kept = (result.adds ?? []).reduce((sum, add) => sum + add.amount, 0)
  if (20 + result.bonus + kept < result.dc) return undefined
  return resolveCheck({ dice: result.mode === "normal" ? [20] : [20, 20], bonus: result.bonus, dc: result.dc, mode: result.mode, adds: result.adds })
}

/** Stroke of Luck on a failed save against harm (../save-rules `rescuedSave`): a failure that costs damage or a condition the hero is not immune to. */
const luckySave: SaveRule = ({ character, ability, result, stakes }) => {
  if (!stakes.damage && !(stakes.conditions ?? []).some((id) => !immuneTo(character, id))) return undefined
  const lucky = strokeOfLuck(character, { kind: "save", ability }, result)
  return lucky && { result: lucky, feature: STROKE_OF_LUCK, name: classFeatureById.get(STROKE_OF_LUCK)?.name ?? "Stroke of Luck" }
}

// Cunning Action's three, each the action it takes.
const cunning = (id: string, action: string): BonusActionRule => ({
  id,
  feature: "rogue-cunning-action",
  name: `Cunning Action: ${action}`,
  note: "Cunning Action is a Dash, Disengage or Hide taken as a Bonus Action, beside the action: a dash before a strike, slipping away after it, ducking out of sight after a shot.",
  use: ({ characters, actor }) => ({ characters, use: { feature: id, name: "Cunning Action", fact: `${actor.name} takes the ${action} action as a Bonus Action.` } }),
})

// The read's words for the effects offered: "trip" to knock the target down, or "withdraw" to slip back.
const offeredWords = (values: readonly string[]) => {
  const said = values.map((id) => `"${id}" ${STRIKE_WORDS[id as CunningStrike] ?? ""}`.trim())
  return said.length > 1 ? `${said.slice(0, -1).join(", ")}, or ${said.at(-1)}` : (said[0] ?? "")
}

export const rogue: ClassRules = {
  class: "rogue",
  bonusActions: [
    { ...cunning("cunning-action-dash", "Dash"), dash: true },
    { ...cunning("cunning-action-disengage", "Disengage"), disengages: () => true },
    { ...cunning("cunning-action-hide", "Hide"), follow: "hide" },
    {
      id: "rogue-steady-aim",
      feature: "rogue-steady-aim",
      note: "rogue-steady-aim is for a character who holds still to aim before an attack this turn. It cannot be taken with a move.",
      still: true,
      attackModes: [{ mode: "advantage", from: "Steady Aim" }],
      use: ({ characters, actor, action }) => ({ characters, use: { feature: action.id, name: action.name, fact: `${actor.name} holds still and takes Steady Aim.` } }),
    },
  ],
  choices: [
    {
      key: "cunning",
      offer: (character) => {
        const offered = cunningStrikesOf(character)
        return offered.length ? offered : undefined
      },
      prompt: (values) =>
        `   - CUNNING STRIKE: with an attack that may land a Sneak Attack, "cunning" is ${offeredWords(values as readonly string[])}, when the player's words try for it. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For an attack: the Cunning Strike effect added to a Sneak Attack"),
      rides: "attack",
    },
    {
      key: "cunning2",
      offer: (character) => {
        const offered = hasFeature(character, IMPROVED_CUNNING_STRIKE) ? cunningStrikesOf(character) : []
        return offered.length > 1 ? offered : undefined
      },
      prompt: () =>
        `   - SECOND CUNNING STRIKE: "cunning2" is a second, different effect from the same list, only when the player's words try for both at once. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For an attack: a second, different Cunning Strike effect added to the same Sneak Attack"),
      rides: "attack",
    },
  ],
  reactions: [
    {
      id: "uncanny-dodge",
      name: "Uncanny Dodge",
      has: (character) => hasFeature(character, "rogue-uncanny-dodge"),
      // Once the damage is known: half of it, rounded down.
      onDamage: ({ target, attacker, taken, hit, ask }) => {
        if (!uncannyDodgeOffer(target, attacker)) return undefined
        const half = Math.floor(taken / 2)
        if (!ask(uncannyDodgeMatters(target, taken), `${hit} It deals ${taken} damage. Uncanny Dodge would halve it to ${half}.`)) return undefined
        return { taken: half, reaction: { by: target.id, id: "uncanny-dodge", name: "Uncanny Dodge", text: `${target.name} uses Uncanny Dodge and takes ${half} of ${taken}.` } }
      },
      damageWords: (target) => ` ${target} halves it with Uncanny Dodge.`,
    },
  ],
  hits: [
    {
      id: "sneak-attack",
      damage: ({ attacker, weapon, roll, allyBeside, turnOf, choices }) => {
        if (!attacker.sheet || !weapon) return undefined
        const sneaking = roll.mode === "advantage" || (allyBeside && roll.mode !== "disadvantage")
        const fits = weapon.attackType === "ranged" || (weapon.properties ?? []).some((property) => property === "finesse")
        if (!sneaking || !fits || !hasFeature(attacker, "rogue-sneak-attack") || usedThisTurn(attacker, "sneak-attack", turnOf)) return undefined
        const count = sneakDice(attacker)
        if (!count) return undefined
        const sides = parseDice(classById.get(attacker.sheet.class)?.levels[attacker.sheet.level - 1]?.sneakAttack ?? "1d6").sides
        // Each Cunning Strike forgoes its dice before the roll: Trip on 3d6 rolls 2d6, Knock Out on 7d6 rolls 1d6.
        const dice = count - cunningPicked(attacker, choices, count).reduce((sum, effect) => sum + strikeCost(effect), 0)
        return { name: "Sneak Attack", damage: dice > 0 ? { dice: `${dice}d${sides}`, type: weapon.damage.type } : { amount: 0, type: weapon.damage.type }, once: "sneak-attack" }
      },
    },
    cunningStrike(0),
    cunningStrike(1),
  ],
  turnEffects: [{ id: "sneak-attack", span: 1 }],
  // Withdraw: right after the attack, half the Speed straight back from the one struck, as far as the first solid
  // thing, with no Opportunity Attacks: the position is set, not walked.
  attackRolled: (attacker, target, made) => {
    if (!made || made.dealt <= 0 || !sneakLanded(attacker) || !attacker.position || !target.position) return attacker
    if (!cunningPicked(attacker, made.attack.choices).includes("withdraw")) return attacker
    const feet = Math.floor((speedOf(attacker) ?? 0) / 2)
    const to = pushed(attacker.position, target.position, feet)
    return { ...attacker, position: made.floor ? walkOver(made.floor.solids, attacker.position, to, feet).at : to }
  },
  staysHidden: (attacker, made) => made.dealt > 0 && made.attack.cover === "three-quarters" && sneakLanded(attacker) && cunningPicked(attacker, made.attack.choices).includes("stealth-attack"),
  // Knock Out's Unconscious ends "until it takes any damage".
  endsOnDamage: (entry) => entry.feature === DEVIOUS_STRIKES,
  // Knock Out: "The Unconscious target repeats the save at the end of each of its turns, ending the effect on itself on
  // a success", against the DC of the Rogue who gave it while they are here.
  roundStart: (character, round) => {
    const held = character.conditions?.find((entry) => entry.id === "unconscious" && entry.feature === DEVIOUS_STRIKES)
    const rogue = held && round?.everyone.find((other) => other.id === held.source)
    if (!round || !held || !rogue?.sheet || isDown(character as Parameters<typeof isDown>[0])) return { character }
    const thrown = strikeSave(rogue, character as unknown as Target, "con", ["unconscious"], round.d20, round.roll)
    const name = character.name ?? "The target"
    const verdict = `${name} repeats the Constitution save against Knock Out (${thrown.save.total} against DC ${thrown.save.dc})`
    if (!thrown.save.success && !thrown.resisted) return { character, told: { name: "Knock Out", text: `${verdict} and fails: they stay Unconscious.` } }
    const woken = thrown.target as unknown as typeof character
    const conditions = (woken.conditions ?? []).filter((entry) => entry !== held)
    const { conditions: _, ...rest } = woken
    return {
      character: (conditions.length ? { ...rest, conditions } : rest) as typeof character,
      told: { name: "Knock Out", text: thrown.resisted ? `${verdict}, fails, and chooses to succeed instead (Legendary Resistance): they wake.` : `${verdict} and succeeds: they wake.` },
    }
  },
  evasion: (character) => hasFeature(character, "rogue-evasion"),
  d20Floor: (character, check) =>
    check.kind === "skill" && character.sheet && hasFeature(character, "rogue-reliable-talent") && deriveSheet(character.sheet).skills[check.skill].proficient ? RELIABLE_TALENT : undefined,
  advantageBarred: (target) => (hasFeature(target, ELUSIVE) && !isIncapacitated(target) ? (classFeatureById.get(ELUSIVE)?.name ?? "Elusive") : undefined),
  saves: [luckySave],
  checks: [
    ({ character, check, result, staked }) => {
      const lucky = staked ? strokeOfLuck(character, check, result) : undefined
      return lucky && { result: lucky, after: (spender) => withFeatureUsed(spender, STROKE_OF_LUCK) }
    },
  ],
  // Use Magic Device: "roll 1d6. On a roll of 6, you use the property without expending the charges."
  keepsCharges: (character, roll) => {
    if (!hasFeature(character, USE_MAGIC_DEVICE)) return undefined
    const die = roll(6)
    return { kept: die === 6, text: `Use Magic Device's d6 rolls ${die}${die === 6 ? ": no charge is spent." : "."}` }
  },
}
