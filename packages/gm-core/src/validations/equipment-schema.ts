import { z } from "zod"

export const equipmentSchema = z.object({
  equipment: z.array(z.string().min(1, "Equipment item cannot be empty")).min(1, "At least one equipment item required"),
})

export type EquipmentResult = z.infer<typeof equipmentSchema>
