import type { ConditionId } from "@d20/srd"
import { isDead, isDying } from "../../utils/turn-actors"
import { conditionName, exhaustionOf, withoutCondition } from "../conditions"
import { afterHarm, killed, revived, stable, withHealing } from "../death"
import type { ConditionChange } from "../harm"
import { hitPointsOf, withHitPoints } from "../hit-points"
import { canReact, withReaction } from "../reactions"
import { endConcentration, spellEnded, withSpellEffect } from "../spell-effects"
import { type CastContext, type Ended, type EndsArgs, heldRule, type SpellRules } from "../spell-rules"
import type { Castee } from "../spells"
import type { SpellEffect } from "../turn-effect"
import { creatureTypeOf } from "./enchantments"

/**
 * Spells that heal past hit points, lower a maximum, and bring back the dead, by their SRD 5.2.1 text.
 *
 * The dead are dropped from play as the round they died in ends, so a spell that raises the dead reaches one who died
 * this round and no other. One that takes an hour is cast only out of a fight (./spells `longCasting`). The engine
 * keeps no gold or gems, so a costly component is the story's, as it keeps no time of death, so how long one has been
 * dead is too.
 */

// Conditions ended on one it takes, where the spell names them, each told and counted.
function ending<T extends Castee>(cast: CastContext, target: T, ids: readonly ConditionId[]): T {
  let now = target
  for (const id of ids) {
    const freed = withoutCondition(now, id)
    if (!freed.ended) continue
    now = freed.character
    cast.conditions.push({ target: target.id, condition: id, ends: true })
    cast.facts.push(`${cast.spell.name} ends ${target.name}'s ${conditionName(id)} condition.`)
  }
  return now
}

// Healing told and counted, as the cast's own healing is.
function healed(cast: CastContext, target: Castee, amount: number): Castee {
  const after = withHealing(target, amount)
  cast.put(after)
  cast.harm.push({ target: target.id, kind: "healing", dice: [], bonus: amount, amount })
  cast.facts.push(`${target.name} regains ${amount} hit points. ${cast.standing(after)}`)
  return after
}

const missing = (target: Castee) => {
  const hitPoints = hitPointsOf(target)
  return hitPoints ? hitPoints.maximum - hitPoints.current : 0
}

const CLEANSED: readonly ConditionId[] = ["blinded", "deafened", "poisoned"]

/** Heal: "restoring 70 Hit Points", its data's, and "This spell also ends the Blinded, Deafened, and Poisoned conditions on the target." */
export const heal: SpellRules = {
  spells: ["heal"],
  ends: (args) => {
    const conditions: ConditionChange[] = []
    const facts: string[] = []
    const characters = args.characters.map((character) => {
      if (character.id !== args.targets[0]) return character
      let now = character
      for (const id of CLEANSED) {
        const freed = withoutCondition(now, id)
        if (!freed.ended) continue
        now = freed.character
        conditions.push({ target: character.id, condition: id, ends: true })
        facts.push(`Heal ends ${character.name}'s ${conditionName(id)} condition.`)
      }
      return now
    })
    return { characters, conditions, facts }
  },
}

/**
 * Mass Heal: "You restore up to 700 Hit Points, divided as you choose among any number of creatures", and those healed
 * have Blinded, Deafened and Poisoned removed. The engine divides them so: each of those named in turn regains all they
 * are missing, while the 700 last.
 */
export const massHeal: SpellRules = {
  spells: ["mass-heal"],
  cast: (cast) => {
    let left = 700
    for (const id of cast.targets) {
      const target = cast.find(id)
      if (!target || isDead(target) || left <= 0) continue
      const amount = Math.min(left, missing(target))
      left -= amount
      const after = amount > 0 ? healed(cast, target, amount) : target
      cast.put(ending(cast, after, CLEANSED))
    }
    cast.facts.push(`${700 - left} of Mass Heal's 700 hit points are spent.`)
  },
}

/**
 * Power Word Heal: "The target regains all its Hit Points. If the creature has the Charmed, Frightened, Paralyzed,
 * Poisoned, or Stunned condition, the condition ends. If the creature has the Prone condition, it can use its Reaction
 * to stand up", which it does where it can still take one.
 */
