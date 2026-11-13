import type { AbilityId, ConditionId, DamageTypeId } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import type { Area, Monster, MonsterFeature } from "@d20/srd/schema/monsters"
import { isDead } from "../utils/turn-actors"
import { actionId, type DamagePart, damageTaken, defensesOf, rollDamage } from "./attack"
import type { BonusAction, BonusActionRule } from "./class-rules"
import type { ConditionSpan } from "./condition-entry"
import { conditionName, withCondition } from "./conditions"
import { afterHarm, type DeathRules, enduredWords, type Fate, withDamage } from "./death"
import type { ConditionChange, Harm } from "./harm"
import { hitPointsOf } from "./hit-points"
import { legendaryResistanceWords, withLegendaryResistanceSpent } from "./legendary-resistance"
import { typesTaken } from "./monster-traits"
import { damageOnSave, rescueWords, withRescueSpent } from "./save-rules"
import { shapeOf } from "./shape"
import { coverBonus } from "./space"
import { type Cast, type Castee, rollSave, type SaveRoll, spellById } from "./spells"
import { DEFAULT_STAT_BLOCK } from "./stat-block"

/**
 * What a stat block gives its creature beyond its attacks and its Spellcasting, read off the block: the Bonus Actions
 * that take an action of a turn (Cunning Action, Nimble Escape), and the actions that are no attack roll but a save
 * (a breath weapon), with an area or one target, a Recharge or uses a day. The stat block is an NPC's own, or the
 * Beast's a hero holds with Wild Shape: "Your game statistics are replaced by the Beast's stat block" (SRD 5.2.1, p. 42),
 * and its actions and Bonus Actions are among them.
 *
 * The data types an action's save, its DC, its area, its damage and its conditions, and every number is taken from
 * there. Its text is read too, by a strict reader that leaves an action unread, with the reason, when any word is left
 * over: how far one target may be, how long a condition lasts, and that nothing else rides the action. A Bonus Action
 * that casts spells is the block's spells (./spells `spellsOf`), and one that takes actions is read from its words.
 *
 * Uses are kept in the character's `featureUses`, under the feature's printed name. "Recharge 5–6" is one use, spent
 * when used and restored on a d6 roll of 5 or 6 as each of the creature's turns starts (`recharged`). "2/Day" is two,
 * restored by a Long Rest (./rest).
 */

/** The actions of a turn a stat block's Bonus Action may take. */
export const BONUS_TAKES = ["dash", "disengage", "hide"] as const
export type BonusTake = (typeof BONUS_TAKES)[number]

/** A Bonus Action of a stat block, as read: the actions it takes, or the spells it casts. */
export type BlockBonus = { feature: MonsterFeature; takes: BonusTake[] } | { feature: MonsterFeature; casts: string[] }

/** One of a stat block's actions that is a save, as read. */
export type BlockAction = {
  /** Its id on the read's menu: the name in lower case with dashes, "poison-breath". */
  id: string
  name: string
  ability: AbilityId
  dc: number
  /** Where it falls: an area of the creature's own (a Cone, a Line, an Emanation), or an area or one creature at a range. */
  area?: Area
  /** How far from the creature its one target, or its area's centre, may be, in feet. */
  range?: number
  /** The damage a failed save takes, rolled once for all. */
  damage: DamagePart[]
  /** Half of it on a success. Otherwise a success takes none. */
  half: boolean
  /** The conditions a failed save gives, each with how long it lasts. */
  conditions: { condition: ConditionId; span?: ConditionSpan; lasts: "target" | "source" | "until-source" | "own" }[]
  /** "Recharge 5–6": the d6 rolls that restore its one use. */
  recharge?: { min: number; max: number }
  /** Uses a day, or until a rest. */
  uses?: number
}

/** A stat block's action read, or why it is not. None for an attack, a Multiattack or Spellcasting, which are read elsewhere. */
export type ActionRead = BlockAction | { unread: string } | undefined

