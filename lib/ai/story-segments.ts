import type { StoryBeat } from "@d20/gm-core/story/beats"
import { storyParagraphs } from "@d20/gm-core/story/render"
import type { AttributedSegment } from "@/lib/ai/narration-attribution"
import type { parseNarrative } from "@/lib/utils/parse-narrative"

// Speaker segments read straight from a turn's beats: narration and actions in the narrator's voice, each line in its
// speaker's, with its delivery as the style. Null when the story's paragraphs do not line up with the narrative's, as
// for a turn saved before the beats and the text agreed, and the attribution call decides instead.
export function segmentsFromStory(story: StoryBeat[], parts: ReturnType<typeof parseNarrative>, wanted: Set<number>, characters: { id: string; name: string }[]): AttributedSegment[] | null {
  const told = storyParagraphs(story)
  if (told.length !== parts.length) return null
  const names = new Map(characters.map((c) => [c.id, c.name]))
  const segments: AttributedSegment[] = []
  for (const [partIndex, paragraph] of told.entries()) {
    const part = parts[partIndex]
    const kind = paragraph.beats[0].kind
    if ((part.type === "paragraph") !== (kind !== "roll" && kind !== "reply")) return null
    if (!wanted.has(partIndex)) continue
    for (const beat of paragraph.beats) {
      if (beat.kind === "line" && names.has(beat.speaker)) segments.push({ partIndex, speaker: beat.speaker, characterName: names.get(beat.speaker), text: `"${beat.text}"`, styleHint: beat.delivery })
      else if (beat.kind === "line") segments.push({ partIndex, speaker: "narrator", text: `"${beat.text}"` })
      else if (beat.kind === "narration" || beat.kind === "action") segments.push({ partIndex, speaker: "narrator", text: beat.text })
    }
  }
  return segments
}
