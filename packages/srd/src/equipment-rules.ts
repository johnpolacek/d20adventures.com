import raw from "../data/equipment-rules.json"
import { byId } from "./lookup"
import type { EquipmentRule } from "./schema/equipment"

export const equipmentRules = raw as unknown as readonly EquipmentRule[]
export const equipmentRuleById = byId(equipmentRules)
