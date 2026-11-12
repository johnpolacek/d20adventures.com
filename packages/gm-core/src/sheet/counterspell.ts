import { monsterById } from "@d20/srd/monsters"
import type { Spell } from "@d20/srd/schema/spells"
import { hasCondition } from "./conditions"
import { type Ask, canReact, type ReactionOffer, type ReactionTaken, shieldAgainstMagicMissile, withReaction } from "./reactions"
import { placedOf, type Standing, within } from "./space"
import { type CastCost, type Castee, castCost, rollSave, type SaveRoll, spellcastingOf, withCastSpent } from "./spells"
import { DEFAULT_STAT_BLOCK } from "./stat-block"

/**
 * Counterspell by the SRD 5.2.1 text, a Reaction "which you take when you see a creature within 60 feet of yourself
 * casting a spell with Verbal, Somatic, or Material components". The creature casting makes a Constitution saving throw
 * against the counterer's spell save DC. "On a failed save, the spell dissipates with no effect, and the action, Bonus
 * Action, or Reaction used to cast it is wasted. If that spell was cast with a spell slot, the slot isn't expended."
 * There is no ability check and no level to beat: any spell can be countered, and the save alone decides it.
 */

/** How near the one casting must be: within 60 feet. */
export const COUNTERSPELL_RANGE = 60

type Counterer = Castee & Standing & { spellSlots?: readonly number[]; featureUses?: Record<string, number> }

/**
 * What casting Counterspell would spend: a hero's level 3 slot or higher, or an NPC's use of the stat block reaction
 * that casts it, Protective Magic, three a day and shared with Shield (Mage, Archmage). A Lich's prints no count and
 * spends nothing. None when there is nothing to pay with.
 */
export function counterspellCost(counterer: Counterer): CastCost | undefined {
  if (counterer.sheet) {
    const cast = castCost(counterer, "counterspell")
    return "cost" in cast ? cast.cost : undefined
  }
  const monster = counterer.type === "npc" ? monsterById.get(counterer.statBlock ?? DEFAULT_STAT_BLOCK) : undefined
  const reaction = monster?.reactions?.find((entry) => entry.spellcasting?.spells?.some((spell) => spell.id === "counterspell"))
  if (!reaction) return undefined
  const count = reaction.uses?.count
  if (typeof count !== "number") return { kind: "cantrip" }
  return count - (counterer.featureUses?.[reaction.name] ?? 0) > 0 ? { kind: "free", feature: reaction.name } : undefined
}

/**
 * Whether one may counter a casting: they are of the other side, hero against NPC, can take a Reaction (Slow forbids
 * it), can see the one casting (not Blinded, and the caster not Invisible), stand within 60 feet of them where both have
 * a place on the floor, and can pay for it. Every spell the SRD prints has a Verbal, Somatic or Material component, so
 * every casting can be seen.
 */
export function canCounter(counterer: Counterer, caster: Castee & Standing, spell: Spell): boolean {
  if (counterer.id === caster.id || counterer.type === caster.type || !canReact(counterer)) return false
  const { verbal, somatic, material } = spell.components
  if (!verbal && !somatic && !material) return false
  if (hasCondition(counterer, "blinded") || hasCondition(caster, "invisible")) return false
  const from = placedOf(counterer)
  const to = placedOf(caster)
  if (from && to && !within(from, to, COUNTERSPELL_RANGE)) return false
  return !!counterSpellcasting(counterer) && !!counterspellCost(counterer)
}

// A counterer's spell save DC: a hero's from their class, an NPC's from its Spellcasting, which Protective Magic shares.
const counterSpellcasting = (counterer: Counterer) => spellcastingOf(counterer)

/**
 * Whether a counter matters, for a standing order of "when it matters". A cantrip never does: it is not worth a level 3
 * spell. A spell of level 3 or higher always does. Any other matters when it would harm one of the counterer's side:
 * it has a spell attack, a save, damage or a condition, and one of those it is aimed at is of the counterer's kind. A
 * Mage's Fireball at the heroes matters to Lyra, and its Healing Word on its own ally does not.
 */
export function counterspellMatters(args: { counterer: { type: string }; spell: Spell; targets: readonly string[]; characters: readonly { id: string; type: string }[] }): boolean {
  const { spell } = args
  if (spell.level === 0) return false
  if (spell.level >= 3) return true
  const harmful = !!(spell.attack || spell.saves || spell.damage || spell.conditions)
  return harmful && args.targets.some((id) => args.characters.find((character) => character.id === id)?.type === args.counterer.type)
}

/** The offer of Counterspell, in the shape the turn flow asks with (./reactions). `weapon` holds the spell being cast. */
export function counterspellOffer(args: { counterer: Counterer; caster: Castee & Standing; spell: Spell; targets: readonly string[]; characters: readonly Castee[] }): ReactionOffer | undefined {
  if (!canCounter(args.counterer, args.caster, args.spell)) return undefined
  return { id: "counterspell", to: args.counterer.id, from: args.caster.id, weapon: args.spell.id, matters: counterspellMatters(args) }
}

