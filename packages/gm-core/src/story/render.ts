import type { RollBeat, StoryBeat, StoryBy } from "./beats"

// Names for the ids a story holds. An id the lookup lacks reads as itself, capitalised ("owlbear" is "Owlbear").
export type StoryNames = Record<string, string | undefined>
export const nameOf = (names: StoryNames, id: string) => names[id] ?? id.replace(/(^|[-_\s])(\w)/g, (_, gap: string, c: string) => `${gap ? " " : ""}${c.toUpperCase()}`)
export const storyNames = (characters: readonly { id: string; name: string }[]): StoryNames => Object.fromEntries(characters.map((c) => [c.id, c.name]))

const sameBy = (a: StoryBy, b: StoryBy) => a.step === b.step && a.character === b.character
const who = (beat: StoryBeat) => (beat.kind === "action" ? beat.actor : beat.kind === "line" ? beat.speaker : undefined)

export const rollSentence = (r: RollBeat) =>
  `${r.name} · ${r.check}: ${r.natural}${r.modifier !== undefined ? ` ${r.modifier < 0 ? "-" : "+"} ${Math.abs(r.modifier)} = ${r.total}` : ""}, DC ${r.dc}. ${r.success ? "Success" : "Failure"}.`

export interface StoryParagraph {
  beats: StoryBeat[]
  text: string
}

// The story as paragraphs to read: an action and what its actor then says read as one paragraph, as do one speaker's
// lines in a row. Narration, rolls and replies each stand alone.
export function storyParagraphs(story: readonly StoryBeat[]): StoryParagraph[] {
  const out: StoryBeat[][] = []
  for (const beat of story) {
    const last = out[out.length - 1]
    const prev = last?.[last.length - 1]
    const joins = beat.kind === "line" && prev && (prev.kind === "action" || prev.kind === "line") && who(prev) === beat.speaker && sameBy(prev.by, beat.by)
    if (joins) last.push(beat)
    else out.push([beat])
  }
  return out.map((beats) => ({ beats, text: beats.map(beatText).join(" ") }))
}

function beatText(beat: StoryBeat): string {
  if (beat.kind === "line") return `"${beat.text}"`
  if (beat.kind === "roll") return rollSentence(beat)
  return beat.text
}

// The story as a script for the GM's prompts: each step's beats together, every spoken line under its speaker's name,
// rolls and the player's own words in brackets.
export function storyText(story: readonly StoryBeat[], names: StoryNames = {}): string {
  const blocks: string[][] = []
  let by: StoryBy | undefined
  for (const beat of story) {
    if (!by || !sameBy(by, beat.by)) blocks.push([])
    by = beat.by
    blocks[blocks.length - 1].push(scriptLine(beat, names))
  }
  return blocks.map((b) => b.join("\n")).join("\n\n")
}

function scriptLine(beat: StoryBeat, names: StoryNames): string {
  switch (beat.kind) {
    case "line":
      return `${nameOf(names, beat.speaker)}${beat.to ? ` to ${nameOf(names, beat.to)}` : ""}${beat.delivery ? `, ${beat.delivery}` : ""}: "${beat.text}"`
    case "roll":
      return `[${beat.name} rolls ${beat.check}: ${beat.total} against DC ${beat.dc}, ${beat.success ? "success" : "failure"}]`
    case "reply":
      return `[The player wrote for ${nameOf(names, beat.character)}: ${beat.text}]`
    default:
      return beat.text
  }
}

// The beats one step wrote last: the most recent action, for prompts that answer it.
export function lastStep(story: readonly StoryBeat[]): StoryBeat[] {
  const last = story[story.length - 1]
  if (!last) return []
  let i = story.length - 1
  while (i > 0 && sameBy(story[i - 1].by, last.by)) i--
  return story.slice(i)
}

// The story in the old narrative format, for readers that have not moved to beats yet: paragraphs apart, a roll as
// its [DiceRoll:] marker, the player's words as [OriginalReply:].
export function legacyNarrative(story: readonly StoryBeat[]): string {
  return storyParagraphs(story)
    .map((p) => {
      const beat = p.beats[0]
      if (beat.kind === "roll")
        return `[DiceRoll:rollType=${beat.check};baseRoll=${beat.natural};modifier=${beat.modifier === undefined ? "" : beat.modifier >= 0 ? `+${beat.modifier}` : beat.modifier};result=${beat.total};difficulty=${beat.dc};character=${beat.name};image=${beat.image ?? ""};success=${beat.success}]`
      if (beat.kind === "reply") return `[OriginalReply: ${beat.text}]`
      return p.text
    })
    .join("\n\n")
}

const diceRoll = /^\[DiceRoll:([^\]]+)\]$/i
// A story read back from an old narrative string, for turns saved before beats. Paragraphs are narration with no
// labels: who speaks in them is not known.
export function storyFromNarrative(narrative: string, characters: readonly { id: string; name: string }[] = []): StoryBeat[] {
  const by: StoryBy = { step: "round" }
  const beats: StoryBeat[] = []
  const text = narrative.replace(/\\n/g, "\n")
  const reply = /\[OriginalReply:\s*([\s\S]*?)\]/g
  let last = 0
  const paragraphs = (chunk: string) => {
    for (const line of chunk.split(/\n/)) {
      const t = line.trim()
      if (!t) continue
      const m = t.match(diceRoll)
      if (!m) {
        beats.push({ kind: "narration", by, text: t })
        continue
      }
      const f = Object.fromEntries(
        m[1].split(";").map((pair) => {
          const [k, ...rest] = pair.split("=")
          return [k.trim(), rest.join("=").trim()]
        })
      )
      const name = f.character ?? ""
      const natural = f.baseRoll ? Number(f.baseRoll) : Number(f.result)
      beats.push({
        kind: "roll",
        by: { step: "roll" },
        character: characters.find((c) => c.name === name)?.id ?? name,
        name,
        check: f.rollType ?? "",
        natural,
        ...(f.modifier ? { modifier: Number(f.modifier) } : {}),
        total: Number(f.result),
        dc: Number(f.difficulty),
        success: f.success === "true",
        ...(f.image ? { image: f.image } : {}),
      })
    }
  }
  for (let m = reply.exec(text); m; m = reply.exec(text)) {
    paragraphs(text.slice(last, m.index))
    if (m[1].trim()) beats.push({ kind: "reply", by: { step: "reply" }, character: "", text: m[1].trim() })
    last = reply.lastIndex
  }
  paragraphs(text.slice(last))
  return beats
}

// A turn's story: its beats, or for a turn saved before beats, its narrative read back.
export const turnStory = (turn: { story?: StoryBeat[]; narrative?: string; characters?: readonly { id: string; name: string }[] }): StoryBeat[] =>
  turn.story ?? storyFromNarrative(turn.narrative ?? "", turn.characters ?? [])
