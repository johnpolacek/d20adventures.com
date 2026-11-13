import { classFeatureById } from "@d20/srd/class-features"
import type { Spell } from "@d20/srd/schema/spells"
import { z } from "zod"
import type { Roller } from "../check"
import type { CastChoice, ClassRules, Lasting } from "../class-rules"
import { withDamage } from "../death"
import { deriveSheet, SIGNATURE_SPELLS } from "../derive"
import { hasFeature } from "../feature-rules"
import { sameSide } from "../sides"
import type { Sheet } from "../sheet"
import { spellLabel } from "../spells"
import type { TurnEffect } from "../turn-effect"

/**
 * The Wizard's features in play, levels 1 to 20, with the Evoker.
 *
 * Arcane Recovery (level 1): as a Short Rest ends, once a Long Rest, the Wizard takes back spent spell slots. Ritual
 * Adept (level 1) casts a Ritual spell of the spellbook unprepared (../spells `spellsOf`), Scholar (level 2) is
 * Expertise on the sheet, and the spellbook, slots and prepared spells to level 9 are the sheet's.
 * Memorize Spell (level 5) is told: swapping a prepared spell as a Short Rest ends (../rest `memorizeSpell`) is a
 * player's choice, which neither host's rest asks for, and no plain rule knows which spell the days ahead want.
 * Spell Mastery (level 18): a level 1 and a level 2 spell of the spellbook cast with an action, picked on the sheet,
 * always prepared and cast at their own level with no slot as often as the Wizard likes, and with a slot at a higher
 * level (../derive `pickedFreeCasts`, ../spells `castCost`). The swap of one after a Long Rest is the sheet's, as a
 * Wizard's prepared spells are.
 * Signature Spells (level 20): two level 3 spells of the spellbook, picked on the sheet, always prepared, each cast once
 * at level 3 with no slot, counted under "wizard-signature-spells:<spell>" and back on a Short or Long Rest.
 *
 * Evoker:
 * - Evocation Savant (level 3) is the spellbook's.
 * - Potent Cantrip (level 3): a cantrip that misses, or is saved against, still deals half its damage and nothing more.
 * - Sculpt Spells (level 6): of those the Wizard's Evocation spell takes, the Wizard's allies, in the order named, up to
 *   1 plus the level it is cast at, succeed on its saves at once and take none of its damage. A plain rule: the engine
 *   spares every ally it may. It reaches the saves made as the spell is cast, not those of a lasting area's later turns.
 * - Empowered Evocation (level 10): the Intelligence modifier added to one damage roll of a Wizard Evocation spell: its
 *   save's damage, its damage that needs no roll, or its attack's hit. A spell of several darts or rays rolls its damage
 *   once for each, and which one takes it is the Wizard's, so it is left to the story there.
 * - Overchannel (level 14): a choice that rides the cast of a Wizard spell with a slot of level 1 to 5 that deals
 *   damage: its damage dice as it is cast count at their highest. The first use a Long Rest costs nothing. Each after
 *   deals the Wizard 2d12 Necrotic for each level of the slot, 1d12 more a level for each use beyond the second, which
 *   ignores Resistance and Immunity. Its uses are counted in `featureUses` until a Long Rest.
 */

const ARCANE_RECOVERY = "wizard-arcane-recovery"
const POTENT_CANTRIP = "evoker-potent-cantrip"
const SCULPT_SPELLS = "evoker-sculpt-spells"
const EMPOWERED_EVOCATION = "evoker-empowered-evocation"
const OVERCHANNEL = "evoker-overchannel"

/**
 * The spell slots a Wizard's Arcane Recovery takes back, by level, the first for level 1: expended slots with a
 * combined level of at most half the Wizard level rounded up, none of level 6 or higher. The engine takes the most
 * levels it can, and of equal totals the higher slots. A level 4 Wizard with one level 2 and two level 1 slots spent
 * may recover 2 levels: the level 2 slot, [0, 1].
 */
