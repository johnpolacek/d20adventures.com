import type { AbilityId, ConditionId, DamageTypeId } from "@d20/srd"
import type { Spell } from "@d20/srd/schema/spells"
import type { z } from "zod"
import type { TurnReading } from "../services/roll-requirement-service"
import type { Character } from "../types/character"
import type { RequiredFeature, RequiredRoll } from "../validations/roll-requirement-schema"
import type { Attack, AttackResult, DamagePart, RolledAttack, Target } from "./attack"
import type { InScene } from "./attack-roll"
import { type Check, type CheckResult, checkBonus, type Roller } from "./check"
import { classes } from "./classes"
import type { ConditionEntry } from "./condition-entry"
import type { ModeSource } from "./conditions"
import type { DeathRules } from "./death"
import type { ConditionChange, Harm } from "./harm"
import { registerDowned, registerImmunities } from "./late-rules"
import type { SaveStakes } from "./legendary-resistance"
import type { Floor, Point } from "./space"
import type { Cast, Castee, castSpell } from "./spells"
import type { Concentration, SpellEffect, TurnEffect } from "./turn-effect"

/**
 * What a class's features hand the engine, at each seam of play. A class file under ./classes fills one of these, and
 * ./classes/index.ts lists the file. The shared code reads every class's rules from here and names no class feature
 * itself, so a new class adds its own and edits no shared list. Each rule checks that the character has its feature:
 * nothing here is keyed by class.
 */
