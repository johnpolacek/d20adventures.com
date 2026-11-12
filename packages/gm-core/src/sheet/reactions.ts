import { classById } from "@d20/srd/classes"
import { monsterById } from "@d20/srd/monsters"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import { type ActorLike, findCurrentActor, hasFled, isDown, isIncapacitated } from "../utils/turn-actors"
import {
  type Attack,
  againstArmorClass,
  attacksOf,
  type CunningStrike,
  hitsAnyway,
  landBlow,
  meleeReachOf,
  parseDice,
  type RolledAttack,
  rollAttack,
  type Strike,
  strike,
  strikeFacts,
  type Target,
  UNARMED_STRIKE,
} from "./attack"
import { type CheckResult, type RollMode, rollModes } from "./check"
import { cannotAttack, hasCondition } from "./conditions"
import type { DeathRules } from "./death"
import { hasFeature, withUsedThisTurn } from "./feature-rules"
import { inspirationUse, withInspirationSpent } from "./features"
import { type Cover, distance, opportunityAttackers, type Point, placedOf, type Standing, sizeOf, type Watcher, within } from "./space"
import { cannotReactBySpell, spellEffectsAfterMove, withSpellEffect } from "./spell-effects"
import { type CastCost, castCost, spellsOf, withCastSpent } from "./spells"
import { combatStatsOf, DEFAULT_STAT_BLOCK } from "./stat-block"
import { type Order, orderSchema, type ReactionId, reactionIdSchema, reactionIds, type SpellEffect, type StandingOrders, standingOrdersSchema, type TurnEffect } from "./turn-effect"

/**
 * Reactions by the SRD 5.2.1 rules, as pure functions. A Reaction is an instant response to a trigger, on anyone's
 * turn. Once one is taken, the one who took it takes no other until the start of their next turn. The engine starts
 * everyone's round at once, so a Reaction comes back as the next round begins. Nothing here asks a model or a player:
 * the turn flow offers a reaction, and a standing order answers when no one does.
 */

/** Who may take a Reaction: one who stands somewhere and may have taken one already. */
type Reactor = Standing & { id: string; hitPoints?: number; healthPercent?: number; dead?: true; fled?: true; turnEffects?: readonly TurnEffect[]; spellEffects?: readonly SpellEffect[] }

/** One who may cast a spell as a Reaction: their slots and uses are spent by it. */
type Caster = Reactor & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

/** Whether a character has taken their Reaction this round. */
export const hasReacted = (character: { turnEffects?: readonly TurnEffect[] }): boolean => !!character.turnEffects?.some((effect) => effect.id === "reacted")

/**
 * Whether a character can take a Reaction now: up, still here, not Incapacitated, not under Slow, and with none taken
 * this round. A Bandit who made an Opportunity Attack this round cannot make another until the next round begins.
 */
export const canReact = (character: Reactor): boolean => !isDown(character) && !hasFled(character) && !isIncapacitated(character) && !hasReacted(character) && !cannotReactBySpell(character)

/** A character who has taken their Reaction. It lasts this round, and the next round's start ends it. */
export function withReaction<T extends Reactor>(character: T): T {
  return { ...character, turnEffects: [...(character.turnEffects ?? []).filter((effect) => effect.id !== "reacted"), { id: "reacted", by: character.id, turns: 1 }] }
}

// The average of an attack's damage: 1d8 + 1 is 5.5.
const averageDamage = (attack: Attack): number =>
  attack.damage.reduce((sum, part) => {
    if (!part.dice) return sum + (part.amount ?? 0)
    const { count, sides, bonus } = parseDice(part.dice)
    return sum + (count * (sides + 1)) / 2 + bonus
  }, 0)

/**
 * The attack a character makes an Opportunity Attack with: one melee attack, with a weapon or an Unarmed Strike. The
 * attack falls right before the mover leaves the character's reach, so it is made with an attack that reaches that far,
 * the one with the highest average damage. A hero with a Glaive and a Dagger uses the Glaive, which reaches 10 feet. A
 * hero with only a bow uses an Unarmed Strike. An NPC whose stat block prints no melee attack has none.
 */
