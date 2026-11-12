// A roll and a feature as every screen shows them: the roll card, the narration, the journal and the site's turn view.
// The engine's beats carry ids. These carry names and words, ready to show, and one sentence for screen readers.

import type { FeatureBeat, RollBeat } from "@d20/gm-core/story/beats"
import { nameOf, storyNames } from "@d20/gm-core/story/render"
import { conditionWord } from "@d20/gm-core/utils/condition-label"

export type RollMode = "advantage" | "disadvantage"
// A check or a save, an attack against Armor Class, or a dying hero's Death Saving Throw.
export type RollKind = "check" | "attack" | "death"
export interface DeathSavesView {
  successes: number
  failures: number
}
export interface DamageView {
  type: string
  dice: number[]
  sides?: number
  bonus: number
  total: number
}
export interface HarmView {
  target: string
  kind: "damage" | "healing"
  dice: number[]
  sides?: number
  bonus: number
  type?: string
  amount: number
}
export interface ConditionView {
  target: string
  condition: string
  ends?: true
}

// A roll still to make: who rolls what, against which number. An attack names who is attacked, and `dc` is their
// Armor Class. A Death Saving Throw carries the hero's saves so far.
export interface RollAsk {
  kind: RollKind
  character: string
  check: string
  modifier?: number
  dc: number
  portrait?: string
  // With Advantage or Disadvantage: what gives it.
  mode?: RollMode
  reasons?: string[]
  target?: string
  deathSaves?: DeathSavesView
}
// A roll made. `natural` is the die that counts, `dice` both d20s with Advantage or Disadvantage. `inspired` is a Bardic
// Inspiration die, already in `total`. A Death Saving Throw's `deathSaves` are the saves after it, and `fate` how it
// left the hero when it ended their dying.
export interface RollView extends RollAsk {
  natural: number
  dice?: number[]
  total: number
  success: boolean
  inspired?: number
  // A contest: the other side's total, in words.
  versus?: string
  critical?: true
  damage?: DamageView[]
  taken?: number
  harm?: HarmView[]
  conditions?: ConditionView[]
  fate?: "stable" | "revived" | "dead"
}
export interface FeatureView {
  character: string
  name: string
  target?: string
  harm?: HarmView[]
  // The engine's sentence for it.
  text: string
}

// The die that counts: the higher with Advantage, the lower with Disadvantage.
export const keptDie = (mode: RollMode | undefined, dice: readonly number[]) => (mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0])
export const modeName = (mode: RollMode) => (mode === "advantage" ? "Advantage" : "Disadvantage")

type Someone = { id: string; name: string; type?: string; hitPoints?: number; healthPercent?: number; dead?: true; deathSaves?: { successes: number; failures: number; stable?: true } }

const harmView = (harm: NonNullable<RollBeat["harm"]>, names: Record<string, string | undefined>): HarmView[] => harm.map((h) => ({ ...h, target: nameOf(names, h.target) }))

/** A roll beat to show, read with the characters of its turn, which name who is in it and how a dying hero stands. */
export function rollView(beat: RollBeat, characters: readonly Someone[], portrait?: string): RollView {
  const names = storyNames(characters)
  const kind: RollKind = beat.attack ? "attack" : beat.deathSave ? "death" : "check"
  return {
    kind,
    character: beat.name,
    check: beat.check,
    natural: beat.natural,
    ...(beat.dice && beat.dice.length > 1 ? { dice: beat.dice } : {}),
    ...(beat.mode ? { mode: beat.mode } : {}),
    ...(beat.modifier !== undefined && !(kind === "death" && beat.modifier === 0) ? { modifier: beat.modifier } : {}),
    ...(beat.inspired !== undefined ? { inspired: beat.inspired } : {}),
    total: beat.total,
    dc: beat.dc,
    success: beat.success,
    ...(portrait ? { portrait } : {}),
    ...(beat.attack
      ? {
          target: nameOf(names, beat.attack.target),
          ...(beat.attack.critical ? { critical: true as const } : {}),
          ...(beat.attack.damage ? { damage: beat.attack.damage } : {}),
          ...(beat.attack.taken !== undefined ? { taken: beat.attack.taken } : {}),
        }
      : {}),
    ...(beat.harm?.length ? { harm: harmView(beat.harm, names) } : {}),
    ...(beat.conditions?.length ? { conditions: beat.conditions.map((c) => ({ ...c, target: nameOf(names, c.target), condition: conditionWord(c.condition) })) } : {}),
    // The beat keeps the saves as the throw left them, and how it ended the hero's dying. A 20 leaves no marks to show.
    ...(beat.deathSave
      ? {
          ...(beat.deathSave.fate === "revived" ? {} : { deathSaves: { successes: beat.deathSave.successes, failures: beat.deathSave.failures } }),
          ...(beat.deathSave.fate ? { fate: beat.deathSave.fate } : {}),
        }
      : {}),
  }
}