export function arcaneRecoveryOf(character: { sheet?: Sheet; spellSlots?: readonly number[] }): number[] {
  const sheet = character.sheet
  if (!sheet || !deriveSheet(sheet).classFeatures.includes(ARCANE_RECOVERY)) return []
  const budget = Math.ceil(sheet.level / 2)
  const spent = (character.spellSlots ?? []).slice(0, 5)
  let best: number[] = []
  let bestTotal = 0
  // Every way to take back some of the spent slots of each level, few enough to try them all.
  const tryFrom = (level: number, taken: number[], total: number) => {
    if (level < 1) {
      if (total > bestTotal) {
        best = [...taken]
        bestTotal = total
      }
      return
    }
    for (let count = Math.min(spent[level - 1] ?? 0, Math.floor((budget - total) / level)); count >= 0; count--) {
      taken[level - 1] = count
      tryFrom(level - 1, taken, total + count * level)
    }
  }
  tryFrom(spent.length, [], 0)
  return bestTotal > 0 ? best.map((count) => count ?? 0) : []
}

// A Wizard Evocation spell, for Empowered Evocation.
const wizardEvocation = (spell: Spell): boolean => spell.school === "evocation" && spell.classes.includes("wizard")
const intelligenceOf = (character: Roller): number => (character.sheet ? deriveSheet(character.sheet).abilityModifiers.int : 0)
// Empowered Evocation reaches a spell that rolls its damage once: not one of several darts or rays.
const empowered = (caster: Roller, spell: Spell): boolean => hasFeature(caster, EMPOWERED_EVOCATION) && wizardEvocation(spell) && !spell.projectiles

/** The Necrotic dice Overchannel deals its Wizard for a slot of a level, once it has been used `before` times since a Long Rest: none for the first use. */
export function overchannelDice(before: number, slot: number): number {
  const cost = classFeatureById.get(OVERCHANNEL)?.selfDamage
  if (!cost || before < 1) return 0
  const first = Number(cost.dicePerSlotLevel.split("d")[0])
  const more = Number(cost.increaseAfterSecondUse.split("d")[0])
  return (first + more * (before - 1)) * slot
}

// Overchannel's mark on its Wizard, held only while the cast it rides is resolved.
const marked = (character: { turnEffects?: readonly TurnEffect[] }): boolean => !!character.turnEffects?.some((effect) => effect.id === OVERCHANNEL)
const unmark = <T extends { turnEffects?: readonly TurnEffect[] }>(character: T): T => {
  const turnEffects = (character.turnEffects ?? []).filter((effect) => effect.id !== OVERCHANNEL)
  const { turnEffects: _, ...rest } = character
  return (turnEffects.length ? { ...rest, turnEffects } : rest) as T
}

const overchannel: CastChoice = {
  fits: (caster, { spell, slot }) =>
    hasFeature(caster, OVERCHANNEL) && spell.classes.includes("wizard") && !!spell.damage?.length && spellLabel(spell) !== "told" && slot !== undefined && slot >= 1 && slot <= 5,
  around: ({ input, slot, resolve }) => {
    const caster = input.characters.find((character) => character.id === input.casterId)
    if (!caster || slot === undefined) return resolve(input)
    const characters = input.characters.map((character) => (character.id === caster.id ? { ...character, turnEffects: [...(character.turnEffects ?? []), { id: OVERCHANNEL, by: caster.id, turns: 1 }] } : character))
    const cast = resolve({ ...input, characters })
    const before = (caster as { featureUses?: Record<string, number> }).featureUses?.[OVERCHANNEL] ?? 0
    const dice = overchannelDice(before, slot)
    const facts = [`${caster.name} overchannels the spell: its damage dice count at their highest.`]
    const after = cast.characters.map((character) => {
      if (character.id !== caster.id) return character
      const used = { ...unmark(character), featureUses: { ...(character as { featureUses?: Record<string, number> }).featureUses, [OVERCHANNEL]: before + 1 } }
      if (!dice) return used
      // The Necrotic damage ignores Resistance and Immunity, so it is dealt with no damage type to weigh.
      let amount = 0
      for (let die = 0; die < dice; die++) amount += input.roll(12)
      facts.push(`${caster.name} takes ${amount} Necrotic damage from Overchannel (${dice}d12).`)
      return withDamage(used, amount, input.rules ? { rules: input.rules } : {}).character
    })
    return { ...cast, characters: after, facts: [...facts, ...cast.facts] }
  },
}

