import { z } from "zod"

export const specialAbilitiesSchema = z.object({
  specialAbilities: z.array(z.string().min(1, "Special ability cannot be empty")).min(1, "At least one special ability required"),
})

export type SpecialAbilitiesResult = z.infer<typeof specialAbilitiesSchema>