const ABILITY_WORDS: Record<string, AbilityId> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
// The creature as its text names it: "the dragon", "the bandit", "the spy".
const SUBJECT = "[Tt]he [a-z][a-z' -]*?"
const TAKES_WORDS: Record<string, BonusTake> = { Dash: "dash", Disengage: "disengage", Hide: "hide" }

/** A stat block's Bonus Action, read from its words, or why it is not. */
export function readBlockBonus(feature: MonsterFeature): BlockBonus | { unread: string } {
  const spells = feature.spellcasting?.spells
  if (spells?.length) {
    if (feature.spellcasting?.appliesWhen) return { unread: "a casting gated by words" }
    if (!feature.spellcasting?.sameAsSpellcasting) return { unread: "a casting with its own ability" }
    return { feature, casts: spells.map((spell) => spell.id) }
  }
  if (feature.saves || feature.attack || feature.damage) return { unread: "a Bonus Action with a save, an attack or damage" }
  const taken = new RegExp(`^${SUBJECT} takes the (Dash|Disengage|Hide)((?:(?:,? or |, )(?:Dash|Disengage|Hide))*) action\\.$`).exec(feature.text)
  if (!taken) return { unread: "a Bonus Action that takes no action of a turn" }
  const names = [taken[1], ...taken[2].split(/,? or |, /).filter(Boolean)]
  return { feature, takes: names.map((name) => TAKES_WORDS[name]) }
}

// "until the end of its next turn", "until the end of the dragon’s next turn", "until the start of the ghost’s next turn".
const SPAN = `(?: until the (end|start) of (its|${SUBJECT}[’']s) next turn)?`
const CONDITION = `the target has the ([A-Z][a-z]+) condition${SPAN}`

/**
 * One of a stat block's actions, read. An action that is a save is read when its words are only these, with the
 * numbers the data types:
 *
 * "<Ability> Saving Throw: DC <n>, <who>. Failure: <damage>, and the target has the <condition> condition until …. Success: Half damage."
 *
 * <who> is "each creature in a 15-foot Cone", "in a 30-foot-long, 5-foot-wide Line", "in a 10-foot Emanation
 * originating from the …", "in a 10-foot-radius Sphere centered on a point within 30 feet", or "one creature (the …
 * can see) within 60 feet". The damage and the condition may each stand alone. A word left over leaves it unread.
 */