export const powerWordHeal: SpellRules = {
  spells: ["power-word-heal"],
  settles: (cast, target) => {
    if (isDead(target)) {
      cast.facts.push(`${target.name} is dead, and Power Word Heal does nothing.`)
      return true
    }
    const amount = missing(target)
    const after = amount > 0 ? healed(cast, target, amount) : target
    let now = ending(cast, after, ["charmed", "frightened", "paralyzed", "poisoned", "stunned"])
    if (now.conditions?.some((entry) => entry.id === "prone") && canReact(now)) {
      now = withReaction(withoutCondition(now, "prone").character)
      cast.conditions.push({ target: target.id, condition: "prone", ends: true })
      cast.facts.push(`${target.name} stands up, using their Reaction.`)
    }
    cast.put(now)
    return true
  },
}

// A curse a spell the game holds laid on one (Bestow Curse), ended: where its caster concentrates on it, that ends,
// and it leaves everyone it took.
function cursesEnded<T extends Ended>(characters: readonly T[], target: T): { characters: T[]; ended: boolean } {
  const by = new Set<string | undefined>()
  for (const effect of target.spellEffects ?? []) if (effect.spell === "bestow-curse") by.add(effect.by)
  for (const entry of target.conditions ?? []) if (entry.spell === "bestow-curse") by.add(entry.source)
  let now = [...characters]
  for (const caster of by) {
    const holder = now.find((character) => character.id === caster)
    if (holder?.concentration?.spell === "bestow-curse") now = endConcentration(now, holder.id).characters
    now = now.map((character) => (character.id === target.id ? spellEnded(character, (id) => id === "bestow-curse") : character))
  }
  return { characters: now, ended: by.size > 0 }
}

/**
 * Greater Restoration removes one of: "1 Exhaustion level", "The Charmed or Petrified condition", "A curse", "Any
 * reduction to one of the target's ability scores", "Any reduction to the target's Hit Point maximum". The engine takes
 * the one that hinders most: Petrified, then Charmed, a curse, a lowered maximum, and a level of Exhaustion. A cursed
 * item's Attunement and a lowered ability score are the game master's: the engine keeps neither.
 */
export const greaterRestoration: SpellRules = {
  spells: ["greater-restoration"],
  ends: <T extends Ended>(args: EndsArgs<T>) => {
    let characters = [...args.characters]
    const conditions: ConditionChange[] = []
    const facts: string[] = []
    const target = characters.find((character) => character.id === args.targets[0])
    if (!target) return { characters, conditions, facts }
    const put = (after: T) => {
      characters = characters.map((character) => (character.id === after.id ? after : character))
    }
    const condition = (["petrified", "charmed"] as const).find((id) => target.conditions?.some((entry) => entry.id === id))
    const lowered = target.spellEffects?.find((effect) => heldRule(effect.spell)?.maximumLess)
    if (condition) {
      put(withoutCondition(target, condition).character)
      conditions.push({ target: target.id, condition, ends: true })
      facts.push(`Greater Restoration ends ${target.name}'s ${conditionName(condition)} condition.`)
    } else if ((target.spellEffects ?? []).some((effect) => effect.spell === "bestow-curse") || target.conditions?.some((entry) => entry.spell === "bestow-curse")) {
      characters = cursesEnded(characters, target).characters
      facts.push(`Greater Restoration ends the curse on ${target.name}.`)
    } else if (lowered) {
      put(spellEnded(target, (id) => id === lowered.spell))
      facts.push(`Greater Restoration restores ${target.name}'s hit point maximum.`)
    } else if (exhaustionOf(target) > 0) {
      put(withoutCondition(target, "exhaustion").character)
      conditions.push({ target: target.id, condition: "exhaustion", ends: true })
      facts.push(`Greater Restoration removes a level of ${target.name}'s Exhaustion.`)
    } else facts.push(`${target.name} has none of the effects Greater Restoration removes that the game holds.`)
    return { characters, conditions, facts }
  },
}

/**
 * Harm: "On a failed save, it takes 14d6 Necrotic damage, and its Hit Point maximum is reduced by an amount equal to the
 * Necrotic damage it took", but not below 1. The reduction stays through rests, until Greater Restoration ends it. A
 * second Harm lowers it further.
 */
