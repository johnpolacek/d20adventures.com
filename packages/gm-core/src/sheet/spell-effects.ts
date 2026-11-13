import type { AbilityId, ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { hasFled, isDead, isDown, isIncapacitated } from "../utils/turn-actors"
import type { Attack } from "./attack"
import type { Check } from "./check"
import type { ModeSource } from "./conditions"
import { itemSaveModes } from "./item-effects"
import { answerDowned, keepsConcentration } from "./late-rules"
import { speciesSaveModes } from "./species-traits"
import { type Bearer, type Deflected, heldRule, spellRule } from "./spell-rules"
import type { SpellEffect } from "./turn-effect"

/**
 * Spells that last. A spell that goes on working after it is cast leaves an effect on each creature it took, by the
 * spell's SRD id and its caster. What the effect does is read from the spell's own typed data when a roll is made:
 * dice added to or taken from attack rolls, saves or checks (Bless, Bane, Guidance), Armor Class (Shield of Faith,
 * Mage Armor), damage added to its caster's hits (Hunter's Mark), and Temporary Hit Points each turn (Heroism).
 *
 * What a spell does while it lasts in words its data does not type is its own rules' `held` (./spell-rules), from the
 * files of ./spell-mechanics: Faerie Fire's Advantage against its bearer, Slow's lost Armor Class.
 */

/** Whether the caster alone holds a spell's effect, with the slot it was cast at as its `amount`: Spirit Guardians. */
export const heldByCaster = (spellId: string): boolean => !!heldRule(spellId)?.byCaster

/** Whether a spell leaves an effect on those it takes. */
export function lasts(spell: Spell): boolean {
  // One whose own rules put its effect (./spell-rules `placed`: Harm's lowered maximum) leaves none of the cast's.
  if (heldRule(spell.id)?.placed) return false
  return !!(spell.ac || spell.rollModifier || spell.hitPointMaximum || heldRule(spell.id) || markOf(spell) || (spell.healing?.temporary && spell.healing.timing))
}

// Damage a spell adds to its caster's later hits on the one it marks: Hunter's Mark. A spell with a spell attack deals
// its hit damage at the cast, so it is not a mark, and so does a spell cast right after a hit (a smite, ./classes/paladin).
const markOf = (spell: Spell) => (spell.attack || spell.castingTime.trigger ? undefined : spell.damage?.find((entry) => entry.trigger === "hit" && !entry.timing && !entry.appliesWhen && entry.dice))

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
  // What a spell takes away, from its text (./spell-rules `armorClassLess`): Slow's 2.
  for (const { spell } of effectsOf(character)) total += (spell.ac?.bonus ?? 0) - (heldRule(spell.id)?.armorClassLess ?? 0)
  return total
}

/**
 * What a character's spells add to their Hit Point maximum: Aid's 5, and 5 more for each slot level above 2, held as
 * the effect's `amount`.
 */
export const hitPointMaximumFromSpells = (character: Bearer): number =>
  effectsOf(character).reduce(
    (sum, { effect, spell }) => sum + (spell.hitPointMaximum ? (effect.amount ?? spell.hitPointMaximum.amount ?? 0) : heldRule(spell.id)?.maximumLess ? -(effect.amount ?? 0) : 0),
    0
  )

/**
 * Advantage a character's spells give their own saving throw, each with the spell: Haste on Dexterity saves, Beacon of
 * Hope on Wisdom saves and Death Saving Throws ("death"), and what a spell gives the saves of one ability by its effect
 * (`checkModesFromSpells`).
 */
export function saveModesFromSpells(character: Bearer, ability: AbilityId | "death", against: readonly ConditionId[] = []): ModeSource[] {
  return [
    ...effectsOf(character).flatMap(({ spell }) => (heldRule(spell.id)?.saveAdvantage?.includes(ability) ? [{ mode: "advantage" as const, from: spell.name }] : [])),
    // A save made to avoid or end a condition the spell guards against: Protection from Poison's Poisoned.
    ...effectsOf(character).flatMap(({ spell }) => (heldRule(spell.id)?.saveAdvantageAgainst?.some((id) => against.includes(id)) ? [{ mode: "advantage" as const, from: spell.name }] : [])),
    ...(ability === "death" ? [] : checkModesFromSpells(character, { kind: "save", ability })),
  ]
}