export function readBlockAction(feature: MonsterFeature): ActionRead {
  if (feature.attack || feature.name === "Multiattack" || feature.spellcasting) return undefined
  if (!feature.saves) return { unread: "no save and no attack" }
  if (feature.saves.length > 1) return { unread: "more than one save" }
  if (feature.note) return { unread: "a note on its use" }
  const [save] = feature.saves
  if (save.appliesWhen || save.alsoSelf || save.oncePerTurn || save.failureBy || save.firstFailure || save.failureOrSuccess || save.label) return { unread: "a save with stages, gates or a margin" }
  const damage = feature.damage ?? []
  if (damage.some((part) => part.on !== "failure" || part.save !== 0 || !part.type || part.timing || part.appliesWhen || part.unless || part.self || part.label || part.alternativeTo !== undefined))
    return { unread: "damage that is not dealt on the failed save alone" }
  const linked = feature.conditions ?? []
  if (linked.some((link) => link.on !== "failure" || link.save !== 0 || link.appliesWhen || link.unless || link.self || link.label || link.insteadOfDamage))
    return { unread: "a condition that is not given on the failed save alone" }
  let uses: number | undefined
  if (feature.uses) {
    if (typeof feature.uses.count !== "number" || feature.uses.countInLair || (feature.uses.recharge !== "long-rest" && feature.uses.recharge !== "short-or-long-rest"))
      return { unread: "uses the engine does not count" }
    uses = feature.uses.count
  }

  const sentence = /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+), (.+?)\. Failure: (.+?)(?: Success: (Half damage(?: only)?)\.)?$/.exec(feature.text)
  if (!sentence) return { unread: "words beyond a save, its failure and its success" }
  const [, abilityWord, dcWord, who, failure, success] = sentence
  if (ABILITY_WORDS[abilityWord] !== save.ability || Number(dcWord) !== save.dc) return { unread: "the words and the data disagree on the save" }
  if (!!success !== !!save.halfOnSuccess) return { unread: "the words and the data disagree on a success" }
  if (save.success && !success) return { unread: "a success that does more than halve the damage" }

  // Who makes the save.
  const area = feature.area
  let range: number | undefined
  const sizes = {
    cone: /^each creature in an? (\d+)-foot Cone$/,
    line: /^each creature in an? (\d+)-foot-long, (\d+)-foot-wide Line$/,
    emanation: new RegExp(`^each creature in an? (\\d+)-foot Emanation originating from ${SUBJECT}$`),
    sphere: /^each creature in an? (\d+)-foot-radius Sphere centered on a point within (\d+) feet$/,
  }
  if (area) {
    if (area.selective || area.height || area.shape === "cube" || area.shape === "cylinder") return { unread: "an area the engine does not measure" }
    const shaped = sizes[area.shape].exec(who)
    if (!shaped || Number(shaped[1]) !== area.size || (area.shape === "line" && Number(shaped[2]) !== area.width)) return { unread: "who makes the save, in words the reader does not know" }
    if (area.shape === "sphere") range = Number(shaped[2])
  } else {
    const one =
      new RegExp(`^one creature(?: ${SUBJECT.replace("[Tt]", "t")} can see)? within (\\d+) feet$`).exec(who) ??
      new RegExp(`^one creature within (\\d+) feet that ${SUBJECT.replace("[Tt]", "t")} can see$`).exec(who)
    if (!one) return { unread: "who makes the save, in words the reader does not know" }
    range = Number(one[1])
  }

  // What a failure does: damage, a condition, or both, in these words only.
  const dealt = damage.length === 1 ? damage[0] : undefined
  if (damage.length > 1) return { unread: "more than one damage roll" }
  const damageWords = "(\\d+) \\((\\d+d\\d+(?: [+-] \\d+)?)\\) ([A-Z][a-z]+) damage"
  const shapes: { pattern: RegExp; damage: boolean; condition: boolean }[] = [
    { pattern: new RegExp(`^${damageWords}\\.$`), damage: true, condition: false },
    { pattern: new RegExp(`^${damageWords}, and ${CONDITION}\\.$`), damage: true, condition: true },
    { pattern: new RegExp(`^${CONDITION.replace("the target", "The target")}\\.$`), damage: false, condition: true },
  ]
  const shape = shapes.find((entry) => entry.pattern.test(failure))
  if (!shape) return { unread: "a failure the reader does not know" }
  const words = shape.pattern.exec(failure) as RegExpExecArray
  if (shape.damage !== !!dealt || shape.condition !== (linked.length === 1)) return { unread: "the words and the data disagree on the failure" }
  if (dealt && (words[2] !== dealt.dice || words[3].toLowerCase() !== dealt.type || Number(words[1]) !== dealt.average)) return { unread: "the words and the data disagree on the damage" }
  const conditions: BlockAction["conditions"] = []
  if (shape.condition) {
    const at = shape.damage ? 4 : 1
    const [named, edge, whose] = [words[at], words[at + 1], words[at + 2]]
    const [link] = linked
    if (named.toLowerCase() !== link.condition) return { unread: "the words and the data disagree on the condition" }
    // With no end in the words, only Prone, which ends when its bearer stands.
    if (!edge && link.condition !== "prone") return { unread: "a condition with no end the engine keeps" }
    const lasts = !edge ? "own" : whose === "its" ? (edge === "end" ? "target" : undefined) : edge === "end" ? "source" : "until-source"
    if (!lasts) return { unread: "a condition that ends as its bearer's turn starts" }
    conditions.push({ condition: link.condition, ...(edge ? { span: "turn" as const } : {}), lasts })
  }
  return {
    id: actionId(feature.name),
    name: feature.name,
    ability: save.ability,
    dc: save.dc,
    ...(area ? { area } : {}),
    ...(range !== undefined ? { range } : {}),
    damage: dealt?.dice ? [{ dice: dealt.dice, type: dealt.type as DamageTypeId }] : [],
    half: !!save.halfOnSuccess,
    conditions,
    ...(feature.rechargeRoll ? { recharge: feature.rechargeRoll } : {}),
    ...(uses ? { uses } : {}),
  }
}

