import raw from "../data/equipment.json"
import { byId } from "./lookup"
import type { Equipment } from "./schema/equipment"

export const equipment = raw as unknown as readonly Equipment[]
export const equipmentById = byId(equipment)
