import type { AbilityId, ConditionId, DamageTypeId } from "@d20/srd"
import type { Spell } from "@d20/srd/schema/spells"
import type { Attack, DamageRoll } from "./attack"
import type { Check, Roller } from "./check"
import type { ConditionEntry, ConditionSpan } from "./condition-entry"
import type { ModeSource } from "./conditions"
import type { DeathRules } from "./death"
import type { ConditionChange, Harm } from "./harm"
import type { SaveStakes } from "./legendary-resistance"
import type { Sheet } from "./sheet"
import type { Point } from "./space"
import type { Castee, SaveRoll, SpellAttack, Spellcasting } from "./spells"
import type { Concentration, SpellEffect } from "./turn-effect"

/**
 * What a spell's own rules hand the engine, at each point of a cast and of what it leaves behind. A file under
 * ./spell-mechanics fills one of these for a spell or a family of spells, and ./spell-mechanics/index.ts lists the file.
 * The shared cast path (./spells `castSpell`, ./spell-effects, ./spell-rounds) reads a spell's rules from here and names
 * no spell itself, so a new mechanism adds its own file and edits no shared list. What the typed data of a spell says is
 * read by the shared path for every spell: a rule here is for what the data does not hold.
 *
 * A spell may be named in more than one file, each filling other points of it. Two files never fill the same point of
 * one spell (`spellRule` throws).
 */