export function opportunityWeapon(character: Standing): Attack | undefined {
  const reach = meleeReachOf(character)
  const melee = attacksOf(character).filter((attack) => attack.reach !== undefined && attack.reach >= reach)
  return melee.reduce<Attack | undefined>((best, attack) => (!best || averageDamage(attack) > averageDamage(best) ? attack : best), undefined) ?? melee.find((attack) => attack.id === UNARMED_STRIKE)
}

/**
 * Who may make an Opportunity Attack on a move, and with which attack. One of the other kind, hero or NPC, who can
 * react, can see the mover, is not Charmed by them, and whose reach the move leaves. No one may when the mover took the
 * Disengage action, Teleports, or is moved without their own movement. A Bandit beside a hero who walks 20 feet away
 * may, with its Scimitar. The same Bandit Blinded, or with its Reaction spent, may not.
 */
export function opportunityAttacks<T extends Reactor>(args: {
  mover: T
  from: Point
  to: Point
  everyone: readonly T[]
  disengaged?: boolean
  forced?: boolean
  teleport?: boolean
}): { attacker: T; weapon: string }[] {
  const { mover } = args
  const watchers = args.everyone.flatMap((other): (Watcher & { other: T; weapon: string })[] => {
    const placed = placedOf(other)
    const weapon = other.id !== mover.id && placed ? opportunityWeapon(other) : undefined
    if (!placed || !weapon) return []
    return [
      {
        ...placed,
        other,
        weapon: weapon.id,
        reach: meleeReachOf(other),
        hostile: other.type !== mover.type,
        canReact: canReact(other) && !cannotAttack(other, mover),
        seesMover: !hasCondition(other, "blinded") && !hasCondition(mover, "invisible"),
      },
    ]
  })
  const move = { from: args.from, to: args.to, size: sizeOf(mover), disengaged: args.disengaged, forced: args.forced, teleport: args.teleport }
  return opportunityAttackers(move, watchers).map((watcher) => ({ attacker: watcher.other, weapon: watcher.weapon }))
}

/**
 * An Opportunity Attack made: one melee attack by the usual rules, at the mover as they stand right before they leave
 * the attacker's reach, and the attacker's Reaction is spent. The attacker and the target come back as it left them,
 * with the strike and its facts for the game master.
 */
export function resolveOpportunityAttack<A extends Reactor, T extends Target>(args: {
  attacker: A
  target: T
  weapon: string
  dice: readonly number[]
  roll: (sides: number) => number
  mode?: RollMode
  rules?: DeathRules
  cover?: Cover
  present?: readonly (Standing & { hitPoints?: number; dead?: true; fled?: true })[]
}): { blow: Strike; attacker: A; target: T; fact: string } {
  const { target, ...blow } = strike(args)
  const attacker = args.attacker.name ?? "The attacker"
  return { blow, attacker: withReaction(args.attacker), target, fact: `${attacker} makes an Opportunity Attack. ${strikeFacts(attacker, args.target.name ?? "the target", blow)}` }
}

/** What the Shield spell adds to Armor Class, from its typed data: 5. */
export const SHIELD_BONUS = spellById.get("shield")?.ac?.bonus ?? 5

/** Whether the Shield spell is on a character: until the start of their next turn, Magic Missile does them no damage. */
export const immuneToMagicMissile = (character: { spellEffects?: readonly { spell: string }[] }): boolean => !!character.spellEffects?.some((effect) => effect.spell === "shield")

/** A stat block's reaction the engine can run: Parry, with the Armor Class it adds, or Protective Magic's Shield, with its uses. */
export type MonsterReaction = { id: "parry"; name: string; bonus: number } | { id: "shield"; name: string; uses?: number; left?: number }

/**
 * The reactions an NPC's stat block gives that the engine can run. Parry: when hit by a melee attack roll while holding
 * a weapon, it adds the number its text prints to its Armor Class against that attack. The data does not type the
 * number, so it is read from "adds 2 to its AC". A creature with a melee attack is taken to hold a weapon. Protective
 * Magic: a Mage casts Shield, 3 times a day, counted in its uses under the reaction's name. A Bandit Captain parries for
 * 2. A hero has none here.
 */
