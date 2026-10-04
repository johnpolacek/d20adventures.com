import { z } from "zod"

export const appearanceBackgroundSchema = z.object({
  appearance: z.string().min(1, "Appearance is required"),
  background: z.string(), // background can be empty
})

export type AppearanceBackground = z.infer<typeof appearanceBackgroundSchema>