export type SpellRules = {
  /** The SRD spells the rules are for, by id. A file whose only rule is `round` may name none. */
  spells: readonly string[]

  // Before the cast is paid for (./spells `castCost`).
  /** Why the caster cannot cast the spell now. It is then not cast and spends nothing. */
  barred?: (caster: Roller, spell: Spell) => string | undefined

  // Choosing who is taken (./spells `targetLimit`, `castSpell`).
  /** How many creatures the spell takes, where its words count them and its data does not: Bless's three. */
  count?: number
  /** Why a creature named is not taken, in words for the game master, or none where it is: Hold Person takes a Humanoid. */
  takes?: (target: Roller, spell: Spell) => string | undefined
  /** The one taken gains no benefit from cover against it: Sacred Flame. */
  ignoresCover?: true
  /** How many areas the spell makes, each centred on one named, in place of one: Meteor Swarm's four Spheres. */
  areas?: number
  /** Every one taken after the first stands within this many feet of the first: Chain Lightning's 30. */
  nearFirst?: number
  /**
   * Whether a part of the spell's data that holds only under a stated condition (`appliesWhen`) takes effect as it is
   * cast: Heat Metal's burn on the one who holds the metal, Blindness/Deafness's condition by the caster's `choice`.
   */
  applies?: (part: SpellPart, choice: string | undefined) => boolean
  /**
   * What the spell does at once to one it takes, by how that one stands, in place of everything its data does to them:
   * Power Word Kill's death at 100 hit points or fewer, Raise Dead's return. True when it has settled them, and the
   * rest of the cast passes them by.
   */
  settles?: (cast: CastContext, target: Castee) => boolean
  /** It is cast on the dead: the read takes one who died and is still here as its target (Raise Dead). */
  takesDead?: true
  /** Its range in feet for this caster, where its words change it: Spare the Dying's, doubled at levels 5, 11 and 17 (./spell-space). */
  range?: (caster: Roller) => number | undefined

  // A choice the caster makes as they cast it (../services/roll-requirement-service), kept on its effect as `choice`.
  /** What the caster chooses: its values, the field of the read it is asked in, and what it is in words. */
  choice?: SpellChoice

  // On a hit (./spells `castSpell`).
  /** The damage of a hit as the spell's words change it: Sorcerous Burst's exploding d8s. */
  hitDamage?: (rolled: DamageRoll, cast: CastContext) => DamageRoll
  /** What a hit does once its damage is dealt: Vampiric Touch's healing. */
  hit?: (cast: CastContext, attack: SpellAttack) => void
  /** A miss still deals half the damage: Acid Arrow's splash. */
  halfOnMiss?: true

  // On a save (./spells `castSpell`).
  /**
   * Whether a save of the spell's data is made as it is cast, or used again (`again`). `later` is the shared reading:
   * the save is timed, or all it guards comes later. Without this, a save is made at the cast when it is "initial" and
   * not `later`, and never when the spell is used again.
   */
  savedAtCast?: (save: NonNullable<Spell["saves"]>[number], again: boolean, later: boolean) => boolean
  /** A creature that succeeds without rolling, in words for the game master: Sleep's "creatures that don't sleep". */
  passes?: (target: Roller) => string | undefined
  /** Advantage or Disadvantage the spell itself puts on a target's save: Shatter on a Construct. */
  saveModes?: (target: Roller) => ModeSource[]
  /** What a failed save does beyond the conditions and damage of the data: Heat Metal's drop. */
  failedSave?: (cast: CastContext, target: Castee) => void
  /** What a passed save does beyond half damage. */
  passedSave?: (cast: CastContext, target: Castee) => void

  // As the spell takes effect.
  /** Healing of the one taken in place of the data's own, or false to leave it to the data: Revivify. */
  heals?: (cast: CastContext, target: Castee) => boolean
  /** What the spell ends on those it takes: Dispel Magic, Lesser Restoration. */
  ends?: <T extends Ended>(args: EndsArgs<T>) => { characters: T[]; conditions: ConditionChange[]; facts: string[] }
  /** What the spell leaves once everything else of the cast is done: Acid Arrow's later burn. */
  cast?: (cast: CastContext) => void

  // What a held spell is and does (./spell-effects).
  /** The spell lasts on those it takes though its data holds no lasting value, and what it does while it lasts. */
  held?: HeldRules

  // As the caster's later turns come (./spells `againOf`, `castAgain`).
  /** The spell is used again on later turns while it is held, with an action or a Bonus Action. */
  again?: SpellAgain

  // As a round turns (./spell-rounds), which stands for every turn's start and end at once.
  /**
   * What the rules do for one character as a round turns: a bearer's save at the end of its turn, a burn as its turn
   * starts, an aura round its caster. Run for each character in the order the files are listed, once a round.
   */
  round?: (round: RoundContext, was: RoundBearer) => void
  /** The save the spell's data repeats at the end of each turn is not made by the engine: Fear's, made only out of its caster's sight. */
  repeatsSave?: false

  // When a bearer takes damage (./spell-effects `settleConcentration`).
  /** The spell ends on its bearer when they take damage: Sleep, Hypnotic Pattern. */
  endsOnDamage?: true
  /** What else damage to its bearer does: a save to end it. */
  damaged?: <T extends Bearer>(args: { bearer: T; lost: number; d20: () => number; characters: readonly T[] }) => { bearer: T; facts: string[] } | undefined

  // When its bearer casts a spell (./spells `castSpell`).
  /** The spell ends on one who casts a spell while it is on them: Invisibility. */
  endsOnCasting?: true

  // When the spell ends (./spell-effects `endConcentration`).
  /** One the spell was on as it ends: Haste's lethargy. */
  ended?: <T extends Bearer>(bearer: T, casterId: string) => T
}

/**
 * A choice a spell asks of its caster as it is cast. `values` are ids: damage types, abilities, a mode's condition. The
 * read asks it in "damageType" for a damage type and "spellChoice" for any other, and the first value stands where none
 * is given. `words` say what is chosen, for the read: "the damage type it resists".
 */
export type SpellChoice = { values: readonly string[]; field: "damageType" | "spellChoice"; words: string }