export type ClassRules = {
  /** The SRD class the file is for. */
  class: string
  /** Bonus Actions, in the order the read's menu lists them. */
  bonusActions?: BonusActionRule[]
  /** Choices the read offers beside the action, each a field of the game master's pick and a line of its prompt. */
  choices?: ChoiceRule[]
  /** Reactions a hero takes, with what sets each off. */
  reactions?: ReactionRule[]
  /** What rides on a hit: damage added, and what falls once it is dealt. */
  hits?: HitRule[]
  /** Turn effects the class leaves on characters, its once-a-turn marks among them. */
  turnEffects?: TurnEffectRule[]
  /**
   * Advantage or Disadvantage the class gives its hero's own checks and saves (Remarkable Athlete), on a roll the read
   * asks for and on a save against a spell or a feature (./spells `rollSave`).
   */
  checkModes?: (character: Roller, check: Check) => ModeSource[]
  /** Whether the class gives its hero Advantage on Initiative (Remarkable Athlete). */
  initiativeAdvantage?: (character: Roller) => boolean
  /** What may still save one of the hero's own checks that failed (Tactical Mind). */
  checks?: CheckRule[]
  /** Rolls a turn asks for after the one just made (Horde Breaker). */
  follows?: FollowRule[]
  /** One of a hero's own attacks as a class feature changes it (Martial Arts' die and Dexterity). Read in ./attack `attacksOf`. */
  attack?: (character: Roller, attack: Attack) => Attack
  /** What a class does for its hero as Initiative is rolled at an encounter's start (Uncanny Metabolism). */
  initiative?: <T extends Rested & { hitPoints?: number }>(character: T, roll: (sides: number) => number) => T
  /** What the hero knows of another, told beside them in the read's Who Is Here (Hunter's Lore). */
  sees?: (character: Roller & { id: string }, other: Roller & { id: string }) => string | undefined
  /** What a Short Rest gives beyond the uses each feature's data brings back (Arcane Recovery). */
  shortRest?: <T extends Rested>(character: T) => { character: T; facts: string[] }
  /**
   * What happens to a character as a round within an encounter gives way to the next, told under `name`. `round` holds
   * everyone as the round turns and the dice, for a save a feature has them repeat (Intimidating Presence's Frightened).
   */
  roundStart?: <T extends Roller & { id: string }>(character: T, round?: RoundTurn) => { character: T; told?: { name: string; text: string } }
  /** Damage types a hero resists while a feature lasts, beside the sheet's standing ones (Rage). Read where damage is taken (./attack `defensesOf`). */
  resistances?: (character: Bearing) => readonly DamageTypeId[]
  /** The ability a hero makes a check with in place of its own, where a feature lets them (Primal Knowledge). Read for the check's bonus (./check `checkBonus`). */
  checkAbility?: (character: Bearing, check: Check) => AbilityId | undefined
  /** Why a hero cannot cast a spell now, where a feature bars it (Rage). Read before any cast is paid for (./spells `castCost`). */
  castingBarred?: (character: Bearing) => string | undefined
  /**
   * What a hero's own attack roll against an enemy does to them, on any roll of their turn (Rage is extended). `made`
   * is the attack as it was asked, the damage it dealt and the floor, for one that moves them after it (a Cunning
   * Strike's Withdraw). Applied after the roll (./actions `afterRoll`).
   */
  attackRolled?: <T extends Bearing & { position?: Point }>(attacker: T, target: Bearing & { position?: Point }, made?: AttackMade) => T
  /** How far in feet one of a hero's own spells reaches, where a feature lengthens it (Eldritch Spear). Read where a spell is measured (./spell-space `castInSpace`). */
  spellRange?: (caster: Roller, spell: Spell) => number | undefined
  /**
   * What rides each hit of a hero's own spell attack, beam by beam (Agonizing Blast, Repelling Blast): a bonus to the
   * hit's damage, and where the one hit is pushed to. A spell attack makes no `landBlow`, so no `HitRule` reaches it.
   * Read in ./spells `castSpell`.
   */
  spellHit?: (args: SpellHitArgs) => SpellHit | undefined
  /**
   * What a character gains once a roll drops an enemy of theirs to 0 hit points, their own roll or another's (Dark One's
   * Blessing). `by` is whose roll it was. Read once a hero's roll is settled (./afterFelled).
   */
  felled?: <T extends Felling>(args: { character: T; felled: Felling; by: string }) => { character: T; name: string; text: string } | undefined
  /** Advantage or Disadvantage on a hero's save to keep Concentration (Eldritch Mind). Read in ./spell-effects `settleConcentration`. */
  concentrationModes?: (character: Roller) => ModeSource[]
  /** What a feature adds to the save DC of a hero's own class spells while it lasts (Innate Sorcery). Read in ./spells `spellcastingOf`. */
  spellSaveDc?: (character: Lasting) => number
  /** Advantage or Disadvantage on a hero's attack roll with one of their own spells while a feature lasts (Innate Sorcery). Read in ./spells `spellAttackModes`. */
  spellAttackModes?: (character: Lasting, spell: Spell) => ModeSource[]
  /** Spell slots a feature has made beyond the class table's, by spell level, the first for level 1 (Font of Magic). Read in ./spells `slotsLeft`. */
  createdSlots?: (character: Rested) => readonly number[]
  /**
   * Whether a hero has Evasion: a Dexterity save for half damage takes none on a success and half on a failure, while
   * they are not Incapacitated. Read through ./save-rules `damageOnSave`, which every save for half damage settles by.
   */
  evasion?: (character: Roller) => boolean
  /**
   * The least the d20 of a hero's own check counts as, where a feature raises it (Reliable Talent's 10 on a check with
   * a skill they are trained in). Read for the read's check (../services/adventure-roll-result-service).
   */
  d20Floor?: (character: Roller, check: Check) => number | undefined
  /** What may still save a hero's failed saving throw against harm (Indomitable). Read in ./spells `rollSave`, through ./save-rules `rescuedSave`. */
  saves?: SaveRule[]
  /** Auras a hero's features spread to those of their side near them (Aura of Protection). Read through ./save-rules. */
  auras?: AuraRule[]
  /**
   * The mastery property a hero's attack uses in place of its weapon's own, where a feature replaces it for the attack
   * (Tactical Master), by what was chosen with the attack. Read where a hit's mastery is applied (./actions `afterRoll`).
   */
  mastery?: (character: Roller, weaponId: string, choices: Readonly<Record<string, string>> | undefined) => string | undefined
  /**
   * What one of a hero's own attack rolls leaves on the one it was made against, once it has hit or missed (Studied
   * Attacks). Read in ./reactions `attackWithReactions`, which every attack roll with a weapon passes.
   */
  attackSettled?: <T extends Bearing>(args: { attacker: Bearing & { id: string }; target: T; hit: boolean }) => T
  /**
   * A hero's Death Saving Throw as a feature changes it (Defy Death): Advantage on it, and the least die that counts as
   * a 20. Read in ./death `atRoundStart` and `deathSave`.
   */
  deathSave?: (character: Roller) => { modes: ModeSource[]; twentyFrom?: number } | undefined
  /** Conditions a hero cannot be given while a feature lasts (Mindless Rage's Charmed and Frightened). Read in ./conditions `immuneTo`. */
  conditionImmunities?: (character: Bearing) => readonly ConditionId[]
  /**
   * The least the total of a hero's own check or save counts as, where a feature raises it (Indomitable Might's
   * Strength score). Read for the read's check (../services/adventure-roll-result-service) and in ./spells `rollSave`.
   */
  totalFloor?: (character: Roller, check: Check) => number | undefined
  /**
   * What a feature does for a hero a roll or a round dropped to 0 hit points without killing them (Relentless Rage):
   * `was` is how they stood before, `now` how they lie. Read in ./spell-effects `settleConcentration`, which every
   * roll that harms is settled by, before Concentration is.
   */
  downed?: <T extends Felling>(args: { was: T; now: T; d20: () => number }) => { character: T; name: string; text: string } | undefined
  /**
   * The feature that keeps any attack roll against a hero from having Advantage now (Elusive), by name, or none. Read
   * where an attack roll's Advantage and Disadvantage are settled (./attack-roll `attackRequirement`, and a spell attack
   * in ../services/roll-requirement-service).
   */
  advantageBarred?: (target: Roller) => string | undefined
  /** Whether a hero's own attack roll leaves their hiding's Invisible on them (Stealth Attack). Read in ./actions `afterRoll`. */
  staysHidden?: (attacker: Bearing, made: AttackMade) => boolean
  /** Whether a condition a class feature gave (`feature` on its entry) ends when its bearer takes damage (Knock Out). Read in ./death `withDamage`. */
  endsOnDamage?: (entry: ConditionEntry) => boolean
  /**
   * Whether an item's charges about to be spent are kept, by a die a feature rolls (Use Magic Device's d6), with its
   * words. Read in ./item-spend `withChargesSpent`.
   */
  keepsCharges?: (character: Roller, roll: (sides: number) => number) => { kept: boolean; text: string } | undefined
}

/** One of a hero's own attack rolls as it was made: what was asked (with the choices and the cover), the damage it dealt, and the floor. */
export type AttackMade = { attack: { weapon: string; target: string; cover?: string; choices?: Record<string, string> }; dealt: number; floor?: Floor }

/**
 * A failed saving throw of the hero's own against harm, and what may still save it: the save as it then stands, the
 * feature whose use it spends, and its name for the story. `stakes` is what the failure would cost. `d20` rolls a die
 * for a reroll.
 */
export type SaveRule = (args: {
  character: Roller & { featureUses?: Record<string, number> }
  ability: AbilityId
  result: CheckResult
  stakes: SaveStakes
  d20: () => number
}) => { result: CheckResult; feature: string; name: string } | undefined

/**
 * An aura: a standing effect a hero's feature spreads to themselves and those of their side within its reach, while the
 * hero is not Incapacitated. Its reach is the feature's typed Emanation (`area`), grown by the level (`areaSizeByLevel`).
 * A creature in two of one feature's auras takes the better.
 */
