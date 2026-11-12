import type { ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import type { Check } from "./check"
import type { ConditionEntry } from "./condition-entry"
import type { ModeSource } from "./conditions"
import type { Concentration, SpellEffect } from "./turn-effect"

/**
 * Spells that last. A spell that goes on working after it is cast leaves an effect on each creature it took, by the
 * spell's SRD id and its caster. What the effect does is read from the spell's own typed data when a roll is made:
 * dice added to or taken from attack rolls, saves or checks (Bless, Bane, Guidance), Armor Class (Shield of Faith,
 * Mage Armor), damage added to its caster's hits (Hunter's Mark), and Temporary Hit Points each turn (Heroism).
 *
 * Three spells change later attack rolls in words their data does not type. They are held here, each from its text.
 */
const RIDERS: Record<string, { attacked?: "advantage"; attacks?: "disadvantage"; once?: true }> = {
  // "The next attack roll made against it before the end of your next turn has Advantage."
  "guiding-bolt": { attacked: "advantage", once: true },
  // "Attack rolls against an affected creature or object have Advantage if the attacker can see it."
  "faerie-fire": { attacked: "advantage" },
  // "It has Disadvantage on the next attack roll it makes before the end of its next turn."
  "vicious-mockery": { attacks: "disadvantage", once: true },
}

/** Whether a spell leaves an effect on those it takes. */
export function lasts(spell: Spell): boolean {
  return !!(spell.ac || spell.rollModifier || RIDERS[spell.id] || markOf(spell) || (spell.healing?.temporary && spell.healing.timing))
}

// Damage a spell adds to its caster's later hits on the one it marks: Hunter's Mark. A spell with a spell attack deals
// its hit damage at the cast, so it is not a mark.
const markOf = (spell: Spell) => (spell.attack ? undefined : spell.damage?.find((entry) => entry.trigger === "hit" && !entry.timing && !entry.appliesWhen && entry.dice))

type Bearer = {
  id?: string
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
  for (const { spell } of effectsOf(character)) total += spell.ac?.bonus ?? 0
  return total
}

/** One die a lasting spell adds to a roll, or takes from it, as it fell. */
export type RollAdd = { from: string; amount: number }

/**
 * The dice a character's spells add to a roll of theirs: an attack roll, a saving throw, or an ability check with the
 * skill the spell was cast for. `roll` throws one die of the given size.
 */
export function rollAdds(character: Bearer, kind: "attack-rolls" | "saving-throws" | "ability-checks", roll: (sides: number) => number, skill?: SkillId): RollAdd[] {
  const found: RollAdd[] = []
  for (const { effect, spell } of effectsOf(character)) {
    const modifier = spell.rollModifier
    if (!modifier?.to.includes(kind)) continue
    // Guidance is for one skill, chosen as it is cast.
    if (modifier.appliesWhen && (kind !== "ability-checks" || !effect.skill || effect.skill !== skill)) continue
    const match = /^(\d+)d(\d+)$/.exec(modifier.dice ?? "")
    const amount = match ? Array.from({ length: Number(match[1]) }, () => roll(Number(match[2]))).reduce((sum, die) => sum + die, 0) : (modifier.amount ?? 0)
    found.push({ from: spell.name, amount: modifier.subtract ? -amount : amount })
  }
  return found
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
  for (const { spell } of effectsOf(target)) if (RIDERS[spell.id]?.attacked) found.push({ mode: "advantage", from: spell.name })
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
 * them and Temporary Hit Points. A spell that lasts longer than a minute stays, and so does its caster's
 * Concentration on it: Mage Armor, Hunter's Mark, Shield of Faith. A fight that moves from one scene to the next
 * keeps the mark on its quarry.
 */
export function spellEffectsAtEncounterEnd<T extends Bearer>(character: T): T {
  const kept = (character.spellEffects ?? []).filter((effect) => effect.turns === undefined)
  const held = character.concentration && outlasts(spellById.get(character.concentration.spell)) ? character.concentration : undefined
  const { spellEffects: _, concentration: __, tempHitPoints: ___, ...rest } = character
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
    characters: characters.map((character) => {
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
  return { characters, saves, facts }
}
