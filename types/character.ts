import { z } from "zod"

// Equipment item schema and type
export const equipmentItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

export type EquipmentItem = z.infer<typeof equipmentItemSchema>

export const spellSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  isUsed: z.boolean().optional(),
})

export const specialAbilitySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  isUsed: z.boolean().optional(),
})

export type Spell = z.infer<typeof spellSchema>

export const attributesSchema = z.object({
  strength: z.number().min(1).max(20),
  dexterity: z.number().min(1).max(20),
  constitution: z.number().min(1).max(20),
  intelligence: z.number().min(1).max(20),
  wisdom: z.number().min(1).max(20),
  charisma: z.number().min(1).max(20),
})

export type Attributes = z.infer<typeof attributesSchema>

export const baseCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  archetype: z.string(),
  race: z.string(),
  gender: z.string().optional(),
  appearance: z.string(),
  personality: z.string().optional(),
  background: z.string().optional(),
  motivation: z.string().optional(),
  behavior: z.string().optional(),
  healthPercent: z.number().min(0).max(100), // 0-100, percentage
  equipment: z.array(equipmentItemSchema).optional(),
  skills: z.array(z.string()).optional(),
  spells: z.array(spellSchema).optional(),
  specialAbilities: z.array(z.string()).optional(),
  status: z.string().optional(),
})

export type BaseCharacter = z.infer<typeof baseCharacterSchema>

// Player Character (PC) schema and type
export const pcSchema = baseCharacterSchema.extend({
  type: z.literal("pc"),
  userId: z.string(), // Clerk user id
  attributes: attributesSchema,
})

export type PC = z.infer<typeof pcSchema>

// Non-Player Character (NPC) schema and type
export const npcSchema = baseCharacterSchema.extend({
  type: z.literal("npc"),
  attributes: attributesSchema.partial().optional(),
})

export type NPC = z.infer<typeof npcSchema>

// Pre-rolled Player Character template schema and type (no userId)
export const pcTemplateSchema = baseCharacterSchema.extend({
  type: z.literal("pc"),
  attributes: attributesSchema,
})

export type PCTemplate = z.infer<typeof pcTemplateSchema>

// Union schema and type for all characters
export const characterSchema = z.union([pcSchema, npcSchema])
export type Character = z.infer<typeof characterSchema>

// Generation schemas (without id and image for AI generation)
export const baseCharacterGenerationSchema = baseCharacterSchema.omit({ id: true, image: true })

export const npcGenerationSchema = baseCharacterGenerationSchema.extend({
  type: z.literal("npc"),
  attributes: attributesSchema.partial().optional(),
})

export const pcTemplateGenerationSchema = baseCharacterGenerationSchema.extend({
  type: z.literal("pc"),
  attributes: attributesSchema,
})

export const characterGenerationSchema = z.union([npcGenerationSchema, pcTemplateGenerationSchema]) 