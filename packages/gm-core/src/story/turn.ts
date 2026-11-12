import { z } from "zod"
import type { GmPorts } from "../ports"
import type { Strike } from "../sheet/attack"
import type { CheckResult } from "../sheet/check"
import { authoredStory } from "./authored"
import { type RollBeat, type StoryBeat, type StoryBy, storyOutputSchema } from "./beats"
import { cleanStory, type StoryScene } from "./clean"
import { characterStory, storyNames, storyParagraphs, storyText } from "./render"

type StoryTurn = { encounterId: string; story: StoryBeat[]; characters: readonly { id: string; name: string; type?: string; gender?: string; healthPercent?: number; status?: string }[] }

// What a GM step returns when it writes story: its beats, alongside whatever else its schema asks for.
export const beatsField = { beats: storyOutputSchema }
export const storyOutputObject = z.object(beatsField)

// The scene a step writes for: the turn's characters, and the set's named places when the game has a 3D scene.
export async function sceneFor(ports: GmPorts, turn: Omit<StoryTurn, "story">): Promise<StoryScene> {
  const places = (await ports.content.places?.(turn.encounterId).catch(() => undefined)) ?? undefined
  return {
    cast: turn.characters.map((c) => ({ id: c.id, name: c.name, type: c.type, ...(c.gender ? { gender: c.gender } : {}), ...(c.healthPercent === 0 || c.status === "dead" ? { silent: true } : {}) })),
    ...(places?.length ? { places } : {}),
  }
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

// A resolved check as the story keeps it. Both dice are kept only when two were rolled.
export function rollBeat(by: StoryBy, roller: { id: string; name: string; image?: string }, check: string, result: CheckResult): RollBeat {
  return {
    kind: "roll",
    by,
    character: roller.id,
    name: roller.name,
    check,
    natural: result.natural,
    ...(result.mode !== "normal" ? { dice: result.dice, mode: result.mode } : {}),
    modifier: result.bonus,
    total: result.total,
    dc: result.dc,
    success: result.success,
    ...(roller.image ? { image: roller.image } : {}),
  }
}

// A turn that opens on an authored intro: its beats for the characters in it.
export const introTurn = (intro: string, scene: StoryScene): { story: StoryBeat[] } => ({ story: cleanStory(authoredStory(intro, scene), scene, { step: "intro" }) })

// A resolved attack as the story keeps it: the roll against Armor Class, and on a hit the damage dice and what was lost.
export function attackBeat(by: StoryBy, roller: { id: string; name: string; image?: string }, target: string, blow: Strike): RollBeat {
  const { roll } = blow
  return {
    kind: "roll",
    by,
    character: roller.id,
    name: roller.name,
    check: blow.attack.name,
    natural: roll.natural,
    ...(roll.mode !== "normal" ? { dice: roll.dice, mode: roll.mode } : {}),
    modifier: roll.bonus,
    total: roll.total,
    dc: roll.armorClass,
    success: roll.hit,
    ...(roller.image ? { image: roller.image } : {}),
    attack: { target, ...(roll.critical ? { critical: true as const } : {}), ...(blow.damage ? { damage: blow.damage.parts, taken: blow.taken } : {}) },
  }
}