type Blocked = {
  type?: string
  sheet?: unknown
  statBlock?: string
  shape?: { form: string; hours: number }
  hitPoints?: number
  healthPercent?: number
  dead?: true
  conditions?: readonly { id: string }[]
}

/** The stat block a character acts by: the Beast's a hero holds, or an NPC's own. A hero in their own shape has none. */
export function statBlockOf(character: Blocked): Monster | undefined {
  const shape = shapeOf(character as Parameters<typeof shapeOf>[0])
  if (shape) return shape
  if (character.sheet || character.type !== "npc") return undefined
  return monsterById.get(character.statBlock ?? DEFAULT_STAT_BLOCK)
}

type Using = Blocked & { featureUses?: Record<string, number> }

/** A save action with what is left of its uses: none spent and none to come back for one with a Recharge. */
export type ReadyAction = BlockAction & { left?: number }

/** The save actions a character's stat block gives it that it can take now: a Recharge not spent, a use a day left. */
export function blockActionsOf(character: Using): ReadyAction[] {
  const monster = statBlockOf(character)
  return (monster?.actions ?? []).flatMap((feature): ReadyAction[] => {
    const read = readBlockAction(feature)
    if (!read || "unread" in read) return []
    const used = character.featureUses?.[read.name] ?? 0
    if (read.recharge) return used > 0 ? [] : [read]
    if (read.uses) return used >= read.uses ? [] : [{ ...read, left: read.uses - used }]
    return [read]
  })
}

/** A stat block's Bonus Actions that take an action of a turn, as the read's menu offers them, each with its rule. */
export function blockBonusActions(character: Using): { action: BonusAction; rule: BonusActionRule }[] {
  const monster = statBlockOf(character)
  return (monster?.bonusActions ?? []).flatMap((feature) => {
    const read = readBlockBonus(feature)
    if (!("takes" in read)) return []
    return read.takes.map((take) => {
      const id = `${actionId(feature.name)}-${take}`
      const name = `${feature.name}: ${TAKE_NAMES[take]}`
      const rule: BonusActionRule = {
        id,
        feature: feature.name,
        name,
        note: `${feature.name} is ${listed(read.takes.map((each) => `a ${TAKE_NAMES[each]}`))} taken as a Bonus Action, beside the action: ${listed(read.takes.map((each) => TAKE_USES[each]))}.`,
        ...(take === "dash" ? { dash: true as const } : take === "disengage" ? { disengages: () => true } : { follow: "hide" }),
        use: ({ characters, actor }) => ({ characters, use: { feature: id, name: feature.name, fact: `${actor.name} takes the ${TAKE_NAMES[take]} action as a Bonus Action.` } }),
      }
      return { action: { id, name, targeted: false }, rule }
    })
  })
}