export type AuraRule = {
  /** The class feature it comes from, by SRD id. */
  feature: string
  /** What it adds to each saving throw of one it reaches (Aura of Protection's Charisma modifier). */
  saveBonus?: (bearer: Roller) => number
}

/** A round as it turns, for `roundStart`: everyone here, and the dice. */
export type RoundTurn = { everyone: readonly (Roller & { id: string; position?: Point })[]; d20: () => number; roll: (sides: number) => number }

/** One a feature may be lasting on, with the spells and effects that last on them. */
export type Lasting = Roller & { id?: string; spellEffects?: readonly SpellEffect[] }

/** What a spell attack's hit hands a class: who cast it and who it hit, with where they stand, and the floor if any. */
export type SpellHitArgs = { caster: Roller & { id: string; position?: Point }; spell: Spell; target: Roller & { id: string; position?: Point }; floor?: Floor }

/** What a class adds to a spell attack's hit: `bonus` added to its damage, and `to`, where the one hit is pushed. */
export type SpellHit = { name: string; bonus?: number; to?: Point }

/** One who may fell or be felled, with their hit points, Temporary Hit Points and place. */
export type Felling = Bearing & { id: string; name?: string; position?: Point; tempHitPoints?: number; dead?: true }

/** One a feature may be lasting on: a character with the turn effects it bears, and whether their turn this round is over. */
export type Bearing = Roller & { id?: string; turnEffects?: readonly TurnEffect[]; isComplete?: boolean; hitPoints?: number; healthPercent?: number }

/** One who uses a class feature: a hero with uses spent and spell slots, as the engine keeps them. */
export type Featured = Roller & {
  id: string
  name: string
  type: string
  hitPoints?: number
  healthPercent?: number
  dead?: true
  featureUses?: Record<string, number>
  spellSlots?: readonly number[]
  inspiration?: { die: number; by: string }
}

/** A hero's Bonus Action as the menu offers it, with its uses. */
export type BonusAction = {
  id: string
  name: string
  /** How many uses the hero has, and how many are left. None for one used as often as the hero likes. */
  uses?: number
  left?: number
  /** Whether it is given to someone else. */
  targeted: boolean
  /** The level of the spell slot a use costs when none is left (Font of Inspiration). */
  slot?: number
}

/** A Bonus Action used, for the story: who it went to, the hit points it moved, and what happened in words. */
export type FeatureUse = { feature: string; name: string; target?: string; harm?: Harm[]; fact: string }

/** A Bonus Action a class feature gives. */
export type BonusActionRule = {
  /** Its id on the read's menu. */
  id: string
  /** The class feature it comes from, by SRD id. Its uses are that feature's. */
  feature: string
  /** Its name on the menu, where it is not the feature's own: "Cunning Action: Dash". It then counts no uses, unless it `spends` one. */
  name?: string
  /** A use of the feature is spent on it though it has a name of its own: the menu counts the uses left, and offers it only while one is (Flurry of Blows' Focus Point). */
  spends?: true
  /** Whether the hero may take it now, beside having the feature: Martial Arts' Bonus Unarmed Strike only in no armor and with no Shield. */
  offer?: (character: Roller) => boolean
  /** Given to someone else, who the game master names. */
  targeted?: true
  /** The level of the spell slot that buys a use when none is left. */
  buys?: (character: Pick<Featured, "sheet" | "featureUses" | "spellSlots">) => number | undefined
  /** A line of the read's prompt below the Bonus Actions, given once however many share it. */
  note?: string
  /** It moves as a Dash does: twice the Speed. */
  dash?: true
  /** The feet more it lets the hero move this turn, beside their Speed (Instinctive Pounce's half Speed with a Rage entered). Read in ./moves `takeMove`. */
  moveBonus?: (character: Roller) => number
  /** It cannot be taken with a move, and is dropped when the read moves the hero. */
  still?: true
  /** Advantage or Disadvantage it gives the turn's attack roll. */
  attackModes?: readonly ModeSource[]
  /** The roll it leaves to follow the turn's own, by the key of a follow-up (`FollowRule`): "hide". */
  follow?: string
  /** Whether a move taken with it draws no Opportunity Attacks, by the feet moved. */
  disengages?: (character: Roller & { id: string; position?: { x: number; y: number } }, feet: number) => boolean
  /**
   * The hero as taking it leaves them, where it changes their attacks (Wild Shape's form): an attack read beside it is
   * made with the attacks they then have (../services/roll-requirement-service).
   */
  becomes?: <T extends Roller>(character: T) => T
  /** What using it does. Everyone comes back as it left them, with what happened. A use that cannot be made returns no use. */
  use: (args: { characters: Featured[]; actor: Featured; action: BonusAction; target?: string; roll: (sides: number) => number }) => { characters: Featured[]; use?: FeatureUse }
}

/** What a choice of the read hands the code that applies it: who chose, where everyone is, and the game master's pick. */
export type ChoiceContext = {
  character: Character
  self?: string
  /** Everyone here who is not dead and has not fled. */
  everyone: readonly { id: string; name: string; type?: string; statBlock?: string; sheet?: unknown }[]
  /** The game master's pick, every field of it. */
  pick: Record<string, unknown> & { targets?: string[]; target?: string; damageType?: string }
  /** Whether a name given is this id or this name. */
  named: (given: string | undefined, name: string, id: string) => boolean
  /** What the reading carries beside its roll so far. */
  also: Partial<TurnReading>
}

/**
 * A choice the read offers a hero beside the action, while it can be used: Action Surge, a Cunning Strike, Channel
 * Divinity. It is a field of the game master's pick under `key`, with a line of the prompt. Only a hero is offered one.
 */
