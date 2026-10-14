import { z } from "zod"

// A turn's story: the beats the GM and the authored intros write, in order. Each beat says what it is and whose it
// is, so a screen never guesses a speaker, a camera or an effect from the wording. Prose is a view of the story.

export const EFFECT_KINDS = ["arrow", "bolt", "beam", "burst", "aura", "sparkles", "slash", "impact", "mist"] as const
export const ELEMENTS = ["fire", "frost", "lightning", "radiant", "nature", "shadow", "arcane"] as const
export const OBJECT_KINDS = ["scroll", "letter", "map", "pouch", "coin", "key", "relic", "lantern", "torch", "blade", "bow", "potion", "book", "gem", "pack"] as const
export const PACES = ["walk", "hurry", "sneak"] as const

export type EffectKind = (typeof EFFECT_KINDS)[number]
export type Element = (typeof ELEMENTS)[number]
export type ObjectKind = (typeof OBJECT_KINDS)[number]
export type Pace = (typeof PACES)[number]

// Which step of the game wrote a beat, and for whom: an encounter's intro, a hero's reply, a roll and its outcome, an
// NPC's turn, or the end of a round.
export type StoryStep = "intro" | "reply" | "roll" | "npc" | "round"
export interface StoryBy {
  step: StoryStep
  character?: string
}

// A walk to a place or a person, or an arrival from a place off stage.
export interface StoryMove {
  to?: string
  from?: string
  pace?: Pace
}
export interface StoryEffect {
  kind: EffectKind
  element?: Element
}
// An object in the actor's hand, passed to someone when it has a receiver.
export interface StoryObject {
  kind: ObjectKind
  to?: string
}

export type NarrationBeat = { kind: "narration"; by: StoryBy; text: string; place?: string }
export type ActionBeat = {
  kind: "action"
  by: StoryBy
  text: string
  actor: string
  target?: string
  move?: StoryMove
  effect?: StoryEffect
  object?: StoryObject
}
// Spoken words only, with no quote marks.
export type LineBeat = { kind: "line"; by: StoryBy; text: string; speaker: string; to?: string; delivery?: string }
export type RollBeat = {
  kind: "roll"
  by: StoryBy
  character: string
  name: string
  check: string
  natural: number
  modifier?: number
  total: number
  dc: number
  success: boolean
  image?: string
}
// The player's own words, before the GM wrote them into the story.
export type ReplyBeat = { kind: "reply"; by: StoryBy; character: string; text: string }
export type StoryBeat = NarrationBeat | ActionBeat | LineBeat | RollBeat | ReplyBeat

const id = z.string().min(1).max(80)
const by = z.object({ step: z.enum(["intro", "reply", "roll", "npc", "round"]), character: id.optional() })
// The stored shape, for stores that check what they keep.
export const storyBeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("narration"), by, text: z.string(), place: id.optional() }),
  z.object({
    kind: z.literal("action"),
    by,
    text: z.string(),
    actor: id,
    target: id.optional(),
    move: z.object({ to: id.optional(), from: id.optional(), pace: z.enum(PACES).optional() }).optional(),
    effect: z.object({ kind: z.enum(EFFECT_KINDS), element: z.enum(ELEMENTS).optional() }).optional(),
    object: z.object({ kind: z.enum(OBJECT_KINDS), to: id.optional() }).optional(),
  }),
  z.object({ kind: z.literal("line"), by, text: z.string(), speaker: id, to: id.optional(), delivery: z.string().max(60).optional() }),
  z.object({
    kind: z.literal("roll"),
    by,
    character: id,
    name: z.string(),
    check: z.string(),
    natural: z.number(),
    modifier: z.number().optional(),
    total: z.number(),
    dc: z.number(),
    success: z.boolean(),
    image: z.string().optional(),
  }),
  z.object({ kind: z.literal("reply"), by, character: id, text: z.string() }),
])
export const storySchema = z.array(storyBeatSchema)

// What the GM writes: one flat shape for every kind, which every model fills reliably. A value off a menu is dropped
// rather than failing the turn, and cleanStory checks the ids against the scene.
const menu = <T extends readonly [string, ...string[]]>(values: T, description: string) => z.enum(values).optional().catch(undefined).describe(description)
export const storyOutputSchema = z
  .array(
    z.object({
      kind: z.enum(["narration", "action", "line"]).describe("narration: the scene or an outcome in the narrator's voice. action: one character doing something. line: words one character says aloud"),
      text: z.string().describe("narration and action: one or two sentences of prose with no spoken words. line: only the words spoken, with no quote marks"),
      who: z.string().optional().describe("action: the id of the character acting. line: the id of the character speaking"),
      to: z.string().optional().describe("action: the id of the character it is aimed at. line: the id of the character spoken to"),
      place: z.string().optional().describe("narration: the id of the place it shows. action: the id of the place the actor goes to, or of a character they close in on"),
      from: z.string().optional().describe("action: the id of the place the actor arrives from, only when they come into the scene"),
      pace: menu(PACES, "action with a place: how the actor goes"),
      effect: menu(EFFECT_KINDS, "action: the visible effect of an attack or spell, if any"),
      element: menu(ELEMENTS, "action with an effect: its element, if magical"),
      object: menu(OBJECT_KINDS, "action: an object the actor shows or hands over, if any"),
      delivery: z.string().optional().describe("line: how it is said, in one or two words, such as quietly or with a growl"),
    })
  )
  .describe("the beats, in the order they happen")
export type StoryOutput = z.infer<typeof storyOutputSchema>

export const isSpoken = (beat: StoryBeat): beat is LineBeat => beat.kind === "line"
