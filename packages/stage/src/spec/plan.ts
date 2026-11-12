import { z } from "zod"

// An encounter's floor plan: its set seen from above, in the set's own units (metres, x and z as authored), and where
// its cast starts. Generated from the 3D set and staging by `scripts/stage-plans.ts` and committed, so the rules engine
// and the website read it with no three.js, no DOM and no GPU. This file imports nothing but zod.

export const pointSchema = z.object({ x: z.number(), z: z.number() }).strict()
export type Point = z.infer<typeof pointSchema>

// Something solid on the floor, as the set build's footprints: a rotated rectangle (`hw` and `hd` are half its width and
// depth, `ry` its yaw in radians) or a circle. `top`, when given, is the world height of something low that can be seen
// over: a camera reads it, and a rectangle without one, and every circle, blocks its view. `height` is how high the thing
// stands above the ground it is on, for judging cover; none is unknown.
export const solidSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"), x: z.number(), z: z.number(), hw: z.number(), hd: z.number(), ry: z.number(), top: z.number().optional(), height: z.number().optional() }).strict(),
  z.object({ kind: z.literal("circle"), x: z.number(), z: z.number(), r: z.number(), height: z.number().optional() }).strict(),
])
export type Solid = z.infer<typeof solidSchema>

export const placeSchema = z.object({ id: z.string(), label: z.string(), x: z.number(), z: z.number() }).strict()
export type Place = z.infer<typeof placeSchema>

// A set: what is solid, its doorways as a point just inside and one just outside, and its labelled marks.
export const setPlanSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    solids: z.array(solidSchema),
    doors: z.array(z.tuple([pointSchema, pointSchema])),
    places: z.array(placeSchema),
  })
  .strict()
export type SetPlan = z.infer<typeof setPlanSchema>

// `raised` is a cast member's height above the ground when it starts standing on something (a roof, a balcony).
export const planCastSchema = z.object({ id: z.string(), name: z.string(), x: z.number(), z: z.number(), raised: z.number().optional() }).strict()
export type PlanCast = z.infer<typeof planCastSchema>

// A party slot: the cast member whose place a hero takes, and where it stands. A premade hero keeps its own slot.
export const partySlotSchema = z.object({ id: z.string(), x: z.number(), z: z.number() }).strict()
export type PartySlot = z.infer<typeof partySlotSchema>

// An encounter on its set: where each of the cast starts, the party's slots in order, and spare spots for heroes beyond
// them.
export const encounterPlanSchema = z
  .object({
    encounterId: z.string(),
    set: z.string(),
    location: z.string(),
    where: z.string(),
    cast: z.array(planCastSchema),
    party: z.array(partySlotSchema),
    spare: z.array(pointSchema),
  })
  .strict()
export type EncounterPlan = z.infer<typeof encounterPlanSchema>

// The two joined: what a reader is handed.
export const floorPlanSchema = encounterPlanSchema.extend({ title: z.string(), solids: setPlanSchema.shape.solids, doors: setPlanSchema.shape.doors, places: setPlanSchema.shape.places }).strict()
export type FloorPlan = z.infer<typeof floorPlanSchema>

export const parseSetPlan = (input: unknown): SetPlan => setPlanSchema.parse(input)
export const parseEncounterPlan = (input: unknown): EncounterPlan => encounterPlanSchema.parse(input)
export const parseFloorPlan = (input: unknown): FloorPlan => floorPlanSchema.parse(input)

// An encounter and its set as one plan. The set must be the one the encounter names.
export function joinPlan(encounter: EncounterPlan, set: SetPlan): FloorPlan {
  if (encounter.set !== set.id) throw new Error(`floor plan ${encounter.encounterId} is on set ${encounter.set}, not ${set.id}`)
  return parseFloorPlan({ ...encounter, title: set.title, solids: set.solids, doors: set.doors, places: set.places })
}
