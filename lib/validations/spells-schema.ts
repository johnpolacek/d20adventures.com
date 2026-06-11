import { z } from "zod"
import { spellSchema } from "@/types/character"

export const spellsSchema = z.object({
  spells: z.array(spellSchema).min(1, "At least one spell required"),
})

export type SpellsResult = z.infer<typeof spellsSchema>