export const harm: SpellRules = {
  spells: ["harm"],
  held: { maximumLess: true, placed: true, rested: (effect) => effect },
  failedSave: (cast, target) => {
    const now = cast.find(target.id)
    const took = [...cast.harm].reverse().find((entry) => entry.target === target.id && entry.kind === "damage")?.amount ?? 0
    const before = now && hitPointsOf(now)
    if (!now || !before || isDead(now) || took <= 0) return
    const lowered = Math.min(took, before.maximum - 1)
    if (lowered <= 0) return
    const held = now.spellEffects?.find((effect) => effect.spell === cast.spell.id)
    const marked = withSpellEffect(now, { spell: cast.spell.id, by: cast.caster.id, amount: (held?.amount ?? 0) + lowered })
    const after = withHitPoints(marked, Math.min(before.current, before.maximum - lowered))
    cast.put(after)
    cast.facts.push(`${target.name}'s hit point maximum falls by ${lowered}, to ${before.maximum - lowered}.`)
  },
}

/** Spare the Dying: "Choose a creature within range that has 0 Hit Points and isn't dead. The creature becomes Stable." */
export const spareTheDying: SpellRules = {
  spells: ["spare-the-dying"],
  // "The range doubles when you reach levels 5 (30 feet), 11 (60 feet), and 17 (120 feet)."
  range: (caster) => {
    const level = caster.sheet?.level ?? 1
    return level >= 17 ? 120 : level >= 11 ? 60 : level >= 5 ? 30 : 15
  },
  cast: (cast) => {
    for (const id of cast.targets) {
      const target = cast.find(id)
      if (!target) continue
      if (!isDying(target)) {
        cast.facts.push(`${target.name} is not dying, so Spare the Dying does nothing.`)
        continue
      }
      cast.put(stable(target))
      cast.facts.push(`${target.name} is Stable, Unconscious at 0 hit points, and makes no more Death Saving Throws.`)
    }
  },
}

/**
 * Regenerate: "A creature you touch regains 4d8 + 15 Hit Points", its data's. "For the duration, the target regains 1
 * Hit Point at the start of each of its turns", which brings one at 0 back up. Body parts are the story's.
 */
export const regenerateSpell: SpellRules = {
  spells: ["regenerate"],
  held: {},
  round: (round, was) => {
    const now = round.find(was.id)
    if (!now || isDead(now) || !now.spellEffects?.some((effect) => effect.spell === "regenerate") || missing(now) <= 0) return
    round.put(withHealing(now, 1))
    round.tell(now.id, "Regenerate", `${now.name} regains 1 hit point by Regenerate.${round.standing(now.id)}`)
  },
}

// The dust Disintegrate leaves, kept on the dead as the spell's mark: only True Resurrection or Wish brings it back.
const DUST = "disintegrate"
const isDust = (target: Castee) => !!target.spellEffects?.some((effect) => effect.spell === DUST)

/**
 * Disintegrate: "If this damage reduces it to 0 Hit Points, it and everything nonmagical it is wearing and carrying are
 * disintegrated into gray dust. The target can be revived only by a True Resurrection or a Wish spell." A hero dropped
 * to 0 by it dies. Where player death is off, a hero is left Stable instead, and is not dust. Objects and creations of
 * magical force are the game master's.
 */
export const disintegrate: SpellRules = {
  spells: ["disintegrate"],
  failedSave: (cast, target) => {
    const now = cast.find(target.id)
    if (!now || (hitPointsOf(target)?.current ?? 0) === 0 || (hitPointsOf(now)?.current ?? 1) > 0) return
    const done = isDead(now) ? now : afterHarm(killed(now, cast.rules))
    if (!isDead(done)) {
      cast.put(done)
      return
    }
    cast.put({ ...done, spellEffects: [{ spell: DUST, by: cast.caster.id }] })
    cast.facts.push(`${target.name} is disintegrated into gray dust, with all they wore and carried that is not magical. Only True Resurrection or Wish can bring them back.`)
  },
}