export type ChoiceRule = {
  /** The field of the pick, and of the reading or the attack that keeps it: "surge". */
  key: string
  /** What the hero may pick now: its values, or true for yes or no. None while it cannot be used. */
  offer: (character: Character) => readonly string[] | true | undefined
  /** Its line of the read's prompt, ending in a new line. */
  prompt: (values: readonly string[] | true) => string
  /** Its field in the read's schema. */
  field: (values: readonly string[] | true) => z.ZodType
  /**
   * With an attack: "attack" keeps the pick on the attack, read as the blow lands (a Cunning Strike), and "turn" on
   * the reading, applied with it (Action Surge). `actions` is how many more actions it gives the turn. With a spell
   * cast as the action: "cast" keeps the pick on the cast, and `cast` says what it does to it (Metamagic).
   */
  rides?: "attack" | "turn" | "cast"
  actions?: number
  cast?: CastChoice
  /** A check of the pick's menu that uses it as the turn's whole action, with the reading it makes: "channel-divinity". */
  check?: string
  act?: (value: string | undefined, context: ChoiceContext) => TurnReading
  /** The effects of a class feature used as the action (`RequiredFeature`) it resolves, by id, and how. */
  effects?: readonly string[]
  resolve?: (args: {
    characters: Featured[]
    actorId: string
    feature: RequiredFeature["feature"]
    d20: () => number
    roll: (sides: number) => number
    rules?: DeathRules
  }) => Cast<Featured> & { problem?: string; name: string }
  /** As a reading that took it is applied: what it spends, and its beat for the story. */
  apply?: (characters: Featured[], actorId: string) => { characters: Featured[]; told?: { name: string; text: string } }
  /**
   * Advantage or Disadvantage it gives the attack the read asks for, made before `apply` has run (Reckless Attack). The
   * attacks that follow read what `apply` left.
   */
  attackModes?: (character: Roller, attack: Attack) => readonly ModeSource[]
  /** What it adds to the attack roll the read asks for, made before `apply` has run (Sacred Weapon). The attacks that follow read what `apply` left. */
  attackBonus?: (character: Roller, attack: Attack) => number
  /** It takes the turn's Bonus Action (a smite): the read leaves it out when the reading uses another. */
  bonusAction?: true
  /**
   * For a choice that rides the attack: whether it goes with the attack the read asks for, given up any Advantage on it
   * as its price (Brutal Strike). `chosen` holds the choices of the turn read so far. The roll is then made with no
   * Advantage, and the choice is left off a roll that has Disadvantage (./attack-roll `attackRequirement`).
   */
  forgoesAdvantage?: (character: Roller, attack: Attack, chosen: Readonly<Record<string, true>> | undefined) => boolean
}

/** A cast as a choice that rides it reads it: the spell, the level it takes effect at, the slot it spends if any, and the damage type picked. */
export type ChoiceCast = { spell: Spell; level: number; slot?: number; damageType?: DamageTypeId }

/** What a spell is cast with, as ./spells `castSpell` takes it. */
export type CastInput<T extends Castee> = Parameters<typeof castSpell<T>>[0]

/** What a choice that rides a cast does to it (Metamagic). */
export type CastChoice = {
  /** Whether it goes with this cast. One that does not is left off the reading. */
  fits: (caster: Rested, cast: ChoiceCast, value: string | true) => boolean
  /** The spell and level as the choice makes them: read where the cast's range and targets are settled, and where it is resolved. */
  shape?: (cast: ChoiceCast, value: string | true) => Pick<ChoiceCast, "spell" | "level">
  /**
   * The cast resolved with the choice: `resolve` is the engine's own resolution, of the cast it is handed. It comes back
   * with what the choice spent, and its facts. `slot` is the slot level the cast spends, still unspent.
   */
  around?: <T extends Castee>(args: { input: CastInput<T>; value: string | true; slot?: number; resolve: (input: CastInput<T>) => Cast<T> }) => Cast<T>
}

/** What a reaction to an attack roll is asked with: `hit` is the roll in words, and `ask` offers it to `to`. */
export type AttackRollAnswer = {
  characters: Featured[]
  attacker: Featured
  rolled: RolledAttack
  hit: string
  roll: (sides: number) => number
  ask: (to: string, matters: boolean, text: string) => boolean
}

/** A reaction taken, for the story: who took it, which, and what it did in words. */
export type Reacted = { by: string; id: string; name: string; text: string }

/** A reaction a class feature gives a hero. Every one defaults to the standing order "when-it-matters". */
export type ReactionRule = {
  id: string
  name: string
  /** Whether a hero has it, for their sheet and standing orders. */
  has: (character: Roller) => boolean
  /** An answer to another's attack roll, before the blow lands (Cutting Words). Everyone comes back as it left them. */
  onAttackRoll?: (args: AttackRollAnswer) => { characters: Featured[]; rolled: RolledAttack; reaction: Reacted } | undefined
  /**
   * The one hit answers once the damage is known, and takes `taken` in its place (Uncanny Dodge). `types` are the hit's
   * damage types, and `roll` throws a die the answer rolls (Deflect Attacks).
   */
  onDamage?: (args: {
    target: Featured
    attacker: Featured
    taken: number
    hit: string
    ask: (matters: boolean, text: string) => boolean
    types: readonly DamageTypeId[]
    roll: (sides: number) => number
  }) => { taken: number; reaction: Reacted } | undefined
  /**
   * An answer once a blow has landed and dealt its damage: the one hit strikes back at the attacker with one attack, by
   * the attack's id (Retaliation). Asked of the one hit while they can react, up and with the attacker within 5 feet.
   * Read in ./reactions `attackWithReactions`.
   */
  strikesBack?: (args: { target: Featured; attacker: Featured; taken: number }) => string | undefined
  /** How the story tells damage this reaction cut, after the blow's damage: " Poppen halves it with Uncanny Dodge." */
  damageWords?: (target: string) => string
  /** An answer to another's check that succeeds (Cutting Words). Saving throws are not answered. */
  onCheck?: (args: {
    characters: Featured[]
    roller: Featured
    result: CheckResult
    roll: (sides: number) => number
    ask: (to: string, matters: boolean, text: string) => boolean
  }) => { characters: Featured[]; result: CheckResult; reaction: Reacted } | undefined
}