const TAKE_NAMES: Record<BonusTake, string> = { dash: "Dash", disengage: "Disengage", hide: "Hide" }
const TAKE_USES: Record<BonusTake, string> = { dash: "a dash before a strike", disengage: "slipping away after it", hide: "ducking out of sight after a shot" }
const listed = (items: readonly string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items.at(-1)}` : (items[0] ?? ""))

/** The rule of one of a character's stat block Bonus Actions, by its id on the menu. */
export const blockBonusRule = (character: Using, id: string | undefined): BonusActionRule | undefined => blockBonusActions(character).find((entry) => entry.action.id === id)?.rule

/** A character as its turn starts: each spent Recharge rolls a d6, and one in its range is restored. */
export function recharged<T extends Using>(character: T, roll: (sides: number) => number): T {
  const monster = statBlockOf(character)
  if (!monster || isDead(character) || !character.featureUses) return character
  let uses = character.featureUses
  for (const feature of monster.actions ?? []) {
    const range = feature.rechargeRoll
    if (!range || !uses[feature.name]) continue
    const die = roll(6)
    if (!Number.isInteger(die) || die < 1 || die > 6) throw new Error(`${die} is not a d6 roll.`)
    if (die < range.min || die > range.max) continue
    const { [feature.name]: _, ...rest } = uses
    uses = rest
  }
  if (uses === character.featureUses) return character
  const { featureUses: _, ...rest } = character
  return (Object.keys(uses).length ? { ...rest, featureUses: uses } : rest) as T
}

/** An action in one plain line, for the model that writes the turn and for the read. */
export function blockActionWords(action: BlockAction): string {
  const ability = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[action.ability]
  const who = action.area
    ? action.area.shape === "line"
      ? `each creature in a ${action.area.size}-foot line, ${action.area.width} feet wide, from it`
      : action.area.shape === "sphere"
        ? `each creature within ${action.area.size} feet of a point up to ${action.range} feet away`
        : action.area.shape === "emanation"
          ? `each creature within ${action.area.size} feet of it`
          : `each creature in a ${action.area.size}-foot cone from it`
    : `one creature within ${action.range} feet`
  const failed = [...action.damage.map((part) => `${part.dice} ${part.type} damage`), ...action.conditions.map((entry) => `${conditionName(entry.condition)}${entry.span ? " for a turn" : ""}`)].join(
    " and "
  )
  const success = action.damage.length ? (action.half ? ", half the damage on a success" : ", nothing on a success") : ""
  const uses = action.recharge
    ? `. Once used, it comes back only on a d6 roll of ${action.recharge.min === action.recharge.max ? action.recharge.min : `${action.recharge.min} or more`} as a later turn starts`
    : ""
  return `${who} makes a DC ${action.dc} ${ability} save, taking ${failed} on a failure${success}${uses}`
}

// How one stands after the action's harm, in words for the game master.
function standing(character: Castee, fate: Fate | undefined): string {
  if (fate === "dies") return `${character.name} dies.`
  if (fate === "killed") return `${character.name} is killed outright.`
  if (fate === "stable") return `${character.name} is Unconscious and Stable, out of the fight.`
  if (fate === "endures") return enduredWords(character.name, character)
  if (fate === "dying") return `${character.name} is at 0 hit points, Unconscious and dying.`
  const hitPoints = hitPointsOf(character)
  if (hitPoints?.current === 0) return `${character.name} is at 0 hit points and down, not dead.`
  return hitPoints ? `${character.name} has ${hitPoints.current} of ${hitPoints.maximum} hit points${hitPoints.current * 2 <= hitPoints.maximum ? " and is Bloodied" : ""}.` : ""
}

type Acting = Castee & { featureUses?: Record<string, number>; statBlock?: string; shape?: { form: string; hours: number } }

/**
 * Take one of a stat block's save actions on the targets named, who are those it falls on (the read measures an area
 * on the floor). Everyone comes back as it left them, with each save as it fell and what happened in words, in the
 * shape a spell's cast takes, so it is told by the same path. The damage is rolled once for all, each target takes it
 * through their defenses, all of it on a failure and half or none on a success. A condition a failure gives comes
 * from the creature. Its use is spent. `problem` says why nothing happened.
 *
 * The Forest Drake, a Green Dragon Wyrmling, breathes on Branka and Brother Aldric: 6d6 rolls 21, Branka fails her
 * DC 11 Constitution save and takes 21 Poison damage, Aldric succeeds and takes 10.
 */
export function useBlockAction<T extends Acting>(args: {
  characters: readonly T[]
  actorId: string
  action: string
  targets: readonly string[]
  cover?: Record<string, "half" | "three-quarters">
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): Cast<T> & { problem?: string; name: string } {
  let characters = [...args.characters]
  const actor = characters.find((character) => character.id === args.actorId)
  const action = actor ? blockActionsOf(actor).find((entry) => entry.id === args.action) : undefined
  const none = (problem: string) => ({ characters, targets: [], saves: [], harm: [], conditions: [], facts: [], problem, name: action?.name ?? args.action })
  if (!actor || !action) return none(`${actor?.name ?? "This character"} cannot use that now.`)
  const find = (id: string) => characters.find((character) => character.id === id)
  const put = (after: T) => {
    characters = characters.map((character) => (character.id === after.id ? after : character))
  }
  const targets = [...new Set(args.targets)].filter((id) => id !== actor.id && find(id) && !isDead(find(id) as T)).slice(0, action.area ? undefined : 1)
  const saves: SaveRoll[] = []
  const harm: Harm[] = []
  const conditions: ConditionChange[] = []
  const facts: string[] = []
  const rolled = action.damage.length ? rollDamage(action.damage, args.roll) : undefined
  for (const id of targets) {
    const target = find(id) as T
    // What failing would cost, for a Legendary creature's choice to succeed: the conditions, and the damage beyond what
    // a success still takes.
    const full = rolled ? damageTaken(rolled, defensesOf(target)) : 0
    const stakes = { conditions: action.conditions.map((entry) => entry.condition), damage: full - (action.half ? Math.floor(full / 2) : 0) }
    // A breath and its like are not magic, so Magic Resistance gives nothing against them.
    const thrown = rollSave({
      target,
      ability: action.ability,
      dc: action.dc,
      d20: args.d20,
      roll: args.roll,
      characters,
      cover: action.ability === "dex" ? coverBonus(args.cover?.[id] ?? "none") : 0,
      against: action.conditions.map((entry) => entry.condition),
      stakes,
      magical: false,
    })
    saves.push(thrown)
    // A Legendary creature that chose to succeed has spent a use of Legendary Resistance, told before the rest.
    if (thrown.legendary) {
      const spent = withLegendaryResistanceSpent(target)
      put(spent)
      facts.push(legendaryResistanceWords(target.name, spent))
    }
    if (thrown.rescued) {
      put(withRescueSpent(find(id) ?? target, thrown.rescued))
      facts.push(rescueWords(target.name, thrown.rescued, thrown))
    }
    const verdict = `${target.name} ${thrown.success ? "SUCCEEDS on" : "FAILS"} the ${ABILITY_NAMES[action.ability]} saving throw against ${actor.name}'s ${action.name} (${thrown.total} against DC ${action.dc})`
    let words = `${verdict}.`
    // All, half or none, as the save and Evasion leave it (./save-rules).
    const settled = (taken: number) => damageOnSave(target, { ability: action.ability, success: thrown.success, half: action.half }, taken)
    const evaded = rolled ? settled(0).evaded : undefined
    if (rolled && (!thrown.success || action.half) && !(thrown.success && evaded)) {
      const defenses = defensesOf(target)
      const amount = settled(damageTaken(rolled, defenses)).amount
      const struck = withDamage(find(id) as T, amount, { rules: args.rules, types: typesTaken(rolled, defenses) })
      put(afterHarm(struck.character))
      const [part] = rolled.parts
      harm.push({ target: id, kind: "damage", dice: part?.dice ?? [], sides: part?.sides, bonus: part?.bonus ?? 0, type: part?.type, amount })
      words = `${verdict} and takes ${amount} ${part?.type ?? ""} damage${evaded ? `, halved by ${evaded}` : ""}. ${standing(find(id) as T, struck.fate)}`
    } else if (rolled) words = `${verdict} and takes no damage${evaded ? ` (${evaded})` : ""}.`
    facts.push(words.replace("  ", " "))
    if (thrown.success) continue
    for (const entry of action.conditions) {
      const now = find(id) as T
      if (now.dead) continue
      // Until the end of the target's next turn, or the end or start of the creature's own: the engine counts a turn by
      // the rounds that begin, and the creature is taking its turn now.
      const acted = entry.lasts === "target" ? !!now.isComplete : entry.lasts === "source"
      const given = withCondition(now, { id: entry.condition, source: actor.id, ...(entry.span ? { span: entry.span } : {}) }, { acted })
      if (!given.given) {
        facts.push(`${now.name} cannot be ${conditionName(entry.condition)} and is not.`)
        continue
      }
      put(afterHarm(given.character))
      conditions.push({ target: id, condition: entry.condition })
      facts.push(`${now.name} is now ${conditionName(entry.condition)}.`)
    }
  }
  if (!targets.length) facts.push(`${actor.name}'s ${action.name} catches no one.`)
  // The use is spent: a Recharge until it rolls back, a use a day until a rest.
  const user = find(actor.id) as T
  put({ ...user, featureUses: { ...user.featureUses, [action.name]: (user.featureUses?.[action.name] ?? 0) + 1 } })
  return { characters, targets, saves, harm, conditions, facts, name: action.name }
}