export const wizard: ClassRules = {
  class: "wizard",
  choices: [
    {
      key: "overchannel",
      rides: "cast",
      offer: (character) => (hasFeature(character, OVERCHANNEL) ? true : undefined),
      prompt: () =>
        `   - OVERCHANNEL: with "cast" of a Wizard spell that deals damage, with a spell slot of level 1 to 5, "overchannel" is true when the player's words push the spell to its utmost. Its damage dice count at their highest. The first use each Long Rest is free, and each after costs the Wizard Necrotic damage. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words push a Wizard spell to its utmost with Overchannel"),
      cast: overchannel,
    },
  ],
  turnEffects: [{ id: OVERCHANNEL, span: 1 }],
  halvesAvoided: (caster, spell) => spell.level === 0 && hasFeature(caster, POTENT_CANTRIP),
  spellDamageMost: ({ caster, spell, slot }) => marked(caster as Lasting & { turnEffects?: readonly TurnEffect[] }) && hasFeature(caster, OVERCHANNEL) && slot !== undefined && slot <= 5 && spell.classes.includes("wizard"),
  spellSpares: ({ caster, spell, level, taken }) => {
    if (spell.school !== "evocation" || !hasFeature(caster, SCULPT_SPELLS)) return undefined
    const ids = taken
      .filter((other) => other.id !== caster.id && sameSide(other, caster))
      .slice(0, 1 + level)
      .map((other) => other.id)
    return ids.length ? { ids, name: "Sculpt Spells" } : undefined
  },
  spellDamage: ({ caster, spell, item }) => (!item && empowered(caster, spell) ? intelligenceOf(caster) : 0),
  spellHit: ({ caster, spell }) => (empowered(caster, spell) ? { name: "Empowered Evocation", bonus: intelligenceOf(caster) } : undefined),
  shortRest: (character) => {
    // Signature Spells' casts come back on a Short Rest, each counted alone.
    const signature = Object.keys(character.featureUses ?? {}).filter((key) => key.startsWith(`${SIGNATURE_SPELLS}:`))
    const kept = Object.fromEntries(Object.entries(character.featureUses ?? {}).filter(([key]) => !signature.includes(key)))
    const { featureUses: _, ...plain } = character
    const rested = (signature.length ? { ...plain, ...(Object.keys(kept).length ? { featureUses: kept } : {}) } : character) as typeof character
    const facts = signature.length ? [`${character.name ?? "The character"} can cast their Signature Spells with no slot again.`] : []
    const recovered = (rested.featureUses?.[ARCANE_RECOVERY] ?? 0) > 0 ? [] : arcaneRecoveryOf(rested)
    if (!recovered.length) return { character: rested, facts }
    const spellSlots = (rested.spellSlots ?? []).map((used, index) => used - (recovered[index] ?? 0))
    const { spellSlots: __, ...rest } = rested
    const words = recovered.flatMap((count, index) => (count ? [`${count} level ${index + 1}`] : [])).join(" and ")
    return {
      character: { ...rest, featureUses: { ...rested.featureUses, [ARCANE_RECOVERY]: 1 }, ...(spellSlots.some((used) => used > 0) ? { spellSlots } : {}) } as unknown as typeof character,
      facts: [
        ...facts,
        `${character.name ?? "The character"} uses Arcane Recovery and recovers ${words} spell ${recovered.reduce((sum, count) => sum + count, 0) === 1 ? "slot" : "slots"}.`,
      ],
    }
  },
}
