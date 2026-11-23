import type { EffectKind, RollBeat, StoryBeat } from "@d20/gm-core/story/beats"
import type { Moment, Outcome, Tone } from "@d20/stage/director"

// What each paragraph of a turn's story is, for the stage's director to shoot (packages/stage/src/director.ts): a
// blow and how it landed, a death, a line and how it was said, an entrance. Read from the beats, never the wording,
// except for how a line was delivered, which the GM writes as a word or two.

export interface MomentContext {
  // The cast member who plays a character, by the character's id.
  castOf: (id: string | undefined) => string | undefined
  // How tall a cast member is, and whether they are a beast: someone to be looked up at.
  big: (castId: string) => boolean
  // The cast members who fall in this paragraph, dead: the game took them out.
  killed: (paragraph: number) => string[]
  // Heroes the paragraph drops to the ground, dying.
  dropped: (paragraph: number) => string[]
  // Someone coming on in this paragraph, from where to where.
  arriving: (paragraph: number) => { cast: string; from: readonly [number, number]; home: readonly [number, number] } | undefined
  // The effects the host plays in this paragraph, by cast id: an attack in a hero's reply plays after the roll that
  // decides it, so often a paragraph later than the words.
  effects: (paragraph: number) => { actor: string; target?: string; kind: EffectKind; miss: boolean }[]
  // The heroes' cast members, for the view that opens an encounter.
  party: string[]
}

const HUSHED = /whisper|murmur|breath|hush|soft|quiet|low voice|barely|undertone/i
const LOUD = /shout|roar|bellow|scream|yell|bark|thunder|cry|howl|boom/i
const TENSE = /cold|threat|menac|snarl|hiss|growl|grim|warn|icy|venom|sneer|glare|dead|flat|grit|tight|seeth|ang|furi|sharp|danger|steel|hard|curt|bitter|accus/i

// How a line was said: the GM's delivery first, then the line itself. In a fight, a line is never calm.
export function toneOf(text: string, delivery: string | undefined, fighting: boolean): Tone {
  const d = delivery ?? ""
  if (HUSHED.test(d)) return "hushed"
  if (LOUD.test(d) || (text.match(/!/g)?.length ?? 0) >= 2 || /\b[A-Z]{4,}\b/.test(text)) return "loud"
  if (TENSE.test(d) || fighting) return "tense"
  return "calm"
}

const outcomeOf = (r: RollBeat): Outcome => (r.attack?.critical ? "crit" : r.natural === 1 && !r.success ? "fumble" : r.success ? "hit" : "miss")

// Every paragraph's moment, or null where the paragraph says nothing the camera should answer: it stays where it is,
// or the host frames a place.
export function storyMoments(paragraphs: readonly { beats: StoryBeat[] }[], ctx: MomentContext): (Moment | null)[] {
  const all = paragraphs.flatMap((p) => p.beats)
  const fighting = all.some((b) => (b.kind === "roll" && b.attack) || (b.kind === "action" && b.effect))
  // The roll that decided a beat: the last one before it in the same step.
  let lastRoll: RollBeat | undefined
  return paragraphs.map((p, i) => {
    const beats = p.beats
    const first = beats[0]
    const rollHere = first?.kind === "roll" ? first : undefined
    const moment = ((): Moment | null => {
      const killed = ctx.killed(i)
      const act = beats.find((b) => b.kind === "action" && b.effect) ?? beats.find((b) => b.kind === "action")
      const actor = act?.kind === "action" ? ctx.castOf(act.actor) : undefined
      if (killed.length) return { kind: "kill", victim: killed[0], killer: actor }
      const dropped = ctx.dropped(i)
      if (dropped.length) return { kind: "down", victim: dropped[0] }
      const enters = ctx.arriving(i)
      if (enters) return { kind: "entrance", who: enters.cast, monster: ctx.big(enters.cast), from: enters.from, home: enters.home }
      if (rollHere) {
        const who = ctx.castOf(rollHere.character)
        if (!who) return null
        if (rollHere.deathSave) return { kind: "deathSave", hero: who, success: rollHere.success, fate: rollHere.deathSave.fate }
        if (rollHere.attack) return { kind: "windup", actor: who, target: ctx.castOf(rollHere.attack.target), outcome: outcomeOf(rollHere) }
        const healed = rollHere.harm?.find((h) => h.kind === "healing")
        if (healed) return { kind: "heal", actor: who, target: ctx.castOf(healed.target) }
        return { kind: "check", actor: who, success: rollHere.success, natural: rollHere.natural }
      }
      const fx = ctx.effects(i)[0]
      if (fx) {
        // The roll that decided it, when it was the actor's own: a crit or a fumble shows in the blow.
        const roll = lastRoll && ctx.castOf(lastRoll.character) === fx.actor ? lastRoll : undefined
        const outcome: Outcome = fx.miss ? (roll?.natural === 1 ? "fumble" : "miss") : roll?.attack?.critical ? "crit" : "hit"
        const { actor, target, kind } = fx
        if (target && (kind === "slash" || kind === "impact" || kind === "arrow")) return { kind: "strike", actor, target, outcome, ranged: kind === "arrow" }
        if (target && (kind === "bolt" || kind === "beam")) return { kind: "spell", actor, target, outcome }
        return { kind: "spell", actor, target, area: true, outcome }
      }
      const line = beats.find((b) => b.kind === "line")
      if (line?.kind === "line") {
        const speaker = ctx.castOf(line.speaker)
        if (speaker) return { kind: "line", speaker, listener: ctx.castOf(line.to), tone: toneOf(line.text, line.delivery, fighting) }
      }
      if (first?.kind === "feature") {
        const who = ctx.castOf(first.character)
        if (!who) return null
        const healed = first.harm?.find((h) => h.kind === "healing")
        if (healed) return { kind: "heal", actor: who, target: ctx.castOf(healed.target) }
        const hurt = first.harm?.find((h) => h.kind === "damage")
        if (hurt) return { kind: "spell", actor: who, target: ctx.castOf(hurt.target), outcome: "hit" }
        return { kind: "action", actor: who, target: ctx.castOf(first.target) }
      }
      if (act?.kind === "action" && actor) return { kind: "action", actor, target: ctx.castOf(act.target) }
      // An encounter's opening words, before anyone does anything: the place, with the party in it. A turn that opens
      // a new encounter tells the end of the last one first, so its opening is the first intro paragraph, not the first.
      const opening = first?.by.step === "intro" && !paragraphs.slice(0, i).some((p) => p.beats[0]?.by.step === "intro")
      if (opening && ctx.party.length) return { kind: "establish", party: ctx.party }
      return null
    })()
    for (const b of beats) if (b.kind === "roll") lastRoll = b
    return moment
  })
}
