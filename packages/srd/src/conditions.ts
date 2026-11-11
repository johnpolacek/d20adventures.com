import raw from "../data/conditions.json"
import { byId } from "./lookup"
import type { Condition } from "./schema/reference"

export const conditions = raw as unknown as readonly Condition[]
export const conditionById = byId(conditions)
