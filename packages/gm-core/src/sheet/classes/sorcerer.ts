import type { DamageTypeId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import type { Spell } from "@d20/srd/schema/spells"
import { spellById } from "@d20/srd/spells"
import { z } from "zod"
import type { Roller } from "../check"
import type { BonusActionRule, CastChoice, CastInput, ChoiceCast, ClassRules, Featured, Lasting, Rested } from "../class-rules"
import { deriveSheet } from "../derive"
import { featureUseCount, hasFeature, usesLeft, withFeatureUsed } from "../feature-rules"
import { areEnemies, sameSide } from "../sides"
import { withSpellEffect } from "../spell-effects"
import { type Cast, type Castee, slotsLeft, spellLabel, spellsOf, withCastSpent } from "../spells"
import type { SpellEffect, TurnEffect } from "../turn-effect"

/**
 * The Sorcerer's features in play, levels 1 to 5. Draconic Resilience's hit points and Armor Class and the Draconic
 * Spells always prepared are the sheet's (../derive), and the Sorcerer casts through the same path as any caster.
 *
 * Innate Sorcery: a Bonus Action, two uses a Long Rest. For 1 minute, kept as the lasting effect "innate-sorcery" for 10
 * rounds as Sacred Weapon is, the save DC of the Sorcerer's own class spells rises by 1 and their spell attacks have
 * Advantage. A spell from a feat (Magic Initiate) is no Sorcerer spell.
 * Font of Magic (level 2): Sorcery Points are the feature's uses, by the class table's column, back on a Long Rest.
 * Creating a spell slot is a Bonus Action on the read's menu, a level at a time, at the cost and Sorcerer level of the
 * data's table. A created slot is kept on `featureUses` under "sorcerer-font-of-magic:slot-<level>" and counted beside
 * the table's slots (../spells `slotsLeft`) until a Long Rest clears it. Converting a slot to points takes no action, and
 * the engine does it by a plain rule: when a Metamagic option costs more points than are left, it expends the lowest
 * slot that covers the rest, never the slot the cast itself spends. The points it gives stop at the table's count.
 * Converting ahead of need gains nothing, so it is not offered alone.
 * Metamagic (level 2): the options picked on the sheet (`featurePicks`) ride a spell cast as the action, one a spell,
 * each spending its Sorcery Points as the cast is resolved. Seeking Spell may go with another, as its text says, and is
 * spent only on a miss. Run: Careful (allies caught by its save are left out of it, which is what an automatic success
 * with no damage on a success is for a spell whose every effect rides that save), Distant (the range doubled, or 30
 * feet for a touch, where space is measured), Heightened (Disadvantage on one foe's save, only on a spell whose every
 * save is made as it is cast), Seeking, Subtle (no components, so no Counterspell can see it), Transmuted (the damage
 * type of the read's "damageType") and Twinned (the cast takes effect one level higher, and its slot is spent at its own).
 * Left off the menu: Empowered, whose reroll of chosen damage dice the cast cannot hand back before the damage is
 * dealt; Extended, since the engine keeps no clock past a fight's rounds and a rest, and has no tie between a doubled
 * spell and its Concentration's save; and Quickened, since a turn has no action left to give once the cast becomes a
 * Bonus Action.
 * Sorcerous Restoration (level 5): as a Short Rest ends with Sorcery Points spent, the Sorcerer regains up to half their
 * Sorcerer level rounded down, once a Long Rest.
 */

const INNATE = "sorcerer-innate-sorcery"
const FONT = "sorcerer-font-of-magic"
const METAMAGIC = "sorcerer-metamagic"
const RESTORATION = "sorcerer-sorcerous-restoration"

// Innate Sorcery lasts 1 minute: 10 rounds.
const INNATE_ROUNDS = 10

// Transmuted Spell's list: "Acid, Cold, Fire, Lightning, Poison, Thunder" (SRD 5.2.1, page 67). The data does not type it.
const TRANSMUTABLE: readonly DamageTypeId[] = ["acid", "cold", "fire", "lightning", "poison", "thunder"]

/** Whether a hero's Innate Sorcery is on: the lasting effect they gave themselves. */
export const innateSorceryOn = (character: Lasting): boolean => !!character.spellEffects?.some((effect) => effect.spell === "innate-sorcery" && (!character.id || effect.by === character.id))

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

// Whether a hero could pay so many points now, by converting a slot if need be.
const canPay = (character: Rested, cost: number, keep?: number) => !!paidPoints(character, cost, keep)

// Facts of a payment, for the story.
const paidWords = (name: string, cost: number, option: string, converted?: number) =>
  `${converted ? `${name} expends a level ${converted} spell slot for Sorcery Points. ` : ""}${name} spends ${cost} Sorcery ${cost === 1 ? "Point" : "Points"} on ${option}`

// Whether a spell's every save is made as it is cast, and nothing of it is saved against later: no area that stays.
const savedAtCast = (spell: Spell): boolean =>
  !!spell.saves?.length &&
  spell.saves.every((save) => save.when === "initial" && !save.timing) &&
  !(spell.range.area && spell.duration.kind !== "instantaneous") &&
  ![...(spell.damage ?? []), ...(spell.conditions ?? [])].some((entry) => "timing" in entry && entry.timing)

// A Sorcerer spell: one their class casts, not one a feat gave them.
const ownSpell = (character: Rested, spell: Spell): boolean => spellsOf(character).some((known) => known.spell.id === spell.id && !known.ability)

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

const option = (id: string | true): Option | undefined => OPTIONS.find((entry) => entry.id === id)

// Heightened Spell's mark on its one target, held only while the cast's saves are made.
const mark = <T extends { turnEffects?: readonly TurnEffect[] }>(character: T, by: string): T => ({
  ...character,
  turnEffects: [...(character.turnEffects ?? []), { id: "heightened-spell", by, turns: 2 }],
})
const unmark = <T extends { turnEffects?: readonly TurnEffect[] }>(character: T): T => {
  const turnEffects = (character.turnEffects ?? []).filter((effect) => effect.id !== "heightened-spell")
  const { turnEffects: _, ...rest } = character
  return (turnEffects.length ? { ...rest, turnEffects } : rest) as T
}

// The Metamagic options a hero picked, by id.
const picked = (character: Roller): string[] => (hasFeature(character, METAMAGIC) ? (character.sheet?.featurePicks?.[METAMAGIC] ?? []).map((entry) => entry.option) : [])

// The most a hero could pay now: their points, and the highest slot they could convert.
const purse = (character: Rested): number => usesLeft(character, FONT) + Math.max(0, ...slotsLeft(character).map((count, index) => (count > 0 ? index + 1 : 0)))

// A cast choice that pays its option's points as the cast resolves. One that cannot be paid then, or finds no one to
// use itself on, is cast without it, as the spell is: its points are kept.
function paying(id: (value: string | true) => string | undefined): CastChoice {
  return {
    fits: (caster, cast, value) => {
      const chosen = option(id(value) ?? "")
      return !!chosen && chosen.fits(caster, cast) && canPay(caster, metamagicCost(chosen.id), cast.slot)
    },
    shape: (cast, value) => option(id(value) ?? "")?.shape?.(cast) ?? cast,
    around: ({ input, value, slot, resolve }) => {
      const chosen = option(id(value) ?? "")
      const caster = input.characters.find((character) => character.id === input.casterId)
      const plain = () =>
        resolve({ ...input, spell: spellById.get(input.spell.id) ?? input.spell, level: input.level === undefined ? undefined : input.level - (chosen?.id === "twinned-spell" ? 1 : 0) })
      if (!chosen || !caster || !canPay(caster, metamagicCost(chosen.id), slot)) return plain()
      const applied = chosen.apply ? chosen.apply({ input, caster, resolve }) : { cast: resolve(input) }
      if (!applied) return plain()
      const after = applied.cast.characters.find((character) => character.id === input.casterId)
      const paid = after && paidPoints(after, metamagicCost(chosen.id), slot)
      if (!paid) return plain()
      const title = classFeatureById.get(METAMAGIC)?.options?.find((entry) => entry.id === chosen.id)?.name ?? chosen.id
      return {
        ...applied.cast,
        characters: applied.cast.characters.map((character) => (character.id === input.casterId ? paid.character : character)),
        facts: [`${paidWords(caster.name, metamagicCost(chosen.id), title, paid.converted)}: ${chosen.words}.${applied.fact ? ` ${applied.fact}` : ""}`, ...applied.cast.facts],
      }
    },
  }
}

/** Seeking Spell: a spell attack that misses is thrown again, for 1 Sorcery Point, and the new roll stands. One attack only, not a ray of several. */
const seeking: CastChoice = {
  fits: (caster, { spell, slot }) => !!spell.attack && !spell.projectiles && canPay(caster, metamagicCost("seeking-spell"), slot),
  around: ({ input, slot, resolve }) => {
    const first = resolve(input)
    if (!first.attack || first.attack.roll.hit || first.rays) return first
    const again = resolve({ ...input, attackDice: undefined })
    const caster = again.characters.find((character) => character.id === input.casterId)
    const paid = caster && paidPoints(caster, metamagicCost("seeking-spell"), slot)
    if (!caster || !paid) return first
    const missed = first.attack.roll
    return {
      ...again,
      characters: again.characters.map((character) => (character.id === input.casterId ? paid.character : character)),
      facts: [
        `${caster.name}'s ${input.spell.name} misses (${missed.total} against Armor Class ${missed.armorClass}). ${paidWords(caster.name, metamagicCost("seeking-spell"), "Seeking Spell", paid.converted)} and rolls the d20 again.`,
        ...again.facts,
      ],
    }
  },
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

export const sorcerer: ClassRules = {
  class: "sorcerer",
  bonusActions: [
    {
      id: INNATE,
      feature: INNATE,
      note: `${INNATE} is Innate Sorcery, for a Sorcerer who unleashes the magic within them, beside the action, when the player's words call for it: for 1 minute their spells' save DC rises by 1 and their spell attacks have Advantage.`,
      offer: (character) => !innateSorceryOn(character as Lasting),
      use: ({ characters, actor, action }) => {
        const lasting = actor as Featured & { spellEffects?: readonly SpellEffect[] }
        if (innateSorceryOn(lasting)) return { characters }
        const unleashed = withSpellEffect(withFeatureUsed(lasting, INNATE), { spell: "innate-sorcery", by: actor.id, turns: INNATE_ROUNDS })
        return {
          characters: characters.map((character) => (character.id === actor.id ? unleashed : character)),
          use: {
            feature: action.id,
            name: action.name,
            fact: `${actor.name} unleashes their Innate Sorcery: for 1 minute the save DC of their Sorcerer spells rises by 1, and they have Advantage on the attack rolls of Sorcerer spells.`,
          },
        }
      },
    },
    ...[1, 2, 3, 4, 5].map(createSlot),
  ],
  choices: [
    {
      key: "metamagic",
      rides: "cast",
      offer: (character) => {
        const most = purse(character as Rested)
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
      cast: paying((value) => (typeof value === "string" ? value : undefined)),
    },
    {
      key: "seeking",
      rides: "cast",
      offer: (character) => (picked(character).includes("seeking-spell") && metamagicCost("seeking-spell") <= purse(character as Rested) ? true : undefined),
      prompt: () =>
        `   - SEEKING SPELL: with "cast" of a spell attack, "seeking" is true when the player's words say they will guide the spell home if it misses. The game spends a Sorcery Point only on a miss, to roll the d20 again. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words guide a spell attack home with Seeking Spell if it misses"),
      cast: seeking,
    },
  ],
  turnEffects: [
    {
      id: "heightened-spell",
      span: 2,
      checking: (_effect, _bearer, check) => (check.kind === "save" ? [{ mode: "disadvantage", from: "Heightened Spell" }] : []),
    },
  ],
  spellSaveDc: (character) => (hasFeature(character, INNATE) && innateSorceryOn(character) ? 1 : 0),
  spellAttackModes: (character, spell) => (hasFeature(character, INNATE) && innateSorceryOn(character) && ownSpell(character, spell) ? [{ mode: "advantage", from: "Innate Sorcery" }] : []),
  createdSlots: (character) => {
    if (!hasFeature(character, FONT)) return []
    return [1, 2, 3, 4, 5].map((level) => character.featureUses?.[createdSlotKey(level)] ?? 0)
  },
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