/** A stat block's save action as the turn's reading names it (`RequiredFeature`), resolved as a class feature used as the action is. */
export function resolveBlockAction<T extends Acting>(args: {
  characters: T[]
  actorId: string
  feature: { id: string; targets: string[]; cover?: Record<string, "half" | "three-quarters"> }
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
}): Cast<T> & { problem?: string; name: string } {
  return useBlockAction({ ...args, action: args.feature.id, targets: args.feature.targets, cover: args.feature.cover })
}

const ABILITY_NAMES: Record<AbilityId, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }

/**
 * What a character's stat block lets it do this turn, one plain line each, for the model that writes an NPC's turn:
 * its attacks and Multiattack, the save actions ready now, and the Bonus Actions the engine runs. A breath not yet
 * recharged is not listed. None for a character with no stat block named.
 */
export function statBlockLines(character: Using & { featureUses?: Record<string, number> }): string[] {
  if (!character.statBlock && !character.shape) return []
  const monster = statBlockOf(character)
  if (!monster) return []
  const lines: string[] = []
  for (const feature of monster.actions ?? []) {
    if (feature.name === "Multiattack") lines.push(`Multiattack: ${feature.text.replace(/\n/g, " ")}`)
    else if (feature.attack) {
      const { kind, reach, range } = feature.attack
      const where = [reach !== undefined ? `reach ${reach} feet` : "", range ? `range ${range.normal}${range.long ? `/${range.long}` : ""} feet` : ""].filter(Boolean).join(" or ")
      lines.push(`${feature.name}: a ${kind === "melee-or-ranged" ? "melee or ranged" : kind} attack, ${where}.`)
    }
  }
  for (const action of blockActionsOf(character)) lines.push(`${action.name}${action.left !== undefined ? ` (${action.left} left)` : ""}: ${blockActionWords(action)}.`)
  for (const feature of monster.bonusActions ?? []) {
    const read = readBlockBonus(feature)
    if ("takes" in read) lines.push(`${feature.name}, a Bonus Action: the ${listed(read.takes.map((take) => TAKE_NAMES[take]))} action, beside its action.`)
    if ("casts" in read) {
      const count = typeof feature.uses?.count === "number" ? feature.uses.count : undefined
      const left = count === undefined ? undefined : Math.max(0, count - (character.featureUses?.[feature.name] ?? 0))
      if (left !== 0) lines.push(`${feature.name}, a Bonus Action${left !== undefined ? ` (${left} left)` : ""}: casts ${listed(read.casts.map((id) => spellName(id)))}.`)
    }
  }
  return lines
}

const spellName = (id: string) => spellById.get(id)?.name ?? id
