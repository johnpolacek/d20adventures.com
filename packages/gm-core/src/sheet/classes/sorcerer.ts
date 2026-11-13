import type { DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import type { DamageRoll } from "../attack"
import type { Roller } from "../check"
import type { BonusActionRule, CastChoice, CastInput, ChoiceCast, ClassRules, Featured, Lasting, Rested } from "../class-rules"
import { deriveSheet } from "../derive"
import { featureUseCount, hasFeature, usedThisTurn, usesLeft, withFeatureUsed, withUsedThisTurn } from "../feature-rules"
import { areEnemies, sameSide } from "../sides"
import { withSpellEffect } from "../spell-effects"
import { type Cast, type Castee, conditionSpanOf, slotsLeft, spellLabel, spellsOf, withCastSpent } from "../spells"
import type { SpellEffect, TurnEffect } from "../turn-effect"

/**
 * The Sorcerer's features in play, levels 1 to 20, with Draconic Sorcery. Draconic Resilience's hit points and Armor
 * Class, Elemental Affinity's Resistance, the Draconic Spells always prepared, the later Ability Score Improvements and
 * Metamagic options, and Dragon Companion's casting of Summon Dragon with no slot are the sheet's (../derive), and the
 * Sorcerer casts through the same path as any caster. Summon Dragon is told, and so is Dragon Companion's casting of it
 * with no Concentration. The Epic Boon is the feat's.
 *
 * Innate Sorcery: a Bonus Action, two uses a Long Rest. For 1 minute, kept as the lasting effect "innate-sorcery" for 10
 * rounds as Sacred Weapon is, the save DC of the Sorcerer's own class spells rises by 1 and their spell attacks have
 * Advantage. A spell from a feat (Magic Initiate) is no Sorcerer spell.
 * Font of Magic (level 2): Sorcery Points are the feature's uses, by the class table's column, back on a Long Rest.
 * Creating a spell slot is a Bonus Action on the read's menu, a level at a time, at the cost and Sorcerer level of the
 * data's table. A created slot is kept on `featureUses` under "sorcerer-font-of-magic:slot-<level>" and counted beside
 * the table's slots (../spells `slotsLeft`) until a Long Rest clears it. Converting a slot to points takes no action, and
 * the engine does it by a plain rule: when Sorcery Points are owed and too few are left, it expends the lowest slot that
 * covers the rest, never the slot the cast itself spends. The points it gives stop at the table's count. Converting
 * ahead of need gains nothing, so it is not offered alone.
 * Metamagic (level 2): the options picked on the sheet (`featurePicks`) ride a spell cast as the action, one a spell,
 * each spending its Sorcery Points as the cast is resolved. Seeking Spell and Empowered Spell may go with another, as
 * their text says. Run: Careful (allies caught by its save are left out of it, which is what an automatic success with
 * no damage on a success is for a spell whose every effect rides that save), Distant (the range doubled, or 30 feet for
 * a touch, where space is measured), Empowered (below), Extended (below), Heightened (Disadvantage on one foe's save,
 * only on a spell whose every save is made as it is cast), Seeking (spent only on a miss), Subtle (no components, so no
 * Counterspell can see it), Transmuted (the damage type of the read's "damageType") and Twinned (the cast takes effect
 * one level higher, and its slot is spent at its own).
 * - Empowered Spell, by a plain rule: on the cast's first damage roll, the lowest dice that fell below their die's
 *   average are rolled again, as many as the Charisma modifier (at least one), and the new rolls stand. With none below
 *   the average nothing is rerolled and the point is kept.
 * - Extended Spell: a spell of 1 minute or longer. What the engine counts of its minute in rounds, its effects and the
 *   conditions that last as long as it does, is counted twice as long. A longer spell outlasts the fight already, and
 *   the engine keeps no clock past a rest, so its doubling is told. While the Sorcerer concentrates on it they have
 *   Advantage on saves to keep it, by the lasting mark "extended-spell", whose `choice` is the spell.
 * - Quickened Spell (`bonusCasts`): a spell with a casting time of an action is offered among the Bonus Action spells
 *   while the Sorcerer could pay 2 Sorcery Points, and is cast by the Bonus Action's path, which pays them as it is cast
 *   (../../services/bonus-action). Beside it the action may be an attack, a Dash or a cantrip: the read keeps a spell
 *   cast with the Bonus Action beside a cast with the action only where that cast is a cantrip, so no spell of level 1
 *   or higher is cast on the same turn (../../services/roll-requirement-service). The Bonus Action is resolved before
 *   the action, so no spell of the turn's own comes before it. A reaction's spell on the Sorcerer's own turn is not
 *   counted. Quickened is the one option a Bonus Action cast takes: no other rides it, Sorcery Incarnate's second neither.
 * Sorcerous Restoration (level 5): as a Short Rest ends with Sorcery Points spent, the Sorcerer regains up to half their
 * Sorcerer level rounded down, once a Long Rest.
 * Sorcery Incarnate (level 7): with no use of Innate Sorcery left, a Bonus Action of its own unleashes it for 2 Sorcery
 * Points. While Innate Sorcery is on, a second Metamagic option rides the cast beside the first ("secondMetamagic"),
 * another than the first. One that cannot be paid for is dropped, and the spell keeps the other's shape.
 * Arcane Apotheosis (level 20): while Innate Sorcery is on, the first option paid for on each of the Sorcerer's turns
 * costs no points, marked by the once-a-turn mark "arcane-apotheosis".
 *
 * Draconic Sorcery:
 * - Elemental Affinity (level 6): the Charisma modifier is added to the cast's first damage roll that deals the type
 *   chosen on the sheet, as the part of that type.
 * - Dragon Wings (level 14): a Bonus Action, once a Long Rest, or for 3 Sorcery Points when the use is spent, puts on the
 *   lasting effect "dragon-wings" for 1 hour: it outlasts a fight and ends with a rest. The floor is flat and has no
 *   height, so a Fly Speed of 60 feet there is a move of 60 feet (./class-rules `speed`). Rough ground still costs
 *   double, and flying over a foe's reach is the story's. Dismissing the wings is told.
 */

const INNATE = "sorcerer-innate-sorcery"
const FONT = "sorcerer-font-of-magic"
const METAMAGIC = "sorcerer-metamagic"
const RESTORATION = "sorcerer-sorcerous-restoration"
const INCARNATE = "sorcerer-sorcery-incarnate"
const APOTHEOSIS = "sorcerer-arcane-apotheosis"
const QUICKENED = "quickened-spell"
const AFFINITY = "draconic-sorcery-elemental-affinity"
const WINGS = "draconic-sorcery-dragon-wings"

// The marks of Metamagic kept on a character: Extended Spell's lasting one, and Empowered Spell's while its cast resolves.
const EXTENDED = "extended-spell"
const EMPOWERED = "empowered-spell"

// Innate Sorcery lasts 1 minute: 10 rounds.
const INNATE_ROUNDS = 10

// Sorcery Incarnate's price, Dragon Wings' restoring and its Fly Speed, from the text (SRD 5.2.1, pages 66 and 70). The
// data does not type them.
const INCARNATE_POINTS = 2
const WINGS_POINTS = 3
const WINGS_SPEED = 60

// Transmuted Spell's list: "Acid, Cold, Fire, Lightning, Poison, Thunder" (SRD 5.2.1, page 67). The data does not type it.
const TRANSMUTABLE: readonly DamageTypeId[] = ["acid", "cold", "fire", "lightning", "poison", "thunder"]

// Extended Spell's cap: "to a maximum duration of 24 hours", in minutes.
const LONGEST = 24 * 60

/** Whether a hero's Innate Sorcery is on: the lasting effect they gave themselves. */
export const innateSorceryOn = (character: Lasting): boolean => !!character.spellEffects?.some((effect) => effect.spell === "innate-sorcery" && (!character.id || effect.by === character.id))

/** Whether a hero's Dragon Wings are out: the lasting effect they gave themselves. */
export const dragonWingsOut = (character: Lasting): boolean => !!character.spellEffects?.some((effect) => effect.spell === "dragon-wings" && (!character.id || effect.by === character.id))

/** The key a created spell slot of a level is kept under, in `featureUses`. */
export const createdSlotKey = (level: number): string => `${FONT}:slot-${level}`

/** The Creating Spell Slots table from the data: each slot level, its Sorcery Point cost and the Sorcerer level it needs. */
export const slotCreation = (): readonly { slotLevel: number; cost: number; minLevel: number }[] =>
  (classFeatureById.get(FONT) as { slotCreation?: { slotLevel: number; cost: number; minLevel: number }[] } | undefined)?.slotCreation ?? []

/** What a Metamagic option costs, in Sorcery Points, by the data. */
export const metamagicCost = (option: string): number =>
  (classFeatureById.get(METAMAGIC)?.options?.find((entry) => entry.id === option) as { spend?: { amount?: number } } | undefined)?.spend?.amount ?? 1

// A hero with Sorcery Points spent, or with some back: never below none spent.
const withPointsSpent = <T extends Rested>(character: T, points: number): T => {
  const spent = Math.max(0, (character.featureUses?.[FONT] ?? 0) + points)
  const { [FONT]: _, ...rest } = character.featureUses ?? {}
  return { ...character, featureUses: { ...rest, ...(spent ? { [FONT]: spent } : {}) } }
}

/**
 * A hero who pays Sorcery Points, converting a spell slot first where too few are left: the lowest slot whose level
 * covers the rest, never the one at `keep`, which the cast itself spends. A slot's points stop at the table's count. None
 * when the hero cannot pay. A level 5 Sorcerer with 1 point left pays 2 by expending a level 1 slot.
 */
export function paidPoints<T extends Rested>(character: T, cost: number, keep?: number): { character: T; converted?: number } | undefined {
  if (!character.sheet || !hasFeature(character, FONT)) return undefined
  const left = usesLeft(character, FONT)
  if (left >= cost) return { character: withPointsSpent(character, cost) }
  const short = cost - left
  const slots = slotsLeft(character).map((count, index) => count - (index + 1 === keep ? 1 : 0))
  const level = slots.findIndex((count, index) => count > 0 && index + 1 >= short) + 1
  if (level < 1) return undefined
  const gained = Math.min(level, character.featureUses?.[FONT] ?? 0)
  return { character: withPointsSpent(withPointsSpent(withCastSpent(character, { kind: "slot", level }), -gained), cost), converted: level }
}

// One who pays for a Metamagic option: a hero with points and slots, the lasting effects that say Innate Sorcery is on,
// and the turn's marks.
type Payer = Rested & Lasting & { turnEffects?: readonly TurnEffect[] }

// Whether Arcane Apotheosis pays for the next option: Innate Sorcery is on and none has been free this turn. A
// Metamagic option rides the Sorcerer's own cast, so the turn is theirs.
const apotheosisFree = (character: Payer): boolean => hasFeature(character, APOTHEOSIS) && innateSorceryOn(character) && !usedThisTurn(character, APOTHEOSIS, character.id)

/** A hero who pays for a Metamagic option: free by Arcane Apotheosis once a turn, or its Sorcery Points (`paidPoints`). */
export function paidOption<T extends Payer>(character: T, id: string, keep?: number): { character: T; converted?: number; free?: true } | undefined {
  if (apotheosisFree(character)) return { character: withUsedThisTurn(character, APOTHEOSIS, character.id), free: true }
  return paidPoints(character, metamagicCost(id), keep)
}

// Whether a hero could pay for an option now, by converting a slot if need be.
const canPay = (character: Payer, id: string, keep?: number) => !!paidOption(character, id, keep)

// Facts of a payment, for the story.
const paidWords = (name: string, id: string, paid: { converted?: number; free?: true }) => {
  const title = classFeatureById.get(METAMAGIC)?.options?.find((entry) => entry.id === id)?.name ?? id
  if (paid.free) return `${name} uses ${title} with no Sorcery Points spent, by Arcane Apotheosis`
  const cost = metamagicCost(id)
  return `${paid.converted ? `${name} expends a level ${paid.converted} spell slot for Sorcery Points. ` : ""}${name} spends ${cost} Sorcery ${cost === 1 ? "Point" : "Points"} on ${title}`
}

// Whether a spell's every save is made as it is cast, and nothing of it is saved against later: no area that stays.
const savedAtCast = (spell: Spell): boolean =>
  !!spell.saves?.length &&
  spell.saves.every((save) => save.when === "initial" && !save.timing) &&
  !(spell.range.area && spell.duration.kind !== "instantaneous") &&
  ![...(spell.damage ?? []), ...(spell.conditions ?? [])].some((entry) => "timing" in entry && entry.timing)

// A Sorcerer spell: one their class casts, not one a feat gave them.
const ownSpell = (character: Rested, spell: Spell): boolean => spellsOf(character).some((known) => known.spell.id === spell.id && !known.ability)

// A spell's duration in minutes, where it is timed: none for one that is instantaneous, until dispelled or special.
const minutesOf = (spell: Spell): number => {
  const { duration } = spell
  if (duration.kind !== "timed") return 0
  const per = { round: 0.1, minute: 1, hour: 60, day: LONGEST } as Record<string, number>
  return (duration.amount ?? 1) * (per[duration.unit ?? ""] ?? 0)
}

// A duration in minutes, in words: "2 minutes", "2 hours", "24 hours".
const minutesWords = (minutes: number): string => (minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minute${minutes === 1 ? "" : "s"}`)

/** A Metamagic option the engine runs: what it costs, the spells it fits, how it shapes the spell, and what it does as it resolves. */
type Option = {
  id: string
  words: string
  fits: (caster: Rested, cast: ChoiceCast) => boolean
  shape?: (cast: ChoiceCast) => Pick<ChoiceCast, "spell" | "level">
  // What it does as the cast resolves, after the points are paid: the cast it hands on, and what it leaves after.
  apply?: <T extends Castee>(args: { input: CastInput<T>; caster: T; resolve: (input: CastInput<T>) => Cast<T> }) => { cast: Cast<T>; fact?: string } | undefined
}

const OPTIONS: readonly Option[] = [
  {
    id: "careful-spell",
    words: "allies caught by its saving throw are spared",
    fits: (_, { spell }) =>
      spellLabel(spell) !== "told" &&
      !spell.attack &&
      !spell.healing &&
      !!spell.saves?.some((save) => save.when === "initial" && !save.timing) &&
      (spell.damage ?? []).every((entry) => entry.trigger === "failed-save"),
    // "Choose a number of those creatures up to your Charisma modifier (minimum of one creature)": the caster's allies
    // among those it takes, in the order named. With every effect riding the save, an automatic success that takes no
    // damage leaves them out of it.
    apply: ({ input, caster, resolve }) => {
      const most = Math.max(1, caster.sheet ? deriveSheet(caster.sheet).abilityModifiers.cha : 1)
      const spared = input.targets
        .filter((id) => {
          const other = input.characters.find((each) => each.id === id)
          return id !== caster.id && !!other && sameSide(other, caster)
        })
        .slice(0, most)
      if (!spared.length) return undefined
      const names = spared.map((id) => input.characters.find((other) => other.id === id)?.name ?? id)
      return {
        cast: resolve({ ...input, targets: input.targets.filter((id) => !spared.includes(id)) }),
        fact: `${names.join(" and ")} ${spared.length === 1 ? "succeeds" : "succeed"} on the save at once and ${spared.length === 1 ? "takes" : "take"} none of it.`,
      }
    },
  },
  {
    id: "distant-spell",
    words: "twice the range, or 30 feet for a touch",
    fits: (_, { spell }) => (spell.range.kind === "feet" && (spell.range.distance ?? 0) >= 5) || (spell.range.kind === "touch" && !spell.range.area),
    shape: ({ spell, level }) => ({
      spell: { ...spell, range: spell.range.kind === "touch" ? { kind: "feet", distance: 30 } : { ...spell.range, distance: (spell.range.distance ?? 0) * 2 } },
      level,
    }),
  },
  {
    id: "extended-spell",
    words: "it lasts twice as long, to no more than 24 hours, with Advantage on saves to keep Concentration on it",
    fits: (_, { spell }) => minutesOf(spell) >= 1,
    // What is counted of its minute in rounds is counted twice: its effects, and the conditions that last as it does.
    // Those that run their own span (Color Spray's turn) are left alone.
    apply: ({ input, caster, resolve }) => {
      const { spell } = input
      const cast = resolve(input)
      const rounds = minutesOf(spell) * 10
      const longer = <T extends Castee>(character: T): T => {
        const spellEffects = character.spellEffects?.map((effect) =>
          effect.spell === spell.id && effect.by === caster.id && (effect.turns ?? 0) >= rounds ? { ...effect, turns: (effect.turns ?? 0) + rounds } : effect
        )
        const conditions = character.conditions?.map((entry) =>
          entry.spell === spell.id && entry.source === caster.id && (entry.turns ?? 0) >= rounds && !conditionSpanOf(spell, entry.id) ? { ...entry, turns: (entry.turns ?? 0) + rounds } : entry
        )
        return { ...character, ...(spellEffects ? { spellEffects } : {}), ...(conditions ? { conditions } : {}) }
      }
      let characters = cast.characters.map(longer)
      // The mark that gives Advantage on saves to keep Concentration on it lasts as long as the spell's effects and
      // conditions do, or with none counted in rounds, until its Concentration ends.
      if (spell.duration.concentration) {
        const turns = Math.max(
          0,
          ...characters.flatMap((character) => [
            ...(character.spellEffects ?? []).flatMap((effect) => (effect.spell === spell.id && effect.by === caster.id ? [effect.turns ?? 0] : [])),
            ...(character.conditions ?? []).flatMap((entry) => (entry.spell === spell.id && entry.source === caster.id ? [entry.turns ?? 0] : [])),
          ])
        )
        characters = characters.map((character) =>
          character.id === caster.id ? withSpellEffect(character, { spell: EXTENDED, by: caster.id, choice: spell.id, ...(turns ? { turns } : {}) }) : character
        )
      }
      return {
        cast: { ...cast, characters },
        fact: `${spell.name} lasts ${minutesWords(Math.min(LONGEST, minutesOf(spell) * 2))}${spell.duration.concentration ? `, and ${caster.name} has Advantage on saves to keep Concentration on it` : ""}.`,
      }
    },
  },
  {
    id: "heightened-spell",
    words: "one foe it takes has Disadvantage on its save",
    fits: (_, { spell }) => spellLabel(spell) !== "told" && savedAtCast(spell),
    // The first of those it takes who is the caster's enemy (../sides). Its saves are all made now, so the mark is taken off after.
    apply: ({ input, caster, resolve }) => {
      const foe = input.targets.find((id) => {
        const other = input.characters.find((each) => each.id === id)
        return other && areEnemies(other, caster) && !other.dead
      })
      if (!foe) return undefined
      const marked = input.characters.map((other) => (other.id === foe ? mark(other, caster.id) : other))
      const cast = resolve({ ...input, characters: marked })
      return {
        cast: { ...cast, characters: cast.characters.map((other) => (other.id === foe ? unmark(other) : other)) },
        fact: `${input.characters.find((other) => other.id === foe)?.name} has Disadvantage on the save.`,
      }
    },
  },
  {
    id: "subtle-spell",
    words: "cast with no words, gestures or materials, so no one sees it cast to Counterspell it",
    fits: (_, { spell }) => spell.components.verbal || spell.components.somatic || !!spell.components.material,
    // "except Material components that are consumed by the spell or that have a cost specified in the spell".
    shape: ({ spell, level }) => {
      const material = spell.components.material
      const kept = material && (material.consumed !== "none" || material.costs?.length) ? { material } : {}
      return { spell: { ...spell, components: { verbal: false, somatic: false, ...kept } }, level }
    },
  },
  {
    id: "transmuted-spell",
    words: 'its acid, cold, fire, lightning, poison or thunder damage becomes another of those, given as "damageType"',
    fits: (_, { spell, damageType }) =>
      !!damageType &&
      TRANSMUTABLE.includes(damageType) &&
      (spell.damage ?? []).some((entry) => entry.types.some((type) => TRANSMUTABLE.includes(type as DamageTypeId)) && !entry.types.includes(damageType)),
    shape: ({ spell, level, damageType }) => ({
      spell: {
        ...spell,
        damage: spell.damage?.map((entry) => (damageType && entry.types.some((type) => TRANSMUTABLE.includes(type as DamageTypeId)) ? { ...entry, types: [damageType] } : entry)),
      },
      level,
    }),
  },
  {
    id: "twinned-spell",
    words: "cast as if one level higher, to take one more creature",
    fits: (_, { spell, level }) => spell.level >= 1 && (spell.extraTargetsPerSlot ?? 0) > 0 && level < 9,
    shape: ({ spell, level }) => ({ spell, level: level + 1 }),
  },
]

const option = (id: string | true | undefined): Option | undefined => OPTIONS.find((entry) => entry.id === id)

// Heightened Spell's mark on its one target, held only while the cast's saves are made, and Empowered Spell's on the caster.
const mark = <T extends { turnEffects?: readonly TurnEffect[] }>(character: T, by: string, id = "heightened-spell"): T => ({
  ...character,
  turnEffects: [...(character.turnEffects ?? []), { id, by, turns: 2 }],
})
const unmark = <T extends { turnEffects?: readonly TurnEffect[] }>(character: T, id = "heightened-spell"): T => {
  const turnEffects = (character.turnEffects ?? []).filter((effect) => effect.id !== id)
  const { turnEffects: _, ...rest } = character
  return (turnEffects.length ? { ...rest, turnEffects } : rest) as T
}

// The Metamagic options a hero picked, by id.
const picked = (character: Roller): string[] => (hasFeature(character, METAMAGIC) ? (character.sheet?.featurePicks?.[METAMAGIC] ?? []).map((entry) => entry.option) : [])

// The most a hero could pay now: their points and the highest slot they could convert, or any cost while Arcane
// Apotheosis would pay it.
const purse = (character: Payer): number =>
  apotheosisFree(character) ? Number.POSITIVE_INFINITY : usesLeft(character, FONT) + Math.max(0, ...slotsLeft(character).map((count, index) => (count > 0 ? index + 1 : 0)))

// The choices that hold the options which shape a spell, the first before the second.
const SHAPING = ["metamagic", "secondMetamagic"] as const

// The options riding a cast that shape it, by the choice that holds each. The second is dropped when it is the first again.
const riding = (choices: Readonly<Record<string, string | true>> | undefined): { key: string; id: string }[] =>
  SHAPING.flatMap((key) => {
    const value = choices?.[key]
    return typeof value === "string" && option(value) && !(key === "secondMetamagic" && value === choices?.metamagic) ? [{ key, id: value }] : []
  })

// The spell and level of a cast as the options riding it make them, without the one held under `without`: what is cast
// when that one is dropped. Each option shapes the spell from its data in turn, the first before the second.
function shapedWithout<T extends Castee>(input: CastInput<T>, choices: Readonly<Record<string, string | true>> | undefined, without: string): Pick<CastInput<T>, "spell" | "level"> {
  const ridden = riding(choices)
  const spell = spellById.get(input.spell.id) ?? input.spell
  const level = (input.level ?? spell.level) - ridden.filter((entry) => entry.id === "twinned-spell").length
  let now: Pick<ChoiceCast, "spell" | "level"> = { spell, level }
  for (const entry of ridden) if (entry.key !== without) now = option(entry.id)?.shape?.({ ...now, ...(input.damageType ? { damageType: input.damageType } : {}) }) ?? now
  return { spell: now.spell, level: now.level }
}

// A cast choice under `key` that pays its option's points as the cast resolves. One that cannot be paid then, or finds no
// one to use itself on, is cast without it, as the spell is with the other option's shape: its points are kept.
function paying(key: (typeof SHAPING)[number]): CastChoice {
  const chosenOf = (value: string | true, choices: Readonly<Record<string, string | true>> | undefined) =>
    riding({ ...choices, [key]: value }).some((entry) => entry.key === key) ? option(value) : undefined
  return {
    fits: (caster, cast, value) => {
      const chosen = chosenOf(value, cast.chosen)
      return !!chosen && chosen.fits(caster, cast) && canPay(caster, chosen.id, cast.slot)
    },
    shape: (cast, value) => chosenOf(value, cast.chosen)?.shape?.(cast) ?? cast,
    around: ({ input, value, slot, choices, resolve }) => {
      const chosen = chosenOf(value, choices)
      const caster = input.characters.find((character) => character.id === input.casterId)
      const plain = () => resolve({ ...input, ...shapedWithout(input, choices, key) })
      if (!chosen) return resolve(input)
      if (!caster || !canPay(caster, chosen.id, slot)) return plain()
      const applied = chosen.apply ? chosen.apply({ input, caster, resolve }) : { cast: resolve(input) }
      if (!applied) return plain()
      const after = applied.cast.characters.find((character) => character.id === input.casterId)
      const paid = after && paidOption(after, chosen.id, slot)
      if (!paid) return plain()
      return {
        ...applied.cast,
        characters: applied.cast.characters.map((character) => (character.id === input.casterId ? paid.character : character)),
        facts: [`${paidWords(caster.name, chosen.id, paid)}: ${chosen.words}.${applied.fact ? ` ${applied.fact}` : ""}`, ...applied.cast.facts],
      }
    },
  }
}

/** Seeking Spell: a spell attack that misses is thrown again, for 1 Sorcery Point, and the new roll stands. One attack only, not a ray of several. */
const seeking: CastChoice = {
  fits: (caster, { spell, slot }) => !!spell.attack && !spell.projectiles && canPay(caster, "seeking-spell", slot),
  around: ({ input, slot, resolve }) => {
    const first = resolve(input)
    if (!first.attack || first.attack.roll.hit || first.rays) return first
    const again = resolve({ ...input, attackDice: undefined })
    const caster = again.characters.find((character) => character.id === input.casterId)
    const paid = caster && paidOption(caster, "seeking-spell", slot)
    if (!caster || !paid) return first
    const missed = first.attack.roll
    return {
      ...again,
      characters: again.characters.map((character) => (character.id === input.casterId ? paid.character : character)),
      facts: [
        `${caster.name}'s ${input.spell.name} misses (${missed.total} against Armor Class ${missed.armorClass}). ${paidWords(caster.name, "seeking-spell", paid)} and rolls the d20 again.`,
        ...again.facts,
      ],
    }
  },
}

