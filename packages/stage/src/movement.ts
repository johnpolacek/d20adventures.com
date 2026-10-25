import { z } from "zod"

// Narrative action → movement. A player writes what their character does ("Yeva drifts toward the gap in the barrier");
// a small model maps that onto the set's vocabulary: a labelled place, another character, or a relative step. The engine
// then clamps it to the character's speed and to what is walkable (Stage.reach), so the model never places anyone
// directly and cannot invent geography. Positions are game state (Stageview decision 8).

export const movementIntentSchema = z.object({
  move: z.enum(["stay", "place", "character", "relative"]).describe("stay unless the action clearly moves the character"),
  place: z.string().optional().describe("a place id from the list, when move is place"),
  character: z.string().optional().describe("a character id from the list, when move is character"),
  direction: z.enum(["forward", "back", "left", "right"]).optional().describe("relative to where the character faces, when move is relative"),
  meters: z.number().min(0).max(30).optional().describe("how far, when move is relative"),
  face: z.string().optional().describe("a character or place id to face afterwards, if the action implies it"),
  pace: z.enum(["walk", "hurry", "sneak"]).describe("hurry for running, bolting, rushing or dashing; sneak for creeping or slipping by unnoticed; otherwise walk"),
  summary: z.string().max(120).describe("a few words for the log, e.g. 'toward the gap in the barrier'"),
})
export type MovementIntent = z.infer<typeof movementIntentSchema>

export interface MovementContext {
  actor: { id: string; name: string; speed: number }
  action: string
  places: { id: string; label: string; distance: number; direction: string }[]
  characters: { id: string; name: string; distance: number; direction: string }[]
}

// Where something lies relative to the actor's facing, in words.
export function bearing(from: { x: number; z: number; ry: number }, to: { x: number; z: number }) {
  const a = Math.atan2(to.x - from.x, to.z - from.z) - from.ry
  const d = Math.atan2(Math.sin(a), Math.cos(a))
  const deg = (d * 180) / Math.PI
  if (Math.abs(deg) < 35) return "ahead"
  if (Math.abs(deg) > 145) return "behind"
  return deg > 0 ? "to the left" : "to the right"
}

export const MOVEMENT_SYSTEM = `You translate a tabletop roleplaying player's written action into where their character walks on a 3D stage.
Rules:
- Choose only from the places and characters listed. Never invent a place.
- If the action does not clearly involve moving (talking, gesturing, handing something over at arm's length, standing firm), answer "stay".
- Approaching someone to talk or hand something over is "character" (the engine stops at conversation distance).
- Small repositioning ("steps back", "edges left") is "relative" with a distance in metres (a step is about 0.7 m).
- The character can walk at most their speed this turn; the engine enforces it, so pick the intended destination.
- Pace: "hurry" for any fast movement (running, bolting, rushing, dashing, sprinting, charging); "sneak" for creeping or slipping past unnoticed; otherwise "walk".`

export function movementPrompt(c: MovementContext) {
  const places = c.places.map((p) => `- ${p.id}: ${p.label} (${p.distance.toFixed(1)} m, ${p.direction})`).join("\n")
  const people = c.characters.map((p) => `- ${p.id}: ${p.name} (${p.distance.toFixed(1)} m, ${p.direction})`).join("\n")
  return `Character: ${c.actor.name} (id ${c.actor.id}), speed ${c.actor.speed} m this turn.

Places:
${places}

Characters nearby:
${people}

Action:
"""${c.action.slice(0, 1200)}"""`
}