export function monsterReactions(character: Caster): MonsterReaction[] {
  const monster = character.type === "npc" && !character.sheet ? (monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)) : undefined
  return (monster?.reactions ?? []).flatMap((reaction): MonsterReaction[] => {
    const parry = reaction.name === "Parry" ? /adds (\d+) to its AC against that attack/.exec(reaction.text) : null
    if (parry) return attacksOf(character).some((attack) => attack.reach !== undefined) ? [{ id: "parry", name: reaction.name, bonus: Number(parry[1]) }] : []
    if (!reaction.spellcasting?.spells?.some((spell) => spell.id === "shield")) return []
    const count = reaction.uses?.count
    if (typeof count !== "number") return [{ id: "shield", name: reaction.name }]
    return [{ id: "shield", name: reaction.name, uses: count, left: Math.max(0, count - (character.featureUses?.[reaction.name] ?? 0)) }]
  })
}

// What casting Shield would spend: a hero's slot or free cast, or a stat block's Protective Magic use.
function shieldCost(character: Caster): CastCost | undefined {
  const cast = castCost(character, "shield")
  if ("cost" in cast) return cast.cost
  const magic = monsterReactions(character).find((reaction) => reaction.id === "shield")
  if (!magic || magic.id !== "shield" || magic.left === 0) return undefined
  // A Lich's Protective Magic prints no count: it spends nothing, as a cantrip does.
  return magic.uses === undefined ? { kind: "cantrip" } : { kind: "free", feature: magic.name }
}

/** A reaction that raises Armor Class against a hit: the Armor Class it makes, and whether that turns the hit into a miss. */
export type ArmorOffer = { armorClass: number; matters: boolean }

/**
 * Whether the one hit may cast Shield in answer: they have it prepared, a slot or a free cast to pay for it, their
 * Reaction, and no Shield on them already. `matters` says whether its 5 turns the hit into a miss: the roll is not a
 * 20 on the die and its total is below their Armor Class plus 5. A 14 against Armor Class 12 matters, and a 17 does not.
 * `armorClass` is what to read the roll against again (./attack `againstArmorClass`).
 */
export function shieldOffer(target: Caster, rolled: RolledAttack): (ArmorOffer & { cost: CastCost }) | undefined {
  if (!rolled.roll.hit || !canReact(target) || immuneToMagicMissile(target)) return undefined
  const cost = shieldCost(target)
  if (!cost) return undefined
  const armorClass = rolled.roll.armorClass + SHIELD_BONUS
  return { cost, armorClass, matters: !hitsAnyway(rolled.roll) && rolled.roll.total < armorClass }
}

/**
 * The target after casting Shield: the slot or use spent, the Reaction taken, and the spell on them until their next
 * turn. Its 5 reaches their Armor Class through the engine's lasting spells, against every attack until it ends. The
 * triggering attack, already rolled, is read again with `againstArmorClass`.
 */
export function withShield<T extends Caster>(target: T): T {
  const cost = shieldCost(target)
  if (!cost) throw new Error(`${target.name ?? "This character"} cannot cast Shield.`)
  return withSpellEffect(withReaction(withCastSpent(target, cost)), { spell: "shield", by: target.id, turns: 1 })
}

/**
 * Shield against Magic Missile: "you take no damage from Magic Missile". Each one the darts are aimed at who may cast
 * Shield (`shieldOffer`'s test, with no roll to read) is offered it through `ask`, and it always matters: it turns
 * every dart. Each who takes it spends their slot or use and their Reaction, and bears Shield until their next turn,
 * which keeps the darts off them (./spells `castSpell`). Everyone comes back as it left them, with the reactions taken.
 */
