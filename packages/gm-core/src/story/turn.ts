import { z } from "zod"
import type { GmPorts } from "../ports"
import { authoredStory } from "./authored"
import { type RollBeat, type StoryBeat, type StoryBy, storyOutputSchema } from "./beats"
import { cleanStory, type StoryScene } from "./clean"
import { characterStory, storyNames, storyParagraphs, storyText } from "./render"

type StoryTurn = { encounterId: string; story: StoryBeat[]; characters: readonly { id: string; name: string; type?: string }[] }

// What a GM step returns when it writes story: its beats, alongside whatever else its schema asks for.
export const beatsField = { beats: storyOutputSchema }
export const storyOutputObject = z.object(beatsField)

// The scene a step writes for: the turn's characters, and the set's named places when the game has a 3D scene.
export async function sceneFor(ports: GmPorts, turn: Omit<StoryTurn, "story">): Promise<StoryScene> {
  const places = (await ports.content.places?.(turn.encounterId).catch(() => undefined)) ?? undefined
  return { cast: turn.characters.map((c) => ({ id: c.id, name: c.name, type: c.type })), ...(places?.length ? { places } : {}) }
}

// A turn's story as a script, for prompts.
export const turnScript = (turn: { story: StoryBeat[]; characters?: StoryTurn["characters"] }) => storyText(turn.story, storyNames(turn.characters ?? []))

// A turn's story as one character knows it, for prompts that play that character.
export const characterScript = (turn: { story: StoryBeat[]; characters?: StoryTurn["characters"] }, id: string) => storyText(characterStory(turn.story, id), storyNames(turn.characters ?? []))

// A turn's story with beats added.
export const withStory = (turn: { story: StoryBeat[] }, beats: readonly StoryBeat[]): { story: StoryBeat[] } => ({ story: [...turn.story, ...beats] })

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

// A turn that opens on an authored intro: its beats for the characters in it.
export const introTurn = (intro: string, scene: StoryScene): { story: StoryBeat[] } => ({ story: cleanStory(authoredStory(intro, scene), scene, { step: "intro" }) })