// The words Empowered Spell's reroll starts with, by which its cast knows it was used.
const EMPOWERED_WORDS = "Empowered Spell: "

/**
 * Empowered Spell: the caster is marked while the cast resolves, and the cast's first damage roll rerolls its lowest
 * dice below average (`empoweredRoll`). The point is paid only when a die was rerolled.
 */
const empowered: CastChoice = {
  fits: (caster, { spell, slot }) => spellLabel(spell) !== "told" && !!spell.damage?.length && canPay(caster, EMPOWERED, slot),
  around: ({ input, slot, resolve }) => {
    const cast = resolve({ ...input, characters: input.characters.map((character) => (character.id === input.casterId ? mark(character, input.casterId, EMPOWERED) : character)) })
    const characters = cast.characters.map((character) => (character.id === input.casterId ? unmark(character, EMPOWERED) : character))
    const caster = characters.find((character) => character.id === input.casterId)
    if (!caster || !cast.facts.some((fact) => fact.startsWith(EMPOWERED_WORDS))) return { ...cast, characters }
    const paid = paidOption(caster, EMPOWERED, slot)
    if (!paid) return resolve(input)
    return {
      ...cast,
      characters: characters.map((character) => (character.id === input.casterId ? paid.character : character)),
      facts: [`${paidWords(caster.name, EMPOWERED, paid)}.`, ...cast.facts],
    }
  },
}