/** Damage a feature adds to a hit, and the once-a-turn mark it uses (`TurnEffectRule`). */
export type Extra = { name: string; damage: DamagePart; once?: string }

/** What a hit rule reads: the attack, its roll, who stands beside the target, and what the attacker chose. */
export type HitArgs = {
  attacker: Roller & { id?: string; turnEffects?: readonly TurnEffect[] }
  attack: Attack
  /** The weapon's equipment entry, for a hero's weapon. */
  weapon?: { properties?: readonly string[]; attackType?: string; damage: { type: DamagePart["type"] } }
  roll: AttackResult
  /** An ally of the attacker's stands within 5 feet of the target, up and able to act. */
  allyBeside: boolean
  /** The target is missing some of its hit points. */
  hurt: boolean
  turnOf?: string
  choices?: Record<string, string>
  /** The one hit, as the blow finds them: a smite's more dice on a Fiend or an Undead. */
  target?: Target
}

/** What rode on a hit once its damage was dealt, kept on the blow: a Cunning Strike's Trip and its save. */
export type HitRider = { id: string; effect: string; save?: CheckResult; took: boolean }

/** What rides on a hit. */
export type HitRule = {
  /** The rule's id, which the rider it leaves on the blow carries. */
  id: string
  /** Damage it adds to the hit. */
  damage?: (args: HitArgs) => Extra | undefined
  /** What it does once the damage is dealt: the target as it left them, and the rider. A target the blow dropped is passed too. */
  after?: <T extends Target>(args: {
    attacker: Roller & { id?: string }
    target: T
    added: readonly string[]
    choices?: Record<string, string>
    roll: (sides: number) => number
    /** The attack that hit. */
    attack: Attack
  }) =>
    | {
        target: T
        rider: HitRider
        conditions: ConditionChange[]
        /** A use of the attacker's feature it spent, by the feature's id: a Stunning Strike's Focus Point. */
        spends?: string
        /** The once-a-turn mark it leaves on the attacker (`TurnEffectRule`). */
        once?: string
      }
    | undefined
  /** How the story tells the rider, at the end of the hit's facts. */
  words?: (attacker: string, target: string, rider: HitRider) => string
  /** The damage type the hit's own damage is dealt as, in place of its own (Sacred Weapon's Radiant). Read in ./attack `landBlow`. */
  retype?: (args: HitArgs) => DamageTypeId | undefined
  /**
   * What the hit leaves on everyone once it has landed and its damage is dealt, by what `added` names: a smite's spell
   * slot spent, the Concentration it begins and the spell it leaves on the target. Read in ./reactions `attackWithReactions`.
   */
  landed?: <T extends Landed>(args: { characters: T[]; attackerId: string; targetId: string; added: readonly string[]; choices?: Record<string, string> }) => T[]
}

/** One a hit's landing may change: a hero with uses, slots, lasting spells and Concentration, and whether their turn this round is over. */
export type Landed = Featured & { spellEffects?: readonly SpellEffect[]; concentration?: Concentration; isComplete?: boolean }

/**
 * A turn effect a class leaves. `span` 1 ends as the next round begins: a once-a-turn mark, with `by` whose turn it
 * was. 2 lasts until the turn of the one who gave it comes round again.
 */
export type TurnEffectRule = {
  id: string
  span: 1 | 2
  /** Its words for the screen and the game master while it holds. None for a mark the screen does not show. */
  words?: (effect: TurnEffect) => string
  /** Advantage or Disadvantage on an attack roll against its bearer. */
  against?: (effect: TurnEffect, attacker: Roller & { id: string }, bearer: Roller & { id: string; name: string }) => ModeSource[]
  /** Advantage or Disadvantage on an attack roll its bearer makes, with the attack where it is a weapon's or a strike's. */
  attacking?: (effect: TurnEffect, bearer: Roller & { id: string }, target: Roller & { id: string; name: string }, attack?: Attack) => ModeSource[]
  /** Advantage or Disadvantage on its bearer's check or save. */
  checking?: (effect: TurnEffect, bearer: Roller & { id: string }, check: Check) => ModeSource[]
  /** Its bearer's Speed is halved while it holds (./actions `movementEffects`). */
  halvesSpeed?: true
  /**
   * It ends once an attack roll is made against its bearer: it is for the next attack only (./actions `afterRoll`).
   * "by-others" ends it only on a roll by someone other than the one who gave it (Sundering Blow).
   */
  endsWhenAttacked?: true | "by-others"
  /** What it adds to an attack roll against its bearer (Sundering Blow's 5). Of several such effects, the most counts. Read in ./attack `rollAttack`. */
  attackedBonus?: (effect: TurnEffect, attacker: Roller & { id?: string }) => number
  /** The feet it takes from its bearer's Speed while it holds (Hamstring Blow's 15). Of several, the most counts (./actions `movementEffects`). */
  slowsBy?: number
  /**
   * Its bearer is pushed this many feet straight away from the one who gave it, as the attack roll that gave it is
   * settled, and it ends (Forceful Blow). Read in ./actions `afterRoll`, which knows the floor's walls.
   */
  pushes?: number
  /** Its bearer makes no Opportunity Attacks while they bear it (./reactions `opportunityAttacks`). */
  barsOpportunityAttacks?: true
}

/** A check of the hero's own that failed, and what may still save it. `after` is what saving it spends. */
export type CheckRule = (args: {
  character: Roller & { featureUses?: Record<string, number> }
  check: Check
  result: CheckResult
  roll: (sides: number) => number
  /** Whether failing costs the roller something the read put at stake on the roll: harm, or a condition. */
  staked?: boolean
}) => { result: CheckResult; after?: <T extends { featureUses?: Record<string, number> }>(character: T) => T } | undefined

