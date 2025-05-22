import { z } from "zod";

export const rollRequirementSchema = z.union([
  z.object({
    rollType: z.string().describe("The type of roll required, e.g. 'Stealth Check'"),
    difficulty: z.number().describe("The difficulty class (DC) for the roll"),
  }),
  z.null()
]);

export type RollRequirement = z.infer<typeof rollRequirementSchema>; 