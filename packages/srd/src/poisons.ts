import raw from "../data/poisons.json"
import { byId } from "./lookup"
import type { Poison } from "./schema/equipment"

export const poisons = raw as unknown as readonly Poison[]
export const poisonById = byId(poisons)