/**
 * Advantage and Disadvantage a character's spells give one of their checks or saves by what was chosen as each was cast
 * (./spell-rules `checkModes`): Enhance Ability's Advantage on checks with its ability, Hex's Disadvantage.
 */
export const checkModesFromSpells = (character: Bearer, check: Check): ModeSource[] => effectsOf(character).flatMap(({ effect, spell }) => heldRule(spell.id)?.checkModes?.(effect, check) ?? [])

/** Whether a character's spells give their Initiative, a Dexterity check, Advantage and nothing Disadvantage: Enhance Ability on Dexterity. */
export function initiativeAdvantageBySpell(character: Bearer): boolean {
  const modes = checkModesFromSpells(character, { kind: "ability", ability: "dex" }).map((source) => source.mode)
  return modes.includes("advantage") && !modes.includes("disadvantage")
}

/** Damage types a character resists while a spell is on them (./spell-rules `resistances`): Protection from Energy's chosen type. */
export const spellResistances = (character: Bearer): DamageTypeId[] => [...new Set(effectsOf(character).flatMap(({ effect, spell }) => heldRule(spell.id)?.resistances?.(effect) ?? []))]

/** Damage types a character is immune to while a spell is on them (./spell-rules `damageImmunities`): Mind Blank's Psychic. */
export const spellDamageImmunities = (character: Bearer): DamageTypeId[] => [...new Set(effectsOf(character).flatMap(({ spell }) => heldRule(spell.id)?.damageImmunities ?? []))]

/** What a character's spells take from each of their D20 Tests (./spell-rules `d20Less`): Raise Dead's −4, easing by 1 each Long Rest. */
export const d20PenaltyFromSpells = (character: Bearer): number => effectsOf(character).reduce((sum, { effect, spell }) => sum + (heldRule(spell.id)?.d20Less?.(effect) ?? 0), 0)

/** Whether a spell on a character makes their Speed 0 (./spell-rules `speedZero`): Power Word Stun on one it does not stun. */
export const stillBySpell = (character: Bearer): boolean => effectsOf(character).some(({ spell }) => !!heldRule(spell.id)?.speedZero)

/** The spell on a character that wards them from death (./spell-rules `wardsDeath`): Death Ward. */
export const deathWardOf = (character: Bearer): SpellEffect | undefined => character.spellEffects?.find((effect) => !!heldRule(effect.spell)?.wardsDeath)

/** A character with the spell that warded them from death spent, and its name, or none where no spell wards them. */
export function withDeathWardSpent<T extends Bearer>(character: T): { character: T; name: string } | undefined {
  const ward = deathWardOf(character)
  return ward ? { character: strip(character, (effect) => effect === ward), name: spellById.get(ward.spell)?.name ?? ward.spell } : undefined
}

/** A character's lasting spells after a rest (./spell-rules `rested`): those a rest changes, changed, and those it ends, gone. The rest are left to their duration. */
export function spellEffectsRested<T extends Bearer>(character: T, long: boolean): T {
  if (!character.spellEffects?.some((effect) => heldRule(effect.spell)?.rested)) return character
  const spellEffects = character.spellEffects.flatMap((effect) => {
    const rested = heldRule(effect.spell)?.rested
    if (!rested) return [effect]
    const left = rested(effect, long)
    return left ? [left] : []
  })
  const { spellEffects: _, ...rest } = character
  return (spellEffects.length ? { ...rest, spellEffects } : rest) as T
}

/** Whether a spell's own rules keep its effect through a rest, so the rest's hours do not end it: Harm's lowered maximum. */
export const keptByRest = (effect: SpellEffect): boolean => !!heldRule(effect.spell)?.rested

/** What a character's spells add to or take from a saving throw of one ability, each spell once: Slow's −2 on Dexterity saves. */
export const saveBonusFromSpells = (character: Bearer, ability: AbilityId): number =>
  [...new Set(effectsOf(character).map(({ spell }) => spell.id))].reduce((sum, id) => sum + (heldRule(id)?.saveBonus?.[ability] ?? 0), 0)