export function shieldAgainstMagicMissile<T extends Caster & { name?: string }>(args: {
  characters: readonly T[]
  casterId: string
  targets: readonly string[]
  ask: Ask
}): { characters: T[]; reactions: ReactionTaken[] } {
  let characters = [...args.characters]
  const reactions: ReactionTaken[] = []
  const caster = characters.find((character) => character.id === args.casterId)
  for (const id of new Set(args.targets)) {
    const target = characters.find((character) => character.id === id)
    if (!caster || !target || target.id === caster.id || !canReact(target) || immuneToMagicMissile(target) || !shieldCost(target)) continue
    const text = `${caster.name ?? "A caster"} casts Magic Missile at ${target.name ?? "them"}. Shield would keep every dart off them.`
    if (!args.ask({ id: "shield", to: target.id, from: caster.id, weapon: "magic-missile", matters: true }, text)) continue
    const shielded = withShield(target)
    characters = characters.map((character) => (character.id === shielded.id ? shielded : character))
    const armorClass = combatStatsOf(shielded)?.armorClass
    reactions.push({
      by: target.id,
      id: "shield",
      name: "Shield",
      text: `${target.name ?? "They"} casts Shield: no damage from Magic Missile${armorClass === undefined ? "" : `, and Armor Class ${armorClass}`} until their next turn.`,
    })
  }
  return { characters, reactions }
}

/**
 * Whether the one hit may Parry: their stat block gives Parry, they can react, and the hit is a melee attack roll. A
 * Dagger thrown from beyond reach is not. `matters` says whether the bonus turns the hit into a miss. A Bandit Captain,
 * Armor Class 15, parries a 16 into a miss against 17, and cannot parry a 20 on the die. The Reaction is spent with
 * `withReaction`. The bonus is against this attack alone, so nothing lasts.
 */
export function parryOffer(target: Caster, rolled: RolledAttack, attacker?: Standing): (ArmorOffer & { bonus: number }) | undefined {
  const parry = monsterReactions(target).find((reaction) => reaction.id === "parry")
  if (!parry || parry.id !== "parry" || !rolled.roll.hit || !canReact(target)) return undefined
  const { attack } = rolled
  const from = attacker && placedOf(attacker)
  const at = placedOf(target)
  const melee = attack.kind === "melee" || (attack.kind === "melee-or-ranged" && (!from || !at || within(from, at, attack.reach ?? 5)))
  if (!melee) return undefined
  const armorClass = rolled.roll.armorClass + parry.bonus
  return { bonus: parry.bonus, armorClass, matters: !hitsAnyway(rolled.roll) && rolled.roll.total < armorClass }
}

export { type Order, orderSchema, type ReactionId, reactionIdSchema, reactionIds, type StandingOrders, standingOrdersSchema }

/**
 * The reactions a hero can take, for the sheet and their standing orders: every hero's Opportunity Attack, Shield when
 * it is prepared, a Rogue's Uncanny Dodge, a College of Lore Bard's Cutting Words. An NPC's are its stat block's.
 */
export function reactionsOf(character: Caster): ReactionId[] {
  if (!character.sheet) return ["opportunity-attack", ...monsterReactions(character).map((reaction) => reaction.id)]
  return [
    "opportunity-attack",
    ...(spellsOf(character).some((known) => known.spell.id === "shield" && known.prepared) ? (["shield"] as const) : []),
    ...(hasFeature(character, "rogue-uncanny-dodge") ? (["uncanny-dodge"] as const) : []),
    ...(hasFeature(character, "college-of-lore-cutting-words") ? (["cutting-words"] as const) : []),
  ]
}

/** The default orders: take every Opportunity Attack, and the rest only when they matter. */
export const DEFAULT_ORDERS: Record<ReactionId, Order> = {
  "opportunity-attack": "always",
  shield: "when-it-matters",
  parry: "when-it-matters",
  "uncanny-dodge": "when-it-matters",
  counterspell: "when-it-matters",
  "cutting-words": "when-it-matters",
}

/**
 * The answer a standing order gives to an offer: always is yes, never is no, and when-it-matters is whether it matters.
 * An Opportunity Attack always matters. With no orders, Shield is cast on a 14 against Armor Class 12 and not on a 17.
 */
export function ordered(orders: StandingOrders | undefined, id: ReactionId, matters: boolean): boolean {
  const order = orders?.[id] ?? DEFAULT_ORDERS[id]
  return order === "always" || (order === "when-it-matters" && (id === "opportunity-attack" || matters))
}

