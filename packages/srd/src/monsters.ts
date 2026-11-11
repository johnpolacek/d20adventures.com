import raw from "../data/monsters.json"
import { byId } from "./lookup"
import type { Monster } from "./schema/monsters"

export const monsters = raw as unknown as readonly Monster[]
export const monsterById = byId(monsters)