/**
 * The Advantage a character's spells, species and worn magic items give a check, when it is a saving throw: for a save
 * rolled outside ./spells `rollSave`, which is against no spell. `against` names the conditions the save is made to
 * avoid or end (Fey Ancestry on Charmed, a Periapt of Health on Poisoned). An ability check takes what their spells give
 * it (`checkModesFromSpells`).
 */
export const saveModesFor = (character: Bearer, check: Check, against: readonly ConditionId[] = []): ModeSource[] =>
  check.kind === "save"
    ? [...saveModesFromSpells(character, check.ability, against), ...speciesSaveModes(character, check.ability, against), ...itemSaveModes(character.sheet, against)]
    : checkModesFromSpells(character, check)

/** What a character's spells add to a check, when it is a saving throw: for a save rolled outside ./spells `rollSave`. */
export const saveBonusFor = (character: Bearer, check: Check): number => (check.kind === "save" ? saveBonusFromSpells(character, check.ability) : 0)

/** Whether a character's spells keep them from taking Reactions: Slow. */
export const cannotReactBySpell = (character: Bearer): boolean => effectsOf(character).some(({ spell }) => !!heldRule(spell.id)?.noReactions)

/** Whether a character's spells make every healing die count its most: Beacon of Hope. */
export const healsMost = (character: Bearer): boolean => effectsOf(character).some(({ spell }) => !!heldRule(spell.id)?.healsMost)

/** Whether a character's spells keep a spell off them: Shield, "and you take no damage from Magic Missile". */
export const wardedFrom = (character: Bearer, spell: Spell): boolean => effectsOf(character).some(({ spell: held }) => !!heldRule(held.id)?.wards?.(spell))

/**
 * A hit by an attack roll on one whose spell may take it in their place (Mirror Image's duplicates): the first of their
 * spells that answers. `duplicates` is how many there were before the roll.
 */
export function deflectedHit<T extends Bearer>(target: T, attacker: Bearer, roll: (sides: number) => number): Deflected<T> {
  for (const { spell } of effectsOf(target)) {
    const answered = heldRule(spell.id)?.deflects?.(target, attacker, roll)
    if (answered) return answered
  }
  return { character: target, deflected: false, dice: [], duplicates: 0 }
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
    const held = heldRule(spell.id)
    // A weapon's spell (Magic Weapon) adds to weapon attacks, not to spell attacks.
    if (held?.weapon && options.spell) continue
    // Guidance is for one skill, chosen as it is cast. A limit the engine does not measure always holds (`unmeasured`).
    if (modifier.appliesWhen && !forSkill && !held?.unmeasured && (kind !== "ability-checks" || !effect.skill || effect.skill !== skill)) continue
    const match = /^(\d+)d(\d+)$/.exec(modifier.dice ?? "")
    // Magic Weapon's bonus grows with the slot, and is held as the effect's `amount`.
    const amount = match ? Array.from({ length: Number(match[1]) }, () => roll(Number(match[2]))).reduce((sum, die) => sum + die, 0) : (effect.amount ?? modifier.amount ?? 0)
    found.push({ from: spell.name, amount: modifier.subtract ? -amount : amount })
  }
  return found
}

/**
 * Damage a character's own spells add to their weapon hits: Magic Weapon's bonus to damage rolls, held as the effect's
 * `amount`. For ./attack, beside `markDamage`.
 */
export function weaponDamageFromSpells(attacker: Bearer): { name: string; damage: { amount: number; type?: DamageTypeId } }[] {
  return effectsOf(attacker).flatMap(({ effect, spell }) => (heldRule(spell.id)?.weapon ? [{ name: spell.name, damage: { amount: effect.amount ?? spell.rollModifier?.amount ?? 1 } }] : []))
}

/** One of a character's weapon attacks as their spells make it (./spell-rules `weaponAttack`): Shillelagh's Club. */
export const attackWithSpells = (character: Bearer, attack: Attack): Attack =>
  effectsOf(character).reduce((made, { effect, spell }) => heldRule(spell.id)?.weaponAttack?.(effect, made, character) ?? made, attack)

