import { z } from "zod"

export const personalityMotivationBackstorySchema = z.object({
  personality: z.string().min(1, "Personality is required"),
  motivation: z.string().min(1, "Motivation is required"),
  backstory: z.string(), // backstory can be empty
})

export type PersonalityMotivationBackstory = z.infer<typeof personalityMotivationBackstorySchema> 