/**
 * Whether Uncanny Dodge matters against a hit: the damage the target would take is a quarter of their hit point
 * maximum or more, or would drop them. A hero with 12 hit points of 12 minds 3 and not 2, and with 2 left minds 2.
 */
export function uncannyDodgeMatters(target: { type?: string; sheet?: Target["sheet"]; statBlock?: string; hitPoints?: number; tempHitPoints?: number }, damage: number): boolean {
  const maximum = combatStatsOf(target)?.hitPointMaximum
  if (!maximum) return false
  const left = Math.min(maximum, target.hitPoints ?? maximum) + (target.tempHitPoints ?? 0)
  return damage * 4 >= maximum || damage >= left
}

/** An attack roll kept as plain data, as ./attack `resolveAttack` makes it. */
const attackRollSchema = z.strictObject({
  dice: z.array(z.number().int().min(1).max(20)),
  natural: z.number().int().min(1).max(20),
  bonus: z.number().int(),
  total: z.number().int(),
  armorClass: z.number().int(),
  hit: z.boolean(),
  critical: z.boolean(),
  mode: z.enum(rollModes),
  adds: z.array(z.strictObject({ from: z.string(), amount: z.number().int() })).optional(),
})

/**
 * A reaction offered and not yet answered, as the turn flow keeps it while it waits on a player. `to` is who may react
 * and `from` whose act set it off: the mover for an Opportunity Attack, the attacker for Shield, Parry or Uncanny
 * Dodge. `weapon` is the reactor's attack for an Opportunity Attack, and the attacker's for the others, whose rolled
 * attack is `roll`. `inspired` is a Bardic Inspiration die already in the roll's total.
 */
export const reactionOfferSchema = z.strictObject({
  id: reactionIdSchema,
  to: z.string(),
  from: z.string(),
  weapon: z.string().optional(),
  roll: attackRollSchema.optional(),
  inspired: z.number().int().optional(),
  /** Whether it matters, so a standing order can answer it. */
  matters: z.boolean(),
})
export type ReactionOffer = z.infer<typeof reactionOfferSchema>

/** The rolled attack an offer holds, made whole again from the attacker who rolled it. None when the offer holds no roll, or the attacker has no such attack. */
export function offeredAttack(offer: ReactionOffer, attacker: Standing): RolledAttack | undefined {
  const attack = offer.roll && attacksOf(attacker).find((entry) => entry.id === offer.weapon)
  if (!attack || !offer.roll) return undefined
  return { attack, roll: offer.roll, ...(offer.inspired !== undefined ? { inspired: offer.inspired } : {}) }
}

/**
 * How an offer is answered while a turn is resolved: taken or not. For an NPC it is the standing order, at once. For a
 * player's hero the turn flow may stop here to ask, and play the turn again from its start when the answer comes.
 * `text` is the offer in words, for the screen.
 */
export type Ask = (offer: ReactionOffer, text: string) => boolean

/** A reaction taken, for the story: who took it, which, and what it did in words. */
export type ReactionTaken = { by: string; id: ReactionId; name: string; text: string }

type InPlay = Target & Caster & { name: string; hasReplied?: boolean; isComplete?: boolean }

/**
 * Whether a hero may halve a hit's damage with Uncanny Dodge: a Rogue of level 5 who can react and can see the
 * attacker. `matters` is the standing order's test (`uncannyDodgeMatters`).
 */
export function uncannyDodgeOffer(target: Reactor & { conditions?: Target["conditions"] }, attacker: Standing & { conditions?: Target["conditions"] }): boolean {
  return hasFeature(target, "rogue-uncanny-dodge") && canReact(target) && !hasCondition(target, "blinded") && !hasCondition(attacker, "invisible")
}

/** A Bard who may answer with Cutting Words, and the Bardic Inspiration die they would roll. */
export type CuttingWords = { bard: string; die: number }

/**
 * The Bards who may answer a creature's roll with Cutting Words: a College of Lore Bard of the other side from the
 * roller, who can react, can see them, stands within 60 feet of them where both stand on a floor, and has a Bardic
 * Inspiration use left or a spell slot to buy one with (Font of Inspiration). Each comes with their die: a d6 to level
 * 4, a d8 from 5.
 */