/** A feature beat to show, read with the characters of its turn. */
export function featureView(beat: FeatureBeat, characters: readonly Someone[]): FeatureView {
  const names = storyNames(characters)
  return {
    character: nameOf(names, beat.character),
    name: beat.name,
    ...(beat.target && beat.target !== beat.character ? { target: nameOf(names, beat.target) } : {}),
    ...(beat.harm?.length ? { harm: harmView(beat.harm, names) } : {}),
    text: beat.text,
  }
}

/**
 * A roll made on the card, before the engine answers it: the verdict as the dice read. An attack hits on a 20 and
 * misses on a 1. A Death Saving Throw's saves move on from those before it.
 */
export function thrownView(ask: RollAsk, dice: number[]): RollView {
  const natural = keptDie(ask.mode, dice)
  const total = natural + (ask.modifier ?? 0)
  const success = ask.kind === "attack" ? natural === 20 || (natural !== 1 && total >= ask.dc) : total >= ask.dc
  const view: RollView = { ...ask, natural, ...(dice.length > 1 ? { dice } : {}), total, success, ...(ask.kind === "attack" && natural === 20 ? { critical: true as const } : {}) }
  if (ask.kind !== "death") return view
  const before = ask.deathSaves ?? { successes: 0, failures: 0 }
  if (natural === 20) return { ...view, deathSaves: undefined, fate: "revived" }
  const after = success ? { ...before, successes: Math.min(3, before.successes + 1) } : { ...before, failures: Math.min(3, before.failures + (natural === 1 ? 2 : 1)) }
  return { ...view, deathSaves: after, ...(after.successes >= 3 ? { fate: "stable" as const } : after.failures >= 3 ? { fate: "dead" as const } : {}) }
}

// The number a roll is made against: Armor Class for an attack, a Difficulty Class otherwise.
export const againstLabel = (kind: RollKind) => (kind === "attack" ? "AC" : "DC")

/** The verdict's words: Hit, Miss or Critical Hit for an attack, Success or Failure for the rest. */
export function verdictOf(roll: Pick<RollView, "kind" | "success" | "critical">): string {
  if (roll.kind === "attack") return roll.success ? (roll.critical ? "Critical Hit" : "Hit") : "Miss"
  return roll.success ? "Success" : "Failure"
}
// A Critical Hit has its own look. A 20 or a 1 on a check or a save does not.
export const isCritical = (roll: Pick<RollView, "kind" | "success" | "critical">) => roll.kind === "attack" && roll.success && !!roll.critical

/**
 * The words beside the verdict. By how much the roll made or missed its number, when that agrees with the verdict.
 * What a 20 or a 1 does to a Death Saving Throw, and how one ended the hero's dying.
 */
export function marginText(roll: RollView): string {
  if (roll.kind === "death") {
    if (roll.natural === 20) return "Natural 20 · Up at 1 Hit Point"
    if (roll.fate === "stable") return "Stable"
    if (roll.fate === "dead") return "Dead"
    if (roll.natural === 1) return "Natural 1 · Two Failures"
    return ""
  }
  if (isCritical(roll)) return `Natural ${roll.natural}`
  const margin = roll.total - roll.dc
  if (roll.success !== margin >= 0) return ""
  const label = againstLabel(roll.kind)
  return margin === 0 ? `exactly the ${label}` : margin > 0 ? `beat the ${label} by ${margin}` : `missed by ${-margin}`
}

