import type { AbilityId, ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import type { Check } from "./check"
import type { ConditionEntry } from "./condition-entry"
import type { ModeSource } from "./conditions"
import type { Sheet } from "./sheet"
import { speciesSaveModes } from "./species-traits"
import type { Concentration, SpellEffect } from "./turn-effect"

/**
 * Spells that last. A spell that goes on working after it is cast leaves an effect on each creature it took, by the
 * spell's SRD id and its caster. What the effect does is read from the spell's own typed data when a roll is made:
 * dice added to or taken from attack rolls, saves or checks (Bless, Bane, Guidance), Armor Class (Shield of Faith,
 * Mage Armor), damage added to its caster's hits (Hunter's Mark), and Temporary Hit Points each turn (Heroism).
 *
 * Three spells change later attack rolls in words their data does not type. They are held here, each from its text.
 */
const RIDERS: Record<string, { attacked?: "advantage" | "disadvantage"; attacks?: "disadvantage"; once?: true }> = {
  // "The next attack roll made against it before the end of your next turn has Advantage."
  "guiding-bolt": { attacked: "advantage", once: true },
  // "Attack rolls against an affected creature or object have Advantage if the attacker can see it."
  "faerie-fire": { attacked: "advantage" },
  // "It has Disadvantage on the next attack roll it makes before the end of its next turn."
  "vicious-mockery": { attacks: "disadvantage", once: true },
  // Blur: "any creature has Disadvantage on attack rolls against you." Blindsight and Truesight are not read.
  blur: { attacked: "disadvantage" },
}

/**
 * Spells of levels 2 and 3 whose lasting effect the engine holds by name, from their text, where the typed data holds
 * no lasting value: the effect marks who is under the spell, and the rules below and in ./spell-rounds read it.
 */
const HELD = new Set([
  "mirror-image",
  "haste",
  "slow",
  "beacon-of-hope",
  "bestow-curse",
  "ray-of-enfeeblement",
  "phantasmal-force",
  "web",
  "stinking-cloud",
  "sleet-storm",
  "spirit-guardians",
  "spiritual-weapon",
  "vampiric-touch",
  "heat-metal",
])

/** Spells whose effect marks those standing in an area that stays on the floor. A creature that moves is taken to have left it (`spellEffectsAfterMove`). */
export const AREA_SPELLS = new Set(["web", "stinking-cloud", "sleet-storm"])

/**
 * Spells whose effect is held by the caster alone, with the slot it was cast at as its `amount`: Spirit Guardians'
 * aura goes where they go, and the three a caster uses again on later turns (./spells `castAgain`).
 */
export const CASTER_HELD = new Set(["spirit-guardians", "spiritual-weapon", "vampiric-touch", "heat-metal"])

/** Whether a spell leaves an effect on those it takes. */
export function lasts(spell: Spell): boolean {
  return !!(spell.ac || spell.rollModifier || spell.hitPointMaximum || RIDERS[spell.id] || HELD.has(spell.id) || markOf(spell) || (spell.healing?.temporary && spell.healing.timing))
}

// Damage a spell adds to its caster's later hits on the one it marks: Hunter's Mark. A spell with a spell attack deals
// its hit damage at the cast, so it is not a mark.
const markOf = (spell: Spell) => (spell.attack ? undefined : spell.damage?.find((entry) => entry.trigger === "hit" && !entry.timing && !entry.appliesWhen && entry.dice))

type Bearer = {
  id?: string
  sheet?: Sheet
  name?: string
  type?: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  fled?: true
  conditions?: readonly ConditionEntry[]
  spellEffects?: readonly SpellEffect[]
  concentration?: Concentration
  tempHitPoints?: number
  isComplete?: boolean
}

const effectsOf = (character: Bearer) => (character.spellEffects ?? []).flatMap((effect) => (spellById.get(effect.spell) ? [{ effect, spell: spellById.get(effect.spell) as Spell }] : []))

/** A character with a spell's effect on them. A second casting of the same spell renews it and does not stack. */
export function withSpellEffect<T extends Bearer>(character: T, effect: SpellEffect): T {
  return { ...character, spellEffects: [...(character.spellEffects ?? []).filter((held) => held.spell !== effect.spell), effect] }
}

const strip = <T extends Bearer>(character: T, gone: (effect: SpellEffect) => boolean): T => {
  if (!character.spellEffects?.some(gone)) return character
  const spellEffects = character.spellEffects.filter((effect) => !gone(effect))
  const { spellEffects: _, ...rest } = character
  return (spellEffects.length ? { ...rest, spellEffects } : rest) as T
}

/**
 * What a character's spells add to their Armor Class. A bonus adds (Shield of Faith's 2). A base replaces the Armor
 * Class of one who wears no armor, with their Dexterity modifier added, when that is higher (Mage Armor's 13).
 */
export function armorClassWithSpells(character: Bearer, armorClass: number, unarmored?: { dexterityModifier: number }): number {
  let total = armorClass
  for (const { spell } of effectsOf(character)) {
    if (spell.ac?.base !== undefined && unarmored) total = Math.max(total, spell.ac.base + unarmored.dexterityModifier)
  }
  // A floor on the Armor Class before bonuses: Barkskin's 17 "if its AC is lower than that".
  for (const { spell } of effectsOf(character)) if (spell.ac?.minimum !== undefined) total = Math.max(total, spell.ac.minimum)
  for (const { spell } of effectsOf(character)) total += (spell.ac?.bonus ?? 0) - (ARMOR_LESS[spell.id] ?? 0)
  return total
}

// Armor Class a spell takes away, from its text: Slow's "−2 penalty to AC and Dexterity saving throws".
const ARMOR_LESS: Record<string, number> = { slow: 2 }

/**
 * What a character's spells add to their Hit Point maximum: Aid's 5, and 5 more for each slot level above 2, held as
 * the effect's `amount`.
 */
export const hitPointMaximumFromSpells = (character: Bearer): number =>
  effectsOf(character).reduce((sum, { effect, spell }) => sum + (spell.hitPointMaximum ? (effect.amount ?? spell.hitPointMaximum.amount ?? 0) : 0), 0)

/**
 * Advantage a character's spells give their own saving throw, each with the spell: Haste on Dexterity saves, Beacon of
 * Hope on Wisdom saves and Death Saving Throws ("death").
 */
export function saveModesFromSpells(character: Bearer, ability: AbilityId | "death"): ModeSource[] {
  return effectsOf(character).flatMap(({ spell }) => (SAVE_ADVANTAGE[spell.id]?.includes(ability) ? [{ mode: "advantage" as const, from: spell.name }] : []))
}
const SAVE_ADVANTAGE: Record<string, readonly (AbilityId | "death")[]> = { haste: ["dex"], "beacon-of-hope": ["wis", "death"] }

/** What a character's spells add to or take from a saving throw of one ability: Slow's −2 on Dexterity saves. */
export const saveBonusFromSpells = (character: Bearer, ability: AbilityId): number => (ability === "dex" && effectsOf(character).some(({ spell }) => spell.id === "slow") ? -2 : 0)

/**
 * The Advantage a character's spells and species give a check, when it is a saving throw: for a save rolled outside
 * ./spells `rollSave`. `against` names the conditions the save is made to avoid or end (Fey Ancestry on Charmed).
 */
export const saveModesFor = (character: Bearer, check: Check, against: readonly ConditionId[] = []): ModeSource[] =>
  check.kind === "save" ? [...saveModesFromSpells(character, check.ability), ...speciesSaveModes(character, check.ability, against)] : []

/** What a character's spells add to a check, when it is a saving throw: for a save rolled outside ./spells `rollSave`. */
export const saveBonusFor = (character: Bearer, check: Check): number => (check.kind === "save" ? saveBonusFromSpells(character, check.ability) : 0)

/** Whether a character's spells keep them from taking Reactions: Slow. */
export const cannotReactBySpell = (character: Bearer): boolean => effectsOf(character).some(({ spell }) => spell.id === "slow")

/** Whether a character's spells make every healing die count its most: Beacon of Hope. */
export const healsMost = (character: Bearer): boolean => effectsOf(character).some(({ spell }) => spell.id === "beacon-of-hope")

/**
 * Whether a character's spells keep Magic Missile's darts off them: Shield, "and you take no damage from Magic Missile".
 */
export const turnsMagicMissile = (character: Bearer): boolean => effectsOf(character).some(({ spell }) => spell.id === "shield")

/**
 * Mirror Image against a hit by an attack roll: a d6 for each duplicate left, and on any 3 or higher a duplicate is hit
 * in place of its caster and destroyed. The spell ends with the last. An attacker who is Blinded is not fooled.
 * `duplicates` is how many were left before the roll.
 */
export function mirrorImage<T extends Bearer>(target: T, attacker: Bearer, roll: (sides: number) => number): { character: T; deflected: boolean; dice: number[]; duplicates: number } {
  const held = target.spellEffects?.find((effect) => effect.spell === "mirror-image")
  const duplicates = held?.amount ?? 0
  if (!held || duplicates < 1 || attacker.conditions?.some((entry) => entry.id === "blinded")) return { character: target, deflected: false, dice: [], duplicates }
  const dice = Array.from({ length: duplicates }, () => roll(6))
  if (!dice.some((die) => die >= 3)) return { character: target, deflected: false, dice, duplicates }
  const character =
    duplicates > 1
      ? { ...target, spellEffects: (target.spellEffects ?? []).map((effect) => (effect === held ? { ...effect, amount: duplicates - 1 } : effect)) }
      : strip(target, (effect) => effect === held)
  return { character, deflected: true, dice, duplicates }
}

/** One die a lasting spell adds to a roll, or takes from it, as it fell. */
export type RollAdd = { from: string; amount: number }

/**
 * The dice a character's spells add to a roll of theirs: an attack roll, a saving throw, or an ability check with the
 * skill the spell was cast for. `roll` throws one die of the given size.
 */
export function rollAdds(character: Bearer, kind: "attack-rolls" | "saving-throws" | "ability-checks", roll: (sides: number) => number, skill?: SkillId, options: { spell?: boolean } = {}): RollAdd[] {
  const found: RollAdd[] = []
  for (const { effect, spell } of effectsOf(character)) {
    const modifier = spell.rollModifier
    if (!modifier) continue
    // A check with one skill: Pass without Trace's +10 to Stealth, Enthrall's −10 to Perception.
    const forSkill = kind === "ability-checks" && !!skill && modifier.to.includes(`${skill}-checks`)
    if (!modifier.to.includes(kind) && !forSkill) continue
    // Magic Weapon is the weapon's: it adds to weapon attacks, not to spell attacks.
    if (spell.id === "magic-weapon" && options.spell) continue
    // Guidance is for one skill, chosen as it is cast. Warding Bond's limit, within 60 feet of its caster, is not
    // measured, nor Pass without Trace's aura, and Magic Weapon is taken to be the weapon its bearer attacks with.
    if (modifier.appliesWhen && !forSkill && !UNMEASURED.has(spell.id) && (kind !== "ability-checks" || !effect.skill || effect.skill !== skill)) continue
    const match = /^(\d+)d(\d+)$/.exec(modifier.dice ?? "")
    // Magic Weapon's bonus grows with the slot, and is held as the effect's `amount`.
    const amount = match ? Array.from({ length: Number(match[1]) }, () => roll(Number(match[2]))).reduce((sum, die) => sum + die, 0) : (effect.amount ?? modifier.amount ?? 0)
    found.push({ from: spell.name, amount: modifier.subtract ? -amount : amount })
  }
  return found
}
const UNMEASURED = new Set(["warding-bond", "magic-weapon", "pass-without-trace"])

/**
 * Damage a character's own spells add to their weapon hits: Magic Weapon's bonus to damage rolls, held as the effect's
 * `amount`. For ./attack, beside `markDamage`.
 */
export function weaponDamageFromSpells(attacker: Bearer): { name: string; damage: { amount: number; type?: DamageTypeId } }[] {
  return effectsOf(attacker).flatMap(({ effect, spell }) => (spell.id === "magic-weapon" ? [{ name: spell.name, damage: { amount: effect.amount ?? spell.rollModifier?.amount ?? 1 } }] : []))
}

/** The dice for a check or a save, from the check's kind. */
export const checkAdds = (character: Bearer, check: Check, roll: (sides: number) => number): RollAdd[] =>
  check.kind === "save" ? rollAdds(character, "saving-throws", roll) : rollAdds(character, "ability-checks", roll, check.kind === "skill" ? check.skill : undefined)

/** Damage an attacker's own spell adds to a hit on this target: Hunter's Mark's d6 on the one marked. */
export function markDamage(attackerId: string | undefined, target: Bearer): { name: string; damage: { dice: string; type: DamageTypeId } }[] {
  if (!attackerId) return []
  return effectsOf(target).flatMap(({ effect, spell }) => {
    const mark = markOf(spell)
    return mark?.dice && effect.by === attackerId ? [{ name: spell.name, damage: { dice: mark.dice, type: mark.types[0] } }] : []
  })
}

/** Advantage and Disadvantage that lasting spells put on an attack roll: Faerie Fire and Guiding Bolt on the one attacked, Vicious Mockery on the attacker. */
export function attackModesFromSpells(attacker: Bearer, target: Bearer): ModeSource[] {
  const found: ModeSource[] = []
  for (const { spell } of effectsOf(target)) {
    const side = RIDERS[spell.id]?.attacked
    if (side) found.push({ mode: side, from: spell.name })
  }
  for (const { spell } of effectsOf(attacker)) if (RIDERS[spell.id]?.attacks) found.push({ mode: "disadvantage", from: spell.name })
  return found
}

/** Everyone after an attack roll, with the spells it used up: one that is for the next attack only is spent by it. */
export function afterAttackRoll<T extends Bearer>(characters: readonly T[], attackerId: string, targetId: string): T[] {
  const once = (side: "attacked" | "attacks") => (effect: SpellEffect) => !!RIDERS[effect.spell]?.once && !!RIDERS[effect.spell]?.[side]
  return characters.map((character) => (character.id === targetId ? strip(character, once("attacked")) : character.id === attackerId ? strip(character, once("attacks")) : character))
}

/** Conditions a character cannot be given while a spell is on them: Heroism shuts out Frightened. */
export const spellImmunities = (character: Bearer): ConditionId[] => ((character.spellEffects ?? []).some((effect) => effect.spell === "heroism") ? ["frightened"] : [])

/**
 * A character's lasting spells as a round begins: each with a count of turns loses one, and one that runs out ends.
 * Heroism gives its Temporary Hit Points again.
 */
export function spellEffectsAtRoundStart<T extends Bearer>(character: T): T {
  if (!character.spellEffects?.length) return character
  const spellEffects = character.spellEffects.flatMap((effect): SpellEffect[] => (effect.turns === undefined ? [effect] : effect.turns > 1 ? [{ ...effect, turns: effect.turns - 1 }] : []))
  const refresh = Math.max(0, ...spellEffects.map((effect) => (spellById.get(effect.spell)?.healing?.temporary ? (effect.amount ?? 0) : 0)))
  const { spellEffects: _, ...rest } = character
  const next = (spellEffects.length ? { ...rest, spellEffects } : rest) as T
  return refresh > (next.tempHitPoints ?? 0) ? { ...next, tempHitPoints: refresh } : next
}

// Whether a spell outlasts a fight: it runs longer than a minute, so it is not counted in turns.
const outlasts = (spell: Spell | undefined): boolean => {
  const duration = spell?.duration
  if (!duration || duration.kind === "instantaneous") return false
  if (duration.kind !== "timed") return true
  return duration.unit !== "round" && !(duration.unit === "minute" && (duration.amount ?? 1) <= 1)
}

/**
 * A character as the story moves on to another encounter: spells counted in turns are over, with Concentration on
 * them. Temporary Hit Points stay: they last until they are lost or a Long Rest. A spell that lasts longer than a minute stays, and so does its caster's
 * Concentration on it: Mage Armor, Hunter's Mark, Shield of Faith. A fight that moves from one scene to the next
 * keeps the mark on its quarry.
 */
export function spellEffectsAtEncounterEnd<T extends Bearer>(character: T): T {
  const kept = (character.spellEffects ?? []).filter((effect) => effect.turns === undefined)
  const held = character.concentration && outlasts(spellById.get(character.concentration.spell)) ? character.concentration : undefined
  const { spellEffects: _, concentration: __, ...rest } = character
  return { ...rest, ...(kept.length ? { spellEffects: kept } : {}), ...(held ? { concentration: held } : {}) } as T
}

/** A character's lasting spells in words, for the screen and the game master: "Bless, Mage Armor". */
export const spellEffectWords = (character: Bearer): string => [...new Set(effectsOf(character).map(({ spell }) => spell.name))].join(", ")

/**
 * End a caster's Concentration: the spell's effects, and the conditions it gave, leave everyone it took. Returns the
 * spell's name when there was one to end.
 */
export function endConcentration<T extends Bearer>(characters: readonly T[], casterId: string): { characters: T[]; ended?: string } {
  const caster = characters.find((character) => character.id === casterId)
  const held = caster?.concentration?.spell
  if (!caster || !held) return { characters: [...characters] }
  return {
    characters: characters.map((before) => {
      // Haste's end: "the target is Incapacitated and has a Speed of 0 until the end of its next turn".
      const lethargic = held === "haste" && !!before.spellEffects?.some((effect) => effect.spell === "haste" && effect.by === casterId)
      const character = lethargic
        ? { ...before, conditions: [...(before.conditions ?? []).filter((entry) => entry.id !== "incapacitated"), { id: "incapacitated" as const, turns: before.isComplete ? 2 : 1 }] }
        : before
      const cleared = strip(character, (effect) => effect.spell === held && effect.by === casterId)
      const conditions = (cleared.conditions ?? []).filter((entry) => !(entry.spell === held && entry.source === casterId))
      const { conditions: _, ...rest } = cleared
      const freed = (conditions.length ? { ...rest, conditions } : rest) as T
      if (character.id !== casterId) return freed
      const { concentration: __, ...done } = freed
      return done as T
    }),
    ended: spellById.get(held)?.name ?? held,
  }
}

/** A caster begins to concentrate on a spell. One they were holding ends first. */
export function withConcentration<T extends Bearer>(characters: readonly T[], casterId: string, spellId: string): T[] {
  return endConcentration(characters, casterId).characters.map((character) => (character.id === casterId ? { ...character, concentration: { spell: spellId } } : character))
}

/** A Concentration saving throw as it fell. */
export type ConcentrationSave = { character: string; spell: string; natural: number; bonus: number; total: number; dc: number; success: boolean }

/**
 * Settle Concentration after something has happened: everyone as they were before it, and as they are now. A caster
 * who is now dead, down or Incapacitated loses it. One who lost hit points makes a Constitution saving throw against
 * 10 or half the damage, whichever is higher, and loses it on a failure. `save` gives a caster's Constitution save
 * bonus, and `d20` throws the die.
 */
export function settleConcentration<T extends Bearer>(args: {
  before: readonly T[]
  after: readonly T[]
  bonus: (character: T) => number
  d20: () => number
}): { characters: T[]; saves: ConcentrationSave[]; facts: string[] } {
  let characters = [...args.after]
  const saves: ConcentrationSave[] = []
  const facts: string[] = []
  for (const was of args.before) {
    const now = characters.find((character) => character.id === was.id)
    if (!was.id || !now?.concentration) continue
    const spell = spellById.get(now.concentration.spell)?.name ?? now.concentration.spell
    const lost = (was.hitPoints ?? 0) - (now.hitPoints ?? 0)
    let breaks = isDead(now) || isDown(now) || isIncapacitated(now) || hasFled(now)
    if (!breaks && lost > 0) {
      const natural = args.d20()
      const bonus = args.bonus(now)
      const dc = Math.max(10, Math.floor(lost / 2))
      const success = natural + bonus >= dc
      saves.push({ character: was.id, spell, natural, bonus, total: natural + bonus, dc, success })
      breaks = !success
    }
    if (breaks) {
      characters = endConcentration(characters, was.id).characters
      facts.push(`${now.name ?? "The caster"} loses Concentration, and ${spell} ends.`)
    }
  }
  // A spell that ends on its bearer when they take damage: Hypnotic Pattern, Suggestion.
  for (const was of args.before) {
    const now = characters.find((character) => character.id === was.id)
    if (!now || (was.hitPoints ?? 0) <= (now.hitPoints ?? 0)) continue
    const ended = [...new Set([...(now.spellEffects ?? []).map((effect) => effect.spell), ...(now.conditions ?? []).flatMap((entry) => entry.spell ?? [])])].filter((id) => ENDS_ON_DAMAGE.has(id))
    if (!ended.length) continue
    characters = characters.map((character) => (character.id === was.id ? spellEnded(character, (id) => ENDS_ON_DAMAGE.has(id)) : character))
    for (const id of ended) facts.push(`${now.name ?? "They"} took damage, and ${spellById.get(id)?.name ?? id} ends on them.`)
  }
  return { characters, saves, facts }
}

// Spells that end on a creature when it takes damage: "The spell ends for an affected creature if it takes any damage"
// (Hypnotic Pattern), and Suggestion's Charmed "until you or your allies deal damage to the target", whoever deals it here.
const ENDS_ON_DAMAGE = new Set(["hypnotic-pattern", "suggestion"])

/** A character with the effects and the conditions of the spells `gone` names taken off them, whoever cast them. */
export function spellEnded<T extends Bearer>(character: T, gone: (spellId: string) => boolean): T {
  const cleared = strip(character, (effect) => gone(effect.spell))
  if (!cleared.conditions?.some((entry) => entry.spell && gone(entry.spell))) return cleared
  const conditions = cleared.conditions.filter((entry) => !(entry.spell && gone(entry.spell)))
  const { conditions: _, ...rest } = cleared
  return (conditions.length ? { ...rest, conditions } : rest) as T
}

/**
 * A character after they move: they have left the areas that stay on the floor (Web, Stinking Cloud, Sleet Storm), and
 * no longer bear their effect. A condition the area gave stays (Web's Restrained ends by breaking free). For the move
 * code (./moves), on a move of any length.
 */
export const spellEffectsAfterMove = <T extends Bearer>(character: T): T => strip(character, (effect) => AREA_SPELLS.has(effect.spell))
