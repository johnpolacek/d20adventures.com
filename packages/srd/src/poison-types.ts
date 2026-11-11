import raw from "../data/poison-types.json"
import { byId } from "./lookup"
import type { PoisonType } from "./schema/equipment"

export const poisonTypes = raw as unknown as readonly PoisonType[]
export const poisonTypeById = byId(poisonTypes)