/** What a turn holds after the roll just made, kept on the roll's `after` (../validations/roll-requirement-schema). */
export type After = NonNullable<RequiredRoll["after"]>

/**
 * A roll a turn asks for after the one just made, kept on `after` under `key` until it is made. One with `attack`
 * comes with the attacks of the action, after the rest of them (Horde Breaker), and is lost once they are done. One
 * without follows everything else (Hide).
 */
export type FollowRule = {
  key: string
  attack?: true
  /** Whether a hero's Attack action holds it from its first attack. */
  offer?: (character: InScene) => boolean
  /** The roll as the turn's own, where the turn has no other (Hide). */
  first?: (character: InScene) => RequiredRoll
  next: (args: {
    character: InScene
    made: RequiredRoll
    /** What the attack just made was made with, for one that comes with the action's attacks. */
    attack?: Attack
    struck: string[]
    present: readonly InScene[]
    floor?: Floor
    /** The roll for an attack, or none where the rules of space allow none. */
    ask: (using: Attack, target: InScene, rest: After) => RequiredRoll | undefined
    /** What the turn holds after the roll it makes: the action's attacks done, this one spent, with `extra` laid over. */
    rest: (extra?: After) => After
  }) => RequiredRoll | undefined
}

/** One who rests, as ./rest keeps them. */
export type Rested = Roller & { name?: string; featureUses?: Record<string, number>; spellSlots?: readonly number[] }

// The lists a class file may give.
type Lists = { [K in keyof ClassRules]-?: NonNullable<ClassRules[K]> extends readonly (infer R)[] ? R[] : never }
type ListKey = { [K in keyof Lists]: Lists[K] extends never ? never : K }[keyof Lists]

// Every class's rules of one kind, in the order of the classes and then of each class file.
const every = <K extends ListKey>(key: K): Lists[K] => classes().flatMap((rules) => (rules[key] ?? []) as Lists[K][number][]) as Lists[K]

export const bonusActionRules = (): BonusActionRule[] => every("bonusActions")
export const bonusActionRule = (id: string | undefined): BonusActionRule | undefined => bonusActionRules().find((rule) => rule.id === id)
export const choiceRules = (): ChoiceRule[] => every("choices")
export const choiceRule = (key: string): ChoiceRule | undefined => choiceRules().find((rule) => rule.key === key)
/** The choice that resolves a class feature used as the action, by the effect's id: Channel Divinity's "turn-undead". */
export const effectChoice = (effect: string): ChoiceRule | undefined => choiceRules().find((rule) => rule.effects?.includes(effect))
export const reactionRules = (): ReactionRule[] => every("reactions")
export const reactionRule = (id: string): ReactionRule | undefined => reactionRules().find((rule) => rule.id === id)
export const hitRules = (): HitRule[] => every("hits")
export const hitRule = (id: string): HitRule | undefined => hitRules().find((rule) => rule.id === id)
export const turnEffectRule = (id: string): TurnEffectRule | undefined => every("turnEffects").find((rule) => rule.id === id)
export const checkRules = (): CheckRule[] => every("checks")
export const saveRules = (): SaveRule[] => every("saves")
export const auraRules = (): AuraRule[] => every("auras")
/** Whether a hero's class gives them Evasion. */
export const classEvasion = (character: Roller): boolean => !!character.sheet && classes().some((rules) => rules.evasion?.(character))
/** The least the d20 of a hero's own check counts as by their class, or none. */
export const classD20Floor = (character: Roller, check: Check): number | undefined =>
  character.sheet ? classes().reduce<number | undefined>((most, rules) => Math.max(most ?? 0, rules.d20Floor?.(character, check) ?? 0) || undefined, undefined) : undefined
export const followRules = (): FollowRule[] => every("follows")
/** The mastery property a hero's class has their attack use in place of the weapon's own, or none. */
export const classMastery = (character: Roller, weaponId: string, choices: Readonly<Record<string, string>> | undefined): string | undefined =>
  character.sheet ? classes().reduce<string | undefined>((found, rules) => found ?? rules.mastery?.(character, weaponId, choices), undefined) : undefined
/** The one an attack roll was made against, as the attacker's class features leave them once it hit or missed. */
export const settledByClasses = <T extends Bearing>(attacker: Bearing & { id: string }, target: T, hit: boolean): T =>
  attacker.sheet ? classes().reduce((now, rules) => rules.attackSettled?.({ attacker, target: now, hit }) ?? now, target) : target
/** Advantage a hero's class gives their Death Saving Throw, and the least die that counts as a 20 (20 where none lowers it). */
export function classDeathSave(character: Roller): { modes: ModeSource[]; twentyFrom: number } {
  const found = character.sheet ? classes().flatMap((rules) => rules.deathSave?.(character) ?? []) : []
  return { modes: found.flatMap((one) => one.modes), twentyFrom: Math.min(20, ...found.map((one) => one.twentyFrom ?? 20)) }
}
/** Conditions a hero's class features make them immune to for now. */
export const classConditionImmunities = (character: Bearing): ConditionId[] => (character.sheet ? [...new Set(classes().flatMap((rules) => rules.conditionImmunities?.(character) ?? []))] : [])
// ./conditions `immuneTo` reads them through ./late-rules, which loads no class file.
registerImmunities((character) => classConditionImmunities(character as Bearing))
// ./spell-effects `settleConcentration` answers those a roll dropped through it too.
registerDowned((args) => afterDowned(args as unknown as Parameters<typeof afterDowned>[0]))
/** The least the total of a hero's own check or save counts as by their class, or none. */
export const classTotalFloor = (character: Roller, check: Check): number | undefined =>
  character.sheet ? classes().reduce<number | undefined>((most, rules) => Math.max(most ?? 0, rules.totalFloor?.(character, check) ?? 0) || undefined, undefined) : undefined

