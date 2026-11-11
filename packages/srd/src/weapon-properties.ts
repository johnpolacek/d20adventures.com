import raw from "../data/weapon-properties.json"
import { byId } from "./lookup"
import type { WeaponProperty } from "./schema/equipment"

export const weaponProperties = raw as unknown as readonly WeaponProperty[]
export const weaponPropertyById = byId(weaponProperties)