/**
 * A damage roll with Empowered Spell's rerolls: the dice furthest below their die's average ((sides + 1) / 2) first, as
 * many as `count`, each thrown again with `roll`, the new roll standing. None when no die fell below the average. 2d10
 * that fell 1 and 6 with a count of 1 reroll the 1. 3d6 that fell 2, 2 and 4 with a count of 5 reroll both 2s.
 */
export function empoweredRoll(rolled: DamageRoll, count: number, roll: (sides: number) => number): { rolled: DamageRoll; from: number[]; to: number[] } | undefined {
  const low = rolled.parts
    .flatMap((part, at) => (part.sides ? part.dice.map((die, index) => ({ at, index, die, below: ((part.sides as number) + 1) / 2 - die })) : []))
    .filter((entry) => entry.below > 0)
    .sort((a, b) => b.below - a.below)
    .slice(0, Math.max(1, count))
  if (!low.length) return undefined
  const to: number[] = []
  const parts = rolled.parts.map((part, at) => {
    const dice = part.dice.map((die, index) => {
      if (!low.some((entry) => entry.at === at && entry.index === index)) return die
      const again = roll(part.sides as number)
      to.push(again)
      return again
    })
    return { ...part, dice, total: Math.max(0, dice.reduce((sum, die) => sum + die, 0) + part.bonus) }
  })
  return { rolled: { parts, total: parts.reduce((sum, part) => sum + part.total, 0) }, from: low.map((entry) => entry.die), to }
}

