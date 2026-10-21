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

// Who sees or hears a beat besides the narrator: everyone present, or for a private one only its actor or speaker and
// whoever it is aimed at.
const privateTo = (beat: StoryBeat): string[] | undefined =>
  beat.kind === "action" && beat.private ? [beat.actor, ...(beat.target ? [beat.target] : [])] : beat.kind === "line" && beat.private ? [beat.speaker, ...(beat.to ? [beat.to] : [])] : undefined
const privateNote = (beat: StoryBeat, names: StoryNames) => {
  const only = privateTo(beat)
  return only ? ` (private to ${only.map((id) => nameOf(names, id)).join(" and ")})` : ""
}

// The story as one hero knows it: without the private beats they are not part of, or another player's own words
// before the GM wrote them in.
export const heroStory = (story: readonly StoryBeat[], hero: string): StoryBeat[] =>
  story.filter((beat) => (beat.kind === "reply" ? beat.character === hero : (privateTo(beat)?.includes(hero) ?? true)))

function scriptLine(beat: StoryBeat, names: StoryNames): string {
  switch (beat.kind) {
    case "line":
      return `${nameOf(names, beat.speaker)}${beat.to ? ` to ${nameOf(names, beat.to)}` : ""}${beat.delivery ? `, ${beat.delivery}` : ""}${privateNote(beat, names)}: "${beat.text}"`
    case "action":
      return `${beat.text}${privateNote(beat, names)}`
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