export const signedTerm = (n: number) => `${n < 0 ? "minus" : "plus"} ${Math.abs(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const diceWords = (dice: number[], sides?: number) => (dice.length ? `${sides ? `d${sides} ` : ""}${dice.join(" and ")}` : "")
const sum = (dice: number[], bonus: number) => dice.reduce((n, d) => n + d, 0) + bonus

/** A harm line's sentence: "Owlbear loses 9 hit points", "Branka regains 6 hit points". */
export const harmSentence = (h: HarmView) => `${h.target} ${h.kind === "healing" ? "regains" : "loses"} ${plural(h.amount, "hit point", "hit points")}`
/** A condition line's sentence: "Thalbern is Poisoned", "Thalbern is no longer Restrained". */
export const conditionSentence = (c: ConditionView) => `${c.target} is ${c.ends ? "no longer " : ""}${c.condition}`
/** Whether what the target lost differs from the damage rolled: Resistance, Vulnerability or Immunity. */
export const takenDiffers = (roll: RollView) => roll.taken !== undefined && roll.taken !== (roll.damage ?? []).reduce((n, d) => n + d.total, 0)

const harmSpeech = (h: HarmView) =>
  `${h.dice.length ? `${diceWords(h.dice, h.sides)}${h.bonus ? ` ${signedTerm(h.bonus)}` : ""} makes ${sum(h.dice, h.bonus)}${h.type ? ` ${h.type}` : ""}. ` : ""}${harmSentence(h)}.`
export const deathSavesSpeech = (s: DeathSavesView) => `${plural(s.successes, "success", "successes")} and ${plural(s.failures, "failure", "failures")}`

/** Everything the roll shows, as one sentence for screen readers. */
export function rollSpeech(roll: RollView): string {
  const first = roll.kind === "attack" ? `${roll.character} attacks ${roll.target} with ${roll.check}` : `${roll.character} rolled ${roll.check}`
  const dice = roll.dice && roll.dice.length > 1 ? ` with ${modeName(roll.mode ?? "advantage")}: ${roll.dice.join(" and ")}, keeping ${roll.natural}` : `: ${roll.natural}`
  const terms = `${roll.modifier !== undefined ? ` ${signedTerm(roll.modifier)}` : ""}${roll.inspired !== undefined ? ` plus a Bardic Inspiration die of ${roll.inspired}` : ""}`
  const made = terms ? `${terms} makes ${roll.total}` : ""
  const against = roll.versus ?? (roll.kind === "attack" ? `Armor Class ${roll.dc}` : `DC ${roll.dc}`)
  const parts = [`${first}${dice}${made} against ${against}. ${verdictOf(roll)}.`]
  const margin = marginText(roll)
  if (margin && roll.kind === "death") parts.push(`${margin}.`)
  if (roll.success) for (const d of roll.damage ?? []) parts.push(`${diceWords(d.dice, d.sides)}${d.bonus ? ` ${signedTerm(d.bonus)}` : ""} makes ${d.total} ${d.type} damage.`)
  if (roll.success && takenDiffers(roll)) parts.push(`${roll.target} loses ${plural(roll.taken ?? 0, "hit point", "hit points")}.`)
  for (const h of roll.harm ?? []) parts.push(harmSpeech(h))
  for (const c of roll.conditions ?? []) parts.push(`${conditionSentence(c)}.`)
  if (roll.kind === "death" && roll.deathSaves) parts.push(`Death Saving Throws: ${deathSavesSpeech(roll.deathSaves)}.`)
  return parts.join(" ")
}

/** A roll still to make, for screen readers. */
export function askSpeech(ask: RollAsk): string {
  const what = ask.kind === "attack" ? `${ask.check} against ${ask.target}, Armor Class ${ask.dc}` : ask.kind === "death" ? ask.check : `${ask.check}, DC ${ask.dc}`
  return `${what}${ask.kind === "death" && ask.deathSaves ? `, ${deathSavesSpeech(ask.deathSaves)} so far` : ""}`
}

/** A feature used, for screen readers. */
export const featureSpeech = (f: FeatureView) => [f.text, ...(f.harm ?? []).map(harmSpeech)].join(" ")