// The menu line for a slot of a level made from Sorcery Points, a Bonus Action.
const createSlot = (level: number): BonusActionRule => ({
  id: `font-of-magic-slot-${level}`,
  feature: FONT,
  name: `Font of Magic: Create a Level ${level} Spell Slot`,
  spends: true,
  note: "font-of-magic-slot-N turns Sorcery Points into a spell slot of level N, which lasts until a Long Rest, when the player's words call for it. The count beside each is the Sorcery Points left.",
  offer: (character) => {
    const row = slotCreation().find((entry) => entry.slotLevel === level)
    return !!row && !!character.sheet && character.sheet.level >= row.minLevel && usesLeft(character as Rested, FONT) >= row.cost
  },
  use: ({ characters, actor, action }) => {
    const row = slotCreation().find((entry) => entry.slotLevel === level)
    if (!row || !actor.sheet || actor.sheet.level < row.minLevel || usesLeft(actor, FONT) < row.cost) return { characters }
    const spent = withPointsSpent(actor, row.cost)
    const made = { ...spent, featureUses: { ...spent.featureUses, [createdSlotKey(level)]: (spent.featureUses?.[createdSlotKey(level)] ?? 0) + 1 } }
    return {
      characters: characters.map((character) => (character.id === actor.id ? made : character)),
      use: {
        feature: action.id,
        name: "Font of Magic",
        fact: `${actor.name} turns ${row.cost} Sorcery Points into a level ${level} spell slot, which lasts until a Long Rest. ${usesLeft(made, FONT)} Sorcery Points are left.`,
      },
    }
  },
})

