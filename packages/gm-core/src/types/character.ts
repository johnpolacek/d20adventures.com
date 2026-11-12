import { z } from "zod"
import { conditionEntrySchema } from "../sheet/condition-entry"
import { sheetSchema } from "../sheet/sheet"
import { turnEffectSchema } from "../sheet/turn-effect"

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

export const effectSchema = z.object({
  name: z.string(), // e.g. "Charmed"
  description: z.string(), // e.g. "Regards the caster as a friendly acquaintance"
  duration: z.number(), // number of turns remaining
})

export type Effect = z.infer<typeof effectSchema>

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
  // What the card says while the GM plays this character's turn, such as "Garlan strokes his beard, weighing his duty…".
  thinking: z.string().optional(),
  // Current hit points, 0 to the maximum from the sheet or stat block. A character enters play at its maximum, and
  // only the engine changes them, through withHitPoints in ../sheet/hit-points. Authored content has none.
  hitPoints: z.number().int().min(0).optional(),
  // 0-100, a copy of the hit points that withHitPoints writes, for the screens and prompts that read it.
  healthPercent: z.number().min(0).max(100).optional(),
  // A hero at 0 hit points who is not dead: their Death Saving Throws so far, and whether they are Stable. Only the
  // engine writes them, through ../sheet/death.
  deathSaves: z.object({ successes: z.number().int().min(0).max(3), failures: z.number().int().min(0).max(3), stable: z.literal(true).optional() }).optional(),
  // The SRD conditions the character bears. Only the engine writes them, through ../sheet/conditions.
  conditions: z.array(conditionEntrySchema).optional(),
  // What an action of a turn has left on the character: Dodging, or an ally's Help. Only the engine writes it,
  // through ../sheet/actions.
  turnEffects: z.array(turnEffectSchema).optional(),
  // Dead, or gone from the encounter for good. Neither is a condition, and only the engine sets them.
  dead: z.literal(true).optional(),
  fled: z.literal(true).optional(),
  equipment: z.array(equipmentItemSchema).optional(),
  skills: z.array(z.string()).optional(),
  spells: z.array(spellSchema).optional(),
  specialAbilities: z.array(z.string()).optional(),
  effects: z.array(effectSchema).optional(),
  // The rules sheet: class, species, background, scores. Hit points and every bonus are derived from it (see ../sheet).
  sheet: sheetSchema.optional(),
})

export type BaseCharacter = z.infer<typeof baseCharacterSchema>

// Player Character (PC) schema and type
export const pcSchema = baseCharacterSchema.extend({
  type: z.literal("pc"),
  userId: z.string(), // Clerk user id
  // "ai" marks an AI-controlled companion; userId is the adventure owner's.
  controlledBy: z.literal("ai").optional(),
  attributes: attributesSchema,
})

export type PC = z.infer<typeof pcSchema>

// Non-Player Character (NPC) schema and type
export const npcSchema = baseCharacterSchema.extend({
  type: z.literal("npc"),
  attributes: attributesSchema.partial().optional(),
  // The SRD stat block the NPC uses for hit points and Armor Class: "guard", "owlbear". None means a Commoner.
  statBlock: z.string().optional(),
})

export type NPC = z.infer<typeof npcSchema>

// Pre-rolled Player Character template schema and type (no userId)
export const pcTemplateSchema = baseCharacterSchema.extend({
  type: z.literal("pc"),
  controlledBy: z.literal("ai").optional(),
  attributes: attributesSchema,
})

export type PCTemplate = z.infer<typeof pcTemplateSchema>

// Union schema and type for all characters
export const characterSchema = z.union([pcSchema, npcSchema])
export type Character = z.infer<typeof characterSchema>

// Generation schemas (without id and image for AI generation, and without what only the engine writes)
export const baseCharacterGenerationSchema = baseCharacterSchema.omit({
  id: true,
  image: true,
  sheet: true,
  hitPoints: true,
  deathSaves: true,
  conditions: true,
  turnEffects: true,
  dead: true,
  fled: true,
})

export const npcGenerationSchema = baseCharacterGenerationSchema.extend({
  type: z.literal("npc"),
  attributes: attributesSchema.partial().optional(),
})

export const pcTemplateGenerationSchema = baseCharacterGenerationSchema.extend({
  type: z.literal("pc"),
  attributes: attributesSchema,
})

export const characterGenerationSchema = z.union([npcGenerationSchema, pcTemplateGenerationSchema])