/**
 * Everyone after the classes answer the heroes a roll or a round dropped to 0 hit points without killing them
 * (Relentless Rage): each up in `before` and down, not dead, in `after`. Each answer comes with its words for the story.
 */
export function afterDowned<T extends Felling>(args: { before: readonly T[]; after: readonly T[]; d20: () => number }): { characters: T[]; told: { by: string; name: string; text: string }[] } {
  const down = (character: Felling) => !!character.dead || character.hitPoints === 0 || character.healthPercent === 0
  const told: { by: string; name: string; text: string }[] = []
  const characters = args.after.map((now) => {
    const was = args.before.find((one) => one.id === now.id)
    if (!was || !now.sheet || now.dead || down(was) || !down(now)) return now
    for (const rules of classes()) {
      const answered = rules.downed?.({ was, now, d20: args.d20 })
      if (!answered) continue
      told.push({ by: now.id, name: answered.name, text: answered.text })
      return answered.character
    }
    return now
  })
  return { characters, told }
}

/** What the classes may still do for one of a hero's own checks that failed: the first that answers, or none. */
export function rescuedCheck(args: Parameters<CheckRule>[0]): ReturnType<CheckRule> {
  for (const rule of checkRules()) {
    const answered = rule(args)
    if (answered) return answered
  }
  return undefined
}

/** Advantage and Disadvantage the classes give a hero's own check or save, each with what it comes from. */
export const classCheckModes = (character: Roller, check: Check): ModeSource[] => (character.sheet ? classes().flatMap((rules) => rules.checkModes?.(character, check) ?? []) : [])
/** Whether a hero's class gives them Advantage on Initiative. */
export const classInitiativeAdvantage = (character: Roller): boolean => !!character.sheet && classes().some((rules) => rules.initiativeAdvantage?.(character))
export const seesRules = (): NonNullable<ClassRules["sees"]>[] => classes().flatMap((rules) => (rules.sees ? [rules.sees] : []))
export const shortRestRules = (): NonNullable<ClassRules["shortRest"]>[] => classes().flatMap((rules) => (rules.shortRest ? [rules.shortRest] : []))
export const roundStartRules = (): NonNullable<ClassRules["roundStart"]>[] => classes().flatMap((rules) => (rules.roundStart ? [rules.roundStart] : []))
/** One of a hero's own attacks as their class features change it. */
export const classAttack = (character: Roller, attack: Attack): Attack => (character.sheet ? classes().reduce((now, rules) => rules.attack?.(character, now) ?? now, attack) : attack)
/** A hero as their class features leave them once Initiative is rolled. */
export const atInitiative = <T extends Rested & { hitPoints?: number }>(character: T, roll: (sides: number) => number): T =>
  character.sheet ? classes().reduce((now, rules) => rules.initiative?.(now, roll) ?? now, character) : character
/** Damage types a hero's class features make them resist for now, beside the sheet's standing ones. */
export const classResistances = (character: Bearing): DamageTypeId[] => (character.sheet ? [...new Set(classes().flatMap((rules) => rules.resistances?.(character) ?? []))] : [])
/** The ability a hero's class has them make a check with in place of its own, or none. */
export const classCheckAbility = (character: Bearing, check: Check): AbilityId | undefined =>
  character.sheet ? classes().reduce<AbilityId | undefined>((found, rules) => found ?? rules.checkAbility?.(character, check), undefined) : undefined
/** The bonus a character adds to a check, made with the ability their class has them use in place of its own (Primal Knowledge). */
export const classCheckBonus = (character: Bearing, check: Check): number => checkBonus(character, check, classCheckAbility(character, check))
/** Why a hero's class bars them from casting now, or none. */
export const classCastingBar = (character: Bearing): string | undefined =>
  character.sheet ? classes().reduce<string | undefined>((found, rules) => found ?? rules.castingBarred?.(character), undefined) : undefined
/** An attacker after their own attack roll against an enemy, as each class's features take it. */
export const afterClassAttackRoll = <T extends Bearing & { position?: Point }>(attacker: T, target: Bearing & { position?: Point }, made?: AttackMade): T =>
  attacker.sheet ? classes().reduce((now, rules) => rules.attackRolled?.(now, target, made) ?? now, attacker) : attacker
/** The feature that keeps any attack roll against a hero from having Advantage now (Elusive), by name, or none. */
export const classAdvantageBar = (target: Roller): string | undefined =>
  target.sheet ? classes().reduce<string | undefined>((found, rules) => found ?? rules.advantageBarred?.(target), undefined) : undefined
/**
 * An attack roll's Advantage taken away where the one attacked bars it (Elusive): the game master's read and the typed
 * sources of Advantage are dropped, and the feature is named among the reasons. Disadvantage stands.
 */
export function withAdvantageBarred(
  target: Roller,
  picked: "advantage" | "disadvantage" | "normal",
  typed: readonly ModeSource[]
): { picked: "advantage" | "disadvantage" | "normal"; typed: ModeSource[]; barred?: string } {
  const barred = classAdvantageBar(target)
  if (!barred || (picked !== "advantage" && !typed.some((source) => source.mode === "advantage"))) return { picked, typed: [...typed] }
  return { picked: picked === "advantage" ? "normal" : picked, typed: typed.filter((source) => source.mode !== "advantage"), barred }
}
/** Whether a hero's own attack roll leaves their hiding's Invisible on them (Stealth Attack). */
export const classStaysHidden = (attacker: Bearing, made: AttackMade): boolean => !!attacker.sheet && classes().some((rules) => rules.staysHidden?.(attacker, made))
/** A character with the conditions a class feature gave that end on damage taken off: Knock Out's Unconscious. */
export function withDamageEndings<T extends { conditions?: readonly ConditionEntry[] }>(character: T): T {
  const ends = (entry: ConditionEntry) => !!entry.feature && classes().some((rules) => rules.endsOnDamage?.(entry))
  if (!character.conditions?.some(ends)) return character
  const conditions = character.conditions.filter((entry) => !ends(entry))
  const { conditions: _, ...rest } = character
  return (conditions.length ? { ...rest, conditions } : rest) as T
}
/** Whether a hero's class keeps an item's charges about to be spent, by its die, with its words, or none. */
export const classKeepsCharges = (character: Roller, roll: (sides: number) => number): { kept: boolean; text: string } | undefined =>
  character.sheet ? classes().reduce<{ kept: boolean; text: string } | undefined>((found, rules) => found ?? rules.keepsCharges?.(character, roll), undefined) : undefined