/**
 * How a held spell is used again on its caster's later turns (./spells `againOf`, `castAgain`). `takes` is the action
 * or the Bonus Action it costs. `unplaced`: its force is not held on the floor, so the one it strikes is not measured
 * (Spiritual Weapon). `onlyLater`: as it is cast it does nothing to anyone, and all it does comes as it is used again
 * (Flame Blade's blade). `reach`: how many feet from its caster it reaches when used again, where its range does not
 * say (Produce Flame's 60). `parts`: the parts of its data it deals when used again, in place of those its text times
 * for later turns (Flaming Sphere's ram).
 */
export type SpellAgain = { takes: "action" | "bonus-action"; unplaced?: true; onlyLater?: true; reach?: number; parts?: (part: SpellPart) => boolean }

/** What a lasting spell does while it is on its bearer, read where rolls are made and defences counted. */
export type HeldRules = {
  /** The caster alone holds the effect, with the slot it was cast at as its `amount`: Spirit Guardians. */
  byCaster?: true
  /** Its bearer stands in an area on the floor, and leaves it on any move: Web. */
  area?: true
  /** The number the effect holds, by the slot: Mirror Image's three duplicates. */
  amount?: (slot: number) => number
  /** Advantage or Disadvantage on attack rolls against its bearer. */
  attacked?: "advantage" | "disadvantage"
  /** Advantage or Disadvantage on its bearer's own attack rolls: Foresight's Advantage. */
  attacks?: "advantage" | "disadvantage"
  /** Advantage or Disadvantage on attack rolls against its bearer by this attacker: Protection from Evil and Good's Disadvantage on a Fiend's. */
  attackedFrom?: (attacker: Bearer) => "advantage" | "disadvantage" | undefined
  /** It is spent by the next attack roll it changes. */
  once?: true
  /** What it takes from its bearer's Armor Class: Slow's 2. */
  armorClassLess?: number
  /** Saves its bearer makes with Advantage: Haste on Dexterity. "death" is a Death Saving Throw. */
  saveAdvantage?: readonly (AbilityId | "death")[]
  /** What it adds to or takes from its bearer's saves, by ability: Slow's −2 on Dexterity. */
  saveBonus?: Partial<Record<AbilityId, number>>
  /** Its bearer takes no Reactions: Slow. */
  noReactions?: true
  /** Every die of healing its bearer is given counts its most: Beacon of Hope. */
  healsMost?: true
  /** A spell it keeps off its bearer: Shield's against Magic Missile. */
  wards?: (spell: Spell) => boolean
  /** Conditions its bearer cannot be given: Heroism's Frightened. */
  immunities?: readonly ConditionId[]
  /** A condition its bearer cannot be given by the spell that would give it (`spell`, none where no spell does): Freedom of Movement's Restrained by a spell. */
  shutsOut?: (condition: ConditionId, spell: string | undefined) => boolean
  /** Saves its bearer makes to avoid or end these conditions, with Advantage: Protection from Poison's Poisoned. */
  saveAdvantageAgainst?: readonly ConditionId[]
  /** Damage types its bearer is immune to: Mind Blank's Psychic. Read in ./attack `defensesOf`. */
  damageImmunities?: readonly DamageTypeId[]
  /**
   * The first time its bearer would drop to 0 hit points they drop to 1 instead, and an effect that would kill them
   * outright without damage is negated, and either way it ends: Death Ward (./death `withDamage`).
   */
  wardsDeath?: true
  /** What it takes from every D20 Test its bearer makes, by the effect: Raise Dead's −4 as its `amount`. Read in ./conditions `d20Penalty`. */
  d20Less?: (effect: SpellEffect) => number
  /** Its `amount` is taken from its bearer's Hit Point maximum: Harm's. */
  maximumLess?: true
  /** Its bearer's Speed is 0: Power Word Stun on one it does not stun. */
  speedZero?: true
  /**
   * What a rest leaves of it, in place of its spell's duration: Harm's lowered maximum stays, and Raise Dead's penalty
   * eases by 1 on a Long Rest (./rest). None where it ends.
   */
  rested?: (effect: SpellEffect, long: boolean) => SpellEffect | undefined
  /** Its own rules put it on those the spell reaches (`settles`, `failedSave`), and the cast leaves none of its own: Harm's lowered maximum. */
  placed?: true
  /** It is the weapon's: its roll modifier adds to weapon attacks and not spell attacks, and its amount to weapon damage. */
  weapon?: true
  /** A limit of its roll modifier the engine does not measure, so it always holds: Warding Bond's 60 feet. */
  unmeasured?: true
  /** Damage types its bearer resists, by the effect: Protection from Energy's chosen type. Read in ./attack `defensesOf`. */
  resistances?: (effect: SpellEffect) => readonly DamageTypeId[]
  /**
   * Advantage or Disadvantage on its bearer's ability checks and saves, by the effect and the check: Enhance Ability's
   * Advantage on checks with the chosen ability, Hex's Disadvantage. Read where every check, save and Initiative is rolled.
   */
  checkModes?: (effect: SpellEffect, check: Check) => ModeSource[]
  /** What a hit by an attack roll on its bearer may strike in their place: Mirror Image's duplicates. */
  deflects?: <T extends Bearer>(bearer: T, attacker: Bearer, roll: (sides: number) => number) => Deflected<T> | undefined
  /** What it makes of one of its bearer's own weapon attacks: Shillelagh's Club or Quarterstaff. Read in ./attack `attacksOf`. */
  weaponAttack?: (effect: SpellEffect, attack: Attack, bearer: Bearer) => Attack
}