// Why a spell that raises the dead does not take one, or none where it does.
function unraised(cast: CastContext, target: Castee, options: { dust?: true; undead?: true }): string | undefined {
  if (!isDead(target)) return `${target.name} is not dead, so ${cast.spell.name} does nothing.`
  if (isDust(target) && !options.dust) return `${target.name} is gray dust, and only True Resurrection or Wish can bring them back.`
  if (creatureTypeOf(target) === "undead" && !options.undead) return `${target.name} was Undead, so ${cast.spell.name} cannot bring them back.`
  return undefined
}

// The dead brought back at `amount` hit points, or all of them, Prone as one is when Unconscious ends, with the spell's
// penalty to D20 Tests where it leaves one.
function raised(cast: CastContext, target: Castee, options: { full?: true; dust?: true; undead?: true; penalty?: true }): void {
  const refused = unraised(cast, target, options)
  if (refused) {
    cast.facts.push(refused)
    return
  }
  const { dead: _, spellEffects: __, ...alive } = target
  const maximum = hitPointsOf({ ...alive, hitPoints: 0 } as Castee)?.maximum ?? 1
  const amount = options.full ? maximum : (cast.spell.healing?.amount ?? 1)
  const back = revived({ ...alive, hitPoints: 0 } as Castee, amount)
  const marked = options.penalty ? withSpellEffect(back, { spell: cast.spell.id, by: cast.caster.id, amount: 4 }) : back
  cast.put(marked)
  cast.harm.push({ target: target.id, kind: "healing", dice: [], bonus: amount, amount })
  cast.facts.push(
    `${target.name} returns to life with ${amount === maximum ? `all ${amount} hit points` : `${amount} hit point${amount === 1 ? "" : "s"}`}, Prone.${options.penalty ? ` Coming back from the dead is an ordeal: ${target.name} takes a −4 penalty to D20 Tests, which eases by 1 with each Long Rest.` : ""}`
  )
}

// "Coming back from the dead is an ordeal. The target takes a −4 penalty to D20 Tests. Every time the target finishes a
// Long Rest, the penalty is reduced by 1 until it becomes 0." Kept as the effect's `amount`.
const ORDEAL = {
  d20Less: (effect: SpellEffect) => effect.amount ?? 0,
  rested: (effect: SpellEffect, long: boolean) => (!long ? effect : (effect.amount ?? 0) > 1 ? { ...effect, amount: (effect.amount ?? 0) - 1 } : undefined),
  placed: true as const,
}

/**
 * Raise Dead: "you revive a dead creature if it has been dead no longer than 10 days and it wasn't Undead when it died.
 * The creature returns to life with 1 Hit Point", with its poisons gone, as death ended them, and the ordeal's penalty.
 */
export const raiseDead: SpellRules = {
  spells: ["raise-dead"],
  takesDead: true,
  held: ORDEAL,
  settles: (cast, target) => {
    raised(cast, target, { penalty: true })
    return true
  },
}

/**
 * Resurrection: one dead "for no more than a century", not Undead, "returns to life with all its Hit Points", with the
 * ordeal's penalty. The tax on its caster for one dead a year or more is the game master's, as the engine holds no one
 * dead so long.
 */
export const resurrection: SpellRules = {
  spells: ["resurrection"],
  takesDead: true,
  held: ORDEAL,
  settles: (cast, target) => {
    raised(cast, target, { full: true, penalty: true })
    return true
  },
}

/**
 * True Resurrection: one dead "for any reason except old age. The creature is revived with all its Hit Points", from
 * dust too, with no penalty. An Undead's return to its living form and a new body that appears beside its caster are
 * the game master's.
 */
export const trueResurrection: SpellRules = {
  spells: ["true-resurrection"],
  takesDead: true,
  settles: (cast, target) => {
    raised(cast, target, { full: true, dust: true, undead: true })
    return true
  },
}

/** Revivify cannot bring back one Disintegrate left as dust. */
export const revivifyDust: SpellRules = {
  spells: ["revivify"],
  takesDead: true,
  takes: (target) => (isDust(target as Castee) ? `${target.name} is gray dust, and only True Resurrection or Wish can bring them back.` : undefined),
}
