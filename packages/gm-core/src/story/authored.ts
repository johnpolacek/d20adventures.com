import { type StoryOutput, storyOutputSchema } from "./beats"
import { nameOf, type StoryNames } from "./render"

// An authored passage, such as an encounter's intro, read as beats. A paragraph may open with labels in braces:
//
//   {actor: owlbear, from: treeLine, pace: hurry} The Owlbear crashes out of the undergrowth.
//   {speaker: wollandora, to: owlbear} That's enough, beast of the wood!
//   {place: stones} The ancient Standing Stones rise around Thalbern.
//
// With `speaker` it is a line, with `actor` an action, and otherwise narration. A paragraph without braces is
// narration. cleanStory then checks the ids against the scene, as it does the GM's.
const LABELS = /^\{([^}]*)\}\s*/
const KEYS: Record<string, keyof StoryOutput[number]> = {
  actor: "who",
  speaker: "who",
  target: "to",
  to: "to",
  place: "place",
  from: "from",
  pace: "pace",
  effect: "effect",
  element: "element",
  object: "object",
  delivery: "delivery",
}

export function authoredStory(text: string): StoryOutput {
  const raw = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .flatMap((paragraph) => {
      const p = paragraph.replace(/\s*\n\s*/g, " ").trim()
      if (!p) return []
      const m = p.match(LABELS)
      if (!m) return [{ kind: "narration", text: p }]
      const labels: Record<string, string> = {}
      for (const pair of m[1].split(",")) {
        const [k, ...v] = pair.split(":")
        const key = KEYS[k.trim().toLowerCase()]
        if (key && v.length) labels[key] = v.join(":").trim()
      }
      const kind = /\bspeaker\s*:/i.test(m[1]) ? "line" : /\bactor\s*:/i.test(m[1]) ? "action" : "narration"
      return [{ ...labels, kind, text: p.slice(m[0].length).trim() }]
    })
  return storyOutputSchema.parse(raw)
}

// An authored passage as a script with its labels taken off, for prompts that read the text: a line under its
// speaker's name, as storyText writes the story.
export const authoredText = (text: string, names: StoryNames = {}) =>
  authoredStory(text)
    .map((b) => (b.kind === "line" && b.who ? `${nameOf(names, b.who)}: "${b.text.replace(/^["“”]+|["“”]+$/g, "")}"` : b.text))
    .join("\n\n")