/** A hit a held spell may have turned: its bearer as it leaves them, whether it was, the dice, and how many there were. */
export type Deflected<T> = { character: T; deflected: boolean; dice: number[]; duplicates: number }

/** One a lasting spell may be on. */
export type Bearer = {
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

/** A part of a spell's typed data that may take effect at the cast: a damage entry, a condition, healing. */
export type SpellPart = { timing?: string; appliesWhen?: string; unless?: string; label?: string; condition?: ConditionId }

/**
 * A cast as the spell's rules see it while it resolves (./spells `castSpell`). `find` and `put` read and change everyone
 * as the cast has left them so far. `facts` and `harm` are the cast's own, added to in order.
 */
export type CastContext = {
  spell: Spell
  /** The caster as the cast began. */
  caster: Castee
  casting: Spellcasting
  /** The slot level it is cast at. */
  slot: number
  again: boolean
  /** What the caster chose for it (`choice`). */
  choice?: string
  find: (id: string) => Castee | undefined
  put: (after: Castee) => void
  harm: Harm[]
  facts: string[]
  /** The spell attacks made so far, in order. */
  attacks: readonly SpellAttack[]
  roll: (sides: number) => number
  /** How a character stands after harm or healing, in words for the game master. */
  standing: (character: Castee) => string
  /** The adventure's rule on death, for a spell that kills (Power Word Kill). */
  rules?: DeathRules
  /** Everyone the spell took, by id, in the order named, once those it settled are gone. */
  targets: readonly string[]
  /** Everyone as the cast has left them so far. */
  everyone: () => readonly Castee[]
  /** The conditions the cast has given or ended so far, added to in order. */
  conditions: ConditionChange[]
  /** A condition the spell gives one, for its span or the span the spell's text gives it, told and counted. */
  give: (id: string, condition: ConditionId, span?: ConditionSpan) => void
  /** A saving throw against the caster's spell save DC, counted and told with what Legendary Resistance and the like spend. */
  save: (target: Castee, ability: AbilityId, stakes: SaveStakes) => SaveRoll
}

/** One a spell that ends things may change (`SpellRules.ends`). */
export type Ended = { id: string; name: string; conditions?: readonly ConditionEntry[]; spellEffects?: readonly SpellEffect[]; concentration?: Concentration; isComplete?: boolean }

/** What a spell that ends things is cast with. It falls on the first of its targets. */
export type EndsArgs<T extends Ended> = {
  spell: { id: string; name: string }
  slot: number
  caster: { name: string }
  targets: readonly string[]
  characters: readonly T[]
  d20: () => number
  /** The caster's spellcasting ability modifier. */
  modifier: number
}

/** One a round's spell rules read and change. */
export type RoundBearer = Castee & { position?: Point }

/**
 * A round's turn as the spell rules see it (./spell-rounds `spellsAtRoundEnd`): everyone as the round has left them so
 * far, and the tools every rule shares. `tell` adds a fact for the game master about one character.
 */
export type RoundContext = {
  everyone: () => readonly RoundBearer[]
  /** Everyone at once, where a rule changes more than one (a Concentration ended). */
  replace: (characters: readonly RoundBearer[]) => void
  find: (id: string | undefined) => RoundBearer | undefined
  put: (after: RoundBearer) => void
  /** Damage rolled on one, through their defences, as `amountOf` cuts it: what they lost. */
  hurt: (id: string, dice: string, type: DamageTypeId, amountOf?: (taken: number) => number) => number
  /** A save against the caster's spell save DC, made to avoid or end `against`. */
  save: (target: RoundBearer, ability: AbilityId, caster: RoundBearer, spell: Spell, against?: readonly ConditionId[]) => SaveRoll
  /** A save in words: "Bandit FAILS the saving throw against Lyra's Web (9 against DC 13)". */
  verdict: (target: RoundBearer, thrown: SaveRoll, spell: Spell, caster: RoundBearer) => string
  give: (target: RoundBearer, id: ConditionId, spell: Spell, caster: RoundBearer, span: "turn" | "lasting") => void
  tell: (character: string, spell: string, text: string) => void
  /** How one stands after harm, in words, with a leading space. */
  standing: (id: string) => string
  /** The caster while the spell still holds: here, alive, and concentrating on it when it takes Concentration. */
  holds: (spell: Spell, by: string | undefined) => RoundBearer | undefined
  /** Conditions given or ended this round. */
  conditions: ConditionChange[]
}

// The list of every file's rules, which ./spell-mechanics/index.ts hands over as it loads, and the rules of each spell
// by id, laid together from every file, built the first time play asks. The list is handed over, not imported, since
// the files read shared code that reads this module: ./spells loads the list, last of its imports.
let files: (() => readonly SpellRules[]) | undefined
let byId: Map<string, SpellRules> | undefined

/** The list of every spell mechanism file's rules, handed over by ./spell-mechanics/index.ts as it loads. */
export function useSpellMechanics(list: () => readonly SpellRules[]): void {
  files = list
  byId = undefined
}

const spellMechanics = (): readonly SpellRules[] => {
  if (!files) throw new Error("The spell rules are not loaded: ./spell-mechanics is imported by ./spells.")
  return files()
}

const built = (): Map<string, SpellRules> => {
  if (byId) return byId
  const found = new Map<string, SpellRules>()
  for (const file of spellMechanics()) {
    for (const id of file.spells) {
      const { spells: _, round: __, ...rules } = file
      const had = found.get(id) ?? { spells: [id] }
      for (const key of Object.keys(rules)) if (key in had) throw new Error(`Two spell rule files fill ${key} of ${id}.`)
      found.set(id, { ...had, ...rules })
    }
  }
  byId = found
  return found
}

/** A spell's own rules, by its SRD id, laid together from every file that names it. None for a spell no file names. */
export const spellRule = (id: string): SpellRules | undefined => built().get(id)

/** A held spell's rules, by its SRD id. */
export const heldRule = (id: string): HeldRules | undefined => spellRule(id)?.held

/** Every file's round rule, in the order the files are listed. */
export const roundRules = (): NonNullable<SpellRules["round"]>[] => spellMechanics().flatMap((file) => (file.round ? [file.round] : []))