export function cuttingWordsFrom<T extends Reactor & { featureUses?: Record<string, number>; spellSlots?: readonly number[] }>(
  characters: readonly T[],
  roller: Standing & { id: string }
): (CuttingWords & { reactor: T })[] {
  return characters.flatMap((bard) => {
    if (bard.id === roller.id || bard.type === roller.type || !bard.sheet || !hasFeature(bard, "college-of-lore-cutting-words")) return []
    if (!canReact(bard) || hasCondition(bard, "blinded") || hasCondition(roller, "invisible") || !inspirationUse(bard)) return []
    const from = placedOf(bard)
    const at = placedOf(roller)
    if (from && at && distance(from, at) > CUTTING_WORDS_RANGE + 0.5) return []
    const die = (classById.get(bard.sheet.class)?.levels[bard.sheet.level - 1] as { bardicDie?: number } | undefined)?.bardicDie
    return die ? [{ bard: bard.id, die, reactor: bard }] : []
  })
}

/** How far Cutting Words reaches, from its data: 60 feet. */
const CUTTING_WORDS_RANGE = 60

/**
 * Whether Cutting Words matters against a roll that succeeded: the most the die can take off would turn it into a
 * failure. A 16 against Armor Class 13 matters with a d6, and a 20 against 13 does not. A Critical Hit's die hits
 * whatever is taken off.
 */
export const cuttingWordsMatters = (total: number, target: number, die: number, anyway = false): boolean => !anyway && total - die < target

/**
 * A successful ability check of a creature's, answered by a Bard's Cutting Words when `ask` says so: the Bard spends a
 * use of Bardic Inspiration (or a spell slot for one), and the die rolled comes off the check, which may turn it into
 * a failure. Saving throws are not answered. Everyone comes back as it left them, with the check as it now stands.
 */
export function checkWithCuttingWords<T extends Reactor & { name: string; featureUses?: Record<string, number>; spellSlots?: readonly number[] }>(args: {
  characters: readonly T[]
  rollerId: string
  result: CheckResult
  roll: (sides: number) => number
  ask: Ask
  save?: boolean
}): { characters: T[]; result: CheckResult; reactions: ReactionTaken[] } {
  const roller = args.characters.find((character) => character.id === args.rollerId)
  if (!roller || args.save || !args.result.success) return { characters: [...args.characters], result: args.result, reactions: [] }
  for (const { bard, die, reactor } of cuttingWordsFrom(args.characters, roller)) {
    const matters = cuttingWordsMatters(args.result.total, args.result.dc, die)
    const text = `${roller.name}'s check succeeds: ${args.result.total} against ${args.result.dc}. Cutting Words would take a d${die} off it.`
    if (!args.ask({ id: "cutting-words", to: bard, from: roller.id, matters }, text)) continue
    const cut = args.roll(die)
    const total = args.result.total - cut
    const result = { ...args.result, total, success: total >= args.result.dc, adds: [...(args.result.adds ?? []), { from: "Cutting Words", amount: -cut }] }
    const characters = args.characters.map((character) => (character.id === bard ? withReaction(withInspirationSpent(character)) : character))
    return {
      characters,
      result,
      reactions: [
        { by: bard, id: "cutting-words", name: "Cutting Words", text: `${reactor.name} uses Cutting Words and takes ${cut} off ${roller.name}'s check, ${total} against ${args.result.dc}.` },
      ],
    }
  }
  return { characters: [...args.characters], result: args.result, reactions: [] }
}

/** Whose turn it is among those in play: the first by Initiative who has not finished it. */
const turnOfIn = (characters: readonly unknown[]): string | undefined => findCurrentActor(characters as (ActorLike & { id: string })[])?.id

/**
 * One attack with the reactions that may answer it. The roll is made, the one hit may cast Shield or Parry when they
 * have it and `ask` says so, and a Bard of the other side may take a die off it with Cutting Words. The roll is read
 * again against what that makes, and then the blow lands or does not: a Rogue hit may halve its damage with Uncanny
 * Dodge once it is known. Everyone comes back as it left them, the attacker marked with the once-a-turn features the
 * blow used. A Bandit Captain hit by a 16 against Armor Class 15 parries it into a miss against 17, and has no Reaction
 * left this round.
 */
