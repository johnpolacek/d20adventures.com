import type { z } from "zod"
import type { TurnReading } from "../services/roll-requirement-service"
import type { Character } from "../types/character"
import type { RequiredFeature, RequiredRoll } from "../validations/roll-requirement-schema"
import type { Attack, AttackResult, DamagePart, RolledAttack, Target } from "./attack"
import type { InScene } from "./attack-roll"
import type { Check, CheckResult, Roller } from "./check"
import { classes } from "./classes"
import type { ModeSource } from "./conditions"
import type { DeathRules } from "./death"
import type { ConditionChange, Harm } from "./harm"
import type { Floor } from "./space"
import type { Cast } from "./spells"
import type { TurnEffect } from "./turn-effect"

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
  /** What the hero knows of another, told beside them in the read's Who Is Here (Hunter's Lore). */
  sees?: (character: Roller & { id: string }, other: Roller & { id: string }) => string | undefined
  /** What a Short Rest gives beyond the uses each feature's data brings back (Arcane Recovery). */
  shortRest?: <T extends Rested>(character: T) => { character: T; facts: string[] }
  /** What happens to a character as a round within an encounter gives way to the next, told under `name`. */
  roundStart?: <T extends Roller & { id: string }>(character: T) => { character: T; told?: { name: string; text: string } }
}

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
  /** Its name on the menu, where it is not the feature's own: "Cunning Action: Dash". It then counts no uses. */
  name?: string
  /** Given to someone else, who the game master names. */
  targeted?: true
  /** The level of the spell slot that buys a use when none is left. */
  buys?: (character: Pick<Featured, "sheet" | "featureUses" | "spellSlots">) => number | undefined
  /** A line of the read's prompt below the Bonus Actions, given once however many share it. */
  note?: string
  /** It moves as a Dash does: twice the Speed. */
  dash?: true
  /** It cannot be taken with a move, and is dropped when the read moves the hero. */
  still?: true
  /** Advantage or Disadvantage it gives the turn's attack roll. */
  attackModes?: readonly ModeSource[]
  /** The roll it leaves to follow the turn's own, by the key of a follow-up (`FollowRule`): "hide". */
  follow?: string
  /** Whether a move taken with it draws no Opportunity Attacks, by the feet moved. */
  disengages?: (character: Roller & { id: string; position?: { x: number; y: number } }, feet: number) => boolean
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
   * the reading, applied with it (Action Surge). `actions` is how many more actions it gives the turn.
   */
  rides?: "attack" | "turn"
  actions?: number
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
  /** The one hit answers once the damage is known, and takes `taken` in its place (Uncanny Dodge). */
  onDamage?: (args: { target: Featured; attacker: Featured; taken: number; hit: string; ask: (matters: boolean, text: string) => boolean }) => { taken: number; reaction: Reacted } | undefined
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
  }) => { target: T; rider: HitRider; conditions: ConditionChange[] } | undefined
  /** How the story tells the rider, at the end of the hit's facts. */
  words?: (attacker: string, target: string, rider: HitRider) => string
}

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
  /** Advantage or Disadvantage on an attack roll its bearer makes. */
  attacking?: (effect: TurnEffect, bearer: Roller & { id: string }, target: Roller & { id: string; name: string }) => ModeSource[]
  /** Advantage or Disadvantage on its bearer's check or save. */
  checking?: (effect: TurnEffect, bearer: Roller & { id: string }, check: Check) => ModeSource[]
}

/** A check of the hero's own that failed, and what may still save it. `after` is what saving it spends. */
export type CheckRule = (args: {
  character: Roller & { featureUses?: Record<string, number> }
  check: Check
  result: CheckResult
  roll: (sides: number) => number
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
export const followRules = (): FollowRule[] => every("follows")

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

/** A character with a class's turn effect given, for its span, by `by`. One of the same id and giver is replaced. */
export function withTurnEffect<T extends { turnEffects?: readonly TurnEffect[] }>(character: T, id: string, by: string): T {
  const span = turnEffectRule(id)?.span
  if (!span) throw new Error(`"${id}" is no class's turn effect.`)
  return { ...character, turnEffects: [...(character.turnEffects ?? []).filter((held) => !(held.id === id && held.by === by)), { id, by, turns: span }] }
}
