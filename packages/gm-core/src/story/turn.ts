import { z } from "zod"
import type { GmPorts } from "../ports"
import { type RollBeat, type StoryBeat, type StoryBy, storyOutputSchema } from "./beats"
import type { StoryScene } from "./clean"
import { legacyNarrative, storyNames, storyParagraphs, storyText, turnStory } from "./render"

type StoryTurn = { encounterId: string; story?: StoryBeat[]; narrative?: string; characters: readonly { id: string; name: string; type?: string }[] }

// What a GM step returns when it writes story: its beats, alongside whatever else its schema asks for.
export const beatsField = { beats: storyOutputSchema }
export const storyOutputObject = z.object(beatsField)

// The scene a step writes for: the turn's characters, and the set's named places when the game has a 3D scene.
export async function sceneFor(ports: GmPorts, turn: StoryTurn): Promise<StoryScene> {
  const places = (await ports.content.places?.(turn.encounterId).catch(() => undefined)) ?? undefined
  return { cast: turn.characters.map((c) => ({ id: c.id, name: c.name, type: c.type })), ...(places?.length ? { places } : {}) }
}

// A turn's story as a script, for prompts.
export const turnScript = (turn: { story?: StoryBeat[]; narrative?: string; characters?: StoryTurn["characters"] }) => storyText(turnStory(turn), storyNames(turn.characters ?? []))

// A turn with beats added: the story, and the narrative string rendered from it for readers not yet on beats.
export function withStory(turn: Omit<StoryTurn, "encounterId">, beats: readonly StoryBeat[]): { story: StoryBeat[]; narrative: string } {
  const story = [...turnStory(turn), ...beats]
  return { story, narrative: legacyNarrative(story) }
}

// Beats as plain prose, paragraphs apart.
export const storyProse = (beats: readonly StoryBeat[]) =>
  storyParagraphs(beats)
    .map((p) => p.text)
    .join("\n\n")

export function rollBeat(by: StoryBy, args: { id: string; name: string; image?: string; check: string; natural: number; modifier?: number; total: number; dc: number; success: boolean }): RollBeat {
  return {
    kind: "roll",
    by,
    character: args.id,
    name: args.name,
    check: args.check,
    natural: args.natural,
    ...(args.modifier !== undefined ? { modifier: args.modifier } : {}),
    total: args.total,
    dc: args.dc,
    success: args.success,
    ...(args.image ? { image: args.image } : {}),
  }
}