export function attackWithReactions<T extends InPlay>(args: {
  characters: readonly T[]
  attackerId: string
  targetId: string
  weapon: string
  dice: readonly number[]
  roll: (sides: number) => number
  mode?: RollMode
  rules?: DeathRules
  cover?: Cover
  inspiration?: { die: number }
  cunning?: CunningStrike
  ask: Ask
}): { characters: T[]; blow: Strike; target: T; reactions: ReactionTaken[] } {
  let characters = [...args.characters]
  const attacker = characters.find((character) => character.id === args.attackerId)
  let target = characters.find((character) => character.id === args.targetId)
  if (!attacker || !target) throw new Error("The attacker or the one attacked is no longer here.")
  const turnOf = turnOfIn(characters)
  let rolled = rollAttack({ attacker, target, weapon: args.weapon, dice: args.dice, mode: args.mode, roll: args.roll, cover: args.cover, inspiration: args.inspiration })
  const reactions: ReactionTaken[] = []
  const offer = (id: ReactionId, matters: boolean, to = args.targetId): ReactionOffer => ({
    id,
    to,
    from: args.attackerId,
    weapon: args.weapon,
    roll: rolled.roll,
    ...(rolled.inspired !== undefined ? { inspired: rolled.inspired } : {}),
    matters,
  })
  const put = (changed: T) => {
    characters = characters.map((character) => (character.id === changed.id ? changed : character))
  }
  const hit = `${attacker.name}'s ${rolled.attack.name} hits ${target.name}: ${rolled.roll.total} against Armor Class ${rolled.roll.armorClass}.`
  const shield = shieldOffer(target, rolled)
  const parry = shield ? undefined : parryOffer(target, rolled, attacker)
  if (shield && args.ask(offer("shield", shield.matters), `${hit} Shield would make it Armor Class ${shield.armorClass}.`)) {
    target = withShield(target)
    rolled = againstArmorClass(rolled, shield.armorClass)
    reactions.push({ by: target.id, id: "shield", name: "Shield", text: `${target.name} casts Shield: Armor Class ${shield.armorClass} until their next turn.` })
  } else if (parry && args.ask(offer("parry", parry.matters), `${hit} Parry would make it Armor Class ${parry.armorClass}.`)) {
    target = withReaction(target)
    rolled = againstArmorClass(rolled, parry.armorClass)
    reactions.push({ by: target.id, id: "parry", name: "Parry", text: `${target.name} parries: Armor Class ${parry.armorClass} against this attack.` })
  }
  put(target)
  // Cutting Words: a Bard of the target's side may take their die off a roll that hits.
  if (rolled.roll.hit) {
    for (const { bard, die, reactor } of cuttingWordsFrom(characters, attacker)) {
      const matters = cuttingWordsMatters(rolled.roll.total, rolled.roll.armorClass, die, hitsAnyway(rolled.roll))
      if (!args.ask(offer("cutting-words", matters, bard), `${hit} Cutting Words would take a d${die} off the roll.`)) continue
      const cut = args.roll(die)
      const total = rolled.roll.total - cut
      const still = hitsAnyway(rolled.roll) || total >= rolled.roll.armorClass
      rolled = { ...rolled, roll: { ...rolled.roll, total, hit: still, critical: still && rolled.roll.critical, adds: [...(rolled.roll.adds ?? []), { from: "Cutting Words", amount: -cut }] } }
      put(withReaction(withInspirationSpent(reactor)))
      reactions.push({
        by: bard,
        id: "cutting-words",
        name: "Cutting Words",
        text: `${reactor.name} uses Cutting Words and takes ${cut} off the roll: ${total} against Armor Class ${rolled.roll.armorClass}.`,
      })
      break
    }
  }
  target = characters.find((character) => character.id === args.targetId) as T
  // Uncanny Dodge, once the damage is known: half of it, rounded down.
  const dodging = target
  const halve = uncannyDodgeOffer(dodging, attacker)
    ? (taken: number) => {
        if (!args.ask(offer("uncanny-dodge", uncannyDodgeMatters(dodging, taken)), `${hit} It deals ${taken} damage. Uncanny Dodge would halve it to ${Math.floor(taken / 2)}.`)) return false
        reactions.push({ by: dodging.id, id: "uncanny-dodge", name: "Uncanny Dodge", text: `${dodging.name} uses Uncanny Dodge and takes ${Math.floor(taken / 2)} of ${taken}.` })
        return true
      }
    : undefined
  const { target: struck, ...blow } = landBlow({ attacker, target, roll: args.roll, rules: args.rules, present: characters, turnOf, cunning: args.cunning, halve }, rolled)
  put(blow.halved ? withReaction(struck) : struck)
  // The once-a-turn features the blow used are marked on the attacker.
  for (const id of blow.used ?? []) put(withUsedThisTurn(characters.find((character) => character.id === args.attackerId) as T, id, turnOf))
  const after = characters.find((character) => character.id === args.targetId) as T
  return { characters, blow, target: after, reactions }
}

