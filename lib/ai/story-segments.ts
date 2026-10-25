import { createHash } from "node:crypto"
import type { StoryBeat } from "@d20/gm-core/story/beats"
import { storyParagraphs } from "@d20/gm-core/story/render"

export interface StorySegment {
  partIndex: number // index into storyParagraphs()
  speaker: string // "narrator" | characterId
  characterName?: string
  text: string
  styleHint?: string
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex")

// Whether the turn's audio still matches its story.
export const storyHash = (story: StoryBeat[]) => sha1(JSON.stringify(story))

// The paragraphs Storyview reads aloud: everything but rolls and the players' own words, by their index in the story.
export const narratedParagraphs = (story: StoryBeat[]) =>
  storyParagraphs(story).flatMap((p, partIndex) => (p.beats[0].kind === "roll" || p.beats[0].kind === "reply" ? [] : [{ partIndex, text: p.text, hash: sha1(p.text) }]))

// A turn's paragraphs split for voices: narration and actions in the narrator's voice, each line in its speaker's,
// with its delivery as the style. A speaker who is not one of the turn's characters is read by the narrator.
export function segmentsFromStory(story: StoryBeat[], wanted: Set<number>, characters: { id: string; name: string }[]): StorySegment[] {
  const names = new Map(characters.map((c) => [c.id, c.name]))
  const segments: StorySegment[] = []
  for (const [partIndex, paragraph] of storyParagraphs(story).entries()) {
    if (!wanted.has(partIndex)) continue
    for (const beat of paragraph.beats) {
      if (beat.kind === "line" && names.has(beat.speaker)) segments.push({ partIndex, speaker: beat.speaker, characterName: names.get(beat.speaker), text: `"${beat.text}"`, styleHint: beat.delivery })
      else if (beat.kind === "line") segments.push({ partIndex, speaker: "narrator", text: `"${beat.text}"` })
      else if (beat.kind === "narration" || beat.kind === "action") segments.push({ partIndex, speaker: "narrator", text: beat.text })
    }
  }
  return segments
}