/** How far a hero's own spell reaches as their class lengthens it, or none where no feature does. */
export const classSpellRange = (caster: Roller, spell: Spell): number | undefined =>
  caster.sheet ? classes().reduce<number | undefined>((found, rules) => found ?? rules.spellRange?.(caster, spell), undefined) : undefined
/** What the classes add to one hit of a hero's own spell attack, each with its name. */
export const classSpellHits = (args: SpellHitArgs): SpellHit[] => (args.caster.sheet ? classes().flatMap((rules) => rules.spellHit?.(args) ?? []) : [])
/** Advantage and Disadvantage a hero's class gives their save to keep Concentration. */
export const classConcentrationModes = (character: Roller): ModeSource[] => (character.sheet ? classes().flatMap((rules) => rules.concentrationModes?.(character) ?? []) : [])
/** What a hero's class features add to the save DC of their own class spells for now. */
export const classSpellSaveDc = (character: Lasting): number => (character.sheet ? classes().reduce((sum, rules) => sum + (rules.spellSaveDc?.(character) ?? 0), 0) : 0)
/** Advantage and Disadvantage a hero's class features give their attack roll with one of their own spells. */
export const classSpellAttackModes = (character: Lasting, spell: Spell): ModeSource[] => (character.sheet ? classes().flatMap((rules) => rules.spellAttackModes?.(character, spell) ?? []) : [])
/** The spell slots a hero's class features have made beyond the class table's, by spell level. */
export function classCreatedSlots(character: Rested): number[] {
  const made: number[] = []
  if (!character.sheet) return made
  for (const rules of classes()) for (const [index, count] of (rules.createdSlots?.(character) ?? []).entries()) made[index] = (made[index] ?? 0) + count
  return made
}

// The choices that ride a cast, each with the value picked, in the order of the classes.
const castRiders = (choices: Readonly<Record<string, string | true>> | undefined) =>
  choiceRules().flatMap((rule) => {
    const value = choices?.[rule.key]
    return rule.rides === "cast" && rule.cast && value !== undefined ? [{ choice: rule.cast, value }] : []
  })

/** A cast as the choices riding it make it: the spell and the level it is measured and resolved at. */
export function shapedCast(choices: Readonly<Record<string, string | true>> | undefined, cast: ChoiceCast): ChoiceCast {
  let now = cast
  for (const { choice, value } of castRiders(choices)) now = { ...now, ...(choice.shape?.(now, value) ?? {}) }
  return now
}

/**
 * A cast resolved with the choices riding it. Each choice wraps the engine's resolution in turn, the first outermost,
 * and the cast is handed in as the choices shape it.
 */
export function resolveChosenCast<T extends Castee>(args: {
  choices: Readonly<Record<string, string | true>> | undefined
  input: CastInput<T>
  slot?: number
  resolve: (input: CastInput<T>) => Cast<T>
}): Cast<T> {
  const riders = castRiders(args.choices)
  if (!riders.length) return args.resolve(args.input)
  const shaped = shapedCast(args.choices, { spell: args.input.spell, level: args.input.level ?? args.input.spell.level, slot: args.slot, damageType: args.input.damageType })
  const run = riders.reduceRight<(input: CastInput<T>) => Cast<T>>(
    (next, { choice, value }) => (choice.around ? (input) => choice.around?.({ input, value, slot: args.slot, resolve: next }) ?? next(input) : next),
    args.resolve
  )
  return run({ ...args.input, spell: shaped.spell, level: shaped.level })
}

/**
 * Everyone after the classes answer the enemies a roll dropped to 0 hit points (Dark One's Blessing): each one up
 * before the roll and down after it, as `before` and `after` hold them, offered to every hero. `by` is whose roll it
 * was. Each gain comes with its words for the story.
 */
export function afterFelled<T extends Felling>(args: { before: readonly T[]; after: readonly T[]; by: string }): { characters: T[]; told: { by: string; name: string; text: string }[] } {
  const down = (character: Felling) => !!character.dead || character.hitPoints === 0 || character.healthPercent === 0
  const felled = args.after.filter((now) => down(now) && args.before.some((was) => was.id === now.id && !down(was)))
  let characters = [...args.after]
  const told: { by: string; name: string; text: string }[] = []
  for (const fallen of felled) {
    for (const rules of classes()) {
      if (!rules.felled) continue
      characters = characters.map((character) => {
        if (!character.sheet || down(character)) return character
        const gained = rules.felled?.({ character, felled: fallen, by: args.by })
        if (!gained) return character
        told.push({ by: character.id, name: gained.name, text: gained.text })
        return gained.character
      })
    }
  }
  return { characters, told }
}

/** A character with a class's turn effect given, for its span, by `by`. One of the same id and giver is replaced. */
export function withTurnEffect<T extends { turnEffects?: readonly TurnEffect[] }>(character: T, id: string, by: string): T {
  const span = turnEffectRule(id)?.span
  if (!span) throw new Error(`"${id}" is no class's turn effect.`)
  return { ...character, turnEffects: [...(character.turnEffects ?? []).filter((held) => !(held.id === id && held.by === by)), { id, by, turns: span }] }
}
