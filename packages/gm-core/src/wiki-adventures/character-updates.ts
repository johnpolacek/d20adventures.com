import { z } from "zod"

const name = z.string().trim().min(1).max(200)
const description = z.string().max(2000)

export const inventoryChangeSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add"), name, description: description.optional() }),
  z.strictObject({ op: z.literal("remove"), name }),
])
export const effectChangeSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("set"), name, description, duration: z.number().int().min(1).max(1000) }),
  z.strictObject({ op: z.literal("remove"), name }),
])
export const spellUseChangeSchema = z.strictObject({ name, isUsed: z.boolean() })

/** Explicit operations for hosts that apply character patches, rather than prose notes. */
export const characterUpdateSchema = z.strictObject({
  characterId: name,
  healthPercent: z.number().min(0).max(100).optional(),
  status: z.string().max(500).optional().describe("New status. An empty string clears it."),
  inventoryChanges: z.array(inventoryChangeSchema).max(100).optional(),
  effectChanges: z.array(effectChangeSchema).max(100).optional(),
  spellUseChanges: z.array(spellUseChangeSchema).max(100).optional(),
})
export type CharacterUpdate = z.infer<typeof characterUpdateSchema>
