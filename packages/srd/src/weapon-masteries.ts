import raw from "../data/weapon-masteries.json"
import { byId } from "./lookup"
import type { WeaponMastery } from "./schema/equipment"

export const weaponMasteries = raw as unknown as readonly WeaponMastery[]
export const weaponMasteryById = byId(weaponMasteries)