/** The dice for a check or a save, from the check's kind. */
export const checkAdds = (character: Bearer, check: Check, roll: (sides: number) => number): RollAdd[] =>
  check.kind === "save" ? rollAdds(character, "saving-throws", roll) : rollAdds(character, "ability-checks", roll, check.kind === "skill" ? check.skill : undefined)

/**
 * Damage an attacker's own spell adds to a hit on this target: Hunter's Mark's d6 on the one marked. `die` is the size
 * of its die where the attacker's feature changes it (Foe Slayer's d10).
 */
export function markDamage(attackerId: string | undefined, target: Bearer, die?: (spellId: string) => number | undefined): { name: string; damage: { dice: string; type: DamageTypeId } }[] {
  if (!attackerId) return []
  return effectsOf(target).flatMap(({ effect, spell }) => {
    const mark = markOf(spell)
    if (!mark?.dice || effect.by !== attackerId) return []
    const sides = die?.(spell.id)
    return [{ name: spell.name, damage: { dice: sides ? mark.dice.replace(/d\d+$/, `d${sides}`) : mark.dice, type: mark.types[0] } }]
  })
}

/** Advantage and Disadvantage that lasting spells put on an attack roll: Faerie Fire and Guiding Bolt on the one attacked, Vicious Mockery on the attacker. */
export function attackModesFromSpells(attacker: Bearer, target: Bearer): ModeSource[] {
  const found: ModeSource[] = []
  for (const { spell } of effectsOf(target)) {
    const side = heldRule(spell.id)?.attacked
    if (side) found.push({ mode: side, from: spell.name })
    // By who attacks: Protection from Evil and Good against a Fiend.
    const from = heldRule(spell.id)?.attackedFrom?.(attacker)
    if (from) found.push({ mode: from, from: spell.name })
  }
  for (const { spell } of effectsOf(attacker)) {
    const side = heldRule(spell.id)?.attacks
    if (side) found.push({ mode: side, from: spell.name })
  }
  return found
}

/** Everyone after an attack roll, with the spells it used up: one that is for the next attack only is spent by it. */
export function afterAttackRoll<T extends Bearer>(characters: readonly T[], attackerId: string, targetId: string): T[] {
  const once = (side: "attacked" | "attacks") => (effect: SpellEffect) => !!heldRule(effect.spell)?.once && !!heldRule(effect.spell)?.[side]
  return characters.map((character) => (character.id === targetId ? strip(character, once("attacked")) : character.id === attackerId ? strip(character, once("attacks")) : character))
}

/** Conditions a character cannot be given while a spell is on them: Heroism shuts out Frightened. */
export const spellImmunities = (character: Bearer): ConditionId[] => [...new Set((character.spellEffects ?? []).flatMap((effect) => heldRule(effect.spell)?.immunities ?? []))]

/** Whether a spell on a character keeps a condition off them, given by this spell or none (./spell-rules `shutsOut`): Freedom of Movement's Restrained by a spell. */
export const shutOutBySpell = (character: Bearer, condition: ConditionId, spell: string | undefined): boolean =>
  (character.spellEffects ?? []).some((effect) => !!heldRule(effect.spell)?.shutsOut?.(condition, spell))

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
 * keeps the mark on its quarry. An area that stays on the floor (Web, Moonbeam, a wall) ends, with Concentration on it.
 */