/** An Opportunity Attack as a move was made: who made it, the blow, and the reactions that answered it. */
export type OpportunityAttackMade = { attacker: string; blow: Strike; reactions: ReactionTaken[] }

/**
 * A move with the Opportunity Attacks it draws. The mover walks the path leg by leg. Each one whose reach a leg leaves
 * may strike, when `ask` says so, right before the mover leaves it, and then has no Reaction left this round. A mover
 * the blow drops stops where it fell. Everyone comes back as the move left them, the mover standing where it ended.
 * One who took the Disengage action draws none.
 */
export function moveWithReactions<T extends InPlay>(args: {
  characters: readonly T[]
  moverId: string
  path: readonly Point[]
  disengaged?: boolean
  ask: Ask
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): { characters: T[]; attacks: OpportunityAttackMade[]; stopped: boolean } {
  let characters = [...args.characters]
  const attacks: OpportunityAttackMade[] = []
  const moverNow = () => characters.find((character) => character.id === args.moverId) as T
  for (const to of args.path) {
    const mover = moverNow()
    const from = mover.position
    if (!from) break
    for (const { attacker, weapon } of opportunityAttacks({ mover, from, to, everyone: characters, disengaged: args.disengaged })) {
      const attack = attacksOf(attacker).find((entry) => entry.id === weapon)
      const text = `${mover.name} is leaving ${attacker.name}'s reach. ${attacker.name} may strike with ${attack?.name ?? "an attack"}.`
      if (!args.ask({ id: "opportunity-attack", to: attacker.id, from: mover.id, weapon, matters: true }, text)) continue
      const made = attackWithReactions({ characters, attackerId: attacker.id, targetId: mover.id, weapon, dice: [args.d20()], roll: args.roll, rules: args.rules, ask: args.ask })
      characters = made.characters.map((character) => (character.id === attacker.id ? withReaction(character) : character))
      attacks.push({ attacker: attacker.id, blow: made.blow, reactions: made.reactions })
      if (isDown(made.target)) return { characters, attacks, stopped: true }
    }
    // A mover who takes a step has left the areas that stay on the floor (Web, Stinking Cloud, Sleet Storm).
    characters = characters.map((character) => (character.id === args.moverId ? spellEffectsAfterMove({ ...character, position: { x: to.x, y: to.y } }) : character))
  }
  return { characters, attacks, stopped: false }
}

/**
 * A reaction offered to a player's hero and not yet answered, as the turn keeps it while the round waits. `npc` is
 * whose turn stopped. `resume` holds what that turn had already settled, so it is played again the same: what the NPC
 * meant to do, how it was read, the dice it rolled, and the answers given so far. `answer` is the player's, when it
 * has come. After `expiresAt` the hero's standing order answers.
 */
export type PendingReaction = {
  offer: ReactionOffer
  text: string
  expiresAt: number
  npc: string
  answer?: boolean
  resume: { action: unknown; reading: unknown; dice: number[]; answers: boolean[] }
}

/** How long the round waits on a player's answer, in milliseconds. */
export const REACTION_WAIT = 20_000
