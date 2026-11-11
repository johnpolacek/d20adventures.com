import raw from "../data/damage-types.json"
import { byId } from "./lookup"
import type { DamageType } from "./schema/reference"

export const damageTypes = raw as unknown as readonly DamageType[]
export const damageTypeById = byId(damageTypes)