export function spellEffectsAtEncounterEnd<T extends Bearer>(character: T): T {
  // An area left on the floor stays where it was put, and the story has left it: its spell ends (./floor-areas).
  const left = (character.spellEffects ?? []).filter((effect) => effect.at).map((effect) => effect.spell)
  const kept = (character.spellEffects ?? []).filter((effect) => effect.turns === undefined && !effect.at)
  const concentrating = character.concentration && !left.includes(character.concentration.spell) ? character.concentration : undefined
  const held = concentrating && outlasts(spellById.get(concentrating.spell)) ? concentrating : undefined
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
      // What the spell's ending does to one it was on (./spell-rules `ended`): Haste's lethargy.
      const character = spellRule(held)?.ended?.(before, casterId) ?? before
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
 * bonus, and `d20` throws the die. Before that, a hero it dropped to 0 hit points may still stand by a class feature
 * (../class-rules `afterDowned` through ./late-rules: Relentless Rage), told with the facts.
 */
export function settleConcentration<T extends Bearer>(args: {
  before: readonly T[]
  after: readonly T[]
  bonus: (character: T) => number
  /** Advantage or Disadvantage a caster's class gives the save (../class-rules `classConcentrationModes`). */
  modes?: (character: T) => readonly ModeSource[]
  d20: () => number
}): { characters: T[]; saves: ConcentrationSave[]; facts: string[] } {
  const stood = answerDowned({ before: args.before, after: args.after, d20: args.d20 })
  let characters = stood.characters
  const saves: ConcentrationSave[] = []
  const facts: string[] = stood.told.map((told) => told.text)
  for (const was of args.before) {
    const now = characters.find((character) => character.id === was.id)
    if (!was.id || !now?.concentration) continue
    const spell = spellById.get(now.concentration.spell)?.name ?? now.concentration.spell
    const lost = (was.hitPoints ?? 0) - (now.hitPoints ?? 0)
    let breaks = isDead(now) || isDown(now) || isIncapacitated(now) || hasFled(now)
    // A class feature may keep damage from breaking it, and then no save is made (Relentless Hunter's Hunter's Mark).
    if (!breaks && lost > 0 && !keepsConcentration(now, now.concentration.spell)) {
      // A class may give the save Advantage or Disadvantage (Eldritch Mind): two d20s, the higher or the lower kept.
      const modes = (args.modes?.(now) ?? []).map((source) => source.mode)
      const mode = modes.includes("advantage") === modes.includes("disadvantage") ? "normal" : modes.includes("advantage") ? "advantage" : "disadvantage"
      const natural = mode === "normal" ? args.d20() : (mode === "advantage" ? Math.max : Math.min)(args.d20(), args.d20())
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
  // A spell that ends on its bearer when they take damage (./spell-rules `endsOnDamage`): Hypnotic Pattern, Suggestion.
  const endsOnDamage = (id: string) => !!spellRule(id)?.endsOnDamage
  const spellsOn = (character: T) => [...new Set([...(character.spellEffects ?? []).map((effect) => effect.spell), ...(character.conditions ?? []).flatMap((entry) => entry.spell ?? [])])]
  for (const was of args.before) {
    const now = characters.find((character) => character.id === was.id)
    if (!now || (was.hitPoints ?? 0) <= (now.hitPoints ?? 0)) continue
    const ended = spellsOn(now).filter(endsOnDamage)
    if (!ended.length) continue
    characters = characters.map((character) => (character.id === was.id ? spellEnded(character, endsOnDamage) : character))
    for (const id of ended) facts.push(`${now.name ?? "They"} took damage, and ${spellById.get(id)?.name ?? id} ends on them.`)
  }
  // What else damage to its bearer does, by the spell's own rules (./spell-rules `damaged`).
  for (const was of args.before) {
    const lost = (was.hitPoints ?? 0) - (characters.find((character) => character.id === was.id)?.hitPoints ?? 0)
    if (lost <= 0) continue
    for (const id of spellsOn(characters.find((character) => character.id === was.id) as T)) {
      const bearer = characters.find((character) => character.id === was.id)
      const answered = bearer && spellRule(id)?.damaged?.({ bearer, lost, d20: args.d20, characters })
      if (!answered) continue
      characters = characters.map((character) => (character.id === was.id ? answered.bearer : character))
      facts.push(...answered.facts)
    }
  }
  return { characters, saves, facts }
}

/** A character with the effects and the conditions of the spells `gone` names taken off them, whoever cast them. */
export function spellEnded<T extends Bearer>(character: T, gone: (spellId: string) => boolean): T {
  const cleared = strip(character, (effect) => gone(effect.spell))
  if (!cleared.conditions?.some((entry) => entry.spell && gone(entry.spell))) return cleared
  const conditions = cleared.conditions.filter((entry) => !(entry.spell && gone(entry.spell)))
  const { conditions: _, ...rest } = cleared
  return (conditions.length ? { ...rest, conditions } : rest) as T
}
