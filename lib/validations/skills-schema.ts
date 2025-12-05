import { z } from "zod"

export const skillsSchema = z.object({
  skills: z.array(z.string().min(1, "Skill cannot be empty")).min(1, "At least one skill required"),
})

export type SkillsResult = z.infer<typeof skillsSchema>