/** The counterer after casting Counterspell: the slot or use spent, and their Reaction taken. */
export function withCounterspell<T extends Counterer>(counterer: T): T {
  const cost = counterspellCost(counterer)
  if (!cost) throw new Error(`${counterer.name} cannot cast Counterspell.`)
  return withReaction(withCastSpent(counterer, cost))
}

/**
 * The Constitution saving throw the one casting makes against the counterer's spell save DC, by the usual rules of a
 * save (./spells `rollSave`). On a failure the spell is countered. A Bandit Captain casting nothing cannot be
 * countered, but a Mage's Constitution of +2 rolling 9 against Lyra's DC 13 makes 11 and loses its spell.
 */
export function counterspellSave(args: { caster: Castee; counterer: Counterer; characters: readonly Castee[]; d20: () => number; roll: (sides: number) => number }): SaveRoll & { countered: boolean } {
  const dc = counterSpellcasting(args.counterer)?.saveDc
  if (dc === undefined) throw new Error(`${args.counterer.name} cannot cast spells.`)
  const save = rollSave({ target: args.caster, ability: "con", dc, d20: args.d20, roll: args.roll, characters: args.characters })
  return { ...save, countered: !save.success }
}

/**
 * What a countered casting still spends: a spell slot is not expended, and nothing else comes back. A Ranger's free
 * Hunter's Mark or an NPC's "1/Day" is used, the cast having been made.
 */
export const costWhenCountered = (cost: CastCost): CastCost => (cost.kind === "slot" ? { kind: "cantrip" } : cost)

/**
 * A casting with the Counterspells it may draw, settled before the spell takes effect. Everyone of the other side who
 * can counter it is offered the chance in turn, through `ask` (a hero's player or standing order, an NPC's order at
 * once), until one counters it. Each who takes it spends their slot or use and their Reaction, and the one casting
 * saves. `countered` says whether the spell is lost: then the caster's action is spent, the cast is not made, and the
 * cost is `costWhenCountered`. Everyone comes back as it left them, with the saves and the reactions taken.
 */
export function counterspells<T extends Counterer>(args: {
  characters: readonly T[]
  casterId: string
  spell: Spell
  targets: readonly string[]
  ask: Ask
  d20: () => number
  roll: (sides: number) => number
}): { characters: T[]; countered: boolean; saves: SaveRoll[]; reactions: ReactionTaken[]; facts: string[] } {
  let characters = [...args.characters]
  const saves: SaveRoll[] = []
  const reactions: ReactionTaken[] = []
  const facts: string[] = []
  const caster = characters.find((character) => character.id === args.casterId)
  if (!caster) return { characters, countered: false, saves, reactions, facts }
  for (const one of args.characters) {
    const counterer = characters.find((character) => character.id === one.id) as T
    const offer = counterspellOffer({ counterer, caster, spell: args.spell, targets: args.targets, characters })
    const dc = counterSpellcasting(counterer)?.saveDc
    if (!offer || dc === undefined) continue
    const text = `${caster.name} is casting ${args.spell.name}. Counterspell would have them make a Constitution saving throw against DC ${dc}, and on a failure the spell is lost.`
    if (!args.ask(offer, text)) continue
    const spent = withCounterspell(counterer)
    characters = characters.map((character) => (character.id === spent.id ? spent : character))
    const save = counterspellSave({ caster, counterer: spent, characters, d20: args.d20, roll: args.roll })
    saves.push(save)
    const told = `${counterer.name} casts Counterspell. ${caster.name} ${save.countered ? "FAILS" : "SUCCEEDS on"} the Constitution saving throw (${save.total} against DC ${save.dc})`
    facts.push(save.countered ? `${told}, and ${args.spell.name} dissipates with no effect.` : `${told}, and ${args.spell.name} goes on.`)
    reactions.push({ by: counterer.id, id: "counterspell", name: "Counterspell", text: facts[facts.length - 1] })
    if (save.countered) return { characters, countered: true, saves, reactions, facts }
  }
  return { characters, countered: false, saves, reactions, facts }
}

/** A casting as its reactions left it: whether it was countered, the Counterspell saves, and every reaction taken. */
export type CastAnswered<T> = { characters: T[]; countered: boolean; saves: SaveRoll[]; reactions: ReactionTaken[]; facts: string[] }

/**
 * The reactions a casting draws, settled after its cost is known and before it takes effect: Counterspell from the
 * other side (`counterspells`), and when the spell goes on and it is Magic Missile, Shield from each one it is aimed
 * at. A spell used again on a later turn (./spells `castAgain`) is not cast, and draws none of them.
 */
export function reactionsToCast<T extends Counterer>(args: Parameters<typeof counterspells<T>>[0]): CastAnswered<T> {
  const countering = counterspells(args)
  if (countering.countered || args.spell.id !== "magic-missile") return countering
  const shielded = shieldAgainstMagicMissile({ characters: countering.characters, casterId: args.casterId, targets: args.targets, ask: args.ask })
  return { ...countering, characters: shielded.characters, reactions: [...countering.reactions, ...shielded.reactions], facts: [...countering.facts, ...shielded.reactions.map((taken) => taken.text)] }
}