// One who unleashes Innate Sorcery or spreads Dragon Wings: a hero with uses, and the lasting effects it is kept in.
type Unleasher = Featured & { spellEffects?: readonly SpellEffect[] }

// Innate Sorcery unleashed: its lasting effect, with what was spent for it before.
const unleashed = (actor: Unleasher): Unleasher => withSpellEffect(actor, { spell: "innate-sorcery", by: actor.id, turns: INNATE_ROUNDS })
const UNLEASHED_WORDS = "for 1 minute the save DC of their Sorcerer spells rises by 1, and they have Advantage on the attack rolls of Sorcerer spells."

// Dragon Wings spread: its lasting effect, for 1 hour, which outlasts a fight and ends with a rest.
const winged = (actor: Unleasher): Unleasher => withSpellEffect(actor, { spell: "dragon-wings", by: actor.id })
const WINGED_WORDS = `For 1 hour they have a Fly Speed of ${WINGS_SPEED} feet, and move ${WINGS_SPEED} feet a turn over the ground.`

export const sorcerer: ClassRules = {
  class: "sorcerer",
  bonusActions: [
    {
      id: INNATE,
      feature: INNATE,
      note: `${INNATE} is Innate Sorcery, for a Sorcerer who unleashes the magic within them, beside the action, when the player's words call for it: for 1 minute their spells' save DC rises by 1 and their spell attacks have Advantage.`,
      offer: (character) => !innateSorceryOn(character as Lasting),
      use: ({ characters, actor, action }) => {
        const lasting = actor as Unleasher
        if (innateSorceryOn(lasting)) return { characters }
        const on = unleashed(withFeatureUsed(lasting, INNATE))
        return {
          characters: characters.map((character) => (character.id === actor.id ? on : character)),
          use: { feature: action.id, name: action.name, fact: `${actor.name} unleashes their Innate Sorcery: ${UNLEASHED_WORDS}` },
        }
      },
    },
    // Sorcery Incarnate: Innate Sorcery with no use of it left, for 2 Sorcery Points.
    {
      id: "innate-sorcery-incarnate",
      feature: INCARNATE,
      name: "Innate Sorcery: Spend 2 Sorcery Points",
      note: "innate-sorcery-incarnate is Innate Sorcery once its uses are spent, unleashed for 2 Sorcery Points, when the player's words call for it.",
      offer: (character) => !innateSorceryOn(character as Lasting) && usesLeft(character as Rested, INNATE) === 0 && !!paidPoints(character as Rested, INCARNATE_POINTS),
      use: ({ characters, actor, action }) => {
        const paid = !innateSorceryOn(actor as Unleasher) && usesLeft(actor, INNATE) === 0 ? paidPoints(actor as Unleasher, INCARNATE_POINTS) : undefined
        if (!paid) return { characters }
        const on = unleashed(paid.character)
        return {
          characters: characters.map((character) => (character.id === actor.id ? on : character)),
          use: {
            feature: action.id,
            name: "Sorcery Incarnate",
            fact: `${paid.converted ? `${actor.name} expends a level ${paid.converted} spell slot for Sorcery Points. ` : ""}${actor.name} spends ${INCARNATE_POINTS} Sorcery Points to unleash their Innate Sorcery again: ${UNLEASHED_WORDS}`,
          },
        }
      },
    },
    ...[1, 2, 3, 4, 5].map(createSlot),
    {
      id: WINGS,
      feature: WINGS,
      note: `${WINGS} is Dragon Wings, for a Sorcerer who spreads draconic wings to fly, when the player's words call for it: a Fly Speed of ${WINGS_SPEED} feet for 1 hour. dragon-wings-restored is the same once its use is spent, for ${WINGS_POINTS} Sorcery Points.`,
      offer: (character) => !dragonWingsOut(character as Lasting),
      use: ({ characters, actor, action }) => {
        if (dragonWingsOut(actor as Unleasher)) return { characters }
        const on = winged(withFeatureUsed(actor as Unleasher, WINGS))
        return {
          characters: characters.map((character) => (character.id === actor.id ? on : character)),
          use: { feature: action.id, name: action.name, fact: `${actor.name} spreads draconic wings. ${WINGED_WORDS}` },
        }
      },
    },
    // Dragon Wings with its use spent: 3 Sorcery Points restore it, and it is used at once.
    {
      id: "dragon-wings-restored",
      feature: WINGS,
      name: "Dragon Wings: Spend 3 Sorcery Points",
      offer: (character) => !dragonWingsOut(character as Lasting) && usesLeft(character as Rested, WINGS) === 0 && !!paidPoints(character as Rested, WINGS_POINTS),
      use: ({ characters, actor, action }) => {
        const paid = !dragonWingsOut(actor as Unleasher) && usesLeft(actor, WINGS) === 0 ? paidPoints(actor as Unleasher, WINGS_POINTS) : undefined
        if (!paid) return { characters }
        const on = winged(paid.character)
        return {
          characters: characters.map((character) => (character.id === actor.id ? on : character)),
          use: {
            feature: action.id,
            name: "Dragon Wings",
            fact: `${paid.converted ? `${actor.name} expends a level ${paid.converted} spell slot for Sorcery Points. ` : ""}${actor.name} spends ${WINGS_POINTS} Sorcery Points and spreads draconic wings. ${WINGED_WORDS}`,
          },
        }
      },
    },
  ],
  choices: [
    {
      key: "metamagic",
      rides: "cast",
      offer: (character) => {
        const most = purse(character as Payer)
        const offered = picked(character).filter((id) => option(id) && metamagicCost(id) <= most)
        return offered.length ? offered : undefined
      },
      prompt: (values) =>
        `   - METAMAGIC: with "cast", "metamagic" is one of these when the player's words shape the spell with it, by its name or by what it does: ${(values as readonly string[])
          .map((id) => `"${id}" (${metamagicCost(id)} Sorcery ${metamagicCost(id) === 1 ? "Point" : "Points"}: ${option(id)?.words})`)
          .join(", ")}. One a spell. The game spends the points, and with too few left it expends the lowest spell slot that covers the rest. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For a cast: the Metamagic option the player's words shape the spell with"),
      cast: paying("metamagic"),
    },
    // Sorcery Incarnate: while Innate Sorcery is on, a second option beside the first.
    {
      key: "secondMetamagic",
      rides: "cast",
      offer: (character) => {
        if (!hasFeature(character, INCARNATE) || !innateSorceryOn(character as Lasting)) return undefined
        const most = purse(character as Payer)
        const offered = picked(character).filter((id) => option(id) && metamagicCost(id) <= most)
        return offered.length > 1 ? offered : undefined
      },
      prompt: () =>
        `   - SECOND METAMAGIC: while their Innate Sorcery is on, with "cast" and "metamagic", "secondMetamagic" is another of those options when the player's words shape the spell with two. Leave it out otherwise.
`,
      field: (values) =>
        z
          .enum(values as [string, ...string[]])
          .optional()
          .describe("For a cast with Metamagic, while Innate Sorcery is on: a second, other Metamagic option the player's words shape the spell with"),
      cast: paying("secondMetamagic"),
    },
    {
      key: "seeking",
      rides: "cast",
      offer: (character) => (picked(character).includes("seeking-spell") && metamagicCost("seeking-spell") <= purse(character as Payer) ? true : undefined),
      prompt: () =>
        `   - SEEKING SPELL: with "cast" of a spell attack, "seeking" is true when the player's words say they will guide the spell home if it misses. The game spends a Sorcery Point only on a miss, to roll the d20 again. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words guide a spell attack home with Seeking Spell if it misses"),
      cast: seeking,
    },
    {
      key: "empowered",
      rides: "cast",
      offer: (character) => (picked(character).includes(EMPOWERED) && metamagicCost(EMPOWERED) <= purse(character as Payer) ? true : undefined),
      prompt: () =>
        `   - EMPOWERED SPELL: with "cast" of a spell that deals damage, "empowered" is true when the player's words pour more force into its damage. It may go beside "metamagic". The game rerolls its lowest damage dice and spends a Sorcery Point only when some fell below average. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words pour more force into a spell's damage with Empowered Spell"),
      cast: empowered,
    },
  ],
  // Quickened Spell: a spell of an action cast with the Bonus Action, for 2 Sorcery Points paid as it is cast.
  bonusCasts: [
    {
      id: QUICKENED,
      takes: (character, spell) => picked(character).includes(QUICKENED) && spell.castingTime.unit === "action" && canPay(character, QUICKENED),
      words: `quickened: a spell of an action cast with the Bonus Action, for ${metamagicCost(QUICKENED)} Sorcery Points`,
      note: 'A spell marked quickened is cast with Quickened Spell only when the player\'s words cast it quickly beside their action. The action beside it may be an attack, a Dash, a cantrip or the like, never a spell of level 1 or higher. Without such words it is cast with the action, in "check".',
      pay: (character, slot) => {
        const paid = paidOption(character, QUICKENED, slot)
        return paid ? { character: paid.character, fact: `${paidWords(character.name ?? "The Sorcerer", QUICKENED, paid)}: the spell is cast with the Bonus Action.` } : undefined
      },
    },
  ],
  turnEffects: [
    {
      id: "heightened-spell",
      span: 2,
      checking: (_effect, _bearer, check) => (check.kind === "save" ? [{ mode: "disadvantage", from: "Heightened Spell" }] : []),
    },
    { id: EMPOWERED, span: 1 },
    { id: APOTHEOSIS, span: 1 },
  ],
  spellSaveDc: (character) => (hasFeature(character, INNATE) && innateSorceryOn(character) ? 1 : 0),
  spellAttackModes: (character, spell) => (hasFeature(character, INNATE) && innateSorceryOn(character) && ownSpell(character, spell) ? [{ mode: "advantage", from: "Innate Sorcery" }] : []),
  createdSlots: (character) => {
    if (!hasFeature(character, FONT)) return []
    return [1, 2, 3, 4, 5].map((level) => character.featureUses?.[createdSlotKey(level)] ?? 0)
  },
  // Empowered Spell's rerolls while its mark is on the caster, then Elemental Affinity's Charisma modifier, both on the
  // cast's first damage roll.
  spellDamageRolled: ({ caster, rolled, first, roll }) => {
    if (!first || !caster.sheet) return undefined
    const cha = deriveSheet(caster.sheet).abilityModifiers.cha
    const facts: string[] = []
    let now = rolled
    if (caster.turnEffects?.some((effect) => effect.id === EMPOWERED)) {
      const rerolled = empoweredRoll(now, cha, roll)
      if (rerolled) {
        now = rerolled.rolled
        facts.push(
          `${EMPOWERED_WORDS}${caster.name ?? "The Sorcerer"} rerolls ${rerolled.from.length} damage ${rerolled.from.length === 1 ? "die" : "dice"}, ${rerolled.from.join(", ")} becoming ${rerolled.to.join(", ")}.`
        )
      }
    }
    const type = hasFeature(caster, AFFINITY) ? caster.sheet.featureChoices?.[AFFINITY] : undefined
    const at = type ? now.parts.findIndex((part) => part.type === type) : -1
    if (at >= 0) {
      const parts = now.parts.map((part, index) => (index === at ? { ...part, bonus: part.bonus + cha, total: Math.max(0, part.total + cha) } : part))
      now = { parts, total: parts.reduce((sum, part) => sum + part.total, 0) }
      facts.push(`Elemental Affinity adds ${cha} to the ${type} damage.`)
    }
    return facts.length ? { rolled: now, fact: facts.join(" ") } : undefined
  },
  // Extended Spell: Advantage on a save to keep Concentration on the spell it doubled.
  concentrationModes: (character) => {
    const held = (character as { concentration?: { spell: string } }).concentration?.spell
    return held && character.spellEffects?.some((effect) => effect.spell === EXTENDED && effect.by === character.id && effect.choice === held) ? [{ mode: "advantage", from: "Extended Spell" }] : []
  },
  // A new spell that takes Concentration ends the one held before, and with it Extended Spell's mark.
  spellCast: ({ caster, spell, characters }) =>
    spell.duration.concentration && caster.spellEffects?.some((effect) => effect.spell === EXTENDED)
      ? {
          characters: characters.map((character) =>
            character.id === caster.id ? { ...character, spellEffects: (character.spellEffects ?? []).filter((effect) => effect.spell !== EXTENDED) } : character
          ),
          facts: [],
        }
      : undefined,
  // Dragon Wings: a Fly Speed of 60 feet while they are out, which over the flat floor is a move of 60 feet.
  speed: (character) => (hasFeature(character, WINGS) && dragonWingsOut(character) ? WINGS_SPEED : undefined),
  // Sorcerous Restoration, as a Short Rest ends with Sorcery Points spent.
  shortRest: (character) => {
    const sheet = character.sheet
    const spent = character.featureUses?.[FONT] ?? 0
    if (!sheet || !hasFeature(character, RESTORATION) || usesLeft(character, RESTORATION) < 1 || spent < 1) return { character, facts: [] }
    const back = Math.min(spent, Math.floor(sheet.level / 2))
    const restored = withFeatureUsed(withPointsSpent(character, -back), RESTORATION)
    return {
      character: restored,
      facts: [
        `${character.name ?? "The Sorcerer"} uses Sorcerous Restoration and regains ${back} Sorcery ${back === 1 ? "Point" : "Points"}, ${usesLeft(restored, FONT)} of ${featureUseCount(sheet, FONT)}.`,
      ],
    }
  },
}
